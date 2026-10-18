import {
  MOUSE,
  PerspectiveCamera,
  type Camera,
  type Scene,
  WebGLRenderer,
  type WebGLRenderTarget,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import type { CameraPreset } from '../core/capture/capture-params';
import { createAquariumScene, type AquariumScene } from './aquarium-scene';
import {
  CAMERA_FOV_DEG,
  cameraPresetPose,
  interpolatePose,
  orbitDistanceLimits,
  panTargetRadius,
  type CameraPose,
  tankBoundingRadius,
  tankCenter,
  type TankDimensions,
  type Vec3,
} from './camera-presets';
import { SPECIES, type SpeciesId } from '../sim/species';
import type { Fish } from '../sim/swimmer';
import { FishLayer } from './fish-layer';
import { PalettePass } from './palette-pass';

/**
 * Sous-ensemble de `WebGLRenderer` utilisé par la vue. Permet de remplacer le renderer
 * par un double dans les tests unitaires (jsdom n'a pas WebGL, voir docs/PIEGES.md).
 */
export interface AquariumRenderer {
  setPixelRatio(ratio: number): void;
  setSize(width: number, height: number, updateStyle?: boolean): void;
  setRenderTarget(target: WebGLRenderTarget | null): void;
  render(scene: Scene, camera: Camera): void;
  dispose(): void;
}

export type AquariumRendererFactory = (canvas: HTMLCanvasElement) => AquariumRenderer;

/** Fabrique par défaut : WebGL sans anticrénelage (docs/DA.md, « Aucun lissage »). */
export const createWebGLRenderer: AquariumRendererFactory = (canvas) =>
  new WebGLRenderer({ canvas, antialias: false, powerPreference: 'low-power' });

export interface AquariumViewOptions {
  readonly canvas: HTMLCanvasElement;
  readonly rendererFactory: AquariumRendererFactory;
  readonly pixelRatio: number;
  readonly preset: CameraPreset;
  /** Contrôles à la souris actifs (désactivés en mode capture). */
  readonly interactive: boolean;
  readonly dimensions?: TankDimensions;
}

/**
 * Vue 3D du bac, sans Angular : renderer, scène, caméra et contrôles orbitaux.
 * Le composant hôte (`ui/`) porte la boucle d'affichage et appelle `renderFrame()`.
 *
 * Pipeline pixel art (ADR 0002) : la scène est rendue dans la cible basse résolution de
 * `PalettePass`, puis affichée plein écran sans lissage et ramenée à la palette.
 */
export class AquariumView {
  readonly camera: PerspectiveCamera;
  private readonly renderer: AquariumRenderer;
  private readonly world: AquariumScene;
  private readonly controls: OrbitControls;
  private readonly canvas: HTMLCanvasElement;
  private readonly pixelPass: PalettePass;
  /** Une couche par espèce de `SPECIES`, dans l'ordre de déclaration (aucun champ par espèce). */
  private readonly fishLayers: readonly FishLayer[];
  private readonly pixelRatio: number;
  private width = 0;
  private height = 0;
  private disposed = false;
  /** Préréglage courant, recadré à chaque redimensionnement tant que l'utilisateur n'a pas bougé. */
  private preset: CameraPreset | null;
  /** Transition en cours vers un préréglage (`null` sinon), avancée par `stepCameraTransition`. */
  private transition: CameraTransition | null = null;
  /** Une interaction à la souris arrête de suivre le préréglage et annule la transition. */
  private readonly stopFollowingPreset = () => {
    this.preset = null;
    this.transition = null;
  };

  constructor(options: AquariumViewOptions) {
    this.canvas = options.canvas;
    this.renderer = options.rendererFactory(options.canvas);
    this.pixelRatio = options.pixelRatio;
    this.renderer.setPixelRatio(options.pixelRatio);
    this.pixelPass = new PalettePass();
    this.world = createAquariumScene(options.dimensions);
    this.fishLayers = Object.values(SPECIES).map((species) => new FishLayer(species));
    for (const layer of this.fishLayers) {
      this.world.scene.add(layer.object);
    }

    const radius = tankBoundingRadius(this.world.dimensions);
    this.camera = new PerspectiveCamera(CAMERA_FOV_DEG, 1, radius * 0.05, radius * 40);

    this.controls = new OrbitControls(this.camera, options.canvas);
    this.controls.enabled = options.interactive;
    this.controls.enableDamping = false;
    const limits = orbitDistanceLimits(this.world.dimensions);
    this.controls.minDistance = limits.min;
    this.controls.maxDistance = limits.max;
    // Déplacement au clic droit borné (bug #10) : la cible reste dans une sphère autour du
    // centre du bac, qui reste ainsi dans le champ.
    this.controls.cursor.set(...tankCenter(this.world.dimensions));
    this.controls.maxTargetRadius = panTargetRadius(this.world.dimensions);
    // Explicite (ce sont aussi les valeurs par défaut) : clic gauche = rotation,
    // molette = zoom, clic droit = déplacement.
    this.controls.mouseButtons = { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN };
    this.controls.addEventListener('start', this.stopFollowingPreset);

    this.preset = options.preset;
    this.applyPreset(options.preset);
  }

  get dimensions(): TankDimensions {
    return this.world.dimensions;
  }

  /** Place la caméra sur un préréglage, cadré pour le rapport d'aspect courant (instantané). */
  applyPreset(preset: CameraPreset): void {
    this.transition = null;
    this.preset = preset;
    this.setPose(this.presetPose(preset));
  }

  /**
   * Amène la caméra sur un préréglage par une transition de `durationSeconds`, avancée par
   * `stepCameraTransition` (donc par la boucle de rendu, pas par une minuterie). Une durée
   * nulle ou des contrôles inactifs (mode capture, contrat déterministe) : placement instantané.
   */
  animateToPreset(preset: CameraPreset, durationSeconds: number): void {
    if (this.disposed) {
      return;
    }
    if (!(durationSeconds > 0) || !this.controls.enabled) {
      this.applyPreset(preset);
      return;
    }
    this.preset = null;
    this.transition = {
      preset,
      from: this.currentPose(),
      elapsed: 0,
      duration: durationSeconds,
    };
  }

  /** Vrai pendant une transition de caméra. */
  get transitioning(): boolean {
    return this.transition !== null;
  }

  /**
   * Avance la transition de caméra de `dtSeconds`. Renvoie `true` si la caméra a bougé.
   * La pose d'arrivée est recalculée à chaque pas : un redimensionnement en cours de route
   * reste cadré. À la fin, la caméra suit de nouveau le préréglage.
   */
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

  /**
   * Adapte le renderer et la caméra à la taille du canvas (en pixels CSS).
   * Renvoie `true` si la taille a changé.
   */
  resize(width: number, height: number): boolean {
    const w = Math.max(0, Math.floor(width));
    const h = Math.max(0, Math.floor(height));
    if (w === this.width && h === this.height) {
      return false;
    }
    this.width = w;
    this.height = h;
    if (w > 0 && h > 0) {
      this.renderer.setSize(w, h, false);
      // Rapport d'aspect de la cible (arrondie au pixel de scène) pour ne pas déformer l'image.
      const target = this.pixelPass.setSize(w, h, this.pixelRatio);
      this.camera.aspect = target.width / target.height;
      this.camera.updateProjectionMatrix();
      if (this.preset !== null) {
        this.applyPreset(this.preset);
      }
    }
    return true;
  }

  /** Taille non nulle : une image rendue maintenant est une image complète. */
  hasSize(): boolean {
    return this.width > 0 && this.height > 0;
  }

  /**
   * Place les poissons d'après l'état du monde, interpolés entre les deux derniers pas
   * (`alpha` ∈ [0, 1] : 0 = pas précédent, 1 = pas courant). À appeler avant `renderFrame()`.
   */
  updateFish(entities: readonly Fish[], alpha: number): void {
    if (this.disposed) {
      return;
    }
    for (const layer of this.fishLayers) {
      layer.update(entities, alpha);
    }
  }

  /** Nombre de poissons placés par le dernier `updateFish`, toutes espèces confondues (tests). */
  get fishCount(): number {
    let count = 0;
    for (const layer of this.fishLayers) {
      count += layer.count;
    }
    return count;
  }

  /** Espèces ayant une couche de rendu, dans l'ordre des couches (tests). */
  get fishLayerSpecies(): readonly SpeciesId[] {
    return this.fishLayers.map((layer) => layer.species.id);
  }

  /** Rend une image. Renvoie `false` si rien n'a pu être rendu (taille nulle ou vue libérée). */
  renderFrame(): boolean {
    if (this.disposed || !this.hasSize()) {
      return false;
    }
    this.renderer.setRenderTarget(this.pixelPass.target);
    this.renderer.render(this.world.scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.pixelPass.scene, this.pixelPass.camera);
    return true;
  }

  /** Position courante de la caméra (exposée pour les tests de bout en bout). */
  cameraPosition(): Vec3 {
    const p = this.camera.position;
    return [p.x, p.y, p.z];
  }

  /** Cible courante de la caméra (exposée pour les tests de bout en bout). */
  cameraTarget(): Vec3 {
    const t = this.controls.target;
    return [t.x, t.y, t.z];
  }

  /** Abonnement aux mouvements de caméra provoqués par l'utilisateur. Renvoie le désabonnement. */
  onCameraChange(listener: () => void): () => void {
    this.controls.addEventListener('change', listener);
    return () => this.controls.removeEventListener('change', listener);
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.controls.removeEventListener('start', this.stopFollowingPreset);
    this.controls.dispose();
    this.fishLayers.forEach((layer) => layer.dispose());
    this.world.dispose();
    this.pixelPass.dispose();
    this.renderer.dispose();
  }

  private presetPose(preset: CameraPreset): CameraPose {
    return cameraPresetPose(preset, this.world.dimensions, this.aspect(), CAMERA_FOV_DEG);
  }

  private currentPose(): CameraPose {
    const p = this.camera.position;
    const t = this.controls.target;
    return { position: [p.x, p.y, p.z], target: [t.x, t.y, t.z] };
  }

  private setPose(pose: CameraPose): void {
    this.camera.position.set(...pose.position);
    this.controls.target.set(...pose.target);
    this.camera.lookAt(...pose.target);
    this.controls.update();
  }

  private aspect(): number {
    if (this.hasSize()) {
      return this.camera.aspect;
    }
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    return w > 0 && h > 0 ? w / h : 1;
  }
}

interface CameraTransition {
  readonly preset: CameraPreset;
  readonly from: CameraPose;
  elapsed: number;
  readonly duration: number;
}
