import { SIM_DT } from './constants';
import { isCareMode, type CareMode } from './care-mode';
import { isCurrentLevel, type CurrentLevel } from './water-current';
import { parseDecorItems, type DecorItem } from './decor';
import { DISEASES } from './diseases';
import {
  ENVIRONMENT_IDS,
  isEnvironmentId,
  isPondShapeable,
  isTankResizable,
  placeDimensions,
  placeEnvironment,
  type EnvironmentId,
  type Place,
} from './environment';
import type { Egg } from './eggs';
import { copyFirstTankPath, readFirstTankPath, type FirstTankPathState } from './first-tank-path';
import { copyMaintenance, readMaintenance, type MaintenanceState } from './maintenance';
import { copyFeeder, hasFeeder, readFeeder, type FeederState } from './auto-feeder';
import type { DeadAnimal } from './mortality';
import { copySavedWaterHistory, readWaterHistory, type SavedWaterHistory } from './water-history';
import { copySavedJournal, readJournal, type SavedJournal } from './journal';
import type { FoodPellet } from './food';
import { DEFAULT_POND_SHAPE, isPondShape, type PondShape } from './pond-shape';
import type { Fish } from './swimmer';
import { copyWater, readWater, type WaterState } from './water';
import { clampTankDimensions, type TankDimensions } from './tank';
import {
  describe,
  field,
  finiteNumber,
  firstProblemOf,
  integerIn,
  isRecord,
  optional,
  own,
  problemsOf,
  readList,
  uint32,
  type FieldRule,
  type ListRule,
} from './save-schema';
import {
  FISH_NUMBER_KEYS,
  parseDeadList,
  parseEggList,
  parseFishList,
  parseFoodList,
  type AnimalContext,
} from './save-animals';
import {
  DEFAULT_SAVE_SETTINGS,
  parseSettings,
  settingsData,
  type SaveSettings,
} from './save-settings';
import { createWorld, seededObstacleCount } from './world';
import type { Entity, MutableWorld, World } from './world-types';

/**
 * Sauvegarde du monde (issue #70, ADR 0028) : format JSON versionné, écrit et relu par des
 * fonctions pures (`serializeWorld`, `parseWorld`).
 *
 * Ce qui est enregistré : graine, environnement, dimensions réglées du bac (issue #171,
 * facultatives : absentes, ce sont celles de l'environnement), compteur de pas (le temps
 * simulé en dérive, `tick · SIM_DT`), décor, poissons (état complet, sous-générateur
 * compris), granulés, compteurs d'identifiants, état de l'eau (issue #206, facultatif :
 * absent, eau saine), et les réglages de vitesse, d'heure et de rendu des granulés.
 * Les mondes des autres environnements visités (issue #277, ADR 0063) sont écrits à côté,
 * dans `others` (facultatif : absent, aucun), avec le même corps que le monde affiché. Les
 * obstacles ne sont pas enregistrés : ils sont recalculés à partir du décor (`createWorld`),
 * comme à la création.
 * Les robes des koïs dérivent de la graine et de l'identifiant (ADR 0027) : rien à stocker.
 *
 * Validation à la lecture : tout est vérifié (types, bornes, nombres finis, effectifs,
 * identifiants croissants) ; les champs inconnus sont ignorés et seules les propriétés
 * propres sont lues (`__proto__`, `constructor`… n'ont aucun effet) ; un schéma inconnu est
 * refusé. Une entrée invalide ne lève jamais : `parseWorld` renvoie un message d'erreur.
 */

/** Marqueur du format, pour reconnaître un fichier aqfish. */
export const SAVE_FORMAT = 'aqfish';

/**
 * Version du schéma de la sauvegarde de l'application : la pièce de N bacs (ADR 0061, 0069),
 * écrite par `serializeRoom` (`sim/room-save.ts`).
 */
export const SAVE_SCHEMA = 2;

/**
 * Schéma 1 : un monde affiché et les mondes rangés des autres environnements. Écrit par
 * `serializeWorld` (tests, fichiers de compatibilité), relu par `parseWorld` et migré vers
 * le schéma 2 par `sim/room-save.ts`.
 */
export const SAVE_SCHEMA_1 = 1;

/**
 * Taille maximale d'une sauvegarde, en caractères (256 Kio). Une sauvegarde pleine (60
 * poissons, 60 granulés, décor par défaut) pèse environ 40 Kio ; avec les mondes des quatre
 * environnements (issue #277), elle reste sous la limite (test `others`, `save.spec.ts`).
 */
export const MAX_SAVE_LENGTH = 256 * 1024;

/** Nombre maximal d'éléments de décor dans une sauvegarde. */
export const MAX_SAVE_DECOR = 64;

/**
 * Compteur de pas maximal accepté : 2³¹ pas, soit plus d'un an de temps simulé. Au-delà, le
 * temps `tick · SIM_DT` perdrait en précision.
 */
export const MAX_SAVE_TICK = 2 ** 31;

export {
  DEFAULT_SAVE_SETTINGS,
  MAX_DAY_LENGTH_SECONDS,
  MIN_DAY_LENGTH_SECONDS,
  parseSettings,
  settingsData,
  type SaveSettings,
} from './save-settings';

/** Poisson enregistré : tous les champs de `Fish` sauf `kind` (toujours `fish`). */
export type SavedFish = Omit<Fish, 'kind'>;

/**
 * Corps d'un monde enregistré (graine, environnement, dimensions, temps, compteurs, décor,
 * poissons, granulés, eau) : celui du monde affiché et celui de chaque autre environnement
 * visité (`SaveData.others`, issue #277).
 */
export interface SavedWorld {
  readonly seed: number;
  readonly environment: EnvironmentId;
  /**
   * Dimensions réglées du bac (issue #171, ADR 0047). Facultatives : absentes (anciennes
   * sauvegardes, bac jamais redimensionné), ce sont celles de l'environnement.
   */
  readonly dimensions?: TankDimensions;
  /**
   * Forme du bassin (issue #190, ADR 0080). Facultative : absente (anciennes sauvegardes,
   * bassin rectangulaire), rectangle ; jamais écrite pour le rectangle.
   */
  readonly shape?: PondShape;
  readonly tick: number;
  readonly nextFishId: number;
  readonly nextFoodId: number;
  readonly decor: readonly DecorItem[];
  readonly fish: readonly SavedFish[];
  readonly food: readonly FoodPellet[];
  /**
   * État de l'eau (issue #206, ADR 0052). Facultatif : absent (anciennes sauvegardes), c'est
   * une eau saine (`freshWater`) ; toujours présent dans une sauvegarde écrite.
   */
  readonly water?: WaterState;
  /**
   * Mode du bac (#278, ADR 0077). Facultatif : absent (anciennes sauvegardes, bac jamais
   * passé par le mode décor), mode soins. Présent, le bac admet toute espèce.
   */
  readonly careMode?: CareMode;
  /**
   * Force du courant (issue #460, ADR 0108). Facultative : absente (anciennes sauvegardes,
   * courant coupé), celle de l'environnement ; jamais écrite coupée.
   */
  readonly current?: Exclude<CurrentLevel, 'coupe'>;
  /**
   * Œufs collés (issue #478, ADR 0111). Facultatifs : absents (anciennes sauvegardes, bac
   * sans œuf), aucun ; jamais écrits vides.
   */
  readonly eggs?: readonly Egg[];
  /** Calendrier d'entretien (#513) : absent des sauvegardes antérieures, suivi repris au chargement. */
  readonly maintenance?: MaintenanceState;
  /** Historique de l'eau (#511) : absent des sauvegardes antérieures, repris à vide. */
  readonly waterHistory?: SavedWaterHistory;
  /** Journal du bac (#581) : absent des sauvegardes antérieures, repris vide. */
  readonly journal?: SavedJournal;
  /** Parcours « Mon premier aquarium » (#512) : absent des sauvegardes antérieures, repris à zéro. */
  readonly firstTankPath?: FirstTankPathState;
  /** Distributeur automatique (#583) : absent des sauvegardes antérieures et sans distributeur. */
  readonly feeder?: FeederState;
  /** Mortalité activée (#582) : absente des sauvegardes antérieures, jamais écrite à faux. */
  readonly mortality?: true;
  /** Corps des animaux morts (#582) : absents des sauvegardes antérieures, jamais écrits vides. */
  readonly dead?: readonly (SavedFish & { readonly deadFor: number })[];
}

/** Contenu d'une sauvegarde (schéma 1). */
export interface SaveData extends SavedWorld {
  readonly format: typeof SAVE_FORMAT;
  readonly schema: typeof SAVE_SCHEMA_1;
  readonly settings: SaveSettings;
  /**
   * Mondes des autres environnements visités, figés (issue #277, ADR 0063), dans l'ordre de
   * `ENVIRONMENT_IDS`, chacun d'un environnement différent de celui du monde affiché.
   * Facultatif : absent (anciennes sauvegardes, aucun autre environnement visité), aucun ;
   * jamais écrit vide. Une version antérieure de l'application l'ignore (champ inconnu).
   */
  readonly others?: readonly SavedWorld[];
}

/** Résultat de `parseWorld` : le monde restauré, ou la raison du refus. */
export type ParseWorldResult =
  | {
      readonly ok: true;
      readonly world: World;
      readonly settings: SaveSettings;
      /** Mondes des autres environnements visités (vide si aucun), dans l'ordre écrit. */
      readonly others: readonly World[];
    }
  | { readonly ok: false; readonly error: string };

/**
 * Contenu de la sauvegarde de `world`, de `settings` et des mondes `others` des autres
 * environnements visités (objet de données, copié : rien n'est partagé avec les mondes).
 * `others` est écrit dans l'ordre de `ENVIRONMENT_IDS`, et omis s'il est vide.
 * @throws RangeError si un monde a des obstacles explicites (hors décor et coraux), non
 * enregistrables dans le schéma 1, si un réglage est invalide, ou si deux mondes ont le même
 * environnement.
 */
export function saveData(
  world: World,
  settings: SaveSettings = DEFAULT_SAVE_SETTINGS,
  others: readonly World[] = [],
): SaveData {
  const settingsCopy = settingsData(settings);
  const seen = new Set<EnvironmentId>([world.environment]);
  for (const other of others) {
    if (seen.has(other.environment)) {
      throw new RangeError(`sauvegarde : environnement en double (${other.environment})`);
    }
    seen.add(other.environment);
  }
  const ordered = ENVIRONMENT_IDS.flatMap((id) =>
    others.filter((other) => other.environment === id),
  );
  return {
    format: SAVE_FORMAT,
    schema: SAVE_SCHEMA_1,
    ...savedWorld(world),
    settings: settingsCopy,
    ...(ordered.length === 0 ? {} : { others: ordered.map(savedWorld) }),
  };
}

/**
 * Corps enregistré d'un monde (copié), commun aux schémas 1 et 2.
 * @throws RangeError si le monde a des obstacles explicites (hors décor et coraux).
 */
export function savedWorld(world: World): SavedWorld {
  // Obstacles recalculables : ceux du décor, puis ceux des coraux et des anémones tirés de la
  // graine (comptés sans reconstruire leurs modèles voxels : cache de `worldFeatures`).
  if (world.obstacles.length !== world.decor.length + seededObstacleCount(world)) {
    throw new RangeError(
      'sauvegarde : seuls les obstacles issus du décor sont enregistrables (schéma 1)',
    );
  }
  return {
    seed: world.seed,
    environment: world.environment,
    ...(world.dimensions === undefined ? {} : { dimensions: { ...world.dimensions } }),
    ...(world.shape === undefined ? {} : { shape: world.shape }),
    tick: world.tick,
    nextFishId: world.nextFishId,
    nextFoodId: world.nextFoodId,
    decor: world.decor.map((item) => ({ ...item })),
    fish: world.entities.map(savedFish),
    food: world.food.map((pellet) => ({ ...pellet })),
    water: copyWater(world.water),
    ...savedOptionalParts(world),
  };
}

/** Champs facultatifs du corps enregistré, dans l'ordre d'écriture (omis s'ils sont vides). */
function savedOptionalParts(world: World): Partial<SavedWorld> {
  return {
    ...(world.careMode === undefined ? {} : { careMode: world.careMode }),
    ...(world.current === undefined ? {} : { current: world.current }),
    ...(world.eggs === undefined || world.eggs.length === 0
      ? {}
      : { eggs: world.eggs.map((egg) => ({ ...egg })) }),
    ...(world.maintenance === undefined ? {} : { maintenance: copyMaintenance(world.maintenance) }),
    ...(world.waterHistory === undefined
      ? {}
      : { waterHistory: copySavedWaterHistory(world.waterHistory) }),
    ...(world.journal === undefined ? {} : { journal: copySavedJournal(world.journal) }),
    ...(world.firstTankPath === undefined
      ? {}
      : { firstTankPath: copyFirstTankPath(world.firstTankPath) }),
    ...(world.feeder === undefined ? {} : { feeder: copyFeeder(world.feeder) }),
    ...(world.mortality === true ? { mortality: true } : {}),
    ...(world.dead === undefined || world.dead.length === 0
      ? {}
      : {
          dead: world.dead.map((body) => ({ ...savedFish(body), deadFor: body.deadFor })),
        }),
  };
}

/** Poisson enregistré (schéma 1) : champs numériques, santé, maladies et âge d'alevin. */
function savedFish(fish: Fish): SavedFish {
  const saved: Record<string, number | string> = { id: fish.id, species: fish.species };
  for (const key of FISH_NUMBER_KEYS) {
    saved[key] = fish[key];
  }
  saved['health'] = fish.health;
  for (const { field } of DISEASES) {
    // Maladies (table `DISEASES`, issue #562) : écrites seulement pour un animal malade.
    const progress = fish[field];
    if (progress !== undefined) {
      saved[field] = progress;
    }
  }
  if (fish.growth !== undefined) {
    // Alevin (issue #459) : âge écrit seulement pour un alevin.
    saved['growth'] = fish.growth;
  }
  return saved as unknown as SavedFish;
}

/**
 * Sauvegarde de `world`, de `settings` et des mondes `others`, en texte JSON (`saveData`).
 * @throws RangeError comme `saveData`, ou si le texte dépasse `MAX_SAVE_LENGTH` (il serait
 * refusé à la relecture : mieux vaut garder la sauvegarde précédente).
 */
export function serializeWorld(
  world: World,
  settings: SaveSettings = DEFAULT_SAVE_SETTINGS,
  others: readonly World[] = [],
): string {
  const text = JSON.stringify(saveData(world, settings, others));
  if (text.length > MAX_SAVE_LENGTH) {
    throw new RangeError(
      `sauvegarde trop volumineuse (${Math.ceil(text.length / 1024)} Kio, ${MAX_SAVE_LENGTH / 1024} Kio au plus)`,
    );
  }
  return text;
}

/**
 * Relit une sauvegarde (texte JSON) : renvoie le monde et les réglages, ou un message
 * d'erreur en français. Ne lève jamais. Le monde renvoyé est neuf (obstacles recalculés à
 * partir du décor) et peut être avancé comme un monde jamais sauvegardé : même état, au bit
 * près.
 */
export function parseWorld(text: string): ParseWorldResult {
  if (typeof text !== 'string') {
    return failure('la sauvegarde doit être un texte');
  }
  if (text.length > MAX_SAVE_LENGTH) {
    return failure(
      `fichier trop volumineux (${Math.ceil(text.length / 1024)} Kio, ${MAX_SAVE_LENGTH / 1024} Kio au plus)`,
    );
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return failure('ce n’est pas un fichier JSON valide');
  }
  try {
    return parseSaveData(value);
  } catch (error) {
    // Filet de sécurité : une incohérence non prévue par la validation reste un refus.
    return failure(error instanceof Error ? error.message : 'sauvegarde illisible');
  }
}

/** Comme `parseWorld`, sur des données JSON déjà décodées. Ne lève jamais. */
export function parseSaveData(value: unknown): ParseWorldResult {
  if (!isRecord(value)) {
    return failure('la sauvegarde doit être un objet JSON');
  }
  if (own(value, 'format') !== SAVE_FORMAT) {
    return failure('ce fichier n’est pas une sauvegarde aqfish');
  }
  const schema = own(value, 'schema');
  if (schema !== SAVE_SCHEMA_1) {
    return failure(
      `version de sauvegarde inconnue (${describe(schema)}, version ${SAVE_SCHEMA_1} attendue)`,
    );
  }
  const environment = own(value, 'environment');
  if (!isEnvironmentId(environment)) {
    return failure(`environnement inconnu (${describe(environment)})`);
  }
  const problems: string[] = [];
  // Réglages lus entre les compteurs et le décor : ordre historique des messages.
  const read: { settings: SaveSettings | null } = { settings: null };
  const world = parseWorldBody(value, problems, () => {
    read.settings = parseSettings(own(value, 'settings'), problems);
  });
  const others = parseOthers(own(value, 'others'), environment, problems);
  const settings = read.settings;
  if (problems.length > 0 || settings === null || world === null) {
    return failure(problems.slice(0, 5).join(' ; ') + (problems.length > 5 ? ' ; …' : ''));
  }
  return { ok: true, world, settings, others };
}

/**
 * Mondes des autres environnements (`others`, issue #277) : absents, aucun ; sinon une liste
 * d'au plus `ENVIRONMENT_IDS.length − 1` corps valides, d'environnements tous différents et
 * différents de `shown`. Les problèmes sont préfixés de l'environnement concerné.
 */
function parseOthers(value: unknown, shown: EnvironmentId, problems: string[]): World[] {
  if (value === undefined) {
    return [];
  }
  const items = readList(value, OTHERS_LIST, problems) ?? [];
  const seen = new Set<EnvironmentId>([shown]);
  const worlds: World[] = [];
  items.forEach((item: unknown, i) => {
    if (!isRecord(item)) {
      problems.push(`autre environnement ${i} : doit être un objet`);
      return;
    }
    const environment = own(item, 'environment');
    const label = `autre environnement ${isEnvironmentId(environment) ? environment : i}`;
    if (isEnvironmentId(environment) && seen.has(environment)) {
      problems.push(`${label} : en double`);
      return;
    }
    const found: string[] = [];
    const world = parseWorldBody(item, found);
    problems.push(...found.map((problem) => `${label} : ${problem}`));
    if (world !== null && found.length === 0) {
      seen.add(world.environment);
      worlds.push(world);
    }
  });
  return worlds;
}

const OTHERS_LIST: ListRule = {
  key: 'others',
  max: ENVIRONMENT_IDS.length - 1,
  countMessage: (count) =>
    `trop d’autres environnements (${count}, ${ENVIRONMENT_IDS.length - 1} au plus)`,
};

/** Graine d'un monde ou d'une pièce (schémas 1 et 2). */
export const SEED_RULE = field('seed', uint32, 'seed doit être un entier 32 bits non signé');

/** Compteur de pas d'un monde ou d'une pièce (schémas 1 et 2). */
export const TICK_RULE = field(
  'tick',
  integerIn(0, MAX_SAVE_TICK),
  `tick doit être un entier dans [0, ${MAX_SAVE_TICK}]`,
);

/** Compteurs du corps d'un monde, lus après le lieu. */
const COUNTER_RULES: readonly FieldRule[] = [
  TICK_RULE,
  field('nextFishId', uint32, 'nextFishId doit être un entier 32 bits non signé'),
  field(
    'nextFoodId',
    integerIn(0, Number.MAX_SAFE_INTEGER),
    'nextFoodId doit être un entier positif ou nul',
  ),
];

/** Courant enregistrable : connu, jamais « coupe » (#460). */
function isSavedCurrent(value: unknown): value is Exclude<CurrentLevel, 'coupe'> {
  return isCurrentLevel(value) && value !== 'coupe';
}

/** Mode du bac (#278) et courant (#460) : absents, mode soins et courant du lieu. */
const MODE_RULES: readonly FieldRule[] = [
  field('careMode', optional(isCareMode), (v) => `mode de bac inconnu (${describe(v)})`),
  field('current', optional(isSavedCurrent), (v) => `force de courant inconnue (${describe(v)})`),
];

/** Mortalité (#582) : option absente, aucun décès ; jamais écrite à faux. */
const MORTALITY_RULE = field(
  'mortality',
  optional((v) => v === true),
  (v) => `mortality doit valoir true (reçu : ${describe(v)})`,
);

const DECOR_LIST: ListRule = {
  key: 'decor',
  max: MAX_SAVE_DECOR,
  countMessage: (count) => `trop d’éléments de décor (${count}, ${MAX_SAVE_DECOR} au plus)`,
};

/** États facultatifs d'un monde, relus par leur module, dans l'ordre des messages. */
const STATE_READERS = [
  ['maintenance', readMaintenance],
  ['waterHistory', readWaterHistory],
  ['journal', readJournal],
  ['firstTankPath', readFirstTankPath],
  ['feeder', readFeeder],
] as const;

/** États facultatifs relus d'un monde. */
type WorldStates = Partial<Pick<MutableWorld, (typeof STATE_READERS)[number][0]>>;

/** Parties relues d'un corps de monde, avant assemblage. */
interface WorldParts extends WorldStates {
  readonly decor: DecorItem[];
  readonly fish: Entity[];
  readonly food: FoodPellet[];
  readonly careMode?: CareMode;
  readonly current?: Exclude<CurrentLevel, 'coupe'>;
  readonly eggs?: Egg[];
  readonly mortality?: true;
  readonly dead?: DeadAnimal[];
  readonly water?: WaterState;
}

/**
 * Ordre d'écriture des champs facultatifs dans le monde relu : il fixe l'ordre des clés du
 * monde, différent de l'ordre des contrôles.
 */
const WORLD_PART_ORDER = [
  'water',
  'careMode',
  'current',
  'maintenance',
  'waterHistory',
  'journal',
  'feeder',
  'firstTankPath',
  'eggs',
  'mortality',
  'dead',
] as const;

/**
 * Relit le corps d'un monde (`SavedWorld`) : le monde neuf (obstacles recalculés), ou `null`
 * si un problème a été ajouté à `problems`. `afterCounters` est appelé après la lecture des
 * compteurs, avant le décor (ordre historique des messages du monde affiché).
 */
export function parseWorldBody(
  value: Record<string, unknown>,
  problems: string[],
  afterCounters?: () => void,
): MutableWorld | null {
  const before = problems.length;
  problems.push(...problemsOf(value, [SEED_RULE]));
  const environment = own(value, 'environment');
  if (!isEnvironmentId(environment)) {
    problems.push(`environnement inconnu (${describe(environment)})`);
    return null;
  }
  const place = parsePlace(value, environment, problems);
  problems.push(...problemsOf(value, COUNTER_RULES));
  afterCounters?.();
  const parts = parseWorldParts(value, place, problems);
  if (problems.length > before) {
    return null;
  }
  const world: MutableWorld = createWorld(own(value, 'seed') as number, [], [], parts.decor, place);
  const tick = own(value, 'tick') as number;
  world.tick = tick;
  world.time = tick * SIM_DT;
  world.entities = parts.fish;
  world.food = parts.food;
  world.nextFishId = own(value, 'nextFishId') as number;
  world.nextFoodId = own(value, 'nextFoodId') as number;
  const target = world as unknown as Record<string, unknown>;
  for (const key of WORLD_PART_ORDER) {
    if (parts[key] !== undefined) {
      target[key] = parts[key];
    }
  }
  return world;
}

/** Lieu d'un corps de monde : environnement, dimensions réglées ou forme du bassin. */
function parsePlace(
  value: Record<string, unknown>,
  environment: EnvironmentId,
  problems: string[],
): Place {
  const dimensions = parseDimensions(own(value, 'dimensions'), environment, problems);
  const shape = parseShape(own(value, 'shape'), environment, problems);
  if (dimensions !== undefined) {
    return { environment, dimensions };
  }
  return shape === undefined ? environment : { environment, shape };
}

/** Parties d'un corps de monde, dans l'ordre historique des messages. */
function parseWorldParts(
  value: Record<string, unknown>,
  place: Place,
  problems: string[],
): WorldParts {
  const environment = placeEnvironment(place);
  const decor = parseDecor(own(value, 'decor'), place, problems);
  problems.push(...problemsOf(value, MODE_RULES));
  const careModeValue = own(value, 'careMode');
  const currentValue = own(value, 'current');
  const careMode = isCareMode(careModeValue) ? careModeValue : undefined;
  const context: AnimalContext = { place, nextFishId: own(value, 'nextFishId'), careMode };
  const fish = parseFishList(own(value, 'fish'), context, problems);
  const food = parseFoodList(own(value, 'food'), place, own(value, 'nextFoodId'), problems);
  const eggs = parseEggList(own(value, 'eggs'), place, problems);
  const states = parseStates(value, environment, problems);
  problems.push(...problemsOf(value, [MORTALITY_RULE]));
  const dead = parseDeadList(own(value, 'dead'), context, fish, problems);
  return {
    decor,
    fish,
    food,
    careMode,
    current: isSavedCurrent(currentValue) ? currentValue : undefined,
    eggs: eggs.length > 0 ? eggs : undefined,
    ...states,
    mortality: own(value, 'mortality') === true ? true : undefined,
    dead: dead.length > 0 ? dead : undefined,
    water: parseWaterField(own(value, 'water'), environment, problems),
  };
}

function parseDecor(value: unknown, place: Place, problems: string[]): DecorItem[] {
  const items = readList(value, DECOR_LIST, problems);
  if (items === null) {
    return [];
  }
  try {
    return parseDecorItems(items, placeDimensions(place));
  } catch (error) {
    problems.push(`décor : ${(error as Error).message}`);
    return [];
  }
}

/**
 * États facultatifs (#511, #512, #513, #581, #583) : absents, aucun ; distributeur refusé
 * dans un bac où il ne peut pas être posé.
 */
function parseStates(
  value: Record<string, unknown>,
  environment: EnvironmentId,
  problems: string[],
): WorldStates {
  const states: Record<string, unknown> = {};
  for (const [key, read] of STATE_READERS) {
    const raw = own(value, key);
    const state = raw === undefined ? null : read(raw, problems);
    if (state !== null) {
      states[key] = state;
    }
  }
  if (states['feeder'] !== undefined && !hasFeeder(environment)) {
    problems.push(`distributeur impossible dans l’environnement ${environment}`);
  }
  return states as WorldStates;
}

/**
 * Eau (#206) : absente, eau saine (celle de `createWorld`) ; présente, validée (pH absent :
 * celui de l'eau neuve de l'environnement, #236).
 */
function parseWaterField(
  value: unknown,
  environment: EnvironmentId,
  problems: string[],
): WaterState | undefined {
  if (value === undefined) {
    return undefined;
  }
  const water = readWater(value, environment);
  if (!water.ok) {
    problems.push(water.error);
    return undefined;
  }
  return water.water;
}

/** Dimensions réglées : trois nombres finis, contrôlés dans cet ordre. */
const DIMENSION_RULES: readonly FieldRule[] = (['width', 'height', 'depth'] as const).map((key) =>
  field(key, finiteNumber, `dimensions : ${key} doit être un nombre fini`),
);

/**
 * Dimensions réglées d'une sauvegarde : `undefined` si absentes ; sinon trois réels finis,
 * bornés à `TANK_LIMITS` (`clampTankDimensions` : une valeur hors bornes est ramenée, pas
 * refusée), dans un environnement qui les accepte (`isTankResizable`).
 */
function parseDimensions(
  value: unknown,
  environment: EnvironmentId,
  problems: string[],
): TankDimensions | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isTankResizable(environment)) {
    problems.push(`dimensions non réglables dans l’environnement ${environment}`);
    return undefined;
  }
  if (!isRecord(value)) {
    problems.push('dimensions doit être un objet');
    return undefined;
  }
  const problem = firstProblemOf(value, DIMENSION_RULES);
  if (problem !== null) {
    problems.push(problem);
    return undefined;
  }
  return clampTankDimensions({
    width: own(value, 'width') as number,
    height: own(value, 'height') as number,
    depth: own(value, 'depth') as number,
  });
}

/**
 * Forme du bassin d'une sauvegarde (issue #190) : `undefined` si absente ou rectangle ; sinon
 * une forme connue, dans un environnement qui l'accepte (`isPondShapeable`).
 */
function parseShape(
  value: unknown,
  environment: EnvironmentId,
  problems: string[],
): PondShape | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isPondShape(value)) {
    problems.push(`forme de bassin inconnue (${describe(value)})`);
    return undefined;
  }
  if (value === DEFAULT_POND_SHAPE) {
    return undefined;
  }
  if (!isPondShapeable(environment)) {
    problems.push(`forme non réglable dans l’environnement ${environment}`);
    return undefined;
  }
  return value;
}

function failure(error: string): ParseWorldResult {
  return { ok: false, error };
}
