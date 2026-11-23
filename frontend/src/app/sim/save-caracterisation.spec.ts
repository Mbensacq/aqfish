import { ENVIRONMENT_IDS } from './environment';
import { copyFirstTankPath, createFirstTankPath, firstTankFacts } from './first-tank-path';
import { JOURNAL_VERSION, waterChangeEntry } from './journal';
import { initialMaintenance, maintenanceDone } from './maintenance';
import { createWaterHistory, markWaterChange, savedWaterHistory } from './water-history';
import { migrateSchema1, parseSave, serializeRoom } from './room-save';
import { parseWorld, serializeWorld } from './save';
import { advance, createDefaultWorld, feed } from './world';

/**
 * Caractérisation de la relecture des sauvegardes (`parseWorld`, `parseSave`), lot 5 du
 * chantier #686 : relevée **avant** le passage aux validateurs déclaratifs. Chaque cas part
 * d'une sauvegarde réelle (écrite par l'application, schéma 1 ou 2) et en change un champ, ou
 * en combine plusieurs pour figer l'ordre des contrôles (la première erreur l'emporte, cinq
 * messages au plus). Résultat attendu : le message exact d'un refus, ou l'empreinte du JSON
 * exact du résultat accepté (ordre des clés compris) et de la sauvegarde réécrite.
 */

type Json = Record<string, unknown>;
type Mutation = (data: Json) => void;

/** Empreinte FNV-1a 32 bits d'un texte, en hexadécimal. */
function fingerprint(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** Sauvegarde réelle (schéma 1) d'un bac avancé et nourri de chaque environnement. */
function realWorld(environment: (typeof ENVIRONMENT_IDS)[number]): ReturnType<typeof advance> {
  return advance(feed(advance(createDefaultWorld(42, environment), 120), 0.1, 0), 30);
}

const TROPICAL = JSON.parse(serializeWorld(realWorld('tropical'))) as Json;

/** Sauvegarde du schéma 1 : le bac tropical et les mondes des autres environnements. */
const WITH_OTHERS = JSON.parse(
  serializeWorld(
    realWorld('tropical'),
    undefined,
    ENVIRONMENT_IDS.filter((id) => id !== 'tropical').map(realWorld),
  ),
) as Json;

/** Sauvegarde du schéma 2 : la pièce migrée de `WITH_OTHERS`. */
const ROOM: Json = (() => {
  const result = parseSave(JSON.stringify(WITH_OTHERS));
  if (!result.ok) {
    throw new Error(result.error);
  }
  return JSON.parse(serializeRoom(result.room, result.selectedTankId, result.settings)) as Json;
})();

function fishOf(data: Json, key = 'fish'): Json[] {
  return data[key] as Json[];
}

/** Premier poisson d'une espèce qui satisfait `test`, avec son rang. */
function fishWhere(data: Json, test: (species: string) => boolean): number {
  return fishOf(data).findIndex((fish) => test(fish['species'] as string));
}

/** Historique de l'eau valide : un changement d'eau marqué. */
function waterHistoryOf(): unknown {
  const world = realWorld('tropical');
  const history = createWaterHistory();
  markWaterChange(history, world.water, 0);
  return JSON.parse(JSON.stringify(savedWaterHistory(history)));
}

/**
 * Sauvegarde riche : œufs, mortalité, corps, distributeur, calendrier d'entretien, historique
 * de l'eau, journal et parcours (champs facultatifs valides).
 */
const RICH_EXTRAS: Mutation = (data) => {
  data['maintenance'] = maintenanceDone(initialMaintenance(0), 'filter', 12);
  data['waterHistory'] = waterHistoryOf();
  data['journal'] = { version: JOURNAL_VERSION, entries: [waterChangeEntry(3)] };
  data['firstTankPath'] = copyFirstTankPath(
    createFirstTankPath(firstTankFacts(realWorld('tropical'))),
  );
  const fish = fishOf(data)[0] as Json;
  const next = data['nextFishId'] as number;
  data['nextFishId'] = next + 1;
  data['eggs'] = [{ species: 'corydora', ...positionOf(fish), age: 10, surface: 'vitre' }];
  data['mortality'] = true;
  data['dead'] = [{ ...fish, id: next, deadFor: 5 }];
  data['feeder'] = { hours: [9, 18], stock: 10 };
};

/** Position d'un poisson (dans l'eau), pour y poser un œuf. */
function positionOf(fish: Json): { x: unknown; y: unknown; z: unknown } {
  return { x: fish['x'], y: fish['y'], z: fish['z'] };
}

function mutated(base: Json, mutation: Mutation): Json {
  const copy = structuredClone(base);
  mutation(copy);
  return copy;
}

function set(key: string, value: unknown): Mutation {
  return (data) => {
    data[key] = value;
  };
}

function remove(key: string): Mutation {
  return (data) => {
    delete data[key];
  };
}

function setIn(path: readonly (string | number)[], value: unknown): Mutation {
  return (data) => {
    let target = data as Record<string | number, unknown>;
    for (const key of path.slice(0, -1)) {
      target = target[key] as Record<string | number, unknown>;
    }
    target[path[path.length - 1] as string | number] = value;
  };
}

function removeIn(path: readonly (string | number)[]): Mutation {
  return (data) => {
    let target = data as Record<string | number, unknown>;
    for (const key of path.slice(0, -1)) {
      target = target[key] as Record<string | number, unknown>;
    }
    delete target[path[path.length - 1] as string | number];
  };
}

function all(...mutations: Mutation[]): Mutation {
  return (data) => mutations.forEach((mutation) => mutation(data));
}

const FISH_KEYS = [
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
];
const FOOD_KEYS = ['id', 'x', 'y', 'z', 'vy', 'age', 'floatY', 'floatTime', 'restY'];

type Case = readonly [name: string, base: Json, mutation: Mutation];

/** Cas du corps d'un monde, appliqués au monde affiché (`path` vide) ou à un autre. */
function worldCases(prefix: string, base: Json, path: readonly (string | number)[]): Case[] {
  const at = (key: string | number, value: unknown): Mutation => setIn([...path, key], value);
  const rm = (key: string): Mutation => removeIn([...path, key]);
  const fishAt = (i: number, key: string, value: unknown): Mutation =>
    setIn([...path, 'fish', i, key], value);
  const foodAt = (i: number, key: string, value: unknown): Mutation =>
    setIn([...path, 'food', i, key], value);
  const c = (name: string, mutation: Mutation): Case => [`${prefix}${name}`, base, mutation];
  let body = base as Record<string | number, unknown>;
  for (const key of path) {
    body = body[key] as Record<string | number, unknown>;
  }
  const { x, y, z } = positionOf((body['fish'] as Json[])[0] as Json);
  return [
    c('seed absente', rm('seed')),
    c('seed négative', at('seed', -1)),
    c('seed 2^32', at('seed', 2 ** 32)),
    c('seed texte', at('seed', '1')),
    c('environnement inconnu', at('environment', 'lune')),
    c('environnement absent', rm('environment')),
    c('dimensions valides', at('dimensions', { width: 0.8, height: 0.45, depth: 0.4 })),
    c('dimensions hors bornes', at('dimensions', { width: 99, height: 0.01, depth: 0.4 })),
    c('dimensions texte', at('dimensions', 'grand')),
    c('dimensions incomplètes', at('dimensions', { width: 0.8, height: 0.45 })),
    c('dimensions infinies', at('dimensions', { width: 0.8, height: 0.45, depth: null })),
    c('shape rectangle', at('shape', 'rectangle')),
    c('shape inconnue', at('shape', 'étoile')),
    c('shape haricot', at('shape', 'haricot')),
    c('tick absent', rm('tick')),
    c('tick négatif', at('tick', -1)),
    c('tick 2^31', at('tick', 2 ** 31)),
    c('tick 2^31 + 1', at('tick', 2 ** 31 + 1)),
    c('tick réel', at('tick', 1.5)),
    c('nextFishId absent', rm('nextFishId')),
    c('nextFishId 2^32', at('nextFishId', 2 ** 32)),
    c('nextFoodId négatif', at('nextFoodId', -1)),
    c('nextFoodId réel', at('nextFoodId', 2.5)),
    c('decor texte', at('decor', 'rochers')),
    c(
      'decor trop long',
      at(
        'decor',
        Array.from({ length: 65 }, () => ({})),
      ),
    ),
    c('decor vide', at('decor', [])),
    c('decor invalide', at('decor', [{ kind: 'licorne' }])),
    c('careMode decor', at('careMode', 'decor')),
    c('careMode inconnu', at('careMode', 'libre')),
    c('current fort', at('current', 'fort')),
    c('current coupe', at('current', 'coupe')),
    c('current inconnu', at('current', 7)),
    c('fish texte', at('fish', 'nemo')),
    c('fish vide', at('fish', [])),
    c(
      'fish trop',
      at(
        'fish',
        Array.from({ length: 999 }, () => ({})),
      ),
    ),
    c('poisson id absent', fishAt(0, 'id', undefined)),
    c('poisson pas objet', setIn([...path, 'fish', 0], 3)),
    c('poisson id réel', fishAt(0, 'id', 0.5)),
    c('poisson espèce inconnue', fishAt(0, 'species', 'dragon')),
    c('poisson espèce absente', fishAt(0, 'species', undefined)),
    c('poisson espèce d’un autre lieu', fishAt(0, 'species', 'koi')),
    ...FISH_KEYS.map((key) => c(`poisson ${key} absent`, fishAt(0, key, undefined))),
    ...FISH_KEYS.map((key) => c(`poisson ${key} infini`, fishAt(0, key, null))),
    c('poisson health absente', fishAt(0, 'health', undefined)),
    c('poisson health texte', fishAt(0, 'health', '1')),
    c('poisson health basse', fishAt(0, 'health', -1)),
    c('poisson health haute', fishAt(0, 'health', 1.5)),
    c('poisson x hors zone', fishAt(0, 'x', 50)),
    c('poisson px hors zone', fishAt(0, 'px', 50)),
    c('poisson yaw 4', fishAt(0, 'yaw', 4)),
    c('poisson yaw π', fishAt(0, 'yaw', Math.PI)),
    c('poisson yaw π+ε', fishAt(0, 'yaw', Math.PI + 1e-13)),
    c('poisson yaw π+1e-11', fishAt(0, 'yaw', Math.PI + 1e-11)),
    c('poisson pyaw 4', fishAt(0, 'pyaw', 4)),
    c('poisson pitch 3', fishAt(0, 'pitch', 3)),
    c('poisson ppitch 3', fishAt(0, 'ppitch', 3)),
    c('poisson pitchTarget 3', fishAt(0, 'pitchTarget', 3)),
    c('poisson speed 99', fishAt(0, 'speed', 99)),
    c('poisson turn 99', fishAt(0, 'turn', 99)),
    c('poisson phase -1', fishAt(0, 'phase', -1)),
    c('poisson phase 7', fishAt(0, 'phase', 7)),
    c('poisson pphase 7', fishAt(0, 'pphase', 7)),
    c('poisson ascent -1', fishAt(0, 'ascent', -1)),
    c('poisson ascent 4000', fishAt(0, 'ascent', 4000)),
    c('poisson hunger 2', fishAt(0, 'hunger', 2)),
    c('poisson rng réel', fishAt(0, 'rng', 0.5)),
    c('poisson rng 2^32', fishAt(0, 'rng', 2 ** 32)),
    c('poisson ich 0', fishAt(0, 'ich', 0)),
    c('poisson ich -1', fishAt(0, 'ich', -1)),
    c('poisson finRot 0', fishAt(0, 'finRot', 0)),
    c('poisson finRot texte', fishAt(0, 'finRot', 'x')),
    c('poisson velvet 0', fishAt(0, 'velvet', 0)),
    c('poisson fungus 0', fishAt(0, 'fungus', 0)),
    c('poisson dropsy 0', fishAt(0, 'dropsy', 0)),
    c('poisson dropsy 1e9', fishAt(0, 'dropsy', 1e9)),
    c('poisson growth 0', fishAt(0, 'growth', 0)),
    c('poisson growth -1', fishAt(0, 'growth', -1)),
    c('poisson ordre : id avant species', all(fishAt(0, 'id', -1), fishAt(0, 'species', 'x'))),
    c('poisson ordre : species avant x', all(fishAt(0, 'species', 'x'), fishAt(0, 'x', null))),
    c('poisson ordre : x avant health', all(fishAt(0, 'x', null), fishAt(0, 'health', 'x'))),
    c(
      'poisson ordre : hunger avant health',
      all(fishAt(0, 'hunger', null), fishAt(0, 'health', 'x')),
    ),
    c('poisson ordre : health avant rng', all(fishAt(0, 'health', 'x'), fishAt(0, 'rng', null))),
    c('poisson ordre : pphase avant ich', all(fishAt(0, 'pphase', null), fishAt(0, 'ich', -1))),
    c('poisson ordre : ich avant finRot', all(fishAt(0, 'ich', -1), fishAt(0, 'finRot', -1))),
    c('poisson ordre : dropsy avant growth', all(fishAt(0, 'dropsy', -1), fishAt(0, 'growth', -1))),
    c('poisson ordre : growth avant x', all(fishAt(0, 'growth', -1), fishAt(0, 'x', 50))),
    c('poisson ordre : x avant yaw', all(fishAt(0, 'x', 50), fishAt(0, 'yaw', 9))),
    c(
      'poisson ordre : hunger avant health (bornes)',
      all(fishAt(0, 'hunger', 2), fishAt(0, 'health', 2)),
    ),
    c(
      'poisson ordre : health avant rng (bornes)',
      all(fishAt(0, 'health', 2), fishAt(0, 'rng', 0.5)),
    ),
    c('poissons ids égaux', fishAt(1, 'id', 0)),
    c('poisson id ≥ nextFishId', fishAt(0, 'id', 10_000)),
    c('poissons tous invalides', setIn([...path, 'fish'], [1, 2, 3, 4, 5, 6, 7])),
    c('food texte', at('food', 'miettes')),
    c('food vide', at('food', [])),
    c(
      'food trop',
      at(
        'food',
        Array.from({ length: 999 }, () => ({})),
      ),
    ),
    c('granulé pas objet', setIn([...path, 'food', 0], null)),
    ...FOOD_KEYS.map((key) => c(`granulé ${key} absent`, foodAt(0, key, undefined))),
    c('granulé id réel', foodAt(0, 'id', 0.5)),
    c('granulé id ≥ nextFoodId', foodAt(0, 'id', 1e6)),
    c('granulé hors de l’eau', foodAt(0, 'x', 50)),
    c('granulé floatY haut', foodAt(0, 'floatY', 50)),
    c('granulé restY haut', foodAt(0, 'restY', 50)),
    c('granulé vy positive', foodAt(0, 'vy', 1)),
    c('granulé vy rapide', foodAt(0, 'vy', -99)),
    c('granulé age négatif', foodAt(0, 'age', -1)),
    c('granulé floatTime 0', foodAt(0, 'floatTime', 0)),
    c('granulé ordre : id avant position', all(foodAt(0, 'id', -1), foodAt(0, 'x', 50))),
    c('granulés en double', setIn([...path, 'food', 1, 'id'], -5)),
    c('eggs texte', at('eggs', 'œufs')),
    c('eggs vide', at('eggs', [])),
    c(
      'eggs trop',
      at(
        'eggs',
        Array.from({ length: 31 }, () => ({})),
      ),
    ),
    c('œuf pas objet', at('eggs', [3])),
    c('œuf espèce sans œufs', at('eggs', [{ species: 'neon', x, y, z }])),
    c('œuf espèce inconnue', at('eggs', [{ species: 7 }])),
    c('œuf hors de l’eau', at('eggs', [{ species: 'corydora', x: 50, y, z }])),
    c('œuf position texte', at('eggs', [{ species: 'corydora', x: String(x), y, z }])),
    c('œuf âge', at('eggs', [{ species: 'corydora', x, y, z, age: 180, surface: 'vitre' }])),
    c('œuf surface', at('eggs', [{ species: 'corydora', x, y, z, age: 0, surface: 'toit' }])),
    c(
      'œufs valides',
      at('eggs', [
        { species: 'clown', x, y, z, age: 0, surface: 'rocher', extra: 1 },
        { species: 'rouge', x, y, z, age: 179, surface: 'plante' },
      ]),
    ),
    c('maintenance texte', at('maintenance', 'x')),
    c('waterHistory texte', at('waterHistory', 'x')),
    c('journal texte', at('journal', 'x')),
    c('firstTankPath texte', at('firstTankPath', 'x')),
    c('feeder texte', at('feeder', 'x')),
    c('feeder valide', at('feeder', { hours: [18, 9], stock: 3 })),
    c('feeder heures', at('feeder', { hours: [25], stock: 3 })),
    c('mortality true', at('mortality', true)),
    c('mortality false', at('mortality', false)),
    c('mortality texte', at('mortality', 'oui')),
    c('dead texte', at('dead', 'x')),
    c('dead vide', at('dead', [])),
    c('water texte', at('water', 'x')),
    c('water sans pH', removeIn([...path, 'water', 'ph'])),
    c('water température', setIn([...path, 'water', 'temperature'], 99)),
    c(
      'ordre : seed, dimensions, tick, compteurs',
      all(
        at('seed', -1),
        at('dimensions', 'x'),
        at('tick', -1),
        at('nextFishId', -1),
        at('nextFoodId', -1),
      ),
    ),
    c(
      'ordre : decor, careMode, current, fish, food',
      all(
        at('decor', 'x'),
        at('careMode', 'x'),
        at('current', 'x'),
        at('fish', 'x'),
        at('food', 'x'),
      ),
    ),
    c(
      'ordre : food, eggs, maintenance, waterHistory, journal',
      all(
        at('food', 'x'),
        at('eggs', 'x'),
        at('maintenance', 'x'),
        at('waterHistory', 'x'),
        at('journal', 'x'),
      ),
    ),
    c(
      'ordre : journal, firstTankPath, feeder, mortality, dead, water',
      all(
        at('journal', 'x'),
        at('firstTankPath', 'x'),
        at('feeder', 'x'),
        at('mortality', 'x'),
        at('dead', 'x'),
        at('water', 'x'),
      ),
    ),
    c(
      'ordre : firstTankPath, feeder, mortality, dead, water',
      all(
        at('firstTankPath', 'x'),
        at('feeder', 'x'),
        at('mortality', 'x'),
        at('dead', 'x'),
        at('water', 'x'),
      ),
    ),
  ];
}

/** Cas qui ne valent que pour le monde affiché d'une sauvegarde riche. */
function richCases(): Case[] {
  const rich = mutated(TROPICAL, RICH_EXTRAS);
  const c = (name: string, mutation: Mutation): Case => [`riche : ${name}`, rich, mutation];
  const fry = fishWhere(TROPICAL, (s) => ['guppy', 'platy', 'molly', 'corydora'].includes(s));
  const noFry = fishWhere(TROPICAL, (s) => !['guppy', 'platy', 'molly', 'corydora'].includes(s));
  return [
    c('telle quelle', () => undefined),
    c('corps deadFor négatif', setIn(['dead', 0, 'deadFor'], -1)),
    c('corps deadFor absent', setIn(['dead', 0, 'deadFor'], undefined)),
    c('corps id vivant', setIn(['dead', 0, 'id'], fishOf(TROPICAL)[0]?.['id'])),
    c('corps espèce inconnue', setIn(['dead', 0, 'species'], 'dragon')),
    c('corps pas objet', setIn(['dead', 0], 'x')),
    // Liste plus longue que `MAX_TOTAL_FISH` (#756) : refusée avant de lire ses corps.
    c(
      'corps trop',
      setIn(
        ['dead'],
        Array.from({ length: 999 }, () => ({})),
      ),
    ),
    [
      'riche : distributeur au bassin',
      WITH_OTHERS,
      setIn(['others', 0, 'feeder'], { hours: [9], stock: 1 }),
    ],
    c('alevin d’une espèce à alevins', setIn(['fish', Math.max(fry, 0), 'growth'], 10)),
    c('alevin d’une espèce sans alevins', setIn(['fish', Math.max(noFry, 0), 'growth'], 10)),
    c('alevin âge 1e9', setIn(['fish', Math.max(fry, 0), 'growth'], 1e9)),
    c('ich 1', setIn(['fish', 0, 'ich'], 1)),
    c('sans eau', remove('water')),
    c('trop de néons', (data) => {
      const fish = fishOf(data);
      const neon = fish.find((f) => f['species'] === 'neon') as Json;
      const next = data['nextFishId'] as number;
      const extra = Array.from({ length: 30 }, (_, i) => ({ ...neon, id: next + 1 + i }));
      data['fish'] = [...fish, ...extra];
      data['nextFishId'] = next + 100;
    }),
    c('espèce au nom long', setIn(['fish', 0, 'species'], 'x'.repeat(40))),
    c('espèce objet', setIn(['fish', 0, 'species'], { nom: 'x' })),
    c(
      'mode décor : espèce d’ailleurs',
      all(set('careMode', 'decor'), setIn(['fish', 0, 'species'], 'koi')),
    ),
  ];
}

function settingsCases(base: Json, prefix: string): Case[] {
  const c = (name: string, mutation: Mutation): Case => [`${prefix}${name}`, base, mutation];
  const at = (path: string[], value: unknown): Mutation => setIn(['settings', ...path], value);
  return [
    c('settings absents', remove('settings')),
    c('settings tableau', set('settings', [])),
    c('vitesse inconnue', at(['speed'], 3)),
    c('vitesse texte', at(['speed'], '1')),
    c('vitesse 0', at(['speed'], 0)),
    c('horloge absente', at(['clock'], undefined)),
    c('horloge texte', at(['clock'], 'midi')),
    c('heure 24', at(['clock', 'startHour'], 24)),
    c('heure 23.99', at(['clock', 'startHour'], 23.99)),
    c('heure -1', at(['clock', 'startHour'], -1)),
    c('journée 59', at(['clock', 'dayLengthSeconds'], 59)),
    c('journée 86400', at(['clock', 'dayLengthSeconds'], 86_400)),
    c('frozen texte', at(['clock', 'frozen'], 'non')),
    c('foodStyle inconnu', at(['foodStyle'], 'cubes')),
    c('foodStyle absent', at(['foodStyle'], undefined)),
    c('room absente', at(['room'], undefined)),
    c('room texte', at(['room'], 'salon')),
    c('room texte et vitesse', all(at(['room'], 'salon'), at(['speed'], 3))),
    c('room et horloge', all(at(['room'], 'salon'), at(['clock'], 'x'))),
    c(
      'ordre : vitesse, heure, journée, frozen, foodStyle',
      all(
        at(['speed'], 3),
        at(['clock', 'startHour'], 30),
        at(['clock', 'dayLengthSeconds'], 1),
        at(['clock', 'frozen'], 1),
        at(['foodStyle'], 'x'),
      ),
    ),
  ];
}

function documentCases(): Case[] {
  const c = (name: string, mutation: Mutation): Case => [`schéma 1 : ${name}`, TROPICAL, mutation];
  return [
    ...ENVIRONMENT_IDS.map((id): Case => [
      `réelle ${id}`,
      JSON.parse(serializeWorld(realWorld(id))) as Json,
      () => undefined,
    ]),
    ['réelle avec others', WITH_OTHERS, () => undefined],
    c('format absent', remove('format')),
    c('format autre', set('format', 'aquarium')),
    c('schéma 3', set('schema', 3)),
    c('schéma texte', set('schema', '1')),
    c('schéma absent', remove('schema')),
    c('environnement inconnu', set('environment', 'mars')),
    c('ordre : seed avant settings', all(set('seed', -1), remove('settings'))),
    c('ordre : nextFoodId avant settings', all(set('nextFoodId', -1), remove('settings'))),
    c('ordre : settings avant decor', all(remove('settings'), set('decor', 'x'))),
    c('ordre : settings avant others', all(remove('settings'), set('others', 'x'))),
    c('ordre : water avant others', all(set('water', 'x'), set('others', 'x'))),
    c('environnement inconnu et settings', all(set('environment', 'x'), remove('settings'))),
    c('others vide', set('others', [])),
    c('others texte', set('others', 'x')),
    c('others trop', set('others', [1, 2, 3, 4, 5])),
    ['others : pas objet', WITH_OTHERS, setIn(['others', 0], 3)],
    [
      'others : en double du monde affiché',
      WITH_OTHERS,
      setIn(['others', 0, 'environment'], 'tropical'),
    ],
    [
      'others : deux fois le même',
      WITH_OTHERS,
      setIn(['others', 1], (WITH_OTHERS['others'] as Json[])[0]),
    ],
    ['others : environnement inconnu', WITH_OTHERS, setIn(['others', 0, 'environment'], 'x')],
    ['others : seed invalide', WITH_OTHERS, setIn(['others', 0, 'seed'], -1)],
    [
      'others : deux invalides',
      WITH_OTHERS,
      all(setIn(['others', 0, 'seed'], -1), setIn(['others', 1, 'tick'], -1)),
    ],
    ...settingsCases(TROPICAL, 'schéma 1 : '),
  ];
}

function roomCases(): Case[] {
  const c = (name: string, mutation: Mutation): Case => [`schéma 2 : ${name}`, ROOM, mutation];
  const tank = (i: number, key: string, value: unknown): Mutation =>
    setIn(['tanks', i, key], value);
  const tanks = ROOM['tanks'] as Json[];
  const supports = [
    { id: 0, kind: 'commode', x: -1.5, z: -1.5, quarter: 0 },
    { id: 1, kind: 'commode', x: 1.5, z: -1.5, quarter: 0 },
  ];
  return [
    c('réelle', () => undefined),
    c('schéma 4', set('schema', 4)),
    c('seed', set('seed', -1)),
    c('tick', set('tick', 2 ** 32)),
    c('nextTankId', set('nextTankId', 'x')),
    c('selectedTankId texte', set('selectedTankId', 'x')),
    c('selectedTankId absent', remove('selectedTankId')),
    c('selectedTankId inconnu', set('selectedTankId', 99)),
    c('tanks texte', set('tanks', 'x')),
    c('tanks vide', set('tanks', [])),
    c(
      'tanks trop',
      set(
        'tanks',
        Array.from({ length: 99 }, () => ({})),
      ),
    ),
    c('bac pas objet', setIn(['tanks', 0], 3)),
    c('bac id', tank(0, 'id', -1)),
    c('bac nom vide', tank(0, 'name', '  ')),
    c('bac nom long', tank(0, 'name', 'x'.repeat(200))),
    c('bac nom absent', tank(0, 'name', undefined)),
    c('bac world texte', tank(0, 'world', 'x')),
    c('bac world invalide', setIn(['tanks', 0, 'world', 'seed'], -1)),
    c('bac place fausse', tank(0, 'place', 'jardin')),
    c('bac place absente', tank(0, 'place', undefined)),
    c('bac placement texte', tank(0, 'placement', 'x')),
    c('format absent', remove('format')),
    c('schéma 1 invalide', all(set('schema', 1), set('environment', 'x'))),
    c('deux bacs au jardin', setIn(['tanks', 2, 'place'], 'jardin')),
    c('deux bassins au jardin', (data) => {
      const garden = tanks.find((t) => t['place'] === 'jardin');
      const id = data['nextTankId'] as number;
      (data['tanks'] as Json[]).push({ ...garden, id, name: 'Bassin 2' });
      data['nextTankId'] = id + 1;
    }),
    c('placement au jardin', tank(1, 'placement', { supportId: null, x: 0.5, z: -1, quarter: 1 })),
    c('world trop volumineux', setIn(['tanks', 0, 'world', 'remplissage'], 'x'.repeat(256 * 1024))),
    c('bac placement valide', tank(0, 'placement', { supportId: null, x: 0.5, z: -1, quarter: 1 })),
    c(
      'bac placement niveau',
      tank(0, 'placement', { supportId: null, x: 0.5, z: -1, quarter: 1, level: 1 }),
    ),
    c(
      'bac placement invalide',
      tank(0, 'placement', { supportId: 'x', x: 0.123, z: 'x', quarter: 7, level: 9 }),
    ),
    c('bac placement x seul', tank(0, 'placement', { supportId: 3, x: 0.123, z: 0, quarter: 0 })),
    c('bacs ids égaux', tank(1, 'id', tanks[0]?.['id'])),
    c('bac id ≥ nextTankId', all(tank(tanks.length - 1, 'id', 50), set('nextTankId', 40))),
    c('furniture texte', set('furniture', 'x')),
    c('furniture sans compteur', set('furniture', supports)),
    c('furniture valide', all(set('furniture', supports), set('nextFurnitureId', 2))),
    c('furniture vide', set('furniture', [])),
    c(
      'furniture trop',
      set(
        'furniture',
        Array.from({ length: 99 }, () => ({})),
      ),
    ),
    c('meuble pas objet', all(set('furniture', [3]), set('nextFurnitureId', 2))),
    c(
      'meuble invalide',
      all(
        set('furniture', [{ id: 0, kind: 'x', x: 0, z: 0, quarter: 0 }]),
        set('nextFurnitureId', 2),
      ),
    ),
    c('nextFurnitureId texte', set('nextFurnitureId', 'x')),
    c('nextFurnitureId seul', set('nextFurnitureId', 4)),
    c(
      'ordre : seed, tick, nextTankId, selectedTankId, settings',
      all(
        set('seed', -1),
        set('tick', -1),
        set('nextTankId', -1),
        set('selectedTankId', -1),
        remove('settings'),
      ),
    ),
    c(
      'ordre : settings, tanks, furniture, nextFurnitureId',
      all(
        remove('settings'),
        set('tanks', 'x'),
        set('furniture', 'x'),
        set('nextFurnitureId', 'x'),
      ),
    ),
    c('ordre : bac, puis compteur', all(tank(0, 'name', ''), set('nextTankId', 0))),
    ...settingsCases(ROOM, 'schéma 2 : '),
  ];
}

const CASES: readonly Case[] = [
  ...documentCases(),
  ...worldCases('monde : ', TROPICAL, []),
  ...worldCases('autre monde : ', WITH_OTHERS, ['others', 0]),
  ...worldCases('bac : ', ROOM, ['tanks', 0, 'world']),
  ...richCases(),
  ...roomCases(),
];

/** Résultat lisible : message d'un refus, ou empreintes du résultat et du texte réécrit. */
function outcome(base: Json, mutation: Mutation): string {
  const text = JSON.stringify(mutated(base, mutation));
  if (base['schema'] === 1) {
    const result = parseWorld(text);
    if (!result.ok) {
      return `refus : ${result.error}`;
    }
    const rewritten = serializeWorld(result.world, result.settings, result.others);
    return `ok ${fingerprint(JSON.stringify(result))} ${fingerprint(rewritten)}`;
  }
  const result = parseSave(text);
  if (!result.ok) {
    return `refus : ${result.error}`;
  }
  const rewritten = serializeRoom(result.room, result.selectedTankId, result.settings);
  return `ok ${fingerprint(JSON.stringify(result))} ${fingerprint(rewritten)}`;
}

/** Groupes de cas, par préfixe de nom (chaque cas est dans exactement un groupe). */
const GROUPS = [
  'réelle',
  'others : ',
  'schéma 1 : ',
  'monde : ',
  'autre monde : ',
  'bac : ',
  'riche : ',
  'schéma 2 : ',
] as const;

const EXPECTED: Record<string, string> = {
  'réelle tropical': 'ok 791a041f 11832f16',
  'réelle bassin': 'ok 8a892ca1 d560a3f7',
  'réelle paludarium': 'ok 4881ed46 773fa7f6',
  'réelle recif': 'ok 4805dba2 f8848f2b',
  'réelle eaufroide': 'ok 8c4d388a 1b3bb30c',
  'réelle avec others': 'ok 1f48f7a0 a23a7777',
  'schéma 1 : format absent': 'refus : ce fichier n’est pas une sauvegarde aqfish',
  'schéma 1 : format autre': 'refus : ce fichier n’est pas une sauvegarde aqfish',
  'schéma 1 : schéma 3': 'refus : version de sauvegarde inconnue (3, version 1 attendue)',
  'schéma 1 : schéma texte': 'refus : version de sauvegarde inconnue (« 1 », version 1 attendue)',
  'schéma 1 : schéma absent':
    'refus : version de sauvegarde inconnue (absente, version 1 attendue)',
  'schéma 1 : environnement inconnu': 'refus : environnement inconnu (« mars »)',
  'schéma 1 : ordre : seed avant settings':
    'refus : seed doit être un entier 32 bits non signé ; settings doit être un objet',
  'schéma 1 : ordre : nextFoodId avant settings':
    'refus : nextFoodId doit être un entier positif ou nul ; settings doit être un objet ; granulé 0 : identifiant 0 ≥ nextFoodId ; granulé 1 : identifiant 1 ≥ nextFoodId ; granulé 2 : identifiant 2 ≥ nextFoodId ; …',
  'schéma 1 : ordre : settings avant decor':
    'refus : settings doit être un objet ; decor doit être une liste',
  'schéma 1 : ordre : settings avant others':
    'refus : settings doit être un objet ; others doit être une liste',
  'schéma 1 : ordre : water avant others':
    'refus : eau : doit être un objet ; others doit être une liste',
  'schéma 1 : environnement inconnu et settings': 'refus : environnement inconnu (« x »)',
  'schéma 1 : others vide': 'ok 791a041f 11832f16',
  'schéma 1 : others texte': 'refus : others doit être une liste',
  'schéma 1 : others trop': 'refus : trop d’autres environnements (5, 4 au plus)',
  'others : pas objet': 'refus : autre environnement 0 : doit être un objet',
  'others : en double du monde affiché': 'refus : autre environnement tropical : en double',
  'others : deux fois le même': 'refus : autre environnement bassin : en double',
  'others : environnement inconnu': 'refus : autre environnement 0 : environnement inconnu (« x »)',
  'others : seed invalide':
    'refus : autre environnement bassin : seed doit être un entier 32 bits non signé',
  'others : deux invalides':
    'refus : autre environnement bassin : seed doit être un entier 32 bits non signé ; autre environnement paludarium : tick doit être un entier dans [0, 2147483648]',
  'schéma 1 : settings absents': 'refus : settings doit être un objet',
  'schéma 1 : settings tableau': 'refus : settings doit être un objet',
  'schéma 1 : vitesse inconnue': 'refus : vitesse inconnue (3)',
  'schéma 1 : vitesse texte': 'refus : vitesse inconnue (« 1 »)',
  'schéma 1 : vitesse 0': 'ok ba4715f2 2b8e7f43',
  'schéma 1 : horloge absente':
    'refus : heure de l’horloge hors de [0, 24) ; durée de la journée hors de [60, 86400] s ; horloge : frozen doit être un booléen',
  'schéma 1 : horloge texte':
    'refus : heure de l’horloge hors de [0, 24) ; durée de la journée hors de [60, 86400] s ; horloge : frozen doit être un booléen',
  'schéma 1 : heure 24': 'refus : heure de l’horloge hors de [0, 24)',
  'schéma 1 : heure 23.99': 'ok 29d7337b 9c283b16',
  'schéma 1 : heure -1': 'refus : heure de l’horloge hors de [0, 24)',
  'schéma 1 : journée 59': 'refus : durée de la journée hors de [60, 86400] s',
  'schéma 1 : journée 86400': 'ok 9899bbde f21b83c3',
  'schéma 1 : frozen texte': 'refus : horloge : frozen doit être un booléen',
  'schéma 1 : foodStyle inconnu': 'refus : rendu des granulés inconnu (« cubes »)',
  'schéma 1 : foodStyle absent': 'ok 791a041f 11832f16',
  'schéma 1 : room absente': 'ok 791a041f 11832f16',
  'schéma 1 : room texte': 'refus : pièce : doit être un objet',
  'schéma 1 : room texte et vitesse': 'refus : vitesse inconnue (3) ; pièce : doit être un objet',
  'schéma 1 : room et horloge':
    'refus : heure de l’horloge hors de [0, 24) ; durée de la journée hors de [60, 86400] s ; horloge : frozen doit être un booléen ; pièce : doit être un objet',
  'schéma 1 : ordre : vitesse, heure, journée, frozen, foodStyle':
    'refus : vitesse inconnue (3) ; heure de l’horloge hors de [0, 24) ; durée de la journée hors de [60, 86400] s ; horloge : frozen doit être un booléen ; rendu des granulés inconnu (« x »)',
  'monde : seed absente': 'refus : seed doit être un entier 32 bits non signé',
  'monde : seed négative': 'refus : seed doit être un entier 32 bits non signé',
  'monde : seed 2^32': 'refus : seed doit être un entier 32 bits non signé',
  'monde : seed texte': 'refus : seed doit être un entier 32 bits non signé',
  'monde : environnement inconnu': 'refus : environnement inconnu (« lune »)',
  'monde : environnement absent': 'refus : environnement inconnu (absente)',
  'monde : dimensions valides':
    'refus : décor : élément 3 : x hors du bac (reçu : 0.47, bornes ± 0.4) ; élément 4 : x hors du bac (reçu : -0.5, bornes ± 0.4) ; élément 9 : x hors du bac (reçu : 0.52, bornes ± 0.4) ; poisson 3 : position hors de la zone de nage ; poisson 8 : position hors de la zone de nage ; poisson 15 : position hors de la zone de nage ; poisson 17 : position hors de la zone de nage ; …',
  'monde : dimensions hors bornes':
    'refus : granulé 0 : position hors de l’eau ; granulé 1 : position hors de l’eau ; granulé 2 : position hors de l’eau ; granulé 3 : position hors de l’eau ; granulé 4 : position hors de l’eau',
  'monde : dimensions texte': 'refus : dimensions doit être un objet',
  'monde : dimensions incomplètes': 'refus : dimensions : depth doit être un nombre fini',
  'monde : dimensions infinies': 'refus : dimensions : depth doit être un nombre fini',
  'monde : shape rectangle': 'ok 791a041f 11832f16',
  'monde : shape inconnue': 'refus : forme de bassin inconnue (« étoile »)',
  'monde : shape haricot': 'refus : forme non réglable dans l’environnement tropical',
  'monde : tick absent': 'refus : tick doit être un entier dans [0, 2147483648]',
  'monde : tick négatif': 'refus : tick doit être un entier dans [0, 2147483648]',
  'monde : tick 2^31': 'ok 76ba7bc8 ad0a3a17',
  'monde : tick 2^31 + 1': 'refus : tick doit être un entier dans [0, 2147483648]',
  'monde : tick réel': 'refus : tick doit être un entier dans [0, 2147483648]',
  'monde : nextFishId absent': 'refus : nextFishId doit être un entier 32 bits non signé',
  'monde : nextFishId 2^32': 'refus : nextFishId doit être un entier 32 bits non signé',
  'monde : nextFoodId négatif':
    'refus : nextFoodId doit être un entier positif ou nul ; granulé 0 : identifiant 0 ≥ nextFoodId ; granulé 1 : identifiant 1 ≥ nextFoodId ; granulé 2 : identifiant 2 ≥ nextFoodId ; granulé 3 : identifiant 3 ≥ nextFoodId ; …',
  'monde : nextFoodId réel':
    'refus : nextFoodId doit être un entier positif ou nul ; granulé 3 : identifiant 3 ≥ nextFoodId ; granulé 4 : identifiant 4 ≥ nextFoodId',
  'monde : decor texte': 'refus : decor doit être une liste',
  'monde : decor trop long': 'refus : trop d’éléments de décor (65, 64 au plus)',
  'monde : decor vide': 'ok 2368e9ba b8416d95',
  'monde : decor invalide':
    'refus : décor : élément 0 : kind inconnu : licorne ; élément 0 : x doit être un réel fini (reçu : undefined) ; élément 0 : z doit être un réel fini (reçu : undefined) ; élément 0 : rotation doit être un réel fini (reçu : undefined) ; élément 0 : scale doit être un réel fini (reçu : undefined) ; élément 0 : seed doit être un réel fini (reçu : undefined)',
  'monde : careMode decor': 'ok e5b5e282 679f6a83',
  'monde : careMode inconnu': 'refus : mode de bac inconnu (« libre »)',
  'monde : current fort': 'ok 4b8298d5 3af3732a',
  'monde : current coupe': 'refus : force de courant inconnue (« coupe »)',
  'monde : current inconnu': 'refus : force de courant inconnue (7)',
  'monde : fish texte': 'refus : fish doit être une liste',
  'monde : fish vide': 'ok 05fac378 f2d7f8cd',
  'monde : fish trop': 'refus : trop de poissons (999, 60 au plus)',
  'monde : poisson id absent': 'refus : poisson 0 : id doit être un entier 32 bits non signé',
  'monde : poisson pas objet': 'refus : poisson 0 : doit être un objet',
  'monde : poisson id réel': 'refus : poisson 0 : id doit être un entier 32 bits non signé',
  'monde : poisson espèce inconnue': 'refus : poisson 0 : espèce inconnue (« dragon »)',
  'monde : poisson espèce absente': 'refus : poisson 0 : espèce inconnue (absente)',
  'monde : poisson espèce d’un autre lieu':
    'refus : poisson 0 : l’espèce koi ne vit pas dans l’environnement tropical',
  'monde : poisson x absent': 'refus : poisson 0 : x doit être un nombre fini',
  'monde : poisson y absent': 'refus : poisson 0 : y doit être un nombre fini',
  'monde : poisson z absent': 'refus : poisson 0 : z doit être un nombre fini',
  'monde : poisson yaw absent': 'refus : poisson 0 : yaw doit être un nombre fini',
  'monde : poisson pitch absent': 'refus : poisson 0 : pitch doit être un nombre fini',
  'monde : poisson speed absent': 'refus : poisson 0 : speed doit être un nombre fini',
  'monde : poisson turn absent': 'refus : poisson 0 : turn doit être un nombre fini',
  'monde : poisson pitchTarget absent': 'refus : poisson 0 : pitchTarget doit être un nombre fini',
  'monde : poisson phase absent': 'refus : poisson 0 : phase doit être un nombre fini',
  'monde : poisson ascent absent': 'refus : poisson 0 : ascent doit être un nombre fini',
  'monde : poisson hunger absent': 'refus : poisson 0 : hunger doit être un nombre fini',
  'monde : poisson rng absent': 'refus : poisson 0 : rng doit être un nombre fini',
  'monde : poisson px absent': 'refus : poisson 0 : px doit être un nombre fini',
  'monde : poisson py absent': 'refus : poisson 0 : py doit être un nombre fini',
  'monde : poisson pz absent': 'refus : poisson 0 : pz doit être un nombre fini',
  'monde : poisson pyaw absent': 'refus : poisson 0 : pyaw doit être un nombre fini',
  'monde : poisson ppitch absent': 'refus : poisson 0 : ppitch doit être un nombre fini',
  'monde : poisson pphase absent': 'refus : poisson 0 : pphase doit être un nombre fini',
  'monde : poisson x infini': 'refus : poisson 0 : x doit être un nombre fini',
  'monde : poisson y infini': 'refus : poisson 0 : y doit être un nombre fini',
  'monde : poisson z infini': 'refus : poisson 0 : z doit être un nombre fini',
  'monde : poisson yaw infini': 'refus : poisson 0 : yaw doit être un nombre fini',
  'monde : poisson pitch infini': 'refus : poisson 0 : pitch doit être un nombre fini',
  'monde : poisson speed infini': 'refus : poisson 0 : speed doit être un nombre fini',
  'monde : poisson turn infini': 'refus : poisson 0 : turn doit être un nombre fini',
  'monde : poisson pitchTarget infini': 'refus : poisson 0 : pitchTarget doit être un nombre fini',
  'monde : poisson phase infini': 'refus : poisson 0 : phase doit être un nombre fini',
  'monde : poisson ascent infini': 'refus : poisson 0 : ascent doit être un nombre fini',
  'monde : poisson hunger infini': 'refus : poisson 0 : hunger doit être un nombre fini',
  'monde : poisson rng infini': 'refus : poisson 0 : rng doit être un nombre fini',
  'monde : poisson px infini': 'refus : poisson 0 : px doit être un nombre fini',
  'monde : poisson py infini': 'refus : poisson 0 : py doit être un nombre fini',
  'monde : poisson pz infini': 'refus : poisson 0 : pz doit être un nombre fini',
  'monde : poisson pyaw infini': 'refus : poisson 0 : pyaw doit être un nombre fini',
  'monde : poisson ppitch infini': 'refus : poisson 0 : ppitch doit être un nombre fini',
  'monde : poisson pphase infini': 'refus : poisson 0 : pphase doit être un nombre fini',
  'monde : poisson health absente': 'ok 791a041f 11832f16',
  'monde : poisson health texte': 'refus : poisson 0 : health doit être un nombre fini',
  'monde : poisson health basse': 'refus : poisson 0 : health hors de [plancher, 1]',
  'monde : poisson health haute': 'refus : poisson 0 : health hors de [plancher, 1]',
  'monde : poisson x hors zone': 'refus : poisson 0 : position hors de la zone de nage',
  'monde : poisson px hors zone': 'refus : poisson 0 : position précédente hors de la zone de nage',
  'monde : poisson yaw 4': 'refus : poisson 0 : yaw hors de [-π, π]',
  'monde : poisson yaw π': 'ok d15e9adb 6ef5446a',
  'monde : poisson yaw π+ε': 'ok a746b710 04aa0f9f',
  'monde : poisson yaw π+1e-11': 'refus : poisson 0 : yaw hors de [-π, π]',
  'monde : poisson pyaw 4': 'refus : poisson 0 : pyaw hors de [-π, π]',
  'monde : poisson pitch 3': 'refus : poisson 0 : pitch hors bornes',
  'monde : poisson ppitch 3': 'refus : poisson 0 : ppitch hors bornes',
  'monde : poisson pitchTarget 3': 'refus : poisson 0 : pitchTarget hors bornes',
  'monde : poisson speed 99': 'refus : poisson 0 : vitesse hors bornes',
  'monde : poisson turn 99': 'refus : poisson 0 : turn hors bornes',
  'monde : poisson phase -1': 'refus : poisson 0 : phase hors de [0, 2π]',
  'monde : poisson phase 7': 'refus : poisson 0 : phase hors de [0, 2π]',
  'monde : poisson pphase 7': 'refus : poisson 0 : pphase hors de [0, 2π]',
  'monde : poisson ascent -1': 'refus : poisson 0 : ascent hors bornes',
  'monde : poisson ascent 4000': 'refus : poisson 0 : ascent hors bornes',
  'monde : poisson hunger 2': 'refus : poisson 0 : hunger hors de [0, 1]',
  'monde : poisson rng réel': 'refus : poisson 0 : rng doit être un entier 32 bits non signé',
  'monde : poisson rng 2^32': 'refus : poisson 0 : rng doit être un entier 32 bits non signé',
  'monde : poisson ich 0': 'ok de40a8f9 ce0ced28',
  'monde : poisson ich -1': 'refus : poisson 0 : ich hors de [0, 900]',
  'monde : poisson finRot 0': 'ok d5ecff23 1e3d038a',
  'monde : poisson finRot texte': 'refus : poisson 0 : finRot hors de [0, 1200]',
  'monde : poisson velvet 0': 'ok 2fd67ea3 f20858ba',
  'monde : poisson fungus 0': 'ok fabf9c87 da7603e6',
  'monde : poisson dropsy 0': 'ok e51f7b30 a8a7284b',
  'monde : poisson dropsy 1e9': 'refus : poisson 0 : dropsy hors de [0, 2400]',
  'monde : poisson growth 0': 'refus : poisson 0 : l’espèce neon n’a pas d’alevins',
  'monde : poisson growth -1': 'refus : poisson 0 : l’espèce neon n’a pas d’alevins',
  'monde : poisson ordre : id avant species':
    'refus : poisson 0 : id doit être un entier 32 bits non signé',
  'monde : poisson ordre : species avant x': 'refus : poisson 0 : espèce inconnue (« x »)',
  'monde : poisson ordre : x avant health': 'refus : poisson 0 : x doit être un nombre fini',
  'monde : poisson ordre : hunger avant health':
    'refus : poisson 0 : hunger doit être un nombre fini',
  'monde : poisson ordre : health avant rng': 'refus : poisson 0 : health doit être un nombre fini',
  'monde : poisson ordre : pphase avant ich': 'refus : poisson 0 : pphase doit être un nombre fini',
  'monde : poisson ordre : ich avant finRot': 'refus : poisson 0 : ich hors de [0, 900]',
  'monde : poisson ordre : dropsy avant growth': 'refus : poisson 0 : dropsy hors de [0, 2400]',
  'monde : poisson ordre : growth avant x': 'refus : poisson 0 : l’espèce neon n’a pas d’alevins',
  'monde : poisson ordre : x avant yaw': 'refus : poisson 0 : position hors de la zone de nage',
  'monde : poisson ordre : hunger avant health (bornes)':
    'refus : poisson 0 : hunger hors de [0, 1]',
  'monde : poisson ordre : health avant rng (bornes)':
    'refus : poisson 0 : health hors de [plancher, 1]',
  'monde : poissons ids égaux': 'refus : poisson 1 : identifiants non strictement croissants',
  'monde : poisson id ≥ nextFishId':
    'refus : poisson 0 : identifiant 10000 ≥ nextFishId ; poisson 1 : identifiants non strictement croissants',
  'monde : poissons tous invalides':
    'refus : poisson 0 : doit être un objet ; poisson 1 : doit être un objet ; poisson 2 : doit être un objet ; poisson 3 : doit être un objet ; poisson 4 : doit être un objet ; …',
  'monde : food texte': 'refus : food doit être une liste',
  'monde : food vide': 'ok 15dda4ea 7ba1a119',
  'monde : food trop': 'refus : trop de granulés (999, 60 au plus)',
  'monde : granulé pas objet': 'refus : granulé 0 : doit être un objet',
  'monde : granulé id absent': 'refus : granulé 0 : id doit être un nombre fini',
  'monde : granulé x absent': 'refus : granulé 0 : x doit être un nombre fini',
  'monde : granulé y absent': 'refus : granulé 0 : y doit être un nombre fini',
  'monde : granulé z absent': 'refus : granulé 0 : z doit être un nombre fini',
  'monde : granulé vy absent': 'refus : granulé 0 : vy doit être un nombre fini',
  'monde : granulé age absent': 'refus : granulé 0 : age doit être un nombre fini',
  'monde : granulé floatY absent': 'refus : granulé 0 : floatY doit être un nombre fini',
  'monde : granulé floatTime absent': 'refus : granulé 0 : floatTime doit être un nombre fini',
  'monde : granulé restY absent': 'refus : granulé 0 : restY doit être un nombre fini',
  'monde : granulé id réel': 'refus : granulé 0 : id doit être un entier positif ou nul',
  'monde : granulé id ≥ nextFoodId': 'refus : granulé 0 : identifiant 1000000 ≥ nextFoodId',
  'monde : granulé hors de l’eau': 'refus : granulé 0 : position hors de l’eau',
  'monde : granulé floatY haut': 'refus : granulé 0 : floatY hors de l’eau',
  'monde : granulé restY haut': 'refus : granulé 0 : restY hors de [fond, floatY]',
  'monde : granulé vy positive': 'refus : granulé 0 : vy hors bornes',
  'monde : granulé vy rapide': 'refus : granulé 0 : vy hors bornes',
  'monde : granulé age négatif': 'refus : granulé 0 : age hors bornes',
  'monde : granulé floatTime 0': 'refus : granulé 0 : floatTime hors bornes',
  'monde : granulé ordre : id avant position':
    'refus : granulé 0 : id doit être un entier positif ou nul',
  'monde : granulés en double': 'refus : granulé 1 : id doit être un entier positif ou nul',
  'monde : eggs texte': 'refus : eggs doit être une liste',
  'monde : eggs vide': 'ok 791a041f 11832f16',
  'monde : eggs trop': 'refus : trop d’œufs (31, 30 au plus)',
  'monde : œuf pas objet': 'refus : œuf 0 : doit être un objet',
  'monde : œuf espèce sans œufs': 'refus : œuf 0 : espèce sans œufs (« neon »)',
  'monde : œuf espèce inconnue': 'refus : œuf 0 : espèce sans œufs (7)',
  'monde : œuf hors de l’eau': 'refus : œuf 0 : position hors de l’eau',
  'monde : œuf position texte': 'refus : œuf 0 : position hors de l’eau',
  'monde : œuf âge': 'refus : œuf 0 : age hors de [0, 180[',
  'monde : œuf surface': 'refus : œuf 0 : surface inconnue (« toit »)',
  'monde : œufs valides': 'ok 5eff17d2 946fbd33',
  'monde : maintenance texte': 'refus : maintenance doit être un objet',
  'monde : waterHistory texte': 'refus : waterHistory doit être un objet',
  'monde : journal texte': 'refus : journal doit être un objet',
  'monde : firstTankPath texte': 'refus : firstTankPath doit être un objet',
  'monde : feeder texte': 'refus : feeder doit être un objet',
  'monde : feeder valide': 'ok 6afc3c32 e5a73465',
  'monde : feeder heures': 'refus : feeder.hours doit lister 1 à 4 heures distinctes dans [0, 23]',
  'monde : mortality true': 'ok 8ce06026 cc161c67',
  'monde : mortality false': 'refus : mortality doit valoir true (reçu : false)',
  'monde : mortality texte': 'refus : mortality doit valoir true (reçu : « oui »)',
  'monde : dead texte': 'refus : dead doit être une liste',
  'monde : dead vide': 'ok 791a041f 11832f16',
  'monde : water texte': 'refus : eau : doit être un objet',
  'monde : water sans pH': 'ok 2207aa5b 7c7f99ea',
  'monde : water température': 'refus : eau : temperature doit être un nombre dans [0, 40]',
  'monde : ordre : seed, dimensions, tick, compteurs':
    'refus : seed doit être un entier 32 bits non signé ; dimensions doit être un objet ; tick doit être un entier dans [0, 2147483648] ; nextFishId doit être un entier 32 bits non signé ; nextFoodId doit être un entier positif ou nul ; …',
  'monde : ordre : decor, careMode, current, fish, food':
    'refus : decor doit être une liste ; mode de bac inconnu (« x ») ; force de courant inconnue (« x ») ; fish doit être une liste ; food doit être une liste',
  'monde : ordre : food, eggs, maintenance, waterHistory, journal':
    'refus : food doit être une liste ; eggs doit être une liste ; maintenance doit être un objet ; waterHistory doit être un objet ; journal doit être un objet',
  'monde : ordre : journal, firstTankPath, feeder, mortality, dead, water':
    'refus : journal doit être un objet ; firstTankPath doit être un objet ; feeder doit être un objet ; mortality doit valoir true (reçu : « x ») ; dead doit être une liste ; …',
  'monde : ordre : firstTankPath, feeder, mortality, dead, water':
    'refus : firstTankPath doit être un objet ; feeder doit être un objet ; mortality doit valoir true (reçu : « x ») ; dead doit être une liste ; eau : doit être un objet',
  'autre monde : seed absente':
    'refus : autre environnement bassin : seed doit être un entier 32 bits non signé',
  'autre monde : seed négative':
    'refus : autre environnement bassin : seed doit être un entier 32 bits non signé',
  'autre monde : seed 2^32':
    'refus : autre environnement bassin : seed doit être un entier 32 bits non signé',
  'autre monde : seed texte':
    'refus : autre environnement bassin : seed doit être un entier 32 bits non signé',
  'autre monde : environnement inconnu':
    'refus : autre environnement 0 : environnement inconnu (« lune »)',
  'autre monde : environnement absent':
    'refus : autre environnement 0 : environnement inconnu (absente)',
  'autre monde : dimensions valides':
    'refus : autre environnement bassin : dimensions non réglables dans l’environnement bassin',
  'autre monde : dimensions hors bornes':
    'refus : autre environnement bassin : dimensions non réglables dans l’environnement bassin',
  'autre monde : dimensions texte':
    'refus : autre environnement bassin : dimensions non réglables dans l’environnement bassin',
  'autre monde : dimensions incomplètes':
    'refus : autre environnement bassin : dimensions non réglables dans l’environnement bassin',
  'autre monde : dimensions infinies':
    'refus : autre environnement bassin : dimensions non réglables dans l’environnement bassin',
  'autre monde : shape rectangle': 'ok 1f48f7a0 a23a7777',
  'autre monde : shape inconnue':
    'refus : autre environnement bassin : forme de bassin inconnue (« étoile »)',
  'autre monde : shape haricot': 'ok 4538b9e1 58f6eb24',
  'autre monde : tick absent':
    'refus : autre environnement bassin : tick doit être un entier dans [0, 2147483648]',
  'autre monde : tick négatif':
    'refus : autre environnement bassin : tick doit être un entier dans [0, 2147483648]',
  'autre monde : tick 2^31': 'ok 4151670b 2d74eca2',
  'autre monde : tick 2^31 + 1':
    'refus : autre environnement bassin : tick doit être un entier dans [0, 2147483648]',
  'autre monde : tick réel':
    'refus : autre environnement bassin : tick doit être un entier dans [0, 2147483648]',
  'autre monde : nextFishId absent':
    'refus : autre environnement bassin : nextFishId doit être un entier 32 bits non signé',
  'autre monde : nextFishId 2^32':
    'refus : autre environnement bassin : nextFishId doit être un entier 32 bits non signé',
  'autre monde : nextFoodId négatif':
    'refus : autre environnement bassin : nextFoodId doit être un entier positif ou nul ; autre environnement bassin : granulé 0 : identifiant 0 ≥ nextFoodId ; autre environnement bassin : granulé 1 : identifiant 1 ≥ nextFoodId ; autre environnement bassin : granulé 2 : identifiant 2 ≥ nextFoodId ; autre environnement bassin : granulé 3 : identifiant 3 ≥ nextFoodId ; …',
  'autre monde : nextFoodId réel':
    'refus : autre environnement bassin : nextFoodId doit être un entier positif ou nul ; autre environnement bassin : granulé 3 : identifiant 3 ≥ nextFoodId ; autre environnement bassin : granulé 4 : identifiant 4 ≥ nextFoodId',
  'autre monde : decor texte': 'refus : autre environnement bassin : decor doit être une liste',
  'autre monde : decor trop long':
    'refus : autre environnement bassin : trop d’éléments de décor (65, 64 au plus)',
  'autre monde : decor vide': 'ok b2790333 ac1c45fa',
  'autre monde : decor invalide':
    'refus : autre environnement bassin : décor : élément 0 : kind inconnu : licorne ; élément 0 : x doit être un réel fini (reçu : undefined) ; élément 0 : z doit être un réel fini (reçu : undefined) ; élément 0 : rotation doit être un réel fini (reçu : undefined) ; élément 0 : scale doit être un réel fini (reçu : undefined) ; élément 0 : seed doit être un réel fini (reçu : undefined)',
  'autre monde : careMode decor': 'ok c65e73d1 1ca5efb4',
  'autre monde : careMode inconnu':
    'refus : autre environnement bassin : mode de bac inconnu (« libre »)',
  'autre monde : current fort': 'ok 967c723c d68a0857',
  'autre monde : current coupe':
    'refus : autre environnement bassin : force de courant inconnue (« coupe »)',
  'autre monde : current inconnu':
    'refus : autre environnement bassin : force de courant inconnue (7)',
  'autre monde : fish texte': 'refus : autre environnement bassin : fish doit être une liste',
  'autre monde : fish vide': 'ok 44dd434d 61e1b570',
  'autre monde : fish trop':
    'refus : autre environnement bassin : trop de poissons (999, 60 au plus)',
  'autre monde : poisson id absent':
    'refus : autre environnement bassin : poisson 0 : id doit être un entier 32 bits non signé',
  'autre monde : poisson pas objet':
    'refus : autre environnement bassin : poisson 0 : doit être un objet',
  'autre monde : poisson id réel':
    'refus : autre environnement bassin : poisson 0 : id doit être un entier 32 bits non signé',
  'autre monde : poisson espèce inconnue':
    'refus : autre environnement bassin : poisson 0 : espèce inconnue (« dragon »)',
  'autre monde : poisson espèce absente':
    'refus : autre environnement bassin : poisson 0 : espèce inconnue (absente)',
  'autre monde : poisson espèce d’un autre lieu': 'ok 1f48f7a0 a23a7777',
  'autre monde : poisson x absent':
    'refus : autre environnement bassin : poisson 0 : x doit être un nombre fini',
  'autre monde : poisson y absent':
    'refus : autre environnement bassin : poisson 0 : y doit être un nombre fini',
  'autre monde : poisson z absent':
    'refus : autre environnement bassin : poisson 0 : z doit être un nombre fini',
  'autre monde : poisson yaw absent':
    'refus : autre environnement bassin : poisson 0 : yaw doit être un nombre fini',
  'autre monde : poisson pitch absent':
    'refus : autre environnement bassin : poisson 0 : pitch doit être un nombre fini',
  'autre monde : poisson speed absent':
    'refus : autre environnement bassin : poisson 0 : speed doit être un nombre fini',
  'autre monde : poisson turn absent':
    'refus : autre environnement bassin : poisson 0 : turn doit être un nombre fini',
  'autre monde : poisson pitchTarget absent':
    'refus : autre environnement bassin : poisson 0 : pitchTarget doit être un nombre fini',
  'autre monde : poisson phase absent':
    'refus : autre environnement bassin : poisson 0 : phase doit être un nombre fini',
  'autre monde : poisson ascent absent':
    'refus : autre environnement bassin : poisson 0 : ascent doit être un nombre fini',
  'autre monde : poisson hunger absent':
    'refus : autre environnement bassin : poisson 0 : hunger doit être un nombre fini',
  'autre monde : poisson rng absent':
    'refus : autre environnement bassin : poisson 0 : rng doit être un nombre fini',
  'autre monde : poisson px absent':
    'refus : autre environnement bassin : poisson 0 : px doit être un nombre fini',
  'autre monde : poisson py absent':
    'refus : autre environnement bassin : poisson 0 : py doit être un nombre fini',
  'autre monde : poisson pz absent':
    'refus : autre environnement bassin : poisson 0 : pz doit être un nombre fini',
  'autre monde : poisson pyaw absent':
    'refus : autre environnement bassin : poisson 0 : pyaw doit être un nombre fini',
  'autre monde : poisson ppitch absent':
    'refus : autre environnement bassin : poisson 0 : ppitch doit être un nombre fini',
  'autre monde : poisson pphase absent':
    'refus : autre environnement bassin : poisson 0 : pphase doit être un nombre fini',
  'autre monde : poisson x infini':
    'refus : autre environnement bassin : poisson 0 : x doit être un nombre fini',
  'autre monde : poisson y infini':
    'refus : autre environnement bassin : poisson 0 : y doit être un nombre fini',
  'autre monde : poisson z infini':
    'refus : autre environnement bassin : poisson 0 : z doit être un nombre fini',
  'autre monde : poisson yaw infini':
    'refus : autre environnement bassin : poisson 0 : yaw doit être un nombre fini',
  'autre monde : poisson pitch infini':
    'refus : autre environnement bassin : poisson 0 : pitch doit être un nombre fini',
  'autre monde : poisson speed infini':
    'refus : autre environnement bassin : poisson 0 : speed doit être un nombre fini',
  'autre monde : poisson turn infini':
    'refus : autre environnement bassin : poisson 0 : turn doit être un nombre fini',
  'autre monde : poisson pitchTarget infini':
    'refus : autre environnement bassin : poisson 0 : pitchTarget doit être un nombre fini',
  'autre monde : poisson phase infini':
    'refus : autre environnement bassin : poisson 0 : phase doit être un nombre fini',
  'autre monde : poisson ascent infini':
    'refus : autre environnement bassin : poisson 0 : ascent doit être un nombre fini',
  'autre monde : poisson hunger infini':
    'refus : autre environnement bassin : poisson 0 : hunger doit être un nombre fini',
  'autre monde : poisson rng infini':
    'refus : autre environnement bassin : poisson 0 : rng doit être un nombre fini',
  'autre monde : poisson px infini':
    'refus : autre environnement bassin : poisson 0 : px doit être un nombre fini',
  'autre monde : poisson py infini':
    'refus : autre environnement bassin : poisson 0 : py doit être un nombre fini',
  'autre monde : poisson pz infini':
    'refus : autre environnement bassin : poisson 0 : pz doit être un nombre fini',
  'autre monde : poisson pyaw infini':
    'refus : autre environnement bassin : poisson 0 : pyaw doit être un nombre fini',
  'autre monde : poisson ppitch infini':
    'refus : autre environnement bassin : poisson 0 : ppitch doit être un nombre fini',
  'autre monde : poisson pphase infini':
    'refus : autre environnement bassin : poisson 0 : pphase doit être un nombre fini',
  'autre monde : poisson health absente': 'ok 1f48f7a0 a23a7777',
  'autre monde : poisson health texte':
    'refus : autre environnement bassin : poisson 0 : health doit être un nombre fini',
  'autre monde : poisson health basse':
    'refus : autre environnement bassin : poisson 0 : health hors de [plancher, 1]',
  'autre monde : poisson health haute':
    'refus : autre environnement bassin : poisson 0 : health hors de [plancher, 1]',
  'autre monde : poisson x hors zone':
    'refus : autre environnement bassin : poisson 0 : position hors de la zone de nage',
  'autre monde : poisson px hors zone':
    'refus : autre environnement bassin : poisson 0 : position précédente hors de la zone de nage',
  'autre monde : poisson yaw 4':
    'refus : autre environnement bassin : poisson 0 : yaw hors de [-π, π]',
  'autre monde : poisson yaw π': 'ok 28be82a0 ae93c371',
  'autre monde : poisson yaw π+ε': 'ok 33483547 493eda80',
  'autre monde : poisson yaw π+1e-11':
    'refus : autre environnement bassin : poisson 0 : yaw hors de [-π, π]',
  'autre monde : poisson pyaw 4':
    'refus : autre environnement bassin : poisson 0 : pyaw hors de [-π, π]',
  'autre monde : poisson pitch 3':
    'refus : autre environnement bassin : poisson 0 : pitch hors bornes',
  'autre monde : poisson ppitch 3':
    'refus : autre environnement bassin : poisson 0 : ppitch hors bornes',
  'autre monde : poisson pitchTarget 3':
    'refus : autre environnement bassin : poisson 0 : pitchTarget hors bornes',
  'autre monde : poisson speed 99':
    'refus : autre environnement bassin : poisson 0 : vitesse hors bornes',
  'autre monde : poisson turn 99':
    'refus : autre environnement bassin : poisson 0 : turn hors bornes',
  'autre monde : poisson phase -1':
    'refus : autre environnement bassin : poisson 0 : phase hors de [0, 2π]',
  'autre monde : poisson phase 7':
    'refus : autre environnement bassin : poisson 0 : phase hors de [0, 2π]',
  'autre monde : poisson pphase 7':
    'refus : autre environnement bassin : poisson 0 : pphase hors de [0, 2π]',
  'autre monde : poisson ascent -1':
    'refus : autre environnement bassin : poisson 0 : ascent hors bornes',
  'autre monde : poisson ascent 4000':
    'refus : autre environnement bassin : poisson 0 : ascent hors bornes',
  'autre monde : poisson hunger 2':
    'refus : autre environnement bassin : poisson 0 : hunger hors de [0, 1]',
  'autre monde : poisson rng réel':
    'refus : autre environnement bassin : poisson 0 : rng doit être un entier 32 bits non signé',
  'autre monde : poisson rng 2^32':
    'refus : autre environnement bassin : poisson 0 : rng doit être un entier 32 bits non signé',
  'autre monde : poisson ich 0': 'ok 3220242a 880de671',
  'autre monde : poisson ich -1':
    'refus : autre environnement bassin : poisson 0 : ich hors de [0, 900]',
  'autre monde : poisson finRot 0': 'ok 8fec9a2e b23f2dbb',
  'autre monde : poisson finRot texte':
    'refus : autre environnement bassin : poisson 0 : finRot hors de [0, 1200]',
  'autre monde : poisson velvet 0': 'ok 76ce8c46 9d5d8d8b',
  'autre monde : poisson fungus 0': 'ok ca4e3f9e a6be9ca7',
  'autre monde : poisson dropsy 0': 'ok f6b60a0f 4ea71414',
  'autre monde : poisson dropsy 1e9':
    'refus : autre environnement bassin : poisson 0 : dropsy hors de [0, 2400]',
  'autre monde : poisson growth 0':
    'refus : autre environnement bassin : poisson 0 : l’espèce koi n’a pas d’alevins',
  'autre monde : poisson growth -1':
    'refus : autre environnement bassin : poisson 0 : l’espèce koi n’a pas d’alevins',
  'autre monde : poisson ordre : id avant species':
    'refus : autre environnement bassin : poisson 0 : id doit être un entier 32 bits non signé',
  'autre monde : poisson ordre : species avant x':
    'refus : autre environnement bassin : poisson 0 : espèce inconnue (« x »)',
  'autre monde : poisson ordre : x avant health':
    'refus : autre environnement bassin : poisson 0 : x doit être un nombre fini',
  'autre monde : poisson ordre : hunger avant health':
    'refus : autre environnement bassin : poisson 0 : hunger doit être un nombre fini',
  'autre monde : poisson ordre : health avant rng':
    'refus : autre environnement bassin : poisson 0 : health doit être un nombre fini',
  'autre monde : poisson ordre : pphase avant ich':
    'refus : autre environnement bassin : poisson 0 : pphase doit être un nombre fini',
  'autre monde : poisson ordre : ich avant finRot':
    'refus : autre environnement bassin : poisson 0 : ich hors de [0, 900]',
  'autre monde : poisson ordre : dropsy avant growth':
    'refus : autre environnement bassin : poisson 0 : dropsy hors de [0, 2400]',
  'autre monde : poisson ordre : growth avant x':
    'refus : autre environnement bassin : poisson 0 : l’espèce koi n’a pas d’alevins',
  'autre monde : poisson ordre : x avant yaw':
    'refus : autre environnement bassin : poisson 0 : position hors de la zone de nage',
  'autre monde : poisson ordre : hunger avant health (bornes)':
    'refus : autre environnement bassin : poisson 0 : hunger hors de [0, 1]',
  'autre monde : poisson ordre : health avant rng (bornes)':
    'refus : autre environnement bassin : poisson 0 : health hors de [plancher, 1]',
  'autre monde : poissons ids égaux':
    'refus : autre environnement bassin : poisson 1 : identifiants non strictement croissants',
  'autre monde : poisson id ≥ nextFishId':
    'refus : autre environnement bassin : poisson 0 : identifiant 10000 ≥ nextFishId ; autre environnement bassin : poisson 1 : identifiants non strictement croissants',
  'autre monde : poissons tous invalides':
    'refus : autre environnement bassin : poisson 0 : doit être un objet ; autre environnement bassin : poisson 1 : doit être un objet ; autre environnement bassin : poisson 2 : doit être un objet ; autre environnement bassin : poisson 3 : doit être un objet ; autre environnement bassin : poisson 4 : doit être un objet ; …',
  'autre monde : food texte': 'refus : autre environnement bassin : food doit être une liste',
  'autre monde : food vide': 'ok 61ecd0d5 b09770e2',
  'autre monde : food trop':
    'refus : autre environnement bassin : trop de granulés (999, 60 au plus)',
  'autre monde : granulé pas objet':
    'refus : autre environnement bassin : granulé 0 : doit être un objet',
  'autre monde : granulé id absent':
    'refus : autre environnement bassin : granulé 0 : id doit être un nombre fini',
  'autre monde : granulé x absent':
    'refus : autre environnement bassin : granulé 0 : x doit être un nombre fini',
  'autre monde : granulé y absent':
    'refus : autre environnement bassin : granulé 0 : y doit être un nombre fini',
  'autre monde : granulé z absent':
    'refus : autre environnement bassin : granulé 0 : z doit être un nombre fini',
  'autre monde : granulé vy absent':
    'refus : autre environnement bassin : granulé 0 : vy doit être un nombre fini',
  'autre monde : granulé age absent':
    'refus : autre environnement bassin : granulé 0 : age doit être un nombre fini',
  'autre monde : granulé floatY absent':
    'refus : autre environnement bassin : granulé 0 : floatY doit être un nombre fini',
  'autre monde : granulé floatTime absent':
    'refus : autre environnement bassin : granulé 0 : floatTime doit être un nombre fini',
  'autre monde : granulé restY absent':
    'refus : autre environnement bassin : granulé 0 : restY doit être un nombre fini',
  'autre monde : granulé id réel':
    'refus : autre environnement bassin : granulé 0 : id doit être un entier positif ou nul',
  'autre monde : granulé id ≥ nextFoodId':
    'refus : autre environnement bassin : granulé 0 : identifiant 1000000 ≥ nextFoodId',
  'autre monde : granulé hors de l’eau':
    'refus : autre environnement bassin : granulé 0 : position hors de l’eau',
  'autre monde : granulé floatY haut':
    'refus : autre environnement bassin : granulé 0 : floatY hors de l’eau',
  'autre monde : granulé restY haut':
    'refus : autre environnement bassin : granulé 0 : restY hors de [fond, floatY]',
  'autre monde : granulé vy positive':
    'refus : autre environnement bassin : granulé 0 : vy hors bornes',
  'autre monde : granulé vy rapide':
    'refus : autre environnement bassin : granulé 0 : vy hors bornes',
  'autre monde : granulé age négatif':
    'refus : autre environnement bassin : granulé 0 : age hors bornes',
  'autre monde : granulé floatTime 0':
    'refus : autre environnement bassin : granulé 0 : floatTime hors bornes',
  'autre monde : granulé ordre : id avant position':
    'refus : autre environnement bassin : granulé 0 : id doit être un entier positif ou nul',
  'autre monde : granulés en double':
    'refus : autre environnement bassin : granulé 1 : id doit être un entier positif ou nul',
  'autre monde : eggs texte': 'refus : autre environnement bassin : eggs doit être une liste',
  'autre monde : eggs vide': 'ok 1f48f7a0 a23a7777',
  'autre monde : eggs trop': 'refus : autre environnement bassin : trop d’œufs (31, 30 au plus)',
  'autre monde : œuf pas objet': 'refus : autre environnement bassin : œuf 0 : doit être un objet',
  'autre monde : œuf espèce sans œufs':
    'refus : autre environnement bassin : œuf 0 : espèce sans œufs (« neon »)',
  'autre monde : œuf espèce inconnue':
    'refus : autre environnement bassin : œuf 0 : espèce sans œufs (7)',
  'autre monde : œuf hors de l’eau':
    'refus : autre environnement bassin : œuf 0 : position hors de l’eau',
  'autre monde : œuf position texte':
    'refus : autre environnement bassin : œuf 0 : position hors de l’eau',
  'autre monde : œuf âge': 'refus : autre environnement bassin : œuf 0 : age hors de [0, 180[',
  'autre monde : œuf surface':
    'refus : autre environnement bassin : œuf 0 : surface inconnue (« toit »)',
  'autre monde : œufs valides': 'ok efc3dd97 8512fcde',
  'autre monde : maintenance texte':
    'refus : autre environnement bassin : maintenance doit être un objet',
  'autre monde : waterHistory texte':
    'refus : autre environnement bassin : waterHistory doit être un objet',
  'autre monde : journal texte': 'refus : autre environnement bassin : journal doit être un objet',
  'autre monde : firstTankPath texte':
    'refus : autre environnement bassin : firstTankPath doit être un objet',
  'autre monde : feeder texte': 'refus : autre environnement bassin : feeder doit être un objet',
  'autre monde : feeder valide':
    'refus : autre environnement bassin : distributeur impossible dans l’environnement bassin',
  'autre monde : feeder heures':
    'refus : autre environnement bassin : feeder.hours doit lister 1 à 4 heures distinctes dans [0, 23]',
  'autre monde : mortality true': 'ok ae0966cd c29a33a4',
  'autre monde : mortality false':
    'refus : autre environnement bassin : mortality doit valoir true (reçu : false)',
  'autre monde : mortality texte':
    'refus : autre environnement bassin : mortality doit valoir true (reçu : « oui »)',
  'autre monde : dead texte': 'refus : autre environnement bassin : dead doit être une liste',
  'autre monde : dead vide': 'ok 1f48f7a0 a23a7777',
  'autre monde : water texte': 'refus : autre environnement bassin : eau : doit être un objet',
  'autre monde : water sans pH': 'ok 5c24ab0a 50fab1d5',
  'autre monde : water température':
    'refus : autre environnement bassin : eau : temperature doit être un nombre dans [0, 40]',
  'autre monde : ordre : seed, dimensions, tick, compteurs':
    'refus : autre environnement bassin : seed doit être un entier 32 bits non signé ; autre environnement bassin : dimensions non réglables dans l’environnement bassin ; autre environnement bassin : tick doit être un entier dans [0, 2147483648] ; autre environnement bassin : nextFishId doit être un entier 32 bits non signé ; autre environnement bassin : nextFoodId doit être un entier positif ou nul ; …',
  'autre monde : ordre : decor, careMode, current, fish, food':
    'refus : autre environnement bassin : decor doit être une liste ; autre environnement bassin : mode de bac inconnu (« x ») ; autre environnement bassin : force de courant inconnue (« x ») ; autre environnement bassin : fish doit être une liste ; autre environnement bassin : food doit être une liste',
  'autre monde : ordre : food, eggs, maintenance, waterHistory, journal':
    'refus : autre environnement bassin : food doit être une liste ; autre environnement bassin : eggs doit être une liste ; autre environnement bassin : maintenance doit être un objet ; autre environnement bassin : waterHistory doit être un objet ; autre environnement bassin : journal doit être un objet',
  'autre monde : ordre : journal, firstTankPath, feeder, mortality, dead, water':
    'refus : autre environnement bassin : journal doit être un objet ; autre environnement bassin : firstTankPath doit être un objet ; autre environnement bassin : feeder doit être un objet ; autre environnement bassin : mortality doit valoir true (reçu : « x ») ; autre environnement bassin : dead doit être une liste ; …',
  'autre monde : ordre : firstTankPath, feeder, mortality, dead, water':
    'refus : autre environnement bassin : firstTankPath doit être un objet ; autre environnement bassin : feeder doit être un objet ; autre environnement bassin : mortality doit valoir true (reçu : « x ») ; autre environnement bassin : dead doit être une liste ; autre environnement bassin : eau : doit être un objet',
  'bac : seed absente': 'refus : bac 0 : seed doit être un entier 32 bits non signé',
  'bac : seed négative': 'refus : bac 0 : seed doit être un entier 32 bits non signé',
  'bac : seed 2^32': 'refus : bac 0 : seed doit être un entier 32 bits non signé',
  'bac : seed texte': 'refus : bac 0 : seed doit être un entier 32 bits non signé',
  'bac : environnement inconnu': 'refus : bac 0 : environnement inconnu (« lune »)',
  'bac : environnement absent': 'refus : bac 0 : environnement inconnu (absente)',
  'bac : dimensions valides':
    'refus : bac 0 : décor : élément 3 : x hors du bac (reçu : 0.47, bornes ± 0.4) ; élément 4 : x hors du bac (reçu : -0.5, bornes ± 0.4) ; élément 9 : x hors du bac (reçu : 0.52, bornes ± 0.4) ; bac 0 : poisson 3 : position hors de la zone de nage ; bac 0 : poisson 8 : position hors de la zone de nage ; bac 0 : poisson 15 : position hors de la zone de nage ; bac 0 : poisson 17 : position hors de la zone de nage ; …',
  'bac : dimensions hors bornes':
    'refus : bac 0 : granulé 0 : position hors de l’eau ; bac 0 : granulé 1 : position hors de l’eau ; bac 0 : granulé 2 : position hors de l’eau ; bac 0 : granulé 3 : position hors de l’eau ; bac 0 : granulé 4 : position hors de l’eau',
  'bac : dimensions texte': 'refus : bac 0 : dimensions doit être un objet',
  'bac : dimensions incomplètes': 'refus : bac 0 : dimensions : depth doit être un nombre fini',
  'bac : dimensions infinies': 'refus : bac 0 : dimensions : depth doit être un nombre fini',
  'bac : shape rectangle': 'ok 0429b11b 2a802910',
  'bac : shape inconnue': 'refus : bac 0 : forme de bassin inconnue (« étoile »)',
  'bac : shape haricot': 'refus : bac 0 : forme non réglable dans l’environnement tropical',
  'bac : tick absent': 'refus : bac 0 : tick doit être un entier dans [0, 2147483648]',
  'bac : tick négatif': 'refus : bac 0 : tick doit être un entier dans [0, 2147483648]',
  'bac : tick 2^31': 'ok 777bbfaa 38e1d93b',
  'bac : tick 2^31 + 1': 'refus : bac 0 : tick doit être un entier dans [0, 2147483648]',
  'bac : tick réel': 'refus : bac 0 : tick doit être un entier dans [0, 2147483648]',
  'bac : nextFishId absent': 'refus : bac 0 : nextFishId doit être un entier 32 bits non signé',
  'bac : nextFishId 2^32': 'refus : bac 0 : nextFishId doit être un entier 32 bits non signé',
  'bac : nextFoodId négatif':
    'refus : bac 0 : nextFoodId doit être un entier positif ou nul ; bac 0 : granulé 0 : identifiant 0 ≥ nextFoodId ; bac 0 : granulé 1 : identifiant 1 ≥ nextFoodId ; bac 0 : granulé 2 : identifiant 2 ≥ nextFoodId ; bac 0 : granulé 3 : identifiant 3 ≥ nextFoodId ; …',
  'bac : nextFoodId réel':
    'refus : bac 0 : nextFoodId doit être un entier positif ou nul ; bac 0 : granulé 3 : identifiant 3 ≥ nextFoodId ; bac 0 : granulé 4 : identifiant 4 ≥ nextFoodId',
  'bac : decor texte': 'refus : bac 0 : decor doit être une liste',
  'bac : decor trop long': 'refus : bac 0 : trop d’éléments de décor (65, 64 au plus)',
  'bac : decor vide': 'ok 23f04d94 92ad802d',
  'bac : decor invalide':
    'refus : bac 0 : décor : élément 0 : kind inconnu : licorne ; élément 0 : x doit être un réel fini (reçu : undefined) ; élément 0 : z doit être un réel fini (reçu : undefined) ; élément 0 : rotation doit être un réel fini (reçu : undefined) ; élément 0 : scale doit être un réel fini (reçu : undefined) ; élément 0 : seed doit être un réel fini (reçu : undefined)',
  'bac : careMode decor': 'ok 75e7a2cc 14e17675',
  'bac : careMode inconnu': 'refus : bac 0 : mode de bac inconnu (« libre »)',
  'bac : current fort': 'ok 1f5ee379 b11fd1f8',
  'bac : current coupe': 'refus : bac 0 : force de courant inconnue (« coupe »)',
  'bac : current inconnu': 'refus : bac 0 : force de courant inconnue (7)',
  'bac : fish texte': 'refus : bac 0 : fish doit être une liste',
  'bac : fish vide': 'ok 8ee1c6da 19e08ea9',
  'bac : fish trop': 'refus : bac 0 : trop de poissons (999, 60 au plus)',
  'bac : poisson id absent': 'refus : bac 0 : poisson 0 : id doit être un entier 32 bits non signé',
  'bac : poisson pas objet': 'refus : bac 0 : poisson 0 : doit être un objet',
  'bac : poisson id réel': 'refus : bac 0 : poisson 0 : id doit être un entier 32 bits non signé',
  'bac : poisson espèce inconnue': 'refus : bac 0 : poisson 0 : espèce inconnue (« dragon »)',
  'bac : poisson espèce absente': 'refus : bac 0 : poisson 0 : espèce inconnue (absente)',
  'bac : poisson espèce d’un autre lieu':
    'refus : bac 0 : poisson 0 : l’espèce koi ne vit pas dans l’environnement tropical',
  'bac : poisson x absent': 'refus : bac 0 : poisson 0 : x doit être un nombre fini',
  'bac : poisson y absent': 'refus : bac 0 : poisson 0 : y doit être un nombre fini',
  'bac : poisson z absent': 'refus : bac 0 : poisson 0 : z doit être un nombre fini',
  'bac : poisson yaw absent': 'refus : bac 0 : poisson 0 : yaw doit être un nombre fini',
  'bac : poisson pitch absent': 'refus : bac 0 : poisson 0 : pitch doit être un nombre fini',
  'bac : poisson speed absent': 'refus : bac 0 : poisson 0 : speed doit être un nombre fini',
  'bac : poisson turn absent': 'refus : bac 0 : poisson 0 : turn doit être un nombre fini',
  'bac : poisson pitchTarget absent':
    'refus : bac 0 : poisson 0 : pitchTarget doit être un nombre fini',
  'bac : poisson phase absent': 'refus : bac 0 : poisson 0 : phase doit être un nombre fini',
  'bac : poisson ascent absent': 'refus : bac 0 : poisson 0 : ascent doit être un nombre fini',
  'bac : poisson hunger absent': 'refus : bac 0 : poisson 0 : hunger doit être un nombre fini',
  'bac : poisson rng absent': 'refus : bac 0 : poisson 0 : rng doit être un nombre fini',
  'bac : poisson px absent': 'refus : bac 0 : poisson 0 : px doit être un nombre fini',
  'bac : poisson py absent': 'refus : bac 0 : poisson 0 : py doit être un nombre fini',
  'bac : poisson pz absent': 'refus : bac 0 : poisson 0 : pz doit être un nombre fini',
  'bac : poisson pyaw absent': 'refus : bac 0 : poisson 0 : pyaw doit être un nombre fini',
  'bac : poisson ppitch absent': 'refus : bac 0 : poisson 0 : ppitch doit être un nombre fini',
  'bac : poisson pphase absent': 'refus : bac 0 : poisson 0 : pphase doit être un nombre fini',
  'bac : poisson x infini': 'refus : bac 0 : poisson 0 : x doit être un nombre fini',
  'bac : poisson y infini': 'refus : bac 0 : poisson 0 : y doit être un nombre fini',
  'bac : poisson z infini': 'refus : bac 0 : poisson 0 : z doit être un nombre fini',
  'bac : poisson yaw infini': 'refus : bac 0 : poisson 0 : yaw doit être un nombre fini',
  'bac : poisson pitch infini': 'refus : bac 0 : poisson 0 : pitch doit être un nombre fini',
  'bac : poisson speed infini': 'refus : bac 0 : poisson 0 : speed doit être un nombre fini',
  'bac : poisson turn infini': 'refus : bac 0 : poisson 0 : turn doit être un nombre fini',
  'bac : poisson pitchTarget infini':
    'refus : bac 0 : poisson 0 : pitchTarget doit être un nombre fini',
  'bac : poisson phase infini': 'refus : bac 0 : poisson 0 : phase doit être un nombre fini',
  'bac : poisson ascent infini': 'refus : bac 0 : poisson 0 : ascent doit être un nombre fini',
  'bac : poisson hunger infini': 'refus : bac 0 : poisson 0 : hunger doit être un nombre fini',
  'bac : poisson rng infini': 'refus : bac 0 : poisson 0 : rng doit être un nombre fini',
  'bac : poisson px infini': 'refus : bac 0 : poisson 0 : px doit être un nombre fini',
  'bac : poisson py infini': 'refus : bac 0 : poisson 0 : py doit être un nombre fini',
  'bac : poisson pz infini': 'refus : bac 0 : poisson 0 : pz doit être un nombre fini',
  'bac : poisson pyaw infini': 'refus : bac 0 : poisson 0 : pyaw doit être un nombre fini',
  'bac : poisson ppitch infini': 'refus : bac 0 : poisson 0 : ppitch doit être un nombre fini',
  'bac : poisson pphase infini': 'refus : bac 0 : poisson 0 : pphase doit être un nombre fini',
  'bac : poisson health absente': 'ok 0429b11b 2a802910',
  'bac : poisson health texte': 'refus : bac 0 : poisson 0 : health doit être un nombre fini',
  'bac : poisson health basse': 'refus : bac 0 : poisson 0 : health hors de [plancher, 1]',
  'bac : poisson health haute': 'refus : bac 0 : poisson 0 : health hors de [plancher, 1]',
  'bac : poisson x hors zone': 'refus : bac 0 : poisson 0 : position hors de la zone de nage',
  'bac : poisson px hors zone':
    'refus : bac 0 : poisson 0 : position précédente hors de la zone de nage',
  'bac : poisson yaw 4': 'refus : bac 0 : poisson 0 : yaw hors de [-π, π]',
  'bac : poisson yaw π': 'ok 2a4981b7 f65b8544',
  'bac : poisson yaw π+ε': 'ok e5dbf5a2 5652a56b',
  'bac : poisson yaw π+1e-11': 'refus : bac 0 : poisson 0 : yaw hors de [-π, π]',
  'bac : poisson pyaw 4': 'refus : bac 0 : poisson 0 : pyaw hors de [-π, π]',
  'bac : poisson pitch 3': 'refus : bac 0 : poisson 0 : pitch hors bornes',
  'bac : poisson ppitch 3': 'refus : bac 0 : poisson 0 : ppitch hors bornes',
  'bac : poisson pitchTarget 3': 'refus : bac 0 : poisson 0 : pitchTarget hors bornes',
  'bac : poisson speed 99': 'refus : bac 0 : poisson 0 : vitesse hors bornes',
  'bac : poisson turn 99': 'refus : bac 0 : poisson 0 : turn hors bornes',
  'bac : poisson phase -1': 'refus : bac 0 : poisson 0 : phase hors de [0, 2π]',
  'bac : poisson phase 7': 'refus : bac 0 : poisson 0 : phase hors de [0, 2π]',
  'bac : poisson pphase 7': 'refus : bac 0 : poisson 0 : pphase hors de [0, 2π]',
  'bac : poisson ascent -1': 'refus : bac 0 : poisson 0 : ascent hors bornes',
  'bac : poisson ascent 4000': 'refus : bac 0 : poisson 0 : ascent hors bornes',
  'bac : poisson hunger 2': 'refus : bac 0 : poisson 0 : hunger hors de [0, 1]',
  'bac : poisson rng réel': 'refus : bac 0 : poisson 0 : rng doit être un entier 32 bits non signé',
  'bac : poisson rng 2^32': 'refus : bac 0 : poisson 0 : rng doit être un entier 32 bits non signé',
  'bac : poisson ich 0': 'ok 7bcfc98d 1b46c962',
  'bac : poisson ich -1': 'refus : bac 0 : poisson 0 : ich hors de [0, 900]',
  'bac : poisson finRot 0': 'ok 674e5baf c3d7bf44',
  'bac : poisson finRot texte': 'refus : bac 0 : poisson 0 : finRot hors de [0, 1200]',
  'bac : poisson velvet 0': 'ok 42297b4f d932abd4',
  'bac : poisson fungus 0': 'ok d72dae93 db908da0',
  'bac : poisson dropsy 0': 'ok 14051362 3dbd2ecf',
  'bac : poisson dropsy 1e9': 'refus : bac 0 : poisson 0 : dropsy hors de [0, 2400]',
  'bac : poisson growth 0': 'refus : bac 0 : poisson 0 : l’espèce neon n’a pas d’alevins',
  'bac : poisson growth -1': 'refus : bac 0 : poisson 0 : l’espèce neon n’a pas d’alevins',
  'bac : poisson ordre : id avant species':
    'refus : bac 0 : poisson 0 : id doit être un entier 32 bits non signé',
  'bac : poisson ordre : species avant x': 'refus : bac 0 : poisson 0 : espèce inconnue (« x »)',
  'bac : poisson ordre : x avant health': 'refus : bac 0 : poisson 0 : x doit être un nombre fini',
  'bac : poisson ordre : hunger avant health':
    'refus : bac 0 : poisson 0 : hunger doit être un nombre fini',
  'bac : poisson ordre : health avant rng':
    'refus : bac 0 : poisson 0 : health doit être un nombre fini',
  'bac : poisson ordre : pphase avant ich':
    'refus : bac 0 : poisson 0 : pphase doit être un nombre fini',
  'bac : poisson ordre : ich avant finRot': 'refus : bac 0 : poisson 0 : ich hors de [0, 900]',
  'bac : poisson ordre : dropsy avant growth':
    'refus : bac 0 : poisson 0 : dropsy hors de [0, 2400]',
  'bac : poisson ordre : growth avant x':
    'refus : bac 0 : poisson 0 : l’espèce neon n’a pas d’alevins',
  'bac : poisson ordre : x avant yaw':
    'refus : bac 0 : poisson 0 : position hors de la zone de nage',
  'bac : poisson ordre : hunger avant health (bornes)':
    'refus : bac 0 : poisson 0 : hunger hors de [0, 1]',
  'bac : poisson ordre : health avant rng (bornes)':
    'refus : bac 0 : poisson 0 : health hors de [plancher, 1]',
  'bac : poissons ids égaux': 'refus : bac 0 : poisson 1 : identifiants non strictement croissants',
  'bac : poisson id ≥ nextFishId':
    'refus : bac 0 : poisson 0 : identifiant 10000 ≥ nextFishId ; bac 0 : poisson 1 : identifiants non strictement croissants',
  'bac : poissons tous invalides':
    'refus : bac 0 : poisson 0 : doit être un objet ; bac 0 : poisson 1 : doit être un objet ; bac 0 : poisson 2 : doit être un objet ; bac 0 : poisson 3 : doit être un objet ; bac 0 : poisson 4 : doit être un objet ; …',
  'bac : food texte': 'refus : bac 0 : food doit être une liste',
  'bac : food vide': 'ok 72f3c984 c64f3a51',
  'bac : food trop': 'refus : bac 0 : trop de granulés (999, 60 au plus)',
  'bac : granulé pas objet': 'refus : bac 0 : granulé 0 : doit être un objet',
  'bac : granulé id absent': 'refus : bac 0 : granulé 0 : id doit être un nombre fini',
  'bac : granulé x absent': 'refus : bac 0 : granulé 0 : x doit être un nombre fini',
  'bac : granulé y absent': 'refus : bac 0 : granulé 0 : y doit être un nombre fini',
  'bac : granulé z absent': 'refus : bac 0 : granulé 0 : z doit être un nombre fini',
  'bac : granulé vy absent': 'refus : bac 0 : granulé 0 : vy doit être un nombre fini',
  'bac : granulé age absent': 'refus : bac 0 : granulé 0 : age doit être un nombre fini',
  'bac : granulé floatY absent': 'refus : bac 0 : granulé 0 : floatY doit être un nombre fini',
  'bac : granulé floatTime absent':
    'refus : bac 0 : granulé 0 : floatTime doit être un nombre fini',
  'bac : granulé restY absent': 'refus : bac 0 : granulé 0 : restY doit être un nombre fini',
  'bac : granulé id réel': 'refus : bac 0 : granulé 0 : id doit être un entier positif ou nul',
  'bac : granulé id ≥ nextFoodId': 'refus : bac 0 : granulé 0 : identifiant 1000000 ≥ nextFoodId',
  'bac : granulé hors de l’eau': 'refus : bac 0 : granulé 0 : position hors de l’eau',
  'bac : granulé floatY haut': 'refus : bac 0 : granulé 0 : floatY hors de l’eau',
  'bac : granulé restY haut': 'refus : bac 0 : granulé 0 : restY hors de [fond, floatY]',
  'bac : granulé vy positive': 'refus : bac 0 : granulé 0 : vy hors bornes',
  'bac : granulé vy rapide': 'refus : bac 0 : granulé 0 : vy hors bornes',
  'bac : granulé age négatif': 'refus : bac 0 : granulé 0 : age hors bornes',
  'bac : granulé floatTime 0': 'refus : bac 0 : granulé 0 : floatTime hors bornes',
  'bac : granulé ordre : id avant position':
    'refus : bac 0 : granulé 0 : id doit être un entier positif ou nul',
  'bac : granulés en double': 'refus : bac 0 : granulé 1 : id doit être un entier positif ou nul',
  'bac : eggs texte': 'refus : bac 0 : eggs doit être une liste',
  'bac : eggs vide': 'ok 0429b11b 2a802910',
  'bac : eggs trop': 'refus : bac 0 : trop d’œufs (31, 30 au plus)',
  'bac : œuf pas objet': 'refus : bac 0 : œuf 0 : doit être un objet',
  'bac : œuf espèce sans œufs': 'refus : bac 0 : œuf 0 : espèce sans œufs (« neon »)',
  'bac : œuf espèce inconnue': 'refus : bac 0 : œuf 0 : espèce sans œufs (7)',
  'bac : œuf hors de l’eau': 'refus : bac 0 : œuf 0 : position hors de l’eau',
  'bac : œuf position texte': 'refus : bac 0 : œuf 0 : position hors de l’eau',
  'bac : œuf âge': 'refus : bac 0 : œuf 0 : age hors de [0, 180[',
  'bac : œuf surface': 'refus : bac 0 : œuf 0 : surface inconnue (« toit »)',
  'bac : œufs valides': 'ok 9a2f02bc d4316a49',
  'bac : maintenance texte': 'refus : bac 0 : maintenance doit être un objet',
  'bac : waterHistory texte': 'refus : bac 0 : waterHistory doit être un objet',
  'bac : journal texte': 'refus : bac 0 : journal doit être un objet',
  'bac : firstTankPath texte': 'refus : bac 0 : firstTankPath doit être un objet',
  'bac : feeder texte': 'refus : bac 0 : feeder doit être un objet',
  'bac : feeder valide': 'ok f852157c e14c2923',
  'bac : feeder heures':
    'refus : bac 0 : feeder.hours doit lister 1 à 4 heures distinctes dans [0, 23]',
  'bac : mortality true': 'ok 5b38f860 4078c7e5',
  'bac : mortality false': 'refus : bac 0 : mortality doit valoir true (reçu : false)',
  'bac : mortality texte': 'refus : bac 0 : mortality doit valoir true (reçu : « oui »)',
  'bac : dead texte': 'refus : bac 0 : dead doit être une liste',
  'bac : dead vide': 'ok 0429b11b 2a802910',
  'bac : water texte': 'refus : bac 0 : eau : doit être un objet',
  'bac : water sans pH': 'ok 7db25697 bda8a7c8',
  'bac : water température': 'refus : bac 0 : eau : temperature doit être un nombre dans [0, 40]',
  'bac : ordre : seed, dimensions, tick, compteurs':
    'refus : bac 0 : seed doit être un entier 32 bits non signé ; bac 0 : dimensions doit être un objet ; bac 0 : tick doit être un entier dans [0, 2147483648] ; bac 0 : nextFishId doit être un entier 32 bits non signé ; bac 0 : nextFoodId doit être un entier positif ou nul ; …',
  'bac : ordre : decor, careMode, current, fish, food':
    'refus : bac 0 : decor doit être une liste ; bac 0 : mode de bac inconnu (« x ») ; bac 0 : force de courant inconnue (« x ») ; bac 0 : fish doit être une liste ; bac 0 : food doit être une liste',
  'bac : ordre : food, eggs, maintenance, waterHistory, journal':
    'refus : bac 0 : food doit être une liste ; bac 0 : eggs doit être une liste ; bac 0 : maintenance doit être un objet ; bac 0 : waterHistory doit être un objet ; bac 0 : journal doit être un objet',
  'bac : ordre : journal, firstTankPath, feeder, mortality, dead, water':
    'refus : bac 0 : journal doit être un objet ; bac 0 : firstTankPath doit être un objet ; bac 0 : feeder doit être un objet ; bac 0 : mortality doit valoir true (reçu : « x ») ; bac 0 : dead doit être une liste ; …',
  'bac : ordre : firstTankPath, feeder, mortality, dead, water':
    'refus : bac 0 : firstTankPath doit être un objet ; bac 0 : feeder doit être un objet ; bac 0 : mortality doit valoir true (reçu : « x ») ; bac 0 : dead doit être une liste ; bac 0 : eau : doit être un objet',
  'riche : telle quelle': 'ok 3ec53d60 6304ca52',
  'riche : corps deadFor négatif': 'refus : corps 0 : deadFor hors de [0, 86400]',
  'riche : corps deadFor absent': 'refus : corps 0 : deadFor hors de [0, 86400]',
  'riche : corps id vivant': 'refus : corps 0 : identifiant 0 déjà porté par un animal vivant',
  'riche : corps espèce inconnue': 'refus : corps 0 : espèce inconnue (« dragon »)',
  'riche : corps pas objet': 'refus : corps 0 : doit être un objet',
  'riche : corps trop': 'refus : trop de corps (999, 60 au plus)',
  'riche : distributeur au bassin':
    'refus : autre environnement bassin : distributeur impossible dans l’environnement bassin',
  'riche : alevin d’une espèce à alevins': 'ok eed0e734 293c3ae6',
  'riche : alevin d’une espèce sans alevins': 'refus : poisson 0 : l’espèce neon n’a pas d’alevins',
  'riche : alevin âge 1e9': 'refus : poisson 12 : growth hors de [0, 1200[',
  'riche : ich 1': 'ok 3685d733 461833d9',
  'riche : sans eau': 'ok 871e5ee2 84a30258',
  'riche : trop de néons': 'refus : trop de neon (42, 40 au plus)',
  'riche : espèce au nom long': 'refus : poisson 0 : espèce inconnue (« xxxxxxxxxxxxxxxxxxxx… »)',
  'riche : espèce objet': 'refus : poisson 0 : espèce inconnue (object)',
  'riche : mode décor : espèce d’ailleurs': 'ok 7a7cb706 8498c7c0',
  'schéma 2 : réelle': 'ok 0429b11b 2a802910',
  'schéma 2 : schéma 4': 'refus : version de sauvegarde inconnue (4, version 1, 2 ou 3 attendue)',
  'schéma 2 : seed': 'refus : seed doit être un entier 32 bits non signé',
  'schéma 2 : tick': 'refus : tick doit être un entier dans [0, 2147483648]',
  'schéma 2 : nextTankId': 'refus : nextTankId doit être un entier 32 bits non signé',
  'schéma 2 : selectedTankId texte': 'refus : selectedTankId doit être un entier 32 bits non signé',
  'schéma 2 : selectedTankId absent': 'ok 0429b11b 2a802910',
  'schéma 2 : selectedTankId inconnu': 'ok 0429b11b 2a802910',
  'schéma 2 : tanks texte': 'refus : tanks doit être une liste',
  'schéma 2 : tanks vide': 'refus : nombre de bacs hors de [1, 32] (0)',
  'schéma 2 : tanks trop': 'refus : nombre de bacs hors de [1, 32] (99)',
  'schéma 2 : bac pas objet': 'refus : bac 0 : doit être un objet',
  'schéma 2 : bac id': 'refus : bac 0 : id doit être un entier 32 bits non signé',
  'schéma 2 : bac nom vide': 'refus : bac 0 : name doit être un texte non vide',
  'schéma 2 : bac nom long': 'refus : bac 0 : name trop long (40 caractères au plus)',
  'schéma 2 : bac nom absent': 'refus : bac 0 : name doit être un texte non vide',
  'schéma 2 : bac world texte': 'refus : bac 0 : world doit être un objet',
  'schéma 2 : bac world invalide': 'refus : bac 0 : seed doit être un entier 32 bits non signé',
  'schéma 2 : bac place fausse':
    'refus : bac 0 : place doit valoir « piece » pour l’environnement tropical',
  'schéma 2 : bac place absente':
    'refus : bac 0 : place doit valoir « piece » pour l’environnement tropical',
  'schéma 2 : bac placement texte': 'refus : bac 0 : placement doit être un objet',
  'schéma 2 : format absent': 'refus : ce fichier n’est pas une sauvegarde aqfish',
  'schéma 2 : schéma 1 invalide': 'refus : environnement inconnu (« x »)',
  'schéma 2 : deux bacs au jardin':
    'refus : bac 2 : place doit valoir « piece » pour l’environnement paludarium',
  'schéma 2 : deux bassins au jardin': 'refus : un seul bac au jardin',
  'schéma 2 : placement au jardin': 'refus : bac 1 : placement interdit au jardin',
  'schéma 2 : world trop volumineux': 'refus : bac 0 : world trop volumineux (256 Kio au plus)',
  'schéma 2 : bac placement valide': 'ok e0d04945 deb2c00a',
  'schéma 2 : bac placement niveau': 'refus : bac 0 : position-invalide',
  'schéma 2 : bac placement invalide':
    'refus : bac 0 : placement.supportId doit être null ou un entier 32 bits non signé ; bac 0 : placement.x et placement.z doivent être des mètres au centimètre ; bac 0 : placement.quarter doit être 0, 1, 2 ou 3 ; bac 0 : placement.level doit être un entier de 0 à 2',
  'schéma 2 : bac placement x seul':
    'refus : bac 0 : placement.x et placement.z doivent être des mètres au centimètre',
  'schéma 2 : bacs ids égaux': 'refus : bac 0 : identifiants non strictement croissants',
  'schéma 2 : bac id ≥ nextTankId': 'refus : bac 50 : identifiant ≥ nextTankId',
  'schéma 2 : furniture texte': 'refus : furniture doit être une liste',
  'schéma 2 : furniture sans compteur': 'refus : nextFurnitureId manquant',
  'schéma 2 : furniture valide': 'ok 137d8e83 702a6e0e',
  'schéma 2 : furniture vide': 'ok 0429b11b 2a802910',
  'schéma 2 : furniture trop': 'refus : trop de meubles (99, 24 au plus)',
  'schéma 2 : meuble pas objet': 'refus : meuble 0 : doit être un objet',
  'schéma 2 : meuble invalide':
    'refus : meuble 0 : id, kind (commode, etagere-bacs, etagere-animalerie), x, z ou quarter invalide',
  'schéma 2 : nextFurnitureId texte':
    'refus : nextFurnitureId doit être un entier 32 bits non signé',
  'schéma 2 : nextFurnitureId seul': 'ok 31a84677 eb2e433a',
  'schéma 2 : ordre : seed, tick, nextTankId, selectedTankId, settings':
    'refus : seed doit être un entier 32 bits non signé ; tick doit être un entier dans [0, 2147483648] ; nextTankId doit être un entier 32 bits non signé ; selectedTankId doit être un entier 32 bits non signé ; settings doit être un objet',
  'schéma 2 : ordre : settings, tanks, furniture, nextFurnitureId':
    'refus : settings doit être un objet ; tanks doit être une liste ; furniture doit être une liste ; nextFurnitureId doit être un entier 32 bits non signé',
  'schéma 2 : ordre : bac, puis compteur': 'refus : bac 0 : name doit être un texte non vide',
  'schéma 2 : settings absents': 'refus : settings doit être un objet',
  'schéma 2 : settings tableau': 'refus : settings doit être un objet',
  'schéma 2 : vitesse inconnue': 'refus : vitesse inconnue (3)',
  'schéma 2 : vitesse texte': 'refus : vitesse inconnue (« 1 »)',
  'schéma 2 : vitesse 0': 'ok 36e09400 ac9aa8bd',
  'schéma 2 : horloge absente':
    'refus : heure de l’horloge hors de [0, 24) ; durée de la journée hors de [60, 86400] s ; horloge : frozen doit être un booléen',
  'schéma 2 : horloge texte':
    'refus : heure de l’horloge hors de [0, 24) ; durée de la journée hors de [60, 86400] s ; horloge : frozen doit être un booléen',
  'schéma 2 : heure 24': 'refus : heure de l’horloge hors de [0, 24)',
  'schéma 2 : heure 23.99': 'ok 3ae19bdd 42116ab4',
  'schéma 2 : heure -1': 'refus : heure de l’horloge hors de [0, 24)',
  'schéma 2 : journée 59': 'refus : durée de la journée hors de [60, 86400] s',
  'schéma 2 : journée 86400': 'ok ea5d122e 2a2f0fa9',
  'schéma 2 : frozen texte': 'refus : horloge : frozen doit être un booléen',
  'schéma 2 : foodStyle inconnu': 'refus : rendu des granulés inconnu (« cubes »)',
  'schéma 2 : foodStyle absent': 'ok 0429b11b 2a802910',
  'schéma 2 : room absente': 'ok 0429b11b 2a802910',
  'schéma 2 : room texte': 'refus : pièce : doit être un objet',
  'schéma 2 : room texte et vitesse': 'refus : vitesse inconnue (3) ; pièce : doit être un objet',
  'schéma 2 : room et horloge':
    'refus : heure de l’horloge hors de [0, 24) ; durée de la journée hors de [60, 86400] s ; horloge : frozen doit être un booléen ; pièce : doit être un objet',
  'schéma 2 : ordre : vitesse, heure, journée, frozen, foodStyle':
    'refus : vitesse inconnue (3) ; heure de l’horloge hors de [0, 24) ; durée de la journée hors de [60, 86400] s ; horloge : frozen doit être un booléen ; rendu des granulés inconnu (« x »)',
};

describe('caractérisation de la relecture des sauvegardes (#686, lot 5)', () => {
  it('chaque cas a un nom unique et un seul groupe', () => {
    expect(new Set(CASES.map(([name]) => name)).size).toBe(CASES.length);
    for (const [name] of CASES) {
      expect(GROUPS.filter((group) => name.startsWith(group))).toHaveLength(1);
    }
  });

  it('chaque cas a un résultat attendu', () => {
    expect(Object.keys(EXPECTED).sort()).toEqual(CASES.map(([name]) => name).sort());
  });

  // Un test par groupe de cas : plusieurs centaines de relectures, trop pour un seul test
  // sous le délai de 5 s de la CI.
  for (const group of GROUPS) {
    it(`résultats identiques (${group}) : messages exacts, résultats acceptés au JSON près`, () => {
      const actual: Record<string, string> = {};
      const expected: Record<string, string> = {};
      for (const [name, base, mutation] of CASES.filter(([n]) => n.startsWith(group))) {
        actual[name] = outcome(base, mutation);
        expected[name] = EXPECTED[name] as string;
      }
      expect(actual).toEqual(expected);
    }, 30_000);
  }

  it('textes de premier niveau : non-objets, JSON invalide, schéma 1 migré', () => {
    for (const text of ['', 'null', '3', '"x"', '[]', '{', JSON.stringify({ format: 'aqfish' })]) {
      expect(parseWorld(text).ok).toBe(false);
      expect(parseSave(text).ok).toBe(false);
    }
    const migrated = parseSave(JSON.stringify(TROPICAL));
    expect(migrated.ok && migrated.schema).toBe(1);
    expect(migrateSchema1).toBeTypeOf('function');
  });
});
