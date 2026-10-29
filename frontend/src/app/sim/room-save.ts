import {
  DEFAULT_SAVE_SETTINGS,
  describe,
  isIntegerIn,
  isRecord,
  isUint32,
  MAX_SAVE_LENGTH,
  MAX_SAVE_TICK,
  own,
  parseSaveData,
  parseSettings,
  parseWorldBody,
  SAVE_FORMAT,
  SAVE_SCHEMA,
  SAVE_SCHEMA_1,
  savedWorld,
  settingsData,
  type SavedWorld,
  type SaveSettings,
} from './save';
import {
  isCentimetric,
  MAX_ROOM_SUPPORTS,
  MAX_ROOM_TANKS,
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
import type { World } from './world';

/**
 * Sauvegarde de la pièce au schéma 2 (épopée #264, lot 1, ADR 0061 et 0069).
 *
 * Écriture : `serializeRoom` écrit **toujours** le schéma 2. Lecture : `parseSave` lit le
 * schéma 2 et le schéma 1 (migré par `migrateSchema1`, après sa validation complète) ; tout
 * autre schéma est refusé. Le corps du monde de chaque bac est exactement celui du schéma 1
 * (graine comprise, ADR 0069), relu par le même validateur, avec ses messages préfixés du bac.
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
      readonly schema: typeof SAVE_SCHEMA | typeof SAVE_SCHEMA_1;
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
  if (schema !== SAVE_SCHEMA) {
    return failure(
      `version de sauvegarde inconnue (${describe(schema)}, version ${SAVE_SCHEMA_1} ou ${SAVE_SCHEMA} attendue)`,
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

function parseSchema2(value: Record<string, unknown>): ParseSaveResult {
  const problems: string[] = [];
  const seed = own(value, 'seed');
  if (!isUint32(seed)) {
    problems.push('seed doit être un entier 32 bits non signé');
  }
  const tick = own(value, 'tick');
  if (!isIntegerIn(tick, 0, MAX_SAVE_TICK)) {
    problems.push(`tick doit être un entier dans [0, ${MAX_SAVE_TICK}]`);
  }
  const nextTankId = own(value, 'nextTankId');
  if (!isUint32(nextTankId)) {
    problems.push('nextTankId doit être un entier 32 bits non signé');
  }
  const selectedValue = own(value, 'selectedTankId');
  if (selectedValue !== undefined && !isUint32(selectedValue)) {
    problems.push('selectedTankId doit être un entier 32 bits non signé');
  }
  const settings = parseSettings(own(value, 'settings'), problems);
  const tanks = parseTanks(own(value, 'tanks'), problems);
  const furnitureValue = own(value, 'furniture');
  const nextFurnitureValue = own(value, 'nextFurnitureId');
  const furniture = furnitureValue === undefined ? [] : parseFurniture(furnitureValue, problems);
  if (nextFurnitureValue !== undefined && !isUint32(nextFurnitureValue)) {
    problems.push('nextFurnitureId doit être un entier 32 bits non signé');
  } else if (nextFurnitureValue === undefined && furniture !== null && furniture.length > 0) {
    problems.push('nextFurnitureId manquant');
  }
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
    seed: seed as number,
    tick: tick as number,
    tanks,
    nextTankId: nextTankId as number,
    furniture,
    nextFurnitureId: (nextFurnitureValue as number | undefined) ?? 0,
  };
  problems.push(...roomLayoutProblems(room));
  if (problems.length > 0) {
    return failureOf(problems);
  }
  return {
    ok: true,
    room,
    selectedTankId: resolveSelectedTank(room, selectedValue as number | undefined),
    settings,
    schema: SAVE_SCHEMA,
  };
}

/** Bacs du schéma 2 : liste de 1 à `MAX_ROOM_TANKS` bacs valides, ou `null`. */
function parseTanks(value: unknown, problems: string[]): RoomTank[] | null {
  if (!Array.isArray(value)) {
    problems.push('tanks doit être une liste');
    return null;
  }
  if (value.length === 0 || value.length > MAX_ROOM_TANKS) {
    problems.push(`nombre de bacs hors de [1, ${MAX_ROOM_TANKS}] (${value.length})`);
    return null;
  }
  const before = problems.length;
  const tanks: RoomTank[] = [];
  value.forEach((item: unknown, i) => {
    const tank = parseTank(item, i, problems);
    if (tank !== null) {
      tanks.push(tank);
    }
  });
  if (tanks.filter((tank) => tank.place === 'jardin').length > 1) {
    problems.push('un seul bac au jardin');
  }
  return problems.length > before ? null : tanks;
}

function parseTank(item: unknown, i: number, problems: string[]): RoomTank | null {
  if (!isRecord(item)) {
    problems.push(`bac ${i} : doit être un objet`);
    return null;
  }
  const id = own(item, 'id');
  const label = `bac ${isUint32(id) ? id : i}`;
  const found: string[] = [];
  if (!isUint32(id)) {
    found.push('id doit être un entier 32 bits non signé');
  }
  const name = own(item, 'name');
  if (typeof name !== 'string' || name.trim().length === 0) {
    found.push('name doit être un texte non vide');
  } else if (name.length > MAX_TANK_NAME_LENGTH) {
    found.push(`name trop long (${MAX_TANK_NAME_LENGTH} caractères au plus)`);
  }
  const place = own(item, 'place');
  const placementValue = own(item, 'placement');
  const placement = placementValue === undefined ? null : parsePlacement(placementValue, found);
  if (placement !== null && place === 'jardin') {
    found.push('placement interdit au jardin');
  }
  const worldValue = own(item, 'world');
  let world: World | null = null;
  if (!isRecord(worldValue)) {
    found.push('world doit être un objet');
  } else if (JSON.stringify(worldValue).length > MAX_SAVE_LENGTH) {
    found.push(`world trop volumineux (${MAX_SAVE_LENGTH / 1024} Kio au plus)`);
  } else {
    world = parseWorldBody(worldValue, found);
  }
  if (world !== null && place !== placeOf(world.environment)) {
    found.push(
      `place doit valoir « ${placeOf(world.environment)} » pour l’environnement ${world.environment}`,
    );
  }
  problems.push(...found.map((problem) => `${label} : ${problem}`));
  if (found.length > 0 || world === null) {
    return null;
  }
  return { id: id as number, name: name as string, place: place as TankPlace, placement, world };
}

/** Position d'un bac relue, ou `null` (problème ajouté à `found`). */
function parsePlacement(value: unknown, found: string[]): TankPlacement | null {
  if (!isRecord(value)) {
    found.push('placement doit être un objet');
    return null;
  }
  const supportId = own(value, 'supportId');
  const x = own(value, 'x');
  const z = own(value, 'z');
  const quarter = own(value, 'quarter');
  const before = found.length;
  if (supportId !== null && !isUint32(supportId)) {
    found.push('placement.supportId doit être null ou un entier 32 bits non signé');
  }
  if (typeof x !== 'number' || !isCentimetric(x) || typeof z !== 'number' || !isCentimetric(z)) {
    found.push('placement.x et placement.z doivent être des mètres au centimètre');
  }
  if (!isIntegerIn(quarter, 0, 3)) {
    found.push('placement.quarter doit être 0, 1, 2 ou 3');
  }
  return found.length > before ? null : ({ supportId, x, z, quarter } as TankPlacement);
}

/** Meubles du schéma 2 : liste d'au plus `MAX_ROOM_SUPPORTS` meubles valides, ou `null`. */
function parseFurniture(value: unknown, problems: string[]): RoomSupport[] | null {
  if (!Array.isArray(value)) {
    problems.push('furniture doit être une liste');
    return null;
  }
  if (value.length > MAX_ROOM_SUPPORTS) {
    problems.push(`trop de meubles (${value.length}, ${MAX_ROOM_SUPPORTS} au plus)`);
    return null;
  }
  const before = problems.length;
  const furniture: RoomSupport[] = [];
  value.forEach((item: unknown, i) => {
    const label = `meuble ${i}`;
    if (!isRecord(item)) {
      problems.push(`${label} : doit être un objet`);
      return;
    }
    const id = own(item, 'id');
    const kind = own(item, 'kind');
    const x = own(item, 'x');
    const z = own(item, 'z');
    const quarter = own(item, 'quarter');
    const ok =
      isUint32(id) &&
      SUPPORT_KINDS.includes(kind as SupportKind) &&
      typeof x === 'number' &&
      isCentimetric(x) &&
      typeof z === 'number' &&
      isCentimetric(z) &&
      isIntegerIn(quarter, 0, 3);
    if (!ok) {
      problems.push(`${label} : id, kind (${SUPPORT_KINDS.join(', ')}), x, z ou quarter invalide`);
      return;
    }
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
