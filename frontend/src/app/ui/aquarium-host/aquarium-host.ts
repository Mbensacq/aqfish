import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  DOCUMENT,
  ElementRef,
  inject,
  InjectionToken,
  signal,
  viewChild,
} from '@angular/core';

import {
  hasWorldParams,
  parseCaptureParams,
  type CameraPreset,
  type CaptureParams,
  type CapturePopulation,
  type CaptureFurniture,
  type CaptureLayoutEntry,
  type CaptureWood,
} from '../../core/capture/capture-params';
import {
  readStoredSave,
  type SaveMessage,
  type SaveStatus,
  type SaveStorage,
  writeStoredSave,
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
import {
  chooseWallpaperConfig,
  clampWallpaperFps,
  DEFAULT_WALLPAPER_FPS,
  frameDue,
  readWallpaperGlobal,
  WALLPAPER_CONFIG_FILE,
  wallpaperGlobalText,
  wallpaperOrbitAngle,
  type FrameLimiter,
  type WallpaperSource,
} from '../../core/wallpaper/wallpaper';
import {
  AquariumView,
  createWebGLRenderer,
  type AquariumRendererFactory,
} from '../../render/aquarium-view';
import { CAMERA_TRANSITION_SECONDS } from '../../render/camera-presets';
import type { DecorPick } from '../../render/decor-pick';
import {
  addDecorItem,
  isDecorEditable,
  isDecorPoseAllowed,
  isDecorTool,
  MAX_DECOR_ITEMS,
  moveDecorItem,
  removeDecorItem,
  rotateDecorItem,
  scaleDecorItem,
  setDecorInPlace,
} from '../../sim/decor-edit';
import {
  DROP_TIME_STEP,
  decorDropScene,
  groundDecorItem,
  settleDecorItem,
  type DropPoint,
} from '../../sim/decor-drop';
import { decorFallScene, releaseUnsupportedDecor, type DecorFall } from '../../sim/decor-release';
import type { DecorDropper } from '../../core/decor-physics/decor-physics';
import {
  loadDecorPhysics,
  type DecorPhysicsLoader,
} from '../../core/decor-physics/load-decor-physics';
import { SIM_DT } from '../../sim/constants';
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
  isEnvironmentId,
  isPondShapeable,
  isTankResizable,
  placeDimensions,
  placeEnvironmentData,
  type EnvironmentId,
  type Place,
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
import { DEFAULT_POND_SHAPE, isPondShape, type PondShape } from '../../sim/pond-shape';
import { setPondShapeInPlace } from '../../sim/pond-reshape';
import {
  clampRoom,
  DEFAULT_ROOM,
  ROOM_ITEM_KINDS,
  type Room,
  type RoomItem,
  type RoomItemKind,
  type RoomQuarter,
} from '../../sim/room';
import { dropRoomItem, removeRoomItem, roomArea, roomItemBox } from '../../sim/room-furniture';
import { isRoomTool, type EditorTool } from '../decor-editor/decor-editor';
import { fixedStepInto, type FixedStepState } from '../../sim/fixed-step';
import {
  DEFAULT_SIM_SPEED,
  isSimSpeed,
  maxStepsForSpeed,
  scaledDt,
  type SimSpeed,
} from '../../sim/sim-speed';
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
  addSupport,
  addTank,
  findTank,
  MAX_TANK_NAME_LENGTH,
  removeSupport,
  removeTank,
  renameTank,
  stepRoom,
  SUPPORT_CATALOG,
  SUPPORT_KINDS,
  syncRoom,
  TANK_SIZE_IDS,
  tankAnimalCount,
  tankResizeRefusal,
  type RoomLayoutRefusal,
  type RoomState,
  type RoomTank,
  type SupportKind,
  type TankSizeId,
} from '../../sim/room-state';
import {
  findSupportSpot,
  findTankSpot,
  roomLayoutBlocks,
  type FloorRect,
} from '../../sim/room-layout';
import type { SaveSettings } from '../../sim/save';
import type { AlertSeverity } from '../../sim/dashboard-alerts';
import { addWarningText } from '../../sim/species-sheet';
import { tankList, worstAlert, type TankListEntry } from '../../sim/tank-list';
import {
  acceptsSpecies,
  careModeOf,
  isCareMode,
  setCareModeInPlace,
  speciesShownIn,
  type CareMode,
} from '../../sim/care-mode';
import { returnToCareInPlace } from '../../sim/care-return';
import { transferFish } from '../../sim/tank-transfer';
import { applySpeciesCountsInPlace, SPECIES_LABELS } from '../../sim/species-catalog';
import {
  DEFAULT_FOOD_STYLE,
  isFoodStyle,
  toggleFoodStyle as otherFoodStyle,
  type FoodStyle,
} from '../../core/food-style/food-style';
import type { SpeciesId } from '../../sim/species';
import { decorBaseY, decorElevation, validateDecorItem, type DecorItem } from '../../sim/decor';
import {
  advanceInPlace,
  advanceToWithFeedings,
  changeWorldWaterInPlace,
  createDefaultWorld,
  feedInPlace,
  setWorldCatappaInPlace,
  setWorldHeaterInPlace,
  starveWorldInPlace,
  type Entity,
  type MutableWorld,
  type World,
} from '../../sim/world';
import {
  DEFAULT_WATER_READOUT,
  isWaterQuality,
  sameReadout,
  sampleWater,
  waterReadout,
  waterTurbidity,
  type WaterReadout,
} from '../../sim/water-quality';
import { waterLiters } from '../../sim/water';
import { DEFAULT_WATER_SAMPLE, waterSample, type WaterSample } from '../../sim/water-dashboard';
import {
  EMPTY_HEALTH_SUMMARY,
  healthSummary,
  sameHealthSummary,
  type HealthSummary,
} from '../../sim/health-summary';
import { refreshDue } from '../dashboard-frame/refresh-pace';

/** Fabrique du renderer, remplaçable dans les tests (jsdom n'a pas WebGL). */
export const AQUARIUM_RENDERER_FACTORY = new InjectionToken<AquariumRendererFactory>(
  'AQUARIUM_RENDERER_FACTORY',
  { providedIn: 'root', factory: () => createWebGLRenderer },
);

/** Attribut du composant hôte exposant la position de la caméra aux tests de bout en bout. */
export const CAMERA_ATTRIBUTE = 'data-aqfish-camera';
/** Attribut du composant hôte exposant la cible de la caméra (mis à jour avec la position). */
export const CAMERA_TARGET_ATTRIBUTE = 'data-aqfish-target';
/** Attribut du composant hôte exposant `world.tick` (mis à jour quand il change). */
export const TICK_ATTRIBUTE = 'data-aqfish-tick';
/** Attribut du composant hôte exposant la graine du monde (fixée au démarrage). */
export const SEED_ATTRIBUTE = 'data-aqfish-seed';
/** Attribut du composant hôte exposant le filtre de rendu courant (`pixel` ou `aucun`). */
export const FILTER_ATTRIBUTE = 'data-aqfish-filter';

/** Attribut du composant hôte exposant le nombre de granulés de nourriture du monde (#67). */
export const FOOD_ATTRIBUTE = 'data-aqfish-food';
/** Attribut du composant hôte exposant le rendu des granulés (`points` ou `voxels`, #117). */
export const FOOD_STYLE_ATTRIBUTE = 'data-aqfish-food-style';

/** Attribut du composant hôte exposant l'heure de la journée affichée (2 décimales). */
export const HOUR_ATTRIBUTE = 'data-aqfish-hour';
/** Attribut du composant hôte : `true` si l'heure est figée, `false` sinon. */
export const HOUR_FROZEN_ATTRIBUTE = 'data-aqfish-hour-frozen';

/** Attribut du composant hôte exposant la vitesse de simulation (#52). */
export const SPEED_ATTRIBUTE = 'data-aqfish-speed';
/** Attribut du composant hôte : `true` si le décor est affiché, `false` sinon (#52). */
export const DECOR_ATTRIBUTE = 'data-aqfish-decor';
/** Attribut du composant hôte : `true` s'il pleut, `false` sinon (#106). */
export const RAIN_ATTRIBUTE = 'data-aqfish-rain';
/** Attribut exposant si la pièce autour du bac est affichée (#187), `true` ou `false`. */
export const ROOM_ATTRIBUTE = 'data-aqfish-room';
/** Attribut du composant hôte exposant les effectifs (`neon:12,guppy:6,corydora:6`, #69). */
export const POPULATION_ATTRIBUTE = 'data-aqfish-population';

/**
 * Attribut du composant hôte exposant le relevé de l'eau (#207) : `niveau;température;visée;
 * ammoniaque;nitrites;nitrates`, valeurs au dixième (`bonne;24;24;0;0;0`), mis à jour quand il
 * change.
 */
export const WATER_ATTRIBUTE = 'data-aqfish-water';
/**
 * Feuilles de catappa du bac et teinte de l'eau (#239) : « nombre;teinte », `3;1` (teinte 1 :
 * eau brun-thé), mis à jour avec le relevé de l'eau.
 */
export const CATAPPA_ATTRIBUTE = 'data-aqfish-catappa';
/** pH de l'eau et sa zone pour les espèces présentes, « 6.9;tolere » (#236). */
export const PH_ATTRIBUTE = 'data-aqfish-ph';
/** Pas de simulation entre deux relevés de l'eau dans la boucle (0,5 s simulée). */
export const WATER_READOUT_TICKS = 30;
/** Attribut du composant hôte exposant l'environnement courant (`tropical`, `bassin`, #87). */
export const ENVIRONMENT_ATTRIBUTE = 'data-aqfish-environment';

/**
 * Attribut du composant hôte exposant l'état de la sauvegarde automatique (#70) : `active`,
 * `indisponible` ou `plein` ; absent en mode capture (aucune sauvegarde).
 */
export const SAVE_ATTRIBUTE = 'data-aqfish-save';

/**
 * Chargeur du moteur de chute de l'éditeur (#170, ADR 0046) : import dynamique de Rapier par
 * défaut ; remplaçable dans les tests.
 */
export const DECOR_PHYSICS_LOADER = new InjectionToken<DecorPhysicsLoader>('DECOR_PHYSICS_LOADER', {
  providedIn: 'root',
  factory: () => loadDecorPhysics,
});

/** État du moteur de chute de l'éditeur (#170). */
export type DecorPhysicsState = 'absent' | 'chargement' | 'pret' | 'indisponible';

/** Attribut du composant hôte exposant l'état du moteur de chute (`DecorPhysicsState`, #170). */
export const DECOR_PHYSICS_ATTRIBUTE = 'data-aqfish-decor-physics';

/** Attribut du composant hôte : `true` en mode édition du décor, `false` sinon (#167). */
export const EDITING_ATTRIBUTE = 'data-aqfish-editing';
/** Attribut du composant hôte exposant le nombre d'éléments de `World.decor` (#167). */
export const DECOR_COUNT_ATTRIBUTE = 'data-aqfish-decor-count';
/**
 * Attribut du composant hôte exposant l'indice de l'élément de décor sélectionné, `aucun`
 * sans sélection (#167).
 */
export const DECOR_SELECTION_ATTRIBUTE = 'data-aqfish-decor-selected';
/**
 * Attribut du composant hôte exposant l'indice de l'élément de la pièce sélectionné, `aucun`
 * sans sélection (#188).
 */
export const ROOM_SELECTION_ATTRIBUTE = 'data-aqfish-room-selected';
/** Attribut du composant hôte exposant le nombre d'éléments de la pièce (#188). */
export const ROOM_COUNT_ATTRIBUTE = 'data-aqfish-room-count';
/** Nombre de bacs de la pièce de N bacs (#305, lot 2b), bac affiché et bacs rangés compris. */
export const ROOM_TANKS_ATTRIBUTE = 'data-aqfish-room-tanks';
/** Nombre de meubles supports de la pièce de N bacs (#305, lot 2b). */
export const ROOM_SUPPORTS_ATTRIBUTE = 'data-aqfish-room-supports';
/** Identifiant du bac sélectionné de la pièce (#306, lot 3). */
export const SELECTED_TANK_ATTRIBUTE = 'data-aqfish-selected-tank';
/** Mode du bac affiché (#278) : `soins` ou `decor`. */
export const CARE_MODE_ATTRIBUTE = 'data-aqfish-mode';
/**
 * Vue fond d'écran (#279) : source de la scène (`fichier`, `script`, `sauvegarde`, `defaut`),
 * absent hors fond d'écran.
 */
export const WALLPAPER_ATTRIBUTE = 'data-aqfish-fond';
/** Vue fond d'écran (#279) : `1` quand la boucle est en pause (page masquée), `0` sinon. */
export const WALLPAPER_PAUSED_ATTRIBUTE = 'data-aqfish-fond-pause';
/** Préréglage de base de la caméra automatique du fond d'écran (#279). */
export const WALLPAPER_PRESET: CameraPreset = 'three-quarter';
/** Écart (s réelles) entre deux expositions de la caméra automatique (`data-aqfish-camera`). */
export const WALLPAPER_CAMERA_EXPOSE_SECONDS = 1;
/** Pas de temps réel maximal versé à la caméra automatique (pas de saut après une pause). */
const WALLPAPER_MAX_ORBIT_STEP_SECONDS = 0.25;

/** Message du dernier transfert d'animal (#306) : réussite ou refus. */
export interface TransferNotice {
  readonly kind: 'info' | 'erreur';
  readonly text: string;
}

/** Bac de la pièce vu par le catalogue « Bacs et meubles » (#305). */
export interface RoomCatalogTank {
  readonly id: number;
  readonly name: string;
  readonly animals: number;
  /** Bac affiché (non retirable). */
  readonly shown: boolean;
  /** Support du bac posé (nom), « sol », ou `null` : position historique. */
  readonly on: string | null;
}

/** Meuble support vu par le catalogue « Bacs et meubles » (#305). */
export interface RoomCatalogSupport {
  readonly id: number;
  readonly name: string;
  /** Vrai si un bac repose dessus (non retirable). */
  readonly occupied: boolean;
}

/** Contenu de la pièce de N bacs pour le catalogue « Bacs et meubles » (#305). */
export interface RoomCatalog {
  readonly tanks: readonly RoomCatalogTank[];
  readonly supports: readonly RoomCatalogSupport[];
  /** Dernier refus, en clair ; `null` après une action acceptée. */
  readonly message: string | null;
}

/** Messages des refus du catalogue « Bacs et meubles » (#305). */
export const ROOM_LAYOUT_MESSAGES: Readonly<Record<RoomLayoutRefusal | 'aucune-place', string>> = {
  'aucune-place': 'Aucune place libre pour cet élément.',
  'piece-pleine': 'La pièce est pleine.',
  'bac-inconnu': 'Ce bac n’existe plus.',
  'meuble-inconnu': 'Ce meuble n’existe plus.',
  'hors-piece': 'Hors de la pièce.',
  'hors-support': 'Le bac dépasse du meuble.',
  chevauchement: 'Un meuble ou un bac occupe déjà la place.',
  'support-occupe': 'Un bac repose sur ce meuble.',
  jardin: 'Le bassin se trouve au jardin.',
  'dernier-bac': 'La pièce garde au moins un bac.',
  'position-invalide': 'Choix invalide.',
};

/**
 * Attribut de l'hôte : dimensions du bac en mètres, `longueur:hauteur:profondeur` (issue
 * #171, même ordre que `bac=`).
 */
export const TANK_ATTRIBUTE = 'data-aqfish-tank';
/** Attribut de test : forme du bassin du monde courant (`rectangle` hors du bassin, #190). */
export const SHAPE_ATTRIBUTE = 'data-aqfish-shape';

/** Intervalle de la sauvegarde automatique, en millisecondes (#70). */
export const AUTOSAVE_INTERVAL_MS = 10_000;

/** Sauvegarde relue au démarrage (#70) ou choisie par le fond d'écran (#279). */
interface RestoredSave {
  readonly room: RoomState;
  readonly selectedTankId: number;
  readonly world: World;
  readonly settings: SaveSettings;
  readonly others: readonly World[];
}

/** Nom proposé pour le fichier exporté (#70). */
export const SAVE_FILE_NAME = 'aqfish-sauvegarde.json';

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

/**
 * Applique les effectifs de `population=` au monde, dans l'ordre de l'URL, bornés par le
 * catalogue d'espèces (`applySpeciesCountsInPlace`, #189). Une espèce inconnue, ou qui ne vit
 * pas dans l'environnement du monde (`Environment.species`, #88), est ignorée.
 */
export function applyPopulation(
  world: MutableWorld,
  population: readonly CapturePopulation[],
): void {
  applySpeciesCountsInPlace(world, population);
}

/**
 * Pièce `room` garnie des éléments de `meubles=` (#188), lâchés dans l'ordre autour d'un bac
 * `dims` (`dropRoomItem`) ; type inconnu ou pose refusée : élément ignoré. Nouvel objet.
 */
export function applyCaptureFurniture(
  room: Room,
  dims: TankDimensions,
  furniture: readonly CaptureFurniture[],
): Room {
  let current = room;
  for (const { kind, x, z, quarter } of furniture) {
    if (!(ROOM_ITEM_KINDS as readonly string[]).includes(kind)) {
      continue;
    }
    const result = dropRoomItem(current, dims, { kind: kind as RoomItemKind, x, z, quarter });
    if (result.ok) {
      current = { ...current, items: result.items };
    }
  }
  return current;
}

/**
 * Ajoute au décor du monde les bois flottés de `bois=` (#169), dans l'ordre de l'URL. Un bois
 * invalide (hors du bac de l'environnement, échelle hors bornes, graine invalide) est ignoré,
 * de même que ceux qui dépassent `MAX_DECOR_ITEMS`. Sans bois valide, le monde est inchangé.
 */
export function applyCaptureWoods(world: MutableWorld, woods: readonly CaptureWood[]): void {
  const dims = placeDimensions(world);
  const added = woods
    .map(({ x, z, rotation, scale, seed }): DecorItem => ({
      kind: 'wood',
      x,
      z,
      rotation,
      scale,
      seed,
    }))
    .filter((item) => validateDecorItem(item, dims).length === 0)
    .slice(0, Math.max(0, MAX_DECOR_ITEMS - world.decor.length));
  if (added.length > 0) {
    setDecorInPlace(world, [...world.decor, ...added]);
  }
}

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
  private readonly document = inject(DOCUMENT);
  private readonly rendererFactory = inject(AQUARIUM_RENDERER_FACTORY);
  private readonly saveStorage = inject(SAVE_STORAGE);
  private readonly physicsLoader = inject(DECOR_PHYSICS_LOADER);
  /** Moteur de chute, une fois chargé (#170). */
  private dropper: DecorDropper | null = null;
  /** Chute affichée (#170) : trajectoire de la base de l'élément `index`, temps écoulé (s). */
  private dropAnimation: { index: number; path: readonly DropPoint[]; elapsed: number } | null =
    null;

  private view: AquariumView | null = null;
  private frameId: number | null = null;
  private readySignaled = false;
  private capture = false;
  /** Vue fond d'écran (#279) : sans interface, caméra automatique, cadence limitée. */
  private wallpaper = false;
  /** Images par seconde de la vue fond d'écran (`fps=` ou `aqfishFond.fps`). */
  private wallpaperFps = DEFAULT_WALLPAPER_FPS;
  /** Limiteur d'images de la vue fond d'écran, réécrit en place (aucune allocation). */
  private readonly frameLimiter: FrameLimiter = { next: null };
  /** Temps réel (s) de la caméra automatique et de sa dernière exposition. */
  private orbitSeconds = 0;
  private orbitExposedAt = Number.NEGATIVE_INFINITY;
  /** Page masquée en vue fond d'écran : aucune image demandée (#279). */
  private paused = false;
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
  /**
   * Rattrapage des bacs non affichés (#316, ADR 0076) : monde affiché et son `tick` au dernier
   * rattrapage. Un autre monde affiché (changement de bac, import) repart de zéro.
   */
  private backgroundWorld: World | null = null;
  private backgroundTick = 0;
  /** État de la boucle à pas fixe, réécrit à chaque image (aucune allocation). */
  private readonly clock: FixedStepState = { steps: 0, accumulator: 0, alpha: 0 };
  private lastTimestamp: number | null = null;
  private exposedTick: number | null = null;
  private exposedFood: number | null = null;
  /** Horloge de la journée simulée (ADR 0018) : l'heure suit `world.time`. */
  private dayClock: DayClock = DEFAULT_DAY_CLOCK;
  /** Heure de l'éclairage appliqué en dernier (`null` : à appliquer à la prochaine image). */
  private litHour: number | null = null;
  /** Tampon de la lumière du jour, réécrit à chaque recalcul (aucune allocation). */
  private readonly light = createDayLight();
  private exposedHour: string | null = null;
  private readonly onFrame: FrameRequestCallback = (timestamp) => this.frame(timestamp);
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

  /** Effectif maximal de chaque espèce compte tenu des autres (`populationLimits`, #69). */
  readonly populationMax = signal<PopulationCounts>(NO_FISH);
  /** Relevé de l'eau affiché par le tableau de bord et le panneau (#207, #256), au dixième. */
  readonly water = signal<WaterReadout>(DEFAULT_WATER_READOUT);
  /**
   * Relevé exact de l'eau lu par le tableau de bord (#256) : remplacé à chaque relevé
   * (`exposeWater`), donc au plus 4 fois par seconde dans la boucle (`refreshDue`).
   */
  readonly waterSample = signal<WaterSample>(DEFAULT_WATER_SAMPLE);
  /**
   * Synthèse de la santé des animaux lue par le tableau de bord (#260), relevée avec l'eau
   * (`exposeWater`) et remplacée seulement si ce qu'elle affiche change (`sameHealthSummary`).
   */
  readonly health = signal<HealthSummary>(EMPTY_HEALTH_SUMMARY, { equal: sameHealthSummary });
  /** Pas du dernier relevé de l'eau (`exposeWater`). */
  private waterReadTick = Number.NEGATIVE_INFINITY;
  /** Instant (ms, horloge de `requestAnimationFrame`) du dernier relevé de la boucle. */
  private waterReadAt: number | null = null;

  /**
   * État de la sauvegarde automatique (#70) : `null` en mode capture (jamais de lecture ni
   * d'écriture du stockage) et avant le démarrage.
   */
  readonly saveStatus = signal<SaveStatus | null>(null);

  /** Dernier message de la section « Sauvegarde » (import refusé, import réussi…). */
  readonly saveMessage = signal<SaveMessage | null>(null);

  /** Mode édition du décor (#167) : les clics sur le bac posent ou choisissent un élément. */
  readonly decorEditing = signal(false);

  /** Vrai si le décor de l'environnement courant est modifiable (bac tropical, #167). */
  readonly decorEditable = signal(false);

  /** Outil courant de l'éditeur de décor (#167). */
  readonly decorTool = signal<EditorTool>('rock');

  /** Indice de l'élément de la pièce sélectionné (#188), `null` sinon. */
  readonly roomSelection = signal<number | null>(null);

  /** Vrai si la pièce est dessinée, donc modifiable en mode édition (#188). */
  readonly roomEditable = signal(false);

  /** Nombre d'éléments de la pièce (#188). */
  readonly roomCount = signal(0);

  /** Bacs et meubles supports de la pièce de N bacs (#305), pour le catalogue. */
  readonly roomCatalog = signal<RoomCatalog>({ tanks: [], supports: [], message: null });

  /**
   * Liste des bacs de la pièce (#306, lot 3) : nom, environnement, litrage, animaux et pire
   * gravité d'alerte de chaque bac, bac sélectionné compris (relevé à chaque relevé de l'eau).
   */
  readonly tankList = signal<readonly TankListEntry[]>([]);
  /** Mode du bac affiché (#278) : `decor` remplace le tableau de bord par le badge. */
  readonly careMode = signal<CareMode>('soins');

  /** Message du dernier transfert d'animal (#306), `null` avant tout transfert. */
  readonly transferNotice = signal<TransferNotice | null>(null);

  /** Indice de l'élément de décor sélectionné (#167), `null` sinon. */
  readonly decorSelection = signal<number | null>(null);

  /** Nombre d'éléments du décor (#167). */
  readonly decorCount = signal(0);

  /**
   * Vrai si la dernière pose demandée (glissement, rotation, échelle, #168) a été refusée
   * parce qu'elle pénétrait un autre élément ; effacé à la sélection suivante ou à la pose
   * acceptée suivante.
   */
  readonly decorRefused = signal(false);

  /** État du moteur de chute (#170), chargé à la première ouverture de l'éditeur. */
  readonly decorPhysics = signal<DecorPhysicsState>('absent');

  /**
   * Vrai si le dernier élément lâché a été posé sur le sable sans chute, faute de moteur
   * (#170) ; effacé à la pose suivante réussie.
   */
  readonly decorDropGrounded = signal(false);

  /**
   * Dimensions du bac du monde courant (issue #171), `null` si l'environnement ne les règle
   * pas (`isTankResizable`).
   */
  readonly tankDimensions = signal<TankDimensions | null>(null);
  /** Forme du bassin du monde courant (issue #190) : rectangle hors du bassin. */
  readonly pondShape = signal<PondShape>(DEFAULT_POND_SHAPE);
  /** Litres d'eau du bac du monde courant (#237, avertissements d'ajout), `null` avant le départ. */
  readonly tankLiters = signal<number | null>(null);

  /**
   * Glissement en cours (#168) : décor du monde au début du geste (abandon s'il a changé
   * entre-temps) et dernier aperçu (décor déplacé, borné au bac).
   */
  private decorDrag: {
    readonly base: readonly DecorItem[];
    readonly index: number;
    preview: DecorItem[] | null;
  } | null = null;

  /**
   * Glissement en cours d'un élément de la pièce (#188) : pièce au début du geste (abandon si
   * elle a changé entre-temps) et dernière pose acceptée par `dropRoomItem`.
   */
  private roomDrag: {
    readonly base: Room;
    readonly index: number;
    preview: readonly RoomItem[] | null;
  } | null = null;

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
    return this.clock.alpha;
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
    this.activePreset.set(preset);
    view.animateToPreset(preset, this.capture ? 0 : CAMERA_TRANSITION_SECONDS);
    if (!view.transitioning) {
      this.exposeCamera();
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
      this.exposeFilter();
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
    this.exposeClockFrozen();
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
    this.host.nativeElement.setAttribute(SPEED_ATTRIBUTE, String(speed));
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
    this.host.nativeElement.setAttribute(DECOR_ATTRIBUTE, String(visible));
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
   * en mode capture (`pluie=`) ou avant le démarrage. Rien n'est sauvegardé.
   */
  setRain(enabled: boolean): void {
    if (!this.view || this.capture) {
      return;
    }
    this.applyRain(enabled);
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
    setPopulationInPlace(world, species, count);
    this.exposePopulation();
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
    this.exposeWater();
    this.saveNow();
    this.scheduleFrame();
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
    this.exposeWater();
    this.saveNow();
    this.scheduleFrame();
  }

  /**
   * Change d'environnement (#87, ADR 0026, #277, ADR 0063) : range le monde affiché, figé, et
   * reprend celui de l'environnement choisi tel qu'il avait été laissé (population, décor,
   * eau, nourriture, dimensions, temps) ; un environnement jamais visité part de son monde de
   * départ avec la même graine. Puis recrée la vue, la caméra allant sur la vue par défaut de
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
    this.finishDropAnimation();
    const fromTime = this.renderTime();
    // Les autres bacs rattrapent le bac quitté avant l'échange (#316) ; le bac quitté garde
    // son identifiant dans la pièce, même jamais sauvegardé (#264).
    this.advanceBackgroundTanks();
    this.syncRoomState(world);
    const next = switchEnvironment(world, this.stash, id);
    this.stash = next.stash;
    this.currentWorld = next.world as MutableWorld;
    // La liste des bacs (#306) suit aussitôt le bac affiché.
    this.syncRoomState(next.world);
    this.clock.accumulator = 0;
    this.clock.alpha = 0;
    this.dayClock = carryClock(this.dayClock, fromTime, this.renderTime());
    this.litHour = null;
    this.exposeEnvironment();
    this.exposeTick();
    this.exposeFood();
    this.exposePopulation();
    this.exposeWater();
    this.createView(environmentById(id).defaultCamera);
    this.exposeCamera();
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
      return this.refuseRoomLayout(refusal);
    }
    // Une chute en cours se termine d'abord : son décor est celui que l'on redimensionne.
    this.finishDropAnimation();
    const applied = setTankDimensionsInPlace(world, dims);
    if (applied === null || sameDimensions(applied, previous)) {
      return;
    }
    const selection = this.decorSelection();
    this.exposeTankDimensions();
    this.exposeFood();
    this.createView(this.activePreset() ?? environmentById(world.environment).defaultCamera);
    if (selection !== null && selection < world.decor.length) {
      this.view?.setDecorSelection(selection);
    }
    this.exposeCamera();
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
    this.finishDropAnimation();
    if (setPondShapeInPlace(world, shape) === null) {
      return;
    }
    this.exposeTankDimensions();
    this.exposeFood();
    this.createView(this.activePreset() ?? environmentById(world.environment).defaultCamera);
    this.exposeCamera();
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
    this.exposeClockFrozen();
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
      this.exposeFood();
      this.scheduleFrame();
    }
  }

  /**
   * Entre en mode édition du décor ou en sort (#167). En sortant, la sélection est effacée.
   * Sans effet en mode capture (`edition=`), avant le démarrage, ou pour entrer dans un
   * environnement dont le décor n'est pas modifiable (`isDecorEditable`).
   */
  setDecorEditing(editing: boolean): void {
    const world = this.currentWorld;
    if (!world || !this.view || this.capture || (editing && !isDecorEditable(world.environment))) {
      return;
    }
    if (!editing) {
      this.selectDecor(null);
    } else {
      this.loadDecorPhysics();
    }
    this.applyDecorEditing(editing);
  }

  /** Charge le moteur de chute une seule fois (#170) ; un échec est retenu (`indisponible`). */
  private loadDecorPhysics(): void {
    if (this.decorPhysics() !== 'absent') {
      return;
    }
    this.exposeDecorPhysics('chargement');
    this.physicsLoader().then(
      (dropper) => {
        this.dropper = dropper;
        this.exposeDecorPhysics('pret');
      },
      () => this.exposeDecorPhysics('indisponible'),
    );
  }

  private exposeDecorPhysics(state: DecorPhysicsState): void {
    this.decorPhysics.set(state);
    this.host.nativeElement.setAttribute(DECOR_PHYSICS_ATTRIBUTE, state);
  }

  /**
   * Fait tomber l'élément `index` de `decor` (#170) depuis le dessus du décor jusqu'au repos
   * sur le sable ou sur un autre élément. Sans moteur (en chargement ou indisponible), ou si
   * la chute échoue, l'élément est posé sur le sable à sa position. Renvoie le décor obtenu
   * et la trajectoire à afficher (vide sans chute).
   */
  private dropDecor(
    decor: readonly DecorItem[],
    index: number,
    environment: Place,
  ): { decor: readonly DecorItem[]; path: readonly DropPoint[] } {
    const scene = this.dropper ? decorDropScene(decor, index, environment) : null;
    if (this.dropper && scene) {
      try {
        const result = this.dropper.drop(scene);
        const settled = settleDecorItem(decor, index, result.rest, environment);
        if (settled) {
          this.decorDropGrounded.set(false);
          return { decor: settled, path: [scene.start, ...result.path] };
        }
      } catch {
        // Moteur en erreur : repli sur le sable, comme sans moteur.
      }
    }
    this.decorDropGrounded.set(this.decorPhysics() === 'indisponible');
    return { decor: groundDecorItem(decor, index) ?? decor, path: [] };
  }

  /**
   * Chute d'un élément depuis sa pose (#182) : son support a disparu. Mêmes moteur et lecture
   * du repos que le lâcher (`dropDecor`), départ à sa pose (`decorFallScene`). `null` sans
   * moteur, hors d'un environnement éditable, ou si le moteur échoue.
   */
  private readonly fallDecor: DecorFall = (decor, index) => {
    const world = this.currentWorld;
    const scene = world ? decorFallScene(decor, index, world) : null;
    if (!world || !this.dropper || !scene) {
      return null;
    }
    try {
      const result = this.dropper.drop(scene);
      const settled = settleDecorItem(decor, index, result.rest, world);
      return settled ? { decor: settled, path: [scene.start, ...result.path] } : null;
    } catch {
      return null;
    }
  };

  /** Affiche la chute de l'élément `index` le long de `path` (rien si `path` est vide). */
  private playDrop(index: number, path: readonly DropPoint[]): void {
    this.dropAnimation = path.length > 0 ? { index, path, elapsed: 0 } : null;
  }

  /** Avance la chute affichée de `realDt` secondes ; à la fin, l'élément est à sa pose. */
  private stepDropAnimation(view: AquariumView, realDt: number): void {
    const animation = this.dropAnimation;
    const item = animation ? this.currentWorld?.decor[animation.index] : undefined;
    if (!animation || !item) {
      this.dropAnimation = null;
      return;
    }
    animation.elapsed += realDt;
    const step = Math.floor(animation.elapsed / DROP_TIME_STEP);
    if (step >= animation.path.length - 1) {
      this.dropAnimation = null;
      view.previewDecorPose(animation.index, item.x, decorBaseY(item), item.z);
      return;
    }
    const p = animation.path[step];
    view.previewDecorPose(animation.index, p.x, p.y, p.z);
  }

  /** Termine aussitôt la chute affichée (l'élément rejoint sa pose). */
  private finishDropAnimation(): void {
    if (this.dropAnimation && this.view) {
      this.stepDropAnimation(this.view, Number.POSITIVE_INFINITY);
    }
  }

  /**
   * Choisit l'outil de l'éditeur de décor (#167), ou un élément de la pièce à poser quand la
   * pièce est dessinée (#188) ; un outil inconnu ou indisponible est ignoré.
   */
  setDecorTool(tool: string): void {
    if (isDecorTool(tool) || (isRoomTool(tool) && this.roomEditable())) {
      this.decorTool.set(tool);
    }
  }

  /**
   * Sélectionne l'élément d'indice `index` du décor (contour clair), ou aucun avec `null`
   * (#167). Sans effet hors du mode édition (sauf pour désélectionner) ou pour un indice
   * inexistant.
   */
  selectDecor(index: number | null): void {
    const world = this.currentWorld;
    const view = this.view;
    if (!world || !view) {
      return;
    }
    this.decorRefused.set(false);
    const valid =
      index !== null && Number.isInteger(index) && index >= 0 && index < world.decor.length;
    if (index !== null && (!valid || !this.decorEditing())) {
      return;
    }
    this.showDecorSelection(view, index);
    // Une seule sélection à la fois : celle de la pièce est levée (#188).
    view.setRoomSelection(null);
    this.exposeRoomSelection(null);
    this.scheduleFrame();
  }

  /** Dessine et expose la sélection du décor `index` (sans toucher à celle de la pièce). */
  private showDecorSelection(view: AquariumView, index: number | null): void {
    view.setDecorSelection(index);
    this.exposeDecorSelection(index);
  }

  /**
   * Sélectionne l'élément d'indice `index` de la pièce (#188, contour clair), ou aucun avec
   * `null` ; lève la sélection du décor. Sans effet hors du mode édition (sauf pour
   * désélectionner) ou pour un indice inexistant.
   */
  selectRoomItem(index: number | null): void {
    const view = this.view;
    const items = this.room().items ?? [];
    if (!view) {
      return;
    }
    if (index !== null && !(this.decorEditing() && index >= 0 && index < items.length)) {
      return;
    }
    // Lève la sélection du décor sans passer par `selectDecor`, qui lèverait aussi celle de
    // la pièce : la coque de contour serait détruite puis reconstruite (#202).
    this.decorRefused.set(false);
    this.showDecorSelection(view, null);
    view.setRoomSelection(index);
    this.exposeRoomSelection(index);
    this.scheduleFrame();
  }

  /**
   * Supprime l'élément de décor sélectionné (touche Suppr, bouton « Supprimer », #167) ;
   * renvoie `true` s'il a été supprimé. Sans effet sans sélection.
   */
  deleteSelectedDecor(): boolean {
    const roomIndex = this.roomSelection();
    if (roomIndex !== null && this.decorEditing()) {
      // Pièce (#188) : ce que l'élément portait retombe ; refus s'il resterait en l'air.
      const items = removeRoomItem(this.room().items ?? [], roomIndex);
      if (!items) {
        this.decorRefused.set(true);
        return false;
      }
      this.applyRoomItems(items, null);
      return true;
    }
    const world = this.currentWorld;
    const index = this.decorSelection();
    if (!world || index === null || !this.decorEditing()) {
      return false;
    }
    const decor = removeDecorItem(world.decor, index);
    if (!decor) {
      return false;
    }
    this.applyDecor(decor, null);
    return true;
  }

  /**
   * Clic en mode édition (#167) : un élément touché est sélectionné ; un point du sable reçoit
   * l'élément de l'outil courant (qui est alors sélectionné), ou, avec l'outil `select`,
   * désélectionne ; un clic hors du bac désélectionne. Sans effet hors du mode édition.
   */
  editAt(pick: DecorPick): void {
    const world = this.currentWorld;
    if (!world || !this.decorEditing()) {
      return;
    }
    if (pick === null) {
      this.selectDecor(null);
      return;
    }
    if (pick.kind === 'item') {
      this.selectDecor(pick.index);
      return;
    }
    const tool = this.decorTool();
    if (pick.kind === 'room-item' || pick.kind === 'floor') {
      // Pièce (#188) : un outil de la pièce pose au point visé (sur le parquet ou sur le
      // meuble touché) ; sinon, un élément touché est sélectionné, le parquet désélectionne.
      if (isRoomTool(tool)) {
        this.addRoomItem(tool, pick.x, pick.z);
      } else if (pick.kind === 'room-item') {
        this.selectRoomItem(pick.index);
      } else {
        this.selectDecor(null);
      }
      return;
    }
    if (tool === 'select' || isRoomTool(tool)) {
      this.selectDecor(null);
      return;
    }
    const decor = addDecorItem(world.decor, tool, pick.x, pick.z, world.seed, world);
    if (decor) {
      const index = decor.length - 1;
      const drop = this.dropDecor(decor, index, world);
      // Un élément ajouté peut chevaucher (#167) ; sa chute ne doit pas l'aggraver.
      const allowed = isDecorPoseAllowed(decor, drop.decor, index);
      this.applyDecor(allowed ? drop.decor : decor, index);
      this.playDrop(index, allowed ? drop.path : []);
    } else {
      this.selectDecor(null);
    }
  }

  /**
   * Tourne l'élément sélectionné de `steps` pas de 15° (flèches, boutons, #168) ; renvoie
   * `true` si la pose a changé. Refusée (`decorRefused`) si elle pénètre un autre élément.
   */
  rotateSelectedDecor(steps: number): boolean {
    if (this.roomSelection() !== null) {
      return this.turnSelectedRoomItem(steps);
    }
    return this.editSelected((decor, index, env) => rotateDecorItem(decor, index, steps, env));
  }

  /**
   * Agrandit (`steps` > 0) ou réduit l'élément sélectionné (touches + et −, boutons, #168) ;
   * renvoie `true` si la pose a changé. Sans effet à la borne d'échelle ; refusée
   * (`decorRefused`) si elle pénètre un autre élément.
   */
  scaleSelectedDecor(steps: number): boolean {
    // Un élément de la pièce garde sa taille (#188).
    if (this.roomSelection() !== null) {
      return false;
    }
    return this.editSelected((decor, index, env) => scaleDecorItem(decor, index, steps, env));
  }

  /**
   * Applique `edit` à l'élément sélectionné ; `null` d'`edit` : pose refusée ou inchangée.
   * Un élément posé sur un autre retombe ensuite depuis sa position (#183, `redropEdited`).
   */
  private editSelected(
    edit: (decor: readonly DecorItem[], index: number, env: Place) => DecorItem[] | null,
  ): boolean {
    const world = this.currentWorld;
    const index = this.decorSelection();
    if (!world || index === null || !this.decorEditing() || this.decorDrag) {
      return false;
    }
    const redrop = this.redropEdited(edit, world.decor, index, world);
    if (redrop) {
      this.applyDecor(redrop.decor, index);
      this.playDrop(index, redrop.path);
      return true;
    }
    const decor = edit(world.decor, index, world);
    if (!decor) {
      // Inchangée à la borne d'échelle ; sinon, la pose pénétrait un voisin.
      this.decorRefused.set(this.wouldOverlap(edit, world.decor, index, world));
      return false;
    }
    this.applyDecor(decor, index);
    return true;
  }

  /**
   * Rotation ou échelle d'un élément posé sur un autre (`elevation` > 0, #183) : l'élément
   * modifié retombe depuis sa position, par le moteur du lâcher (`dropDecor`). Réduit ou
   * tourné, il rejoint son support au lieu de rester au-dessus d'un vide ; agrandi, il s'y
   * repose plus haut au lieu d'être refusé. `null` si l'élément est sur le sable (sa pose ne
   * change pas), si le moteur n'est pas prêt (l'élévation est alors gardée : la poser sur le
   * sable la ferait pénétrer son support), si `edit` échoue même sans voisins (borne
   * d'échelle), ou si la pose obtenue pénètre un autre élément (`isDecorPoseAllowed`).
   */
  private redropEdited(
    edit: (decor: readonly DecorItem[], index: number, env: Place) => DecorItem[] | null,
    decor: readonly DecorItem[],
    index: number,
    env: Place,
  ): { decor: readonly DecorItem[]; path: readonly DropPoint[] } | null {
    if (!this.dropper || decorElevation(decor[index]) === 0) {
      return null;
    }
    // Sans les voisins : la pose est vérifiée après la chute, pas à l'élévation d'avant.
    const alone = edit([decor[index]], 0, env);
    if (!alone) {
      return null;
    }
    const candidate = decor.map((item, n) => (n === index ? alone[0] : item));
    const drop = this.dropDecor(candidate, index, env);
    return drop.path.length > 0 && isDecorPoseAllowed(decor, drop.decor, index) ? drop : null;
  }

  /** Vrai si `edit` a échoué pour cause de chevauchement (et non de borne). */
  private wouldOverlap(
    edit: (decor: readonly DecorItem[], index: number, env: Place) => DecorItem[] | null,
    decor: readonly DecorItem[],
    index: number,
    env: Place,
  ): boolean {
    // Sans les voisins, la même modification réussit-elle ?
    return edit([decor[index]], 0, env) !== null;
  }

  /** Début du glissement de l'élément `index` (#168) : il est sélectionné. */
  startDecorDrag(index: number): void {
    const world = this.currentWorld;
    if (!world || !this.decorEditing() || index < 0 || index >= world.decor.length) {
      return;
    }
    this.finishDropAnimation();
    this.selectDecor(index);
    this.decorDrag = { base: world.decor, index, preview: null };
  }

  /** Glissement (#168) : aperçu de l'élément au point visé, borné au bac. */
  moveDecorDrag(index: number, x: number, z: number): void {
    const world = this.currentWorld;
    const drag = this.decorDrag;
    if (!world || !drag || drag.index !== index || world.decor !== drag.base) {
      return;
    }
    const preview = moveDecorItem(world.decor, index, x, z, world);
    if (preview) {
      drag.preview = preview;
      this.view?.previewDecorMove(index, preview[index].x, preview[index].z);
      this.scheduleFrame();
    }
  }

  /**
   * Fin du glissement (#168) : la pose est enregistrée si elle ne pénètre aucun autre élément
   * (`isDecorPoseAllowed`) ; sinon, ou si le geste est abandonné, l'élément revient à sa
   * dernière pose valide.
   */
  endDecorDrag(index: number, commit: boolean): void {
    const world = this.currentWorld;
    const drag = this.decorDrag;
    this.decorDrag = null;
    if (!world || !drag || drag.index !== index || world.decor !== drag.base || !drag.preview) {
      return;
    }
    // Lâché (#170) : l'élément tombe à sa nouvelle position avant d'être posé.
    const drop = commit
      ? this.dropDecor(drag.preview, index, world)
      : { decor: drag.preview, path: [] };
    const allowed = isDecorPoseAllowed(world.decor, drop.decor, index);
    if (commit && this.decorEditing() && allowed) {
      this.applyDecor(drop.decor, index);
      this.playDrop(index, drop.path);
      return;
    }
    const last = world.decor[index];
    this.view?.previewDecorMove(index, last.x, last.z);
    this.decorRefused.set(commit && !allowed);
    this.scheduleFrame();
  }

  /**
   * Pose un élément `kind` de la pièce au point (x, z) (#188) : il tombe sur le parquet ou
   * sur le meuble que son emprise chevauche (`dropRoomItem`), puis il est sélectionné. Pose
   * refusée (`decorRefused`) : place prise, hors de la pièce, pièce pleine…
   */
  private addRoomItem(kind: RoomItemKind, x: number, z: number): void {
    const result = dropRoomItem(this.room(), this.roomDimensions(), { kind, x, z, quarter: 0 });
    if (!result.ok) {
      this.selectDecor(null);
      this.decorRefused.set(true);
      return;
    }
    this.applyRoomItems(result.items, result.index);
  }

  /** Tourne l'élément sélectionné de la pièce d'un quart de tour par pas (signe de `steps`). */
  private turnSelectedRoomItem(steps: number): boolean {
    const index = this.roomSelection();
    const item = index === null ? undefined : this.room().items?.[index];
    if (!item || index === null || !this.decorEditing() || this.roomDrag || steps === 0) {
      return false;
    }
    const quarter = ((((item.quarter + Math.sign(steps)) % 4) + 4) % 4) as RoomQuarter;
    const result = dropRoomItem(
      this.room(),
      this.roomDimensions(),
      { kind: item.kind, x: item.x, z: item.z, quarter },
      index,
    );
    if (!result.ok) {
      this.decorRefused.set(true);
      return false;
    }
    this.applyRoomItems(result.items, index);
    return true;
  }

  /** Début du glissement d'un élément de la pièce (#188) : il est sélectionné. */
  startRoomDrag(index: number): void {
    const items = this.room().items ?? [];
    if (!this.decorEditing() || index < 0 || index >= items.length) {
      return;
    }
    this.selectRoomItem(index);
    this.roomDrag = { base: this.room(), index, preview: null };
  }

  /**
   * Glissement d'un élément de la pièce vers (x, z) : aperçu de sa pose par gravité
   * (`dropRoomItem`), ce qu'il portait retombant ; une pose refusée garde l'aperçu précédent.
   */
  moveRoomDrag(index: number, x: number, z: number): void {
    const drag = this.roomDrag;
    const item = drag?.base.items?.[index];
    if (!drag || !item || drag.index !== index || this.room() !== drag.base) {
      return;
    }
    const result = dropRoomItem(
      drag.base,
      this.roomDimensions(),
      { kind: item.kind, x, z, quarter: item.quarter },
      index,
    );
    if (result.ok) {
      drag.preview = result.items;
      this.view?.previewRoom({ ...drag.base, items: result.items });
      this.scheduleFrame();
    }
  }

  /**
   * Fin du glissement : la dernière pose acceptée est appliquée et enregistrée (`commit`) ;
   * sinon (abandon, aucune pose acceptée), la pièce revient à son état du début du geste.
   */
  endRoomDrag(index: number, commit: boolean): void {
    const drag = this.roomDrag;
    this.roomDrag = null;
    if (!drag || drag.index !== index || this.room() !== drag.base) {
      return;
    }
    if (commit && drag.preview && this.decorEditing()) {
      this.applyRoomItems(drag.preview, index);
      return;
    }
    this.view?.previewRoom(drag.base);
    this.decorRefused.set(commit);
    this.scheduleFrame();
  }

  /** Dimensions du bac autour duquel la pièce est posée. */
  private roomDimensions(): TankDimensions {
    return this.currentWorld ? placeDimensions(this.currentWorld) : DEFAULT_TANK;
  }

  /**
   * Applique les éléments `items` à la pièce (#188), sélectionne l'élément `selection` (ou
   * aucun) et enregistre aussitôt (le rechargement les restitue).
   */
  private applyRoomItems(items: readonly RoomItem[], selection: number | null): void {
    const { shown, cabinetHeight } = this.room();
    this.applyRoom(items.length > 0 ? { shown, cabinetHeight, items } : { shown, cabinetHeight });
    this.decorRefused.set(false);
    this.selectRoomItem(selection);
    this.saveNow();
    this.scheduleFrame();
  }

  /**
   * Installe un décor édité (#167) : les éléments dont le support a disparu retombent d'abord
   * (#182, `releaseUnsupportedDecor`), puis obstacles du monde recalculés, vue mise à jour,
   * sélection `selection`, et sauvegarde immédiate (le rechargement le restitue). La première
   * de ces chutes est affichée, sauf si l'appelant affiche ensuite la sienne (`playDrop`).
   */
  private applyDecor(decor: readonly DecorItem[], selection: number | null): void {
    const world = this.currentWorld;
    const view = this.view;
    if (!world || !view) {
      return;
    }
    this.finishDropAnimation();
    const released = releaseUnsupportedDecor(decor, this.dropper ? this.fallDecor : null);
    setDecorInPlace(world, released.decor);
    const first = released.falls[0];
    if (first) {
      this.playDrop(first.index, first.path);
    }
    this.decorRefused.set(false);
    view.replaceDecorItems(world.decor, world.seed);
    this.exposeDecorCount();
    view.setDecorSelection(selection);
    this.exposeDecorSelection(selection);
    this.saveNow();
    this.scheduleFrame();
  }

  /** Dépose des granulés au centre du bac (bouton « Nourrir », touche `G`). */
  feedAtCenter(): void {
    this.feed(0, 0);
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
    this.host.nativeElement.setAttribute(ROOM_ATTRIBUTE, String(shown));
    // Éditeur (#188) : la pièce n'est modifiable que dessinée ; sélection et outil suivent.
    this.roomEditable.set(shown);
    const count = room.items?.length ?? 0;
    this.roomCount.set(count);
    this.host.nativeElement.setAttribute(ROOM_COUNT_ATTRIBUTE, String(count));
    const selection = this.roomSelection();
    if (selection !== null && (!shown || selection >= count)) {
      this.view?.setRoomSelection(null);
      this.exposeRoomSelection(null);
    }
    if (!shown && isRoomTool(this.decorTool())) {
      this.decorTool.set('select');
    }
  }

  /** Applique le rendu des granulés à la vue courante et l'expose. */
  private applyFoodStyle(style: FoodStyle): void {
    this.foodStyle.set(style);
    this.view?.setFoodStyle(style);
    this.host.nativeElement.setAttribute(FOOD_STYLE_ATTRIBUTE, style);
  }

  /**
   * Enregistre le monde et les réglages dans le stockage (sauvegarde automatique, #70) et
   * renvoie l'état obtenu. Sans effet en mode capture ou avant le démarrage (`null`). Ne lève
   * jamais : un stockage indisponible ou plein est signalé par `saveStatus`.
   */
  saveNow(): SaveStatus | null {
    const world = this.currentWorld;
    if (!world || this.capture) {
      return null;
    }
    let status: SaveStatus;
    try {
      status = writeStoredSave(this.saveStorage, this.saveText(world));
    } catch {
      status = 'indisponible';
    }
    this.exposeSaveStatus(status);
    return status;
  }

  /**
   * Télécharge la sauvegarde du monde courant (bouton « Exporter », #70) dans un fichier
   * JSON. Sans effet en mode capture ou avant le démarrage.
   */
  exportSave(): void {
    const world = this.currentWorld;
    const win = this.document.defaultView;
    if (!world || !win || this.capture) {
      return;
    }
    try {
      const text = this.saveText(world);
      const url = win.URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const link = this.document.createElement('a');
      link.href = url;
      link.download = SAVE_FILE_NAME;
      link.click();
      win.setTimeout(() => win.URL.revokeObjectURL(url), 0);
      this.saveMessage.set({ kind: 'info', text: 'Aquarium exporté.' });
    } catch {
      this.saveMessage.set({ kind: 'erreur', text: 'Export impossible dans ce navigateur.' });
    }
  }

  /**
   * Remplace le monde et les réglages par ceux d'une sauvegarde importée (bouton
   * « Importer », #70). Une sauvegarde refusée (`parseWorld`) laisse le bac en cours intact
   * et affiche la raison. Renvoie `true` si l'import a réussi. Sans effet en mode capture ou
   * avant le démarrage.
   */
  importSave(text: string): boolean {
    if (!this.currentWorld || !this.view || this.capture) {
      return false;
    }
    const result = parseSaveWorlds(text);
    if (!result.ok) {
      this.saveMessage.set({ kind: 'erreur', text: `Import refusé : ${result.error}.` });
      return false;
    }
    this.roomState = result.room;
    this.selectedTankId = result.selectedTankId;
    this.loadWorld(result.world as MutableWorld, result.settings, result.others);
    this.createView(environmentById(result.world.environment).defaultCamera);
    this.exposeCamera();
    this.scheduleFrame();
    this.saveMessage.set({ kind: 'info', text: 'Aquarium importé.' });
    this.saveNow();
    return true;
  }

  /**
   * Texte de la sauvegarde au schéma 2 (#264, ADR 0069) : la pièce resynchronisée avec le
   * monde affiché (bac sélectionné) et les mondes rangés.
   * @throws RangeError comme `serializeRoom`.
   */
  private saveText(world: World): string {
    this.advanceBackgroundTanks();
    const room = this.syncRoomState(world);
    return serializeRoom(room, this.selectedTankId, this.settings());
  }

  /** Resynchronise la pièce avec le monde affiché et les mondes rangés (`syncRoom`). */
  private syncRoomState(world: World): RoomState {
    const synced = syncRoom(this.roomState, world, stashedList(this.stash, world.environment));
    this.roomState = synced.room;
    this.selectedTankId = synced.selectedTankId;
    this.exposeRoomCatalog(this.roomCatalog().message);
    this.exposeTankList();
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
    this.exposePopulation();
    this.exposeWater();
    this.saveNow();
    this.scheduleFrame();
  }

  /**
   * Renomme le bac `id` de la liste (#316, `renameTank`) : nom normalisé, non vide, de
   * `MAX_TANK_NAME_LENGTH` caractères au plus ; enregistré aussitôt. Refus : message dans
   * `transferNotice`, nom inchangé. Sans effet en capture ou avant le démarrage.
   */
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
    this.exposePopulation();
    this.exposeWater();
    this.saveNow();
    this.scheduleFrame();
  }

  renameTank(id: number, name: string): void {
    const world = this.currentWorld;
    if (!world || this.capture) {
      return;
    }
    const renamed = renameTank(this.syncRoomState(world), id, name);
    if (renamed === null) {
      this.transferNotice.set({
        kind: 'erreur',
        text: `Nom refusé : de 1 à ${MAX_TANK_NAME_LENGTH} caractères`,
      });
      this.exposeTankList();
      return;
    }
    this.roomState = renamed;
    this.transferNotice.set(null);
    this.syncRoomState(world);
    this.saveNow();
  }

  /**
   * Liste des bacs (#306) : le bac sélectionné est relu à chaque appel (son monde avance en
   * place) ; les autres bacs gardent leur gravité en cache par monde, recalculée après chaque
   * rattrapage (#316). Rien en capture (aucune interface).
   */
  private exposeTankList(): void {
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
    this.host.nativeElement.setAttribute(SELECTED_TANK_ATTRIBUTE, String(selected));
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
      this.transferNotice.set({
        kind: 'erreur',
        text: `« ${tank.name} » est posé dans la pièce : pas encore sélectionnable`,
      });
      return;
    }
    this.transferNotice.set(null);
    this.setEnvironment(tank.world.environment);
  }

  /**
   * Transfère à l'épuisette un animal de l'espèce `species` du bac sélectionné vers le bac
   * `toId` (#306, `transferFish`) : le plus récent de cette espèce, comme le retrait de la
   * population. Le bac affiché perd l'animal en place ; le bac d'arrivée (rangé ou posé)
   * reçoit le nouvel animal, avec sa faim et sa santé. Refus (milieu, température, bac plein)
   * ou réussite : message dans `transferNotice`. Enregistré aussitôt. Sans effet en capture
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
      this.transferNotice.set({ kind: 'erreur', text: 'Aucun animal de cette espèce ici' });
      return;
    }
    const result = transferFish(room, this.selectedTankId, toId, fish.id);
    if (!result.ok) {
      this.transferNotice.set({ kind: 'erreur', text: result.message });
      return;
    }
    // Une chute en cours se termine d'abord, comme avant tout changement du monde affiché.
    this.finishDropAnimation();
    (world.entities as Entity[]).splice(index, 1);
    const arrival = findTank(result.room, toId) as RoomTank;
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
    this.transferNotice.set({
      kind: 'info',
      text: [`${moved} dans « ${arrival.name} »`, ...warnings].join('. '),
    });
    this.exposePopulation();
    this.exposeWater();
    this.saveNow();
    this.scheduleFrame();
  }

  /** Expose les bacs et meubles de la pièce (catalogue et attributs, #305). */
  private exposeRoomCatalog(message: string | null): void {
    const room = this.roomState;
    const supports = room?.furniture ?? [];
    const tanks = (room?.tanks ?? []).map((tank): RoomCatalogTank => {
      const supportId = tank.placement?.supportId;
      const support = supports.find((item) => item.id === supportId);
      return {
        id: tank.id,
        name: tank.name,
        animals: tankAnimalCount(tank),
        shown: tank.id === this.selectedTankId,
        on:
          tank.placement === null
            ? null
            : support === undefined
              ? 'sol'
              : `${SUPPORT_CATALOG[support.kind].name} ${support.id + 1}`,
      };
    });
    this.roomCatalog.set({
      tanks,
      supports: supports.map((item) => ({
        id: item.id,
        name: `${SUPPORT_CATALOG[item.kind].name} ${item.id + 1}`,
        occupied: (room?.tanks ?? []).some((tank) => tank.placement?.supportId === item.id),
      })),
      message,
    });
    this.host.nativeElement.setAttribute(ROOM_TANKS_ATTRIBUTE, String(tanks.length));
    this.host.nativeElement.setAttribute(ROOM_SUPPORTS_ATTRIBUTE, String(supports.length));
  }

  /**
   * Aire libre de la pièce graphique autour du bac affiché et obstacles (meubles de la pièce
   * graphique, ADR 0073) : la pose automatique du catalogue (#305) y cherche une place.
   */
  private roomFloor(world: World): { area: FloorRect; obstacles: FloorRect[] } {
    const area = roomArea(placeDimensions(world));
    return { area, obstacles: (this.room().items ?? []).map((item) => roomItemBox(item)) };
  }

  /**
   * Ajoute un meuble support du catalogue « Bacs et meubles » (#305) à la première place libre
   * de la pièce affichée. Refus (aucune place, pièce pleine) : message dans le catalogue.
   * Sans effet en capture, avant le démarrage ou pièce masquée.
   */
  addRoomSupport(kind: string): void {
    const world = this.currentWorld;
    if (!world || this.capture || !this.roomEditable()) {
      return;
    }
    if (!(SUPPORT_KINDS as readonly string[]).includes(kind)) {
      return this.refuseRoomLayout('position-invalide');
    }
    const room = this.syncRoomState(world);
    const { area, obstacles } = this.roomFloor(world);
    const spot = findSupportSpot(room, kind as SupportKind, area, obstacles);
    if (spot === null) {
      return this.refuseRoomLayout('aucune-place');
    }
    const result = addSupport(room, kind as SupportKind, spot.x, spot.z, 0);
    this.commitRoomLayout(result.ok ? result.room : null, result.ok ? null : result.reason);
  }

  /**
   * Ajoute un bac vide de l'environnement `environment` et de la taille `size` (catalogue
   * « Bacs et meubles », #305), posé à la première place libre du meuble `supportId` ou du
   * sol (`null`). Le bac posé est figé jusqu'au lot 3 (ADR 0073, 0074).
   */
  addRoomTank(environment: string, size: string, supportId: number | null): void {
    const world = this.currentWorld;
    if (!world || this.capture || !this.roomEditable()) {
      return;
    }
    if (!isEnvironmentId(environment) || !(TANK_SIZE_IDS as readonly string[]).includes(size)) {
      return this.refuseRoomLayout('position-invalide');
    }
    const room = this.syncRoomState(world);
    const { area, obstacles } = this.roomFloor(world);
    const placement = findTankSpot(
      room,
      environment,
      size as TankSizeId,
      supportId,
      area,
      obstacles,
    );
    if (placement === null) {
      return this.refuseRoomLayout(
        supportId !== null && !room.furniture.some((item) => item.id === supportId)
          ? 'meuble-inconnu'
          : 'aucune-place',
      );
    }
    const result = addTank(room, { environment, size: size as TankSizeId, placement });
    this.commitRoomLayout(result.ok ? result.room : null, result.ok ? null : result.reason);
  }

  /**
   * Retire le bac `id` de la pièce (#305), ses animaux avec lui ; un bac rangé (autre
   * environnement) quitte aussi les mondes rangés. Le bac affiché ne se retire pas. La
   * confirmation d'un bac peuplé revient au catalogue.
   */
  removeRoomTank(id: number): void {
    const world = this.currentWorld;
    if (!world || this.capture) {
      return;
    }
    const room = this.syncRoomState(world);
    const tank = findTank(room, id);
    if (tank === undefined || id === this.selectedTankId) {
      return this.refuseRoomLayout(tank === undefined ? 'bac-inconnu' : 'position-invalide');
    }
    const result = removeTank(room, id);
    if (result.ok && tank.placement === null) {
      const stash = new Map(this.stash);
      stash.delete(tank.world.environment);
      this.stash = stash;
    }
    this.commitRoomLayout(result.ok ? result.room : null, result.ok ? null : result.reason);
  }

  /** Retire le meuble support `id` (#305) ; refusé si un bac repose dessus. */
  removeRoomSupport(id: number): void {
    const world = this.currentWorld;
    if (!world || this.capture) {
      return;
    }
    const result = removeSupport(this.syncRoomState(world), id);
    this.commitRoomLayout(result.ok ? result.room : null, result.ok ? null : result.reason);
  }

  /**
   * Meubles et bacs de `bacs=` (#305), en capture : chacun à la première place libre, dans
   * l'ordre de l'URL ; type, taille, rang de meuble ou pose refusés : entrée ignorée.
   */
  private applyCaptureLayout(world: World, entries: readonly CaptureLayoutEntry[]): void {
    let room = this.syncRoomState(world);
    const { area, obstacles } = this.roomFloor(world);
    const supportIds: number[] = [];
    for (const entry of entries) {
      if ('kind' in entry) {
        const kind = entry.kind as SupportKind;
        const spot = SUPPORT_KINDS.includes(kind)
          ? findSupportSpot(room, kind, area, obstacles)
          : null;
        const result = spot === null ? null : addSupport(room, kind, spot.x, spot.z, 0);
        if (result?.ok) {
          room = result.room;
          supportIds.push(result.id);
        }
        continue;
      }
      const size = entry.size as TankSizeId;
      const supportId = entry.on === null ? null : supportIds[entry.on];
      if (!TANK_SIZE_IDS.includes(size) || supportId === undefined) {
        continue;
      }
      const placement = findTankSpot(room, 'tropical', size, supportId, area, obstacles);
      const result =
        placement === null ? null : addTank(room, { environment: 'tropical', size, placement });
      if (result?.ok) {
        room = result.room;
      }
    }
    this.roomState = room;
    this.exposeRoomCatalog(null);
  }

  private refuseRoomLayout(reason: RoomLayoutRefusal | 'aucune-place'): void {
    this.exposeRoomCatalog(ROOM_LAYOUT_MESSAGES[reason]);
  }

  /** Installe la pièce modifiée (ou affiche le refus), redessine et enregistre aussitôt. */
  private commitRoomLayout(room: RoomState | null, reason: RoomLayoutRefusal | null): void {
    if (room === null) {
      return this.refuseRoomLayout(reason ?? 'position-invalide');
    }
    this.roomState = room;
    this.exposeRoomCatalog(null);
    this.applyRoom(this.room());
    this.saveNow();
    this.scheduleFrame();
  }

  /** Message d'erreur d'un fichier trop gros pour être lu (contrôle du panneau, #70). */
  rejectImport(text: string): void {
    this.saveMessage.set({ kind: 'erreur', text: `Import refusé : ${text}.` });
  }

  /**
   * Installe un monde, ses réglages et les mondes des autres environnements (import) ; la
   * vue suit à part.
   */
  private loadWorld(world: MutableWorld, settings: SaveSettings, others: readonly World[]): void {
    this.currentWorld = world;
    this.stash = stashFromList(others, world.environment);
    this.clock.accumulator = 0;
    this.clock.alpha = 0;
    this.speed.set(settings.speed);
    this.host.nativeElement.setAttribute(SPEED_ATTRIBUTE, String(settings.speed));
    this.dayClock = settings.clock;
    this.foodStyle.set(settings.foodStyle ?? DEFAULT_FOOD_STYLE);
    this.room.set(settings.room ?? DEFAULT_ROOM);
    this.litHour = null;
    this.exposeClockFrozen();
    this.exposeEnvironment();
    this.exposeTick();
    this.exposeFood();
    this.exposePopulation();
    this.exposeWater();
  }

  /** Bascule entre pixel art et rendu sans filtre. */
  toggleFilter(): void {
    this.setFilter(toggleRenderFilter(this.filter()));
  }

  constructor() {
    afterNextRender(() => this.start());
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  private start(): void {
    const win = this.document.defaultView;
    if (!win) {
      return;
    }
    const params = parseCaptureParams(win.location.search);
    this.capture = params.capture;
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
      void this.loadWallpaperConfig(win, wallpaperGlobalText(global)).then((choice) => {
        if (!this.stopped) {
          this.host.nativeElement.setAttribute(WALLPAPER_ATTRIBUTE, choice.source);
          this.begin(win, params, choice.value);
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
   */
  private async loadWallpaperConfig(
    win: Window,
    scriptText: string | null,
  ): Promise<{ readonly source: WallpaperSource; readonly value: RestoredSave | null }> {
    const fileText = await readLocalText(win, WALLPAPER_CONFIG_FILE);
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
   */
  private begin(
    win: Window,
    params: CaptureParams,
    restoredOverride: RestoredSave | null | undefined,
  ): void {
    // En mode capture, le temps demandé est atteint ici, avant toute image (contrat de capture).
    // Le monde créé ici appartient à l'hôte seul : il pourra être avancé en place.
    // Dépôts de nourriture de `nourrir=` (#67) : au temps simulé de chacun, en capture.
    this.dayClock = initialDayClock(params.hour, params.capture);
    // Sauvegarde automatique (#70) : jamais en capture (images reproductibles) ; restaurée
    // au démarrage sauf si l'URL décrit le monde (`seed`, `environnement`, `population`).
    // Lue avant toute création : le monde neuf n'est créé que s'il n'y a rien à restaurer.
    const restored =
      restoredOverride !== undefined
        ? restoredOverride
        : params.capture || hasWorldParams(win.location.search)
          ? null
          : this.readSave();
    if (restored) {
      this.currentWorld = restored.world as MutableWorld;
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
    } else {
      if (params.capture && params.foodStyle !== null) {
        this.foodStyle.set(params.foodStyle);
      }
      // Pièce de `piece=1` (#187), en capture : appliquée à la création de la vue.
      if (params.capture && params.room) {
        this.room.set({ ...DEFAULT_ROOM, shown: true });
      }
      const environment = isEnvironmentId(params.environment)
        ? params.environment
        : DEFAULT_ENVIRONMENT_ID;
      // Forme du bassin de `forme=` (#190), en capture et au bassin seulement.
      const shape =
        params.capture && isPondShape(params.shape) && isPondShapeable(environment)
          ? params.shape
          : undefined;
      const world: MutableWorld = createDefaultWorld(params.seed, environment, shape);
      // Bois flottés de `bois=` (#169), en capture : ajoutés au décor avant la population,
      // après les dimensions du bac de `bac=` (#171).
      if (params.capture) {
        if (params.tank !== null) {
          setTankDimensionsInPlace(world, params.tank);
        }
        applyCaptureWoods(world, params.woods);
        // Éléments de la pièce de `meubles=` (#188), aux dimensions du bac de `bac=`.
        if (params.room && params.furniture.length > 0) {
          this.room.set(
            applyCaptureFurniture(this.room(), placeDimensions(world), params.furniture),
          );
        }
      }
      // Mode décor de `mode=decor` (#278) : avant `population=`, qui admet alors toute espèce.
      if (params.decorMode) {
        setCareModeInPlace(world, 'decor');
      }
      // Effectifs de `population=` (#69) : appliqués à t = 0, avant d'avancer le monde.
      applyPopulation(world, params.population);
      // Eau d'exemple de `eau=` (#207), en capture : à t = 0, avant d'avancer le monde.
      if (params.capture && isWaterQuality(params.water)) {
        world.water = sampleWater(world.environment, params.water);
      }
      // Animaux affamés de `affames=1` (#208), en capture : à t = 0, avant d'avancer le monde.
      if (params.capture && params.starved) {
        starveWorldInPlace(world);
      }
      // Feuilles de catappa neuves de `catappa=` (#239), en capture : à t = 0.
      if (params.capture && params.catappa > 0) {
        setWorldCatappaInPlace(world, params.catappa);
      }
      this.currentWorld = params.capture
        ? advanceToWithFeedings(world, params.time, params.feedings, this.dayClock)
        : world;
    }
    // Pièce de N bacs (#305) : bacs et meubles exposés au catalogue dès le démarrage ;
    // `bacs=` en capture, avec `piece=1`, y ajoute meubles supports et bacs posés.
    this.syncRoomState(this.currentWorld);
    if (params.capture && params.room && params.roomLayout.length > 0) {
      this.applyCaptureLayout(this.currentWorld, params.roomLayout);
    }
    // Vitesse de `vitesse=` (#232), hors capture : prime sur celle de la sauvegarde.
    // `vitesse=0` : le monde ne quitte pas t = 0 (captures d'interface reproductibles).
    if (!params.capture && params.speed !== null && isSimSpeed(params.speed)) {
      this.speed.set(params.speed);
    }
    // Fond d'écran (#279) : jamais d'écriture du stockage (la sauvegarde de l'application
    // n'est pas remplacée par la scène du fond d'écran) ; pause quand la page est masquée.
    if (!params.capture && !this.wallpaper) {
      this.saveStatus.set('active');
      this.startAutosave(win);
    }
    if (this.wallpaper && !params.capture) {
      this.startWallpaperPause();
    }
    this.exposeClockFrozen();
    this.host.nativeElement.setAttribute(SPEED_ATTRIBUTE, String(this.speed()));
    this.host.nativeElement.setAttribute(DECOR_ATTRIBUTE, String(this.decorVisible()));
    // Pluie de `pluie=1` (#106) : appliquée à la création de la vue (bassin seulement).
    this.rain.set(params.rain);
    this.host.nativeElement.setAttribute(SEED_ATTRIBUTE, String(this.currentWorld.seed));
    this.exposeEnvironment();
    this.exposeTick();
    this.exposeFood();
    this.exposePopulation();
    this.exposeWater();
    this.exposeSaveStatus(this.saveStatus());

    const filter = initialRenderFilter(
      params.filter,
      params.capture ? null : readStoredRenderFilter(browserStorage(win)),
      params.capture,
    );
    this.filter.set(filter);
    // Fond d'écran (#279) : pixel ratio 1, comme en capture (image pixel art, plus léger).
    this.pixelRatio = params.capture || this.wallpaper ? 1 : win.devicePixelRatio || 1;
    // Sans `camera=`, la vue par défaut de l'environnement (#87 : de dessus pour le bassin) ;
    // en fond d'écran, la vue trois-quarts, base de la caméra automatique.
    this.createView(
      params.cameraGiven
        ? params.camera
        : this.wallpaper
          ? WALLPAPER_PRESET
          : environmentById(this.currentWorld.environment).defaultCamera,
    );
    this.exposeFilter();
    this.applyDecorEditing(false);
    // `edition=` (#167) : mode édition et élément sélectionné, en capture seulement.
    if (
      params.capture &&
      params.editSelection !== null &&
      isDecorEditable(this.currentWorld.environment) &&
      params.editSelection < this.currentWorld.decor.length
    ) {
      this.applyDecorEditing(true);
      this.view?.setDecorSelection(params.editSelection);
      this.exposeDecorSelection(params.editSelection);
    }
    // `edition-meuble=` (#188) : mode édition et élément de la pièce sélectionné, en capture.
    const roomSelection = params.editRoomSelection;
    if (
      params.capture &&
      roomSelection !== null &&
      this.roomEditable() &&
      roomSelection < this.roomCount()
    ) {
      this.applyDecorEditing(true);
      this.view?.setRoomSelection(roomSelection);
      this.exposeRoomSelection(roomSelection);
    }

    const onResize = () => this.scheduleFrame();
    win.addEventListener('resize', onResize);
    this.cleanups.push(() => win.removeEventListener('resize', onResize));

    this.scheduleFrame();
  }

  /**
   * Sauvegarde automatique à restaurer au démarrage (#70) : monde et réglages, ou `null` s'il
   * n'y en a pas. Une sauvegarde illisible est ignorée (`null`) : le bac neuf sera créé, et
   * un message le signale.
   */
  private readSave(): RestoredSave | null {
    const text = readStoredSave(this.saveStorage);
    if (text === null) {
      return null;
    }
    const result = parseSaveWorlds(text);
    if (!result.ok) {
      this.saveMessage.set({
        kind: 'erreur',
        text: `Sauvegarde précédente illisible, aquarium neuf (${result.error}).`,
      });
      return null;
    }
    return result;
  }

  /**
   * Pause de la vue fond d'écran (#279) : page masquée, plus aucune image demandée ; de
   * nouveau visible, la boucle repart sans rattraper le temps passé masqué.
   */
  private startWallpaperPause(): void {
    const onVisibility = () => {
      const hidden = this.document.visibilityState === 'hidden';
      this.paused = hidden;
      this.host.nativeElement.setAttribute(WALLPAPER_PAUSED_ATTRIBUTE, hidden ? '1' : '0');
      if (hidden) {
        if (this.frameId !== null) {
          this.document.defaultView?.cancelAnimationFrame(this.frameId);
          this.frameId = null;
        }
        return;
      }
      this.lastTimestamp = null;
      this.frameLimiter.next = null;
      this.scheduleFrame();
    };
    onVisibility();
    this.document.addEventListener('visibilitychange', onVisibility);
    this.cleanups.push(() => this.document.removeEventListener('visibilitychange', onVisibility));
  }

  /**
   * Sauvegarde automatique (#70) : toutes les `AUTOSAVE_INTERVAL_MS`, quand l'onglet est
   * masqué et quand la page est quittée (`pagehide`, plus fiable que `beforeunload` sur
   * mobile).
   */
  private startAutosave(win: Window): void {
    const save = () => {
      this.saveNow();
    };
    const onVisibility = () => {
      if (this.document.visibilityState === 'hidden') {
        save();
      }
    };
    const timer = win.setInterval(save, AUTOSAVE_INTERVAL_MS);
    win.addEventListener('pagehide', save);
    this.document.addEventListener('visibilitychange', onVisibility);
    this.cleanups.push(() => {
      win.clearInterval(timer);
      win.removeEventListener('pagehide', save);
      this.document.removeEventListener('visibilitychange', onVisibility);
    });
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
    this.litHour = null;
    this.activePreset.set(preset);
    this.viewCleanups.push(view.onCameraChange(() => this.exposeCamera()));
    this.viewCleanups.push(view.onUserInteraction(() => this.activePreset.set(null)));
    view.setDecorDragEnabled(this.decorEditing());
    this.decorDrag = null;
    this.roomDrag = null;
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
    // En mode édition, un clic pose ou choisit un élément du décor au lieu de nourrir (#167).
    this.viewCleanups.push(
      view.onCanvasClick((x, y) => {
        if (this.decorEditing()) {
          this.editAt(view.pickDecor(x, y));
        }
      }),
    );
    this.viewCleanups.push(
      view.onSurfaceClick((x, z) => {
        if (!this.decorEditing()) {
          this.feed(x, z);
        }
      }),
    );
    // Vue neuve : aucun élément sélectionné.
    this.exposeDecorSelection(null);
    this.exposeRoomSelection(null);
  }

  private scheduleFrame(): void {
    const win = this.document.defaultView;
    if (!win || !this.view || this.frameId !== null || this.paused) {
      return;
    }
    this.frameId = win.requestAnimationFrame(this.onFrame);
  }

  private frame(timestamp: number): void {
    this.frameId = null;
    const view = this.view;
    if (!view) {
      return;
    }
    const wallpaper = this.wallpaper && !this.capture;
    // Fond d'écran (#279) : au plus `wallpaperFps` images par seconde (le temps réel écoulé
    // entre deux images rendues est versé d'un bloc à la simulation).
    if (
      wallpaper &&
      this.readySignaled &&
      !frameDue(this.frameLimiter, timestamp, this.wallpaperFps)
    ) {
      this.scheduleFrame();
      return;
    }
    let orbitDt = 0;
    if (!this.capture) {
      const realDt = this.advanceRealTime(timestamp);
      orbitDt = realDt;
      if (view.stepCameraTransition(realDt)) {
        this.exposeCamera();
      }
      if (this.dropAnimation) {
        this.stepDropAnimation(view, realDt);
      }
    }
    const canvas = this.canvasRef().nativeElement;
    if (view.resize(canvas.clientWidth, canvas.clientHeight)) {
      this.exposeCamera();
    }
    if (wallpaper) {
      this.stepWallpaperCamera(view, orbitDt);
    }
    if (this.currentWorld) {
      // En capture, l'image montre exactement l'état au temps demandé (alpha = 1).
      view.updateFish(
        this.currentWorld.entities,
        this.capture ? 1 : this.clock.alpha,
        this.currentWorld.seed,
      );
      view.updateFood(this.currentWorld.food);
      const time = this.renderTime();
      view.updateDecor(time);
      this.updateLight(view, time);
    }
    const rendered = view.renderFrame();

    if (rendered && !this.readySignaled) {
      this.readySignaled = true;
      // L'image vient d'être soumise : on attend l'image suivante pour être sûr qu'elle est
      // composée à l'écran avant de lever le signal du contrat de capture.
      this.document.defaultView?.requestAnimationFrame(() => {
        if (this.view) {
          markCaptureReady(this.document);
        }
      });
    }
    // En mode capture, l'image est figée : on ne rend de nouveau qu'au redimensionnement.
    // Tant qu'aucune image n'a pu être rendue (taille nulle), on réessaie à l'image suivante.
    if (!this.capture || !rendered) {
      this.scheduleFrame();
    }
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
      this.exposeCamera();
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
    const alpha = this.capture ? 1 : this.clock.alpha;
    return Math.max(0, world.time - (1 - alpha) * SIM_DT);
  }

  /**
   * Éclairage de l'heure courante, recalculé seulement si l'heure a bougé d'au moins
   * `LIGHT_HOUR_STEP` (ou après une bascule de l'horloge) ; l'heure exposée suit.
   */
  private updateLight(view: AquariumView, time: number): void {
    const hour = hourAt(this.dayClock, time);
    if (this.litHour === null || Math.abs(hour - this.litHour) >= LIGHT_HOUR_STEP) {
      this.litHour = hour;
      view.updateLight(lightAtInto(hour, this.light));
      view.updateFlowers(hour);
      this.dayPhase.set(dayPhaseAt(hour));
      this.clockHour.set(snapHour(hour));
    }
    // Une heure comme 23,999 s'arrondit à « 24.00 » : affichée « 0.00 ».
    const rounded = hour.toFixed(2);
    const exposed = rounded === '24.00' ? '0.00' : rounded;
    if (exposed !== this.exposedHour) {
      this.exposedHour = exposed;
      this.host.nativeElement.setAttribute(HOUR_ATTRIBUTE, exposed);
    }
  }

  /**
   * Avance la simulation du temps réel écoulé depuis l'image précédente (hors capture).
   * Renvoie ce temps, en secondes (0 à la première image).
   */
  private advanceRealTime(timestamp: number): number {
    // Première image : pas de durée de référence, aucun pas.
    const realDt = this.lastTimestamp === null ? 0 : (timestamp - this.lastTimestamp) / 1000;
    this.lastTimestamp = timestamp;
    // Vitesse (#52) : temps simulé = temps réel × vitesse, toujours par pas `SIM_DT`.
    const speed = this.speed();
    const clock = fixedStepInto(
      this.clock.accumulator,
      scaledDt(realDt, speed),
      this.clock,
      SIM_DT,
      maxStepsForSpeed(speed),
    );
    if (clock.steps > 0 && this.currentWorld) {
      // Rythme du jour (#209) : la simulation lit l'horloge de la journée.
      advanceInPlace(this.currentWorld, clock.steps, this.dayClock);
      this.exposeTick();
      this.exposeFood();
      // Au plus 4 relevés par seconde de temps réel, quelle que soit la vitesse (#256).
      if (
        this.currentWorld.tick - this.waterReadTick >= WATER_READOUT_TICKS &&
        refreshDue(timestamp, this.waterReadAt)
      ) {
        this.waterReadAt = timestamp;
        // Les autres bacs avancent par lots, au rythme des relevés (#316, ADR 0076).
        this.advanceBackgroundTanks();
        this.exposeWater();
      }
    }
    return realDt;
  }

  /**
   * Expose `world.tick` aux tests de bout en bout (`data-aqfish-tick`), y compris en build de
   * production. Seule écriture DOM de la boucle : une courte chaîne, et seulement quand le
   * compteur a changé.
   */
  private exposeTick(): void {
    const world = this.currentWorld;
    if (!world || world.tick === this.exposedTick) {
      return;
    }
    this.exposedTick = world.tick;
    this.host.nativeElement.setAttribute(TICK_ATTRIBUTE, String(world.tick));
  }

  /** Expose le nombre de granulés (`data-aqfish-food`), seulement quand il change. */
  private exposeFood(): void {
    const world = this.currentWorld;
    if (!world || world.food.length === this.exposedFood) {
      return;
    }
    this.exposedFood = world.food.length;
    this.host.nativeElement.setAttribute(FOOD_ATTRIBUTE, String(world.food.length));
  }

  /** Expose les effectifs (`data-aqfish-population`, signaux `population` et `populationMax`). */
  private exposePopulation(): void {
    const world = this.currentWorld;
    if (!world) {
      return;
    }
    const counts = populationCounts(world);
    this.population.set(counts);
    this.populationMax.set(populationLimits(world));
    this.health.set(healthSummary(world.entities));
    this.host.nativeElement.setAttribute(
      POPULATION_ATTRIBUTE,
      formatPopulation(counts, speciesShownIn(environmentById(world.environment).species, counts)),
    );
    const mode = careModeOf(world);
    this.careMode.set(mode);
    this.host.nativeElement.setAttribute(CARE_MODE_ATTRIBUTE, mode);
  }

  /**
   * Relevé de l'eau (#207) : signal `water` et `data-aqfish-water` mis à jour seulement s'il
   * change, trouble de l'eau de la vue suivant le niveau.
   */
  private exposeWater(): void {
    const world = this.currentWorld;
    if (!world) {
      return;
    }
    this.waterReadTick = world.tick;
    this.exposeTankList();
    this.waterSample.set(waterSample(world.water, world.environment, world.tick));
    this.health.set(healthSummary(world.entities));
    const readout = waterReadout(
      world.water,
      world.environment,
      world.entities.map((entity) => entity.species),
    );
    if (
      !sameReadout(readout, this.water()) ||
      !this.host.nativeElement.hasAttribute(WATER_ATTRIBUTE)
    ) {
      this.water.set(readout);
      this.host.nativeElement.setAttribute(
        WATER_ATTRIBUTE,
        [
          readout.quality,
          readout.temperature,
          readout.target,
          readout.ammonia,
          readout.nitrite,
          readout.nitrate,
        ].join(';'),
      );
      this.host.nativeElement.setAttribute(PH_ATTRIBUTE, `${readout.ph};${readout.phZone}`);
      this.host.nativeElement.setAttribute(CATAPPA_ATTRIBUTE, `${readout.catappa};${readout.tea}`);
    }
    this.view?.setWaterTurbidity(waterTurbidity(readout.quality));
    this.view?.setWaterTea(readout.tea);
    this.view?.setCatappa(world.water.catappa);
  }

  /** Applique la pluie à la vue courante et expose l'état obtenu (`data-aqfish-rain`). */
  private applyRain(enabled: boolean): void {
    const raining = this.view?.setRain(enabled) ?? false;
    this.rain.set(raining);
    this.host.nativeElement.setAttribute(RAIN_ATTRIBUTE, String(raining));
  }

  /** Expose l'environnement (`data-aqfish-environment` et signal `environment`). */
  private exposeEnvironment(): void {
    const world = this.currentWorld;
    if (world) {
      this.environment.set(world.environment);
      this.host.nativeElement.setAttribute(ENVIRONMENT_ATTRIBUTE, world.environment);
      const editable = isDecorEditable(world.environment);
      this.decorEditable.set(editable);
      this.exposeTankDimensions();
      if (!editable && this.decorEditing()) {
        this.applyDecorEditing(false);
      }
      this.exposeDecorCount();
    }
  }

  /** Expose les dimensions du bac (`data-aqfish-tank` et signal `tankDimensions`). */
  private exposeTankDimensions(): void {
    const world = this.currentWorld;
    if (!world) {
      return;
    }
    const dims = placeDimensions(world);
    this.tankDimensions.set(isTankResizable(world.environment) ? dims : null);
    this.pondShape.set(world.shape ?? DEFAULT_POND_SHAPE);
    this.host.nativeElement.setAttribute(SHAPE_ATTRIBUTE, world.shape ?? DEFAULT_POND_SHAPE);
    this.tankLiters.set(waterLiters(environmentWater(world)));
    this.host.nativeElement.setAttribute(
      TANK_ATTRIBUTE,
      `${dims.width}:${dims.height}:${dims.depth}`,
    );
  }

  /** Applique et expose le mode édition (`data-aqfish-editing`, signal `decorEditing`). */
  private applyDecorEditing(editing: boolean): void {
    this.decorEditing.set(editing);
    this.decorRefused.set(false);
    // Hors capture seulement : `edition=` montre la sélection sans gestes.
    this.view?.setDecorDragEnabled(editing && !this.capture);
    this.host.nativeElement.setAttribute(EDITING_ATTRIBUTE, String(editing));
  }

  /** Expose le nombre d'éléments du décor (`data-aqfish-decor-count`, signal `decorCount`). */
  private exposeDecorCount(): void {
    const count = this.currentWorld?.decor.length ?? 0;
    this.decorCount.set(count);
    this.host.nativeElement.setAttribute(DECOR_COUNT_ATTRIBUTE, String(count));
  }

  /** Expose la sélection (`data-aqfish-decor-selected`, signal `decorSelection`). */
  private exposeDecorSelection(index: number | null): void {
    this.decorSelection.set(index);
    this.host.nativeElement.setAttribute(
      DECOR_SELECTION_ATTRIBUTE,
      index === null ? 'aucun' : String(index),
    );
  }

  /** Expose la sélection de la pièce (`data-aqfish-room-selected`, signal `roomSelection`). */
  private exposeRoomSelection(index: number | null): void {
    this.roomSelection.set(index);
    this.host.nativeElement.setAttribute(
      ROOM_SELECTION_ATTRIBUTE,
      index === null ? 'aucun' : String(index),
    );
  }

  /** Expose l'état de la sauvegarde (`data-aqfish-save` et signal `saveStatus`). */
  private exposeSaveStatus(status: SaveStatus | null): void {
    this.saveStatus.set(status);
    if (status !== null) {
      this.host.nativeElement.setAttribute(SAVE_ATTRIBUTE, status);
    }
  }

  /** Expose l'état de l'horloge (`data-aqfish-hour-frozen` et signal `clockFrozen`). */
  private exposeClockFrozen(): void {
    this.clockFrozen.set(this.dayClock.frozen);
    this.host.nativeElement.setAttribute(HOUR_FROZEN_ATTRIBUTE, String(this.dayClock.frozen));
  }

  private exposeFilter(): void {
    this.host.nativeElement.setAttribute(FILTER_ATTRIBUTE, this.filter());
  }

  private exposeCamera(): void {
    if (!this.view) {
      return;
    }
    const format = (v: readonly number[]) => v.map((c) => c.toFixed(3)).join(',');
    this.host.nativeElement.setAttribute(CAMERA_ATTRIBUTE, format(this.view.cameraPosition()));
    this.host.nativeElement.setAttribute(CAMERA_TARGET_ATTRIBUTE, format(this.view.cameraTarget()));
  }

  private stop(): void {
    this.stopped = true;
    if (this.frameId !== null) {
      this.document.defaultView?.cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
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
