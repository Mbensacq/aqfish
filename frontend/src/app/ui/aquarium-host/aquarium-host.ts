import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  DOCUMENT,
  effect,
  ElementRef,
  inject,
  InjectionToken,
  signal,
  untracked,
  viewChild,
} from '@angular/core';

import { type CameraPreset } from '../../core/capture/capture-params';
import { type SaveStatus, type SaveStorage } from '../../core/save-storage/save-storage';
import { type RenderFilter } from '../../core/render-filter/render-filter';
import { resetCaptureReady } from '../../core/capture/capture-ready';
import { DEFAULT_WALLPAPER_FPS } from '../../core/wallpaper/wallpaper';
import {
  AquariumView,
  createWebGLRenderer,
  type AquariumRendererFactory,
} from '../../render/aquarium-view';
import { presetTransitionSeconds } from '../../render/camera-presets';
import { MoonOptionState } from '../moon-option/moon-option-state';
import { ReducedMotionState } from '../reduced-motion/reduced-motion-state';
import { AmbientSoundState } from '../ambient-sound/ambient-sound-state';
import type { AmbientScene } from '../../core/ambient-sound/ambient-sound';
import type { FreeMoveId } from '../../core/commands/commands';
import type { DecorPick } from '../../render/decor-pick';
import {
  loadDecorPhysics,
  type DecorPhysicsLoader,
} from '../../core/decor-physics/load-decor-physics';
import { type DayClock } from '../../sim/daylight';
import { environmentById, placeDimensions } from '../../sim/environment';
import { DEFAULT_TANK, type TankDimensions } from '../../sim/tank';
import { type PondShape } from '../../sim/pond-shape';
import { serializeRoom } from '../../sim/room-save';
import { layoutFootprints } from '../../sim/room-layout';
import type { SaveSettings } from '../../sim/save';
import { type CareMode } from '../../sim/care-mode';
import { type FoodStyle } from '../../core/food-style/food-style';
import type { SpeciesId } from '../../sim/species';
import type { MutableWorld, World } from '../../sim/world-types';
import { type CurrentLevel, type CurrentVelocity } from '../../sim/water-current';
import type { ConditionerKind } from '../../sim/water-conditioner';
import type { PhRegulatorDirection } from '../../sim/ph-regulator';
import type { MaintenanceTask } from '../../sim/maintenance';
import { worldReview, type ReviewPoint } from '../../sim/bilan';
import type { TreatmentKind } from '../../sim/treatment';
import { hasFeeder } from '../../sim/auto-feeder';
import { shownLampReadout } from '../../sim/lamp';
import { type WaterKit } from '../../sim/water-test';
import type { FilterRinseWater } from '../../sim/filter-rinse';
import { PhotoController } from './photo-controller';
import { RenderLoop } from './render-loop';
import { FramePainter } from './frame-painter';
import { AlertHighlightController } from './alert-highlight-controller';
import { TankLooksController } from './tank-looks-controller';
import { TankReadoutsController } from './tank-readouts-controller';
import { TankPlaceController } from './tank-place-controller';
import { ClockController } from './clock-controller';
import { DisplayController } from './display-controller';
import { TankToolsController } from './tank-tools-controller';
import { WaterSettingsController } from './water-settings-controller';
import { SaveShareController } from './save-share-controller';
import { AquariumProbe } from './aquarium-probe';
import { DecorEditingController } from './decor-editing-controller';
import { RoomEditingController } from './room-editing-controller';
import { RoomLayoutController } from './room-layout-controller';
import { CareSessionController } from '../care-session/care-session-controller';
import { TankRecordsController } from './tank-records-controller';
import { FreeCameraController } from './free-camera-controller';
import { WaterCareController } from './water-care-controller';
import { TankRoomController } from './tank-room-controller';
import { documentStorage } from './browser-storage';
import { PopulationController } from './population-controller';
import { StartupSequence } from './startup-sequence';
import { ViewBuilder } from './view-builder';

/** Fabrique du renderer, remplaçable dans les tests (jsdom n'a pas WebGL). */
export const AQUARIUM_RENDERER_FACTORY = new InjectionToken<AquariumRendererFactory>(
  'AQUARIUM_RENDERER_FACTORY',
  { providedIn: 'root', factory: () => createWebGLRenderer },
);

export { ALERT_HIGHLIGHT_MS } from './alert-highlight-controller';

/** Pas de simulation entre deux relevés de l'eau dans la boucle (0,5 s simulée). */
export const WATER_READOUT_TICKS = 30;

/**
 * Chargeur du moteur de chute de l'éditeur (#170, ADR 0046) : import dynamique de Rapier par
 * défaut ; remplaçable dans les tests.
 */
export const DECOR_PHYSICS_LOADER = new InjectionToken<DecorPhysicsLoader>('DECOR_PHYSICS_LOADER', {
  providedIn: 'root',
  factory: () => loadDecorPhysics,
});

export type { TankNotice } from './tank-room-controller';

export {
  ROOM_LAYOUT_MESSAGES,
  supportPlaceLabel,
  type RoomCatalog,
  type RoomCatalogSupport,
  type RoomCatalogTank,
} from './room-layout-controller';

export {
  AUTOSAVE_INTERVAL_MS,
  SAVE_FILE_NAME,
  shareBase,
  type ShareOffer,
} from './save-share-controller';

/**
 * Stockage de la sauvegarde automatique (#70) : `localStorage` s'il est accessible, `null`
 * sinon. Remplaçable dans les tests par un stockage en mémoire.
 */
export const SAVE_STORAGE = new InjectionToken<SaveStorage | null>('SAVE_STORAGE', {
  providedIn: 'root',
  factory: () => documentStorage(inject(DOCUMENT)),
});

export { applyCaptureFurniture, applyCaptureWoods, applyPopulation } from './startup-world';
export { formatPopulation } from './tank-readouts-controller';
export { readLocalText } from './wallpaper-config';
export { initialDayClock } from './startup-sequence';

/**
 * Hôte du canvas 3D : crée la vue, porte la boucle `requestAnimationFrame`, suit la taille
 * de la fenêtre et libère toutes les ressources Three.js à la destruction.
 *
 * Simulation : le monde (`sim/world.ts`) est créé avec la graine de l'URL. Hors capture, il
 * avance en temps réel par pas fixes (`sim/fixed-step.ts`). En mode capture, il est avancé
 * jusqu'à `time` par pas fixes, sans temps réel, avant le premier rendu, puis figé.
 *
 * Contrat de capture : avec `capture=1`, pixel ratio forcé à 1, caméra figée sur le
 * préréglage demandé, une seule image rendue (puis à chaque redimensionnement). Dans tous
 * les modes, `markCaptureReady()` est appelé après la première image complète.
 * Aucun signal n'est mis à jour à chaque image (docs/ARCHITECTURE.md, « Interface »).
 *
 * Boucle d'affichage sans allocation : le monde appartient à l'hôte et avance en place
 * (`advanceInPlace`), l'accumulateur est réécrit dans un objet réutilisé (`fixedStepInto`)
 * et le rappel `requestAnimationFrame` est créé une seule fois.
 */
@Component({
  selector: 'app-aquarium-host',
  template: `<canvas
    #canvas
    class="aquarium-host__canvas"
    aria-label="Aquarium en 3D : faites glisser pour tourner, molette pour zoomer, clic droit pour vous déplacer, cliquez sur l’eau pour nourrir les poissons"
  ></canvas>`,
  styleUrl: './aquarium-host.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AquariumHost {
  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  /** Seule écrivaine des attributs `data-aqfish-*` de l'élément (#693). */
  private readonly probe = new AquariumProbe(this.host.nativeElement);
  private readonly document = inject(DOCUMENT);
  private readonly rendererFactory = inject(AQUARIUM_RENDERER_FACTORY);
  private readonly saveStorage = inject(SAVE_STORAGE);
  private readonly physicsLoader = inject(DECOR_PHYSICS_LOADER);
  /** Option « Réduire les mouvements » (#406), partagée avec les réglages. */
  private readonly motionState = inject(ReducedMotionState);
  private readonly moonState = inject(MoonOptionState);
  /** Sons d'ambiance (#411) : l'hôte fournit la scène, le service décide du reste. */
  private readonly ambientSound = inject(AmbientSoundState);
  /** Scène sonore autorisée : après le démarrage, hors capture. */
  private readonly soundAllowed = signal(false);

  private view: AquariumView | null = null;
  private capture = false;
  /** Vue fond d'écran (#279) : sans interface, caméra automatique, cadence limitée. */
  private wallpaper = false;
  /** Images par seconde de la vue fond d'écran (`fps=` ou `aqfishFond.fps`). */
  private wallpaperFps = DEFAULT_WALLPAPER_FPS;
  /** Vrai après `stop()` : un chargement asynchrone en cours ne démarre plus rien. */
  private stopped = false;
  private currentWorld: MutableWorld | null = null;
  /** Niveau du voile d'exemple de `encrassement=` (#607), en capture ; 0 sinon. */
  private captureFouling = 0;
  /** Bilan du bac affiché (#514), lu à la demande par le tableau de bord. */
  readonly reviewOfWorld = (): readonly ReviewPoint[] =>
    this.currentWorld ? worldReview(this.currentWorld) : [];
  /** Horloge de la journée (ADR 0018) et vitesse de simulation (#52, #696) : `ClockController`. */
  private readonly clock: ClockController = new ClockController({
    probe: this.probe,
    hasWorld: () => this.currentWorld !== null,
    isCapture: () => this.capture,
    renderTime: () => this.painter.renderTime(),
    relight: () => this.painter.relight(),
    scheduleFrame: () => this.scheduleFrame(),
  });
  /** Horloge de la journée simulée (ADR 0018) : l'heure suit `world.time`. */
  private get dayClock(): DayClock {
    return this.clock.dayClock;
  }
  /** Boucle d'images et pas fixe de la simulation (#696) : `RenderLoop`. */
  private readonly loop = new RenderLoop({
    window: () => this.document.defaultView,
    canRender: () => this.view !== null,
    frame: (timestamp) => this.painter.frame(timestamp),
  });
  /** Une image : temps réel, caméras, pose du monde, éclairage (#696) : `FramePainter`. */
  private readonly painter = new FramePainter({
    document: this.document,
    loop: this.loop,
    probe: this.probe,
    view: () => this.view,
    world: () => this.currentWorld,
    canvas: () => this.canvasRef().nativeElement,
    isCapture: () => this.capture,
    isWallpaper: () => this.wallpaper,
    wallpaperFps: () => this.wallpaperFps,
    speed: () => this.speed(),
    dayClock: () => this.dayClock,
    reducedMotion: () => this.display.reducedMotion(),
    moonGlowAt: (gameDay) => this.display.moonGlowAt(gameDay),
    stepFreeCamera: (view, realDt) => this.free.step(view, realDt),
    stepDecorDrop: (realDt) => this.decorEdit.stepDrop(realDt),
    advanceAndRecord: (world, steps, clock) => this.records.advanceAndRecord(world, steps, clock),
    waterReadDue: (world) => this.readouts.waterReadDue(world, WATER_READOUT_TICKS),
    readWater: () => {
      this.tanks.advanceBackground();
      this.refreshWater();
    },
  });
  private readonly cleanups: (() => void)[] = [];
  /** Désabonnements liés à la vue courante (refaits à chaque changement d'environnement). */
  private readonly viewCleanups: (() => void)[] = [];
  /** Pixel ratio de la vue (fixé au démarrage). */
  private pixelRatio = 1;

  /**
   * Préréglage que la caméra suit ou rejoint, `null` dès que l'utilisateur la déplace à la
   * souris (bug #23). Mis à jour au choix d'un préréglage et au début d'un geste, jamais à
   * chaque image. La barre des vues l'affiche.
   */
  readonly activePreset = signal<CameraPreset | null>(null);

  /** Caméra libre dans la pièce (#343, #344, #696) : `FreeCameraController`. */
  private readonly free = new FreeCameraController({
    view: () => this.view,
    isCapture: () => this.capture,
    isWallpaper: () => this.wallpaper,
    prefStorage: () => documentStorage(this.document),
    activePreset: this.activePreset,
    publishFreeCamera: (active) => this.probe.publishFreeCamera(active),
    publishCamera: () => this.probe.publishCamera(this.view),
    scheduleFrame: () => this.scheduleFrame(),
  });
  /** Caméra libre dans la pièce en cours (#343) ; la barre des vues l'affiche. */
  readonly freeCamera = this.free.active;

  /** Filtre, décor, pièce, pluie, granulés et mouvements réduits (#33, #52, #106, #117, #187, #406, #696). */
  private readonly display: DisplayController = new DisplayController({
    probe: this.probe,
    view: () => this.view,
    isCapture: () => this.capture,
    filterStorage: () => documentStorage(this.document),
    motion: this.motionState,
    moon: this.moonState,
    roomState: () => this.tanks.roomState,
    roomShown: (room, shown) => {
      // Pièce masquée : la vue est revenue à l'orbite (#343).
      this.free.roomShownChanged();
      // Éditeur (#188) : la pièce n'est modifiable que dessinée ; sélection et outil suivent.
      this.roomEdit.roomApplied(room, shown);
      this.decorEdit.roomShownChanged(shown);
    },
    saveNow: () => this.saveNow(),
    scheduleFrame: () => this.scheduleFrame(),
  });
  /** Filtre de rendu courant (#33) : `filtre=` prime sur le choix mémorisé (`aqfish.filtre`). */
  readonly filter = this.display.filter;

  /** Moment de la journée (#73) et heure affichée (#52), suivis avec l'éclairage : `FramePainter`. */
  readonly dayPhase = this.painter.dayPhase;
  readonly clockHour = this.painter.clockHour;

  /** Vrai si l'heure est figée (curseur, touches `H`, `J`, `N`, `heure=`, mode capture). */
  readonly clockFrozen = this.clock.clockFrozen;

  /** Vitesse de simulation (#52) : multiplie le temps réel versé à la boucle à pas fixe. */
  readonly speed = this.clock.speed;

  /** Décor (rochers et plantes) affiché (#52). Il reste un obstacle pour les poissons. */
  readonly decorVisible = this.display.decorVisible;

  /** Pluie (#106), dans le bassin seulement ; jamais sauvegardée. */
  readonly rain = this.display.rain;

  /** Rendu des granulés (#117) : points ou voxels, enregistré avec les réglages. */
  readonly foodStyle = this.display.foodStyle;

  /** Pièce autour du bac (#187), enregistrée avec les réglages ; `piece=1` en capture. */
  readonly room = this.display.room;

  /**
   * Relevés du bac affiché (#69, #207, #260, #278, #460, #582, #696) : effectifs, eau, santé,
   * courant, mode, environnement et dimensions, `TankReadoutsController`.
   */
  readonly readouts = new TankReadoutsController({
    probe: this.probe,
    world: () => this.currentWorld,
    view: () => this.view,
    roomState: () => this.tanks.roomState,
    refreshTankList: () => this.tanks.refreshList(),
    care: {
      refreshReadouts: (world) => this.care.refreshReadouts(world),
      isOpen: () => this.careSession() !== null,
      close: () => this.closeCareSession(),
    },
    refreshAlerts: (world, population) => this.alerts.refresh(world, population),
    refreshRecords: (world) => this.records.refresh(world),
    refreshWaterCare: (world) => this.waterCare.refresh(world),
    refreshLooks: (world) => this.looks.refresh(world),
    environmentChanged: (environment) => this.decorEdit.environmentChanged(environment),
  });
  /** Environnement affiché (#87), changé par le sélecteur du panneau. */
  readonly environment = this.readouts.environment;
  /** Effectif de chaque espèce (#69), mis à jour au démarrage et à chaque réglage. */
  readonly population = this.readouts.population;
  /** Effectif maximal de chaque espèce (#69) sous le plafond de la pièce (#392). */
  readonly populationMax = this.readouts.populationMax;
  /** Plafond d'animaux de la pièce atteint (#392, ADR 0096) : message en clair, sinon `null`. */
  readonly populationNotice = this.readouts.populationNotice;
  /** Âges extrêmes de chaque espèce du bac (#857), pour les fiches et le wiki. */
  readonly ages = this.readouts.ages;
  /** Capacité du bac affiché (#809, ADR 0172) : occupation, alerte et raisons des refus. */
  readonly capacity = this.readouts.capacity;
  /** Relevé de l'eau affiché par le tableau de bord et le panneau (#207, #256), au dixième. */
  readonly water = this.readouts.water;
  /** Relevé exact de l'eau lu par le tableau de bord (#256). */
  readonly waterSample = this.readouts.waterSample;
  /** Vrai si les changements d'eau du bac affiché versent de l'eau non traitée (#530). */
  readonly untreatedTap = this.readouts.untreatedTap;
  /** Vrai si du charbon actif est dans le filtre du bac affiché (#531). */
  readonly carbon = this.readouts.carbon;
  /** Synthèse de la santé des animaux lue par le tableau de bord (#260). */
  readonly health = this.readouts.health;
  /** Mode du bac affiché (#278) : `decor` remplace le tableau de bord par le badge. */
  readonly careMode = this.readouts.careMode;
  /** Force du courant du bac affiché (#460). */
  readonly current = this.readouts.current;
  /** Dimensions du bac du monde courant (#171), `null` si l'environnement ne les règle pas. */
  readonly tankDimensions = this.readouts.tankDimensions;
  /** Forme du bassin du monde courant (#190) : rectangle hors du bassin. */
  readonly pondShape = this.readouts.pondShape;
  /** Litres d'eau du bac du monde courant (#237, avertissements d'ajout), `null` avant le départ. */
  readonly tankLiters = this.readouts.tankLiters;
  /** Aspect du bac : plantes, distributeur, algues, voile (#476, #477, #583, #607, #696). */
  private readonly looks = new TankLooksController({
    probe: this.probe,
    view: () => this.view,
    isCapture: () => this.capture,
    captureFouling: () => this.captureFouling,
    maintenanceStartOf: (world) => this.records.maintenanceStartOf(world),
  });
  /** Durée d'éclairage du bac affiché, en heures par jour (#476). */
  readonly lighting = this.looks.lighting;
  /** Heure d'allumage de la lampe du bac affiché (#584). */
  readonly lampOn = this.looks.lampOn;
  /** Distributeur automatique du bac affiché (#583) ; `null` : aucun. */
  readonly feeder = this.looks.feeder;
  /** Vrai si un distributeur peut être posé dans le bac affiché (#583). */
  readonly feederAvailable = computed(() => hasFeeder(this.environment()));
  /** Ligne « Lampe » du tableau de bord (#584) ; `null` pour un bac sans lampe réglable. */
  readonly lampReadout = computed(() =>
    shownLampReadout(this.environment(), { lighting: this.lighting(), lampOn: this.lampOn() }),
  );
  /**
   * Suivi du bac affiché hors du monde (#511, #512, #513, #581, #696) : entretien, historique
   * de l'eau, journal et parcours guidé, `TankRecordsController`.
   */
  private readonly records = new TankRecordsController({ isCapture: () => this.capture });
  /**
   * Réglages de l'eau, du courant et de l'entretien (#207, #460, #476, #583, #696) ; public :
   * le gabarit y règle les saisons du bassin (#864, `readouts.pondSeasons`).
   */
  readonly settingsCtl = new WaterSettingsController({
    world: () => this.currentWorld,
    isCapture: () => this.capture,
    records: this.records,
    currentLevel: () => this.current(),
    refreshWater: () => this.refreshWater(),
    refreshCurrent: (world) => this.readouts.refreshCurrent(world),
    saveNow: () => this.saveNow(),
    scheduleFrame: () => this.scheduleFrame(),
  });
  /** Raclette, sécateur, épuisette et clics sur le bac (#476, #477, #582, #696). */
  private readonly tools: TankToolsController = new TankToolsController({
    probe: this.probe,
    world: () => this.currentWorld,
    isCapture: () => this.capture,
    applyWaterSetting: (apply) => this.settingsCtl.apply(apply),
    records: this.records,
    refreshPopulation: () => this.readouts.refreshPopulation(),
    editor: {
      editing: () => this.decorEditing(),
      editAt: (pick) => this.editAt(pick),
    },
    care: {
      isCutting: () => this.care.isCutting(),
      cutPlant: (index) => this.cutCarePlant(index),
      isSiphoning: () => this.care.isSiphoning(),
    },
    feed: (x, z) => this.feed(x, z),
  });
  /** Vrai tant que la raclette est en main (#476) : un clic sur le bac racle. */
  readonly scraping = this.tools.scraping;
  /** Vrai tant que le sécateur est en main (#477) : un clic sur une plante à tige la taille. */
  readonly pruning = this.tools.pruning;
  /**
   * Photo PNG, images de la séance et de l'album (#479, #503, #624, #696, #860) :
   * `PhotoController` ; l'album photo lui demande ses images (`albumShot`).
   */
  readonly photo = new PhotoController({
    document: this.document,
    view: () => this.view,
    isCapture: () => this.capture,
    isStopped: () => this.stopped,
    worldTime: () => this.currentWorld?.time ?? null,
  });
  /** Message bref de la photo (#503), affiché au-dessus de la barre des vues. */
  readonly photoNotice = this.photo.notice;
  /**
   * Séance d'entretien guidée (#604, #694, ADR 0154) : état et étapes dans son contrôleur,
   * qui passe par ces ports pour le monde, la vue, le stockage et la photo.
   */
  private readonly care = new CareSessionController({
    world: () => this.currentWorld,
    view: () => this.view,
    isCapture: () => this.capture,
    storage: () => this.saveStorage,
    applyWaterSetting: (apply) => this.settingsCtl.apply(apply),
    recordMaintenance: (world, task) => this.records.recordMaintenance(world, task),
    journalOf: (world) => this.records.journalOf(world),
    waterHistoryOf: (world) => this.records.waterHistoryOf(world),
    playSound: (kind) => this.ambientSound.playCareSound(kind),
    publishStep: (step) => this.probe.publishCareSession(step),
    publishFood: (world) => this.probe.publishFood(world),
    refreshWater: () => this.refreshWater(),
    saveNow: () => this.saveNow(),
    scheduleFrame: () => this.scheduleFrame(),
    tools: {
      scraping: () => this.scraping(),
      toggleScraper: () => this.toggleScraper(),
      pruning: () => this.pruning(),
      togglePruner: () => this.togglePruner(),
    },
    photo: {
      dataUrl: (pixels) => this.photo.dataUrl(pixels),
      download: (image, name) => this.photo.download(image, name),
      failed: () => this.photo.failed(),
      clearNotice: () => this.photo.setNotice(null),
    },
  });
  /** Séance d'entretien guidée affichée (#604), `null` hors séance. */
  readonly careSession = this.care.session;
  /** Plaques d'algues visibles, pour la consigne de l'étape « vitres » (#604). */
  readonly visibleAlgae = this.looks.visibleAlgae;
  /** Conditionneur versé dans le seau à l'étape « eau neuve » (#605). */
  readonly careConditioner = this.care.conditioner;
  /** Écart de température du seau avec le bac à l'étape « eau neuve », en °C (#605). */
  readonly careBucketGap = this.care.bucketGap;
  /** Efficacité du filtre du bac (0 à 1), pour la consigne de l'étape « filtre » (#606). */
  readonly careFilter = this.care.filter;
  /** Le bac a une plante à tailler (#623) : étape « taille » et sa ligne au bilan. */
  readonly carePrunable = this.care.prunable;
  /** Une plante du bac a une pousse à couper (#644, `worldHasCuttablePlants`). */
  readonly careCuttable = this.care.cuttable;
  /** Avant / après du bilan (#624), `null` sans comparaison. */
  readonly careComparison = this.care.comparison;
  /** Animaux désignés par les alertes et leur mise en évidence (#483, #696). */
  private readonly alerts = new AlertHighlightController({
    probe: this.probe,
    view: () => this.view,
    world: () => this.currentWorld,
    isCapture: () => this.capture,
  });
  /** Animaux désignés par chaque alerte (#483), relevés avec l'eau. */
  readonly alertAnimals = this.alerts.alertAnimals;
  /** Nombre d'animaux mis en évidence depuis une alerte (#483) ; 0 : aucun. */
  readonly highlightedAnimals = this.alerts.highlightedAnimals;
  /**
   * Soins de l'eau du bac affiché (#361, #529, #530, #531, #533, #564, #696) : gestes,
   * pharmacie et test de l'eau, `WaterCareController`.
   */
  private readonly waterCare = new WaterCareController({
    world: () => this.currentWorld,
    isCapture: () => this.capture,
    journalOf: (world) => this.records.journalOf(world),
    refreshWater: () => this.refreshWater(),
    saveNow: () => this.saveNow(),
    scheduleFrame: () => this.scheduleFrame(),
  });
  /** Traitement des points blancs en cours (#361), relevé avec l'eau ; `null` : aucun. */
  readonly treatment = this.waterCare.treatment;
  /** Produits de la pharmacie du bac affiché (#533), relevés avec l'eau. */
  readonly pharmacy = this.waterCare.pharmacy;
  /** Test de l'eau du bac affiché (#564), relevé avec l'eau ; `null` : aucun test lancé. */
  readonly waterTest = this.waterCare.waterTest;
  /** Calendrier d'entretien du bac affiché (#513) ; `null` en capture. */
  readonly maintenance = this.records.maintenance;
  /** Historique de l'eau du bac affiché (#511), recopié à chaque relevé nouveau ; `null` en capture. */
  readonly waterHistory = this.records.waterHistory;
  /** Journal du bac affiché (#581), du plus récent au plus ancien ; vide en capture. */
  readonly journal = this.records.journal;
  /** Bilan de reproduction des derniers jours (#677) ; `null` en capture. */
  readonly reproduction = this.records.reproduction;
  /** Parcours « Mon premier aquarium » du bac affiché (#512) ; `null` : non proposé. */
  readonly firstTankPath = this.records.firstTankPath;
  /** Message du dernier geste de soin (#361) ; `null` : aucun depuis le dernier changement de bac. */
  readonly treatmentNotice = this.waterCare.notice;

  /**
   * Sauvegarde automatique, export, import et partage par lien (#70, #426, #696) :
   * `SaveShareController`.
   */
  private readonly saves = new SaveShareController({
    document: this.document,
    storage: this.saveStorage,
    world: () => this.currentWorld,
    hasView: () => this.view !== null,
    isCapture: () => this.capture,
    isStopped: () => this.stopped,
    settings: () => this.settings(),
    saveText: (world) => this.saveText(world),
    beforeExport: (world) => this.records.keepFirstTankPath(world as MutableWorld),
    beforeAutosave: () => {
      this.records.keepMaintenanceStart(this.currentWorld);
      if (this.currentWorld) {
        this.records.keepFirstTankPath(this.currentWorld);
      }
    },
    load: (result) => this.startup.loadImported(result),
    tankCount: () => this.tanks.roomState?.tanks.length ?? 1,
    publishSave: (status) => this.probe.publishSave(status),
    onCleanup: (cleanup) => this.cleanups.push(cleanup),
  });
  /**
   * État de la sauvegarde automatique (#70) : `null` en mode capture (jamais de lecture ni
   * d'écriture du stockage) et avant le démarrage.
   */
  readonly saveStatus = this.saves.status;
  /** Dernier message de la section « Sauvegarde » (import refusé, import réussi…). */
  readonly saveMessage = this.saves.message;
  /** Dernier lien de partage produit par « Partager » (#426), `null` sinon. */
  readonly shareLink = this.saves.shareLink;
  /** Aquarium reçu par un lien (#426) : proposition d'import ou refus lisible, `null` sinon. */
  readonly shareOffer = this.saves.shareOffer;

  /** Édition du décor (#167, #168, #170, #695, ADR 0155) : `DecorEditingController`. */
  private readonly decorEdit: DecorEditingController = new DecorEditingController({
    world: () => this.currentWorld,
    view: () => this.view,
    isCapture: () => this.capture,
    loadPhysics: () => this.physicsLoader(),
    probe: this.probe,
    decorVisible: () => this.decorVisible(),
    showDecor: () => this.setDecorVisible(true),
    decorChanged: (world) => this.looks.refreshPlants(world),
    room: {
      selection: () => this.roomEdit.selection(),
      editable: () => this.roomEdit.editable(),
      clearSelection: () => this.roomEdit.clearSelection(),
      select: (index) => this.roomEdit.select(index),
      add: (kind, x, z) => this.roomEdit.add(kind, x, z),
      turnSelected: (steps) => this.roomEdit.turnSelected(steps),
      deleteSelected: () => this.roomEdit.deleteSelected(),
    },
    saveNow: () => this.saveNow(),
    scheduleFrame: () => this.scheduleFrame(),
  });

  /** Édition de la pièce graphique (#188, #695, ADR 0155) : `RoomEditingController`. */
  private readonly roomEdit: RoomEditingController = new RoomEditingController({
    room: () => this.room(),
    applyRoom: (room) => this.display.applyRoom(room),
    dimensions: () => (this.currentWorld ? placeDimensions(this.currentWorld) : DEFAULT_TANK),
    obstacles: () => (this.tanks.roomState === null ? [] : layoutFootprints(this.tanks.roomState)),
    view: () => this.view,
    probe: this.probe,
    editor: {
      editing: () => this.decorEdit.editing(),
      setRefused: (refused) => this.decorEdit.refused.set(refused),
      hideDecorSelection: () => this.decorEdit.showSelection(null),
      deselectAll: () => this.decorEdit.select(null),
    },
    saveNow: () => this.saveNow(),
    scheduleFrame: () => this.scheduleFrame(),
  });

  /** Mode édition du décor (#167) : les clics sur le bac posent ou choisissent un élément. */
  readonly decorEditing = this.decorEdit.editing;
  /** Vrai si le décor de l'environnement courant est modifiable (bac tropical, #167). */
  readonly decorEditable = this.decorEdit.editable;
  /** Outil courant de l'éditeur de décor (#167). */
  readonly decorTool = this.decorEdit.tool;
  /** Indice de l'élément de la pièce sélectionné (#188), `null` sinon. */
  readonly roomSelection = this.roomEdit.selection;
  /** Vrai si la pièce est dessinée, donc modifiable en mode édition (#188). */
  readonly roomEditable = this.roomEdit.editable;
  /** Nombre d'éléments de la pièce (#188). */
  readonly roomCount = this.roomEdit.count;
  /** Indice de l'élément de décor sélectionné (#167), `null` sinon. */
  readonly decorSelection = this.decorEdit.selection;
  /** Nombre d'éléments du décor (#167). */
  readonly decorCount = this.decorEdit.count;
  /** Vrai si la dernière pose demandée a été refusée (#168) : `DecorEditingController.refused`. */
  readonly decorRefused = this.decorEdit.refused;
  /** État du moteur de chute (#170), chargé à la première ouverture de l'éditeur. */
  readonly decorPhysics = this.decorEdit.physics;
  /** Vrai si le dernier élément lâché a été posé sur le sable faute de moteur (#170). */
  readonly decorDropGrounded = this.decorEdit.dropGrounded;

  /** Catalogue « Bacs et meubles » de la pièce de N bacs (#305, #695) : `RoomLayoutController`. */
  private readonly roomLayout: RoomLayoutController = new RoomLayoutController({
    world: () => this.currentWorld,
    isCapture: () => this.capture,
    editable: () => this.roomEdit.editable(),
    roomState: () => this.tanks.roomState,
    setRoomState: (room) => this.tanks.setRoomState(room),
    syncRoomState: (world) => this.tanks.sync(world),
    selectedTankId: () => this.tanks.selectedTankId,
    forgetStashed: (environment) => this.tanks.forgetStashed(environment),
    room: () => this.room(),
    redrawRoom: () => this.display.applyRoom(this.room()),
    probe: this.probe,
    saveNow: () => this.saveNow(),
    scheduleFrame: () => this.scheduleFrame(),
  });

  /** Bacs et meubles supports de la pièce de N bacs (#305), pour le catalogue. */
  readonly roomCatalog = this.roomLayout.catalog;

  /**
   * Bacs de la pièce vus du bac affiché (#264, #306, #316, #547, #696) : pièce et mondes rangés,
   * rattrapage, liste, quarantaine et transferts, `TankRoomController`.
   */
  private readonly tanks: TankRoomController = new TankRoomController({
    world: () => this.currentWorld,
    hasView: () => this.view !== null,
    isCapture: () => this.capture,
    dayClock: () => this.dayClock,
    records: this.records,
    layout: {
      refresh: () => this.roomLayout.refreshCatalog(this.roomLayout.catalog().message),
      floor: (world) => this.roomLayout.floor(world),
      commit: (room) => this.roomLayout.commit(room, null),
    },
    publishSelectedTank: (id) => this.probe.publishSelectedTank(id),
    finishDrop: () => this.decorEdit.finishDrop(),
    showEnvironment: (id) => this.setEnvironment(id),
    refreshPopulation: () => this.readouts.refreshPopulation(),
    refreshWater: () => this.refreshWater(),
    saveNow: () => this.saveNow(),
    scheduleFrame: () => this.scheduleFrame(),
  });

  /**
   * Liste des bacs de la pièce (#306, lot 3) : nom, environnement, litrage, animaux et pire
   * gravité d'alerte de chaque bac, bac sélectionné compris (relevé à chaque relevé de l'eau).
   */
  readonly tankList = this.tanks.tankList;
  /** Bacs de quarantaine possibles et malades du bac affiché (#547), relevés avec la liste. */
  readonly quarantine = this.tanks.quarantine;

  /** Message du dernier transfert ou renommage (#306, #318), `null` avant tout geste. */
  readonly tankNotice = this.tanks.notice;

  /** Environnement, dimensions du bac et forme du bassin (#87, #171, #190, #696). */
  private readonly place = new TankPlaceController({
    probe: this.probe,
    world: () => this.currentWorld,
    setWorld: (world) => {
      this.currentWorld = world;
    },
    view: () => this.view,
    isCapture: () => this.capture,
    tanks: this.tanks,
    refuse: (reason) => this.roomLayout.refuse(reason),
    finishDrop: () => this.decorEdit.finishDrop(),
    renderTime: () => this.painter.renderTime(),
    resetLoopClock: () => this.loop.resetClock(),
    carryClock: (fromTime) => this.clock.carryFrom(fromTime),
    relight: () => this.painter.relight(),
    readouts: this.readouts,
    refreshWater: () => this.refreshWater(),
    createView: (preset) => this.createView(preset),
    activePreset: () => this.activePreset(),
    decorSelection: () => this.decorSelection(),
    saveNow: () => this.saveNow(),
    scheduleFrame: () => this.scheduleFrame(),
  });

  /** Effectifs, nourriture et mode du bac affiché (#67, #69, #278, #392, #696). */
  private readonly animals = new PopulationController({
    probe: this.probe,
    world: () => this.currentWorld,
    isCapture: () => this.capture,
    tanks: () => this.tanks,
    records: () => this.records,
    refreshPopulation: () => this.readouts.refreshPopulation(),
    refreshWater: () => this.refreshWater(),
    saveNow: () => this.saveNow(),
    scheduleFrame: () => this.scheduleFrame(),
  });

  /** Création de la vue du monde affiché et de ses rappels (#696) : `ViewBuilder`. */
  private readonly viewBuilder = new ViewBuilder({
    probe: this.probe,
    rendererFactory: this.rendererFactory,
    controllers: () => ({
      display: this.display,
      readouts: this.readouts,
      looks: this.looks,
      painter: this.painter,
      free: this.free,
      care: this.care,
      decorEdit: this.decorEdit,
      roomEdit: this.roomEdit,
      tools: this.tools,
    }),
    canvas: () => this.canvasRef().nativeElement,
    world: () => this.currentWorld,
    view: () => this.view,
    setView: (view) => {
      this.view = view;
    },
    pixelRatio: () => this.pixelRatio,
    interactive: () => !this.capture && !this.wallpaper,
    filter: () => this.filter(),
    setActivePreset: (preset) => this.activePreset.set(preset),
    viewCleanups: this.viewCleanups,
  });

  /** Séquence de démarrage : URL, scène, services, première vue et caméra (#696). */
  private readonly startup = new StartupSequence({
    document: this.document,
    saveStorage: this.saveStorage,
    probe: this.probe,
    signals: {
      speed: this.speed,
      foodStyle: this.foodStyle,
      room: this.room,
      rain: this.rain,
      filter: this.filter,
      soundAllowed: this.soundAllowed,
    },
    controllers: () => ({
      display: this.display,
      clock: this.clock,
      saves: this.saves,
      tanks: this.tanks,
      roomLayout: this.roomLayout,
      waterCare: this.waterCare,
      readouts: this.readouts,
      decorEdit: this.decorEdit,
      roomEdit: this.roomEdit,
      free: this.free,
      loop: this.loop,
    }),
    isStopped: () => this.stopped,
    setMode: (mode) => {
      this.capture = mode.capture;
      this.captureFouling = mode.fouling;
      this.wallpaper = mode.wallpaper;
    },
    isWallpaper: () => this.wallpaper,
    setWallpaperFps: (fps) => {
      this.wallpaperFps = fps;
    },
    forbidSound: () => this.ambientSound.forbid(),
    dayClock: () => this.dayClock,
    setDayClock: (clock) => {
      this.clock.dayClock = clock;
    },
    setWorld: (world) => {
      this.currentWorld = world;
    },
    setPixelRatio: (ratio) => {
      this.pixelRatio = ratio;
    },
    decorVisible: () => this.decorVisible(),
    relight: () => this.painter.relight(),
    refreshWater: () => this.refreshWater(),
    createView: (preset) => this.createView(preset),
    view: () => this.view,
    clearActivePreset: () => this.activePreset.set(null),
    onCleanup: (cleanup) => this.cleanups.push(cleanup),
    scheduleFrame: () => this.scheduleFrame(),
  });

  /** État courant de la simulation (`null` avant le démarrage et après la destruction). */
  get world(): World | null {
    return this.currentWorld;
  }

  /** Nombre de bulles affichées à la dernière image (tests de bout en bout). */
  get bubbleCount(): number {
    return this.view?.bubbleCount ?? 0;
  }

  /** Facteur d'interpolation du rendu entre les deux derniers pas, dans [0, 1). */
  get interpolationAlpha(): number {
    return this.loop.alpha;
  }

  /**
   * Amène la caméra sur un préréglage (barre de vues, raccourcis clavier) : transition courte
   * hors capture, placement instantané en mode capture (déterminisme du contrat).
   */
  goToPreset(preset: CameraPreset): void {
    const view = this.view;
    if (!view) {
      return;
    }
    // Depuis la caméra libre (#343), la vue part de la pose libre vers le préréglage ; le
    // préréglage choisi vaut retour à l'orbite pour la préférence d'affichage (#344).
    this.free.leaveForPreset();
    this.activePreset.set(preset);
    const seconds = presetTransitionSeconds(this.display.reducedMotion(), this.capture);
    view.animateToPreset(preset, seconds);
    if (!view.transitioning) {
      this.probe.publishCamera(this.view);
    }
    this.scheduleFrame();
  }

  /**
   * Change le filtre de rendu à chaud (bouton « Pixel art », touche `P`) : la simulation, la
   * caméra et la vue ne sont pas réinitialisées. Le choix est mémorisé s'il est possible de
   * l'écrire, sinon il reste en mémoire pour la session (repli silencieux).
   */
  setFilter(filter: RenderFilter): void {
    this.display.setFilter(filter);
  }

  /** Heure de la journée affichée, dans [0, 24) (`null` avant le démarrage). */
  get hour(): number | null {
    return this.clock.hour();
  }

  /**
   * Fige l'heure ou la remet en marche (touche `H`), sans saut d'heure. Sans effet en mode
   * capture (l'heure y est toujours figée : contrat de capture).
   */
  toggleClock(): void {
    this.clock.toggle();
  }

  /**
   * Remet l'heure en marche (`true`) ou la fige (`false`) : case « Heure automatique » du
   * panneau de contrôle (#52). Sans effet si l'horloge est déjà dans l'état demandé.
   */
  setClockRunning(running: boolean): void {
    this.clock.setRunning(running);
  }

  /**
   * Change la vitesse de simulation (#52) : le pas fixe ne change pas, seul le temps réel
   * versé à la boucle est multiplié. À 0, le monde ne bouge plus mais le rendu continue.
   * Sans effet en mode capture (le monde y est figé), avant le démarrage, ou pour une
   * vitesse hors de `SIM_SPEEDS`.
   */
  setSpeed(speed: number): void {
    this.clock.setSpeed(speed);
  }

  /**
   * Affiche ou masque le décor (#52) sans le détruire. La simulation n'est pas touchée :
   * rochers et plantes restent des obstacles (ADR 0024). Sans effet en mode capture ou
   * avant le démarrage.
   */
  setDecorVisible(visible: boolean): void {
    this.display.setDecorVisible(visible);
  }

  /** Caméra libre ou orbite (#343, ADR 0084) : `FreeCameraController.toggle`. */
  toggleFreeCamera(): void {
    this.free.toggle();
  }

  /** Déplacement de la caméra libre tenu à un bouton (#344) : `FreeCameraController`. */
  setFreeMoveHeld(move: FreeMoveId, held: boolean): void {
    this.free.setMoveHeld(move, held);
  }

  /**
   * Affiche ou masque la pièce autour du bac (#187) : sol, mur et meuble support, sans
   * effet sur la simulation. Le choix est enregistré avec la sauvegarde, même hors du bac
   * tropical, où la pièce n'est pas dessinée. Sans effet en mode capture (`piece=`) ou avant
   * le démarrage.
   */
  setRoomShown(shown: boolean): void {
    this.display.setRoomShown(shown);
  }

  /**
   * Fait pleuvoir ou arrête la pluie (#106) : gouttes, ronds à la surface et nénuphars qui
   * frémissent. Sans effet hors du bassin (`Environment.rain`),
   * en mode capture (`pluie=`) ou avant le démarrage. Rien n'est sauvegardé. Le ciel couvert
   * suit en fondu (issue #338), avancé par la boucle de rendu.
   */
  setRain(enabled: boolean): void {
    this.display.setRain(enabled);
  }

  /** Alterne pluie et beau temps (touche `R`, #106). */
  toggleRain(): void {
    this.display.setRain(!this.rain());
  }

  /**
   * Change le rendu des granulés (#117) à chaud, sans toucher au monde ni à la caméra ; le
   * choix est enregistré avec la sauvegarde. Sans effet en mode capture (`granules=`) ou
   * avant le démarrage.
   */
  setFoodStyle(style: FoodStyle): void {
    this.display.setFoodStyle(style);
  }

  /**
   * Règle la force du courant du bac (#460, ADR 0108), puis enregistre. Sans effet en mode
   * capture (le courant passe par `courant=`), avant le démarrage ou pour une force inconnue.
   */
  setCurrent(level: CurrentLevel): void {
    this.settingsCtl.setCurrent(level);
  }

  /** Force suivante du courant (bouton du panneau, #460) : coupé, doux, fort. */
  cycleCurrent(): void {
    this.settingsCtl.cycleCurrent();
  }

  private readonly currentScratch: CurrentVelocity = { x: 0, z: 0 };

  /** Alterne entre granulés en points et en voxels (bouton du panneau, #117). */
  toggleFoodStyle(): void {
    this.display.toggleFoodStyle();
  }

  /**
   * Règle l'effectif d'une espèce (#69), ramené à ses bornes : les poissons ajoutés naissent
   * à une position valide, les plus récents sont retirés ; ni le temps ni le décor ne sont
   * réinitialisés. Sans effet en mode capture (les effectifs passent par `population=`),
   * avant le démarrage, pour une espèce inconnue ou absente de l'environnement (#88, sauf en
   * mode décor, #278), ou un
   * effectif qui n'est pas un entier positif ou nul.
   */
  setPopulation(species: SpeciesId, count: number): void {
    this.animals.setPopulation(species, count);
  }

  /**
   * Changement d'eau (#207) : retire une part des composés dissous (`changeWorldWaterInPlace`),
   * puis enregistre. Sans effet en mode capture ou avant le démarrage.
   */
  changeWater(): void {
    this.settingsCtl.changeWater();
  }

  /** Marque faite une tâche d'entretien sans geste dans le jeu (filtre, test de l'eau, #513). */
  markMaintenanceDone(task: MaintenanceTask): void {
    this.settingsCtl.markMaintenanceDone(task);
  }

  /** Geste de soin contre les points blancs (#361) : `WaterCareController.treat`. */
  treat(kind: TreatmentKind): void {
    this.waterCare.treat(kind);
  }

  /** Lance un test de l'eau `kit` (#564) : `WaterCareController.startWaterTest`. */
  startWaterTest(kit: WaterKit): void {
    this.waterCare.startWaterTest(kit);
  }

  /** Dose de conditionneur `kind` (#530) : `WaterCareController.doseConditioner`. */
  doseConditioner(kind: ConditionerKind): void {
    this.waterCare.doseConditioner(kind);
  }

  /** Eau du robinet traitée ou non (#530) : `WaterCareController.toggleUntreatedTap`. */
  toggleUntreatedTap(): void {
    this.waterCare.toggleUntreatedTap();
  }

  /** Charbon actif posé ou retiré (#531) : `WaterCareController.toggleCarbon`. */
  toggleCarbon(): void {
    this.waterCare.toggleCarbon();
  }

  /** Dose de régulateur de pH (#531) : `WaterCareController.dosePhRegulator`. */
  dosePhRegulator(direction: PhRegulatorDirection): void {
    this.waterCare.dosePhRegulator(direction);
  }

  /** Dose d'amorce de bactéries (#529) : `WaterCareController.doseBacteriaStarter`. */
  doseBacteriaStarter(): void {
    this.waterCare.doseBacteriaStarter();
  }

  /**
   * Règle la consigne du chauffage (#207), en °C, arrondie au dixième ; l'eau la rejoint peu à
   * peu. Enregistrée avec l'eau. Sans effet en mode capture, avant le démarrage ou hors de
   * [`MIN_HEATER_TEMPERATURE`, `MAX_HEATER_TEMPERATURE`].
   */
  setHeater(temperature: number): void {
    this.settingsCtl.setHeater(temperature);
  }

  /**
   * Durée d'éclairage du bac (#476), en heures entières par jour (0 à 24 ; 4 à 14 au panneau, #584) : au-delà de 10 h,
   * les algues poussent. Enregistrée avec l'eau. Sans effet en mode capture, avant le
   * démarrage ou hors bornes.
   */
  setLighting(hours: number): void {
    this.settingsCtl.setLighting(hours);
  }

  /**
   * Heure d'allumage de la lampe du bac (#584), heure entière de 0 à 23 : la lampe reste
   * allumée pendant la durée d'éclairage. Enregistrée avec l'eau. Sans effet en mode capture,
   * avant le démarrage ou hors bornes.
   */
  setLampOn(hour: number): void {
    this.settingsCtl.setLampOn(hour);
  }

  /**
   * Pose, règle ou retire le distributeur automatique (#583) : `null` le retire ; 1 à 4 heures
   * entières le posent plein, ou changent ses heures sans toucher à sa réserve. Enregistré
   * avec le bac. Sans effet en mode capture, avant le démarrage, hors bornes ou dans un bac
   * sans distributeur possible.
   */
  setFeeder(hours: readonly number[] | null): void {
    this.settingsCtl.setFeeder(hours);
  }

  /** Remplit le distributeur automatique (#583) : 14 rations. Sans effet sans distributeur. */
  refillFeeder(): void {
    this.settingsCtl.refillFeeder();
  }

  /**
   * Prend ou pose la raclette (#476) : tant qu'elle est en main, un clic sur le bac retire la
   * plaque d'algues visée au lieu de nourrir. Sans effet en mode capture.
   */
  toggleScraper(): void {
    this.tools.toggleScraper();
  }

  /**
   * Prend ou pose le sécateur (#477) : tant qu'il est en main, un clic sur une plante à tige la
   * taille au lieu de nourrir ; prendre le sécateur pose la raclette. Sans effet en mode capture.
   */
  togglePruner(): void {
    this.tools.togglePruner();
  }

  /**
   * Taille (#477) la plante à tige d'indice `index` du décor : renvoie vrai si elle a
   * raccourci (faux pour un autre élément, une plante sans pousse visible, en mode capture ou
   * avant le démarrage). Enregistré avec l'eau.
   */
  prunePlant(index: number): boolean {
    return this.tools.prunePlant(index);
  }

  /**
   * Raclette (#476) : retire la plaque d'algues touchée la première par le rayon (`origin`,
   * `direction`, repère du bac), sans toucher aux poissons. Renvoie l'indice de la plaque
   * retirée, `-1` si aucune (ou en mode capture, avant le démarrage).
   */
  scrapeAlong(
    origin: readonly [number, number, number],
    direction: readonly [number, number, number],
  ): number {
    return this.tools.scrapeAlong(origin, direction);
  }

  /** Ouvre ou reprend la séance d'entretien guidée (#604, ADR 0138) : `CareSessionController`. */
  openCareSession(): void {
    this.care.open();
  }

  /** Vrai tant que l'image « avant » de la séance est gardée en mémoire (#624). */
  hasCareBefore(): boolean {
    return this.care.hasBefore();
  }

  /** Enregistre la photo avant / après du bilan (#624). */
  saveCareComparison(): boolean {
    return this.care.saveComparison();
  }

  /** Termine l'étape affichée de la séance (#604). */
  completeCareSessionStep(): void {
    this.care.completeStep();
  }

  /** Coupe de l'étape « taille » (#623) ; vrai si une partie a été coupée. */
  cutCarePlant(index: number): boolean {
    return this.care.cutPlant(index);
  }

  /** Choix de l'eau de rinçage de l'éponge (#606). */
  chooseCareRinse(rinse: FilterRinseWater): void {
    this.care.chooseRinse(rinse);
  }

  /** Un seau d'eau neuve de plus (#605). */
  pourCareBucket(): void {
    this.care.pourBucket();
  }

  /** Saute l'étape affichée de la séance (#604). */
  skipCareSessionStep(): void {
    this.care.skipStep();
  }

  /** Ferme la séance (#604) : interrompue, elle reprendra ; finie, elle est oubliée. */
  closeCareSession(): void {
    this.care.close();
  }

  /**
   * Épuisette (#582) : retire le corps touché le premier par le rayon (`origin`, `direction`,
   * repère du bac), ce qui arrête sa pollution. Renvoie vrai si un corps a été retiré (jamais
   * en mode capture, ni avant le démarrage).
   */
  netAlong(
    origin: readonly [number, number, number],
    direction: readonly [number, number, number],
  ): boolean {
    return this.tools.netAlong(origin, direction);
  }

  /**
   * Nombre de feuilles de catappa dans le bac (#239), de 0 à `MAX_CATAPPA_LEAVES` : ajoute des
   * feuilles neuves ou retire d'abord les plus décomposées. Enregistré avec l'eau. Sans effet
   * en mode capture, avant le démarrage ou hors bornes.
   */
  setCatappa(count: number): void {
    this.settingsCtl.setCatappa(count);
  }

  /** Change d'environnement (#87, #277, ADR 0063) : `TankPlaceController.setEnvironment`. */
  setEnvironment(id: string): void {
    this.place.setEnvironment(id);
  }

  /** Règle les dimensions du bac (#171, ADR 0047) : `TankPlaceController.setTankDimensions`. */
  setTankDimensions(dims: TankDimensions): void {
    this.place.setTankDimensions(dims);
  }

  /** Règle la forme du bassin (#190, ADR 0080) : `TankPlaceController.setPondShape`. */
  setPondShape(shape: PondShape): void {
    this.place.setPondShape(shape);
  }

  /**
   * Fige l'heure à `hour` (touches « plein jour » et « nuit », issue #75), que l'horloge
   * tourne ou non ; `toggleClock` la remet ensuite en marche depuis cette heure, sans saut.
   * Sans effet en mode capture (contrat de capture) ou si `hour` n'est pas un réel fini.
   */
  freezeClockAt(hour: number): void {
    this.clock.freezeAt(hour);
  }

  /**
   * Dépose des granulés autour de (x, z), dans le repère du bac (clic sur l'eau, issue #67).
   * Sans effet en mode capture (image figée : les dépôts passent par `nourrir=`), avant le
   * démarrage, ou pour un point hors du bac.
   */
  feed(x: number, z: number): void {
    this.animals.feed(x, z);
  }

  /** Entre en mode édition du décor ou en sort (#167) : `DecorEditingController.setEditing`. */
  setDecorEditing(editing: boolean): void {
    this.decorEdit.setEditing(editing);
  }

  /** Outil de l'éditeur (#167, #188) : `DecorEditingController.setTool`. */
  setDecorTool(tool: string): void {
    this.decorEdit.setTool(tool);
  }

  /** Sélectionne un élément du décor, ou aucun (#167) : `DecorEditingController.select`. */
  selectDecor(index: number | null): void {
    this.decorEdit.select(index);
  }

  /** Sélectionne un élément de la pièce, ou aucun (#188) : `RoomEditingController.select`. */
  selectRoomItem(index: number | null): void {
    this.roomEdit.select(index);
  }

  /** Supprime la sélection, du décor ou de la pièce (#167, #188) ; `true` si supprimée. */
  deleteSelectedDecor(): boolean {
    return this.decorEdit.deleteSelected();
  }

  /** Clic en mode édition (#167, #188) : `DecorEditingController.editAt`. */
  editAt(pick: DecorPick): void {
    this.decorEdit.editAt(pick);
  }

  /** Tourne la sélection (#168, #188) ; `true` si la pose a changé. */
  rotateSelectedDecor(steps: number): boolean {
    return this.decorEdit.rotateSelected(steps);
  }

  /** Agrandit ou réduit la sélection du décor (#168) ; `true` si la pose a changé. */
  scaleSelectedDecor(steps: number): boolean {
    return this.decorEdit.scaleSelected(steps);
  }

  /** Début du glissement d'un élément du décor (#168). */
  startDecorDrag(index: number): void {
    this.decorEdit.startDrag(index);
  }

  /** Glissement d'un élément du décor (#168). */
  moveDecorDrag(index: number, x: number, z: number): void {
    this.decorEdit.moveDrag(index, x, z);
  }

  /** Fin du glissement d'un élément du décor (#168, #170). */
  endDecorDrag(index: number, commit: boolean): void {
    this.decorEdit.endDrag(index, commit);
  }

  /** Début du glissement d'un élément de la pièce (#188). */
  startRoomDrag(index: number): void {
    this.roomEdit.startDrag(index);
  }

  /** Glissement d'un élément de la pièce (#188). */
  moveRoomDrag(index: number, x: number, z: number): void {
    this.roomEdit.moveDrag(index, x, z);
  }

  /** Fin du glissement d'un élément de la pièce (#188). */
  endRoomDrag(index: number, commit: boolean): void {
    this.roomEdit.endDrag(index, commit);
  }

  /** Dépose des granulés au centre du bac (bouton « Nourrir », touche `G`). */
  feedAtCenter(): void {
    this.feed(0, 0);
  }

  /**
   * Télécharge une photo PNG du bac dans la vue courante (bouton « Photo », #479, ADR 0112) :
   * `PhotoController.take`. Renvoie `true` si la photo a été produite ; ne lève jamais.
   */
  takePhoto(): boolean {
    return this.photo.take();
  }

  /** Réglages enregistrés avec le monde : vitesse, horloge et rendu des granulés. */
  private settings(): SaveSettings {
    return {
      speed: this.speed(),
      clock: this.dayClock,
      foodStyle: this.foodStyle(),
      room: this.room(),
    };
  }

  /** Sauvegarde automatique immédiate (#70) : `SaveShareController.saveNow`. */
  saveNow(): SaveStatus | null {
    return this.saves.saveNow();
  }

  /** Bouton « Exporter » (#70) : `SaveShareController.exportSave`. */
  exportSave(): void {
    this.saves.exportSave();
  }

  /** Bouton « Importer » (#70) : `SaveShareController.importSave`. */
  importSave(text: string): boolean {
    return this.saves.importSave(text);
  }

  /** Bouton « Partager » (#426, ADR 0105) : `SaveShareController.shareTank`. */
  shareTank(): Promise<void> {
    return this.saves.shareTank();
  }

  /** « Importer cet aquarium » (#426) : `SaveShareController.acceptShare`. */
  acceptShare(): void {
    this.saves.acceptShare();
  }

  /** « Ignorer » ou « Fermer » (#426) : `SaveShareController.dismissShare`. */
  dismissShare(): void {
    this.saves.dismissShare();
  }

  /**
   * Texte de la sauvegarde au schéma 2 (#264, ADR 0069) : la pièce resynchronisée avec le
   * monde affiché (bac sélectionné) et les mondes rangés.
   * @throws RangeError comme `serializeRoom`.
   */
  private saveText(world: World): string {
    this.records.keepWaterHistory(world);
    this.records.keepJournal(world);
    this.tanks.advanceBackground();
    return serializeRoom(this.tanks.sync(world), this.tanks.selectedTankId, this.settings());
  }

  /**
   * Règle le mode du bac affiché (#278) : en décor, eau, faim et santé sont en pause (pas
   * effacées) et toute espèce s'ajoute ; au retour en soins, l'état reprend où il était et
   * les animaux d'un autre milieu sont gardés (lot 1). La confirmation est demandée par le
   * panneau. Sans effet en capture, avant le démarrage, ou pour un mode inconnu.
   */
  setCareMode(mode: CareMode): void {
    this.animals.setCareMode(mode);
  }

  /**
   * « Tout retirer » au retour en soins (#278, lot 2) : retire du bac affiché tous les animaux
   * des espèces `remove` (celles que la confirmation a listées comme inadaptées), puis le
   * repasse en mode soins ; les autres animaux et l'eau reprennent où ils en étaient. Sans
   * effet en capture, avant le démarrage, ou si le bac n'est pas en mode décor.
   */
  returnToCare(remove: readonly SpeciesId[]): void {
    this.animals.returnToCare(remove);
  }

  /** Renomme le bac `id` de la liste (#316) : `TankRoomController.rename`. */
  renameTank(id: number, name: string): void {
    this.tanks.rename(id, name);
  }

  /** Sélectionne le bac `id` de la liste (#306) : `TankRoomController.select`. */
  selectTank(id: number): void {
    this.tanks.select(id);
  }

  /** Transfère un animal vers le bac `toId` (#306) : `TankRoomController.transferAnimal`. */
  transferAnimal(species: string, toId: number): void {
    this.tanks.transferAnimal(species, toId);
  }

  /** Installe un bac de quarantaine (#547) : `TankRoomController.installQuarantine`. */
  installQuarantine(): void {
    this.tanks.installQuarantine();
  }

  /** Soigne le bac posé `id` seul (#547) : `TankRoomController.treatPlacedTank`. */
  treatPlacedTank(id: number, kind: TreatmentKind): void {
    this.tanks.treatPlacedTank(id, kind);
  }

  /** Amorce de bactéries dans le bac posé `id` (#553) : `TankRoomController`. */
  doseStarterInPlacedTank(id: number): void {
    this.tanks.doseStarterInPlacedTank(id);
  }

  /** Ramène un animal du bac posé `fromId` (#547) : `TankRoomController.returnAnimal`. */
  returnAnimal(fromId: number, species: string): void {
    this.tanks.returnAnimal(fromId, species);
  }

  /** Ajoute un meuble support du catalogue (#305) : `RoomLayoutController.addSupport`. */
  addRoomSupport(kind: string): void {
    this.roomLayout.addSupport(kind);
  }

  /** Ajoute un bac vide du catalogue (#305) : `RoomLayoutController.addTank`. */
  addRoomTank(environment: string, size: string, supportId: number | null): void {
    this.roomLayout.addTank(environment, size, supportId);
  }

  /** Retire le bac `id` de la pièce (#305) : `RoomLayoutController.removeTank`. */
  removeRoomTank(id: number): void {
    this.roomLayout.removeTank(id);
  }

  /** Retire le meuble support `id` (#305) : `RoomLayoutController.removeSupport`. */
  removeRoomSupport(id: number): void {
    this.roomLayout.removeSupport(id);
  }

  /** Message d'erreur d'un fichier trop gros pour être lu (contrôle du panneau, #70). */
  rejectImport(text: string): void {
    this.saves.rejectImport(text);
  }

  /** Bascule entre pixel art et rendu sans filtre. */
  toggleFilter(): void {
    this.display.toggleFilter();
  }

  constructor() {
    afterNextRender(() => this.startup.start());
    inject(DestroyRef).onDestroy(() => {
      this.alerts.clear();
      this.stop();
    });
    // Options « Réduire les mouvements » (#406) et « Lune » (#856) : appliquées à chaud à la vue.
    effect(() => {
      this.motionState.system();
      this.motionState.reduced();
      this.moonState.enabled();
      untracked(() => this.display.applyReducedMotion());
    });
    // Sons d'ambiance (#411) : la scène suit l'environnement, le moment de la journée, la
    // pluie et la pause ; jamais en capture (aucune scène, donc silence). Le son ne lit que ces
    // signaux d'affichage, jamais le monde.
    effect(() => {
      const scene: AmbientScene | null = this.soundAllowed()
        ? {
            environment: this.environment(),
            phase: this.dayPhase(),
            rain: this.rain(),
            bubbler: environmentById(this.environment()).bubbles,
            silenced: this.speed() === 0,
          }
        : null;
      untracked(() => this.ambientSound.setScene(scene));
    });
  }

  /** Crée la vue du monde courant sur `preset` (#696) : `ViewBuilder.build`. */
  private createView(preset: CameraPreset): void {
    this.viewBuilder.build(preset);
  }

  private scheduleFrame(): void {
    this.loop.schedule();
  }

  /** Met en évidence les animaux `ids` d'une alerte (#483) : `AlertHighlightController`. */
  highlightAlertAnimals(ids: readonly number[]): void {
    this.alerts.highlight(ids);
  }

  /** Relevé de l'eau du bac affiché (#207) : `TankReadoutsController.refreshWater`. */
  private refreshWater(): void {
    this.readouts.refreshWater();
  }

  private stop(): void {
    this.stopped = true;
    // Plus d'aquarium affiché : plus de scène sonore (le service, racine, survit à l'hôte).
    // Seule écriture de signal ici : `scene` du service, qu'aucun gabarit ni effet ne lit (il
    // n'est consulté que par `apply()`, qui règle le moteur) ; elle ne planifie donc aucune
    // détection de changements.
    this.ambientSound.setScene(null);
    this.photo.dispose();
    this.loop.cancel();
    this.cleanups.splice(0).forEach((cleanup) => cleanup());
    this.viewCleanups.splice(0).forEach((cleanup) => cleanup());
    this.view?.dispose();
    this.view = null;
    this.currentWorld = null;
    this.tanks.setRoomState(null);
    if (this.painter.readySignaled) {
      resetCaptureReady(this.document);
    }
  }
}
