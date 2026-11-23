import {
  DEFAULT_SAVE_SETTINGS,
  MAX_SAVE_LENGTH,
  parseSaveData,
  parseSettings,
  parseWorldBody,
  SAVE_FORMAT,
  SAVE_SCHEMA,
  SAVE_SCHEMA_1,
  SAVE_SCHEMA_2,
  SEED_RULE,
  TICK_RULE,
  savedWorld,
  settingsData,
  type SavedWorld,
  type SaveSettings,
} from './save';
import {
  isCentimetric,
  MAX_ROOM_SUPPORTS,
  MAX_ROOM_TANKS,
  MAX_SUPPORT_LEVELS,
  MAX_TANK_NAME_LENGTH,
  placeOf,
  resolveSelectedTank,
  roomLayoutProblems,
  roomWorlds,
  SUPPORT_KINDS,
  syncRoom,
  type RoomState,
  type RoomSupport,
  type RoomTank,
  type SupportKind,
  type TankPlace,
  type TankPlacement,
} from './room-state';
import {
  describe,
  field,
  firstProblemOf,
  integerIn,
  isRecord,
  isUint32,
  optional,
  own,
  problemsOf,
  readList,
  uint32,
  type FieldRule,
  type ListRule,
  type Validator,
} from './save-schema';
import { schema2ToMgPerLiter } from './save-units';
import type { World } from './world-types';

/**
 * Sauvegarde de la pièce au schéma 3 (épopée #264, lot 1, ADR 0061 et 0069 ; mg/L, #793 et
 * ADR 0167).
 *
 * Écriture : `serializeRoom` écrit **toujours** le schéma 3. Lecture : `parseSave` lit le
 * schéma 3, le schéma 2 (même pièce, composés azotés en unités de jeu convertis aux mg/L avant
 * la validation, `sim/save-units.ts`) et le schéma 1 (migré par `migrateSchema1`, après sa
 * validation complète) ; tout autre schéma est refusé. Le corps du monde de chaque bac est
 * celui du schéma 1 (graine comprise, ADR 0069) en mg/L, relu par le même validateur, avec ses
 * messages préfixés du bac.
 * Comme le schéma 1 : aucune exception, champs inconnus ignorés, propriétés propres seulement.
 */

/** Taille maximale d'un document au schéma 2 : 256 Kio par bac au plus (ADR 0061). */
export const MAX_ROOM_SAVE_LENGTH = MAX_SAVE_LENGTH * MAX_ROOM_TANKS;

/** Bac enregistré. */
export interface SavedTank {
  readonly id: number;
  readonly name: string;
  readonly place: TankPlace;
  /** Position dans la pièce (lot 2) ; omise pour la position historique et au jardin. */
  readonly placement?: TankPlacement;
  readonly world: SavedWorld;
}

/** Contenu d'une sauvegarde au schéma 2. */
export interface RoomSaveData {
  readonly format: typeof SAVE_FORMAT;
  readonly schema: typeof SAVE_SCHEMA;
  readonly seed: number;
  readonly tick: number;
  readonly nextTankId: number;
  readonly selectedTankId: number;
  /** Meubles supports et leur compteur (lot 2) ; omis tant qu'aucun meuble n'a été posé. */
  readonly nextFurnitureId?: number;
  readonly furniture?: readonly RoomSupport[];
  readonly tanks: readonly SavedTank[];
  readonly settings: SaveSettings;
}

/** Résultat de `parseSave` : la pièce, le bac sélectionné et les réglages, ou la raison du refus. */
export type ParseSaveResult =
  | {
      readonly ok: true;
      readonly room: RoomState;
      /** Bac sélectionné, existant (retombe sur le plus petit identifiant). */
      readonly selectedTankId: number;
      readonly settings: SaveSettings;
      /** Schéma lu (1 : sauvegarde migrée). */
      readonly schema: typeof SAVE_SCHEMA | typeof SAVE_SCHEMA_2 | typeof SAVE_SCHEMA_1;
    }
  | { readonly ok: false; readonly error: string };

/**
 * Contenu de la sauvegarde de la pièce (copié : rien n'est partagé avec les mondes).
 * @throws RangeError si la pièce est invalide (aucun bac, identifiants non croissants,
 * compteur trop petit, bac sélectionné absent), si un réglage est invalide, ou si un monde a
 * des obstacles explicites.
 */
export function roomSaveData(
  room: RoomState,
  selectedTankId: number,
  settings: SaveSettings = DEFAULT_SAVE_SETTINGS,
): RoomSaveData {
  const problems = roomProblems(
    room.tanks.map((tank) => tank.id),
    room.nextTankId,
  );
  if (!room.tanks.some((tank) => tank.id === selectedTankId)) {
    problems.push(`bac sélectionné absent (${selectedTankId})`);
  }
  problems.push(...roomLayoutProblems(room));
  if (problems.length > 0) {
    throw new RangeError(`sauvegarde : ${problems.join(' ; ')}`);
  }
  const settingsCopy = settingsData(settings);
  return {
    format: SAVE_FORMAT,
    schema: SAVE_SCHEMA,
    seed: room.seed,
    tick: room.tick,
    nextTankId: room.nextTankId,
    selectedTankId,
    // Champs du lot 2 omis pour une pièce sans meuble : document du lot 1 à l'identique.
    ...(room.nextFurnitureId === 0 && room.furniture.length === 0
      ? {}
      : {
          nextFurnitureId: room.nextFurnitureId,
          furniture: room.furniture.map(({ id, kind, x, z, quarter }) => ({
            id,
            kind,
            x,
            z,
            quarter,
          })),
        }),
    tanks: room.tanks.map((tank) => ({
      id: tank.id,
      name: tank.name,
      place: tank.place,
      ...(tank.placement === null ? {} : { placement: { ...tank.placement } }),
      world: savedWorld(tank.world),
    })),
    settings: settingsCopy,
  };
}

/**
 * Sauvegarde de la pièce en texte JSON, au schéma 2 (`roomSaveData`).
 * @throws RangeError comme `roomSaveData`, ou si le corps d'un bac dépasse `MAX_SAVE_LENGTH`
 * (il serait refusé à la relecture : mieux vaut garder la sauvegarde précédente).
 */
export function serializeRoom(
  room: RoomState,
  selectedTankId: number,
  settings: SaveSettings = DEFAULT_SAVE_SETTINGS,
): string {
  const data = roomSaveData(room, selectedTankId, settings);
  for (const tank of data.tanks) {
    const length = JSON.stringify(tank.world).length;
    if (length > MAX_SAVE_LENGTH) {
      throw new RangeError(
        `sauvegarde trop volumineuse (bac ${tank.id} : ${Math.ceil(length / 1024)} Kio, ${MAX_SAVE_LENGTH / 1024} Kio au plus)`,
      );
    }
  }
  return JSON.stringify(data);
}

/**
 * Relit une sauvegarde (texte JSON) au schéma 2, ou au schéma 1 (migrée). Ne lève jamais.
 * Les mondes renvoyés sont neufs (obstacles recalculés) et avancent comme des mondes jamais
 * sauvegardés, au bit près.
 */
export function parseSave(text: string): ParseSaveResult {
  if (typeof text !== 'string') {
    return failure('la sauvegarde doit être un texte');
  }
  if (text.length > MAX_ROOM_SAVE_LENGTH) {
    return failure(
      `fichier trop volumineux (${Math.ceil(text.length / 1024)} Kio, ${MAX_ROOM_SAVE_LENGTH / 1024} Kio au plus)`,
    );
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return failure('ce n’est pas un fichier JSON valide');
  }
  if (isRecord(value) && own(value, 'format') === SAVE_FORMAT) {
    const schema = own(value, 'schema');
    if (schema === SAVE_SCHEMA_1 && text.length > MAX_SAVE_LENGTH) {
      // Limite historique du schéma 1 (tout le document, ADR 0063).
      return failure(
        `fichier trop volumineux (${Math.ceil(text.length / 1024)} Kio, ${MAX_SAVE_LENGTH / 1024} Kio au plus)`,
      );
    }
  }
  try {
    return parseRoomSaveData(value);
  } catch (error) {
    // Filet de sécurité : une incohérence non prévue par la validation reste un refus.
    return failure(error instanceof Error ? error.message : 'sauvegarde illisible');
  }
}

/** Comme `parseSave`, sur des données JSON déjà décodées. Ne lève jamais. */
export function parseRoomSaveData(value: unknown): ParseSaveResult {
  if (!isRecord(value)) {
    return failure('la sauvegarde doit être un objet JSON');
  }
  if (own(value, 'format') !== SAVE_FORMAT) {
    return failure('ce fichier n’est pas une sauvegarde aqfish');
  }
  const schema = own(value, 'schema');
  if (schema === SAVE_SCHEMA_1) {
    const legacy = parseSaveData(value);
    if (!legacy.ok) {
      return legacy;
    }
    const migrated = migrateSchema1(legacy.world, legacy.others);
    return { ok: true, ...migrated, settings: legacy.settings, schema: SAVE_SCHEMA_1 };
  }
  if (schema === SAVE_SCHEMA_2) {
    // Composés azotés en unités de jeu : convertis aux mg/L avant la validation (#793).
    // Un objet reste un objet : `schema2ToMgPerLiter` n'en renvoie qu'une copie.
    const result = parseSchema2(schema2ToMgPerLiter(value) as Record<string, unknown>);
    return result.ok ? { ...result, schema: SAVE_SCHEMA_2 } : result;
  }
  if (schema !== SAVE_SCHEMA) {
    return failure(
      `version de sauvegarde inconnue (${describe(schema)}, version ${SAVE_SCHEMA_1}, ${SAVE_SCHEMA_2} ou ${SAVE_SCHEMA} attendue)`,
    );
  }
  return parseSchema2(value);
}

/**
 * Migration du schéma 1 vers la pièce (fonction pure, après validation complète du schéma
 * 1) : le monde affiché devient le bac 0 (sa graine est celle de la pièce, son `tick` celui
 * de la pièce, l'heure affichée ne change donc pas) et chaque monde rangé un bac de plus,
 * dans l'ordre des environnements, **avec sa graine enregistrée** (ADR 0069). Le bassin est
 * au jardin, les autres environnements dans la pièce ; chaque bac porte le nom de son
 * environnement. Le bac sélectionné est le bac 0.
 * @throws RangeError si deux mondes ont le même environnement (impossible après validation).
 */
export function migrateSchema1(
  world: World,
  others: readonly World[],
): { readonly room: RoomState; readonly selectedTankId: number } {
  return syncRoom(null, world, others);
}

/**
 * Mondes d'une sauvegarde pour l'hôte du lot 1 (au plus un bac par environnement, ADR 0063) :
 * le monde du bac sélectionné et ceux des autres bacs, avec la pièce relue. Ne lève jamais.
 */
export function parseSaveWorlds(text: string):
  | {
      readonly ok: true;
      readonly room: RoomState;
      readonly selectedTankId: number;
      readonly world: World;
      readonly others: readonly World[];
      readonly settings: SaveSettings;
    }
  | { readonly ok: false; readonly error: string } {
  const result = parseSave(text);
  if (!result.ok) {
    return result;
  }
  try {
    const worlds = roomWorlds(result.room, result.selectedTankId);
    return {
      ok: true,
      room: result.room,
      selectedTankId: worlds.selectedTankId,
      world: worlds.world,
      others: worlds.others,
      settings: result.settings,
    };
  } catch (error) {
    return failure((error as Error).message);
  }
}

/** Compteurs de la pièce (schéma 2), contrôlés dans cet ordre. */
const ROOM_COUNTER_RULES: readonly FieldRule[] = [
  SEED_RULE,
  TICK_RULE,
  field('nextTankId', uint32, 'nextTankId doit être un entier 32 bits non signé'),
  field('selectedTankId', optional(uint32), 'selectedTankId doit être un entier 32 bits non signé'),
];

function parseSchema2(value: Record<string, unknown>): ParseSaveResult {
  const problems = problemsOf(value, ROOM_COUNTER_RULES);
  const nextTankId = own(value, 'nextTankId');
  const settings = parseSettings(own(value, 'settings'), problems);
  const tanks = parseTanks(own(value, 'tanks'), problems);
  const furniture = parseRoomFurniture(value, problems);
  if (tanks !== null) {
    problems.push(
      ...roomProblems(
        tanks.map((tank) => tank.id),
        isUint32(nextTankId) ? nextTankId : null,
      ),
    );
  }
  if (problems.length > 0 || settings === null || tanks === null || furniture === null) {
    return failureOf(problems);
  }
  const room: RoomState = {
    seed: own(value, 'seed') as number,
    tick: own(value, 'tick') as number,
    tanks,
    nextTankId: nextTankId as number,
    ...furniture,
  };
  problems.push(...roomLayoutProblems(room));
  if (problems.length > 0) {
    return failureOf(problems);
  }
  return {
    ok: true,
    room,
    selectedTankId: resolveSelectedTank(room, own(value, 'selectedTankId') as number | undefined),
    settings,
    schema: SAVE_SCHEMA,
  };
}

/**
 * Meubles de la pièce et leur compteur (lot 2) : absents, aucun meuble et compteur à 0 ; le
 * compteur est obligatoire dès qu'un meuble est posé. `null` si un problème a été ajouté par
 * la liste des meubles.
 */
function parseRoomFurniture(
  value: Record<string, unknown>,
  problems: string[],
): Pick<RoomState, 'furniture' | 'nextFurnitureId'> | null {
  const furnitureValue = own(value, 'furniture');
  const nextFurnitureValue = own(value, 'nextFurnitureId');
  const furniture = furnitureValue === undefined ? [] : parseFurniture(furnitureValue, problems);
  if (nextFurnitureValue !== undefined && !isUint32(nextFurnitureValue)) {
    problems.push('nextFurnitureId doit être un entier 32 bits non signé');
  } else if (nextFurnitureValue === undefined && furniture !== null && furniture.length > 0) {
    problems.push('nextFurnitureId manquant');
  }
  if (furniture === null) {
    return null;
  }
  return { furniture, nextFurnitureId: (nextFurnitureValue as number | undefined) ?? 0 };
}

const TANK_LIST: ListRule = {
  key: 'tanks',
  min: 1,
  max: MAX_ROOM_TANKS,
  countMessage: (count) => `nombre de bacs hors de [1, ${MAX_ROOM_TANKS}] (${count})`,
};

/** Bacs du schéma 2 : liste de 1 à `MAX_ROOM_TANKS` bacs valides, ou `null`. */
function parseTanks(value: unknown, problems: string[]): RoomTank[] | null {
  const items = readList(value, TANK_LIST, problems);
  if (items === null) {
    return null;
  }
  const before = problems.length;
  const tanks: RoomTank[] = [];
  items.forEach((item: unknown, i) => {
    const tank = parseTank(item, i, problems);
    if (tank !== null) {
      tanks.push(tank);
    }
  });
  // Atteignable (#717) : `parseTank` impose la place de chaque bac selon son environnement,
  // mais deux bassins valides sont tous deux au jardin, qui n'en reçoit qu'un.
  if (tanks.filter((tank) => tank.place === 'jardin').length > 1) {
    problems.push('un seul bac au jardin');
  }
  return problems.length > before ? null : tanks;
}

/** Identifiant d'un bac. */
const TANK_ID_RULE = field('id', uint32, 'id doit être un entier 32 bits non signé');

/** Nom d'un bac : texte non vide, puis longueur bornée. */
const TANK_NAME_RULES: readonly FieldRule[] = [
  field(
    'name',
    (v) => typeof v === 'string' && v.trim().length > 0,
    'name doit être un texte non vide',
  ),
  field(
    'name',
    (v) => (v as string).length <= MAX_TANK_NAME_LENGTH,
    `name trop long (${MAX_TANK_NAME_LENGTH} caractères au plus)`,
  ),
];

function parseTank(item: unknown, i: number, problems: string[]): RoomTank | null {
  if (!isRecord(item)) {
    problems.push(`bac ${i} : doit être un objet`);
    return null;
  }
  const id = own(item, 'id');
  const found = problemsOf(item, [TANK_ID_RULE]);
  const nameProblem = firstProblemOf(item, TANK_NAME_RULES);
  if (nameProblem !== null) {
    found.push(nameProblem);
  }
  const place = own(item, 'place');
  const placementValue = own(item, 'placement');
  const placement = placementValue === undefined ? null : parsePlacement(placementValue, found);
  if (placement !== null && place === 'jardin') {
    found.push('placement interdit au jardin');
  }
  const world = parseTankWorld(own(item, 'world'), found);
  if (world !== null && place !== placeOf(world.environment)) {
    found.push(
      `place doit valoir « ${placeOf(world.environment)} » pour l’environnement ${world.environment}`,
    );
  }
  problems.push(...found.map((problem) => `bac ${isUint32(id) ? id : i} : ${problem}`));
  if (found.length > 0 || world === null) {
    return null;
  }
  const name = own(item, 'name') as string;
  return { id: id as number, name, place: place as TankPlace, placement, world };
}

/** Monde d'un bac : un objet de 256 Kio au plus, au corps valide ; sinon `null`. */
function parseTankWorld(value: unknown, found: string[]): World | null {
  if (!isRecord(value)) {
    found.push('world doit être un objet');
    return null;
  }
  if (JSON.stringify(value).length > MAX_SAVE_LENGTH) {
    found.push(`world trop volumineux (${MAX_SAVE_LENGTH / 1024} Kio au plus)`);
    return null;
  }
  return parseWorldBody(value, found);
}

/** Abscisse et profondeur au centimètre. */
function hasCentimetricPosition(record: Record<string, unknown>): boolean {
  const x = own(record, 'x');
  const z = own(record, 'z');
  return typeof x === 'number' && isCentimetric(x) && typeof z === 'number' && isCentimetric(z);
}

/** Quart de tour d'un bac ou d'un meuble. */
const QUARTER: Validator = integerIn(0, 3);

/**
 * Position d'un bac, tous les problèmes relevés. Niveau du support (ADR 0102) : facultatif,
 * absent dans les documents d'avant l'étagère d'animalerie ; sa validité pour le meuble est
 * revue avec la disposition.
 */
const PLACEMENT_RULES: readonly FieldRule[] = [
  field(
    'supportId',
    (v) => v === null || isUint32(v),
    'placement.supportId doit être null ou un entier 32 bits non signé',
  ),
  {
    valid: hasCentimetricPosition,
    message: 'placement.x et placement.z doivent être des mètres au centimètre',
  },
  field('quarter', QUARTER, 'placement.quarter doit être 0, 1, 2 ou 3'),
  field(
    'level',
    optional(integerIn(0, MAX_SUPPORT_LEVELS - 1)),
    `placement.level doit être un entier de 0 à ${MAX_SUPPORT_LEVELS - 1}`,
  ),
];

/** Position d'un bac relue, ou `null` (problème ajouté à `found`). */
function parsePlacement(value: unknown, found: string[]): TankPlacement | null {
  if (!isRecord(value)) {
    found.push('placement doit être un objet');
    return null;
  }
  const problems = problemsOf(value, PLACEMENT_RULES);
  if (problems.length > 0) {
    found.push(...problems);
    return null;
  }
  const placement = {
    supportId: own(value, 'supportId'),
    x: own(value, 'x'),
    z: own(value, 'z'),
    quarter: own(value, 'quarter'),
  } as TankPlacement;
  const level = own(value, 'level');
  return level === undefined ? placement : { ...placement, level: level as number };
}

const FURNITURE_LIST: ListRule = {
  key: 'furniture',
  max: MAX_ROOM_SUPPORTS,
  countMessage: (count) => `trop de meubles (${count}, ${MAX_ROOM_SUPPORTS} au plus)`,
};

/** Meuble : un seul message pour tous ses champs. */
const SUPPORT_MESSAGE = `id, kind (${SUPPORT_KINDS.join(', ')}), x, z ou quarter invalide`;
const SUPPORT_RULES: readonly FieldRule[] = [
  field('id', uint32, SUPPORT_MESSAGE),
  field('kind', (v) => SUPPORT_KINDS.includes(v as SupportKind), SUPPORT_MESSAGE),
  { valid: hasCentimetricPosition, message: SUPPORT_MESSAGE },
  field('quarter', QUARTER, SUPPORT_MESSAGE),
];

/** Meubles du schéma 2 : liste d'au plus `MAX_ROOM_SUPPORTS` meubles valides, ou `null`. */
function parseFurniture(value: unknown, problems: string[]): RoomSupport[] | null {
  const items = readList(value, FURNITURE_LIST, problems);
  if (items === null) {
    return null;
  }
  const before = problems.length;
  const furniture: RoomSupport[] = [];
  items.forEach((item: unknown, i) => {
    const label = `meuble ${i}`;
    if (!isRecord(item)) {
      problems.push(`${label} : doit être un objet`);
      return;
    }
    const problem = firstProblemOf(item, SUPPORT_RULES);
    if (problem !== null) {
      problems.push(`${label} : ${problem}`);
      return;
    }
    const [id, kind, x, z, quarter] = ['id', 'kind', 'x', 'z', 'quarter'].map((key) =>
      own(item, key),
    );
    furniture.push({ id, kind, x, z, quarter } as RoomSupport);
  });
  return problems.length > before ? null : furniture;
}

/**
 * Problèmes de structure de la pièce : au moins un bac, identifiants strictement croissants,
 * compteur supérieur à tous les identifiants (`nextTankId` `null` : non vérifié).
 */
function roomProblems(ids: readonly number[], nextTankId: number | null): string[] {
  const problems: string[] = [];
  if (ids.length === 0 || ids.length > MAX_ROOM_TANKS) {
    problems.push(`nombre de bacs hors de [1, ${MAX_ROOM_TANKS}] (${ids.length})`);
  }
  ids.forEach((id, i) => {
    if (i > 0 && id <= (ids[i - 1] as number)) {
      problems.push(`bac ${id} : identifiants non strictement croissants`);
    }
    if (nextTankId !== null && id >= nextTankId) {
      problems.push(`bac ${id} : identifiant ≥ nextTankId`);
    }
  });
  return problems;
}

function failureOf(problems: readonly string[]): { readonly ok: false; readonly error: string } {
  return failure(problems.slice(0, 5).join(' ; ') + (problems.length > 5 ? ' ; …' : ''));
}

function failure(error: string): { readonly ok: false; readonly error: string } {
  return { ok: false, error };
}
