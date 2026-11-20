import { MOUSE, TOUCH, type PerspectiveCamera } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import type { CameraPreset } from '../core/capture/capture-params';
import { ORBIT_MOUSE_BUTTONS, ORBIT_TOUCHES, type OrbitAction } from '../core/commands/commands';
import { frustumMatrix, offAxisFrustum } from '../core/immersive/off-axis';
import {
  CAMERA_FOV_DEG,
  cameraPresetPose,
  interpolatePose,
  orbitDistanceLimits,
  orbitPositionInto,
  panTargetRadius,
  tankCenter,
  type CameraPose,
  type TankDimensions,
  type Vec3,
} from './camera-presets';
import { FreeCameraGestures, type FreeCameraHost } from './free-camera-gestures';
import type { FreeCameraInput, FreeCameraState } from './free-camera';

/** Bouton de la souris d'`OrbitControls` pour chaque action déclarée (`core/commands`). */
export const ORBIT_MOUSE_ACTIONS: Readonly<Record<OrbitAction, MOUSE>> = {
  rotate: MOUSE.ROTATE,
  dolly: MOUSE.DOLLY,
  pan: MOUSE.PAN,
};

/** Geste tactile d'`OrbitControls` pour chaque action déclarée (`core/commands`). */
export const ORBIT_TOUCH_ACTIONS: Readonly<
  Record<(typeof ORBIT_TOUCHES)['one'] | (typeof ORBIT_TOUCHES)['two'], TOUCH>
> = {
  rotate: TOUCH.ROTATE,
  pan: TOUCH.PAN,
  'dolly-pan': TOUCH.DOLLY_PAN,
  'dolly-rotate': TOUCH.DOLLY_ROTATE,
};

/**
 * Caméra du mode immersif (#345, ADR 0086), en mètres de la scène : œil devant la vitre avant
 * du bac, décalé de (`eyeX`, `eyeY`) par rapport à son centre, à `eyeDistance` de la vitre.
 */
export interface ImmersiveCamera {
  readonly eyeX: number;
  readonly eyeY: number;
  readonly eyeDistance: number;
}

/**
 * Contrôles orbitaux de la vue sur `canvas` (#74) : bornes de distance et de déplacement du
 * bac, gestes déclarés dans `core/commands`, sans amortissement ; actifs si `interactive`.
 * À créer avant tout autre écouteur du canvas (`docs/PIEGES.md`).
 */
export function createOrbitControls(
  camera: PerspectiveCamera,
  canvas: HTMLCanvasElement,
  dimensions: TankDimensions,
  interactive: boolean,
): OrbitControls {
  const controls = new OrbitControls(camera, canvas);
  controls.enabled = interactive;
  controls.enableDamping = false;
  const limits = orbitDistanceLimits(dimensions);
  controls.minDistance = limits.min;
  controls.maxDistance = limits.max;
  // Déplacement au clic droit borné (bug #10) : la cible reste dans une sphère autour du
  // centre du bac, qui reste ainsi dans le champ.
  controls.cursor.set(...tankCenter(dimensions));
  controls.maxTargetRadius = panTargetRadius(dimensions);
  // Gestes déclarés dans `core/commands` (source unique de l'aide-mémoire, #74) : clic
  // gauche = rotation, molette = zoom, clic droit = déplacement ; un doigt = rotation, deux
  // doigts = zoom et déplacement (ce sont aussi les valeurs par défaut d'`OrbitControls`).
  controls.mouseButtons = {
    LEFT: ORBIT_MOUSE_ACTIONS[ORBIT_MOUSE_BUTTONS.left],
    MIDDLE: ORBIT_MOUSE_ACTIONS[ORBIT_MOUSE_BUTTONS.middle],
    RIGHT: ORBIT_MOUSE_ACTIONS[ORBIT_MOUSE_BUTTONS.right],
  };
  controls.touches = {
    ONE: ORBIT_TOUCH_ACTIONS[ORBIT_TOUCHES.one],
    TWO: ORBIT_TOUCH_ACTIONS[ORBIT_TOUCHES.two],
  };
  return controls;
}

/** Ce dont la caméra a besoin de la vue (`AquariumView`, #698). */
export interface CameraHost extends FreeCameraHost {
  /** Taille non nulle : le rapport d'aspect de la caméra est à jour. */
  hasSize(): boolean;
  /** Recale le rapport d'aspect de la caméra (sortie du mode immersif). */
  updateAspect(): void;
}

/** Pose de base en cache de la caméra du fond d'écran et ce dont elle dépend (#332). */
interface OrbitBase {
  readonly preset: CameraPreset;
  readonly aspect: number;
  readonly dimensions: TankDimensions;
  readonly pose: CameraPose;
}

interface CameraTransition {
  readonly preset: CameraPreset;
  readonly from: CameraPose;
  elapsed: number;
  readonly duration: number;
}

/**
 * Caméra de la vue (#698) : préréglages, transitions, orbite du fond d'écran, caméra libre
 * (déléguée à `FreeCameraGestures`) et mode immersif. Les méthodes publiques sont celles de
 * `AquariumView`, qui les délègue ; leur documentation y reste.
 */
export class CameraController {
  /** Préréglage courant, recadré à chaque redimensionnement tant que l'utilisateur n'a pas bougé. */
  private preset: CameraPreset | null;
  /** Transition en cours vers un préréglage (`null` sinon), avancée par `stepCameraTransition`. */
  private transition: CameraTransition | null = null;
  /**
   * Pose de base de la caméra du fond d'écran (`applyOrbit`, #332), recalculée seulement si
   * le préréglage, le rapport d'aspect ou le bac changent ; `null` avant le premier appel.
   */
  private orbitBase: OrbitBase | null = null;
  /** Position tournée de la caméra du fond d'écran, réécrite à chaque image (#332). */
  private readonly orbitPosition: [number, number, number] = [0, 0, 0];
  /** Caméra libre dans la pièce et ses gestes (#343, #344). */
  private readonly free: FreeCameraGestures;
  /** Vrai en mode immersif (orbite et caméra libre coupées). */
  private immersiveOn = false;
  /**
   * Caméra du mode immersif, préallouée (#357) : `setImmersiveCamera` y copie les valeurs de
   * l'appelant, qui peut réutiliser son objet d'une image à l'autre (#355). Lue seulement
   * quand `immersiveOn` est vrai.
   */
  private readonly immersive = { eyeX: 0, eyeY: 0, eyeDistance: 1 };
  /** Préréglage suivi avant le mode immersif, rendu en sortant. */
  private presetBeforeImmersive: CameraPreset = 'front';
  private disposed = false;
  /** Une interaction à la souris arrête de suivre le préréglage et annule la transition. */
  private readonly stopFollowingPreset = () => {
    this.preset = null;
    this.transition = null;
  };

  constructor(
    private readonly host: CameraHost,
    preset: CameraPreset,
  ) {
    host.controls.addEventListener('start', this.stopFollowingPreset);
    this.free = new FreeCameraGestures(host);
    this.preset = preset;
    this.applyPreset(preset);
  }

  applyPreset(preset: CameraPreset): void {
    this.free.leave();
    this.transition = null;
    this.preset = preset;
    this.setPose(this.presetPose(preset));
  }

  /** Recadre la caméra sur le préréglage suivi, s'il y en a un (redimensionnement). */
  reframe(): void {
    if (this.preset !== null) {
      this.applyPreset(this.preset);
    }
  }

  animateToPreset(preset: CameraPreset, durationSeconds: number): void {
    if (this.disposed) {
      return;
    }
    if (!(durationSeconds > 0) || !this.host.interactive) {
      this.applyPreset(preset);
      return;
    }
    // Depuis la caméra libre (#343) : la transition part de la pose libre, vers l'orbite.
    const from = this.currentPose();
    this.free.leave();
    this.preset = null;
    this.transition = { preset, from, elapsed: 0, duration: durationSeconds };
  }

  applyOrbit(preset: CameraPreset, angle: number): void {
    if (this.disposed) {
      return;
    }
    this.transition = null;
    this.preset = preset;
    const base = this.orbitBasePose(preset);
    this.setPoseFrom(orbitPositionInto(base, angle, this.orbitPosition), base.target);
  }

  /** Pose de `presetPose(preset)`, en cache tant que préréglage, aspect et bac sont les mêmes. */
  private orbitBasePose(preset: CameraPreset): CameraPose {
    const aspect = this.aspect();
    const dimensions = this.host.dimensions;
    const cached = this.orbitBase;
    if (
      cached !== null &&
      cached.preset === preset &&
      cached.aspect === aspect &&
      cached.dimensions === dimensions
    ) {
      return cached.pose;
    }
    const pose = this.presetPose(preset);
    this.orbitBase = { preset, aspect, dimensions, pose };
    return pose;
  }

  get transitioning(): boolean {
    return this.transition !== null;
  }

  stepCameraTransition(dtSeconds: number): boolean {
    const transition = this.transition;
    if (!transition || this.disposed) {
      return false;
    }
    const dt = Number.isFinite(dtSeconds) && dtSeconds > 0 ? dtSeconds : 0;
    transition.elapsed = Math.min(transition.duration, transition.elapsed + dt);
    if (transition.elapsed >= transition.duration) {
      this.applyPreset(transition.preset);
      return true;
    }
    const to = this.presetPose(transition.preset);
    this.setPose(interpolatePose(transition.from, to, transition.elapsed / transition.duration));
    return true;
  }

  get freeCameraActive(): boolean {
    return this.free.active;
  }

  enterFreeCamera(): boolean {
    if (this.disposed || !this.host.interactive || this.free.active || !this.host.roomBuilt()) {
      return false;
    }
    const saved = { pose: this.currentPose(), preset: this.preset };
    this.transition = null;
    this.preset = null;
    this.free.enter(saved);
    return true;
  }

  exitFreeCamera(): boolean {
    const saved = this.free.saved;
    if (!saved || this.disposed) {
      return false;
    }
    this.free.leave();
    if (saved.preset !== null) {
      this.applyPreset(saved.preset);
    } else {
      this.setPose(saved.pose);
    }
    return true;
  }

  stepFreeCamera(input: FreeCameraInput, dtSeconds: number): boolean {
    return !this.disposed && this.free.step(input, dtSeconds);
  }

  applyFreePose(position: Vec3, yaw: number, pitch: number): boolean {
    if (this.disposed || !this.host.roomBuilt()) {
      return false;
    }
    this.free.leave();
    this.transition = null;
    this.preset = null;
    this.free.applyPose(position, yaw, pitch);
    return true;
  }

  get freeCameraState(): FreeCameraState | null {
    return this.free.state;
  }

  get freeCameraThrust(): number {
    return this.free.thrust;
  }

  /**
   * Pièce changée (#343) : masquée, la caméra libre rend l'orbite ; meuble changé, ses limites
   * sont recalculées. Sans effet en orbite.
   */
  roomChanged(): void {
    if (!this.free.active) {
      return;
    }
    if (!this.host.roomBuilt()) {
      this.exitFreeCamera();
    } else {
      this.free.refreshBounds();
    }
  }

  /** Voir `AquariumView.onCameraChange` : orientation de la caméra libre à la souris. */
  onFreeLook(listener: () => void): () => void {
    return this.free.onLook(listener);
  }

  setImmersiveCamera(camera: ImmersiveCamera | null): boolean {
    if (this.disposed) {
      return false;
    }
    if (camera === null) {
      if (this.immersiveOn) {
        this.immersiveOn = false;
        this.host.controls.enabled = this.host.interactive;
        this.host.updateAspect();
        this.applyPreset(this.presetBeforeImmersive);
      }
      return true;
    }
    if (
      !Number.isFinite(camera.eyeX) ||
      !Number.isFinite(camera.eyeY) ||
      !Number.isFinite(camera.eyeDistance) ||
      camera.eyeDistance <= 0
    ) {
      return false;
    }
    this.enterImmersive(camera);
    return true;
  }

  /** Passe (ou reste) en mode immersif sur `camera`, déjà validée. */
  private enterImmersive(camera: ImmersiveCamera): void {
    this.free.leave();
    this.transition = null;
    if (!this.immersiveOn) {
      this.presetBeforeImmersive = this.preset ?? 'front';
    }
    // Plus de préréglage suivi : un redimensionnement ne replace pas la caméra.
    this.preset = null;
    // Copie en place, sans allocation (#357) : l'appelant peut réutiliser son objet (#355).
    const immersive = this.immersive;
    immersive.eyeX = camera.eyeX;
    immersive.eyeY = camera.eyeY;
    immersive.eyeDistance = camera.eyeDistance;
    this.immersiveOn = true;
    this.host.controls.enabled = false;
    const { height, depth } = this.host.dimensions;
    const x = camera.eyeX;
    const y = height / 2 + camera.eyeY;
    const z = depth / 2 + camera.eyeDistance;
    this.host.camera.position.set(x, y, z);
    this.host.camera.quaternion.identity();
    this.host.controls.target.set(x, y, 0);
    this.refreshImmersiveProjection();
  }

  get immersiveActive(): boolean {
    return this.immersiveOn;
  }

  /** Projection décentrée du mode immersif, réappliquée après un recalage de l'aspect. */
  refreshImmersiveProjection(): void {
    if (!this.immersiveOn) {
      return;
    }
    const camera = this.immersive;
    const { width, height, depth } = this.host.dimensions;
    const frustum = offAxisFrustum({
      screenWidth: width,
      screenHeight: height,
      eye: { x: camera.eyeX, y: camera.eyeY, z: camera.eyeDistance },
      near: camera.eyeDistance / 2,
      far: camera.eyeDistance + depth + 1,
    });
    const projection = this.host.camera.projectionMatrix;
    projection.fromArray(frustumMatrix(frustum));
    this.host.camera.projectionMatrixInverse.copy(projection).invert();
  }

  /** Retire l'écouteur des contrôles et les gestes de la caméra libre. */
  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.host.controls.removeEventListener('start', this.stopFollowingPreset);
    this.free.dispose();
  }

  private presetPose(preset: CameraPreset): CameraPose {
    return cameraPresetPose(preset, this.host.dimensions, this.aspect(), CAMERA_FOV_DEG);
  }

  private currentPose(): CameraPose {
    const p = this.host.camera.position;
    const t = this.host.controls.target;
    return { position: [p.x, p.y, p.z], target: [t.x, t.y, t.z] };
  }

  private setPose(pose: CameraPose): void {
    this.setPoseFrom(pose.position, pose.target);
  }

  /** Place la caméra en `position`, tournée vers `target` (accès indexés, sans allocation). */
  private setPoseFrom(position: Vec3, target: Vec3): void {
    this.host.camera.position.set(position[0], position[1], position[2]);
    this.host.controls.target.set(target[0], target[1], target[2]);
    this.host.camera.lookAt(target[0], target[1], target[2]);
    this.host.controls.update();
  }

  private aspect(): number {
    if (this.host.hasSize()) {
      return this.host.camera.aspect;
    }
    const w = this.host.canvas.clientWidth;
    const h = this.host.canvas.clientHeight;
    return w > 0 && h > 0 ? w / h : 1;
  }
}
