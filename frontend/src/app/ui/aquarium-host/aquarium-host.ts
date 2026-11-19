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

import {
  hasWorldParams,
  parseCaptureParams,
  type CameraPreset,
  type CaptureParams,
} from '../../core/capture/capture-params';
import {
  readStoredSave,
  type SaveStatus,
  type SaveStorage,
} from '../../core/save-storage/save-storage';
import {
  type FilterStorage,
  initialRenderFilter,
  readStoredRenderFilter,
  type RenderFilter,
  toggleRenderFilter,
  writeStoredRenderFilter,
} from '../../core/render-filter/render-filter';
import { markCaptureReady, resetCaptureReady } from '../../core/capture/capture-ready';
import { hasLandedFood } from '../../sim/behaviors';
import { hasShareFragment, readShare } from '../../sim/share-link';
import {
  chooseWallpaperConfig,
  clampWallpaperFps,
  DEFAULT_WALLPAPER_FPS,
  readWallpaperGlobal,
  shouldReadWallpaperFile,
  WALLPAPER_CONFIG_FILE,
  wallpaperGlobalText,
  wallpaperOrbitAngle,
  type WallpaperGlobal,
  type WallpaperSource,
} from '../../core/wallpaper/wallpaper';
import {
  AquariumView,
  createWebGLRenderer,
  type AquariumRendererFactory,
} from '../../render/aquarium-view';
import { presetTransitionSeconds } from '../../render/camera-presets';
import { ReducedMotionState } from '../reduced-motion/reduced-motion-state';
import { AmbientSoundState } from '../ambient-sound/ambient-sound-state';
import type { AmbientScene } from '../../core/ambient-sound/ambient-sound';
import { freeMoveAxesInto, freeMoveFor, type FreeMoveId } from '../../core/commands/commands';
import { isTypingContext } from '../../core/keyboard/keyboard';
import {
  readStoredFreeCamera,
  writeStoredFreeCamera,
} from '../../core/free-camera-pref/free-camera-pref';
import type { DecorPick } from '../../render/decor-pick';
import { isDecorEditable } from '../../sim/decor-edit';
import {
  loadDecorPhysics,
  type DecorPhysicsLoader,
} from '../../core/decor-physics/load-decor-physics';
import { SIM_DT } from '../../sim/constants';
import { EGG_HATCH_TIME } from '../../sim/eggs';
import {
  carryClock,
  createDayClock,
  createDayLight,
  dayPhaseAt,
  type DayPhase,
  DEFAULT_DAY_CLOCK,
  DEFAULT_DAY_LENGTH_SECONDS,
  DEFAULT_START_HOUR,
  freezeClockAt,
  hourAt,
  lightAtInto,
  snapHour,
  toggleClock,
  type DayClock,
} from '../../sim/daylight';
import {
  DEFAULT_ENVIRONMENT_ID,
  environmentById,
  environmentWater,
  hasFlatFloor,
  isEnvironmentId,
  isTankResizable,
  placeDimensions,
  placeEnvironmentData,
  type EnvironmentId,
} from '../../sim/environment';
import {
  stashedList,
  stashFromList,
  switchEnvironment,
  type StashedWorlds,
} from '../../sim/environment-worlds';
import {
  clampTankDimensions,
  DEFAULT_TANK,
  sameDimensions,
  type TankDimensions,
} from '../../sim/tank';
import { setTankDimensionsInPlace } from '../../sim/tank-resize';
import { DEFAULT_POND_SHAPE, type PondShape } from '../../sim/pond-shape';
import { setPondShapeInPlace } from '../../sim/pond-reshape';
import { clampRoom, DEFAULT_ROOM, type Room } from '../../sim/room';
import { DEFAULT_SIM_SPEED, isSimSpeed, type SimSpeed } from '../../sim/sim-speed';
import {
  isSpeciesId,
  NO_FISH,
  populationCounts,
  populationLimits,
  setPopulationInPlace,
  type PopulationCounts,
} from '../../sim/population';
import { parseSaveWorlds, serializeRoom } from '../../sim/room-save';
import {
  addTank,
  findTank,
  MAX_TANK_NAME_LENGTH,
  renameTank,
  stepRoom,
  syncRoom,
  tankResizeRefusal,
  type RoomState,
  type RoomTank,
} from '../../sim/room-state';
import {
  ROOM_ANIMAL_CAP,
  roomAnimalCapRefusal,
  roomAnimalCount,
  roomPopulationLimits,
  roomTankCapRefusal,
} from '../../sim/room-limits';
import { findTankSpot, layoutFootprints, roomLayoutBlocks } from '../../sim/room-layout';
import type { SaveSettings } from '../../sim/save';
import type { AlertSeverity } from '../../sim/dashboard-alerts';
import { addWarningText } from '../../sim/species-sheet';
import { tankList, worldAlerts, worstAlert, type TankListEntry } from '../../sim/tank-list';
import {
  acceptsSpecies,
  careModeOf,
  isCareMode,
  isDecorMode,
  setCareModeInPlace,
  speciesShownIn,
  type CareMode,
} from '../../sim/care-mode';
import { returnToCareInPlace } from '../../sim/care-return';
import { transferFish } from '../../sim/tank-transfer';
import {
  QUARANTINE_ACCLIMATION_REMINDER,
  QUARANTINE_TANK_NAME,
  QUARANTINE_TANK_SIZE,
  EMPTY_QUARANTINE,
  doseTankStarter,
  quarantineEnvironment,
  quarantineView,
  sameQuarantine,
  treatTank as treatRoomTank,
  type QuarantineView,
} from '../../sim/quarantine';
import { SPECIES_LABELS } from '../../sim/species-catalog';
import {
  DEFAULT_FOOD_STYLE,
  isFoodStyle,
  toggleFoodStyle as otherFoodStyle,
  type FoodStyle,
} from '../../core/food-style/food-style';
import type { SpeciesId } from '../../sim/species';
import {
  advanceInPlace,
  advanceToWithFeedings,
  changeWorldWaterInPlace,
  feedInPlace,
  removeDeadInPlace,
  setWorldCatappaInPlace,
  setWorldCurrentInPlace,
  worldCurrentLevel,
  worldCurrentVelocity,
  setWorldHeaterInPlace,
  setWorldLampOnInPlace,
  setWorldFeederInPlace,
  refillWorldFeederInPlace,
  setWorldLightingInPlace,
  scrapeWorldAlgaeInPlace,
  pruneWorldPlantInPlace,
  recordWorldMaintenanceInPlace,
  worldHasPrunablePlants,
  worldPlantShade,
  worldShownPlantGrowth,
  worldAlgaePatches,
  treatWorldInPlace,
  doseWorldBacteriaStarterInPlace,
  doseWorldConditionerInPlace,
  doseWorldPhRegulatorInPlace,
  setWorldCarbonInPlace,
  setWorldUntreatedTapInPlace,
} from '../../sim/world';
import type { Entity, MutableWorld, World } from '../../sim/world-types';
import { netTarget } from '../../sim/mortality';
import { CHEVRON_COUNTS } from '../../render/current-indicator-layer';
import {
  isCurrentLevel,
  nextCurrentLevel,
  type CurrentLevel,
  type CurrentVelocity,
} from '../../sim/water-current';
import {
  DEFAULT_WATER_READOUT,
  sameReadout,
  waterReadout,
  waterTurbidity,
  type WaterReadout,
} from '../../sim/water-quality';
import { waterLiters, waterProducts } from '../../sim/water';
import type { ConditionerKind } from '../../sim/water-conditioner';
import type { PhRegulatorDirection } from '../../sim/ph-regulator';
import {
  advanceFirstTankPath,
  createFirstTankPath,
  firstTankFacts,
  firstTankPathAvailable,
  firstTankPathView,
  type FirstTankPathState,
  type FirstTankPathView,
} from '../../sim/first-tank-path';
import {
  addJournalEntry,
  addPruneEntry,
  carryJournalWatches,
  createJournal,
  journalLines,
  observeJournal,
  restoreJournal,
  savedJournal,
  tankWorldPairs,
  treatmentEntry,
  watchJournal,
  waterChangeEntry,
  type Journal,
  type JournalLine,
  type JournalWatch,
} from '../../sim/journal';
import {
  createWaterHistory,
  markWaterChange,
  recordWaterHistory,
  restoreWaterHistory,
  savedWaterHistory,
  ticksToNextWaterSample,
  waterHistoryView,
  type WaterHistory,
  type WaterHistoryView,
} from '../../sim/water-history';
import {
  initialMaintenance,
  MAINTENANCE_TASKS,
  maintenanceReadout,
  sameMaintenanceReadout,
  type MaintenanceReadout,
  type MaintenanceTask,
} from '../../sim/maintenance';
import { worldReview, type ReviewPoint } from '../../sim/bilan';
import { TREATMENTS, type TreatmentKind } from '../../sim/treatment';
import {
  sameTreatment,
  treatedWaterWarning,
  treatmentReadout,
  type TreatmentNotice,
  type TreatmentReadout,
} from '../../sim/treatment-text';
import { DEFAULT_WATER_SAMPLE, waterSample, type WaterSample } from '../../sim/water-dashboard';
import {
  algaeCoverage,
  DEFAULT_LIGHTING_HOURS,
  hasAlgae,
  lightingOf,
  visibleAlgaeCount,
} from '../../sim/algae';
import { feederReadout, hasFeeder, type FeederReadout } from '../../sim/auto-feeder';
import { NO_FOULING, sampleFouling, worldFouling } from '../../sim/fouling';
import {
  DEFAULT_LAMP_ON_HOUR,
  LAMP_FADE_HOURS,
  lampOnOf,
  lampReadout,
  waterLampAt,
  withLampInto,
  type LampReadout,
} from '../../sim/lamp';
import {
  alertTargets,
  NO_ALERT_TARGETS,
  sameAlertTargets,
  type AlertTargets,
} from '../../sim/alert-animals';
import { mixWarnings } from '../../sim/compatibility';
import {
  EMPTY_PHARMACY,
  pharmacyState,
  samePharmacy,
  usedProducts,
  type PharmacyProduct,
  type PharmacyState,
} from '../../sim/pharmacy';
import { waterHardness } from '../../sim/water-hardness';
import {
  isWaterKit,
  sameWaterTestView,
  startWaterTest,
  WATER_TEST_TICKS,
  waterTestDone,
  waterTestView,
  type WaterKit,
  type WaterTest,
  type WaterTestSample,
  type WaterTestView,
} from '../../sim/water-test';
import {
  EMPTY_HEALTH_SUMMARY,
  healthSummary,
  sameHealthSummary,
  type HealthSummary,
} from '../../sim/health-summary';
import { refreshDue } from '../dashboard-frame/refresh-pace';
import { filterMaturityPercent } from '../../sim/filter-maturation';
import type { FilterRinseWater } from '../../sim/filter-rinse';
import { PhotoController } from './photo-controller';
import { RenderLoop } from './render-loop';
import { createStartupWorld } from './startup-world';
import { SaveShareController, type ImportedSave, type RestoredSave } from './save-share-controller';
import { AquariumProbe } from './aquarium-probe';
import { DecorEditingController } from './decor-editing-controller';
import { RoomEditingController } from './room-editing-controller';
import { RoomLayoutController } from './room-layout-controller';
import { CareSessionController } from '../care-session/care-session-controller';

/** Fabrique du renderer, remplaçable dans les tests (jsdom n'a pas WebGL). */
export const AQUARIUM_RENDERER_FACTORY = new InjectionToken<AquariumRendererFactory>(
  'AQUARIUM_RENDERER_FACTORY',
  { providedIn: 'root', factory: () => createWebGLRenderer },
);

/** Durée de la mise en évidence depuis une alerte (#483), en millisecondes de temps réel. */
export const ALERT_HIGHLIGHT_MS = 6000;

/** Pas de simulation entre deux relevés de l'eau dans la boucle (0,5 s simulée). */
export const WATER_READOUT_TICKS = 30;

/** Échantillon d'un test de l'eau (#564) : valeurs exactes du bac, dureté résolue. */
function testSample(world: World): WaterTestSample {
  const { ph, ammonia, nitrite, nitrate } = world.water;
  return { ph, ammonia, nitrite, nitrate, ...waterHardness(world.water, world.environment) };
}

/**
 * Chargeur du moteur de chute de l'éditeur (#170, ADR 0046) : import dynamique de Rapier par
 * défaut ; remplaçable dans les tests.
 */
export const DECOR_PHYSICS_LOADER = new InjectionToken<DecorPhysicsLoader>('DECOR_PHYSICS_LOADER', {
  providedIn: 'root',
  factory: () => loadDecorPhysics,
});

/** Préréglage de base de la caméra automatique du fond d'écran (#279). */
export const WALLPAPER_PRESET: CameraPreset = 'three-quarter';
/** Écart (s réelles) entre deux expositions de la caméra automatique (`data-aqfish-camera`). */
export const WALLPAPER_CAMERA_EXPOSE_SECONDS = 1;
/** Pas de temps réel maximal versé à la caméra automatique (pas de saut après une pause). */
const WALLPAPER_MAX_ORBIT_STEP_SECONDS = 0.25;

/**
 * Message du dernier geste sur un bac (#306) : transfert d'animal ou renommage (#316), réussite
 * ou refus. Nommé pour les deux depuis #318 (`transferNotice` auparavant).
 */
export interface TankNotice {
  readonly kind: 'info' | 'erreur';
  readonly text: string;
}

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
  factory: () => {
    const win = inject(DOCUMENT).defaultView;
    return win ? browserStorage(win) : null;
  },
});

/**
 * Effectifs au format de `population=` et de `data-aqfish-population` : `neon:12,guppy:6`.
 * Avec `species`, seulement ces espèces, dans cet ordre (celles de l'environnement, #88).
 */
export function formatPopulation(
  counts: PopulationCounts,
  species: readonly SpeciesId[] = Object.keys(counts) as SpeciesId[],
): string {
  return species.map((id) => `${id}:${counts[id]}`).join(',');
}

export { applyCaptureFurniture, applyCaptureWoods, applyPopulation } from './startup-world';

/**
 * Écart d'heure minimal (en heures) avant de recalculer l'éclairage : 0,01 h, soit 0,5 s
 * avec la journée de 20 min. Évite de recalculer (et d'allouer) à chaque image pour un
 * changement invisible une fois l'image ramenée à la palette.
 */
export const LIGHT_HOUR_STEP = 0.01;

/**
 * Horloge de départ (ADR 0018) : `heure=` la fige à cette heure ; sans elle, figée à midi
 * en mode capture (images reproductibles, séries existantes inchangées), en marche depuis
 * midi sinon.
 */
export function initialDayClock(hour: number | null, capture: boolean): DayClock {
  if (hour !== null) {
    return createDayClock(hour, DEFAULT_DAY_LENGTH_SECONDS, true);
  }
  return capture
    ? createDayClock(DEFAULT_START_HOUR, DEFAULT_DAY_LENGTH_SECONDS, true)
    : DEFAULT_DAY_CLOCK;
}

/**
 * Texte du fichier `url` (relatif à la page), `null` s'il est absent ou illisible ; ne lève
 * jamais. En `file://`, `fetch` est refusé par Chromium : `XMLHttpRequest`, que l'hôte peut
 * autoriser (`--allow-file-access-from-files`) ; sinon `fetch` (#279, ADR 0079).
 */
export async function readLocalText(win: Window, url: string): Promise<string | null> {
  if (win.location.protocol === 'file:') {
    return new Promise((resolve) => {
      try {
        const XHR = (win as Window & { XMLHttpRequest: typeof XMLHttpRequest }).XMLHttpRequest;
        const request = new XHR();
        request.open('GET', url);
        request.overrideMimeType('application/json');
        // En `file://`, une lecture réussie répond 0 (pas de statut HTTP).
        request.onload = () =>
          resolve(request.status === 0 || request.status === 200 ? request.responseText : null);
        request.onerror = () => resolve(null);
        request.send();
      } catch {
        resolve(null);
      }
    });
  }
  try {
    const response = await win.fetch(url, { cache: 'no-store' });
    return response.ok ? await response.text() : null;
  } catch {
    return null;
  }
}

/** `localStorage` s'il est accessible, `null` sinon (l'accès lui-même peut lever). */
function browserStorage(win: Window): (FilterStorage & SaveStorage) | null {
  try {
    return win.localStorage ?? null;
  } catch {
    return null;
  }
}

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
  /** Contexte des gestes passé à `updateFish`, réécrit à chaque image (#433). */
  private readonly behaviorFrame = { time: 0, landedFood: false };
  private readonly physicsLoader = inject(DECOR_PHYSICS_LOADER);
  /** Option « Réduire les mouvements » (#406), partagée avec les réglages et le mode immersif. */
  private readonly motionState = inject(ReducedMotionState);
  /** Sons d'ambiance (#411) : l'hôte fournit la scène, le service décide du reste. */
  private readonly ambientSound = inject(AmbientSoundState);
  /** Scène sonore autorisée : après le démarrage, hors capture. */
  private readonly soundAllowed = signal(false);

  private view: AquariumView | null = null;
  private readySignaled = false;
  private capture = false;
  /** Vue fond d'écran (#279) : sans interface, caméra automatique, cadence limitée. */
  private wallpaper = false;
  /** Images par seconde de la vue fond d'écran (`fps=` ou `aqfishFond.fps`). */
  private wallpaperFps = DEFAULT_WALLPAPER_FPS;
  /** Temps réel (s) de la caméra automatique et de sa dernière exposition. */
  private orbitSeconds = 0;
  private orbitExposedAt = Number.NEGATIVE_INFINITY;
  /** Vrai après `stop()` : un chargement asynchrone en cours ne démarre plus rien. */
  private stopped = false;
  private currentWorld: MutableWorld | null = null;
  /**
   * Mondes des autres environnements visités, figés tant qu'ils ne sont pas affichés (#277,
   * ADR 0063) ; l'hôte en est seul propriétaire, comme du monde courant.
   */
  private stash: StashedWorlds = new Map();
  /**
   * Pièce de N bacs (#264, lot 1, ADR 0069) : identifiants, noms et graine des bacs,
   * resynchronisée avec le monde affiché et les mondes rangés à chaque sauvegarde
   * (`syncRoom`) ; `null` tant qu'aucune sauvegarde n'a été lue ni écrite.
   */
  private roomState: RoomState | null = null;
  /** Bac sélectionné de `roomState` : celui du monde affiché (réglage d'interface). */
  private selectedTankId = 0;
  /**
   * Pire gravité d'alerte des bacs non affichés, par monde (#306) : un monde ne change pas
   * entre deux rattrapages (`advanceBackgroundTanks`), qui en créent de nouveaux.
   */
  private frozenWorst = new WeakMap<World, AlertSeverity | null>();
  /** Temps du premier relevé d'entretien de chaque monde sans calendrier (#513). */
  private maintenanceStart = new WeakMap<World, number>();
  /** Niveau du voile d'exemple de `encrassement=` (#607), en capture ; 0 sinon. */
  private captureFouling = 0;
  /** Historique de l'eau de chaque monde affiché (#511), hors du monde pendant la partie. */
  private waterHistories = new WeakMap<World, WaterHistory>();
  /** Journal de chaque monde affiché (#581), hors du monde pendant la partie. */
  private journals = new WeakMap<World, Journal>();
  /** Dernière observation du journal de chaque monde affiché (#581). */
  private journalWatches = new WeakMap<World, JournalWatch>();
  private shownJournal: Journal | null = null;
  private shownJournalVersion = -1;
  /** Parcours guidé de chaque monde (#512), hors du monde pendant la partie. */
  private firstTankPaths = new WeakMap<World, FirstTankPathState>();
  /** Produits déjà utilisés dans chaque bac depuis le chargement (#533), hors du monde. */
  private pharmacyUsed = new WeakMap<World, readonly PharmacyProduct[]>();
  /** Dernier test de l'eau lancé dans chaque bac (#564), hors du monde : rien n'est sauvegardé. */
  private waterTests = new WeakMap<World, WaterTest>();
  /** Dernier état de parcours publié dans `firstTankPath` (`null` : aucun). */
  private shownFirstTankPath: FirstTankPathState | null = null;
  /** Tampon et version du dernier historique exposé. */
  private shownHistory: WaterHistory | null = null;
  private shownHistoryVersion = -1;
  /** Bilan du bac affiché (#514), lu à la demande par le tableau de bord. */
  readonly reviewOfWorld = (): readonly ReviewPoint[] =>
    this.currentWorld ? worldReview(this.currentWorld) : [];
  /**
   * Rattrapage des bacs non affichés (#316, ADR 0076) : monde affiché et son `tick` au dernier
   * rattrapage. Un autre monde affiché (changement de bac, import) repart de zéro.
   */
  private backgroundWorld: World | null = null;
  private backgroundTick = 0;
  /** Horloge de la journée simulée (ADR 0018) : l'heure suit `world.time`. */
  private dayClock: DayClock = DEFAULT_DAY_CLOCK;
  /** Heure de l'éclairage appliqué en dernier (`null` : à appliquer à la prochaine image). */
  private litHour: number | null = null;
  /** Tampon de la lumière du jour, réécrit à chaque recalcul (aucune allocation). */
  private readonly light = createDayLight();
  /** Intensité de la lampe appliquée en dernier (`updateLight`). */
  private litLamp: number | null = null;
  /** Boucle d'images et pas fixe de la simulation (#696) : `RenderLoop`. */
  private readonly loop = new RenderLoop({
    window: () => this.document.defaultView,
    canRender: () => this.view !== null,
    frame: (timestamp) => this.frame(timestamp),
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

  /** Caméra libre dans la pièce en cours (#343) ; la barre des vues l'affiche. */
  readonly freeCamera = signal(false);
  /** Déplacements de la caméra libre enfoncés au clavier (#343). */
  private readonly freeMoves = new Set<FreeMoveId>();
  /** Consigne de la caméra libre, tampon réutilisé à chaque image (#352). */
  private readonly freeAxes = { forward: 0, strafe: 0, vertical: 0 };
  /** Préréglage suivi avant la caméra libre, rendu à la barre en revenant à l'orbite. */
  private presetBeforeFree: CameraPreset | null = null;

  /**
   * Filtre de rendu courant (issue #33). Pixel art par défaut ; `filtre=` dans l'URL prime
   * sur le choix mémorisé (`aqfish.filtre`). Mis à jour à la bascule seulement.
   */
  readonly filter = signal<RenderFilter>('pixel');

  /**
   * Moment de la journée (issue #73), affiché par l'indicateur soleil / lune. Mis à jour
   * avec l'éclairage (au plus toutes les `LIGHT_HOUR_STEP` heures), et ne notifie que s'il
   * change : quatre fois par journée simulée.
   */
  readonly dayPhase = signal<DayPhase>(dayPhaseAt(DEFAULT_START_HOUR));

  /**
   * Heure affichée par le panneau de contrôle (#52), arrondie au quart d'heure : mise à jour
   * avec l'éclairage et ne notifie qu'au changement de quart d'heure (toutes les 12,5 s
   * réelles à vitesse ×1), jamais à chaque image.
   */
  readonly clockHour = signal<number>(DEFAULT_START_HOUR);

  /** Vrai si l'heure est figée (curseur, touches `H`, `J`, `N`, `heure=`, mode capture). */
  readonly clockFrozen = signal(false);

  /** Vitesse de simulation (#52) : multiplie le temps réel versé à la boucle à pas fixe. */
  readonly speed = signal<SimSpeed>(DEFAULT_SIM_SPEED);

  /** Décor (rochers et plantes) affiché (#52). Il reste un obstacle pour les poissons. */
  readonly decorVisible = signal(true);

  /**
   * Pluie (#106) : touche `R`, case du panneau, `pluie=1`. Possible dans le bassin seulement ;
   * jamais sauvegardée.
   */
  readonly rain = signal(false);

  /**
   * Rendu des granulés (#117) : points par défaut, voxels au choix (bouton du panneau),
   * enregistré avec les réglages de la sauvegarde ; `granules=` en capture.
   */
  readonly foodStyle = signal<FoodStyle>(DEFAULT_FOOD_STYLE);

  /**
   * Pièce autour du bac (#187) : case « Afficher la pièce » du panneau, enregistrée avec les
   * réglages de la sauvegarde ; `piece=1` en capture. Affichée dans le bac tropical seulement.
   */
  readonly room = signal<Room>(DEFAULT_ROOM);

  /** Environnement affiché (#87), changé par le sélecteur du panneau. */
  readonly environment = signal<EnvironmentId>(DEFAULT_ENVIRONMENT_ID);

  /** Effectif de chaque espèce (#69), mis à jour au démarrage et à chaque réglage. */
  readonly population = signal<PopulationCounts>(NO_FISH);

  /**
   * Effectif maximal de chaque espèce compte tenu des autres (`populationLimits`, #69) et du
   * plafond d'animaux de la pièce (`roomPopulationLimits`, #392).
   */
  readonly populationMax = signal<PopulationCounts>(NO_FISH);
  /** Plafond d'animaux de la pièce atteint (#392, ADR 0096) : message en clair, sinon `null`. */
  readonly populationNotice = signal<string | null>(null);
  /** Relevé de l'eau affiché par le tableau de bord et le panneau (#207, #256), au dixième. */
  readonly water = signal<WaterReadout>(DEFAULT_WATER_READOUT);
  /**
   * Relevé exact de l'eau lu par le tableau de bord (#256) : remplacé à chaque relevé
   * (`refreshWater`), donc au plus 4 fois par seconde dans la boucle (`refreshDue`).
   */
  readonly waterSample = signal<WaterSample>(DEFAULT_WATER_SAMPLE);
  /** Vrai si les changements d'eau du bac affiché versent de l'eau non traitée (#530). */
  readonly untreatedTap = signal(false);
  /** Vrai si du charbon actif est dans le filtre du bac affiché (#531). */
  readonly carbon = signal(false);
  /** Durée d'éclairage du bac affiché, en heures par jour (#476). */
  readonly lighting = signal(DEFAULT_LIGHTING_HOURS);
  /** Heure d'allumage de la lampe du bac affiché (#584). */
  readonly lampOn = signal(DEFAULT_LAMP_ON_HOUR);
  /** Distributeur automatique du bac affiché (#583) ; `null` : aucun. */
  readonly feeder = signal<FeederReadout | null>(null);
  /** Vrai si un distributeur peut être posé dans le bac affiché (#583). */
  readonly feederAvailable = computed(() => hasFeeder(this.environment()));
  /** Ligne « Lampe » du tableau de bord (#584) ; `null` pour un bac sans lampe réglable. */
  readonly lampReadout = computed<LampReadout | null>(() =>
    hasAlgae(this.environment())
      ? lampReadout({ lighting: this.lighting(), lampOn: this.lampOn() })
      : null,
  );
  /** Vrai tant que la raclette est en main (#476) : un clic sur le bac racle. */
  readonly scraping = signal(false);
  /** Photo PNG et images de la séance (#479, #503, #624, #696) : `PhotoController`. */
  private readonly photo = new PhotoController({
    document: this.document,
    view: () => this.view,
    isCapture: () => this.capture,
    isStopped: () => this.stopped,
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
    applyWaterSetting: (apply) => this.applyWaterSetting(apply),
    recordMaintenance: (world, task) => this.recordMaintenance(world, task),
    journalOf: (world) => this.journalOf(world),
    waterHistoryOf: (world) => this.waterHistoryOf(world),
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
  readonly visibleAlgae = signal(0);
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
  /** Vrai si le dernier clic sur le canvas a retiré un corps (#582) : il ne nourrit pas. */
  private netted = false;
  /** Corps exposés au dernier relevé (#582) : un décès depuis relève aussi les effectifs. */
  private shownDead = 0;
  /** Vrai tant que le sécateur est en main (#477) : un clic sur une plante à tige la taille. */
  readonly pruning = signal(false);
  /**
   * Synthèse de la santé des animaux lue par le tableau de bord (#260), relevée avec l'eau
   * (`refreshWater`) et remplacée seulement si ce qu'elle affiche change (`sameHealthSummary`).
   */
  readonly health = signal<HealthSummary>(EMPTY_HEALTH_SUMMARY, { equal: sameHealthSummary });
  /** Animaux désignés par chaque alerte (#483), relevés avec l'eau, remplacés s'ils changent. */
  readonly alertAnimals = signal<AlertTargets>(NO_ALERT_TARGETS, { equal: sameAlertTargets });
  /** Nombre d'animaux mis en évidence depuis une alerte (#483) ; 0 : aucun. */
  readonly highlightedAnimals = signal(0);
  /** Fin de la mise en évidence en cours (#483). */
  private highlightTimer: ReturnType<typeof setTimeout> | null = null;
  /** Monde de la mise en évidence : elle cesse si le bac affiché change. */
  private highlightWorld: World | null = null;
  /** Traitement des points blancs en cours (#361), relevé avec l'eau ; `null` : aucun. */
  readonly treatment = signal<TreatmentReadout | null>(null, { equal: sameTreatment });
  /** Produits de la pharmacie du bac affiché (#533), relevés avec l'eau. */
  readonly pharmacy = signal<PharmacyState>(EMPTY_PHARMACY, { equal: samePharmacy });
  /** Test de l'eau du bac affiché (#564), relevé avec l'eau ; `null` : aucun test lancé. */
  readonly waterTest = signal<WaterTestView | null>(null, { equal: sameWaterTestView });
  /** Calendrier d'entretien du bac affiché (#513) ; `null` en capture. */
  readonly maintenance = signal<MaintenanceReadout | null>(null, {
    equal: sameMaintenanceReadout,
  });
  /** Historique de l'eau du bac affiché (#511), recopié à chaque relevé nouveau ; `null` en capture. */
  readonly waterHistory = signal<WaterHistoryView | null>(null);
  /** Journal du bac affiché (#581), du plus récent au plus ancien ; vide en capture. */
  readonly journal = signal<readonly JournalLine[]>([]);
  /** Parcours « Mon premier aquarium » du bac affiché (#512) ; `null` : non proposé. */
  readonly firstTankPath = signal<FirstTankPathView | null>(null);
  /** Message du dernier geste de soin (#361) ; `null` : aucun depuis le dernier changement de bac. */
  readonly treatmentNotice = signal<TreatmentNotice | null>(null);
  /** Monde du dernier geste de soin : le message s'efface quand le bac affiché change. */
  private noticeWorld: World | null = null;
  /** Pas du dernier relevé de l'eau (`refreshWater`). */
  private waterReadTick = Number.NEGATIVE_INFINITY;
  /** Instant (ms, horloge de `requestAnimationFrame`) du dernier relevé de la boucle. */
  private waterReadAt: number | null = null;

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
    beforeExport: (world) => this.keepFirstTankPath(world as MutableWorld),
    beforeAutosave: () => {
      this.keepMaintenanceStart();
      if (this.currentWorld) {
        this.keepFirstTankPath(this.currentWorld);
      }
    },
    load: (result) => this.loadImported(result),
    tankCount: () => this.roomState?.tanks.length ?? 1,
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
    decorChanged: (world) => this.refreshPlants(world),
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
    applyRoom: (room) => this.applyRoom(room),
    dimensions: () => (this.currentWorld ? placeDimensions(this.currentWorld) : DEFAULT_TANK),
    obstacles: () => (this.roomState === null ? [] : layoutFootprints(this.roomState)),
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
  private readonly roomLayout = new RoomLayoutController({
    world: () => this.currentWorld,
    isCapture: () => this.capture,
    editable: () => this.roomEdit.editable(),
    roomState: () => this.roomState,
    setRoomState: (room) => {
      this.roomState = room;
    },
    syncRoomState: (world) => this.syncRoomState(world),
    selectedTankId: () => this.selectedTankId,
    forgetStashed: (environment) => {
      const stash = new Map(this.stash);
      stash.delete(environment);
      this.stash = stash;
    },
    room: () => this.room(),
    redrawRoom: () => this.applyRoom(this.room()),
    probe: this.probe,
    saveNow: () => this.saveNow(),
    scheduleFrame: () => this.scheduleFrame(),
  });

  /** Bacs et meubles supports de la pièce de N bacs (#305), pour le catalogue. */
  readonly roomCatalog = this.roomLayout.catalog;

  /**
   * Liste des bacs de la pièce (#306, lot 3) : nom, environnement, litrage, animaux et pire
   * gravité d'alerte de chaque bac, bac sélectionné compris (relevé à chaque relevé de l'eau).
   */
  readonly tankList = signal<readonly TankListEntry[]>([]);
  /** Bacs de quarantaine possibles et malades du bac affiché (#547), relevés avec la liste. */
  readonly quarantine = signal<QuarantineView>(EMPTY_QUARANTINE, { equal: sameQuarantine });
  /** Mode du bac affiché (#278) : `decor` remplace le tableau de bord par le badge. */
  readonly careMode = signal<CareMode>('soins');
  /** Force du courant du bac affiché (#460). */
  readonly current = signal<CurrentLevel>('coupe');

  /** Message du dernier transfert ou renommage (#306, #318), `null` avant tout geste. */
  readonly tankNotice = signal<TankNotice | null>(null);

  /**
   * Dimensions du bac du monde courant (issue #171), `null` si l'environnement ne les règle
   * pas (`isTankResizable`).
   */
  readonly tankDimensions = signal<TankDimensions | null>(null);
  /** Forme du bassin du monde courant (issue #190) : rectangle hors du bassin. */
  readonly pondShape = signal<PondShape>(DEFAULT_POND_SHAPE);
  /** Litres d'eau du bac du monde courant (#237, avertissements d'ajout), `null` avant le départ. */
  readonly tankLiters = signal<number | null>(null);

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
    if (this.freeCamera()) {
      this.rememberFreeCamera(false);
    }
    this.syncFreeCamera(false);
    this.activePreset.set(preset);
    view.animateToPreset(preset, presetTransitionSeconds(this.reducedMotion(), this.capture));
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
    const view = this.view;
    if (!view) {
      return;
    }
    if (view.setFilter(filter)) {
      this.filter.set(filter);
      this.probe.publishFilter(this.filter());
      this.scheduleFrame();
    }
    const win = this.document.defaultView;
    if (win && !this.capture) {
      writeStoredRenderFilter(browserStorage(win), filter);
    }
  }

  /** Heure de la journée affichée, dans [0, 24) (`null` avant le démarrage). */
  get hour(): number | null {
    return this.currentWorld ? hourAt(this.dayClock, this.renderTime()) : null;
  }

  /**
   * Fige l'heure ou la remet en marche (touche `H`), sans saut d'heure. Sans effet en mode
   * capture (l'heure y est toujours figée : contrat de capture).
   */
  toggleClock(): void {
    if (!this.currentWorld || this.capture) {
      return;
    }
    this.dayClock = toggleClock(this.dayClock, this.renderTime());
    this.litHour = null;
    this.refreshClockFrozen();
    this.scheduleFrame();
  }

  /**
   * Remet l'heure en marche (`true`) ou la fige (`false`) : case « Heure automatique » du
   * panneau de contrôle (#52). Sans effet si l'horloge est déjà dans l'état demandé.
   */
  setClockRunning(running: boolean): void {
    if (this.currentWorld && running === this.dayClock.frozen) {
      this.toggleClock();
    }
  }

  /**
   * Change la vitesse de simulation (#52) : le pas fixe ne change pas, seul le temps réel
   * versé à la boucle est multiplié. À 0, le monde ne bouge plus mais le rendu continue.
   * Sans effet en mode capture (le monde y est figé), avant le démarrage, ou pour une
   * vitesse hors de `SIM_SPEEDS`.
   */
  setSpeed(speed: number): void {
    if (!this.currentWorld || this.capture || !isSimSpeed(speed)) {
      return;
    }
    this.speed.set(speed);
    this.probe.publishSpeed(speed);
  }

  /**
   * Affiche ou masque le décor (#52) sans le détruire. La simulation n'est pas touchée :
   * rochers et plantes restent des obstacles (ADR 0024). Sans effet en mode capture ou
   * avant le démarrage.
   */
  setDecorVisible(visible: boolean): void {
    const view = this.view;
    if (!view || this.capture) {
      return;
    }
    view.setDecorVisible(visible);
    this.decorVisible.set(visible);
    this.probe.publishDecorVisible(visible);
    this.scheduleFrame();
  }

  /**
   * Entre en caméra libre dans la pièce ou revient à l'orbite, pose d'avant rendue (#343,
   * ADR 0084). Sans effet sans pièce affichée, en mode capture (`libre=`), en fond d'écran ou
   * avant le démarrage.
   */
  toggleFreeCamera(): void {
    const view = this.view;
    if (!view || this.capture || this.wallpaper) {
      return;
    }
    if (view.freeCameraActive) {
      view.exitFreeCamera();
      this.activePreset.set(this.presetBeforeFree);
      this.syncFreeCamera(false);
    } else if (view.enterFreeCamera()) {
      this.presetBeforeFree = this.activePreset();
      this.activePreset.set(null);
      this.syncFreeCamera(true);
    } else {
      return;
    }
    // Préférence d'affichage (#344) : le mode choisi est repris au prochain chargement.
    this.rememberFreeCamera(this.freeCamera());
    this.probe.publishCamera(this.view);
    this.scheduleFrame();
  }

  /** Mémorise le mode de caméra choisi (#344), hors capture et fond d'écran. */
  private rememberFreeCamera(free: boolean): void {
    const win = this.document.defaultView;
    if (win && !this.capture && !this.wallpaper) {
      writeStoredFreeCamera(browserStorage(win), free);
    }
  }

  /**
   * Déplacement de la caméra libre tenu ou relâché par un bouton à l'écran (#344, boutons
   * « Avancer » et « Reculer ») : même effet qu'une touche tenue. Sans effet hors caméra libre.
   */
  setFreeMoveHeld(move: FreeMoveId, held: boolean): void {
    if (!held) {
      this.freeMoves.delete(move);
      return;
    }
    if (!this.freeCamera()) {
      return;
    }
    this.freeMoves.add(move);
    this.scheduleFrame();
  }

  /** Aligne l'état exposé de la caméra libre sur `active` ; touches relâchées en sortant. */
  private syncFreeCamera(active: boolean): void {
    if (!active) {
      this.freeMoves.clear();
    }
    this.freeCamera.set(active);
    this.probe.publishFreeCamera(active);
  }

  /**
   * Touches de déplacement de la caméra libre (#343) : tenues enfoncées, lues à chaque image.
   * Hors caméra libre, dans un champ de saisie ou avec Ctrl, Alt, Meta : laissées au reste.
   */
  private onFreeMoveKey(event: KeyboardEvent, down: boolean): void {
    const move = freeMoveFor(event.key);
    if (move === null) {
      return;
    }
    if (!down) {
      this.freeMoves.delete(move);
      return;
    }
    if (!this.freeCamera() || event.defaultPrevented || isTypingContext(event)) {
      return;
    }
    event.preventDefault();
    this.freeMoves.add(move);
    this.scheduleFrame();
  }

  /**
   * Affiche ou masque la pièce autour du bac (#187) : sol, mur et meuble support, sans
   * effet sur la simulation. Le choix est enregistré avec la sauvegarde, même hors du bac
   * tropical, où la pièce n'est pas dessinée. Sans effet en mode capture (`piece=`) ou avant
   * le démarrage.
   */
  setRoomShown(shown: boolean): void {
    const view = this.view;
    if (!view || this.capture || shown === this.room().shown) {
      return;
    }
    this.applyRoom({ ...this.room(), shown });
    this.saveNow();
    this.scheduleFrame();
  }

  /**
   * Fait pleuvoir ou arrête la pluie (#106) : gouttes, ronds à la surface et nénuphars qui
   * frémissent. Sans effet hors du bassin (`Environment.rain`),
   * en mode capture (`pluie=`) ou avant le démarrage. Rien n'est sauvegardé. Le ciel couvert
   * suit en fondu (issue #338), avancé par la boucle de rendu.
   */
  setRain(enabled: boolean): void {
    if (!this.view || this.capture) {
      return;
    }
    this.applyRain(enabled, true);
    this.scheduleFrame();
  }

  /** Alterne pluie et beau temps (touche `R`, #106). */
  toggleRain(): void {
    this.setRain(!this.rain());
  }

  /**
   * Change le rendu des granulés (#117) à chaud, sans toucher au monde ni à la caméra ; le
   * choix est enregistré avec la sauvegarde. Sans effet en mode capture (`granules=`) ou
   * avant le démarrage.
   */
  setFoodStyle(style: FoodStyle): void {
    const view = this.view;
    if (!view || this.capture || !isFoodStyle(style)) {
      return;
    }
    this.applyFoodStyle(style);
    this.saveNow();
    this.scheduleFrame();
  }

  /**
   * Règle la force du courant du bac (#460, ADR 0108), puis enregistre. Sans effet en mode
   * capture (le courant passe par `courant=`), avant le démarrage ou pour une force inconnue.
   */
  setCurrent(level: CurrentLevel): void {
    const world = this.currentWorld;
    if (!world || this.capture || !isCurrentLevel(level)) {
      return;
    }
    setWorldCurrentInPlace(world, level);
    this.refreshCurrent(world);
    this.saveNow();
    this.scheduleFrame();
  }

  /** Force suivante du courant (bouton du panneau, #460) : coupé, doux, fort. */
  cycleCurrent(): void {
    this.setCurrent(nextCurrentLevel(this.current()));
  }

  /** Expose la force du courant de `world` et la donne à la vue (bulles, feuilles, repère). */
  private refreshCurrent(world: World): void {
    const level = worldCurrentLevel(world);
    this.current.set(level);
    this.probe.publishCurrent(level);
    const v = worldCurrentVelocity(world, this.currentScratch);
    this.view?.setWaterCurrent(
      v.x,
      v.z,
      environmentById(world.environment).current.direction,
      level === 'coupe' ? 0 : CHEVRON_COUNTS[level],
    );
  }

  private readonly currentScratch: CurrentVelocity = { x: 0, z: 0 };

  /** Alterne entre granulés en points et en voxels (bouton du panneau, #117). */
  toggleFoodStyle(): void {
    this.setFoodStyle(otherFoodStyle(this.foodStyle()));
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
    const world = this.currentWorld;
    if (
      !world ||
      this.capture ||
      !isSpeciesId(species) ||
      !acceptsSpecies(world, species) ||
      !Number.isInteger(count) ||
      count < 0
    ) {
      return;
    }
    // Plafond d'animaux de la pièce (#392, ADR 0096) : un ajout au-delà est ramené à la place
    // restante, sans effet si elle est nulle ; retirer reste toujours possible.
    const room = this.syncRoomState(world);
    const limit = roomPopulationLimits(room, this.selectedTankId, world)[species];
    setPopulationInPlace(world, species, Math.min(count, limit));
    this.refreshPopulation();
    this.scheduleFrame();
  }

  /**
   * Changement d'eau (#207) : retire une part des composés dissous (`changeWorldWaterInPlace`),
   * puis enregistre. Sans effet en mode capture ou avant le démarrage.
   */
  changeWater(): void {
    const world = this.currentWorld;
    if (!world || this.capture) {
      return;
    }
    changeWorldWaterInPlace(world);
    this.recordMaintenance(world, 'waterChange');
    markWaterChange(this.waterHistoryOf(world), world.water, world.tick);
    addJournalEntry(this.journalOf(world), waterChangeEntry(world.time));
    this.refreshWater();
    this.saveNow();
    this.scheduleFrame();
  }

  /** Marque faite une tâche d'entretien sans geste dans le jeu (filtre, test de l'eau, #513). */
  markMaintenanceDone(task: MaintenanceTask): void {
    this.applyWaterSetting((world) => this.recordMaintenance(world, task));
  }

  /**
   * Geste de soin contre les points blancs (#361) : un pas du traitement `kind` (`TREATMENTS`),
   * accepté ou refusé avec un message (`treatmentNotice`) ; accepté, relevé et enregistrement.
   * Sans effet en mode capture, en mode décor, avant le démarrage ou pour un traitement inconnu.
   */
  treat(kind: TreatmentKind): void {
    const world = this.currentWorld;
    if (!world || this.capture || isDecorMode(world) || !Object.hasOwn(TREATMENTS, kind)) {
      return;
    }
    const outcome = treatWorldInPlace(world, kind, TREATMENTS[kind].step);
    this.noticeWorld = world;
    this.treatmentNotice.set({
      ok: outcome.ok,
      text: outcome.message,
      warning: outcome.ok ? (outcome.warning ?? null) : null,
    });
    if (outcome.ok) {
      addJournalEntry(this.journalOf(world), treatmentEntry(world.time, kind));
      this.refreshWater();
      this.saveNow();
      this.scheduleFrame();
    }
  }

  /**
   * Lance un test de l'eau `kit` (#564) sur le bac affiché : échantillon pris maintenant,
   * résultat après `WATER_TEST_TICKS` pas de simulation. Refusé tant qu'un test court dans ce
   * bac ; sans effet en mode capture ou avant le démarrage.
   */
  startWaterTest(kit: WaterKit): void {
    const world = this.currentWorld;
    if (!world || this.capture) {
      return;
    }
    const running = this.waterTests.get(world);
    if (running !== undefined && !waterTestDone(running, world.tick)) {
      return;
    }
    this.waterTests.set(world, startWaterTest(kit, testSample(world), world.tick));
    this.refreshWater();
  }

  /**
   * Verse une dose de conditionneur `kind` (#530), acceptée ou refusée avec un message
   * (`treatmentNotice`) ; acceptée, relevé et enregistrement. Sans effet en mode capture, en
   * mode décor ou avant le démarrage.
   */
  doseConditioner(kind: ConditionerKind): void {
    const world = this.currentWorld;
    if (!world || this.capture || isDecorMode(world)) {
      return;
    }
    const outcome = doseWorldConditionerInPlace(world, kind);
    if (outcome.ok) {
      // Le conditionneur simple agit à l'instant : la pharmacie le garde « terminé » (#533).
      this.pharmacyUsed.set(
        world,
        usedProducts(this.pharmacyUsed.get(world) ?? [], ['conditionneur']),
      );
    }
    this.noticeWorld = world;
    this.treatmentNotice.set({ ok: outcome.ok, text: outcome.message, warning: null });
    if (outcome.ok) {
      this.refreshWater();
      this.saveNow();
      this.scheduleFrame();
    }
  }

  /** Bascule l'eau du robinet entre traitée et non traitée (#530), enregistrée avec le bac. */
  toggleUntreatedTap(): void {
    const world = this.currentWorld;
    if (!world || this.capture || isDecorMode(world)) {
      return;
    }
    setWorldUntreatedTapInPlace(world, world.water.untreatedTap !== true);
    this.refreshWater();
    this.saveNow();
  }

  /** Place ou retire le charbon actif (#531), avec un message, enregistré avec le bac. */
  toggleCarbon(): void {
    const world = this.currentWorld;
    if (!world || this.capture || isDecorMode(world)) {
      return;
    }
    const outcome = setWorldCarbonInPlace(world, world.water.carbon !== true);
    this.noticeWorld = world;
    this.treatmentNotice.set({
      ok: true,
      text: outcome.message,
      warning: outcome.warning ?? null,
    });
    this.refreshWater();
    this.saveNow();
    this.scheduleFrame();
  }

  /** Dose de régulateur de pH (#531), acceptée ou refusée avec un message. */
  dosePhRegulator(direction: PhRegulatorDirection): void {
    const world = this.currentWorld;
    if (!world || this.capture || isDecorMode(world)) {
      return;
    }
    const outcome = doseWorldPhRegulatorInPlace(world, direction);
    this.noticeWorld = world;
    this.treatmentNotice.set({
      ok: outcome.ok,
      text: outcome.message,
      warning: outcome.ok ? outcome.warning : null,
    });
    if (outcome.ok) {
      this.refreshWater();
      this.saveNow();
      this.scheduleFrame();
    }
  }

  /**
   * Verse une dose d'amorce de bactéries (#529), acceptée ou refusée avec un message
   * (`treatmentNotice`) ; acceptée, relevé et enregistrement. Sans effet en mode capture, en
   * mode décor ou avant le démarrage.
   */
  doseBacteriaStarter(): void {
    const world = this.currentWorld;
    if (!world || this.capture || isDecorMode(world)) {
      return;
    }
    const outcome = doseWorldBacteriaStarterInPlace(world);
    this.noticeWorld = world;
    this.treatmentNotice.set({ ok: outcome.ok, text: outcome.message, warning: null });
    if (outcome.ok) {
      this.refreshWater();
      this.saveNow();
      this.scheduleFrame();
    }
  }

  /**
   * Règle la consigne du chauffage (#207), en °C, arrondie au dixième ; l'eau la rejoint peu à
   * peu. Enregistrée avec l'eau. Sans effet en mode capture, avant le démarrage ou hors de
   * [`MIN_HEATER_TEMPERATURE`, `MAX_HEATER_TEMPERATURE`].
   */
  setHeater(temperature: number): void {
    this.applyWaterSetting((world) => setWorldHeaterInPlace(world, temperature));
  }

  /**
   * Durée d'éclairage du bac (#476), en heures entières par jour (0 à 24 ; 4 à 14 au panneau, #584) : au-delà de 10 h,
   * les algues poussent. Enregistrée avec l'eau. Sans effet en mode capture, avant le
   * démarrage ou hors bornes.
   */
  setLighting(hours: number): void {
    this.applyWaterSetting((world) => {
      if (!setWorldLightingInPlace(world, hours)) {
        throw new RangeError('éclairage hors bornes');
      }
    });
  }

  /**
   * Heure d'allumage de la lampe du bac (#584), heure entière de 0 à 23 : la lampe reste
   * allumée pendant la durée d'éclairage. Enregistrée avec l'eau. Sans effet en mode capture,
   * avant le démarrage ou hors bornes.
   */
  setLampOn(hour: number): void {
    this.applyWaterSetting((world) => {
      if (!setWorldLampOnInPlace(world, hour)) {
        throw new RangeError('heure d’allumage hors bornes');
      }
    });
  }

  /**
   * Pose, règle ou retire le distributeur automatique (#583) : `null` le retire ; 1 à 4 heures
   * entières le posent plein, ou changent ses heures sans toucher à sa réserve. Enregistré
   * avec le bac. Sans effet en mode capture, avant le démarrage, hors bornes ou dans un bac
   * sans distributeur possible.
   */
  setFeeder(hours: readonly number[] | null): void {
    this.applyWaterSetting((world) => {
      if (!setWorldFeederInPlace(world, hours)) {
        throw new RangeError('distributeur impossible');
      }
    });
  }

  /** Remplit le distributeur automatique (#583) : 14 rations. Sans effet sans distributeur. */
  refillFeeder(): void {
    this.applyWaterSetting((world) => {
      refillWorldFeederInPlace(world);
    });
  }

  /**
   * Prend ou pose la raclette (#476) : tant qu'elle est en main, un clic sur le bac retire la
   * plaque d'algues visée au lieu de nourrir. Sans effet en mode capture.
   */
  toggleScraper(): void {
    if (!this.capture) {
      this.scraping.update((on) => !on);
      this.probe.publishScraper(this.scraping());
      if (this.scraping() && this.pruning()) {
        this.togglePruner();
      }
    }
  }

  /**
   * Prend ou pose le sécateur (#477) : tant qu'il est en main, un clic sur une plante à tige la
   * taille au lieu de nourrir ; prendre le sécateur pose la raclette. Sans effet en mode capture.
   */
  togglePruner(): void {
    if (!this.capture) {
      this.pruning.update((on) => !on);
      this.probe.publishPruner(this.pruning());
      if (this.pruning() && this.scraping()) {
        this.toggleScraper();
      }
    }
  }

  /**
   * Taille (#477) la plante à tige d'indice `index` du décor : renvoie vrai si elle a
   * raccourci (faux pour un autre élément, une plante sans pousse visible, en mode capture ou
   * avant le démarrage). Enregistré avec l'eau.
   */
  prunePlant(index: number): boolean {
    let pruned = false;
    this.applyWaterSetting((world) => {
      pruned = pruneWorldPlantInPlace(world, index);
      if (pruned) {
        this.recordMaintenance(world, 'prune');
        addPruneEntry(this.journalOf(world), world.time);
      }
    });
    return pruned;
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
    let index = -1;
    this.applyWaterSetting((world) => {
      index = scrapeWorldAlgaeInPlace(world, origin, direction);
    });
    return index;
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
    let removed = false;
    this.applyWaterSetting((world) => {
      const id = netTarget(world.dead, origin, direction);
      removed = id !== null && removeDeadInPlace(world, id);
    });
    if (removed) {
      this.refreshPopulation();
    }
    return removed;
  }

  /**
   * Nombre de feuilles de catappa dans le bac (#239), de 0 à `MAX_CATAPPA_LEAVES` : ajoute des
   * feuilles neuves ou retire d'abord les plus décomposées. Enregistré avec l'eau. Sans effet
   * en mode capture, avant le démarrage ou hors bornes.
   */
  setCatappa(count: number): void {
    this.applyWaterSetting((world) => setWorldCatappaInPlace(world, count));
  }

  /**
   * Réglage de l'eau par l'utilisateur : appliqué au monde courant, puis relevé et
   * enregistrement. Sans effet en mode capture, avant le démarrage ou si `apply` lève.
   */
  private applyWaterSetting(apply: (world: MutableWorld) => void): void {
    const world = this.currentWorld;
    if (!world || this.capture) {
      return;
    }
    try {
      apply(world);
    } catch {
      return;
    }
    this.refreshWater();
    this.saveNow();
    this.scheduleFrame();
  }

  /**
   * Change d'environnement (#87, ADR 0026, #277, ADR 0063) : range le monde affiché, figé, et
   * reprend celui de l'environnement choisi tel qu'il avait été laissé (population, décor,
   * eau, nourriture, dimensions, temps) ; un environnement jamais visité part de son monde de
   * départ avec la même graine, ramené à la place restante sous le plafond d'animaux de la
   * pièce (#396). Puis recrée la vue, la caméra allant sur la vue par défaut de
   * l'environnement. L'heure de la journée continue sans saut (`carryClock`) ; la vitesse, le
   * filtre et l'affichage du décor sont conservés. Le tout est enregistré aussitôt. Sans effet
   * en mode capture (`environnement=`), avant le démarrage, pour un environnement inconnu ou
   * déjà affiché.
   */
  setEnvironment(id: string): void {
    const world = this.currentWorld;
    if (!world || !this.view || this.capture || !isEnvironmentId(id) || id === world.environment) {
      return;
    }
    // Une chute en cours se termine d'abord : le monde rangé garde un décor posé.
    this.decorEdit.finishDrop();
    const fromTime = this.renderTime();
    // Les autres bacs rattrapent le bac quitté avant l'échange (#316) ; le bac quitté garde
    // son identifiant dans la pièce, même jamais sauvegardé (#264).
    this.advanceBackgroundTanks();
    const room = this.syncRoomState(world);
    // Bac de départ d'un environnement jamais visité ramené à la place restante sous le
    // plafond d'animaux de la pièce (#396, ADR 0096) : vide si la pièce est pleine.
    const free = Math.max(0, ROOM_ANIMAL_CAP - roomAnimalCount(room));
    const next = switchEnvironment(world, this.stash, id, free);
    this.stash = next.stash;
    this.currentWorld = next.world as MutableWorld;
    // La liste des bacs (#306) suit aussitôt le bac affiché.
    this.syncRoomState(next.world);
    this.loop.resetClock();
    this.dayClock = carryClock(this.dayClock, fromTime, this.renderTime());
    this.litHour = null;
    this.refreshEnvironment();
    this.probe.publishTick(this.currentWorld);
    this.probe.publishFood(this.currentWorld);
    this.refreshPopulation();
    this.refreshWater();
    this.createView(environmentById(id).defaultCamera);
    this.probe.publishCamera(this.view);
    this.saveNow();
    this.scheduleFrame();
  }

  /**
   * Règle les dimensions du bac (issue #171, ADR 0047) : bornées, le décor ramené dans le bac,
   * poissons et granulés gardés dans l'eau (`setTankDimensionsInPlace`), puis la vue recréée
   * et la caméra recadrée sur le préréglage actif (la vue par défaut si l'utilisateur l'avait
   * quitté). La sélection du décor est conservée ; le monde est enregistré aussitôt. Sans effet en mode capture (`bac=`), avant le
   * démarrage, hors d'un environnement réglable ou à dimensions inchangées.
   */
  setTankDimensions(dims: TankDimensions): void {
    const world = this.currentWorld;
    const previous = this.tankDimensions();
    if (!world || !this.view || this.capture || previous === null) {
      return;
    }
    // Un bac agrandi ne doit chevaucher ni meuble ni bac posé de la pièce (#311) : sinon la
    // sauvegarde refuserait la pièce entière.
    const room = this.syncRoomState(world);
    const refusal = tankResizeRefusal(room, this.selectedTankId, clampTankDimensions(dims));
    if (refusal !== null) {
      return this.roomLayout.refuse(refusal);
    }
    // Une chute en cours se termine d'abord : son décor est celui que l'on redimensionne.
    this.decorEdit.finishDrop();
    const applied = setTankDimensionsInPlace(world, dims);
    if (applied === null || sameDimensions(applied, previous)) {
      return;
    }
    const selection = this.decorSelection();
    this.refreshTankDimensions();
    this.probe.publishFood(this.currentWorld);
    this.createView(this.activePreset() ?? environmentById(world.environment).defaultCamera);
    if (selection !== null && selection < world.decor.length) {
      this.view?.setDecorSelection(selection);
    }
    this.probe.publishCamera(this.view);
    // Comme une modification du décor : enregistré tout de suite.
    this.saveNow();
    this.scheduleFrame();
  }

  /**
   * Règle la forme du bassin (issue #190, ADR 0080) : poissons et granulés ramenés dans la
   * forme (`setPondShapeInPlace`), puis la vue recréée sur le préréglage actif ; le monde est
   * enregistré aussitôt. Sans effet en mode capture (`forme=`), avant le démarrage, hors du
   * bassin ou à forme inchangée.
   */
  setPondShape(shape: PondShape): void {
    const world = this.currentWorld;
    if (!world || !this.view || this.capture || (world.shape ?? DEFAULT_POND_SHAPE) === shape) {
      return;
    }
    this.decorEdit.finishDrop();
    if (setPondShapeInPlace(world, shape) === null) {
      return;
    }
    this.refreshTankDimensions();
    this.probe.publishFood(this.currentWorld);
    this.createView(this.activePreset() ?? environmentById(world.environment).defaultCamera);
    this.probe.publishCamera(this.view);
    this.saveNow();
    this.scheduleFrame();
  }

  /**
   * Fige l'heure à `hour` (touches « plein jour » et « nuit », issue #75), que l'horloge
   * tourne ou non ; `toggleClock` la remet ensuite en marche depuis cette heure, sans saut.
   * Sans effet en mode capture (contrat de capture) ou si `hour` n'est pas un réel fini.
   */
  freezeClockAt(hour: number): void {
    if (!this.currentWorld || this.capture || !Number.isFinite(hour)) {
      return;
    }
    this.dayClock = freezeClockAt(this.dayClock, hour);
    this.litHour = null;
    this.refreshClockFrozen();
    this.scheduleFrame();
  }

  /**
   * Dépose des granulés autour de (x, z), dans le repère du bac (clic sur l'eau, issue #67).
   * Sans effet en mode capture (image figée : les dépôts passent par `nourrir=`), avant le
   * démarrage, ou pour un point hors du bac.
   */
  feed(x: number, z: number): void {
    const world = this.currentWorld;
    if (!world || this.capture || !Number.isFinite(x) || !Number.isFinite(z)) {
      return;
    }
    if (feedInPlace(world, x, z) > 0) {
      this.probe.publishFood(this.currentWorld);
      this.refreshFirstTankPath(world);
      this.scheduleFrame();
    }
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

  /** Applique la pièce à la vue courante et l'expose (`ROOM_ATTRIBUTE`). */
  private applyRoom(room: Room): void {
    this.room.set(room);
    // Meubles supports et bacs posés (#305) : dessinés avec la pièce, au parquet du meuble.
    this.view?.setRoomLayout(
      this.roomState === null
        ? []
        : roomLayoutBlocks(this.roomState, clampRoom(room).cabinetHeight),
    );
    this.view?.setRoom(room);
    const shown = this.view?.roomShown ?? false;
    this.probe.publishRoomShown(shown);
    // Pièce masquée : la vue est revenue à l'orbite (#343).
    if (this.freeCamera() && !this.view?.freeCameraActive) {
      this.activePreset.set(this.presetBeforeFree);
      this.syncFreeCamera(false);
      this.probe.publishCamera(this.view);
    }
    // Éditeur (#188) : la pièce n'est modifiable que dessinée ; sélection et outil suivent.
    this.roomEdit.roomApplied(room, shown);
    this.decorEdit.roomShownChanged(shown);
  }

  /** Applique le rendu des granulés à la vue courante et l'expose. */
  private applyFoodStyle(style: FoodStyle): void {
    this.foodStyle.set(style);
    this.view?.setFoodStyle(style);
    this.probe.publishFoodStyle(style);
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

  /** Remplace la pièce par une sauvegarde relue et validée (import, lien partagé). */
  private loadImported(result: ImportedSave): void {
    this.roomState = result.room;
    this.selectedTankId = result.selectedTankId;
    this.loadWorld(result.world as MutableWorld, result.settings, result.others);
    this.createView(environmentById(result.world.environment).defaultCamera);
    this.probe.publishCamera(this.view);
    this.scheduleFrame();
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
    this.keepWaterHistory(world);
    this.keepJournal(world);
    this.advanceBackgroundTanks();
    const room = this.syncRoomState(world);
    return serializeRoom(room, this.selectedTankId, this.settings());
  }

  /** Resynchronise la pièce avec le monde affiché et les mondes rangés (`syncRoom`). */
  private syncRoomState(world: World): RoomState {
    const synced = syncRoom(this.roomState, world, stashedList(this.stash, world.environment));
    this.roomState = synced.room;
    this.selectedTankId = synced.selectedTankId;
    this.roomLayout.refreshCatalog(this.roomLayout.catalog().message);
    this.refreshTankList();
    return synced.room;
  }

  /**
   * Rattrapage des bacs non affichés (#316, ADR 0076, fin du gel des ADR 0063 et 0074) : ils
   * avancent, par `stepRoom`, d'autant de pas que le bac affiché depuis le rattrapage
   * précédent, avec la même horloge du jour. Appelé au rythme des relevés de l'eau (au plus
   * 4 fois par seconde de temps réel), et avant tout ce qui lit ou change les autres bacs
   * (changement de bac, transfert, sauvegarde) : aucune allocation par image. Le bac affiché
   * n'est pas touché (même objet, avancé en place par la boucle). Sans effet en capture.
   */
  private advanceBackgroundTanks(): void {
    const world = this.currentWorld;
    if (!world || this.capture) {
      return;
    }
    const pending = this.backgroundWorld === world ? world.tick - this.backgroundTick : 0;
    this.backgroundWorld = world;
    this.backgroundTick = world.tick;
    if (pending <= 0) {
      return;
    }
    const synced = syncRoom(this.roomState, world, stashedList(this.stash, world.environment));
    const room = stepRoom(synced.room, pending, this.dayClock, synced.selectedTankId);
    // Le bac rangé garde sa dernière observation du journal sous son nouveau monde (#592).
    carryJournalWatches(this.journalWatches, tankWorldPairs(synced.room.tanks, room.tanks));
    this.stash = stashFromList(
      room.tanks
        .filter((tank) => tank.placement === null && tank.id !== synced.selectedTankId)
        .map((tank) => tank.world),
      world.environment,
    );
    this.roomState = { ...room, tick: world.tick };
    this.selectedTankId = synced.selectedTankId;
  }

  /**
   * Règle le mode du bac affiché (#278) : en décor, eau, faim et santé sont en pause (pas
   * effacées) et toute espèce s'ajoute ; au retour en soins, l'état reprend où il était et
   * les animaux d'un autre milieu sont gardés (lot 1). La confirmation est demandée par le
   * panneau. Sans effet en capture, avant le démarrage, ou pour un mode inconnu.
   */
  setCareMode(mode: CareMode): void {
    const world = this.currentWorld;
    if (!world || this.capture || !isCareMode(mode) || careModeOf(world) === mode) {
      return;
    }
    setCareModeInPlace(world, mode);
    this.refreshPopulation();
    this.refreshWater();
    this.saveNow();
    this.scheduleFrame();
  }

  /**
   * « Tout retirer » au retour en soins (#278, lot 2) : retire du bac affiché tous les animaux
   * des espèces `remove` (celles que la confirmation a listées comme inadaptées), puis le
   * repasse en mode soins ; les autres animaux et l'eau reprennent où ils en étaient. Sans
   * effet en capture, avant le démarrage, ou si le bac n'est pas en mode décor.
   */
  returnToCare(remove: readonly SpeciesId[]): void {
    const world = this.currentWorld;
    if (!world || this.capture || careModeOf(world) !== 'decor') {
      return;
    }
    returnToCareInPlace(world, remove);
    this.refreshPopulation();
    this.refreshWater();
    this.saveNow();
    this.scheduleFrame();
  }

  /**
   * Renomme le bac `id` de la liste (#316, `renameTank`) : nom normalisé, non vide, de
   * `MAX_TANK_NAME_LENGTH` caractères au plus ; enregistré aussitôt. Refus : message dans
   * `tankNotice`, nom inchangé. Sans effet en capture ou avant le démarrage.
   */
  renameTank(id: number, name: string): void {
    const world = this.currentWorld;
    if (!world || this.capture) {
      return;
    }
    const renamed = renameTank(this.syncRoomState(world), id, name);
    if (renamed === null) {
      this.tankNotice.set({
        kind: 'erreur',
        text: `Nom refusé : de 1 à ${MAX_TANK_NAME_LENGTH} caractères`,
      });
      this.refreshTankList();
      return;
    }
    this.roomState = renamed;
    this.tankNotice.set(null);
    this.syncRoomState(world);
    this.saveNow();
  }

  /**
   * Liste des bacs (#306) : le bac sélectionné est relu à chaque appel (son monde avance en
   * place) ; les autres bacs gardent leur gravité en cache par monde, recalculée après chaque
   * rattrapage (#316). Rien en capture (aucune interface).
   */
  private refreshTankList(): void {
    const world = this.currentWorld;
    if (!world || this.capture) {
      return;
    }
    const room = this.roomState ?? this.syncRoomState(world);
    const selected = this.selectedTankId;
    const entries = tankList(room.tanks, selected, (tank) => {
      if (tank.id === selected) {
        // Le monde affiché change en place : sa gravité en cache, d'avant son affichage, ne
        // vaut plus quand il sera de nouveau rangé.
        this.frozenWorst.delete(world);
        return worstAlert(world);
      }
      let worst = this.frozenWorst.get(tank.world);
      if (worst === undefined) {
        worst = worstAlert(tank.world);
        this.frozenWorst.set(tank.world, worst);
      }
      return worst;
    });
    // Le bac sélectionné est décrit par le monde affiché, même avant resynchronisation.
    this.tankList.set(
      entries.map((entry) =>
        entry.selected ? { ...entry, animals: world.entities.length } : entry,
      ),
    );
    this.quarantine.set(quarantineView(room, selected, { world }));
    this.probe.publishSelectedTank(selected);
  }

  /**
   * Sélectionne le bac `id` de la liste (#306) : tableau de bord, fiches et wiki décrivent
   * alors ce bac. Lot 3a : un bac à la position historique (un par environnement) se
   * sélectionne en changeant d'environnement (`setEnvironment`) ; un bac posé (lot 3c) n'est
   * pas encore sélectionnable (ADR 0075). Sans effet en capture ou avant le démarrage.
   */
  selectTank(id: number): void {
    const world = this.currentWorld;
    if (!world || !this.view || this.capture) {
      return;
    }
    const tank = findTank(this.syncRoomState(world), id);
    if (tank === undefined || tank.id === this.selectedTankId) {
      return;
    }
    if (tank.placement !== null) {
      this.tankNotice.set({
        kind: 'erreur',
        text: `« ${tank.name} » est posé dans la pièce : pas encore sélectionnable`,
      });
      return;
    }
    this.tankNotice.set(null);
    this.keepWaterHistory(world);
    this.keepJournal(world);
    this.keepFirstTankPath(world);
    this.setEnvironment(tank.world.environment);
  }

  /**
   * Transfère à l'épuisette un animal de l'espèce `species` du bac sélectionné vers le bac
   * `toId` (#306, `transferFish`) : le plus récent de cette espèce, comme le retrait de la
   * population. Le bac affiché perd l'animal en place ; le bac d'arrivée (rangé ou posé)
   * reçoit le nouvel animal, avec sa faim et sa santé. Refus (milieu, température, bac plein)
   * ou réussite : message dans `tankNotice`. Enregistré aussitôt. Sans effet en capture
   * ou avant le démarrage.
   */
  transferAnimal(species: string, toId: number): void {
    const world = this.currentWorld;
    if (!world || this.capture || !isSpeciesId(species)) {
      return;
    }
    // Le bac d'arrivée est d'abord mis à l'heure du bac affiché (#316).
    this.advanceBackgroundTanks();
    const room = this.syncRoomState(world);
    let index = world.entities.length - 1;
    while (index >= 0 && world.entities[index].species !== species) {
      index -= 1;
    }
    const fish = world.entities[index];
    if (fish === undefined) {
      this.tankNotice.set({ kind: 'erreur', text: 'Aucun animal de cette espèce ici' });
      return;
    }
    const result = transferFish(room, this.selectedTankId, toId, fish.id);
    if (!result.ok) {
      this.tankNotice.set({ kind: 'erreur', text: result.message });
      return;
    }
    // Une chute en cours se termine d'abord, comme avant tout changement du monde affiché.
    this.decorEdit.finishDrop();
    (world.entities as Entity[]).splice(index, 1);
    const arrival = findTank(result.room, toId) as RoomTank;
    const departure = findTank(room, toId);
    if (departure !== undefined) {
      carryJournalWatches(this.journalWatches, [[departure.world, arrival.world]]);
    }
    if (arrival.placement === null) {
      const stash = new Map(this.stash);
      stash.set(arrival.world.environment, arrival.world);
      this.stash = stash;
    }
    this.roomState = {
      ...result.room,
      tanks: result.room.tanks.map((tank) =>
        tank.id === this.selectedTankId ? { ...tank, world } : tank,
      ),
    };
    this.syncRoomState(world);
    const { singular, feminine } = SPECIES_LABELS[species];
    const moved = `${singular.charAt(0).toUpperCase()}${singular.slice(1)} transféré${feminine ? 'e' : ''}`;
    const warnings = result.warnings.map(addWarningText);
    // Amphibien transféré dans une eau déjà traitée (#374) : le produit lui est toxique.
    const treated = treatedWaterWarning(species, waterProducts(arrival.world.water));
    if (treated !== null) {
      warnings.push(treated);
    }
    this.tankNotice.set({
      kind: 'info',
      text: [`${moved} dans « ${arrival.name} »`, ...warnings].join('. '),
    });
    this.refreshPopulation();
    this.refreshWater();
    this.saveNow();
    this.scheduleFrame();
  }

  /**
   * Installe un bac de quarantaine (#547) : petit bac vide de l'environnement du bac affiché,
   * nommé « Quarantaine », posé au sol à la première place libre (comme le catalogue « Bacs et
   * meubles », la pièce peut rester masquée). Refus (jardin, plafond, aucune place) : message
   * dans `tankNotice`. Sans effet en capture ou avant le démarrage.
   */
  installQuarantine(): void {
    const world = this.currentWorld;
    if (!world || this.capture) {
      return;
    }
    const environment = quarantineEnvironment(world.environment);
    if (environment === null) {
      this.tankNotice.set({
        kind: 'erreur',
        text: 'Le bassin est au jardin : installez la quarantaine depuis un bac de la pièce',
      });
      return;
    }
    const room = this.syncRoomState(world);
    const capped = roomTankCapRefusal(room);
    const { area, obstacles } = this.roomLayout.floor(world);
    const placement =
      capped === null
        ? findTankSpot(room, environment, QUARANTINE_TANK_SIZE, null, area, obstacles)
        : null;
    const result =
      placement === null
        ? null
        : addTank(room, {
            environment,
            size: QUARANTINE_TANK_SIZE,
            placement,
            name: QUARANTINE_TANK_NAME,
          });
    if (result === null || !result.ok) {
      this.tankNotice.set({
        kind: 'erreur',
        text: capped ?? 'Aucune place libre au sol pour la quarantaine',
      });
      return;
    }
    this.tankNotice.set({
      kind: 'info',
      text: `Bac « ${QUARANTINE_TANK_NAME} » installé : laissez mûrir son filtre avant d’y mettre un animal`,
    });
    this.roomLayout.commit(result.room, null);
    this.syncRoomState(world);
  }

  /**
   * Soigne un bac posé de la liste (#547, quarantaine) : un geste du traitement `kind` dans ce
   * bac **seul** (`treatTank`), le bac affiché n'est pas touché. Le bac est d'abord mis à
   * l'heure (#316). Réussite ou refus : message dans `tankNotice`. Sans effet en capture, avant
   * le démarrage, pour le bac affiché ou un bac à la position historique.
   */
  treatPlacedTank(id: number, kind: TreatmentKind): void {
    const world = this.currentWorld;
    if (!world || this.capture || id === this.selectedTankId) {
      return;
    }
    this.advanceBackgroundTanks();
    const room = this.syncRoomState(world);
    const tank = findTank(room, id);
    if (tank === undefined || tank.placement === null) {
      return;
    }
    const result = treatRoomTank(room, id, kind);
    if (!result.ok) {
      this.tankNotice.set({ kind: 'erreur', text: result.message });
      return;
    }
    this.roomState = result.room;
    this.syncRoomState(world);
    const { message, warning } = result.outcome;
    this.tankNotice.set({
      kind: 'info',
      text: [`« ${tank.name} » : ${message}`, warning].filter((t) => t !== undefined).join(' '),
    });
    this.saveNow();
  }

  /**
   * Verse une dose d'amorce de bactéries dans le bac posé `id` (#553) : son filtre neuf (#538)
   * mûrit plus vite, le bac affiché n'est pas touché (`doseTankStarter`). Le bac est d'abord
   * mis à l'heure (#316). Réussite ou refus : message dans `tankNotice`. Sans effet en capture,
   * avant le démarrage, pour le bac affiché ou un bac à la position historique.
   */
  doseStarterInPlacedTank(id: number): void {
    const world = this.currentWorld;
    if (!world || this.capture || id === this.selectedTankId) {
      return;
    }
    this.advanceBackgroundTanks();
    const room = this.syncRoomState(world);
    const tank = findTank(room, id);
    if (tank === undefined || tank.placement === null) {
      return;
    }
    const result = doseTankStarter(room, id);
    if (!result.ok) {
      this.tankNotice.set({ kind: 'erreur', text: `« ${tank.name} » : ${result.message}` });
      return;
    }
    this.roomState = result.room;
    this.syncRoomState(world);
    this.tankNotice.set({ kind: 'info', text: `« ${tank.name} » : ${result.outcome.message}` });
    this.saveNow();
  }

  /**
   * Ramène à l'épuisette un animal de l'espèce `species` du bac posé `fromId` dans le bac
   * affiché (#547, retour de quarantaine) : le plus récent de cette espèce, faim, santé et
   * maladies gardées (`transferFish`). Le bac affiché gagne l'animal en place ; message avec le
   * rappel d'acclimatation. Refus (milieu, température, bac plein) : message dans `tankNotice`.
   */
  returnAnimal(fromId: number, species: string): void {
    const world = this.currentWorld;
    if (!world || this.capture || !isSpeciesId(species) || fromId === this.selectedTankId) {
      return;
    }
    this.advanceBackgroundTanks();
    const room = this.syncRoomState(world);
    const from = findTank(room, fromId);
    const fish = from?.world.entities.filter((entity) => entity.species === species).pop();
    if (from === undefined || from.placement === null || fish === undefined) {
      this.tankNotice.set({ kind: 'erreur', text: 'Aucun animal de cette espèce ici' });
      return;
    }
    const result = transferFish(room, fromId, this.selectedTankId, fish.id);
    if (!result.ok) {
      this.tankNotice.set({ kind: 'erreur', text: result.message });
      return;
    }
    this.decorEdit.finishDrop();
    // Le bac affiché reste le même objet (avancé en place par la boucle) : il reçoit l'animal
    // créé par le transfert et le compteur d'identifiants.
    const arrival = (findTank(result.room, this.selectedTankId) as RoomTank).world;
    (world.entities as Entity[]).push(arrival.entities[arrival.entities.length - 1]);
    (world as MutableWorld).nextFishId = arrival.nextFishId;
    this.roomState = {
      ...result.room,
      tanks: result.room.tanks.map((tank) =>
        tank.id === this.selectedTankId ? { ...tank, world } : tank,
      ),
    };
    this.syncRoomState(world);
    const { singular, feminine } = SPECIES_LABELS[species];
    const moved = `${singular.charAt(0).toUpperCase()}${singular.slice(1)} ramené${feminine ? 'e' : ''}`;
    const name = findTank(this.roomState, this.selectedTankId)?.name ?? 'ce bac';
    this.tankNotice.set({
      kind: 'info',
      text: [
        `${moved} dans « ${name} »`,
        QUARANTINE_ACCLIMATION_REMINDER,
        ...result.warnings.map(addWarningText),
      ].join('. '),
    });
    this.refreshPopulation();
    this.refreshWater();
    this.saveNow();
    this.scheduleFrame();
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

  /**
   * Installe un monde, ses réglages et les mondes des autres environnements (import) ; la
   * vue suit à part.
   */
  private loadWorld(world: MutableWorld, settings: SaveSettings, others: readonly World[]): void {
    this.currentWorld = world;
    this.stash = stashFromList(others, world.environment);
    this.loop.resetClock();
    this.speed.set(settings.speed);
    this.probe.publishSpeed(settings.speed);
    this.dayClock = settings.clock;
    this.foodStyle.set(settings.foodStyle ?? DEFAULT_FOOD_STYLE);
    this.room.set(settings.room ?? DEFAULT_ROOM);
    this.litHour = null;
    this.refreshClockFrozen();
    this.refreshEnvironment();
    this.probe.publishTick(this.currentWorld);
    this.probe.publishFood(this.currentWorld);
    this.refreshPopulation();
    this.refreshWater();
  }

  /** Bascule entre pixel art et rendu sans filtre. */
  toggleFilter(): void {
    this.setFilter(toggleRenderFilter(this.filter()));
  }

  constructor() {
    afterNextRender(() => this.start());
    inject(DestroyRef).onDestroy(() => {
      this.clearAlertHighlight();
      this.stop();
    });
    // Option « Réduire les mouvements » (#406) : appliquée à chaud à la vue affichée.
    effect(() => {
      this.motionState.system();
      this.motionState.reduced();
      untracked(() => this.applyReducedMotion());
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

  /**
   * Mouvements réduits (#406) : l'option des réglages, ou la préférence système. En capture,
   * le choix mémorisé est ignoré (images reproductibles) : seule la préférence système compte,
   * que Playwright peut émuler (`reducedMotion: 'reduce'`) pour une capture avec l'option.
   */
  private reducedMotion(): boolean {
    return this.capture ? this.motionState.system() : this.motionState.reduced();
  }

  /** Pose l'état des mouvements sur la vue et l'expose aux tests de bout en bout. */
  private applyReducedMotion(): void {
    const reduced = this.reducedMotion();
    this.probe.publishReducedMotion(reduced);
    if (this.view) {
      this.view.setReducedMotion(reduced);
      this.scheduleFrame();
    }
  }

  private start(): void {
    const win = this.document.defaultView;
    if (!win) {
      return;
    }
    const params = parseCaptureParams(win.location.search);
    this.capture = params.capture;
    this.captureFouling = params.capture ? params.fouling : 0;
    this.soundAllowed.set(!params.capture);
    if (params.capture) {
      this.ambientSound.forbid();
    }
    // Vue fond d'écran (#279) : `fond=1`, ou la globale `aqfishFond` du paquet. En capture,
    // seule l'interface est masquée (contrat de capture inchangé).
    const global = readWallpaperGlobal(win);
    this.wallpaper = params.wallpaper || global !== null;
    if (this.wallpaper && !params.capture) {
      this.wallpaperFps = clampWallpaperFps(params.fps ?? global?.fps ?? DEFAULT_WALLPAPER_FPS);
      // L'URL qui décrit le monde prime, comme hors fond d'écran.
      if (hasWorldParams(win.location.search)) {
        this.begin(win, params, null);
        return;
      }
      void this.loadWallpaperConfig(win, global).then((choice) => {
        if (!this.stopped) {
          this.probe.publishWallpaper(choice.source);
          this.begin(win, params, choice.value);
        }
      });
      return;
    }
    // Lien partagé en capture (#426) : le bac du lien est affiché tel quel (même graine, même
    // temps), sans confirmation ; un lien invalide donne le monde de l'URL.
    if (params.capture && hasShareFragment(win.location.hash)) {
      void readShare(win.location.hash).then((result) => {
        if (!this.stopped) {
          this.begin(win, params, result.ok ? result : null);
        }
      });
      return;
    }
    this.begin(win, params, undefined);
  }

  /**
   * Configuration du fond d'écran (#279, ADR 0079) : `aqfish-fond.json` à côté de la page,
   * sinon la configuration du script `aqfish-fond.js` (si `fetch` est refusé, en `file://`),
   * sinon la sauvegarde locale, sinon la scène par défaut. Une source illisible est ignorée.
   * Le fichier n'est lu que dans le paquet ou en `file://` (`shouldReadWallpaperFile`, #332).
   */
  private async loadWallpaperConfig(
    win: Window,
    global: WallpaperGlobal | null,
  ): Promise<{ readonly source: WallpaperSource; readonly value: RestoredSave | null }> {
    const fileText = shouldReadWallpaperFile(win.location.protocol, global)
      ? await readLocalText(win, WALLPAPER_CONFIG_FILE)
      : null;
    const scriptText = wallpaperGlobalText(global);
    return chooseWallpaperConfig<RestoredSave>(
      [
        { source: 'fichier', text: fileText },
        { source: 'script', text: scriptText },
        { source: 'sauvegarde', text: readStoredSave(this.saveStorage) },
      ],
      (text) => {
        const result = parseSaveWorlds(text);
        return result.ok ? { ok: true, value: result } : result;
      },
    );
  }

  /**
   * Suite du démarrage, une fois la scène connue. `restoredOverride` : scène choisie par le
   * fond d'écran (`null` : monde neuf) ; `undefined` : sauvegarde automatique habituelle.
   * Les étapes s'enchaînent dans cet ordre, figé par les tests de l'hôte et les captures.
   */
  private begin(
    win: Window,
    params: CaptureParams,
    restoredOverride: RestoredSave | null | undefined,
  ): void {
    // En mode capture, le temps demandé est atteint ici, avant toute image (contrat de capture).
    // Le monde créé ici appartient à l'hôte seul : il pourra être avancé en place.
    this.dayClock = initialDayClock(params.hour, params.capture);
    const restored = this.startupSave(win, params, restoredOverride);
    const world = restored ? this.applyRestored(restored, params) : this.createWorld(params);
    this.currentWorld = world;
    this.prepareRoom(world, params);
    this.startServices(win, params);
    this.publishStartState(world, params);
    this.createStartView(win, params, world);
    this.applyCaptureEditing(world, params);
    this.applyStartCamera(win, params);
    this.listenWindow(win);
    this.scheduleFrame();
  }

  /**
   * Sauvegarde à restaurer au démarrage (#70) : celle du fond d'écran si elle est donnée ;
   * jamais en capture (images reproductibles), ni si l'URL décrit le monde (`seed`,
   * `environnement`, `population`). Lue avant toute création : le monde neuf n'est créé que
   * s'il n'y a rien à restaurer.
   */
  private startupSave(
    win: Window,
    params: CaptureParams,
    restoredOverride: RestoredSave | null | undefined,
  ): RestoredSave | null {
    if (restoredOverride !== undefined) {
      return restoredOverride;
    }
    if (params.capture || hasWorldParams(win.location.search)) {
      return null;
    }
    return this.saves.readStored();
  }

  /** Reprend la pièce, les mondes et les réglages d'une sauvegarde ; renvoie le monde affiché. */
  private applyRestored(restored: RestoredSave, params: CaptureParams): MutableWorld {
    this.stash = stashFromList(restored.others, restored.world.environment);
    this.roomState = restored.room;
    this.selectedTankId = restored.selectedTankId;
    this.speed.set(restored.settings.speed);
    this.foodStyle.set(restored.settings.foodStyle ?? DEFAULT_FOOD_STYLE);
    this.room.set(restored.settings.room ?? DEFAULT_ROOM);
    // `heure=` fige l'heure : l'horloge sauvegardée ne s'applique pas.
    if (params.hour === null) {
      this.dayClock = restored.settings.clock;
    }
    // Monde relu et validé, appartenant à l'hôte seul : il sera avancé en place.
    return restored.world as MutableWorld;
  }

  /**
   * Monde neuf décrit par l'URL (`createStartupWorld`), amené en capture au temps demandé
   * avec les dépôts de nourriture de `nourrir=` (#67), chacun à son temps simulé.
   */
  private createWorld(params: CaptureParams): MutableWorld {
    if (params.capture && params.foodStyle !== null) {
      this.foodStyle.set(params.foodStyle);
    }
    const created = createStartupWorld(params, this.room());
    this.room.set(created.room);
    const world = params.capture
      ? advanceToWithFeedings(created.world, params.time, params.feedings, this.dayClock)
      : created.world;
    // Test de l'eau de `test-eau=` (#564), hors capture : lancé avant le chargement, résultat
    // prêt (captures de la pharmacie reproductibles, simulation à l'arrêt).
    if (!params.capture && isWaterKit(params.waterTest)) {
      this.waterTests.set(
        world,
        startWaterTest(params.waterTest, testSample(world), world.tick - WATER_TEST_TICKS),
      );
    }
    return world;
  }

  /**
   * Pièce de N bacs (#305) : bacs et meubles exposés au catalogue dès le démarrage ; `bacs=`
   * en capture, avec `piece=1`, y ajoute meubles supports et bacs posés. Puis la vitesse de
   * `vitesse=` (#232), hors capture : elle prime sur celle de la sauvegarde (`vitesse=0` : le
   * monde ne quitte pas t = 0, captures d'interface reproductibles).
   */
  private prepareRoom(world: MutableWorld, params: CaptureParams): void {
    this.syncRoomState(world);
    if (params.capture && params.room && params.roomLayout.length > 0) {
      this.roomLayout.applyCaptureLayout(world, params.roomLayout);
    }
    if (!params.capture && params.speed !== null && isSimSpeed(params.speed)) {
      this.speed.set(params.speed);
    }
  }

  /**
   * Sauvegarde automatique et liens partagés, hors capture et hors fond d'écran : le fond
   * d'écran (#279) n'écrit jamais le stockage (la sauvegarde de l'application n'est pas
   * remplacée par sa scène) et se met en pause quand la page est masquée.
   */
  private startServices(win: Window, params: CaptureParams): void {
    if (params.capture) {
      return;
    }
    if (this.wallpaper) {
      this.startWallpaperPause();
      return;
    }
    this.saves.activate(win);
  }

  /** Expose l'état initial : horloge, vitesse, décor, pluie, graine, eau, sauvegarde. */
  private publishStartState(world: World, params: CaptureParams): void {
    this.refreshClockFrozen();
    this.probe.publishSpeed(this.speed());
    this.probe.publishDecorVisible(this.decorVisible());
    // Pluie de `pluie=1` (#106) : appliquée à la création de la vue (bassin seulement).
    this.rain.set(params.rain);
    this.probe.publishSeed(world.seed);
    this.refreshEnvironment();
    this.probe.publishTick(world);
    this.probe.publishFood(world);
    this.refreshPopulation();
    this.refreshWater();
    this.saves.publishStatus(this.saveStatus());
  }

  /**
   * Filtre de rendu, pixel ratio et première vue. Sans `camera=`, la vue par défaut de
   * l'environnement (#87 : de dessus pour le bassin) ; en fond d'écran, la vue trois-quarts,
   * base de la caméra automatique, et un pixel ratio 1 comme en capture (image pixel art).
   */
  private createStartView(win: Window, params: CaptureParams, world: World): void {
    this.filter.set(
      initialRenderFilter(
        params.filter,
        params.capture ? null : readStoredRenderFilter(browserStorage(win)),
        params.capture,
      ),
    );
    this.pixelRatio = params.capture || this.wallpaper ? 1 : win.devicePixelRatio || 1;
    this.createView(this.startPreset(params, world));
    this.probe.publishFilter(this.filter());
  }

  private startPreset(params: CaptureParams, world: World): CameraPreset {
    if (params.cameraGiven) {
      return params.camera;
    }
    return this.wallpaper ? WALLPAPER_PRESET : environmentById(world.environment).defaultCamera;
  }

  /**
   * Éditeurs fermés, sauf en capture : `edition=` (#167) ouvre l'éditeur du décor sur un
   * élément, `edition-meuble=` (#188) celui de la pièce sur un meuble.
   */
  private applyCaptureEditing(world: World, params: CaptureParams): void {
    this.decorEdit.applyEditing(false);
    if (!params.capture) {
      return;
    }
    const decorSelection = params.editSelection;
    if (
      decorSelection !== null &&
      isDecorEditable(world.environment) &&
      decorSelection < world.decor.length
    ) {
      this.decorEdit.showCaptureSelection(decorSelection);
    }
    const roomSelection = params.editRoomSelection;
    if (roomSelection !== null && this.roomEditable() && roomSelection < this.roomCount()) {
      this.decorEdit.applyEditing(true);
      this.roomEdit.showCaptureSelection(roomSelection);
    }
  }

  /**
   * Caméra de départ : pose de `libre=` (#343) en capture, pièce affichée seulement ; sinon
   * caméra libre mémorisée (#344), reprise hors capture et hors fond d'écran
   * (`toggleFreeCamera` refuse sinon).
   */
  private applyStartCamera(win: Window, params: CaptureParams): void {
    const free = params.freeCamera;
    if (params.capture && free !== null && this.view?.roomShown) {
      const toRadians = Math.PI / 180;
      const posed = this.view.applyFreePose(
        [free.x, free.y, free.z],
        free.yawDeg * toRadians,
        free.pitchDeg * toRadians,
      );
      if (posed) {
        this.activePreset.set(null);
        this.probe.publishCamera(this.view);
      }
    }
    if (!params.capture && !this.wallpaper && readStoredFreeCamera(browserStorage(win))) {
      this.toggleFreeCamera();
    }
  }

  /**
   * Écoutes de la fenêtre : redimensionnement (nouvelle image), touches tenues de la caméra
   * libre (#343), tout relâché si la fenêtre perd le focus (le relâchement n'arriverait jamais).
   */
  private listenWindow(win: Window): void {
    const onResize = () => this.scheduleFrame();
    win.addEventListener('resize', onResize);
    this.cleanups.push(() => win.removeEventListener('resize', onResize));
    const onKeyDown = (event: KeyboardEvent) => this.onFreeMoveKey(event, true);
    const onKeyUp = (event: KeyboardEvent) => this.onFreeMoveKey(event, false);
    const onBlur = () => this.freeMoves.clear();
    this.document.addEventListener('keydown', onKeyDown);
    this.document.addEventListener('keyup', onKeyUp);
    win.addEventListener('blur', onBlur);
    this.cleanups.push(() => {
      this.document.removeEventListener('keydown', onKeyDown);
      this.document.removeEventListener('keyup', onKeyUp);
      win.removeEventListener('blur', onBlur);
    });
  }

  /**
   * Suspend le rendu et la simulation du bac affiché pendant le mode immersif (#345, ADR 0086),
   * qui a sa propre vue : plus aucune image demandée. À la reprise, la boucle repart sans
   * rattraper le temps passé (le bac était en pause).
   */
  setRenderingSuspended(suspended: boolean): void {
    this.loop.setSuspended(suspended);
  }

  /** Vrai pendant le mode immersif (rendu suspendu). */
  get renderingSuspended(): boolean {
    return this.loop.suspended;
  }

  /**
   * Pause de la vue fond d'écran (#279) : page masquée, plus aucune image demandée ; de
   * nouveau visible, la boucle repart sans rattraper le temps passé masqué.
   */
  private startWallpaperPause(): void {
    const onVisibility = () => {
      const hidden = this.document.visibilityState === 'hidden';
      this.probe.publishWallpaperPaused(hidden);
      this.loop.setHidden(hidden);
    };
    onVisibility();
    this.document.addEventListener('visibilitychange', onVisibility);
    this.cleanups.push(() => this.document.removeEventListener('visibilitychange', onVisibility));
  }

  /**
   * Crée la vue du monde courant (en libérant la précédente) sur le préréglage `preset`, avec
   * le filtre et l'affichage du décor courants.
   */
  private createView(preset: CameraPreset): void {
    const world = this.currentWorld;
    if (!world) {
      return;
    }
    this.viewCleanups.splice(0).forEach((cleanup) => cleanup());
    this.view?.dispose();
    const view = new AquariumView({
      canvas: this.canvasRef().nativeElement,
      rendererFactory: this.rendererFactory,
      pixelRatio: this.pixelRatio,
      preset,
      interactive: !this.capture && !this.wallpaper,
      filter: this.filter(),
      environment: placeEnvironmentData(world),
    });
    this.view = view;
    view.setDecor(world.decor, world.seed);
    view.setDecorVisible(this.decorVisible());
    this.applyFoodStyle(this.foodStyle());
    // Hors du bac tropical, la vue ne dessine pas la pièce : l'état exposé suit (#187).
    this.applyRoom(this.room());
    // Hors du bassin, la vue refuse la pluie : l'état affiché suit (#106).
    this.applyRain(this.rain());
    // Eau trouble quand elle est mauvaise (#207) : teinte seulement.
    view.setWaterTurbidity(waterTurbidity(this.water().quality));
    // Feuilles de catappa et eau brun-thé (#239).
    view.setWaterTea(this.water().tea);
    view.setCatappa(world.water.catappa);
    this.refreshAlgae(world);
    this.refreshFeeder(world);
    this.refreshPlants(world);
    this.refreshCurrent(world);
    this.applyReducedMotion();
    this.litHour = null;
    this.activePreset.set(preset);
    // Vue neuve : en orbite (#343).
    this.syncFreeCamera(false);
    this.viewCleanups.push(view.onCameraChange(() => this.probe.publishCamera(this.view)));
    this.viewCleanups.push(view.onUserInteraction(() => this.activePreset.set(null)));
    view.setDecorDragEnabled(this.decorEditing());
    // Séance d'entretien (#604) : glisser racle à l'étape « vitres ».
    view.setStrokeEnabled(this.care.strokeEnabled());
    this.viewCleanups.push(view.onStroke((points) => this.care.stroke(points)));
    this.viewCleanups.push(
      view.onDecorDrag({
        start: (index) => this.startDecorDrag(index),
        move: (index, x, z) => this.moveDecorDrag(index, x, z),
        end: (index, commit) => this.endDecorDrag(index, commit),
      }),
      view.onRoomDrag({
        start: (index) => this.startRoomDrag(index),
        move: (index, x, z) => this.moveRoomDrag(index, x, z),
        end: (index, commit) => this.endRoomDrag(index, commit),
      }),
    );
    this.viewCleanups.push(
      view.onCanvasClick((x, y) => this.onCanvasClick(view, x, y)),
      view.onSurfaceClick((x, z) => this.onSurfaceClick(x, z)),
    );
    // Vue neuve : aucun glissement en cours, aucun élément sélectionné.
    this.decorEdit.viewCreated();
    this.roomEdit.viewCreated();
  }

  /**
   * Clic sur le canvas, avant la nourriture : en mode édition, il pose ou choisit un élément du
   * décor (#167) ; sécateur en main, il taille une plante (#477) ou coupe une pousse (#644) ;
   * raclette en main, il racle (#476) ; épuisette (#582), il retire un corps.
   */
  private onCanvasClick(view: AquariumView, x: number, y: number): void {
    if (this.decorEditing()) {
      this.editAt(view.pickDecor(x, y));
    } else if (this.pruning()) {
      this.pruneAt(view, x, y);
    } else if (this.scraping()) {
      const ray = view.pickRay(x, y);
      if (ray) {
        this.scrapeAlong(ray.origin, ray.direction);
      }
    } else if (this.currentWorld?.dead !== undefined) {
      // Épuisette (#582) : un clic sur un corps le retire au lieu de nourrir.
      const ray = view.pickRay(x, y);
      this.netted = ray !== null && this.netAlong(ray.origin, ray.direction);
    }
  }

  /** Sécateur en main : taille la plante visée, ou coupe sa pousse pendant la séance. */
  private pruneAt(view: AquariumView, x: number, y: number): void {
    const pick = view.pickDecor(x, y);
    if (pick?.kind !== 'item') {
      return;
    }
    if (this.care.isCutting()) {
      this.cutCarePlant(pick.index);
    } else {
      this.prunePlant(pick.index);
    }
  }

  /**
   * Clic sur la surface de l'eau : nourrit, sauf si le clic a retiré un corps, ou si un outil
   * (édition, raclette, sécateur, tuyau du siphon #605) est en main.
   */
  private onSurfaceClick(x: number, z: number): void {
    const netted = this.netted;
    this.netted = false;
    const siphoning = this.care.isSiphoning();
    if (!netted && !siphoning && !this.decorEditing() && !this.scraping() && !this.pruning()) {
      this.feed(x, z);
    }
  }

  private scheduleFrame(): void {
    this.loop.schedule();
  }

  private frame(timestamp: number): void {
    const view = this.view;
    if (!view) {
      return;
    }
    const wallpaper = this.wallpaper && !this.capture;
    // Fond d'écran (#279) : au plus `wallpaperFps` images par seconde (le temps réel écoulé
    // entre deux images rendues est versé d'un bloc à la simulation).
    if (wallpaper && this.readySignaled && this.loop.throttled(timestamp, this.wallpaperFps)) {
      this.scheduleFrame();
      return;
    }
    const orbitDt = this.capture ? 0 : this.stepRealTime(view, timestamp);
    const canvas = this.canvasRef().nativeElement;
    if (view.resize(canvas.clientWidth, canvas.clientHeight)) {
      this.probe.publishCamera(this.view);
    }
    if (wallpaper) {
      this.stepWallpaperCamera(view, orbitDt);
    }
    if (this.currentWorld) {
      this.drawWorld(view, this.currentWorld);
    }
    const rendered = view.renderFrame();
    if (rendered && !this.readySignaled) {
      this.signalReady();
    }
    // En mode capture, l'image est figée : on ne rend de nouveau qu'au redimensionnement.
    // Tant qu'aucune image n'a pu être rendue (taille nulle), on réessaie à l'image suivante.
    if (!this.capture || !rendered) {
      this.scheduleFrame();
    }
  }

  /**
   * Temps réel de l'image (hors capture) : simulation au pas fixe, transition de caméra,
   * caméra libre, fondu du ciel couvert et chute du décor. Renvoie le temps réel écoulé (s).
   */
  private stepRealTime(view: AquariumView, timestamp: number): number {
    const realDt = this.advanceRealTime(timestamp);
    if (view.stepCameraTransition(realDt)) {
      this.probe.publishCamera(this.view);
    }
    // Caméra libre (#343) : touches tenues, pas fixes du modèle de déplacement.
    if (
      view.freeCameraActive &&
      view.stepFreeCamera(freeMoveAxesInto(this.freeMoves, this.freeAxes), realDt)
    ) {
      this.probe.publishCamera(this.view);
    }
    // Fondu du ciel couvert à la bascule de la pluie (#338) : jamais en capture.
    view.stepOvercastFade(realDt);
    this.decorEdit.stepDrop(realDt);
    return realDt;
  }

  /** Pose les animaux, la nourriture, les œufs, le décor et la lumière du temps affiché. */
  private drawWorld(view: AquariumView, world: World): void {
    // En capture, l'image montre exactement l'état au temps demandé (alpha = 1).
    const time = this.renderTime();
    // Gestes des comportements (#427) : au temps affiché, fouille seulement s'il y a un
    // granulé posé (`sim/behaviors.ts`).
    // Objet de l'instance réécrit à chaque image (#433) : aucune allocation.
    this.behaviorFrame.time = time;
    this.behaviorFrame.landedFood = hasLandedFood(world.food);
    view.updateFish(
      world.entities,
      this.capture ? 1 : this.loop.alpha,
      world.seed,
      this.behaviorFrame,
      world.dead,
    );
    view.updateFood(world.food);
    view.updateEggs(world.eggs, EGG_HATCH_TIME);
    view.updateDecor(time);
    this.updateLight(view, time);
  }

  /**
   * Première image soumise : on attend l'image suivante pour être sûr qu'elle est composée à
   * l'écran avant de lever le signal du contrat de capture.
   */
  private signalReady(): void {
    this.readySignaled = true;
    this.document.defaultView?.requestAnimationFrame(() => {
      if (this.view) {
        markCaptureReady(this.document);
      }
    });
  }

  /**
   * Caméra automatique du fond d'écran (#279) : balancement lent autour de la vue
   * trois-quarts, au temps réel (indépendant de la simulation et de sa vitesse) ; exposée au
   * plus toutes les `WALLPAPER_CAMERA_EXPOSE_SECONDS`.
   */
  private stepWallpaperCamera(view: AquariumView, realDt: number): void {
    const dt = Number.isFinite(realDt) && realDt > 0 ? realDt : 0;
    this.orbitSeconds += Math.min(dt, WALLPAPER_MAX_ORBIT_STEP_SECONDS);
    view.applyOrbit(WALLPAPER_PRESET, wallpaperOrbitAngle(this.orbitSeconds));
    if (this.orbitSeconds - this.orbitExposedAt >= WALLPAPER_CAMERA_EXPOSE_SECONDS) {
      this.orbitExposedAt = this.orbitSeconds;
      this.probe.publishCamera(this.view);
    }
  }

  /**
   * Temps simulé affiché : celui du monde, interpolé comme les poissons (alpha = 0 : pas
   * précédent ; en capture, alpha = 1 : état exact au temps demandé).
   */
  private renderTime(): number {
    const world = this.currentWorld;
    if (!world) {
      return 0;
    }
    const alpha = this.capture ? 1 : this.loop.alpha;
    return Math.max(0, world.time - (1 - alpha) * SIM_DT);
  }

  /**
   * Éclairage de l'heure courante, recalculé seulement si l'heure a bougé d'au moins
   * `LIGHT_HOUR_STEP` (ou après une bascule de l'horloge) ; l'heure exposée suit.
   */
  private updateLight(view: AquariumView, time: number): void {
    const hour = hourAt(this.dayClock, time);
    const lamp = this.lampAt(hour);
    if (
      this.litHour === null ||
      Math.abs(hour - this.litHour) >= LIGHT_HOUR_STEP ||
      lamp !== this.litLamp
    ) {
      this.litHour = hour;
      this.litLamp = lamp;
      // Lampe du bac (#584) : ajoutée à la lumière du jour, sans jamais l'assombrir.
      view.updateLight(withLampInto(lightAtInto(hour, this.light), lamp));
      view.updateFlowers(hour);
      view.updateLightRays(hour);
      this.dayPhase.set(dayPhaseAt(hour));
      this.clockHour.set(snapHour(hour));
    }
    // Rayons (#567) : au plus une écriture par seconde.
    this.probe.publishLightRays(view.lightRaysStrength, view.lightRaysTime);
    this.probe.publishLamp(lamp);
    this.probe.publishHour(hour);
  }

  /**
   * Intensité de la lampe du bac affiché à l'heure `hour` (#584), arrondie au centième (pas de
   * recalcul de l'éclairage pour un écart invisible) : 0 hors des bacs à lampe. « Réduire les
   * mouvements » : changement net, sans fondu.
   */
  private lampAt(hour: number): number {
    const world = this.currentWorld;
    if (!world || !hasAlgae(world.environment)) {
      return 0;
    }
    const fade = this.reducedMotion() ? 0 : LAMP_FADE_HOURS;
    return Math.round(waterLampAt(world.water, hour, fade) * 100) / 100;
  }

  /**
   * Avance la simulation du temps réel écoulé depuis l'image précédente (hors capture).
   * Renvoie ce temps, en secondes (0 à la première image).
   */
  private advanceRealTime(timestamp: number): number {
    // Vitesse (#52) : temps simulé = temps réel × vitesse, toujours par pas `SIM_DT`.
    const realDt = this.loop.advance(timestamp, this.speed());
    const steps = this.loop.clock.steps;
    if (steps > 0 && this.currentWorld) {
      this.advanceAndRecord(this.currentWorld, steps);
      this.probe.publishTick(this.currentWorld);
      this.probe.publishFood(this.currentWorld);
      // Au plus 4 relevés par seconde de temps réel, quelle que soit la vitesse (#256).
      if (
        this.currentWorld.tick - this.waterReadTick >= WATER_READOUT_TICKS &&
        refreshDue(timestamp, this.waterReadAt)
      ) {
        this.waterReadAt = timestamp;
        // Les autres bacs avancent par lots, au rythme des relevés (#316, ADR 0076).
        this.advanceBackgroundTanks();
        this.refreshWater();
      }
    }
    return realDt;
  }

  /** Expose les effectifs (`data-aqfish-population`, signaux `population` et `populationMax`). */
  private refreshPopulation(): void {
    const world = this.currentWorld;
    if (!world) {
      return;
    }
    const counts = populationCounts(world);
    this.population.set(counts);
    // Pièce à jour pour ce monde (même objet) : plafond de la pièce ; sinon, celui du bac seul.
    const room = this.roomState;
    const shownTank = room?.tanks.find((tank) => tank.world === world);
    this.populationMax.set(
      room && shownTank ? roomPopulationLimits(room, shownTank.id, world) : populationLimits(world),
    );
    this.populationNotice.set(
      room && shownTank ? roomAnimalCapRefusal(room, shownTank.id, 1, world) : null,
    );
    this.health.set(healthSummary(world.entities));
    this.shownDead = world.dead?.length ?? 0;
    this.probe.publishDead(this.shownDead);
    this.refreshAlertAnimals(world);
    this.probe.publishPopulation(
      formatPopulation(counts, speciesShownIn(environmentById(world.environment).species, counts)),
    );
    const mode = careModeOf(world);
    if (mode === 'decor' && this.careSession()) {
      this.closeCareSession();
    }
    this.careMode.set(mode);
    this.probe.publishCareMode(mode);
    this.refreshCurrent(world);
  }

  /**
   * Corps du bac (#582) : un décès depuis le relevé précédent relève les effectifs (l'animal
   * mort n'y compte plus) et l'attribut `DEAD_ATTRIBUTE`.
   */
  private refreshDead(world: World): void {
    if ((world.dead?.length ?? 0) !== this.shownDead) {
      this.refreshPopulation();
    }
  }

  /** Animaux désignés par chaque alerte (#483) ; la mise en évidence cesse au changement de bac. */
  private refreshAlertAnimals(world: World): void {
    this.alertAnimals.set(
      alertTargets(world.entities, {
        temperature: world.water.temperature,
        ph: world.water.ph,
        mixes: mixWarnings(environmentById(world.environment).species, this.population()),
      }),
    );
    if (this.highlightWorld !== null && this.highlightWorld !== world) {
      this.clearAlertHighlight();
    }
  }

  /**
   * Met en évidence dans la scène les animaux `ids` pendant `ALERT_HIGHLIGHT_MS` (#483). Temps
   * réel : la mise en évidence vaut aussi simulation en pause. Rien n'est écrit dans le monde.
   */
  highlightAlertAnimals(ids: readonly number[]): void {
    const world = this.currentWorld;
    if (!world || this.capture || ids.length === 0) {
      return;
    }
    this.clearAlertHighlight();
    this.highlightWorld = world;
    this.view?.setAlertHighlight(ids);
    this.highlightedAnimals.set(ids.length);
    this.probe.publishAlertHighlight(ids.length);
    this.highlightTimer = setTimeout(() => this.clearAlertHighlight(), ALERT_HIGHLIGHT_MS);
  }

  private clearAlertHighlight(): void {
    if (this.highlightTimer !== null) {
      clearTimeout(this.highlightTimer);
      this.highlightTimer = null;
    }
    this.highlightWorld = null;
    this.view?.setAlertHighlight([]);
    this.highlightedAnimals.set(0);
    this.probe.publishAlertHighlight(0);
  }

  /** Temps du premier relevé d'un monde sans calendrier : début de son suivi (#513). */
  private maintenanceStartOf(world: World): number {
    let start = this.maintenanceStart.get(world);
    if (start === undefined) {
      start = world.time;
      this.maintenanceStart.set(world, start);
    }
    return start;
  }

  /** Enregistre une tâche faite ; le suivi commence au premier relevé du monde. */
  private recordMaintenance(world: MutableWorld, task: MaintenanceTask): void {
    world.maintenance ??= initialMaintenance(this.maintenanceStartOf(world));
    recordWorldMaintenanceInPlace(world, task);
  }

  /**
   * Inscrit dans le monde le début du suivi une fois le bac avancé, à la sauvegarde
   * automatique seulement (#513) : la simulation et un bac relu restent identiques au bit près.
   */
  private keepMaintenanceStart(): void {
    const world = this.currentWorld;
    if (world && !this.capture && world.maintenance === undefined) {
      const start = this.maintenanceStartOf(world);
      if (world.time > start) {
        world.maintenance = initialMaintenance(start);
      }
    }
  }

  /** Calendrier d'entretien du bac affiché (#513) ; jamais en capture (monde inchangé). */
  private refreshMaintenance(world: MutableWorld): void {
    if (this.capture) {
      return;
    }
    const state = world.maintenance ?? initialMaintenance(this.maintenanceStartOf(world));
    this.maintenance.set(
      maintenanceReadout(
        state,
        world.time,
        worldHasPrunablePlants(world)
          ? MAINTENANCE_TASKS
          : MAINTENANCE_TASKS.filter((task) => task !== 'prune'),
      ),
    );
  }

  /**
   * Avance le bac affiché de `steps` pas, coupés aux frontières de relevé (#511) : l'historique
   * ne dépend pas de la cadence d'affichage. Rythme du jour (#209) : `dayClock`.
   */
  private advanceAndRecord(world: MutableWorld, steps: number): void {
    const history = this.waterHistoryOf(world);
    let left = steps;
    while (left > 0) {
      const count = Math.min(left, ticksToNextWaterSample(world.tick));
      advanceInPlace(world, count, this.dayClock);
      left -= count;
      recordWaterHistory(history, world.water, world.tick);
    }
  }

  /** Tampon d'historique de `world`, repris de sa sauvegarde au premier accès (#511). */
  private waterHistoryOf(world: World): WaterHistory {
    let history = this.waterHistories.get(world);
    if (history === undefined) {
      history =
        world.waterHistory === undefined
          ? createWaterHistory()
          : restoreWaterHistory(world.waterHistory);
      this.waterHistories.set(world, history);
    }
    return history;
  }

  /**
   * Inscrit l'historique dans le monde, à la sauvegarde ou au changement de bac seulement
   * (#511) : un bac sans relevé nouveau reste identique à sa sauvegarde, au bit près.
   */
  private keepWaterHistory(world: MutableWorld): void {
    const history = this.waterHistories.get(world);
    if (history !== undefined && history.count > 0) {
      world.waterHistory = savedWaterHistory(history);
    }
  }

  /** Journal de `world`, repris de sa sauvegarde au premier accès (#581). */
  private journalOf(world: World): Journal {
    let journal = this.journals.get(world);
    if (journal === undefined) {
      journal = world.journal === undefined ? createJournal() : restoreJournal(world.journal);
      this.journals.set(world, journal);
    }
    return journal;
  }

  /**
   * Inscrit le journal dans le monde, à la sauvegarde ou au changement de bac seulement
   * (#581) : un bac sans événement nouveau reste identique à sa sauvegarde, au bit près.
   */
  private keepJournal(world: MutableWorld): void {
    const journal = this.journals.get(world);
    if (journal !== undefined && journal.entries.length > 0) {
      world.journal = savedJournal(journal);
    }
  }

  /**
   * Observe le bac affiché au rythme des relevés (#581) : maladies, guérisons, pontes,
   * éclosions et alertes franchies (#592) survenues depuis la dernière observation entrent au
   * journal (le premier regard sur un bac n'écrit rien ; un bac rangé garde sa dernière
   * observation, reportée par `carryJournalWatches`), puis publie le journal s'il a changé.
   * Jamais en capture.
   */
  private refreshJournal(world: World): void {
    if (this.capture) {
      return;
    }
    const journal = this.journalOf(world);
    const watch = this.journalWatches.get(world);
    const subject = {
      time: world.time,
      entities: world.entities,
      ...(world.eggs === undefined ? {} : { eggs: world.eggs }),
      alerts: worldAlerts(world),
    };
    if (watch === undefined) {
      this.journalWatches.set(world, watchJournal(subject));
    } else {
      for (const entry of observeJournal(watch, subject)) {
        addJournalEntry(journal, entry);
      }
    }
    if (journal !== this.shownJournal || journal.version !== this.shownJournalVersion) {
      this.shownJournal = journal;
      this.shownJournalVersion = journal.version;
      this.journal.set(journalLines(journal));
    }
  }

  /** Publie l'historique du bac affiché s'il a changé (#511) ; jamais en capture. */
  private refreshWaterHistory(world: World): void {
    if (this.capture) {
      return;
    }
    const history = this.waterHistoryOf(world);
    if (history !== this.shownHistory || history.version !== this.shownHistoryVersion) {
      this.shownHistory = history;
      this.shownHistoryVersion = history.version;
      this.waterHistory.set(waterHistoryView(history));
    }
  }

  /**
   * Avance et publie le parcours du bac affiché (#512), jamais en capture (monde inchangé) ni
   * en mode décor (eau en pause). Hors du monde (piège du cycle 176), sans allocation de vue
   * tant qu'aucune étape ne change.
   */
  private refreshFirstTankPath(world: World): void {
    if (this.capture) {
      return;
    }
    if (!firstTankPathAvailable(world.environment) || world.careMode === 'decor') {
      this.shownFirstTankPath = null;
      this.firstTankPath.set(null);
      return;
    }
    const facts = firstTankFacts(world);
    const state = advanceFirstTankPath(
      this.firstTankPaths.get(world) ?? world.firstTankPath ?? createFirstTankPath(facts),
      facts,
    );
    this.firstTankPaths.set(world, state);
    if (state !== this.shownFirstTankPath) {
      this.shownFirstTankPath = state;
      this.firstTankPath.set(firstTankPathView(state));
    }
  }

  /**
   * Inscrit le parcours dans le monde, à la sauvegarde automatique, à l'export ou au changement
   * de bac seulement, une fois le bac avancé (#512), comme le début du suivi d'entretien : un
   * bac relu et sans pas nouveau reste identique, au bit près.
   */
  private keepFirstTankPath(world: MutableWorld): void {
    const state = this.firstTankPaths.get(world);
    if (state !== undefined && world.time > state.startedAt) {
      world.firstTankPath = state;
    }
  }

  /**
   * Relevé de l'eau (#207) : signal `water` et `data-aqfish-water` mis à jour seulement s'il
   * change, trouble de l'eau de la vue suivant le niveau.
   */
  private refreshWater(): void {
    const world = this.currentWorld;
    if (!world) {
      return;
    }
    this.waterReadTick = world.tick;
    this.refreshTankList();
    this.waterSample.set(waterSample(world.water, world.environment, world.tick));
    this.care.refreshReadouts(world);
    this.probe.publishFilterBacteria(filterMaturityPercent(world.water));
    this.untreatedTap.set(world.water.untreatedTap === true);
    this.carbon.set(world.water.carbon === true);
    this.health.set(healthSummary(world.entities));
    this.refreshDead(world);
    this.refreshAlertAnimals(world);
    this.refreshMaintenance(world);
    this.refreshWaterHistory(world);
    this.refreshJournal(world);
    this.refreshFirstTankPath(world);
    const treatment = treatmentReadout(world.water);
    this.treatment.set(treatment);
    const pharmacy = pharmacyState(world.water, this.pharmacyUsed.get(world) ?? []);
    this.pharmacyUsed.set(world, pharmacy.used);
    this.pharmacy.set(pharmacy);
    const test = this.waterTests.get(world);
    this.waterTest.set(test === undefined ? null : waterTestView(test, world.tick));
    if (this.noticeWorld !== null && this.noticeWorld !== world) {
      this.noticeWorld = null;
      this.treatmentNotice.set(null);
    }
    this.probe.publishTreatment(treatment);
    const readout = waterReadout(
      world.water,
      world.environment,
      world.entities.map((entity) => entity.species),
    );
    if (!sameReadout(readout, this.water()) || !this.probe.hasWater()) {
      this.water.set(readout);
      this.probe.publishWater(readout);
    }
    this.view?.setWaterTurbidity(waterTurbidity(readout.quality));
    this.view?.setWaterTea(readout.tea);
    this.view?.setCatappa(world.water.catappa);
    this.refreshAlgae(world);
    this.refreshFeeder(world);
    this.refreshPlants(world);
  }

  /** Pousse des plantes à tige (#477) : vue (hauteur, ombre du fond) et `PLANTS_ATTRIBUTE`. */
  private refreshPlants(world: World): void {
    const view = this.view;
    let shown = '';
    world.decor.forEach((item, n) => {
      if (item.kind === 'plant' && item.form === 'tall') {
        const growth = worldShownPlantGrowth(world, n);
        view?.setPlantGrowth(n, growth);
        shown += shown === '' ? String(growth) : `,${growth}`;
      }
    });
    const shade = worldPlantShade(world);
    view?.setPlantShade(shade);
    // Attribut réécrit seulement s'il change (#494), comme le pas et l'heure.
    this.probe.publishPlants(shown, shade);
  }

  /** Distributeur automatique (#583) : vue, signal du tableau de bord et `FEEDER_ATTRIBUTE`. */
  private refreshFeeder(world: World): void {
    const feeder = world.feeder;
    this.view?.setFeeder(feeder !== undefined);
    if (this.probe.publishFeeder(feeder)) {
      this.feeder.set(feeder === undefined ? null : feederReadout(feeder));
    }
  }

  /** Algues du bac (#476) : vue, signal de l'éclairage et `ALGAE_ATTRIBUTE`. */
  private refreshAlgae(world: World): void {
    this.view?.setAlgae(worldAlgaePatches(world), world.water.algae);
    const hours = lightingOf(world.water);
    this.lighting.set(hours);
    this.lampOn.set(lampOnOf(world.water));
    const visible = visibleAlgaeCount(world.water.algae);
    this.visibleAlgae.set(visible);
    const percent = Math.round(algaeCoverage(world.water.algae) * 100);
    this.probe.publishAlgae(visible, percent, hours);
    this.refreshFouling(world);
  }

  /**
   * Voile d'encrassement (#607) : vue et `FOULING_ATTRIBUTE`. En capture, celui
   * d'`encrassement=` (séries existantes inchangées) ; jamais en mode décor ni hors des bacs à
   * algues.
   */
  private refreshFouling(world: World): void {
    const fouling = this.capture
      ? isDecorMode(world) || !hasAlgae(world.environment)
        ? NO_FOULING
        : sampleFouling(this.captureFouling)
      : worldFouling(world, this.maintenanceStartOf(world));
    this.view?.setFouling(environmentWater(world), fouling, hasFlatFloor(world.environment));
    this.probe.publishFouling(fouling, this.view?.foulingCounts ?? NO_FOULING);
  }

  /**
   * Applique la pluie à la vue courante et expose l'état obtenu (`data-aqfish-rain`).
   * `fade` : ciel couvert en fondu (bascule en cours de route), sinon d'un coup (démarrage).
   */
  private applyRain(enabled: boolean, fade = false): void {
    const raining = this.view?.setRain(enabled, fade) ?? false;
    this.rain.set(raining);
    this.probe.publishRain(raining);
  }

  /** Expose l'environnement (`data-aqfish-environment` et signal `environment`). */
  private refreshEnvironment(): void {
    const world = this.currentWorld;
    if (world) {
      this.environment.set(world.environment);
      this.probe.publishEnvironment(world.environment);
      this.refreshTankDimensions();
      this.decorEdit.environmentChanged(world.environment);
    }
  }

  /** Expose les dimensions du bac (`data-aqfish-tank` et signal `tankDimensions`). */
  private refreshTankDimensions(): void {
    const world = this.currentWorld;
    if (!world) {
      return;
    }
    const dims = placeDimensions(world);
    this.tankDimensions.set(isTankResizable(world.environment) ? dims : null);
    this.pondShape.set(world.shape ?? DEFAULT_POND_SHAPE);
    this.tankLiters.set(waterLiters(environmentWater(world)));
    this.probe.publishTank(world.shape ?? DEFAULT_POND_SHAPE, dims);
  }

  /** Expose l'état de l'horloge (`data-aqfish-hour-frozen` et signal `clockFrozen`). */
  private refreshClockFrozen(): void {
    this.clockFrozen.set(this.dayClock.frozen);
    this.probe.publishHourFrozen(this.dayClock.frozen);
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
    this.roomState = null;
    if (this.readySignaled) {
      resetCaptureReady(this.document);
    }
  }
}
