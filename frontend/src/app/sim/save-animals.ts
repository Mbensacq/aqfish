import { acceptsSavedSpecies, type CareMode } from './care-mode';
import { DISEASES } from './diseases';
import { environmentWater, placeEnvironment, type EnvironmentId, type Place } from './environment';
import {
  EGG_HATCH_TIME,
  EGG_SURFACES,
  hatchesToFry,
  isEggAge,
  laysEggs,
  MAX_EGGS,
  type Egg,
  type EggSurface,
} from './eggs';
import { FOOD_MAX_FLOAT_SECONDS, FOOD_MIN_FLOAT_SECONDS, FOOD_SINK_SPEED, MAX_FOOD } from './food';
import type { FoodPellet } from './food';
import { FRY_GROWTH_TIME, hasFry, isFryAge } from './fry';
import { HEALTH_FLOOR, HEALTH_START } from './health-scale';
import { DEAD_MAX_AGE, isDeadAge, type DeadAnimal } from './mortality';
import { isSpeciesId, MAX_TOTAL_FISH } from './population';
import {
  describe,
  field,
  finiteNumber,
  firstProblemOf,
  insideBox,
  isIntegerIn,
  isNumberIn,
  isRecord,
  isUint32,
  numberIn,
  optional,
  own,
  readList,
  uint32,
  type FieldRule,
  type ListRule,
  type Rule,
} from './save-schema';
import { isColonySpecies } from './shrimp-colony';
import { SPECIES, type SpeciesId } from './species';
import type { Fish } from './swimmer';
import type { Box3 } from './tank';
import { boundsFor } from './world';
import type { Entity } from './world-types';

/**
 * Animaux et granulés d'une sauvegarde (`sim/save.ts`) : poissons, corps, granulés et œufs,
 * relus par des règles déclaratives (`sim/save-schema.ts`) dans l'ordre historique des
 * contrôles. Chaque élément invalide ajoute un problème préfixé de son rang.
 */

/** Tolérance sur les bornes angulaires et de vitesse. */
const VALUE_EPSILON = 1e-12;
/**
 * Durée maximale acceptée pour le temps de remontée d'un poisson et l'âge d'un granulé, en
 * secondes : bien au-delà des valeurs atteintes (un granulé disparaît avant 1 min).
 */
const MAX_DURATION_SECONDS = 3600;

/** Champs numériques d'un poisson, dans l'ordre d'écriture. */
export const FISH_NUMBER_KEYS = [
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
export const FOOD_NUMBER_KEYS = [
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

/** Contexte de lecture des animaux d'un monde (poissons vivants et corps). */
export interface AnimalContext {
  readonly place: Place;
  readonly nextFishId: unknown;
  readonly careMode: CareMode | undefined;
}

/**
 * Corps d'une sauvegarde (#582) : liste facultative de poissons enregistrés (mêmes règles que
 * `fish`) portant chacun un âge `deadFor` valide (`isDeadAge`).
 */
export function parseDeadList(
  value: unknown,
  context: AnimalContext,
  living: readonly { readonly id: number }[],
  problems: string[],
): DeadAnimal[] {
  if (value === undefined) {
    return [];
  }
  const before = problems.length;
  const bodies = parseFishList(value, context, problems, DEAD_LIST);
  if (problems.length > before) {
    return [];
  }
  // `netTarget` et `removeDeadInPlace` travaillent par identifiant (#615) : un corps ne peut
  // pas porter celui d'un animal vivant.
  const livingIds = new Set(living.map((animal) => animal.id));
  const dead: DeadAnimal[] = [];
  (value as unknown[]).forEach((item, i) => {
    const age = own(item as Record<string, unknown>, 'deadFor');
    if (!isDeadAge(age)) {
      problems.push(`corps ${i} : deadFor hors de [0, ${DEAD_MAX_AGE}]`);
      return;
    }
    if (livingIds.has(bodies[i].id)) {
      problems.push(`corps ${i} : identifiant ${bodies[i].id} déjà porté par un animal vivant`);
      return;
    }
    dead.push({ ...bodies[i], deadFor: age });
  });
  return dead;
}

/** Liste d'animaux enregistrés : règle de la liste et nom d'un élément dans les messages. */
interface AnimalListRule extends ListRule {
  /** Préfixe des problèmes d'un élément (« poisson 0 : … », « corps 0 : … »). */
  readonly item: string;
}

const FISH_LIST: AnimalListRule = {
  key: 'fish',
  item: 'poisson',
  max: MAX_TOTAL_FISH,
  countMessage: (count) => `trop de poissons (${count}, ${MAX_TOTAL_FISH} au plus)`,
};

/** Corps (#582) : mêmes règles que `fish`, problèmes signalés comme tels (#717). */
const DEAD_LIST: AnimalListRule = {
  key: 'dead',
  item: 'corps',
  max: MAX_TOTAL_FISH,
  countMessage: (count) => `trop de corps (${count}, ${MAX_TOTAL_FISH} au plus)`,
};

export function parseFishList(
  value: unknown,
  context: AnimalContext,
  problems: string[],
  rule: AnimalListRule = FISH_LIST,
): Entity[] {
  const items = readList(value, rule, problems);
  if (items === null) {
    return [];
  }
  const fishes: Entity[] = [];
  const counts = new Map<SpeciesId, number>();
  let previousId = -1;
  items.forEach((item: unknown, i) => {
    const fish = parseFish(item, context);
    if (typeof fish === 'string') {
      problems.push(`${rule.item} ${i} : ${fish}`);
      return;
    }
    if (fish.id <= previousId) {
      problems.push(`${rule.item} ${i} : identifiants non strictement croissants`);
    }
    if (typeof context.nextFishId === 'number' && fish.id >= context.nextFishId) {
      problems.push(`${rule.item} ${i} : identifiant ${fish.id} ≥ nextFishId`);
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

/** Identité d'un poisson : identifiant, espèce connue et admise dans le bac. */
function fishIdentityRules(
  environment: EnvironmentId,
  careMode: CareMode | undefined,
): readonly FieldRule[] {
  return [
    field('id', uint32, 'id doit être un entier 32 bits non signé'),
    field('species', isSpeciesId, (v) => `espèce inconnue (${describe(v)})`),
    field(
      'species',
      (v) => acceptsSavedSpecies(environment, careMode, v as SpeciesId),
      (v) => `l’espèce ${v as string} ne vit pas dans l’environnement ${environment}`,
    ),
  ];
}

/**
 * Champs numériques d'un poisson, puis sa santé (issue #208) juste après la faim : facultative,
 * une sauvegarde antérieure n'en a pas (animal en pleine santé).
 */
const FISH_FIELD_RULES: readonly FieldRule[] = FISH_NUMBER_KEYS.flatMap((key) => {
  const rule = field(key, finiteNumber, `${key} doit être un nombre fini`);
  return key === 'hunger'
    ? [rule, field('health', optional(finiteNumber), 'health doit être un nombre fini')]
    : [rule];
});

/** Poisson relu, ou le message de son premier problème. */
function parseFish(item: unknown, context: AnimalContext): Entity | string {
  if (!isRecord(item)) {
    return 'doit être un objet';
  }
  const environment = placeEnvironment(context.place);
  const problem =
    firstProblemOf(item, fishIdentityRules(environment, context.careMode)) ??
    firstProblemOf(item, FISH_FIELD_RULES);
  if (problem !== null) {
    return problem;
  }
  const species = own(item, 'species') as SpeciesId;
  const fish: Record<string, number | string> = {
    id: own(item, 'id') as number,
    kind: 'fish',
    species,
  };
  for (const key of FISH_NUMBER_KEYS) {
    fish[key] = own(item, key) as number;
    if (key === 'hunger') {
      fish['health'] = (own(item, 'health') as number | undefined) ?? HEALTH_START;
    }
  }
  const extra = readDiseases(item, fish, environment) ?? readGrowth(item, fish);
  if (extra !== null) {
    return extra;
  }
  const f = fish as unknown as Fish;
  return firstProblemOf(f, fishRangeRules(species, context.place)) ?? f;
}

/**
 * Maladies (table `DISEASES`, issues #360, #485, #532, #548, #562) : facultatives, absentes
 * pour un animal sain et dans toute sauvegarde antérieure ; présente, progression dans
 * [0, max]. Ignorée (sauvegarde modifiée à la main) pour un animal qui ne l'attrape pas ici
 * (#368). Renvoie le premier problème, ou `null`.
 */
function readDiseases(
  item: Record<string, unknown>,
  fish: Record<string, number | string>,
  environment: EnvironmentId,
): string | null {
  const species = fish['species'] as SpeciesId;
  for (const disease of DISEASES) {
    const progress = own(item, disease.field);
    if (progress === undefined) {
      continue;
    }
    if (!disease.isProgress(progress)) {
      return `${disease.field} hors de [0, ${disease.max}]`;
    }
    if (disease.catches(species, environment)) {
      fish[disease.field] = progress;
    }
  }
  return null;
}

/**
 * Alevin (issue #459) : facultatif, absent pour un adulte et dans toute sauvegarde
 * antérieure ; présent, âge dans [0, FRY_GROWTH_TIME), pour une espèce vivipare ou ovipare
 * (alevin éclos d'un œuf, issue #478) ou en colonie (jeune crevette, #836) seulement. Renvoie
 * le problème, ou `null`.
 */
function readGrowth(
  item: Record<string, unknown>,
  fish: Record<string, number | string>,
): string | null {
  const growth = own(item, 'growth');
  if (growth === undefined) {
    return null;
  }
  const species = fish['species'] as SpeciesId;
  if (!hasFry(species) && !hatchesToFry(species) && !isColonySpecies(species)) {
    return `l’espèce ${species} n’a pas d’alevins`;
  }
  if (!isFryAge(growth)) {
    return `growth hors de [0, ${FRY_GROWTH_TIME}[`;
  }
  fish['growth'] = growth;
  return null;
}

/** Bornes d'un poisson de l'espèce dans le lieu, contrôlées dans cet ordre. */
function fishRangeRules(species: SpeciesId, place: Place): readonly Rule<Fish>[] {
  const def = SPECIES[species];
  const hard = boundsFor(species, place).hard;
  const pitch = numberIn(-def.maxPitch, def.maxPitch, VALUE_EPSILON);
  const angle = numberIn(-Math.PI, Math.PI, VALUE_EPSILON);
  const phase = numberIn(0, 2 * Math.PI);
  return [
    { valid: (f) => insideBox(hard, f.x, f.y, f.z), message: 'position hors de la zone de nage' },
    {
      valid: (f) => insideBox(hard, f.px, f.py, f.pz),
      message: 'position précédente hors de la zone de nage',
    },
    { valid: (f) => angle(f.yaw), message: 'yaw hors de [-π, π]' },
    { valid: (f) => angle(f.pyaw), message: 'pyaw hors de [-π, π]' },
    { valid: (f) => pitch(f.pitch), message: 'pitch hors bornes' },
    { valid: (f) => pitch(f.ppitch), message: 'ppitch hors bornes' },
    { valid: (f) => pitch(f.pitchTarget), message: 'pitchTarget hors bornes' },
    {
      valid: (f) => isNumberIn(f.speed, def.minSpeed, def.maxSpeed, VALUE_EPSILON),
      message: 'vitesse hors bornes',
    },
    {
      valid: (f) => isNumberIn(f.turn, -def.wanderTurnRate, def.wanderTurnRate, VALUE_EPSILON),
      message: 'turn hors bornes',
    },
    { valid: (f) => phase(f.phase), message: 'phase hors de [0, 2π]' },
    { valid: (f) => phase(f.pphase), message: 'pphase hors de [0, 2π]' },
    { valid: (f) => isNumberIn(f.ascent, 0, MAX_DURATION_SECONDS), message: 'ascent hors bornes' },
    { valid: (f) => isNumberIn(f.hunger, 0, 1), message: 'hunger hors de [0, 1]' },
    {
      valid: (f) => isNumberIn(f.health, HEALTH_FLOOR, 1),
      message: 'health hors de [plancher, 1]',
    },
    { valid: (f) => isUint32(f.rng), message: 'rng doit être un entier 32 bits non signé' },
  ];
}

const FOOD_LIST: ListRule = {
  key: 'food',
  max: MAX_FOOD,
  countMessage: (count) => `trop de granulés (${count}, ${MAX_FOOD} au plus)`,
};

/** Champs numériques d'un granulé. */
const FOOD_FIELD_RULES: readonly FieldRule[] = FOOD_NUMBER_KEYS.map((key) =>
  field(key, finiteNumber, `${key} doit être un nombre fini`),
);

/** Bornes d'un granulé, après l'identifiant `previousId` du granulé précédent. */
function foodRangeRules(
  water: Box3,
  previousId: number,
  nextFoodId: unknown,
): readonly Rule<FoodPellet>[] {
  return [
    {
      valid: (p) => isIntegerIn(p.id, 0, Number.MAX_SAFE_INTEGER),
      message: 'id doit être un entier positif ou nul',
    },
    { valid: (p) => p.id > previousId, message: 'identifiants non strictement croissants' },
    {
      valid: (p) => typeof nextFoodId !== 'number' || p.id < nextFoodId,
      message: (p) => `identifiant ${p.id} ≥ nextFoodId`,
    },
    { valid: (p) => insideBox(water, p.x, p.y, p.z), message: 'position hors de l’eau' },
    { valid: (p) => isNumberIn(p.floatY, water.minY, water.maxY), message: 'floatY hors de l’eau' },
    {
      valid: (p) => isNumberIn(p.restY, water.minY, p.floatY),
      message: 'restY hors de [fond, floatY]',
    },
    { valid: (p) => isNumberIn(p.vy, -FOOD_SINK_SPEED, 0), message: 'vy hors bornes' },
    { valid: (p) => isNumberIn(p.age, 0, MAX_DURATION_SECONDS), message: 'age hors bornes' },
    {
      valid: (p) => isNumberIn(p.floatTime, FOOD_MIN_FLOAT_SECONDS, FOOD_MAX_FLOAT_SECONDS),
      message: 'floatTime hors bornes',
    },
  ];
}

export function parseFoodList(
  value: unknown,
  place: Place,
  nextFoodId: unknown,
  problems: string[],
): FoodPellet[] {
  const items = readList(value, FOOD_LIST, problems);
  if (items === null) {
    return [];
  }
  const water = environmentWater(place);
  const food: FoodPellet[] = [];
  let previousId = -1;
  items.forEach((item: unknown, i) => {
    const pellet = parsePellet(item, water, previousId, nextFoodId);
    if (typeof pellet === 'string') {
      problems.push(`granulé ${i} : ${pellet}`);
      return;
    }
    previousId = pellet.id;
    food.push(pellet);
  });
  return food;
}

/** Granulé relu (champs connus seulement), ou le message de son premier problème. */
function parsePellet(
  item: unknown,
  water: Box3,
  previousId: number,
  nextFoodId: unknown,
): FoodPellet | string {
  if (!isRecord(item)) {
    return 'doit être un objet';
  }
  const problem = firstProblemOf(item, FOOD_FIELD_RULES);
  if (problem !== null) {
    return problem;
  }
  const pellet: Record<string, number> = {};
  for (const key of FOOD_NUMBER_KEYS) {
    pellet[key] = own(item, key) as number;
  }
  const p = pellet as unknown as FoodPellet;
  return firstProblemOf(p, foodRangeRules(water, previousId, nextFoodId)) ?? p;
}

const EGG_LIST: ListRule = {
  key: 'eggs',
  max: MAX_EGGS,
  countMessage: (count) => `trop d’œufs (${count}, ${MAX_EGGS} au plus)`,
};

/** Œuf d'une espèce ovipare, dans l'eau, d'âge et de surface valides. */
function eggRules(water: Box3): readonly FieldRule[] {
  return [
    field(
      'species',
      (v) => isSpeciesId(v) && laysEggs(v),
      (v) => `espèce sans œufs (${describe(v)})`,
    ),
    {
      valid: (egg) => {
        const [x, y, z] = [own(egg, 'x'), own(egg, 'y'), own(egg, 'z')];
        return (
          typeof x === 'number' &&
          typeof y === 'number' &&
          typeof z === 'number' &&
          insideBox(water, x, y, z)
        );
      },
      message: 'position hors de l’eau',
    },
    field('age', isEggAge, `age hors de [0, ${EGG_HATCH_TIME}[`),
    field(
      'surface',
      (v) => EGG_SURFACES.includes(v as EggSurface),
      (v) => `surface inconnue (${describe(v)})`,
    ),
  ];
}

/**
 * Œufs d'une sauvegarde (issue #478) : absents, aucun ; présents, une liste d'au plus
 * `MAX_EGGS` œufs d'une espèce ovipare, dans l'eau, d'âge dans [0, `EGG_HATCH_TIME`), sur une
 * surface connue. Seuls les champs connus sont copiés.
 */
export function parseEggList(value: unknown, place: Place, problems: string[]): Egg[] {
  if (value === undefined) {
    return [];
  }
  const items = readList(value, EGG_LIST, problems);
  if (items === null) {
    return [];
  }
  const rules = eggRules(environmentWater(place));
  const eggs: Egg[] = [];
  items.forEach((item: unknown, i) => {
    const problem = isRecord(item) ? firstProblemOf(item, rules) : 'doit être un objet';
    if (problem !== null) {
      problems.push(`œuf ${i} : ${problem}`);
      return;
    }
    const egg = item as Record<string, unknown>;
    eggs.push({
      species: own(egg, 'species') as SpeciesId,
      x: own(egg, 'x') as number,
      y: own(egg, 'y') as number,
      z: own(egg, 'z') as number,
      age: own(egg, 'age') as number,
      surface: own(egg, 'surface') as EggSurface,
    });
  });
  return eggs;
}
