import { PerspectiveCamera, WebGLRenderer } from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import type { CameraPreset } from '../core/capture/capture-params';
import { DEFAULT_RENDER_FILTER, type RenderFilter } from '../core/render-filter/render-filter';
import type { FoodStyle } from '../core/food-style/food-style';
import type { AquariumScene } from './aquarium-scene';
import {
  CAMERA_FOV_DEG,
  tankBoundingRadius,
  type TankDimensions,
  type Vec3,
} from './camera-presets';
import type { SpeciesId } from '../sim/species';
import type { Fish } from '../sim/swimmer';
import type { AlgaePatch } from '../sim/algae';
import type { TankFouling } from '../sim/fouling';
import type { DayLight } from '../sim/daylight';
import { environmentDataWater, type Environment } from '../sim/environment';
import { flowerOpenness, lilyPadLayout } from '../sim/lily-pads';
import { seededFeatures } from '../sim/world';
import type { DecorItem } from '../sim/decor';
import { clampRoom, DEFAULT_ROOM, isRoomAvailable, type Room, type RoomBlock } from '../sim/room';
import type { Box3 } from '../sim/tank';
import type { DecorPick } from './decor-pick';
import { type EffectLayer, updateVisibleEffects } from './effect-layer';
import type { BehaviorFrame } from './fish-layer';
import { scenePixelsPerMeter } from './food-size';
import { isObliqueView } from './rain-layer';
import type { FreeCameraInput, FreeCameraState } from './free-camera';
import { CameraController, createOrbitControls, type CameraHost } from './camera-controller';
import { DragController, type DecorDragListener, type DragHost } from './drag-controller';
import type { StrokePoint } from './stroke';
import { FramePipeline, type AquariumRenderer, type FrameScene } from './frame-pipeline';
import type { PhotoPixels } from './photo-capture';
import { SceneLighting } from './scene-lighting';
import { ViewLayers, type GroundFrame } from './view-layers';
import { ViewPicker, type PickedRay } from './view-picker';
import { DecorClock } from './decor-clock';
import {
  FULL_MOTION,
  motionFactors,
  type MotionFactors,
} from '../core/reduced-motion/reduced-motion';

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
  /** Environnement représenté (bac tropical par défaut, `sim/environment.ts`). */
  readonly environment?: Environment;
  /** Filtre de rendu initial (pixel art par défaut), modifiable à chaud par `setFilter`. */
  readonly filter?: RenderFilter;
}

export type { AquariumRenderer } from './frame-pipeline';
export { TEA_TONES } from './scene-lighting';
export type { DecorDragListener } from './drag-controller';
export { ORBIT_MOUSE_ACTIONS, ORBIT_TOUCH_ACTIONS } from './camera-controller';
export { STROKE_STEP_PX, strokePoints, type StrokePoint } from './stroke';

/**
 * Vue 3D du bac, sans Angular : renderer, scène, caméra et contrôles orbitaux.
 * Le composant hôte (`ui/`) porte la boucle d'affichage et appelle `renderFrame()`.
 *
 * Pipeline pixel art (ADR 0002, `FramePipeline`) : la scène est rendue dans la cible basse
 * résolution de `PalettePass`, puis affichée plein écran sans lissage et ramenée à la palette.
 * Filtre `aucun` (ADR 0010) : la scène est rendue directement à l'écran, en pleine
 * résolution, sans passe palette ; la bascule ne touche ni à la caméra ni à la scène.
 * Couches (`ViewLayers`), lumière (`SceneLighting`), lancers de rayon (`ViewPicker`), gestes
 * (`DragController`) et caméra (`CameraController`) vivent à part (#698).
 */
export class AquariumView {
  readonly camera: PerspectiveCamera;
  private readonly world: AquariumScene;
  private readonly controls: OrbitControls;
  private readonly canvas: HTMLCanvasElement;
  /** Taille du canvas, cibles des passes et rendu d'une image ou d'une photo. */
  private readonly frames: FramePipeline;
  /** Scène, couches et réglages par image passés à `frames`, créés une fois. */
  private readonly frameScene: FrameScene;
  /** Scène statique et toutes les couches, dans leur ordre de création. */
  private readonly layers: ViewLayers;
  /** Lumière du jour, ciel couvert, rayons et tons de la passe palette. */
  private readonly lighting: SceneLighting;
  /** Lancers de rayon sous le pointeur. */
  private readonly picker: ViewPicker;
  /** Contrôles à la souris demandés (faux en mode capture) ; coupés le temps d'un glissement. */
  private readonly interactive: boolean;
  /** Pièce construite par `setRoom` (choix à la souris), hors aperçu d'un glissement. */
  private room: Room = DEFAULT_ROOM;
  /** Blocs des meubles supports et des bacs posés (`setRoomLayout`, #305). */
  private roomLayout: readonly RoomBlock[] = [];
  /** Clics, glisser du décor et de la pièce, passage de raclette (#698). */
  private readonly pointer: DragController;
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
    layer === this.layers.rain ? this.rainClock.at(time) : time;
  /** Caméra : préréglages, transitions, caméra libre (#698). */
  private readonly cameras: CameraController;

  constructor(options: AquariumViewOptions) {
    this.canvas = options.canvas;
    this.frames = new FramePipeline(
      options.rendererFactory(options.canvas),
      options.pixelRatio,
      options.filter ?? DEFAULT_RENDER_FILTER,
    );
    this.layers = new ViewLayers(options.environment);
    this.world = this.layers.world;
    // Tons propres à l'environnement (eau du récif, ADR 0039) : écartés ailleurs.
    this.lighting = new SceneLighting(this.layers, this.frames.palette);
    this.lighting.applyTonePenalties();

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
    this.picker = new ViewPicker(this.canvas, this.camera, this.layers, () => this.room);
    this.frameScene = {
      scene: this.world.scene,
      camera: this.camera,
      prepare: () => this.prepareFrame(),
      setResolution: (width, height) => this.layers.setResolution(width, height),
      setPointScale: (scale) => this.layers.setPointScale(scale),
    };
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
      planeAt: (x, y, planeY) => this.picker.planeAt(x, y, planeY),
      decorItemPosition: (index) => this.layers.decor.itemPosition(index),
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
      roomBuilt: () => this.layers.room.built,
      cabinetHeight: () => clampRoom(this.room).cabinetHeight,
      hasSize: () => this.hasSize(),
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
    if (!this.frames.resize(width, height)) {
      return false;
    }
    if (this.hasSize()) {
      this.updateAspect();
      this.cameras.reframe();
    }
    return true;
  }

  /** Taille non nulle : une image rendue maintenant est une image complète. */
  hasSize(): boolean {
    return this.frames.hasSize();
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
    for (const layer of this.layers.fish) {
      // Corps (#582) après les vivants, grisés et retournés.
      layer.update(entities, alpha, seed, frame, dead);
    }
    this.layers.alertHighlight.update(entities, alpha);
  }

  /** Met en évidence les animaux `ids` (#483) ; vide : aucun. */
  setAlertHighlight(ids: readonly number[]): void {
    if (!this.disposed) {
      this.layers.alertHighlight.setAnimals(ids);
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
      this.layers.decor.update(time, this.motion.plantSway);
      // Sous la pluie, les nénuphars frémissent (issue #106).
      this.layers.lilyPads.update(waterTime, this.layers.rain.isEnabled ? 1 : 0);
      updateVisibleEffects(this.layers.effects, time, this.effectTime);
      this.layers.waterLight.update(waterTime);
      this.layers.lightRays.update(this.raysClock.at(time));
    }
  }

  /**
   * Réduit les mouvements décoratifs (`true`, #406, `core/reduced-motion`) ou les rétablit :
   * effet au prochain `updateDecor`. N'agit que sur le rendu, jamais sur le monde.
   */
  setReducedMotion(reduced: boolean): void {
    this.motion = motionFactors(reduced);
    this.layers.current.setStill(reduced);
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
    return this.layers.lightRays.time;
  }

  /** Force des rayons de lumière appliquée (0 la nuit ; 0 aussi s'ils sont masqués). */
  get lightRaysStrength(): number {
    return this.layers.lightRays.object.visible ? this.layers.lightRays.raysStrength : 0;
  }

  /** Temps des caustiques et du reflet posé par le dernier `updateDecor` (tests). */
  get waterLightTime(): number {
    return this.layers.waterLight.time;
  }

  /**
   * Pose ce qui repose dans l'eau et au sol : granulés (`World.food`), œufs (`World.eggs`,
   * #478, `hatchTime` : durée d'incubation, teinte des œufs mûrs) et exuvies des crevettes
   * (`World.exuviae`, #859) au temps simulé `time`. À appeler avant `renderFrame()`.
   */
  updateGround(ground: GroundFrame): void {
    if (!this.disposed) {
      this.layers.food.update(ground.food);
      this.layers.eggs.update(ground.eggs, ground.hatchTime);
      this.layers.exuviae.update(ground.exuviae, ground.time);
    }
  }

  /** Nombre d'œufs posés par le dernier `updateGround` (tests). */
  get eggCount(): number {
    return this.layers.eggs.count;
  }

  /** Nombre de granulés posés par le dernier `updateGround` (tests). */
  get foodCount(): number {
    return this.layers.food.count;
  }

  /** Rendu des granulés (points ou voxels, issue #117). */
  get foodStyle(): FoodStyle {
    return this.layers.food.style;
  }

  /** Change le rendu des granulés à chaud ; la scène et la caméra ne changent pas. */
  setFoodStyle(style: FoodStyle): void {
    if (!this.disposed) {
      this.layers.food.setStyle(style);
    }
  }

  /** Taille courante du cœur d'un granulé en points, en pixels de la surface de rendu (tests). */
  get foodPointSize(): number {
    return this.layers.food.pointSize;
  }

  /**
   * Point de la surface de l'eau sous le point de l'écran (`clientX`, `clientY`, pixels CSS),
   * en (x, z) dans le repère du bac, par lancer de rayon depuis la caméra ; `null` hors du
   * canvas, hors du bac ou sur la terre émergée du paludarium (#129).
   */
  pickWaterSurface(clientX: number, clientY: number): { x: number; z: number } | null {
    return this.disposed ? null : this.picker.pickWaterSurface(clientX, clientY);
  }

  /**
   * Cible d'un clic en mode édition du décor (#167) au point de l'écran (`clientX`,
   * `clientY`, pixels CSS) : l'élément de `World.decor` le plus proche touché par le rayon de
   * la caméra, sinon le point du sable visé dans le bac, sinon `null` (hors du canvas, hors du
   * bac). Juste sous les cinq angles de vue : lancer de rayon sur les maillages affichés.
   */
  pickDecor(clientX: number, clientY: number): DecorPick {
    return this.disposed ? null : this.picker.pickDecor(clientX, clientY);
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
      this.layers.decor.moveItem(index, x, z);
    }
  }

  /**
   * Image de la chute (ADR 0046) : la base de l'élément `index` affichée en (`x`, `y`, `z`),
   * repère du bac, sans reconstruire le décor.
   */
  previewDecorPose(index: number, x: number, y: number, z: number): void {
    if (!this.disposed) {
      this.layers.decor.placeItem(index, x, y, z);
    }
  }

  /** Sélectionne l'élément d'indice `index` de `World.decor` (contour clair), ou aucun. */
  setDecorSelection(index: number | null): void {
    if (!this.disposed) {
      this.layers.decor.setSelected(index);
    }
  }

  /** Indice de l'élément de décor sélectionné, `null` sinon (tests). */
  get decorSelection(): number | null {
    return this.layers.decor.selectedIndex;
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
      this.lighting.update(light);
    }
  }

  /**
   * Ouvre ou ferme les fleurs des nénuphars selon l'heure `hour` (`flowerOpenness`, issue
   * #104) : à appeler avec `updateLight`, à la même heure.
   * @throws RangeError si `hour` n'est pas un réel fini.
   */
  updateFlowers(hour: number): void {
    if (!this.disposed) {
      this.layers.lilyPads.setOpenness(flowerOpenness(hour));
    }
  }

  /**
   * Oriente les rayons de lumière selon l'heure `hour` (`sim/light-rays.ts`, issue #567) : à
   * appeler avec `updateLight`, à la même heure. Le ciel couvert de la pluie les atténue.
   * @throws RangeError si `hour` n'est pas un réel fini.
   */
  updateLightRays(hour: number): void {
    if (!this.disposed) {
      this.lighting.updateLightRays(hour);
    }
  }

  /** Ouverture courante des fleurs des nénuphars (tests). */
  get flowerOpenness(): number {
    return this.layers.lilyPads.flowerOpenness;
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
      this.layers.decor.setDecor(items, corals, anemones);
      for (const layer of this.layers.effects) {
        layer.setSeed(seed);
      }
      this.layers.lilyPads.setPads(lilyPadLayout(seed, environmentDataWater(env), env.lilyPads));
    }
  }

  /**
   * Remplace les seuls éléments du décor affichés (édition du décor, #167), sans toucher aux
   * effets tirés de la graine (bulles, nénuphars) ; la sélection est effacée.
   */
  replaceDecorItems(items: readonly DecorItem[], seed: number): void {
    if (!this.disposed) {
      const { corals, anemones } = seededFeatures(seed, this.world.environment.id, items);
      this.layers.decor.setDecor(items, corals, anemones);
    }
  }

  /** Nombre de bulles posées par le dernier `updateDecor` (tests). */
  get bubbleCount(): number {
    return this.layers.bubbles.count;
  }

  /** Luminosité des couleurs plates de chaque couche de poissons, puis des bulles (tests). */
  get flatBrightnesses(): readonly number[] {
    return [...this.layers.fish.map((layer) => layer.brightness), this.layers.bubbles.brightness];
  }

  /** Teinte courante du décor (tests). */
  get decorTintValue(): readonly [number, number, number] {
    return this.layers.decor.tint;
  }

  /** Pénalités courantes des tons de nuit et du crépuscule (tests). */
  get tonePenalties(): readonly [number, number] {
    return this.frames.palette.tonePenalties;
  }

  /** Pénalités des tons d'environnement, fixées par l'environnement de la vue (tests). */
  get environmentTonePenalties(): readonly number[] {
    return this.frames.palette.environmentPenalties;
  }

  /**
   * Affiche ou masque le décor (rochers, plantes et nénuphars, issue #52) sans le détruire :
   * il reste en mémoire et réapparaît tel quel. Les bulles, l'eau et la lumière ne changent pas.
   */
  setDecorVisible(visible: boolean): void {
    if (!this.disposed) {
      this.layers.decor.object.visible = visible;
      this.layers.lilyPads.object.visible = visible;
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
      this.layers.room.setRoom(
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
      this.layers.room.setSelected(index);
    }
  }

  /** Indice de l'élément de la pièce sélectionné et dessiné, `null` sinon (tests). */
  get roomSelection(): number | null {
    return this.layers.room.selectedIndex;
  }

  /** Vrai si la pièce est construite (tests). */
  get roomShown(): boolean {
    return this.layers.room.built;
  }

  /** Nombre de blocs de la pièce (tests). */
  get roomBlockCount(): number {
    return this.layers.room.count;
  }

  /** Vrai si le mur de la pièce est affiché au dernier rendu (tests). */
  get roomWallVisible(): boolean {
    return this.layers.room.wallVisible;
  }

  /**
   * Fait pleuvoir (`true`) ou arrête la pluie (issue #106) : gouttes, ronds à la surface et
   * nénuphars qui frémissent, au temps simulé de `updateDecor`. Sans effet dans un
   * environnement sans pluie (`Environment.rain`). Renvoie l'état appliqué.
   * Ciel couvert (ADR 0082) : appliqué d'un coup, ou, si `fade`, en fondu de
   * `OVERCAST_FADE_SECONDS` avancé par `stepOvercastFade` (issue #338 ; jamais en capture).
   */
  setRain(enabled: boolean, fade = false): boolean {
    return this.disposed ? this.layers.rain.isEnabled : this.lighting.setRain(enabled, fade);
  }

  /**
   * Avance de `dtSeconds` (temps réel) le fondu du ciel couvert vers celui de la pluie
   * courante (`stepOvercast`). Renvoie `true` si le facteur a changé (lumières, eau et décor
   * réappliqués). Sans effet hors fondu : aucun travail par image.
   */
  stepOvercastFade(dtSeconds: number): boolean {
    return !this.disposed && this.lighting.stepOvercastFade(dtSeconds);
  }

  /** Facteur de ciel couvert appliqué (tests ; 1 hors pluie et fondu terminé). */
  get overcastFactor(): number {
    return this.lighting.overcastFactor;
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
    if (!this.disposed) {
      this.lighting.setWaterTea(tea);
    }
  }

  /**
   * Feuilles de catappa posées sur le sol (issue #239) : une par réserve de `leaves`
   * (`WaterState.catappa`), plus sombre une fois épuisée. Sans effet après `dispose`.
   */
  setCatappa(leaves: readonly number[] | undefined): void {
    if (!this.disposed) {
      this.layers.catappa.setLeaves(leaves);
    }
  }

  /** Distributeur automatique (issue #583) : montré s'il est posé. Sans effet après `dispose`. */
  setFeeder(installed: boolean): void {
    if (!this.disposed) {
      this.layers.feeder.setVisible(installed);
    }
  }

  /** Vrai si le distributeur est affiché (tests). */
  get feederShown(): boolean {
    return this.layers.feeder.visible;
  }

  /**
   * Algues des vitres (issue #476) : plaques `patches` (`worldAlgaePatches`) à leur
   * couverture `algae` (`WaterState.algae`, même ordre). Sans effet après `dispose`.
   */
  setAlgae(patches: readonly AlgaePatch[], algae: readonly number[] | undefined): void {
    if (!this.disposed) {
      this.layers.algae.setAlgae(patches, algae);
    }
  }

  /** Plaques d'algues affichées (tests). */
  get algaeCount(): number {
    return this.layers.algae.count;
  }

  /**
   * Voile d'encrassement (issue #607) du volume d'eau `water` au niveau `fouling`
   * (`worldFouling`) ; `floor` : sol de sable plat, voilé lui aussi. Sans effet après `dispose`.
   */
  setFouling(water: Box3, fouling: TankFouling, floor: boolean): void {
    if (!this.disposed) {
      this.layers.fouling.setFouling(water, fouling, floor);
    }
  }

  /** Cases du voile dessinées sur les vitres et sur le sol (tests). */
  get foulingCounts(): { readonly glass: number; readonly floor: number } {
    return this.layers.fouling.counts;
  }

  /**
   * Pousse affichée de la plante d'indice `index` du décor (issue #477, voxels entiers,
   * `DecorLayer.setPlantGrowth`). Sans effet après `dispose`.
   */
  setPlantGrowth(index: number, growth: number): void {
    if (!this.disposed) {
      this.layers.decor.setPlantGrowth(index, growth);
    }
  }

  /** Pousse affichée de la plante d'indice `index`, `null` pour un autre élément (tests). */
  plantGrowth(index: number): number | null {
    return this.layers.decor.plantGrowth(index);
  }

  /**
   * Lumière gardée au fond sous les plantes hautes (issue #477, `plantShade`), dans ]0, 1] :
   * multiplie la teinte du décor. Sans effet après `dispose` ou si elle ne change pas.
   */
  setPlantShade(shade: number): void {
    if (!this.disposed) {
      this.lighting.setPlantShade(shade);
    }
  }

  /**
   * Rayon de la caméra sous le point de l'écran (`clientX`, `clientY`, pixels CSS), dans le
   * repère du bac : origine et direction (raclette, issue #476). `null` hors du canvas ou
   * après `dispose`.
   */
  pickRay(clientX: number, clientY: number): PickedRay | null {
    return this.disposed ? null : this.picker.pickRay(clientX, clientY);
  }

  /**
   * Courant d'eau (issue #460, `sim/water-current.ts`) : vitesse de l'eau (m/s) que suivent
   * bulles et feuilles mortes, direction et nombre de chevrons du repère (0 : masqué). Sans
   * effet après `dispose`.
   */
  setWaterCurrent(x: number, z: number, direction: number, chevrons: number): void {
    if (!this.disposed) {
      this.layers.bubbles.setCurrent(x, z);
      this.layers.floatingLeaves.setCurrent(x, z);
      this.layers.current.setCurrent(direction, chevrons);
    }
  }

  /** Chevrons du repère du courant posés, et abscisse du premier (tests). */
  get currentIndicator(): readonly [number, number] {
    return [this.layers.current.count, this.layers.current.firstOffset];
  }

  /** Feuilles de catappa affichées, puis celles qui sont épuisées (tests). */
  get catappaCounts(): readonly [number, number] {
    return [this.layers.catappa.count, this.layers.catappa.spentCount];
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
    return this.layers.rain.isEnabled;
  }

  /** Nom de chaque couche d'effet (`EffectLayer`), dans l'ordre où la vue les parcourt (tests). */
  get effectLayerNames(): readonly string[] {
    return this.layers.effects.map((layer) => layer.object.name);
  }

  /** Vrai si les ronds de pluie sont tracés pour une vue de biais (tests). */
  get rainObliqueView(): boolean {
    return this.layers.rain.obliqueView;
  }

  /** Gouttes en l'air et ronds à la surface posés par le dernier `updateDecor` (tests). */
  get rainCounts(): readonly [number, number] {
    return [this.layers.rain.dropCount, this.layers.rain.rippleCount];
  }

  /** Feuilles mortes posées par le dernier `updateDecor` (tests). */
  get floatingLeafCount(): number {
    return this.layers.floatingLeaves.object.visible ? this.layers.floatingLeaves.count : 0;
  }

  /** Nombre de nénuphars affichés (tests). */
  get lilyPadCount(): number {
    return this.layers.lilyPads.count;
  }

  /** Vrai si les nénuphars sont affichés (tests). */
  get lilyPadsVisible(): boolean {
    return this.layers.lilyPads.object.visible;
  }

  /** Vrai si le décor est affiché (tests). */
  get decorVisible(): boolean {
    return this.layers.decor.object.visible;
  }

  /** Nombre d'éléments de décor affichés (tests). */
  get decorCount(): number {
    return this.layers.decor.count;
  }

  /** Nombre d'anémones affichées (tests). */
  get anemoneCount(): number {
    return this.layers.decor.anemoneCount;
  }

  /** Nombre de colonies de corail affichées (tests). */
  get coralCount(): number {
    return this.layers.decor.coralCount;
  }

  /** Nombre de poissons placés par le dernier `updateFish`, toutes espèces confondues (tests). */
  get fishCount(): number {
    let count = 0;
    for (const layer of this.layers.fish) {
      count += layer.count;
    }
    return count;
  }

  /** Espèce de chaque couche de rendu, dans l'ordre des couches (tests). */
  get fishLayerSpecies(): readonly SpeciesId[] {
    return this.layers.fish.map((layer) => layer.species.id);
  }

  /** Nom de chaque couche de rendu (`poissons-<espèce>[-<apparence>]`), dans l'ordre (tests). */
  get fishLayerNames(): readonly string[] {
    return this.layers.fish.map((layer) => layer.object.name);
  }

  /** Filtre de rendu courant. */
  get filter(): RenderFilter {
    return this.frames.filter;
  }

  /**
   * Change le filtre de rendu à chaud. Seule la projection suit le nouveau rapport d'aspect :
   * la position et la cible de la caméra, la transition en cours et la scène sont conservées.
   * Renvoie `true` si le filtre a changé.
   */
  setFilter(filter: RenderFilter): boolean {
    if (this.disposed || !this.frames.setFilter(filter)) {
      return false;
    }
    if (this.hasSize()) {
      this.updateAspect();
    }
    return true;
  }

  /** Rend une image. Renvoie `false` si rien n'a pu être rendu (taille nulle ou vue libérée). */
  renderFrame(): boolean {
    return !this.disposed && this.frames.render(this.frameScene);
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
    return this.disposed ? null : this.frames.takePhoto(this.frameScene);
  }

  /** Réglages de la scène qui dépendent de la caméra, communs à l'image et à la photo. */
  private prepareFrame(): void {
    const { x, y, z } = this.camera.position;
    // Bassin enterré (#105) : coupe du sol et de la margelle si la caméra passe sous le sol.
    this.world.setViewpoint(x, y, z);
    // Pièce (#187, #324) : rien ne cache le bac, la caméra passât-elle sous le bac ou hors de
    // la pièce (chaque mur franchi et le plafond sont masqués).
    this.layers.room.setViewpoint(x, y, z);
    // Taille des granulés selon le zoom (#117) : échelle à la distance de la cible.
    this.layers.food.setPixelsPerMeter(
      scenePixelsPerMeter(
        this.camera.position.distanceTo(this.controls.target),
        this.camera.fov,
        this.frames.targetSize.height,
      ),
    );
    // Œufs (#501) : au moins `EGG_MIN_PIXELS` pixels de scène, même loin de la caméra.
    this.layers.eggs.setViewpoint(
      x,
      y,
      z,
      scenePixelsPerMeter(1, this.camera.fov, this.frames.targetSize.height),
    );
    // Ronds de pluie vus de biais (#125) : rond extérieur seul, plus clair.
    this.layers.rain.setObliqueView(isObliqueView(this.cameraPosition(), this.cameraTarget()));
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
    this.layers.dispose();
    this.frames.dispose();
  }

  /**
   * Rapport d'aspect de la caméra : celui de la cible en pixel art (arrondie au pixel de
   * scène, pour ne pas déformer l'image), celui du canvas sans filtre.
   */
  private updateAspect(): void {
    const size = this.frames.aspectSize();
    this.camera.aspect = size.width / size.height;
    this.camera.updateProjectionMatrix();
  }
}
