import { DEFAULT_FOOD_STYLE, isFoodStyle, type FoodStyle } from '../core/food-style/food-style';
import { MAX_SEED } from '../core/random/prng';
import { SIM_DT } from './constants';
import { createDayClock, DEFAULT_DAY_CLOCK, HOURS_PER_DAY, type DayClock } from './daylight';
import { parseDecorItems, type DecorItem } from './decor';
import {
  ENVIRONMENT_IDS,
  environmentWater,
  isEnvironmentId,
  isTankResizable,
  livesIn,
  placeDimensions,
  placeEnvironment,
  type EnvironmentId,
  type Place,
} from './environment';
import { FOOD_MAX_FLOAT_SECONDS, FOOD_MIN_FLOAT_SECONDS, FOOD_SINK_SPEED, MAX_FOOD } from './food';
import type { FoodPellet } from './food';
import { isSpeciesId, MAX_TOTAL_FISH } from './population';
import { clampRoom, DEFAULT_ROOM, readRoom, roomData, type Room } from './room';
import { tidyRoom } from './room-furniture';
import { DEFAULT_SIM_SPEED, isSimSpeed, type SimSpeed } from './sim-speed';
import { SPECIES, type SpeciesId } from './species';
import type { Fish } from './swimmer';
import { copyWater, readWater, type WaterState } from './water';
import { HEALTH_FLOOR, HEALTH_START } from './wellbeing';
import { clampTankDimensions, type Box3, type TankDimensions } from './tank';
import {
  boundsFor,
  createWorld,
  seededObstacleCount,
  type Entity,
  type MutableWorld,
  type World,
} from './world';

/**
 * Sauvegarde du monde (issue #70, ADR 0028) : format JSON versionné, écrit et relu par des
 * fonctions pures (`serializeWorld`, `parseWorld`).
 *
 * Ce qui est enregistré : graine, environnement, dimensions réglées du bac (issue #171,
 * facultatives : absentes, ce sont celles de l'environnement), compteur de pas (le temps simulé en dérive,
 * `tick · SIM_DT`), décor, poissons (état complet, sous-générateur compris), granulés,
 * compteurs d'identifiants, état de l'eau (issue #206, facultatif : absent, eau saine), et les réglages de vitesse, d'heure et de rendu des granulés.
 * Les mondes des autres environnements visités (issue #277, ADR 0063) sont écrits à côté,
 * dans `others` (facultatif : absent, aucun), avec le même corps que le monde affiché. Les obstacles ne sont pas
 * enregistrés : ils sont recalculés à partir du décor (`createWorld`), comme à la création.
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

/**
 * Durée d'une journée simulée acceptée pour l'horloge, en secondes : de 1 min à 1 jour
 * réel (l'application utilise 20 min, `DEFAULT_DAY_LENGTH_SECONDS`).
 */
export const MIN_DAY_LENGTH_SECONDS = 60;
export const MAX_DAY_LENGTH_SECONDS = 86_400;

/** Tolérance sur les bornes de position, en mètres (arrondis des calculs de nage). */
const POSITION_EPSILON = 1e-9;
/** Tolérance sur les bornes angulaires et de vitesse. */
const VALUE_EPSILON = 1e-12;
/**
 * Durée maximale acceptée pour le temps de remontée d'un poisson et l'âge d'un granulé, en
 * secondes : bien au-delà des valeurs atteintes (un granulé disparaît avant 1 min).
 */
const MAX_DURATION_SECONDS = 3600;

/** Réglages de l'interface enregistrés avec le monde. */
export interface SaveSettings {
  /** Vitesse de simulation (`sim/sim-speed.ts`). */
  readonly speed: SimSpeed;
  /** Horloge de la journée (`sim/daylight.ts`) : l'heure en dérive au temps du monde. */
  readonly clock: DayClock;
  /**
   * Rendu des granulés (issue #117). Facultatif : absent (anciennes sauvegardes), c'est
   * `DEFAULT_FOOD_STYLE` ; toujours présent dans une sauvegarde écrite et relue.
   */
  readonly foodStyle?: FoodStyle;
  /**
   * Pièce autour du bac (issue #187, ADR 0048). Facultative : absente (anciennes
   * sauvegardes), c'est `DEFAULT_ROOM` (masquée) ; toujours présente dans une sauvegarde
   * écrite et relue.
   */
  readonly room?: Room;
}

/** Réglages par défaut (vitesse ×1, départ à midi, heure en marche, granulés en points, pièce masquée). */
export const DEFAULT_SAVE_SETTINGS: SaveSettings = {
  speed: DEFAULT_SIM_SPEED,
  clock: DEFAULT_DAY_CLOCK,
  foodStyle: DEFAULT_FOOD_STYLE,
  room: DEFAULT_ROOM,
};

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

/** Champs numériques d'un poisson, dans l'ordre d'écriture. */
const FISH_NUMBER_KEYS = [
  'x',
  'y',
  'z',
  'yaw',
  'pitch',
  'speed',
  'turn',
  'pitchTarget',
  'phase',
  'ascent',
  'hunger',
  'rng',
  'px',
  'py',
  'pz',
  'pyaw',
  'ppitch',
  'pphase',
] as const;

/** Champs numériques d'un granulé, dans l'ordre d'écriture. */
const FOOD_NUMBER_KEYS = [
  'id',
  'x',
  'y',
  'z',
  'vy',
  'age',
  'floatY',
  'floatTime',
  'restY',
] as const;

/**
 * Contenu de la sauvegarde de `world`, de `settings` et des mondes `others` des autres
 * environnements visités (objet de données, copié : rien n'est partagé avec les mondes).
 * `others` est écrit dans l'ordre de `ENVIRONMENT_IDS`, et omis s'il est vide.
 * @throws RangeError si un monde a des obstacles explicites (hors décor et coraux), non enregistrables
 * dans le schéma 1, si un réglage est invalide, ou si deux mondes ont le même environnement.
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
 * Réglages enregistrés (copiés, pièce bornée), communs aux schémas 1 et 2.
 * @throws RangeError si un réglage est invalide.
 */
export function settingsData(settings: SaveSettings): SaveSettings {
  const problems = settingsProblems(settings);
  if (problems.length > 0) {
    throw new RangeError(`sauvegarde : ${problems.join(' ; ')}`);
  }
  return {
    speed: settings.speed,
    clock: {
      startHour: settings.clock.startHour,
      dayLengthSeconds: settings.clock.dayLengthSeconds,
      frozen: settings.clock.frozen,
    },
    foodStyle: settings.foodStyle ?? DEFAULT_FOOD_STYLE,
    room: roomData(clampRoom(settings.room ?? DEFAULT_ROOM)),
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
    tick: world.tick,
    nextFishId: world.nextFishId,
    nextFoodId: world.nextFoodId,
    decor: world.decor.map((item) => ({ ...item })),
    fish: world.entities.map((fish) => {
      const saved: Record<string, number | string> = { id: fish.id, species: fish.species };
      for (const key of FISH_NUMBER_KEYS) {
        saved[key] = fish[key];
      }
      saved['health'] = fish.health;
      return saved as unknown as SavedFish;
    }),
    food: world.food.map((pellet) => ({ ...pellet })),
    water: copyWater(world.water),
  };
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
  if (!Array.isArray(value)) {
    problems.push('others doit être une liste');
    return [];
  }
  if (value.length > ENVIRONMENT_IDS.length - 1) {
    problems.push(
      `trop d’autres environnements (${value.length}, ${ENVIRONMENT_IDS.length - 1} au plus)`,
    );
    return [];
  }
  const seen = new Set<EnvironmentId>([shown]);
  const worlds: World[] = [];
  value.forEach((item: unknown, i) => {
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
  const seed = own(value, 'seed');
  if (!isUint32(seed)) {
    problems.push('seed doit être un entier 32 bits non signé');
  }
  const environment = own(value, 'environment');
  if (!isEnvironmentId(environment)) {
    problems.push(`environnement inconnu (${describe(environment)})`);
    return null;
  }
  const dimensions = parseDimensions(own(value, 'dimensions'), environment, problems);
  const place: Place = dimensions === undefined ? environment : { environment, dimensions };
  const tick = own(value, 'tick');
  if (!isIntegerIn(tick, 0, MAX_SAVE_TICK)) {
    problems.push(`tick doit être un entier dans [0, ${MAX_SAVE_TICK}]`);
  }
  const nextFishId = own(value, 'nextFishId');
  if (!isUint32(nextFishId)) {
    problems.push('nextFishId doit être un entier 32 bits non signé');
  }
  const nextFoodId = own(value, 'nextFoodId');
  if (!isIntegerIn(nextFoodId, 0, Number.MAX_SAFE_INTEGER)) {
    problems.push('nextFoodId doit être un entier positif ou nul');
  }
  afterCounters?.();

  const decorValue = own(value, 'decor');
  let decor: DecorItem[] = [];
  if (!Array.isArray(decorValue)) {
    problems.push('decor doit être une liste');
  } else if (decorValue.length > MAX_SAVE_DECOR) {
    problems.push(`trop d’éléments de décor (${decorValue.length}, ${MAX_SAVE_DECOR} au plus)`);
  } else {
    try {
      decor = parseDecorItems(decorValue, placeDimensions(place));
    } catch (error) {
      problems.push(`décor : ${(error as Error).message}`);
    }
  }

  const fish = parseFishList(own(value, 'fish'), place, nextFishId, problems);
  const food = parseFoodList(own(value, 'food'), place, nextFoodId, problems);
  // Eau (#206) : absente, eau saine (celle de `createWorld`) ; présente, validée (pH absent :
  // celui de l'eau neuve de l'environnement, #236).
  const waterValue = own(value, 'water');
  const water = waterValue === undefined ? null : readWater(waterValue, environment);
  if (water !== null && !water.ok) {
    problems.push(water.error);
  }
  if (problems.length > before) {
    return null;
  }

  const world: MutableWorld = createWorld(seed as number, [], [], decor, place);
  world.tick = tick as number;
  world.time = (tick as number) * SIM_DT;
  world.entities = fish;
  world.food = food;
  world.nextFishId = nextFishId as number;
  world.nextFoodId = nextFoodId as number;
  if (water !== null && water.ok) {
    world.water = water.water;
  }
  return world;
}

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
  const raw = {
    width: own(value, 'width'),
    height: own(value, 'height'),
    depth: own(value, 'depth'),
  };
  for (const [key, v] of Object.entries(raw)) {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      problems.push(`dimensions : ${key} doit être un nombre fini`);
      return undefined;
    }
  }
  return clampTankDimensions(raw as unknown as TankDimensions);
}

/** Relit les réglages (communs aux schémas 1 et 2) ; `null` si un problème a été ajouté. */
export function parseSettings(value: unknown, problems: string[]): SaveSettings | null {
  if (!isRecord(value)) {
    problems.push('settings doit être un objet');
    return null;
  }
  const speed = own(value, 'speed');
  const clockValue = own(value, 'clock');
  const startHour = isRecord(clockValue) ? own(clockValue, 'startHour') : undefined;
  const dayLength = isRecord(clockValue) ? own(clockValue, 'dayLengthSeconds') : undefined;
  const frozen = isRecord(clockValue) ? own(clockValue, 'frozen') : undefined;
  const foodStyle = own(value, 'foodStyle');
  const settings = {
    speed: speed as SimSpeed,
    clock: { startHour, dayLengthSeconds: dayLength, frozen } as unknown as DayClock,
    foodStyle: foodStyle as FoodStyle | undefined,
  };
  const found = settingsProblems(settings);
  // Pièce (#187) : absente, masquée ; présente, validée et bornée (`readRoom`).
  const roomValue = own(value, 'room');
  const room =
    roomValue === undefined ? { ok: true as const, room: DEFAULT_ROOM } : readRoom(roomValue);
  if (!room.ok) {
    found.push(room.error);
  }
  if (found.length > 0 || !room.ok) {
    problems.push(...found);
    return null;
  }
  return {
    speed: settings.speed,
    clock: createDayClock(
      settings.clock.startHour,
      settings.clock.dayLengthSeconds,
      settings.clock.frozen,
    ),
    foodStyle: settings.foodStyle ?? DEFAULT_FOOD_STYLE,
    // Éléments relus reposés et chevauchements écartés (#200, cas 2).
    room: tidyRoom(room.room),
  };
}

function settingsProblems(settings: SaveSettings): string[] {
  const problems: string[] = [];
  if (typeof settings.speed !== 'number' || !isSimSpeed(settings.speed)) {
    problems.push(`vitesse inconnue (${describe(settings.speed)})`);
  }
  const clock: unknown = settings.clock;
  if (!isRecord(clock)) {
    problems.push('horloge absente');
    return problems;
  }
  if (!isNumberIn(clock['startHour'], 0, HOURS_PER_DAY) || clock['startHour'] === HOURS_PER_DAY) {
    problems.push('heure de l’horloge hors de [0, 24)');
  }
  if (!isNumberIn(clock['dayLengthSeconds'], MIN_DAY_LENGTH_SECONDS, MAX_DAY_LENGTH_SECONDS)) {
    problems.push(
      `durée de la journée hors de [${MIN_DAY_LENGTH_SECONDS}, ${MAX_DAY_LENGTH_SECONDS}] s`,
    );
  }
  if (typeof clock['frozen'] !== 'boolean') {
    problems.push('horloge : frozen doit être un booléen');
  }
  if (settings.foodStyle !== undefined && !isFoodStyle(settings.foodStyle)) {
    problems.push(`rendu des granulés inconnu (${describe(settings.foodStyle)})`);
  }
  if (settings.room !== undefined) {
    const room = readRoom(settings.room);
    if (!room.ok) {
      problems.push(room.error);
    }
  }
  return problems;
}

function parseFishList(
  value: unknown,
  environment: Place,
  nextFishId: unknown,
  problems: string[],
): Entity[] {
  if (!Array.isArray(value)) {
    problems.push('fish doit être une liste');
    return [];
  }
  if (value.length > MAX_TOTAL_FISH) {
    problems.push(`trop de poissons (${value.length}, ${MAX_TOTAL_FISH} au plus)`);
    return [];
  }
  const fishes: Entity[] = [];
  const counts = new Map<SpeciesId, number>();
  let previousId = -1;
  value.forEach((item: unknown, i) => {
    const fish = parseFish(item, environment, (p) => problems.push(`poisson ${i} : ${p}`));
    if (fish === null) {
      return;
    }
    if (fish.id <= previousId) {
      problems.push(`poisson ${i} : identifiants non strictement croissants`);
    }
    if (typeof nextFishId === 'number' && fish.id >= nextFishId) {
      problems.push(`poisson ${i} : identifiant ${fish.id} ≥ nextFishId`);
    }
    previousId = fish.id;
    counts.set(fish.species, (counts.get(fish.species) ?? 0) + 1);
    fishes.push(fish);
  });
  for (const [species, count] of counts) {
    if (count > SPECIES[species].maxPopulation) {
      problems.push(`trop de ${species} (${count}, ${SPECIES[species].maxPopulation} au plus)`);
    }
  }
  return fishes;
}

function parseFish(
  item: unknown,
  environment: Place,
  report: (problem: string) => void,
): Entity | null {
  if (!isRecord(item)) {
    report('doit être un objet');
    return null;
  }
  const id = own(item, 'id');
  const species = own(item, 'species');
  if (!isUint32(id)) {
    report('id doit être un entier 32 bits non signé');
    return null;
  }
  if (!isSpeciesId(species)) {
    report(`espèce inconnue (${describe(species)})`);
    return null;
  }
  const envId = placeEnvironment(environment);
  if (!livesIn(envId, species)) {
    report(`l’espèce ${species} ne vit pas dans l’environnement ${envId}`);
    return null;
  }
  const fish: Record<string, number | string> = { id, kind: 'fish', species };
  for (const key of FISH_NUMBER_KEYS) {
    const v = own(item, key);
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      report(`${key} doit être un nombre fini`);
      return null;
    }
    fish[key] = v;
    if (key === 'hunger') {
      // Santé (issue #208), juste après la faim (même ordre des champs qu'un poisson neuf) :
      // facultative, une sauvegarde antérieure n'en a pas (animal en pleine santé) ;
      // présente, nombre fini dans [plancher, 1].
      const health = own(item, 'health');
      if (health !== undefined && (typeof health !== 'number' || !Number.isFinite(health))) {
        report('health doit être un nombre fini');
        return null;
      }
      fish['health'] = health ?? HEALTH_START;
    }
  }
  const f = fish as unknown as Fish;
  const def = SPECIES[species];
  const hard = boundsFor(species, environment).hard;
  const checks: [boolean, string][] = [
    [insideBox(hard, f.x, f.y, f.z), 'position hors de la zone de nage'],
    [insideBox(hard, f.px, f.py, f.pz), 'position précédente hors de la zone de nage'],
    [isNumberIn(f.yaw, -Math.PI, Math.PI, VALUE_EPSILON), 'yaw hors de [-π, π]'],
    [isNumberIn(f.pyaw, -Math.PI, Math.PI, VALUE_EPSILON), 'pyaw hors de [-π, π]'],
    [isNumberIn(f.pitch, -def.maxPitch, def.maxPitch, VALUE_EPSILON), 'pitch hors bornes'],
    [isNumberIn(f.ppitch, -def.maxPitch, def.maxPitch, VALUE_EPSILON), 'ppitch hors bornes'],
    [
      isNumberIn(f.pitchTarget, -def.maxPitch, def.maxPitch, VALUE_EPSILON),
      'pitchTarget hors bornes',
    ],
    [isNumberIn(f.speed, def.minSpeed, def.maxSpeed, VALUE_EPSILON), 'vitesse hors bornes'],
    [
      isNumberIn(f.turn, -def.wanderTurnRate, def.wanderTurnRate, VALUE_EPSILON),
      'turn hors bornes',
    ],
    [isNumberIn(f.phase, 0, 2 * Math.PI), 'phase hors de [0, 2π]'],
    [isNumberIn(f.pphase, 0, 2 * Math.PI), 'pphase hors de [0, 2π]'],
    [isNumberIn(f.ascent, 0, MAX_DURATION_SECONDS), 'ascent hors bornes'],
    [isNumberIn(f.hunger, 0, 1), 'hunger hors de [0, 1]'],
    [isNumberIn(f.health, HEALTH_FLOOR, 1), 'health hors de [plancher, 1]'],
    [isUint32(f.rng), 'rng doit être un entier 32 bits non signé'],
  ];
  for (const [ok, problem] of checks) {
    if (!ok) {
      report(problem);
      return null;
    }
  }
  return f;
}

function parseFoodList(
  value: unknown,
  environment: Place,
  nextFoodId: unknown,
  problems: string[],
): FoodPellet[] {
  if (!Array.isArray(value)) {
    problems.push('food doit être une liste');
    return [];
  }
  if (value.length > MAX_FOOD) {
    problems.push(`trop de granulés (${value.length}, ${MAX_FOOD} au plus)`);
    return [];
  }
  const water = environmentWater(environment);
  const food: FoodPellet[] = [];
  let previousId = -1;
  value.forEach((item: unknown, i) => {
    const report = (p: string) => problems.push(`granulé ${i} : ${p}`);
    if (!isRecord(item)) {
      report('doit être un objet');
      return;
    }
    const pellet: Record<string, number> = {};
    for (const key of FOOD_NUMBER_KEYS) {
      const v = own(item, key);
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        report(`${key} doit être un nombre fini`);
        return;
      }
      pellet[key] = v;
    }
    const p = pellet as unknown as FoodPellet;
    const checks: [boolean, string][] = [
      [isIntegerIn(p.id, 0, Number.MAX_SAFE_INTEGER), 'id doit être un entier positif ou nul'],
      [p.id > previousId, 'identifiants non strictement croissants'],
      [typeof nextFoodId !== 'number' || p.id < nextFoodId, `identifiant ${p.id} ≥ nextFoodId`],
      [insideBox(water, p.x, p.y, p.z), 'position hors de l’eau'],
      [isNumberIn(p.floatY, water.minY, water.maxY), 'floatY hors de l’eau'],
      [isNumberIn(p.restY, water.minY, p.floatY), 'restY hors de [fond, floatY]'],
      [isNumberIn(p.vy, -FOOD_SINK_SPEED, 0), 'vy hors bornes'],
      [isNumberIn(p.age, 0, MAX_DURATION_SECONDS), 'age hors bornes'],
      [
        isNumberIn(p.floatTime, FOOD_MIN_FLOAT_SECONDS, FOOD_MAX_FLOAT_SECONDS),
        'floatTime hors bornes',
      ],
    ];
    for (const [ok, problem] of checks) {
      if (!ok) {
        report(problem);
        return;
      }
    }
    previousId = p.id;
    food.push(p);
  });
  return food;
}

function failure(error: string): ParseWorldResult {
  return { ok: false, error };
}

/** Objet JSON (ni tableau ni `null`). */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Propriété propre seulement : les clés héritées (`constructor`, `__proto__`…) valent `undefined`. */
export function own(record: Record<string, unknown>, key: string): unknown {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

function isNumberIn(value: unknown, min: number, max: number, epsilon = 0): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= min - epsilon &&
    value <= max + epsilon
  );
}

export function isIntegerIn(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

export function isUint32(value: unknown): value is number {
  return isIntegerIn(value, 0, MAX_SEED);
}

function insideBox(box: Box3, x: number, y: number, z: number): boolean {
  return (
    isNumberIn(x, box.minX, box.maxX, POSITION_EPSILON) &&
    isNumberIn(y, box.minY, box.maxY, POSITION_EPSILON) &&
    isNumberIn(z, box.minZ, box.maxZ, POSITION_EPSILON)
  );
}

/** Description courte d'une valeur reçue, pour les messages (jamais le texte entier). */
export function describe(value: unknown): string {
  if (typeof value === 'string') {
    return `« ${value.slice(0, 20)}${value.length > 20 ? '…' : ''} »`;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return value === undefined ? 'absente' : typeof value;
}
