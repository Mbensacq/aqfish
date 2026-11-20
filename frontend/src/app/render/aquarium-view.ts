import {
  PerspectiveCamera,
  Raycaster,
  Vector2,
  Vector3,
  type Camera,
  type Scene,
  WebGLRenderer,
  type WebGLRenderTarget,
} from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import type { CameraPreset } from '../core/capture/capture-params';
import { DEFAULT_RENDER_FILTER, type RenderFilter } from '../core/render-filter/render-filter';
import type { FoodStyle } from '../core/food-style/food-style';
import { createAquariumScene, type AquariumScene } from './aquarium-scene';
import {
  CAMERA_FOV_DEG,
  tankBoundingRadius,
  type TankDimensions,
  type Vec3,
} from './camera-presets';
import { SPECIES, speciesVariants, type SpeciesId } from '../sim/species';
import type { Fish } from '../sim/swimmer';
import type { AlgaePatch } from '../sim/algae';
import type { TankFouling } from '../sim/fouling';
import type { Egg } from '../sim/eggs';
import { createDayLight, type DayLight } from '../sim/daylight';
import { bubbleSourceFor } from '../sim/bubbles';
import { environmentDataWater, type Environment } from '../sim/environment';
import { terrainAt } from '../sim/terrain';
import { flowerOpenness, lilyPadLayout } from '../sim/lily-pads';
import { seededFeatures } from '../sim/world';
import type { DecorItem } from '../sim/decor';
import type { FoodPellet } from '../sim/food';
import { clampRoom, DEFAULT_ROOM, isRoomAvailable, type Room, type RoomBlock } from '../sim/room';
import type { Box3 } from '../sim/tank';
import { BubbleLayer } from './bubble-layer';
import { AlertHighlightLayer } from './alert-highlight-layer';
import { AlgaeLayer } from './algae-layer';
import { FoulingLayer } from './fouling-layer';
import { CatappaLayer } from './catappa-layer';
import { FeederLayer } from './feeder-layer';
import { DecorLayer } from './decor-layer';
import { planePoint, sandHit, type DecorPick } from './decor-pick';
import { pickRoom } from './room-pick';
import { type EffectLayer, type SceneLayer, updateVisibleEffects } from './effect-layer';
import { CurrentIndicatorLayer } from './current-indicator-layer';
import { FloatingLeafLayer } from './floating-leaf-layer';
import { FishLayer, MAX_FISH_PER_SPECIES, type BehaviorFrame } from './fish-layer';
import { EggLayer } from './egg-layer';
import { FoodLayer } from './food-layer';
import { scenePixelsPerMeter } from './food-size';
import { LilyPadLayer } from './lily-pad-layer';
import { overcastBrightness, RAIN_OVERCAST_BRIGHTNESS, RAIN_TONES, stepOvercast } from './overcast';
import { isObliqueView, RainLayer } from './rain-layer';
import { RoomLayer } from './room-layer';
import type { FreeCameraInput, FreeCameraState } from './free-camera';
import {
  CameraController,
  createOrbitControls,
  type CameraHost,
  type ImmersiveCamera,
} from './camera-controller';
import { DragController, type DecorDragListener, type DragHost } from './drag-controller';
import type { StrokePoint } from './stroke';
import { toNormalizedDevice, waterSurfacePoint } from './food-pick';
import {
  decorTintInto,
  flatBrightness,
  type MutableTint,
  tonePenaltiesInto,
  type TonePenalties,
} from './night-shade';
import { environmentTonePenalties, PalettePass } from './palette-pass';
import { DirectPass } from './direct-pass';
import { PIXEL_SIZE, type Size } from './pixel-art';
import type { PhotoPixels } from './photo-capture';
import { WaterLightLayer } from './water-light';
import { LightRaysLayer, LIGHT_RAY_ENVIRONMENTS } from './light-rays-layer';
import { createLightRays, lightRaysInto } from '../sim/light-rays';
import { DecorClock } from './decor-clock';
import {
  FULL_MOTION,
  motionFactors,
  type MotionFactors,
} from '../core/reduced-motion/reduced-motion';

/**
 * Sous-ensemble de `WebGLRenderer` utilisé par la vue. Permet de remplacer le renderer
 * par un double dans les tests unitaires (jsdom n'a pas WebGL, voir docs/PIEGES.md).
 */
export interface AquariumRenderer {
  setPixelRatio(ratio: number): void;
  setSize(width: number, height: number, updateStyle?: boolean): void;
  setRenderTarget(target: WebGLRenderTarget | null): void;
  render(scene: Scene, camera: Camera): void;
  /**
   * Relit les pixels d'une cible (photo, #479). Facultatif : un double de test peut s'en
   * passer, la photo est alors refusée.
   */
  readRenderTargetPixels?(
    target: WebGLRenderTarget,
    x: number,
    y: number,
    width: number,
    height: number,
    buffer: Uint8Array,
  ): void;
  dispose(): void;
}

export type AquariumRendererFactory = (canvas: HTMLCanvasElement) => AquariumRenderer;

/** Tons d'environnement de l'eau teintée par les feuilles de catappa (issue #239). */
export const TEA_TONES: readonly string[] = ['eauThe', 'eauTheClaire'];

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

export type { DecorDragListener } from './drag-controller';
export type { ImmersiveCamera } from './camera-controller';
export { ORBIT_MOUSE_ACTIONS, ORBIT_TOUCH_ACTIONS } from './camera-controller';
export { STROKE_STEP_PX, strokePoints, type StrokePoint } from './stroke';

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
  /** Cible pleine résolution du mode sans filtre (#40, ADR 0101). */
  private readonly directPass = new DirectPass();
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
  /** Repère du sens du courant (issue #460), masqué courant coupé. */
  private readonly currentLayer: CurrentIndicatorLayer;
  /** Granulés de nourriture (issue #67), posés par `updateFood`. */
  private readonly foodLayer = new FoodLayer();
  /** Œufs des corydoras (issue #478) : masqués tant qu'il n'y en a aucun. */
  private readonly eggLayer = new EggLayer();
  /** Caustiques sur le sable et reflet de surface (ADR 0017). */
  private readonly waterLight: WaterLightLayer;
  /** Rayons de lumière dans l'eau (issue #567, ADR 0134). */
  private readonly lightRaysLayer: LightRaysLayer;
  /** Heure des rayons (`updateLightRays`) et tampon des rayons, réutilisé. */
  private raysHour = 12;
  private readonly rays = createLightRays();
  /** Nénuphars (issue #103), tirés de la graine fixée par `setDecor`. */
  private readonly lilyPadLayer: LilyPadLayer;
  /** Pluie (issue #106), possible dans un environnement qui en a (`Environment.rain`). */
  private readonly rainLayer: RainLayer;
  /**
   * Facteur de ciel couvert appliqué (ADR 0082) : `overcastBrightness` de la pluie courante,
   * ou en route vers lui pendant un fondu (`setRain(…, true)`, `stepOvercast`, issue #338).
   */
  private overcast = 1;
  /** Lumière gardée au fond sous les plantes hautes (issue #477, `plantShade`), 1 sans ombre. */
  private plantShade = 1;
  /** Feuilles mortes flottantes (issue #107), dans un environnement qui en a. */
  private readonly floatingLeafLayer: FloatingLeafLayer;
  /** Feuilles de catappa sur le sol (issue #239). */
  private readonly catappaLayer: CatappaLayer;
  /** Distributeur de nourriture automatique, sur le bord du bac (issue #583). */
  private readonly feederLayer: FeederLayer;
  /** Plaques d'algues sur les vitres (issue #476). */
  private readonly algaeLayer = new AlgaeLayer();
  private readonly foulingLayer = new FoulingLayer();
  /** Repères des animaux désignés par une alerte (#483), masqués par défaut. */
  private readonly alertHighlightLayer = new AlertHighlightLayer();
  /**
   * Effets animés au contrat commun `EffectLayer` (issue #125) : bulles, pluie, puis feuilles
   * mortes. Parcourus
   * par `updateDecor`, `updateLight`, `setDecor` et `dispose`.
   */
  private readonly effects: readonly EffectLayer[];
  /** Toutes les couches, dans l'ordre d'ajout à la scène (et de libération). */
  private readonly sceneLayers: readonly SceneLayer[];
  /** Lancer de rayon de `pickDecor`, réutilisé. */
  private readonly raycaster = new Raycaster();
  /** Point visé en coordonnées normalisées, réutilisé par chaque lancer de rayon (#178). */
  private readonly pointerNdc = new Vector2();
  /** Contrôles à la souris demandés (faux en mode capture) ; coupés le temps d'un glissement. */
  private readonly interactive: boolean;
  /** Pièce construite par `setRoom` (choix à la souris), hors aperçu d'un glissement. */
  private room: Room = DEFAULT_ROOM;
  /** Blocs des meubles supports et des bacs posés (`setRoomLayout`, #305). */
  private roomLayout: readonly RoomBlock[] = [];
  /** Clics, glisser du décor et de la pièce, passage de raclette (#698). */
  private readonly pointer: DragController;
  private readonly pixelRatio: number;
  private width = 0;
  private height = 0;
  private currentFilter: RenderFilter;
  /** Taille de la cible basse résolution (tenue à jour dans les deux modes). */
  private targetSize: Size = { width: 1, height: 1 };
  private disposed = false;
  /** Facteurs des mouvements décoratifs (#406) : `FULL_MOTION` sauf mouvements réduits. */
  private motion: MotionFactors = FULL_MOTION;
  /** Contexte des gestes passé aux couches de poissons, réécrit par `updateFish` (#433). */
  private readonly behaviorFrame: { -readonly [K in keyof BehaviorFrame]: BehaviorFrame[K] } = {
    time: 0,
    landedFood: false,
    motion: 1,
  };
  /** Horloges de l'eau et de la pluie (#409) : ralenties sans saut de phase à la bascule. */
  private readonly waterClock = new DecorClock();
  private readonly rainClock = new DecorClock();
  /** Horloge des rayons de lumière (#567) : arrêtée si mouvements réduits (rayons fixes). */
  private readonly raysClock = new DecorClock();
  /** Dernier temps simulé passé à `updateDecor` : instant de bascule des horloges. */
  private decorTime = 0;
  /** Temps propre d'un effet (`updateVisibleEffects`) : pluie ralentie si mouvements réduits. */
  private readonly effectTime = (layer: EffectLayer, time: number): number =>
    layer === this.rainLayer ? this.rainClock.at(time) : time;
  /** Caméra : préréglages, transitions, caméra libre et mode immersif (#698). */
  private readonly cameras: CameraController;

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
    this.lightRaysLayer = new LightRaysLayer(
      this.world.dimensions,
      LIGHT_RAY_ENVIRONMENTS.includes(this.world.environment.id),
      surfaceY,
    );
    this.lilyPadLayer = new LilyPadLayer(this.world.dimensions, surfaceY);
    this.rainLayer = new RainLayer(environmentDataWater(this.world.environment));
    // Tons propres à l'environnement (eau du récif, ADR 0039) : écartés ailleurs. Après la
    // pluie, dont ils dépendent (tons du ciel couvert, #123).
    this.applyTonePenalties();
    this.floatingLeafLayer = new FloatingLeafLayer(environmentDataWater(this.world.environment));
    this.floatingLeafLayer.object.visible = this.world.environment.floatingLeaves;
    this.currentLayer = new CurrentIndicatorLayer(environmentDataWater(this.world.environment));
    this.effects = [this.bubbleLayer, this.rainLayer, this.floatingLeafLayer, this.currentLayer];
    this.catappaLayer = new CatappaLayer(environmentDataWater(this.world.environment));
    this.feederLayer = new FeederLayer(this.world.dimensions);
    this.sceneLayers = [
      ...this.fishLayers,
      this.decorLayer,
      this.bubbleLayer,
      this.foodLayer,
      this.eggLayer,
      this.waterLight,
      this.lightRaysLayer,
      this.lilyPadLayer,
      this.rainLayer,
      this.floatingLeafLayer,
      this.currentLayer,
      this.catappaLayer,
      this.feederLayer,
      this.algaeLayer,
      this.foulingLayer,
      this.alertHighlightLayer,
      this.roomLayer,
    ];
    for (const layer of this.sceneLayers) {
      this.world.scene.add(layer.object);
    }

    const radius = tankBoundingRadius(this.world.dimensions);
    this.camera = new PerspectiveCamera(CAMERA_FOV_DEG, 1, radius * 0.05, radius * 40);
    this.interactive = options.interactive;
    // Contrôles d'abord : leur `pointerdown` passe avant les gestes de la vue (docs/PIEGES.md).
    this.controls = createOrbitControls(
      this.camera,
      options.canvas,
      this.world.dimensions,
      options.interactive,
    );
    // Gestes du canvas (#698) : clics, glisser et raclette, puis caméra libre, dans cet ordre.
    this.pointer = new DragController(this.dragHost());
    this.cameras = new CameraController(this.cameraHost(), options.preset);
  }

  /** Accès des gestes du pointeur à la vue (`DragController`). */
  private dragHost(): DragHost {
    return {
      canvas: this.canvas,
      controls: this.controls,
      interactive: this.interactive,
      orbitAllowed: () => this.interactive && !this.disposed && !this.cameras.freeCameraActive,
      pickDecor: (x, y) => this.pickDecor(x, y),
      pickWaterSurface: (x, y) => this.pickWaterSurface(x, y),
      planeAt: (x, y, planeY) => this.planeAt(x, y, planeY),
      decorItemPosition: (index) => this.decorLayer.itemPosition(index),
      room: () => this.room,
    };
  }

  /** Accès de la caméra à la vue (`CameraController`). */
  private cameraHost(): CameraHost {
    return {
      camera: this.camera,
      controls: this.controls,
      canvas: this.canvas,
      dimensions: this.world.dimensions,
      interactive: this.interactive,
      dragging: () => this.pointer.dragging,
      stroking: () => this.pointer.stroking,
      cancelClick: () => this.pointer.cancelClick(),
      roomBuilt: () => this.roomLayer.built,
      cabinetHeight: () => clampRoom(this.room).cabinetHeight,
      hasSize: () => this.hasSize(),
      updateAspect: () => this.updateAspect(),
    };
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
    this.cameras.applyPreset(preset);
  }

  /**
   * Amène la caméra sur un préréglage par une transition de `durationSeconds`, avancée par
   * `stepCameraTransition` (donc par la boucle de rendu, pas par une minuterie). Une durée
   * nulle ou des contrôles inactifs (mode capture, contrat déterministe) : placement instantané.
   */
  animateToPreset(preset: CameraPreset, durationSeconds: number): void {
    this.cameras.animateToPreset(preset, durationSeconds);
  }

  /**
   * Caméra automatique du fond d'écran (#279) : pose du préréglage `preset` tournée de
   * `angle` radians autour de la verticale de sa cible (`orbitPose`), cadrée pour le rapport
   * d'aspect courant. Instantané ; annule une transition en cours. Appelé à chaque image :
   * aucune allocation tant que préréglage, taille et bac ne changent pas (#332).
   */
  applyOrbit(preset: CameraPreset, angle: number): void {
    this.cameras.applyOrbit(preset, angle);
  }

  /** Vrai pendant une transition de caméra. */
  get transitioning(): boolean {
    return this.cameras.transitioning;
  }

  /**
   * Avance la transition de caméra de `dtSeconds`. Renvoie `true` si la caméra a bougé.
   * La pose d'arrivée est recalculée à chaque pas : un redimensionnement en cours de route
   * reste cadré. À la fin, la caméra suit de nouveau le préréglage.
   */
  stepCameraTransition(dtSeconds: number): boolean {
    return this.cameras.stepCameraTransition(dtSeconds);
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
      this.cameras.reframe();
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
  updateFish(
    entities: readonly Fish[],
    alpha: number,
    seed = 0,
    behavior: { readonly time: number; readonly landedFood: boolean } | null = null,
    dead?: readonly Fish[],
  ): void {
    if (this.disposed) {
      return;
    }
    // Gestes des comportements (#427) : leur part mobile suit « Réduire les mouvements ».
    // Objet de l'instance réécrit à chaque appel (#433) : aucune allocation par image.
    let frame: BehaviorFrame | null = null;
    if (behavior !== null) {
      const reused = this.behaviorFrame;
      reused.time = behavior.time;
      reused.landedFood = behavior.landedFood;
      reused.motion = this.motion.behaviorGesture;
      frame = reused;
    }
    for (const layer of this.fishLayers) {
      // Corps (#582) après les vivants, grisés et retournés.
      layer.update(entities, alpha, seed, frame, dead);
    }
    this.alertHighlightLayer.update(entities, alpha);
  }

  /** Met en évidence les animaux `ids` (#483) ; vide : aucun. */
  setAlertHighlight(ids: readonly number[]): void {
    if (!this.disposed) {
      this.alertHighlightLayer.setAnimals(ids);
    }
  }

  /**
   * Pose le décor animé (plantes qui ondulent, bulles, caustiques, reflet de surface) au
   * temps simulé `time`, en secondes : jamais l'horloge murale (contrat de capture). À
   * appeler avant `renderFrame()`.
   */
  updateDecor(time: number): void {
    if (!this.disposed) {
      // Mouvements réduits (#406) : plantes moins amples, eau et pluie plus lentes, par des
      // horloges propres (#409) : la bascule ne fait pas sauter la phase. Sans bascule, les
      // horloges rendent exactement le temps simulé (rendu inchangé).
      this.decorTime = time;
      const waterTime = this.waterClock.at(time);
      this.decorLayer.update(time, this.motion.plantSway);
      // Sous la pluie, les nénuphars frémissent (issue #106).
      this.lilyPadLayer.update(waterTime, this.rainLayer.isEnabled ? 1 : 0);
      updateVisibleEffects(this.effects, time, this.effectTime);
      this.waterLight.update(waterTime);
      this.lightRaysLayer.update(this.raysClock.at(time));
    }
  }

  /**
   * Réduit les mouvements décoratifs (`true`, #406, `core/reduced-motion`) ou les rétablit :
   * effet au prochain `updateDecor`. N'agit que sur le rendu, jamais sur le monde.
   */
  setReducedMotion(reduced: boolean): void {
    this.motion = motionFactors(reduced);
    this.currentLayer.setStill(reduced);
    this.waterClock.setRate(this.motion.waterWave, this.decorTime);
    this.rainClock.setRate(this.motion.rainSpeed, this.decorTime);
    this.raysClock.setRate(this.motion.lightRays, this.decorTime);
  }

  /** Vrai si les mouvements décoratifs sont réduits. */
  get reducedMotion(): boolean {
    return this.motion !== FULL_MOTION;
  }

  /** Temps des rayons de lumière posé par le dernier `updateDecor`, ramené à la période. */
  get lightRaysTime(): number {
    return this.lightRaysLayer.time;
  }

  /** Force des rayons de lumière appliquée (0 la nuit ; 0 aussi s'ils sont masqués). */
  get lightRaysStrength(): number {
    return this.lightRaysLayer.object.visible ? this.lightRaysLayer.raysStrength : 0;
  }

  /** Temps des caustiques et du reflet posé par le dernier `updateDecor` (tests). */
  get waterLightTime(): number {
    return this.waterLight.time;
  }

  /** Pose les granulés de nourriture du monde (`World.food`). À appeler avant `renderFrame()`. */
  updateFood(food: readonly FoodPellet[]): void {
    if (!this.disposed) {
      this.foodLayer.update(food);
    }
  }

  /**
   * Pose les œufs du monde (`World.eggs`, issue #478), `hatchTime` étant la durée
   * d'incubation (teinte des œufs mûrs). À appeler avant `renderFrame()`.
   */
  updateEggs(eggs: readonly Egg[] | undefined, hatchTime: number): void {
    if (!this.disposed) {
      this.eggLayer.update(eggs, hatchTime);
    }
  }

  /** Nombre d'œufs posés par le dernier `updateEggs` (tests). */
  get eggCount(): number {
    return this.eggLayer.count;
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

  /**
   * Autorise ou non le glissement des éléments du décor (mode édition, #168). Le couper
   * pendant un glissement l'abandonne (`end` sans `commit`) et rend la main à la caméra.
   */
  setDecorDragEnabled(enabled: boolean): void {
    this.pointer.setDecorDragEnabled(enabled);
  }

  /**
   * Autorise ou non le passage de raclette (#604) : tant qu'il est autorisé, glisser le
   * pointeur principal sur le canvas transmet ses points à `onStroke` au lieu de tourner la
   * caméra. Le couper pendant un passage l'arrête et rend la main à la caméra.
   */
  setStrokeEnabled(enabled: boolean): void {
    this.pointer.setStrokeEnabled(enabled);
  }

  /** Vrai pendant un passage de raclette (tests). */
  get stroking(): boolean {
    return this.pointer.stroking;
  }

  /**
   * Abonnement (unique) aux points d'un passage de raclette (#604), en pixels CSS, appui
   * compris : un appel par événement du pointeur, avec ses points dans l'ordre du geste
   * (jamais vide). Renvoie le désabonnement.
   */
  onStroke(listener: (points: readonly StrokePoint[]) => void): () => void {
    return this.pointer.onStroke(listener);
  }

  /** Abonnement (unique) au glissement du décor (`DecorDragListener`). Renvoie le désabonnement. */
  onDecorDrag(listener: DecorDragListener): () => void {
    return this.pointer.onDecorDrag(listener);
  }

  /**
   * Abonnement (unique) au glissement d'un élément de la pièce (#188) : mêmes appels que
   * `onDecorDrag`, (x, z) visés sur le plan de la base de l'élément. Renvoie le désabonnement.
   */
  onRoomDrag(listener: DecorDragListener): () => void {
    return this.pointer.onRoomDrag(listener);
  }

  /** Vrai pendant le glissement d'un élément du décor (tests). */
  get decorDragging(): boolean {
    return this.pointer.dragging;
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
    return this.pointer.onCanvasClick(listener);
  }

  /**
   * Abonnement au clic (sans glisser, bouton principal) sur la surface de l'eau, avec le
   * point visé (x, z) dans le repère du bac. Jamais appelé si les contrôles sont inactifs
   * (mode capture) ni pour un clic hors du bac. Renvoie le désabonnement.
   */
  onSurfaceClick(listener: (x: number, z: number) => void): () => void {
    return this.pointer.onSurfaceClick(listener);
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
    const overcast = this.overcast;
    this.world.setOvercast(overcast);
    this.world.setDaylight(light);
    this.waterLight.setDaylight(light.intensity);
    this.applyLightRays();
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
    this.eggLayer.setBrightness(brightness);
    this.catappaLayer.setBrightness(brightness);
    this.feederLayer.setBrightness(brightness);
    this.algaeLayer.setBrightness(brightness);
    this.foulingLayer.setBrightness(brightness);
    const tint = decorTintInto(light.intensity, this.decorTint);
    for (let k = 0; k < 3; k++) {
      tint[k] *= overcast;
    }
    // Ombre des plantes hautes (#477, #494) : sur tout le décor posé au fond (plantes, rochers,
    // bois, une seule matière), ni sur les animaux ni sur l'eau ; × 1 sans ombre.
    this.decorLayer.setTint(tint, this.plantShade);
    this.lilyPadLayer.setTint(tint, light.intensity, overcast);
    this.roomLayer.setDaylight(light, overcast);
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

  /**
   * Oriente les rayons de lumière selon l'heure `hour` (`sim/light-rays.ts`, issue #567) : à
   * appeler avec `updateLight`, à la même heure. Le ciel couvert de la pluie les atténue.
   * @throws RangeError si `hour` n'est pas un réel fini.
   */
  updateLightRays(hour: number): void {
    if (!this.disposed) {
      lightRaysInto(hour, 0, this.rays);
      this.raysHour = hour;
      this.applyLightRays();
    }
  }

  /** Rayons de l'heure `raysHour` sous le ciel couvert courant (1 − facteur, ramené à [0, 1]). */
  private applyLightRays(): void {
    const cloudiness = (1 - this.overcast) / (1 - RAIN_OVERCAST_BRIGHTNESS);
    lightRaysInto(this.raysHour, cloudiness, this.rays);
    this.lightRaysLayer.setRays(this.rays.strength, this.rays.tilt);
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
      // Pièce masquée : retour à l'orbite ; meuble changé : limites recalculées (#343).
      this.cameras.roomChanged();
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
   * Ciel couvert (ADR 0082) : appliqué d'un coup, ou, si `fade`, en fondu de
   * `OVERCAST_FADE_SECONDS` avancé par `stepOvercastFade` (issue #338 ; jamais en capture).
   */
  setRain(enabled: boolean, fade = false): boolean {
    if (!this.disposed && this.world.environment.rain) {
      const changed = this.rainLayer.isEnabled !== enabled;
      this.rainLayer.setEnabled(enabled);
      const overcastBefore = this.overcast;
      if (!fade) {
        this.overcast = overcastBrightness(enabled);
      }
      if (changed || this.overcast !== overcastBefore) {
        this.applyLight();
        this.applyTonePenalties();
      }
    }
    return this.rainLayer.isEnabled;
  }

  /**
   * Avance de `dtSeconds` (temps réel) le fondu du ciel couvert vers celui de la pluie
   * courante (`stepOvercast`). Renvoie `true` si le facteur a changé (lumières, eau et décor
   * réappliqués). Sans effet hors fondu : aucun travail par image.
   */
  stepOvercastFade(dtSeconds: number): boolean {
    if (this.disposed) {
      return false;
    }
    const target = overcastBrightness(this.rainLayer.isEnabled);
    if (this.overcast === target) {
      return false;
    }
    const next = stepOvercast(this.overcast, target, dtSeconds);
    if (next === this.overcast) {
      return false;
    }
    this.overcast = next;
    this.applyLight();
    return true;
  }

  /** Facteur de ciel couvert appliqué (tests ; 1 hors pluie et fondu terminé). */
  get overcastFactor(): number {
    return this.overcast;
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

  /** Distributeur automatique (issue #583) : montré s'il est posé. Sans effet après `dispose`. */
  setFeeder(installed: boolean): void {
    if (!this.disposed) {
      this.feederLayer.setVisible(installed);
    }
  }

  /** Vrai si le distributeur est affiché (tests). */
  get feederShown(): boolean {
    return this.feederLayer.visible;
  }

  /**
   * Algues des vitres (issue #476) : plaques `patches` (`worldAlgaePatches`) à leur
   * couverture `algae` (`WaterState.algae`, même ordre). Sans effet après `dispose`.
   */
  setAlgae(patches: readonly AlgaePatch[], algae: readonly number[] | undefined): void {
    if (!this.disposed) {
      this.algaeLayer.setAlgae(patches, algae);
    }
  }

  /** Plaques d'algues affichées (tests). */
  get algaeCount(): number {
    return this.algaeLayer.count;
  }

  /**
   * Voile d'encrassement (issue #607) du volume d'eau `water` au niveau `fouling`
   * (`worldFouling`) ; `floor` : sol de sable plat, voilé lui aussi. Sans effet après `dispose`.
   */
  setFouling(water: Box3, fouling: TankFouling, floor: boolean): void {
    if (!this.disposed) {
      this.foulingLayer.setFouling(water, fouling, floor);
    }
  }

  /** Cases du voile dessinées sur les vitres et sur le sol (tests). */
  get foulingCounts(): { readonly glass: number; readonly floor: number } {
    return this.foulingLayer.counts;
  }

  /**
   * Pousse affichée de la plante d'indice `index` du décor (issue #477, voxels entiers,
   * `DecorLayer.setPlantGrowth`). Sans effet après `dispose`.
   */
  setPlantGrowth(index: number, growth: number): void {
    if (!this.disposed) {
      this.decorLayer.setPlantGrowth(index, growth);
    }
  }

  /** Pousse affichée de la plante d'indice `index`, `null` pour un autre élément (tests). */
  plantGrowth(index: number): number | null {
    return this.decorLayer.plantGrowth(index);
  }

  /**
   * Lumière gardée au fond sous les plantes hautes (issue #477, `plantShade`), dans ]0, 1] :
   * multiplie la teinte du décor. Sans effet après `dispose` ou si elle ne change pas.
   */
  setPlantShade(shade: number): void {
    if (!this.disposed && shade !== this.plantShade && shade > 0 && shade <= 1) {
      this.plantShade = shade;
      this.applyLight();
    }
  }

  /**
   * Rayon de la caméra sous le point de l'écran (`clientX`, `clientY`, pixels CSS), dans le
   * repère du bac : origine et direction (raclette, issue #476). `null` hors du canvas ou
   * après `dispose`.
   */
  pickRay(
    clientX: number,
    clientY: number,
  ): {
    readonly origin: readonly [number, number, number];
    readonly direction: readonly [number, number, number];
  } | null {
    if (this.disposed) {
      return null;
    }
    const ndc = toNormalizedDevice(clientX, clientY, this.canvas.getBoundingClientRect());
    if (!ndc) {
      return null;
    }
    const origin = this.camera.position;
    const direction = new Vector3(ndc.x, ndc.y, 0.5).unproject(this.camera).sub(origin);
    return {
      origin: [origin.x, origin.y, origin.z],
      direction: [direction.x, direction.y, direction.z],
    };
  }

  /**
   * Courant d'eau (issue #460, `sim/water-current.ts`) : vitesse de l'eau (m/s) que suivent
   * bulles et feuilles mortes, direction et nombre de chevrons du repère (0 : masqué). Sans
   * effet après `dispose`.
   */
  setWaterCurrent(x: number, z: number, direction: number, chevrons: number): void {
    if (!this.disposed) {
      this.bubbleLayer.setCurrent(x, z);
      this.floatingLeafLayer.setCurrent(x, z);
      this.currentLayer.setCurrent(direction, chevrons);
    }
  }

  /** Chevrons du repère du courant posés, et abscisse du premier (tests). */
  get currentIndicator(): readonly [number, number] {
    return [this.currentLayer.count, this.currentLayer.firstOffset];
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
    this.prepareFrame();
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
      // Translucides mélangés en linéaire dans une cible, comme en pixel art (#40).
      this.directPass.setSize(this.width, this.height, this.pixelRatio);
      this.renderer.setRenderTarget(this.directPass.target);
      this.renderer.render(this.world.scene, this.camera);
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.directPass.scene, this.directPass.camera);
      return true;
    }
    this.renderPixelScene();
    this.renderPalette();
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.pixelPass.upscaleScene, this.pixelPass.camera);
    return true;
  }

  /**
   * Photo du bac (#479, ADR 0112) : rend la vue courante dans la cible basse résolution, la
   * ramène à la palette (un pixel par pixel de scène, sans lissage, ADR 0151) et relit ses
   * pixels, lignes de bas en haut (`render/photo-capture.ts` les agrandit et les retourne).
   * Toujours en pixel art, quel que soit le filtre affiché.
   * Rien n'est dessiné à l'écran et ni le monde ni l'horloge n'avancent ; la relecture suit
   * le rendu dans le même appel (la cible ne dépend pas de `preserveDrawingBuffer`).
   * Renvoie `null` si la vue est libérée, sans taille, ou si le renderer ne sait pas relire.
   */
  takePhoto(): PhotoPixels | null {
    if (this.disposed || !this.hasSize() || !this.renderer.readRenderTargetPixels) {
      return null;
    }
    this.prepareFrame();
    // Une erreur du rendu ou de la relecture (#503) ne doit pas laisser une cible branchée :
    // l'image suivante serait dessinée hors de l'écran.
    try {
      this.renderPixelScene();
      this.renderPalette();
      const { width, height } = this.targetSize;
      const data = new Uint8Array(width * height * 4);
      this.renderer.readRenderTargetPixels(this.pixelPass.paletteTarget, 0, 0, width, height, data);
      return { width, height, data };
    } finally {
      this.renderer.setRenderTarget(null);
    }
  }

  /** Réglages de la scène qui dépendent de la caméra, communs à l'image et à la photo. */
  private prepareFrame(): void {
    const { x, y, z } = this.camera.position;
    // Bassin enterré (#105) : coupe du sol et de la margelle si la caméra passe sous le sol.
    this.world.setViewpoint(x, y, z);
    // Pièce (#187, #324) : rien ne cache le bac, la caméra passât-elle sous le bac ou hors de
    // la pièce (chaque mur franchi et le plafond sont masqués).
    this.roomLayer.setViewpoint(x, y, z);
    // Taille des granulés selon le zoom (#117) : échelle à la distance de la cible.
    this.foodLayer.setPixelsPerMeter(
      scenePixelsPerMeter(
        this.camera.position.distanceTo(this.controls.target),
        this.camera.fov,
        this.targetSize.height,
      ),
    );
    // Œufs (#501) : au moins `EGG_MIN_PIXELS` pixels de scène, même loin de la caméra.
    this.eggLayer.setViewpoint(
      x,
      y,
      z,
      scenePixelsPerMeter(1, this.camera.fov, this.targetSize.height),
    );
    // Ronds de pluie vus de biais (#125) : rond extérieur seul, plus clair.
    this.rainLayer.setObliqueView(isObliqueView(this.cameraPosition(), this.cameraTarget()));
  }

  /** Rend la scène dans la cible basse résolution du pixel art (sans la passe palette). */
  private renderPixelScene(): void {
    this.decorLayer.setResolution(this.targetSize.width, this.targetSize.height);
    this.roomLayer.setResolution(this.targetSize.width, this.targetSize.height);
    this.lilyPadLayer.setResolution(this.targetSize.width, this.targetSize.height);
    this.floatingLeafLayer.setResolution(this.targetSize.width, this.targetSize.height);
    this.bubbleLayer.setPointScale(1);
    this.foodLayer.setPointScale(1);
    this.renderer.setRenderTarget(this.pixelPass.target);
    this.renderer.render(this.world.scene, this.camera);
  }

  /** Ramène l'image de la cible basse résolution à la palette, dans `paletteTarget`. */
  private renderPalette(): void {
    this.renderer.setRenderTarget(this.pixelPass.paletteTarget);
    this.renderer.render(this.pixelPass.scene, this.pixelPass.camera);
  }

  /** Vrai en caméra libre (#343). */
  get freeCameraActive(): boolean {
    return this.cameras.freeCameraActive;
  }

  /**
   * Passe en caméra libre dans la pièce (#343, ADR 0084) : même position (ramenée dans la
   * pièce, hors du bac) et même visée que l'orbite, contrôles orbitaux coupés ; la pose et le
   * préréglage suivis sont gardés pour `exitFreeCamera`. Refusé (renvoie `false`) sans pièce
   * dessinée, en vue non interactive (capture, fond d'écran) ou déjà en caméra libre.
   */
  enterFreeCamera(): boolean {
    return this.cameras.enterFreeCamera();
  }

  /**
   * Revient à l'orbite (#343) : pose d'avant la caméra libre rendue telle quelle, ou recadrée
   * sur le préréglage qu'elle suivait. Renvoie `false` hors caméra libre.
   */
  exitFreeCamera(): boolean {
    return this.cameras.exitFreeCamera();
  }

  /**
   * Avance la caméra libre de `dtSeconds` (temps réel) selon la consigne du clavier
   * (`stepFreeCamera`, pas fixes). Renvoie `true` si la caméra a bougé.
   */
  stepFreeCamera(input: FreeCameraInput, dtSeconds: number): boolean {
    return this.cameras.stepFreeCamera(input, dtSeconds);
  }

  /**
   * Pose libre instantanée (`libre=` du contrat de capture, #343) : caméra en `position`
   * (ramenée dans la pièce, hors du bac), cap `yaw` et inclinaison `pitch` en radians
   * (`freeCameraDirection`), sans passer en caméra libre ni toucher aux contrôles. Refusée
   * (`false`) sans pièce dessinée : la pose du préréglage reste.
   */
  applyFreePose(position: Vec3, yaw: number, pitch: number): boolean {
    return this.cameras.applyFreePose(position, yaw, pitch);
  }

  /**
   * État de la caméra libre (tests), `null` en orbite. Objet vivant, modifié en place à chaque
   * image (#352) : copier les valeurs à comparer plutôt que garder l'objet.
   */
  get freeCameraState(): FreeCameraState | null {
    return this.cameras.freeCameraState;
  }

  /** Poussée courante du pincement (tests), dans [−1, 1]. */
  get freeCameraThrust(): number {
    return this.cameras.freeCameraThrust;
  }

  /**
   * Mode immersif (#345, ADR 0086) : caméra parallèle à la vitre avant, projection décentrée
   * dont le tronc passe par les quatre bords de la vitre (`core/immersive/off-axis.ts`), qui
   * coïncide ainsi avec l'écran ; contrôles orbitaux et caméra libre coupés. `null` rend
   * l'orbite sur le préréglage courant. Renvoie faux si la vue est libérée ou si la caméra
   * est invalide (distance non strictement positive, valeur non finie).
   */
  setImmersiveCamera(camera: ImmersiveCamera | null): boolean {
    return this.cameras.setImmersiveCamera(camera);
  }

  /** Vrai en mode immersif. */
  get immersiveActive(): boolean {
    return this.cameras.immersiveActive;
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

  /**
   * Abonnement aux mouvements de caméra provoqués par l'utilisateur (orbite, ou orientation de
   * la caméra libre à la souris, #343). Renvoie le désabonnement.
   */
  onCameraChange(listener: () => void): () => void {
    this.controls.addEventListener('change', listener);
    const offLook = this.cameras.onFreeLook(listener);
    return () => {
      this.controls.removeEventListener('change', listener);
      offLook();
    };
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.pointer.dispose();
    this.cameras.dispose();
    this.controls.dispose();
    for (const layer of this.sceneLayers) {
      layer.dispose();
    }
    this.world.dispose();
    this.pixelPass.dispose();
    this.directPass.dispose();
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
    this.cameras.refreshImmersiveProjection();
  }
}
