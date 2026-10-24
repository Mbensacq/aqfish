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
  type CapturePopulation,
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
  type DecorTool,
} from '../../sim/decor-edit';
import { SIM_DT } from '../../sim/constants';
import {
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
  isEnvironmentId,
  livesIn,
  type EnvironmentId,
} from '../../sim/environment';
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
import { parseWorld, serializeWorld, type SaveSettings } from '../../sim/save';
import {
  DEFAULT_FOOD_STYLE,
  isFoodStyle,
  toggleFoodStyle as otherFoodStyle,
  type FoodStyle,
} from '../../core/food-style/food-style';
import type { SpeciesId } from '../../sim/species';
import { validateDecorItem, type DecorItem } from '../../sim/decor';
import {
  advanceInPlace,
  advanceToWithFeedings,
  createDefaultWorld,
  feedInPlace,
  type MutableWorld,
  type World,
} from '../../sim/world';

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
/** Attribut du composant hôte exposant les effectifs (`neon:12,guppy:6,corydora:6`, #69). */
export const POPULATION_ATTRIBUTE = 'data-aqfish-population';

/** Attribut du composant hôte exposant l'environnement courant (`tropical`, `bassin`, #87). */
export const ENVIRONMENT_ATTRIBUTE = 'data-aqfish-environment';

/**
 * Attribut du composant hôte exposant l'état de la sauvegarde automatique (#70) : `active`,
 * `indisponible` ou `plein` ; absent en mode capture (aucune sauvegarde).
 */
export const SAVE_ATTRIBUTE = 'data-aqfish-save';

/** Attribut du composant hôte : `true` en mode édition du décor, `false` sinon (#167). */
export const EDITING_ATTRIBUTE = 'data-aqfish-editing';
/** Attribut du composant hôte exposant le nombre d'éléments de `World.decor` (#167). */
export const DECOR_COUNT_ATTRIBUTE = 'data-aqfish-decor-count';
/**
 * Attribut du composant hôte exposant l'indice de l'élément de décor sélectionné, `aucun`
 * sans sélection (#167).
 */
export const DECOR_SELECTION_ATTRIBUTE = 'data-aqfish-decor-selected';

/** Intervalle de la sauvegarde automatique, en millisecondes (#70). */
export const AUTOSAVE_INTERVAL_MS = 10_000;

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
 * Applique les effectifs de `population=` au monde, dans l'ordre de l'URL (bornes de
 * `sim/population.ts`). Une espèce inconnue, ou qui ne vit pas dans l'environnement du monde
 * (`Environment.species`, #88), est ignorée.
 */
export function applyPopulation(
  world: MutableWorld,
  population: readonly CapturePopulation[],
): void {
  for (const { species, count } of population) {
    if (isSpeciesId(species) && livesIn(world.environment, species)) {
      setPopulationInPlace(world, species, count);
    }
  }
}

/**
 * Ajoute au décor du monde les bois flottés de `bois=` (#169), dans l'ordre de l'URL. Un bois
 * invalide (hors du bac de l'environnement, échelle hors bornes, graine invalide) est ignoré,
 * de même que ceux qui dépassent `MAX_DECOR_ITEMS`. Sans bois valide, le monde est inchangé.
 */
export function applyCaptureWoods(world: MutableWorld, woods: readonly CaptureWood[]): void {
  const dims = environmentById(world.environment).dimensions;
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

  private view: AquariumView | null = null;
  private frameId: number | null = null;
  private readySignaled = false;
  private capture = false;
  private currentWorld: MutableWorld | null = null;
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

  /** Environnement affiché (#87), changé par le sélecteur du panneau. */
  readonly environment = signal<EnvironmentId>(DEFAULT_ENVIRONMENT_ID);

  /** Effectif de chaque espèce (#69), mis à jour au démarrage et à chaque réglage. */
  readonly population = signal<PopulationCounts>(NO_FISH);

  /** Effectif maximal de chaque espèce compte tenu des autres (`populationLimits`, #69). */
  readonly populationMax = signal<PopulationCounts>(NO_FISH);

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
  readonly decorTool = signal<DecorTool>('rock');

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

  /**
   * Glissement en cours (#168) : décor du monde au début du geste (abandon s'il a changé
   * entre-temps) et dernier aperçu (décor déplacé, borné au bac).
   */
  private decorDrag: {
    readonly base: readonly DecorItem[];
    readonly index: number;
    preview: DecorItem[] | null;
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
   * avant le démarrage, pour une espèce inconnue ou absente de l'environnement (#88), ou un
   * effectif qui n'est pas un entier positif ou nul.
   */
  setPopulation(species: SpeciesId, count: number): void {
    const world = this.currentWorld;
    if (
      !world ||
      this.capture ||
      !isSpeciesId(species) ||
      !livesIn(world.environment, species) ||
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
   * Change d'environnement (#87, ADR 0026) : recrée le monde de départ de l'environnement
   * avec la même graine (même environnement et même graine, même monde), puis la vue, la
   * caméra allant sur la vue par défaut de l'environnement. L'heure, la vitesse, le filtre et
   * l'affichage du décor sont conservés ; la nourriture et les effectifs réglés repartent de
   * zéro. Sans effet en mode capture (`environnement=`), avant le démarrage, pour un
   * environnement inconnu ou déjà affiché.
   */
  setEnvironment(id: string): void {
    const world = this.currentWorld;
    if (!world || !this.view || this.capture || !isEnvironmentId(id) || id === world.environment) {
      return;
    }
    this.currentWorld = createDefaultWorld(world.seed, id);
    this.clock.accumulator = 0;
    this.clock.alpha = 0;
    this.exposeEnvironment();
    this.exposeTick();
    this.exposeFood();
    this.exposePopulation();
    this.createView(environmentById(id).defaultCamera);
    this.exposeCamera();
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
    }
    this.applyDecorEditing(editing);
  }

  /** Choisit l'outil de l'éditeur de décor (#167) ; un outil inconnu est ignoré. */
  setDecorTool(tool: string): void {
    if (isDecorTool(tool)) {
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
    view.setDecorSelection(index);
    this.exposeDecorSelection(index);
    this.scheduleFrame();
  }

  /**
   * Supprime l'élément de décor sélectionné (touche Suppr, bouton « Supprimer », #167) ;
   * renvoie `true` s'il a été supprimé. Sans effet sans sélection.
   */
  deleteSelectedDecor(): boolean {
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
    if (tool === 'select') {
      this.selectDecor(null);
      return;
    }
    const decor = addDecorItem(world.decor, tool, pick.x, pick.z, world.seed, world.environment);
    if (decor) {
      this.applyDecor(decor, decor.length - 1);
    } else {
      this.selectDecor(null);
    }
  }

  /**
   * Tourne l'élément sélectionné de `steps` pas de 15° (flèches, boutons, #168) ; renvoie
   * `true` si la pose a changé. Refusée (`decorRefused`) si elle pénètre un autre élément.
   */
  rotateSelectedDecor(steps: number): boolean {
    return this.editSelected((decor, index, env) => rotateDecorItem(decor, index, steps, env));
  }

  /**
   * Agrandit (`steps` > 0) ou réduit l'élément sélectionné (touches + et −, boutons, #168) ;
   * renvoie `true` si la pose a changé. Sans effet à la borne d'échelle ; refusée
   * (`decorRefused`) si elle pénètre un autre élément.
   */
  scaleSelectedDecor(steps: number): boolean {
    return this.editSelected((decor, index, env) => scaleDecorItem(decor, index, steps, env));
  }

  /** Applique `edit` à l'élément sélectionné ; `null` d'`edit` : pose refusée ou inchangée. */
  private editSelected(
    edit: (decor: readonly DecorItem[], index: number, env: EnvironmentId) => DecorItem[] | null,
  ): boolean {
    const world = this.currentWorld;
    const index = this.decorSelection();
    if (!world || index === null || !this.decorEditing() || this.decorDrag) {
      return false;
    }
    const decor = edit(world.decor, index, world.environment);
    if (!decor) {
      // Inchangée à la borne d'échelle ; sinon, la pose pénétrait un voisin.
      this.decorRefused.set(this.wouldOverlap(edit, world.decor, index, world.environment));
      return false;
    }
    this.applyDecor(decor, index);
    return true;
  }

  /** Vrai si `edit` a échoué pour cause de chevauchement (et non de borne). */
  private wouldOverlap(
    edit: (decor: readonly DecorItem[], index: number, env: EnvironmentId) => DecorItem[] | null,
    decor: readonly DecorItem[],
    index: number,
    env: EnvironmentId,
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
    const preview = moveDecorItem(world.decor, index, x, z, world.environment);
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
    const allowed = isDecorPoseAllowed(world.decor, drag.preview, index);
    if (commit && this.decorEditing() && allowed) {
      this.applyDecor(drag.preview, index);
      return;
    }
    const last = world.decor[index];
    this.view?.previewDecorMove(index, last.x, last.z);
    this.decorRefused.set(commit && !allowed);
    this.scheduleFrame();
  }

  /**
   * Installe un décor édité (#167) : obstacles du monde recalculés, vue mise à jour,
   * sélection `selection`, puis sauvegarde immédiate (le rechargement le restitue).
   */
  private applyDecor(decor: readonly DecorItem[], selection: number | null): void {
    const world = this.currentWorld;
    const view = this.view;
    if (!world || !view) {
      return;
    }
    setDecorInPlace(world, decor);
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
    return { speed: this.speed(), clock: this.dayClock, foodStyle: this.foodStyle() };
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
      status = writeStoredSave(this.saveStorage, serializeWorld(world, this.settings()));
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
      const text = serializeWorld(world, this.settings());
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
    const result = parseWorld(text);
    if (!result.ok) {
      this.saveMessage.set({ kind: 'erreur', text: `Import refusé : ${result.error}.` });
      return false;
    }
    this.loadWorld(result.world as MutableWorld, result.settings);
    this.createView(environmentById(result.world.environment).defaultCamera);
    this.exposeCamera();
    this.scheduleFrame();
    this.saveMessage.set({ kind: 'info', text: 'Aquarium importé.' });
    this.saveNow();
    return true;
  }

  /** Message d'erreur d'un fichier trop gros pour être lu (contrôle du panneau, #70). */
  rejectImport(text: string): void {
    this.saveMessage.set({ kind: 'erreur', text: `Import refusé : ${text}.` });
  }

  /** Installe un monde et ses réglages (démarrage restauré, import) ; la vue suit à part. */
  private loadWorld(world: MutableWorld, settings: SaveSettings): void {
    this.currentWorld = world;
    this.clock.accumulator = 0;
    this.clock.alpha = 0;
    this.speed.set(settings.speed);
    this.host.nativeElement.setAttribute(SPEED_ATTRIBUTE, String(settings.speed));
    this.dayClock = settings.clock;
    this.foodStyle.set(settings.foodStyle ?? DEFAULT_FOOD_STYLE);
    this.litHour = null;
    this.exposeClockFrozen();
    this.exposeEnvironment();
    this.exposeTick();
    this.exposeFood();
    this.exposePopulation();
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
    // En mode capture, le temps demandé est atteint ici, avant toute image (contrat de capture).
    // Le monde créé ici appartient à l'hôte seul : il pourra être avancé en place.
    // Dépôts de nourriture de `nourrir=` (#67) : au temps simulé de chacun, en capture.
    this.dayClock = initialDayClock(params.hour, params.capture);
    // Sauvegarde automatique (#70) : jamais en capture (images reproductibles) ; restaurée
    // au démarrage sauf si l'URL décrit le monde (`seed`, `environnement`, `population`).
    // Lue avant toute création : le monde neuf n'est créé que s'il n'y a rien à restaurer.
    const restored = params.capture || hasWorldParams(win.location.search) ? null : this.readSave();
    if (restored) {
      this.currentWorld = restored.world as MutableWorld;
      this.speed.set(restored.settings.speed);
      this.foodStyle.set(restored.settings.foodStyle ?? DEFAULT_FOOD_STYLE);
      // `heure=` fige l'heure : l'horloge sauvegardée ne s'applique pas.
      if (params.hour === null) {
        this.dayClock = restored.settings.clock;
      }
    } else {
      if (params.capture && params.foodStyle !== null) {
        this.foodStyle.set(params.foodStyle);
      }
      const environment = isEnvironmentId(params.environment)
        ? params.environment
        : DEFAULT_ENVIRONMENT_ID;
      const world: MutableWorld = createDefaultWorld(params.seed, environment);
      // Bois flottés de `bois=` (#169), en capture : ajoutés au décor avant la population.
      if (params.capture) {
        applyCaptureWoods(world, params.woods);
      }
      // Effectifs de `population=` (#69) : appliqués à t = 0, avant d'avancer le monde.
      applyPopulation(world, params.population);
      this.currentWorld = params.capture
        ? advanceToWithFeedings(world, params.time, params.feedings)
        : world;
    }
    if (!params.capture) {
      this.saveStatus.set('active');
      this.startAutosave(win);
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
    this.exposeSaveStatus(this.saveStatus());

    const filter = initialRenderFilter(
      params.filter,
      params.capture ? null : readStoredRenderFilter(browserStorage(win)),
      params.capture,
    );
    this.filter.set(filter);
    this.pixelRatio = params.capture ? 1 : win.devicePixelRatio || 1;
    // Sans `camera=`, la vue par défaut de l'environnement (#87 : de dessus pour le bassin).
    this.createView(
      params.cameraGiven
        ? params.camera
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
  private readSave(): { readonly world: World; readonly settings: SaveSettings } | null {
    const text = readStoredSave(this.saveStorage);
    if (text === null) {
      return null;
    }
    const result = parseWorld(text);
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
      interactive: !this.capture,
      filter: this.filter(),
      environment: environmentById(world.environment),
    });
    this.view = view;
    view.setDecor(world.decor, world.seed);
    view.setDecorVisible(this.decorVisible());
    this.applyFoodStyle(this.foodStyle());
    // Hors du bassin, la vue refuse la pluie : l'état affiché suit (#106).
    this.applyRain(this.rain());
    this.litHour = null;
    this.activePreset.set(preset);
    this.viewCleanups.push(view.onCameraChange(() => this.exposeCamera()));
    this.viewCleanups.push(view.onUserInteraction(() => this.activePreset.set(null)));
    view.setDecorDragEnabled(this.decorEditing());
    this.decorDrag = null;
    this.viewCleanups.push(
      view.onDecorDrag({
        start: (index) => this.startDecorDrag(index),
        move: (index, x, z) => this.moveDecorDrag(index, x, z),
        end: (index, commit) => this.endDecorDrag(index, commit),
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
  }

  private scheduleFrame(): void {
    const win = this.document.defaultView;
    if (!win || !this.view || this.frameId !== null) {
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
    if (!this.capture) {
      const realDt = this.advanceRealTime(timestamp);
      if (view.stepCameraTransition(realDt)) {
        this.exposeCamera();
      }
    }
    const canvas = this.canvasRef().nativeElement;
    if (view.resize(canvas.clientWidth, canvas.clientHeight)) {
      this.exposeCamera();
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
      advanceInPlace(this.currentWorld, clock.steps);
      this.exposeTick();
      this.exposeFood();
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
    this.host.nativeElement.setAttribute(
      POPULATION_ATTRIBUTE,
      formatPopulation(counts, environmentById(world.environment).species),
    );
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
      if (!editable && this.decorEditing()) {
        this.applyDecorEditing(false);
      }
      this.exposeDecorCount();
    }
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
    if (this.frameId !== null) {
      this.document.defaultView?.cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
    this.cleanups.splice(0).forEach((cleanup) => cleanup());
    this.viewCleanups.splice(0).forEach((cleanup) => cleanup());
    this.view?.dispose();
    this.view = null;
    this.currentWorld = null;
    if (this.readySignaled) {
      resetCaptureReady(this.document);
    }
  }
}
