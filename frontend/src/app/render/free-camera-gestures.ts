import type { PerspectiveCamera } from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import type { CameraPreset } from '../core/capture/capture-params';
import { tankCenter, type CameraPose, type TankDimensions, type Vec3 } from './camera-presets';
import {
  clampFreePitch,
  constrainFreePosition,
  freeCameraBounds,
  freeCameraFromPose,
  freeCameraPose,
  mutableFreeCameraState,
  stepFreeCameraInPlace,
  turnFreeCamera,
  type FreeCameraBounds,
  type FreeCameraInput,
  type FreeCameraState,
  type MutableFreeCameraState,
} from './free-camera';
import {
  beginLook,
  beginPinch,
  combinedForward,
  decayThrust,
  moveLook,
  movePinch,
  pinchThrust,
  type LookDelta,
  type LookGesture,
  type PinchGesture,
} from './free-camera-touch';

/** Ce dont la caméra libre a besoin de la vue (`AquariumView`, #698). */
export interface FreeCameraHost {
  readonly camera: PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly canvas: HTMLCanvasElement;
  readonly dimensions: TankDimensions;
  /** Contrôles à la souris demandés (faux en mode capture, fond d'écran). */
  readonly interactive: boolean;
  /** Glissement du décor ou de la pièce en cours (`DragController`). */
  dragging(): boolean;
  /** Passage de raclette en cours (`DragController`). */
  stroking(): boolean;
  /** Oublie l'appui en attente de clic (pincement à deux doigts). */
  cancelClick(): void;
  /** Pièce dessinée autour du bac. */
  roomBuilt(): boolean;
  /** Hauteur du meuble support de la pièce courante, bornée (`clampRoom`). */
  cabinetHeight(): number;
}

/** Pose orbitale et préréglage gardés en entrant en caméra libre, rendus en sortant. */
export interface SavedOrbit {
  readonly pose: CameraPose;
  readonly preset: CameraPreset | null;
}

/** Caméra libre en cours (#343) : état, limites et pose orbitale à rendre en sortant. */
interface FreeMode {
  bounds: FreeCameraBounds;
  /** État propre à la vue (tableaux non partagés), modifié en place à chaque image (#352). */
  readonly state: MutableFreeCameraState;
  /** Reste de temps réel, moins d'un pas fixe, reporté à l'image suivante. */
  carry: number;
  readonly saved: SavedOrbit;
  /** Distance du point visé (cible des contrôles, échelle des granulés). */
  readonly lookDistance: number;
}

/**
 * Caméra libre dans la pièce (#343, ADR 0084) et ses gestes au pointeur (#344) : glisser
 * d'orientation, pincement à deux doigts pour avancer ou reculer. Les écouteurs du canvas
 * sont posés à la construction, après ceux de `DragController` (ordre d'origine).
 */
export class FreeCameraGestures {
  /** Caméra libre, `null` en orbite. */
  private free: FreeMode | null = null;
  /** Glisser d'orientation de la caméra libre en cours (#343, seuil de geste #344). */
  private look: LookGesture | null = null;
  /** Déplacement du glisser d'orientation, tampon réutilisé (#344). */
  private readonly lookDelta: LookDelta = { dx: 0, dy: 0 };
  /** Premier doigt posé en caméra libre (#344) : point de départ d'un pincement. */
  private firstTouch: { readonly id: number; x: number; y: number } | null = null;
  /** Pincement à deux doigts en cours en caméra libre (#344). */
  private pinch: PinchGesture | null = null;
  /** Poussée du pincement dans [−1, 1], amortie à chaque image (#344). */
  private touchThrust = 0;
  /** Consigne passée au modèle de la caméra libre, tampon réutilisé (#344). */
  private readonly freeInput = { forward: 0, strafe: 0, vertical: 0 };
  /** Abonnés aux mouvements de la caméra libre à la souris (`onLook`, #343). */
  private readonly lookListeners = new Set<() => void>();

  constructor(private readonly host: FreeCameraHost) {
    // Orientation de la caméra libre (#343) : contrôles orbitaux coupés dans ce mode.
    host.canvas.addEventListener('pointerdown', this.onLookPointerDown);
    host.canvas.addEventListener('pointermove', this.onLookPointerMove);
    host.canvas.addEventListener('pointerup', this.onLookPointerEnd);
    host.canvas.addEventListener('pointercancel', this.onLookPointerEnd);
  }

  /** Vrai en caméra libre. */
  get active(): boolean {
    return this.free !== null;
  }

  /** Pose orbitale gardée à l'entrée, `null` en orbite. */
  get saved(): SavedOrbit | null {
    return this.free?.saved ?? null;
  }

  /** État de la caméra libre, `null` en orbite (objet vivant, modifié en place, #352). */
  get state(): FreeCameraState | null {
    return this.free?.state ?? null;
  }

  /** Poussée courante du pincement, dans [−1, 1]. */
  get thrust(): number {
    return this.touchThrust;
  }

  /**
   * Passe en caméra libre depuis la pose orbitale `saved` : même position (ramenée dans la
   * pièce, hors du bac) et même visée, contrôles orbitaux coupés.
   */
  enter(saved: SavedOrbit): void {
    const bounds = this.bounds();
    const { position, target } = saved.pose;
    this.free = {
      bounds,
      saved,
      state: mutableFreeCameraState(freeCameraFromPose(saved.pose, bounds)),
      carry: 0,
      lookDistance: Math.max(
        0.5,
        Math.hypot(position[0] - target[0], position[1] - target[1], position[2] - target[2]),
      ),
    };
    this.host.controls.enabled = false;
    this.applyState(this.free.state);
  }

  /** Quitte la caméra libre sans toucher à la pose : contrôles orbitaux rendus. */
  leave(): void {
    if (this.free === null) {
      return;
    }
    this.free = null;
    this.resetGestures();
    this.host.controls.enabled = this.host.interactive && !this.host.dragging();
  }

  /**
   * Avance la caméra libre de `dtSeconds` (temps réel) selon la consigne du clavier
   * (`stepFreeCamera`, pas fixes). Renvoie `true` si la caméra a bougé.
   */
  step(input: FreeCameraInput, dtSeconds: number): boolean {
    const free = this.free;
    if (!free) {
      return false;
    }
    // Poussée du pincement (#344) ajoutée à l'avance du clavier, puis amortie.
    const thrust = this.touchThrust;
    this.touchThrust = decayThrust(thrust, dtSeconds);
    const command = this.freeInput;
    command.forward = combinedForward(input.forward, thrust);
    command.strafe = input.strafe;
    command.vertical = input.vertical;
    // En place, sans allocation par image (#352) : l'état de la vue est le sien seul.
    const p = free.state.position;
    const x = p[0];
    const y = p[1];
    const z = p[2];
    free.carry = stepFreeCameraInPlace(free.state, command, dtSeconds, free.bounds, free.carry);
    if (p[0] === x && p[1] === y && p[2] === z) {
      return false;
    }
    this.applyState(free.state);
    return true;
  }

  /**
   * Pose libre instantanée (`libre=`, #343) : caméra en `position` (ramenée dans la pièce,
   * hors du bac), cap `yaw` et inclinaison `pitch`, sans passer en caméra libre.
   */
  applyPose(position: Vec3, yaw: number, pitch: number): void {
    const state: FreeCameraState = {
      position: constrainFreePosition(this.bounds(), position),
      yaw: Number.isFinite(yaw) ? yaw : 0,
      pitch: clampFreePitch(pitch),
      velocity: [0, 0, 0],
    };
    const center = tankCenter(this.host.dimensions);
    const p = state.position;
    const pose = freeCameraPose(
      state,
      Math.max(0.5, Math.hypot(p[0] - center[0], p[1] - center[1], p[2] - center[2])),
    );
    this.host.camera.position.set(pose.position[0], pose.position[1], pose.position[2]);
    this.host.controls.target.set(pose.target[0], pose.target[1], pose.target[2]);
    this.host.camera.lookAt(pose.target[0], pose.target[1], pose.target[2]);
  }

  /** Meuble changé : limites recalculées et caméra replacée dedans. */
  refreshBounds(): void {
    const free = this.free;
    if (free) {
      free.bounds = this.bounds();
      this.applyState(free.state);
    }
  }

  /** Abonnement à l'orientation de la caméra libre à la souris. Renvoie le désabonnement. */
  onLook(listener: () => void): () => void {
    this.lookListeners.add(listener);
    return () => {
      this.lookListeners.delete(listener);
    };
  }

  /** Retire les écouteurs du canvas ; la caméra libre est abandonnée sans toucher à la pose. */
  dispose(): void {
    const canvas = this.host.canvas;
    canvas.removeEventListener('pointerdown', this.onLookPointerDown);
    canvas.removeEventListener('pointermove', this.onLookPointerMove);
    canvas.removeEventListener('pointerup', this.onLookPointerEnd);
    canvas.removeEventListener('pointercancel', this.onLookPointerEnd);
    this.free = null;
    this.resetGestures();
  }

  /** Limites de la caméra libre pour le bac et le meuble courants. */
  private bounds(): FreeCameraBounds {
    return freeCameraBounds(this.host.dimensions, this.host.cabinetHeight());
  }

  /**
   * Place la caméra sur l'état libre, sans `controls.update()` : il ramènerait la distance et
   * la cible dans les bornes de l'orbite. La cible des contrôles suit le point visé.
   */
  private applyState(state: FreeCameraState): void {
    const free = this.free;
    if (!free) {
      return;
    }
    // Même calcul que `freeCameraPose`, sans allocation (chemin par image, #352).
    const p = state.position;
    const k = free.lookDistance;
    const cos = Math.cos(state.pitch);
    const tx = p[0] - Math.sin(state.yaw) * cos * k;
    const ty = p[1] + Math.sin(state.pitch) * k;
    const tz = p[2] - Math.cos(state.yaw) * cos * k;
    this.host.camera.position.set(p[0], p[1], p[2]);
    this.host.controls.target.set(tx, ty, tz);
    this.host.camera.lookAt(tx, ty, tz);
  }

  /** Abandonne les gestes de la caméra libre en cours (orientation, pincement, poussée). */
  private resetGestures(): void {
    this.look = null;
    this.firstTouch = null;
    this.pinch = null;
    this.touchThrust = 0;
  }

  /**
   * Appui en caméra libre : un pointeur principal commence un glisser d'orientation (seuil
   * de geste, #344) ; un second doigt transforme le geste en pincement (avancer, reculer).
   */
  private readonly onLookPointerDown = (event: PointerEvent) => {
    if (!this.free || this.host.dragging() || this.host.stroking()) {
      return;
    }
    if (event.pointerType === 'touch' && this.touchDown(event)) {
      return;
    }
    if (this.look || this.pinch || event.button !== 0 || !event.isPrimary) {
      return;
    }
    this.look = beginLook(event.pointerId, event.clientX, event.clientY, event.pointerType);
  };

  /** Doigt posé : premier doigt retenu, ou second qui commence un pincement (`true`). */
  private touchDown(event: PointerEvent): boolean {
    const first = this.firstTouch;
    if (first === null) {
      this.firstTouch = { id: event.pointerId, x: event.clientX, y: event.clientY };
      return false;
    }
    if (this.pinch !== null || first.id === event.pointerId) {
      return false;
    }
    this.pinch = beginPinch(
      first.id,
      first.x,
      first.y,
      event.pointerId,
      event.clientX,
      event.clientY,
    );
    // Deux doigts : plus d'orientation, ni de clic du premier doigt.
    this.look = null;
    this.host.cancelClick();
    return true;
  }

  private readonly onLookPointerMove = (event: PointerEvent) => {
    const free = this.free;
    if (!free || this.host.dragging()) {
      return;
    }
    const first = this.firstTouch;
    if (first !== null && first.id === event.pointerId) {
      first.x = event.clientX;
      first.y = event.clientY;
    }
    const pinch = this.pinch;
    if (pinch !== null) {
      const delta = movePinch(pinch, event.pointerId, event.clientX, event.clientY);
      if (delta !== 0) {
        this.touchThrust = pinchThrust(this.touchThrust, delta);
      }
      return;
    }
    const look = this.look;
    if (!look || look.id !== event.pointerId) {
      return;
    }
    const delta = this.lookDelta;
    if (moveLook(look, event.clientX, event.clientY, delta)) {
      this.turn(free.state, delta);
    }
  };

  /** Tourne la caméra libre du déplacement `delta` du glisser, abonnés prévenus. */
  private turn(state: MutableFreeCameraState, delta: LookDelta): void {
    const turned = turnFreeCamera(state, delta.dx, delta.dy);
    if (turned !== state) {
      // Cap et inclinaison recopiés : l'état de la vue garde ses propres tableaux (#352).
      state.yaw = turned.yaw;
      state.pitch = turned.pitch;
      this.applyState(state);
      this.lookListeners.forEach((listener) => listener());
    }
  }

  private readonly onLookPointerEnd = (event: PointerEvent) => {
    const id = event.pointerId;
    if (this.look?.id === id) {
      this.look = null;
    }
    if (this.firstTouch?.id === id) {
      this.firstTouch = null;
    }
    if (this.pinch !== null && (this.pinch.a === id || this.pinch.b === id)) {
      // La poussée garde son élan et s'éteint d'elle-même (amortissement).
      this.pinch = null;
    }
  };
}
