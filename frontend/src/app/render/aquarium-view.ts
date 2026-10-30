import {
  MOUSE,
  PerspectiveCamera,
  TOUCH,
  Raycaster,
  Vector2,
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
  orbitPose,
  panTargetRadius,
  type CameraPose,
  tankBoundingRadius,
  tankCenter,
  type TankDimensions,
  type Vec3,
} from './camera-presets';
import { SPECIES, speciesVariants, type SpeciesId } from '../sim/species';
import type { Fish } from '../sim/swimmer';
import { createDayLight, type DayLight } from '../sim/daylight';
import { bubbleSourceFor } from '../sim/bubbles';
import { environmentDataWater, type Environment } from '../sim/environment';
import { terrainAt } from '../sim/terrain';
import { flowerOpenness, lilyPadLayout } from '../sim/lily-pads';
import { seededFeatures } from '../sim/world';
import type { DecorItem } from '../sim/decor';
import type { FoodPellet } from '../sim/food';
import { clampRoom, DEFAULT_ROOM, isRoomAvailable, type Room, type RoomBlock } from '../sim/room';
import { SAND_THICKNESS } from '../sim/tank';
import { BubbleLayer } from './bubble-layer';
import { CatappaLayer } from './catappa-layer';
import { DecorLayer } from './decor-layer';
import { planePoint, sandHit, type DecorPick } from './decor-pick';
import { pickRoom } from './room-pick';
import { type EffectLayer, type SceneLayer, updateVisibleEffects } from './effect-layer';
import { FloatingLeafLayer } from './floating-leaf-layer';
import { FishLayer, MAX_FISH_PER_SPECIES } from './fish-layer';
import { FoodLayer } from './food-layer';
import { scenePixelsPerMeter } from './food-size';
import { LilyPadLayer } from './lily-pad-layer';
import { overcastBrightness, RAIN_TONES } from './overcast';
import { isObliqueView, RainLayer } from './rain-layer';
import { RoomLayer } from './room-layer';
import { isClick, toNormalizedDevice, waterSurfacePoint } from './food-pick';
import {
  decorTintInto,
  flatBrightness,
  type MutableTint,
  tonePenaltiesInto,
  type TonePenalties,
} from './night-shade';
import { environmentTonePenalties, PalettePass } from './palette-pass';
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

/** Tons d'environnement de l'eau teintée par les feuilles de catappa (issue #239). */
export const TEA_TONES: readonly string[] = ['eauThe', 'eauTheClaire'];

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
 * Abonné au glissement d'un élément du décor à la souris ou au doigt (#168, `onDecorDrag`).
 * `start` : appui sur l'élément `index` (la caméra ne tourne plus) ; `move` : centre visé en
 * (x, z) sur le plan du sable, **non borné** (le décalage entre le point saisi et le centre
 * est conservé), seulement au-delà de `CLICK_TOLERANCE_PX` ; `end` : relâchement (`commit`
 * vrai si l'élément a bougé), ou abandon (`commit` faux : annulation du pointeur, fin du
 * mode édition).
 */
export interface DecorDragListener {
  start(index: number): void;
  move(index: number, x: number, z: number): void;
  end(index: number, commit: boolean): void;
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
  /** Pièce autour du bac (#187), masquée par défaut. */
  private readonly roomLayer = new RoomLayer();
  /** Tampons réutilisés par `updateLight` (aucune allocation). */
  private readonly decorTint: MutableTint = [1, 1, 1];
  private readonly penalties: TonePenalties = { night: 0, twilight: 0 };
  /** Dernière lumière du jour appliquée (`updateLight`), réappliquée quand la pluie change. */
  private readonly light = createDayLight();
  /** Bulles du diffuseur (ADR 0017), selon la graine fixée par `setDecor`. */
  private readonly bubbleLayer: BubbleLayer;
  /** Granulés de nourriture (issue #67), posés par `updateFood`. */
  private readonly foodLayer = new FoodLayer();
  /** Caustiques sur le sable et reflet de surface (ADR 0017). */
  private readonly waterLight: WaterLightLayer;
  /** Nénuphars (issue #103), tirés de la graine fixée par `setDecor`. */
  private readonly lilyPadLayer: LilyPadLayer;
  /** Pluie (issue #106), possible dans un environnement qui en a (`Environment.rain`). */
  private readonly rainLayer: RainLayer;
  /** Feuilles mortes flottantes (issue #107), dans un environnement qui en a. */
  private readonly floatingLeafLayer: FloatingLeafLayer;
  /** Feuilles de catappa sur le sol (issue #239). */
  private readonly catappaLayer: CatappaLayer;
  /**
   * Effets animés au contrat commun `EffectLayer` (issue #125) : bulles, pluie, puis feuilles
   * mortes. Parcourus
   * par `updateDecor`, `updateLight`, `setDecor` et `dispose`.
   */
  private readonly effects: readonly EffectLayer[];
  /** Toutes les couches, dans l'ordre d'ajout à la scène (et de libération). */
  private readonly sceneLayers: readonly SceneLayer[];
  /** Abonnés au clic sur la surface de l'eau (`onSurfaceClick`). */
  private readonly surfaceClickListeners = new Set<(x: number, z: number) => void>();
  /** Abonnés à tout clic sur le canvas (`onCanvasClick`), avant ceux de la surface. */
  private readonly canvasClickListeners = new Set<(clientX: number, clientY: number) => void>();
  /** Lancer de rayon de `pickDecor`, réutilisé. */
  private readonly raycaster = new Raycaster();
  /** Point visé en coordonnées normalisées, réutilisé par chaque lancer de rayon (#178). */
  private readonly pointerNdc = new Vector2();
  /** Appui du pointeur principal en attente de relâchement (`null` : aucun clic possible). */
  private pendingClick: { readonly id: number; readonly x: number; readonly y: number } | null =
    null;
  /** Contrôles à la souris demandés (faux en mode capture) ; coupés le temps d'un glissement. */
  private readonly interactive: boolean;
  /** Glissement du décor possible (mode édition, `setDecorDragEnabled`). */
  private decorDragEnabled = false;
  private decorDragListener: DecorDragListener | null = null;
  /** Abonné au glissement d'un élément de la pièce (#188, `onRoomDrag`). */
  private roomDragListener: DecorDragListener | null = null;
  /** Pièce construite par `setRoom` (choix à la souris), hors aperçu d'un glissement. */
  private room: Room = DEFAULT_ROOM;
  /** Blocs des meubles supports et des bacs posés (`setRoomLayout`, #305). */
  private roomLayout: readonly RoomBlock[] = [];
  /** Glissement en cours d'un élément du décor ou de la pièce (`null` sinon). */
  private drag: {
    readonly id: number;
    /** Élément du décor, ou de la pièce (#188), glissé sur le plan de sa base. */
    readonly target: 'decor' | 'room';
    readonly planeY: number;
    readonly index: number;
    readonly offsetX: number;
    readonly offsetZ: number;
    readonly start: { readonly x: number; readonly y: number };
    moved: boolean;
  } | null = null;
  /**
   * Appui sur un élément du décor en mode édition (#168) : écouté en phase de capture, donc
   * avant `OrbitControls`, coupés pour tout le geste (glisser un élément ne tourne pas la
   * caméra). Un appui dans le vide laisse les contrôles tourner comme avant.
   */
  private readonly onDragPointerDown = (event: PointerEvent) => {
    const listener = this.decorDragListener;
    if (
      !listener ||
      !this.decorDragEnabled ||
      !this.interactive ||
      this.drag ||
      event.button !== 0 ||
      !event.isPrimary
    ) {
      return;
    }
    const pick = this.pickDecor(event.clientX, event.clientY);
    if (pick?.kind !== 'item' && pick?.kind !== 'room-item') {
      return;
    }
    const room = pick.kind === 'room-item' ? this.room.items?.[pick.index] : undefined;
    const center = pick.kind === 'item' ? this.decorLayer.itemPosition(pick.index) : room;
    const roomListener = this.roomDragListener;
    if (!center || (pick.kind === 'room-item' && !(room && roomListener))) {
      return;
    }
    const target = pick.kind === 'item' ? 'decor' : 'room';
    const planeY = room
      ? (room.elevation ?? 0) - clampRoom(this.room).cabinetHeight
      : SAND_THICKNESS;
    const grab = this.planeAt(event.clientX, event.clientY, planeY);
    this.drag = {
      id: event.pointerId,
      target,
      planeY,
      index: pick.index,
      offsetX: grab ? center.x - grab.x : 0,
      offsetZ: grab ? center.z - grab.z : 0,
      start: { x: event.clientX, y: event.clientY },
      moved: false,
    };
    this.controls.enabled = false;
    this.canvas.style.cursor = 'grabbing';
    try {
      this.canvas.setPointerCapture?.(event.pointerId);
    } catch {
      // Pointeur déjà relâché : le glissement s'arrêtera au prochain relâchement.
    }
    (target === 'room' ? (roomListener as DecorDragListener) : listener).start(pick.index);
  };
  private readonly onDragPointerMove = (event: PointerEvent) => {
    const drag = this.drag;
    if (!drag || drag.id !== event.pointerId) {
      return;
    }
    if (!drag.moved && isClick(drag.start, { x: event.clientX, y: event.clientY })) {
      return;
    }
    drag.moved = true;
    const p = this.planeAt(event.clientX, event.clientY, drag.planeY);
    if (p) {
      this.dragListener(drag.target)?.move(drag.index, p.x + drag.offsetX, p.z + drag.offsetZ);
    }
  };
  private readonly onPointerDown = (event: PointerEvent) => {
    this.pendingClick =
      event.button === 0 && event.isPrimary
        ? { id: event.pointerId, x: event.clientX, y: event.clientY }
        : null;
  };
  private readonly onPointerUp = (event: PointerEvent) => {
    if (this.drag?.id === event.pointerId) {
      this.endDrag(true);
    }
    const down = this.pendingClick;
    this.pendingClick = null;
    if (
      !down ||
      down.id !== event.pointerId ||
      !this.interactive ||
      !isClick(down, { x: event.clientX, y: event.clientY })
    ) {
      return;
    }
    for (const listener of this.canvasClickListeners) {
      listener(event.clientX, event.clientY);
    }
    const point = this.pickWaterSurface(event.clientX, event.clientY);
    if (point) {
      for (const listener of this.surfaceClickListeners) {
        listener(point.x, point.z);
      }
    }
  };
  private readonly onPointerCancel = (event: PointerEvent) => {
    this.pendingClick = null;
    if (this.drag?.id === event.pointerId) {
      this.endDrag(false);
    }
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
    // Bulles et diffuseur : seulement dans un environnement qui en a (bac tropical). Masquées,
    // elles ne sont pas posées (`updateVisibleEffects`).
    // Diffuseur à l'échelle du bac (issue #171), comme les bulles de la simulation.
    this.bubbleLayer = new BubbleLayer(
      bubbleSourceFor(this.world.dimensions),
      environmentDataWater(this.world.environment),
    );
    this.bubbleLayer.object.visible = this.world.environment.bubbles;
    const surfaceY = environmentDataWater(this.world.environment).maxY;
    this.waterLight = new WaterLightLayer(
      this.world.dimensions,
      this.world.environment.caustics,
      surfaceY,
    );
    this.lilyPadLayer = new LilyPadLayer(this.world.dimensions, surfaceY);
    this.rainLayer = new RainLayer(environmentDataWater(this.world.environment));
    // Tons propres à l'environnement (eau du récif, ADR 0039) : écartés ailleurs. Après la
    // pluie, dont ils dépendent (tons du ciel couvert, #123).
    this.applyTonePenalties();
    this.floatingLeafLayer = new FloatingLeafLayer(environmentDataWater(this.world.environment));
    this.floatingLeafLayer.object.visible = this.world.environment.floatingLeaves;
    this.effects = [this.bubbleLayer, this.rainLayer, this.floatingLeafLayer];
    this.catappaLayer = new CatappaLayer(environmentDataWater(this.world.environment));
    this.sceneLayers = [
      ...this.fishLayers,
      this.decorLayer,
      this.bubbleLayer,
      this.foodLayer,
      this.waterLight,
      this.lilyPadLayer,
      this.rainLayer,
      this.floatingLeafLayer,
      this.catappaLayer,
      this.roomLayer,
    ];
    for (const layer of this.sceneLayers) {
      this.world.scene.add(layer.object);
    }

    const radius = tankBoundingRadius(this.world.dimensions);
    this.camera = new PerspectiveCamera(CAMERA_FOV_DEG, 1, radius * 0.05, radius * 40);

    this.controls = new OrbitControls(this.camera, options.canvas);
    this.interactive = options.interactive;
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
    // Glissement du décor (#168) : avant `OrbitControls`, qui écoute en phase de bouillonnement.
    options.canvas.addEventListener('pointerdown', this.onDragPointerDown, { capture: true });
    options.canvas.addEventListener('pointermove', this.onDragPointerMove);

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
    if (!(durationSeconds > 0) || !this.interactive) {
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

  /**
   * Caméra automatique du fond d'écran (#279) : pose du préréglage `preset` tournée de
   * `angle` radians autour de la verticale de sa cible (`orbitPose`), cadrée pour le rapport
   * d'aspect courant. Instantané ; annule une transition en cours.
   */
  applyOrbit(preset: CameraPreset, angle: number): void {
    if (this.disposed) {
      return;
    }
    this.transition = null;
    this.preset = preset;
    this.setPose(orbitPose(this.presetPose(preset), angle));
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
      // Sous la pluie, les nénuphars frémissent (issue #106).
      this.lilyPadLayer.update(time, this.rainLayer.isEnabled ? 1 : 0);
      updateVisibleEffects(this.effects, time);
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
   * canvas, hors du bac ou sur la terre émergée du paludarium (#129).
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
    const env = this.world.environment;
    const water = environmentDataWater(env);
    const point = waterSurfacePoint(
      [origin.x, origin.y, origin.z],
      [direction.x, direction.y, direction.z],
      this.world.dimensions,
      water,
    );
    if (point && env.terrain && !terrainAt(point.x, point.z, env.terrain, water).submerged) {
      return null;
    }
    return point;
  }

  /**
   * Cible d'un clic en mode édition du décor (#167) au point de l'écran (`clientX`,
   * `clientY`, pixels CSS) : l'élément de `World.decor` le plus proche touché par le rayon de
   * la caméra, sinon le point du sable visé dans le bac, sinon `null` (hors du canvas, hors du
   * bac). Juste sous les cinq angles de vue : lancer de rayon sur les maillages affichés.
   */
  pickDecor(clientX: number, clientY: number): DecorPick {
    if (this.disposed) {
      return null;
    }
    const ndc = toNormalizedDevice(clientX, clientY, this.canvas.getBoundingClientRect());
    if (!ndc) {
      return null;
    }
    this.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(this.pointerNdc.set(ndc.x, ndc.y), this.camera);
    const index = this.decorLayer.pickItem(this.raycaster);
    if (index !== null) {
      return { kind: 'item', index };
    }
    const { origin: o, direction: d } = this.raycaster.ray;
    const origin: Vec3 = [o.x, o.y, o.z];
    const direction: Vec3 = [d.x, d.y, d.z];
    const point = sandHit(origin, direction, this.world.dimensions);
    // Pièce (#188) : élément ou parquet visé, sauf derrière le sable du bac.
    const room = this.roomLayer.built
      ? pickRoom(origin, direction, this.world.dimensions, this.room)
      : null;
    if (room && room.distance < (point?.distance ?? Infinity)) {
      return room.kind === 'floor'
        ? { kind: 'floor', x: room.x, z: room.z }
        : { kind: 'room-item', index: room.index, x: room.x, z: room.z };
    }
    return point ? { kind: 'sand', x: point.x, z: point.z } : null;
  }

  /**
   * Point du plan horizontal Y = `y` (non borné) sous le point de l'écran, `null` hors du
   * canvas : plan du sable pour le décor, de la base de l'élément pour la pièce.
   */
  private planeAt(clientX: number, clientY: number, y: number): { x: number; z: number } | null {
    const ndc = toNormalizedDevice(clientX, clientY, this.canvas.getBoundingClientRect());
    if (!ndc) {
      return null;
    }
    this.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(this.pointerNdc.set(ndc.x, ndc.y), this.camera);
    const { origin, direction } = this.raycaster.ray;
    const o: Vec3 = [origin.x, origin.y, origin.z];
    const d: Vec3 = [direction.x, direction.y, direction.z];
    return planePoint(o, d, y);
  }

  private dragListener(target: 'decor' | 'room'): DecorDragListener | null {
    return target === 'room' ? this.roomDragListener : this.decorDragListener;
  }

  /**
   * Autorise ou non le glissement des éléments du décor (mode édition, #168). Le couper
   * pendant un glissement l'abandonne (`end` sans `commit`) et rend la main à la caméra.
   */
  setDecorDragEnabled(enabled: boolean): void {
    this.decorDragEnabled = enabled;
    if (!enabled && this.drag) {
      this.endDrag(false);
    }
  }

  /** Abonnement (unique) au glissement du décor (`DecorDragListener`). Renvoie le désabonnement. */
  onDecorDrag(listener: DecorDragListener): () => void {
    this.decorDragListener = listener;
    return () => {
      if (this.decorDragListener === listener) {
        this.decorDragListener = null;
      }
    };
  }

  /**
   * Abonnement (unique) au glissement d'un élément de la pièce (#188) : mêmes appels que
   * `onDecorDrag`, (x, z) visés sur le plan de la base de l'élément. Renvoie le désabonnement.
   */
  onRoomDrag(listener: DecorDragListener): () => void {
    this.roomDragListener = listener;
    return () => {
      if (this.roomDragListener === listener) {
        this.roomDragListener = null;
      }
    };
  }

  /** Vrai pendant le glissement d'un élément du décor (tests). */
  get decorDragging(): boolean {
    return this.drag !== null;
  }

  /** Aperçu du glissement : l'élément `index` affiché en (x, z), sans reconstruire le décor. */
  previewDecorMove(index: number, x: number, z: number): void {
    if (!this.disposed) {
      this.decorLayer.moveItem(index, x, z);
    }
  }

  /**
   * Image de la chute (ADR 0046) : la base de l'élément `index` affichée en (`x`, `y`, `z`),
   * repère du bac, sans reconstruire le décor.
   */
  previewDecorPose(index: number, x: number, y: number, z: number): void {
    if (!this.disposed) {
      this.decorLayer.placeItem(index, x, y, z);
    }
  }

  /** Termine le glissement en cours : caméra rendue, abonné prévenu. */
  private endDrag(commit: boolean): void {
    const drag = this.drag;
    if (!drag) {
      return;
    }
    this.drag = null;
    this.controls.enabled = this.interactive && !this.disposed;
    this.canvas.style.cursor = '';
    try {
      this.canvas.releasePointerCapture?.(drag.id);
    } catch {
      // Capture déjà relâchée par le navigateur.
    }
    this.dragListener(drag.target)?.end(drag.index, commit && drag.moved);
  }

  /** Sélectionne l'élément d'indice `index` de `World.decor` (contour clair), ou aucun. */
  setDecorSelection(index: number | null): void {
    if (!this.disposed) {
      this.decorLayer.setSelected(index);
    }
  }

  /** Indice de l'élément de décor sélectionné, `null` sinon (tests). */
  get decorSelection(): number | null {
    return this.decorLayer.selectedIndex;
  }

  /**
   * Abonnement à tout clic (sans glisser, bouton principal) sur le canvas, avec le point de
   * l'écran (pixels CSS) ; jamais appelé si les contrôles sont inactifs (mode capture).
   * Renvoie le désabonnement.
   */
  onCanvasClick(listener: (clientX: number, clientY: number) => void): () => void {
    this.canvasClickListeners.add(listener);
    return () => this.canvasClickListeners.delete(listener);
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
   * Sous la pluie, ciel couvert (issue #123, ADR 0082) : lumières, eau et teinte du décor
   * multipliées par `overcastBrightness`, pénalités des tons de nuit et du soir inchangées.
   * Sans effet sur la caméra, le filtre et le reste de la scène.
   */
  updateLight(light: DayLight): void {
    if (!this.disposed) {
      this.light.intensity = light.intensity;
      for (let k = 0; k < 3; k++) {
        this.light.tint[k] = light.tint[k];
        this.light.sky[k] = light.sky[k];
      }
      this.applyLight();
    }
  }

  /** Applique `this.light` et le ciel couvert de la pluie courante. */
  private applyLight(): void {
    const light = this.light;
    const overcast = overcastBrightness(this.rainLayer.isEnabled);
    this.world.setOvercast(overcast);
    this.world.setDaylight(light);
    this.waterLight.setDaylight(light.intensity);
    // Poissons, bulles, gouttes et granulés (couleurs plates) gardent leur clarté : vus à
    // travers l'eau assombrie, et des koïs ou des gouttes assombris changeraient de couleur.
    const brightness = flatBrightness(light.intensity);
    for (const layer of this.fishLayers) {
      layer.setBrightness(brightness);
    }
    for (const layer of this.effects) {
      layer.setBrightness(brightness);
    }
    this.foodLayer.setBrightness(brightness);
    this.catappaLayer.setBrightness(brightness);
    const tint = decorTintInto(light.intensity, this.decorTint);
    for (let k = 0; k < 3; k++) {
      tint[k] *= overcast;
    }
    this.decorLayer.setTint(tint);
    this.lilyPadLayer.setTint(tint);
    // Pénalités tirées de la seule intensité du jour : jamais de tons du soir à midi.
    const penalties = tonePenaltiesInto(light.intensity, this.penalties);
    this.pixelPass.setTonePenalties(penalties.night, penalties.twilight);
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
   * Affiche le décor du monde (`World.decor`), ses coraux, ses bulles et ses nénuphars, tirés de la graine
   * du monde (`World.seed`) : à appeler une fois par monde.
   */
  setDecor(items: readonly DecorItem[], seed: number): void {
    if (!this.disposed) {
      const env = this.world.environment;
      // Mêmes coraux et anémones que les obstacles du monde (`createWorld`) : même graine,
      // même décor.
      const { corals, anemones } = seededFeatures(seed, env.id, items);
      this.decorLayer.setDecor(items, corals, anemones);
      for (const layer of this.effects) {
        layer.setSeed(seed);
      }
      this.lilyPadLayer.setPads(lilyPadLayout(seed, environmentDataWater(env), env.lilyPads));
    }
  }

  /**
   * Remplace les seuls éléments du décor affichés (édition du décor, #167), sans toucher aux
   * effets tirés de la graine (bulles, nénuphars) ; la sélection est effacée.
   */
  replaceDecorItems(items: readonly DecorItem[], seed: number): void {
    if (!this.disposed) {
      const { corals, anemones } = seededFeatures(seed, this.world.environment.id, items);
      this.decorLayer.setDecor(items, corals, anemones);
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

  /** Pénalités des tons d'environnement, fixées par l'environnement de la vue (tests). */
  get environmentTonePenalties(): readonly number[] {
    return this.pixelPass.environmentPenalties;
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

  /**
   * Affiche ou masque la pièce autour du bac (sol, mur, meuble support, issue #187), aux
   * dimensions du bac de la vue. Sans effet hors d'un environnement qui en a une
   * (`isRoomAvailable`) : rien n'y est jamais construit.
   */
  setRoom(room: Room): void {
    if (!this.disposed) {
      this.room = room;
      this.previewRoom(room);
    }
  }

  /**
   * Aperçu du glissement d'un élément de la pièce (#188) : `room` dessinée sans changer celle
   * du choix à la souris (`setRoom`), sélection gardée.
   */
  previewRoom(room: Room): void {
    if (!this.disposed) {
      this.roomLayer.setRoom(
        this.world.dimensions,
        room,
        isRoomAvailable(this.world.environment.id),
        this.roomLayout,
      );
    }
  }

  /**
   * Meubles supports et bacs posés de la pièce de N bacs (#305, lot 2b), en blocs
   * (`roomLayoutBlocks`) : redessinés avec la pièce courante, seulement si elle est affichée.
   */
  setRoomLayout(blocks: readonly RoomBlock[]): void {
    if (!this.disposed) {
      this.roomLayout = blocks;
      this.previewRoom(this.room);
    }
  }

  /** Sélectionne l'élément d'indice `index` de la pièce (contour clair, #188), ou aucun. */
  setRoomSelection(index: number | null): void {
    if (!this.disposed) {
      this.roomLayer.setSelected(index);
    }
  }

  /** Indice de l'élément de la pièce sélectionné et dessiné, `null` sinon (tests). */
  get roomSelection(): number | null {
    return this.roomLayer.selectedIndex;
  }

  /** Vrai si la pièce est construite (tests). */
  get roomShown(): boolean {
    return this.roomLayer.built;
  }

  /** Nombre de blocs de la pièce (tests). */
  get roomBlockCount(): number {
    return this.roomLayer.count;
  }

  /** Vrai si le mur de la pièce est affiché au dernier rendu (tests). */
  get roomWallVisible(): boolean {
    return this.roomLayer.wallVisible;
  }

  /**
   * Fait pleuvoir (`true`) ou arrête la pluie (issue #106) : gouttes, ronds à la surface et
   * nénuphars qui frémissent, au temps simulé de `updateDecor`. Sans effet dans un
   * environnement sans pluie (`Environment.rain`). Renvoie l'état appliqué.
   */
  setRain(enabled: boolean): boolean {
    if (!this.disposed && this.world.environment.rain) {
      const changed = this.rainLayer.isEnabled !== enabled;
      this.rainLayer.setEnabled(enabled);
      if (changed) {
        this.applyLight();
        this.applyTonePenalties();
      }
    }
    return this.rainLayer.isEnabled;
  }

  /**
   * Trouble de l'eau (issue #207, `waterTurbidity`), dans [0, 1] : teinte seulement, aucun
   * passage de rendu en plus. Sans effet si la valeur n'a pas changé ou après `dispose`.
   * @throws RangeError si `turbidity` n'est pas un réel dans [0, 1].
   */
  setWaterTurbidity(turbidity: number): void {
    if (!this.disposed && turbidity !== this.world.turbidity) {
      this.world.setTurbidity(turbidity);
    }
  }

  /**
   * Teinte brun-thé des feuilles de catappa (issue #239, `catappaTint`), 0 ou 1 : teinte
   * seulement. Sans effet si la valeur n'a pas changé ou après `dispose`.
   * @throws RangeError si `tea` n'est pas un réel dans [0, 1].
   */
  setWaterTea(tea: number): void {
    if (!this.disposed && tea !== this.world.tea) {
      this.world.setTea(tea);
      this.applyTonePenalties();
    }
  }

  /**
   * Tons d'environnement proposés à la passe (ADR 0039) : ceux de l'environnement, plus les
   * tons de l'eau brun-thé (`TEA_TONES`) quand elle est teintée (issue #239), et ceux du ciel
   * couvert (`RAIN_TONES`) sous la pluie (issue #123).
   */
  private applyTonePenalties(): void {
    const tones = [...this.world.environment.tones];
    if (this.world.tea > 0) {
      tones.push(...TEA_TONES);
    }
    if (this.rainLayer.isEnabled) {
      tones.push(...RAIN_TONES);
    }
    this.pixelPass.setEnvironmentPenalties(environmentTonePenalties(tones));
  }

  /**
   * Feuilles de catappa posées sur le sol (issue #239) : une par réserve de `leaves`
   * (`WaterState.catappa`), plus sombre une fois épuisée. Sans effet après `dispose`.
   */
  setCatappa(leaves: readonly number[] | undefined): void {
    if (!this.disposed) {
      this.catappaLayer.setLeaves(leaves);
    }
  }

  /** Feuilles de catappa affichées, puis celles qui sont épuisées (tests). */
  get catappaCounts(): readonly [number, number] {
    return [this.catappaLayer.count, this.catappaLayer.spentCount];
  }

  /** Teinte brun-thé appliquée (tests). */
  get waterTea(): number {
    return this.world.tea;
  }

  /** Trouble de l'eau appliqué (tests). */
  get waterTurbidity(): number {
    return this.world.turbidity;
  }

  /** Vrai s'il pleut. */
  get raining(): boolean {
    return this.rainLayer.isEnabled;
  }

  /** Nom de chaque couche d'effet (`EffectLayer`), dans l'ordre où la vue les parcourt (tests). */
  get effectLayerNames(): readonly string[] {
    return this.effects.map((layer) => layer.object.name);
  }

  /** Vrai si les ronds de pluie sont tracés pour une vue de biais (tests). */
  get rainObliqueView(): boolean {
    return this.rainLayer.obliqueView;
  }

  /** Gouttes en l'air et ronds à la surface posés par le dernier `updateDecor` (tests). */
  get rainCounts(): readonly [number, number] {
    return [this.rainLayer.dropCount, this.rainLayer.rippleCount];
  }

  /** Feuilles mortes posées par le dernier `updateDecor` (tests). */
  get floatingLeafCount(): number {
    return this.floatingLeafLayer.object.visible ? this.floatingLeafLayer.count : 0;
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

  /** Nombre d'anémones affichées (tests). */
  get anemoneCount(): number {
    return this.decorLayer.anemoneCount;
  }

  /** Nombre de colonies de corail affichées (tests). */
  get coralCount(): number {
    return this.decorLayer.coralCount;
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
    // Pièce (#187, #324) : rien ne cache le bac, la caméra passât-elle sous le bac ou hors de
    // la pièce (chaque mur franchi et le plafond sont masqués).
    this.roomLayer.setViewpoint(
      this.camera.position.y,
      this.camera.position.z,
      this.camera.position.x,
    );
    // Taille des granulés selon le zoom (#117) : échelle à la distance de la cible.
    this.foodLayer.setPixelsPerMeter(
      scenePixelsPerMeter(
        this.camera.position.distanceTo(this.controls.target),
        this.camera.fov,
        this.targetSize.height,
      ),
    );
    // Ronds de pluie vus de biais (#125) : rond extérieur seul, plus clair.
    this.rainLayer.setObliqueView(isObliqueView(this.cameraPosition(), this.cameraTarget()));
    if (this.currentFilter === 'aucun') {
      this.decorLayer.setResolution(this.width * this.pixelRatio, this.height * this.pixelRatio);
      this.roomLayer.setResolution(this.width * this.pixelRatio, this.height * this.pixelRatio);
      this.lilyPadLayer.setResolution(this.width * this.pixelRatio, this.height * this.pixelRatio);
      this.floatingLeafLayer.setResolution(
        this.width * this.pixelRatio,
        this.height * this.pixelRatio,
      );
      // Sans filtre, une bulle garde la taille d'un pixel de scène du mode pixel art.
      this.bubbleLayer.setPointScale(PIXEL_SIZE * this.pixelRatio);
      this.foodLayer.setPointScale(PIXEL_SIZE * this.pixelRatio);
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.world.scene, this.camera);
      return true;
    }
    this.decorLayer.setResolution(this.targetSize.width, this.targetSize.height);
    this.roomLayer.setResolution(this.targetSize.width, this.targetSize.height);
    this.lilyPadLayer.setResolution(this.targetSize.width, this.targetSize.height);
    this.floatingLeafLayer.setResolution(this.targetSize.width, this.targetSize.height);
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
    this.canvas.removeEventListener('pointerdown', this.onDragPointerDown, { capture: true });
    this.canvas.removeEventListener('pointermove', this.onDragPointerMove);
    this.drag = null;
    this.decorDragListener = null;
    this.roomDragListener = null;
    this.surfaceClickListeners.clear();
    this.canvasClickListeners.clear();
    this.controls.dispose();
    for (const layer of this.sceneLayers) {
      layer.dispose();
    }
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
