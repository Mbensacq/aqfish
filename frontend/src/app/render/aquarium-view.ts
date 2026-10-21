import {
  MOUSE,
  PerspectiveCamera,
  TOUCH,
  Vector3,
  type Camera,
  type Scene,
  WebGLRenderer,
  type WebGLRenderTarget,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import type { CameraPreset } from '../core/capture/capture-params';
import { ORBIT_MOUSE_BUTTONS, ORBIT_TOUCHES, type OrbitAction } from '../core/commands/commands';
import { DEFAULT_RENDER_FILTER, type RenderFilter } from '../core/render-filter/render-filter';
import type { FoodStyle } from '../core/food-style/food-style';
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
import { SPECIES, speciesVariants, type SpeciesId } from '../sim/species';
import type { Fish } from '../sim/swimmer';
import type { DayLight } from '../sim/daylight';
import { environmentWater, type Environment } from '../sim/environment';
import { flowerOpenness, lilyPadLayout } from '../sim/lily-pads';
import type { DecorItem } from '../sim/decor';
import type { FoodPellet } from '../sim/food';
import { BubbleLayer } from './bubble-layer';
import { DecorLayer } from './decor-layer';
import { FishLayer, MAX_FISH_PER_SPECIES } from './fish-layer';
import { FoodLayer } from './food-layer';
import { scenePixelsPerMeter } from './food-size';
import { LilyPadLayer } from './lily-pad-layer';
import { isClick, toNormalizedDevice, waterSurfacePoint } from './food-pick';
import {
  decorTintInto,
  flatBrightness,
  type MutableTint,
  tonePenaltiesInto,
  type TonePenalties,
} from './night-shade';
import { PalettePass } from './palette-pass';
import { PIXEL_SIZE, type Size } from './pixel-art';
import { WaterLightLayer } from './water-light';

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
  /** Environnement représenté (bac tropical par défaut, `sim/environment.ts`). */
  readonly environment?: Environment;
  /** Filtre de rendu initial (pixel art par défaut), modifiable à chaud par `setFilter`. */
  readonly filter?: RenderFilter;
}

/**
 * Vue 3D du bac, sans Angular : renderer, scène, caméra et contrôles orbitaux.
 * Le composant hôte (`ui/`) porte la boucle d'affichage et appelle `renderFrame()`.
 *
 * Pipeline pixel art (ADR 0002) : la scène est rendue dans la cible basse résolution de
 * `PalettePass`, puis affichée plein écran sans lissage et ramenée à la palette.
 * Filtre `aucun` (ADR 0010) : la scène est rendue directement à l'écran, en pleine
 * résolution, sans passe palette ; la bascule ne touche ni à la caméra ni à la scène.
 */
export class AquariumView {
  readonly camera: PerspectiveCamera;
  private readonly renderer: AquariumRenderer;
  private readonly world: AquariumScene;
  private readonly controls: OrbitControls;
  private readonly canvas: HTMLCanvasElement;
  private readonly pixelPass: PalettePass;
  /**
   * Une couche par apparence de chaque espèce de `SPECIES` (`speciesVariants`), dans l'ordre
   * de déclaration (aucun champ par espèce).
   */
  private readonly fishLayers: readonly FishLayer[];
  /** Décor du monde (rochers), fixé par `setDecor`. */
  private readonly decorLayer = new DecorLayer();
  /** Tampons réutilisés par `updateLight` (aucune allocation). */
  private readonly decorTint: MutableTint = [1, 1, 1];
  private readonly penalties: TonePenalties = { night: 0, twilight: 0 };
  /** Bulles du diffuseur (ADR 0017), selon la graine fixée par `setDecor`. */
  private readonly bubbleLayer = new BubbleLayer();
  /** Granulés de nourriture (issue #67), posés par `updateFood`. */
  private readonly foodLayer = new FoodLayer();
  /** Caustiques sur le sable et reflet de surface (ADR 0017). */
  private readonly waterLight: WaterLightLayer;
  /** Nénuphars (issue #103), tirés de la graine fixée par `setDecor`. */
  private readonly lilyPadLayer: LilyPadLayer;
  /** Abonnés au clic sur la surface de l'eau (`onSurfaceClick`). */
  private readonly surfaceClickListeners = new Set<(x: number, z: number) => void>();
  /** Appui du pointeur principal en attente de relâchement (`null` : aucun clic possible). */
  private pendingClick: { readonly id: number; readonly x: number; readonly y: number } | null =
    null;
  private readonly onPointerDown = (event: PointerEvent) => {
    this.pendingClick =
      event.button === 0 && event.isPrimary
        ? { id: event.pointerId, x: event.clientX, y: event.clientY }
        : null;
  };
  private readonly onPointerUp = (event: PointerEvent) => {
    const down = this.pendingClick;
    this.pendingClick = null;
    if (
      !down ||
      down.id !== event.pointerId ||
      !this.controls.enabled ||
      !isClick(down, { x: event.clientX, y: event.clientY })
    ) {
      return;
    }
    const point = this.pickWaterSurface(event.clientX, event.clientY);
    if (point) {
      for (const listener of this.surfaceClickListeners) {
        listener(point.x, point.z);
      }
    }
  };
  private readonly onPointerCancel = () => {
    this.pendingClick = null;
  };
  private readonly pixelRatio: number;
  private width = 0;
  private height = 0;
  private currentFilter: RenderFilter;
  /** Taille de la cible basse résolution (tenue à jour dans les deux modes). */
  private targetSize: Size = { width: 1, height: 1 };
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
    this.currentFilter = options.filter ?? DEFAULT_RENDER_FILTER;
    this.renderer.setPixelRatio(options.pixelRatio);
    this.pixelPass = new PalettePass();
    this.world = createAquariumScene(options.environment);
    this.fishLayers = Object.values(SPECIES).flatMap((species) =>
      speciesVariants(species).map(
        (_, index) => new FishLayer(species, MAX_FISH_PER_SPECIES, index),
      ),
    );
    for (const layer of this.fishLayers) {
      this.world.scene.add(layer.object);
    }
    this.world.scene.add(this.decorLayer.object);
    // Bulles et diffuseur : seulement dans un environnement qui en a (bac tropical).
    this.bubbleLayer.object.visible = this.world.environment.bubbles;
    this.world.scene.add(this.bubbleLayer.object);
    this.world.scene.add(this.foodLayer.object);
    this.waterLight = new WaterLightLayer(this.world.dimensions, this.world.environment.caustics);
    this.world.scene.add(this.waterLight.object);
    this.lilyPadLayer = new LilyPadLayer(this.world.dimensions);
    this.world.scene.add(this.lilyPadLayer.object);

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
    // Gestes déclarés dans `core/commands` (source unique de l'aide-mémoire, #74) : clic
    // gauche = rotation, molette = zoom, clic droit = déplacement ; un doigt = rotation, deux
    // doigts = zoom et déplacement (ce sont aussi les valeurs par défaut d'`OrbitControls`).
    this.controls.mouseButtons = {
      LEFT: ORBIT_MOUSE_ACTIONS[ORBIT_MOUSE_BUTTONS.left],
      MIDDLE: ORBIT_MOUSE_ACTIONS[ORBIT_MOUSE_BUTTONS.middle],
      RIGHT: ORBIT_MOUSE_ACTIONS[ORBIT_MOUSE_BUTTONS.right],
    };
    this.controls.touches = {
      ONE: ORBIT_TOUCH_ACTIONS[ORBIT_TOUCHES.one],
      TWO: ORBIT_TOUCH_ACTIONS[ORBIT_TOUCHES.two],
    };
    this.controls.addEventListener('start', this.stopFollowingPreset);
    // Nourrissage au clic (issue #67) : écouté à côté des contrôles, qui gardent le glisser.
    options.canvas.addEventListener('pointerdown', this.onPointerDown);
    options.canvas.addEventListener('pointerup', this.onPointerUp);
    options.canvas.addEventListener('pointercancel', this.onPointerCancel);

    this.preset = options.preset;
    this.applyPreset(options.preset);
  }

  get dimensions(): TankDimensions {
    return this.world.dimensions;
  }

  /** Environnement représenté. */
  get environment(): Environment {
    return this.world.environment;
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
      this.targetSize = this.pixelPass.setSize(w, h, this.pixelRatio);
      this.updateAspect();
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
   * (`alpha` ∈ [0, 1] : 0 = pas précédent, 1 = pas courant), avec la graine du monde `seed`
   * (robes des koïs, `speciesVariantIndex`). À appeler avant `renderFrame()`.
   */
  updateFish(entities: readonly Fish[], alpha: number, seed = 0): void {
    if (this.disposed) {
      return;
    }
    for (const layer of this.fishLayers) {
      layer.update(entities, alpha, seed);
    }
  }

  /**
   * Pose le décor animé (plantes qui ondulent, bulles, caustiques, reflet de surface) au
   * temps simulé `time`, en secondes : jamais l'horloge murale (contrat de capture). À
   * appeler avant `renderFrame()`.
   */
  updateDecor(time: number): void {
    if (!this.disposed) {
      this.decorLayer.update(time);
      this.lilyPadLayer.update(time);
      if (this.world.environment.bubbles) {
        this.bubbleLayer.update(time);
      }
      this.waterLight.update(time);
    }
  }

  /** Pose les granulés de nourriture du monde (`World.food`). À appeler avant `renderFrame()`. */
  updateFood(food: readonly FoodPellet[]): void {
    if (!this.disposed) {
      this.foodLayer.update(food);
    }
  }

  /** Nombre de granulés posés par le dernier `updateFood` (tests). */
  get foodCount(): number {
    return this.foodLayer.count;
  }

  /** Rendu des granulés (points ou voxels, issue #117). */
  get foodStyle(): FoodStyle {
    return this.foodLayer.style;
  }

  /** Change le rendu des granulés à chaud ; la scène et la caméra ne changent pas. */
  setFoodStyle(style: FoodStyle): void {
    if (!this.disposed) {
      this.foodLayer.setStyle(style);
    }
  }

  /** Taille courante du cœur d'un granulé en points, en pixels de la surface de rendu (tests). */
  get foodPointSize(): number {
    return this.foodLayer.pointSize;
  }

  /**
   * Point de la surface de l'eau sous le point de l'écran (`clientX`, `clientY`, pixels CSS),
   * en (x, z) dans le repère du bac, par lancer de rayon depuis la caméra ; `null` hors du
   * canvas ou hors du bac.
   */
  pickWaterSurface(clientX: number, clientY: number): { x: number; z: number } | null {
    if (this.disposed) {
      return null;
    }
    const ndc = toNormalizedDevice(clientX, clientY, this.canvas.getBoundingClientRect());
    if (!ndc) {
      return null;
    }
    const origin = this.camera.position;
    const direction = new Vector3(ndc.x, ndc.y, 0.5).unproject(this.camera).sub(origin);
    return waterSurfacePoint(
      [origin.x, origin.y, origin.z],
      [direction.x, direction.y, direction.z],
      this.world.dimensions,
    );
  }

  /**
   * Abonnement au clic (sans glisser, bouton principal) sur la surface de l'eau, avec le
   * point visé (x, z) dans le repère du bac. Jamais appelé si les contrôles sont inactifs
   * (mode capture) ni pour un clic hors du bac. Renvoie le désabonnement.
   */
  onSurfaceClick(listener: (x: number, z: number) => void): () => void {
    this.surfaceClickListeners.add(listener);
    return () => this.surfaceClickListeners.delete(listener);
  }

  /**
   * Applique la lumière du jour (`sim/daylight.ts`, ADR 0018) : lumières, teinte de l'eau,
   * caustiques et reflet, luminosité des couleurs plates (poissons, bulles : ADR 0019),
   * teinte du décor et tons de nuit ou de crépuscule de la passe palette (ADR 0021).
   * Sans effet sur la caméra, le filtre et le reste de la scène.
   */
  updateLight(light: DayLight): void {
    if (!this.disposed) {
      this.world.setDaylight(light);
      this.waterLight.setDaylight(light.intensity);
      const brightness = flatBrightness(light.intensity);
      for (const layer of this.fishLayers) {
        layer.setBrightness(brightness);
      }
      this.bubbleLayer.setBrightness(brightness);
      this.foodLayer.setBrightness(brightness);
      this.decorLayer.setTint(decorTintInto(light.intensity, this.decorTint));
      this.lilyPadLayer.setTint(this.decorTint);
      const penalties = tonePenaltiesInto(light.intensity, this.penalties);
      this.pixelPass.setTonePenalties(penalties.night, penalties.twilight);
    }
  }

  /**
   * Ouvre ou ferme les fleurs des nénuphars selon l'heure `hour` (`flowerOpenness`, issue
   * #104) : à appeler avec `updateLight`, à la même heure.
   * @throws RangeError si `hour` n'est pas un réel fini.
   */
  updateFlowers(hour: number): void {
    if (!this.disposed) {
      this.lilyPadLayer.setOpenness(flowerOpenness(hour));
    }
  }

  /** Ouverture courante des fleurs des nénuphars (tests). */
  get flowerOpenness(): number {
    return this.lilyPadLayer.flowerOpenness;
  }

  /**
   * Affiche le décor du monde (`World.decor`), ses bulles et ses nénuphars, tirés de la graine
   * du monde (`World.seed`) : à appeler une fois par monde.
   */
  setDecor(items: readonly DecorItem[], seed: number): void {
    if (!this.disposed) {
      this.decorLayer.setDecor(items);
      this.bubbleLayer.setSeed(seed);
      const env = this.world.environment;
      this.lilyPadLayer.setPads(lilyPadLayout(seed, environmentWater(env.id), env.lilyPads));
    }
  }

  /** Nombre de bulles posées par le dernier `updateDecor` (tests). */
  get bubbleCount(): number {
    return this.bubbleLayer.count;
  }

  /** Luminosité des couleurs plates de chaque couche de poissons, puis des bulles (tests). */
  get flatBrightnesses(): readonly number[] {
    return [...this.fishLayers.map((layer) => layer.brightness), this.bubbleLayer.brightness];
  }

  /** Teinte courante du décor (tests). */
  get decorTintValue(): readonly [number, number, number] {
    return this.decorLayer.tint;
  }

  /** Pénalités courantes des tons de nuit et du crépuscule (tests). */
  get tonePenalties(): readonly [number, number] {
    return this.pixelPass.tonePenalties;
  }

  /**
   * Affiche ou masque le décor (rochers, plantes et nénuphars, issue #52) sans le détruire :
   * il reste en mémoire et réapparaît tel quel. Les bulles, l'eau et la lumière ne changent pas.
   */
  setDecorVisible(visible: boolean): void {
    if (!this.disposed) {
      this.decorLayer.object.visible = visible;
      this.lilyPadLayer.object.visible = visible;
    }
  }

  /** Nombre de nénuphars affichés (tests). */
  get lilyPadCount(): number {
    return this.lilyPadLayer.count;
  }

  /** Vrai si les nénuphars sont affichés (tests). */
  get lilyPadsVisible(): boolean {
    return this.lilyPadLayer.object.visible;
  }

  /** Vrai si le décor est affiché (tests). */
  get decorVisible(): boolean {
    return this.decorLayer.object.visible;
  }

  /** Nombre d'éléments de décor affichés (tests). */
  get decorCount(): number {
    return this.decorLayer.count;
  }

  /** Nombre de poissons placés par le dernier `updateFish`, toutes espèces confondues (tests). */
  get fishCount(): number {
    let count = 0;
    for (const layer of this.fishLayers) {
      count += layer.count;
    }
    return count;
  }

  /** Espèce de chaque couche de rendu, dans l'ordre des couches (tests). */
  get fishLayerSpecies(): readonly SpeciesId[] {
    return this.fishLayers.map((layer) => layer.species.id);
  }

  /** Nom de chaque couche de rendu (`poissons-<espèce>[-<apparence>]`), dans l'ordre (tests). */
  get fishLayerNames(): readonly string[] {
    return this.fishLayers.map((layer) => layer.object.name);
  }

  /** Filtre de rendu courant. */
  get filter(): RenderFilter {
    return this.currentFilter;
  }

  /**
   * Change le filtre de rendu à chaud. Seule la projection suit le nouveau rapport d'aspect :
   * la position et la cible de la caméra, la transition en cours et la scène sont conservées.
   * Renvoie `true` si le filtre a changé.
   */
  setFilter(filter: RenderFilter): boolean {
    if (this.disposed || filter === this.currentFilter) {
      return false;
    }
    this.currentFilter = filter;
    if (this.hasSize()) {
      this.updateAspect();
    }
    return true;
  }

  /** Rend une image. Renvoie `false` si rien n'a pu être rendu (taille nulle ou vue libérée). */
  renderFrame(): boolean {
    if (this.disposed || !this.hasSize()) {
      return false;
    }
    // Bassin enterré (#105) : coupe du sol et de la margelle si la caméra passe sous le sol.
    this.world.setViewpoint(this.camera.position.x, this.camera.position.y, this.camera.position.z);
    // Taille des granulés selon le zoom (#117) : échelle à la distance de la cible.
    this.foodLayer.setPixelsPerMeter(
      scenePixelsPerMeter(
        this.camera.position.distanceTo(this.controls.target),
        this.camera.fov,
        this.targetSize.height,
      ),
    );
    if (this.currentFilter === 'aucun') {
      this.decorLayer.setResolution(this.width * this.pixelRatio, this.height * this.pixelRatio);
      this.lilyPadLayer.setResolution(this.width * this.pixelRatio, this.height * this.pixelRatio);
      // Sans filtre, une bulle garde la taille d'un pixel de scène du mode pixel art.
      this.bubbleLayer.setPointScale(PIXEL_SIZE * this.pixelRatio);
      this.foodLayer.setPointScale(PIXEL_SIZE * this.pixelRatio);
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.world.scene, this.camera);
      return true;
    }
    this.decorLayer.setResolution(this.targetSize.width, this.targetSize.height);
    this.lilyPadLayer.setResolution(this.targetSize.width, this.targetSize.height);
    this.bubbleLayer.setPointScale(1);
    this.foodLayer.setPointScale(1);
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

  /**
   * Abonnement au début d'un geste de l'utilisateur à la souris ou au toucher (événement
   * `start` des contrôles, une fois par geste) : la caméra ne suit plus de préréglage.
   * Renvoie le désabonnement.
   */
  onUserInteraction(listener: () => void): () => void {
    this.controls.addEventListener('start', listener);
    return () => this.controls.removeEventListener('start', listener);
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
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerCancel);
    this.surfaceClickListeners.clear();
    this.controls.dispose();
    this.fishLayers.forEach((layer) => layer.dispose());
    this.decorLayer.dispose();
    this.bubbleLayer.dispose();
    this.foodLayer.dispose();
    this.waterLight.dispose();
    this.lilyPadLayer.dispose();
    this.world.dispose();
    this.pixelPass.dispose();
    this.renderer.dispose();
  }

  /**
   * Rapport d'aspect de la caméra : celui de la cible en pixel art (arrondie au pixel de
   * scène, pour ne pas déformer l'image), celui du canvas sans filtre.
   */
  private updateAspect(): void {
    const size: Size =
      this.currentFilter === 'pixel' ? this.targetSize : { width: this.width, height: this.height };
    this.camera.aspect = size.width / size.height;
    this.camera.updateProjectionMatrix();
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
