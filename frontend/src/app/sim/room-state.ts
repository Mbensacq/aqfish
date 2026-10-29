import { deriveSeed } from '../core/random/prng';
import {
  ENVIRONMENT_IDS,
  environmentById,
  isTankResizable,
  placeDimensions,
  type EnvironmentId,
} from './environment';
import type { RoomQuarter } from './room';
import type { TankDimensions } from './tank';
import { withTankDimensions } from './tank-resize';
import { advance, createDefaultWorld, createWorld, type SimClock, type World } from './world';

/**
 * État de la pièce de N bacs (épopée #264, ADR 0061 et 0069), lot 1 : modèle de données
 * seulement. Chaque bac porte un `World` inchangé, dans son propre repère ; la pièce ajoute
 * autour un identifiant, un nom, un lieu (pièce ou jardin), une graine et un compteur de pas.
 *
 * Aucune lecture croisée : une fonction qui avance un bac ne voit jamais les autres
 * (`stepRoom`). Lot 2 (ADR 0073) : meubles supports et position des bacs dans la pièce
 * (`addSupport`, `addTank`, `moveTank`, `removeTank`…), pose analytique au centimètre ; la
 * pièce graphique des réglages (`sim/room.ts`) reste celle du bac affiché.
 */

/** Nombre maximal de bacs dans une pièce (borne de validation provisoire, ADR 0061). */
export const MAX_ROOM_TANKS = 32;

/** Longueur maximale du nom d'un bac, en caractères. */
export const MAX_TANK_NAME_LENGTH = 40;

/**
 * Sel de domaine des graines des bacs (ADR 0061) : sans lui, la graine du bac `k` serait
 * celle du sous-générateur du poisson `k` du bac 0 (`deriveSeed(seed, k)`).
 */
export const TANK_SEED_SALT = 0x6261_6373; // « bacs »

/** Lieu d'un bac : dans la pièce, ou au jardin (le bassin, seul environnement extérieur). */
export type TankPlace = 'piece' | 'jardin';

/** Un bac de la pièce. */
export interface RoomTank {
  /** Identifiant entier 32 bits non signé, jamais réutilisé ; 0 pour le premier bac. */
  readonly id: number;
  /** Nom affiché (1 à `MAX_TANK_NAME_LENGTH` caractères). */
  readonly name: string;
  readonly place: TankPlace;
  /**
   * Position dans la pièce (lot 2, ADR 0073). `null` : position historique, au centre de la
   * pièce sur le meuble implicite des réglages (`sim/room.ts`) ; toujours `null` au jardin.
   */
  readonly placement: TankPlacement | null;
  /** Monde du bac, inchangé par rapport au bac unique d'avant la pièce. */
  readonly world: World;
}

/** État de la pièce. */
export interface RoomState {
  /** Graine de la pièce (celle de l'URL ou tirée) : graine du bac 0. */
  readonly seed: number;
  /**
   * Pas de la pièce. Lot 1 : celui du bac sélectionné, tant que les autres bacs restent figés
   * (ADR 0063) ; il deviendra l'âge de la pièce quand tous les bacs avanceront ensemble.
   */
  readonly tick: number;
  /** Bacs, triés par identifiant strictement croissant ; au moins un. */
  readonly tanks: readonly RoomTank[];
  /** Prochain identifiant de bac, supérieur à tous les identifiants. */
  readonly nextTankId: number;
  /** Meubles supports, triés par identifiant strictement croissant (lot 2, ADR 0073). */
  readonly furniture: readonly RoomSupport[];
  /** Prochain identifiant de meuble, supérieur à tous les identifiants. */
  readonly nextFurnitureId: number;
}

/** Lieu d'un environnement : le bassin est au jardin, tous les autres dans la pièce. */
export function placeOf(environment: EnvironmentId): TankPlace {
  return environment === 'bassin' ? 'jardin' : 'piece';
}

/** Nom par défaut d'un bac : celui de son environnement. */
export function defaultTankName(environment: EnvironmentId): string {
  return environmentById(environment).name;
}

/**
 * Graine d'un bac : celle de la pièce pour le bac 0 (migration et captures à l'octet),
 * `deriveSeed(deriveSeed(graine, TANK_SEED_SALT), id)` sinon. Ajouter ou retirer un bac ne
 * change pas la graine des autres.
 * @throws RangeError si la graine ou l'identifiant n'est pas un entier 32 bits non signé.
 */
export function tankSeed(roomSeed: number, id: number): number {
  // Valide aussi la graine de la pièce (lève si elle n'est pas un entier 32 bits non signé).
  const salted = deriveSeed(roomSeed, TANK_SEED_SALT);
  return id === 0 ? roomSeed : deriveSeed(salted, id);
}

/**
 * Pièce neuve : un bac par environnement de `environments` (identifiants 0, 1, …), chacun
 * dans son monde de départ (`createDefaultWorld`) avec la graine `tankSeed`.
 * @throws RangeError si la graine est invalide, ou si la liste est vide ou trop longue.
 */
export function createRoom(
  seed: number,
  environments: readonly EnvironmentId[] = ['tropical'],
): RoomState {
  if (environments.length === 0 || environments.length > MAX_ROOM_TANKS) {
    throw new RangeError(`nombre de bacs hors de [1, ${MAX_ROOM_TANKS}]`);
  }
  const tanks = environments.map((environment, id) =>
    newTank(id, createDefaultWorld(tankSeed(seed, id), environment)),
  );
  return { seed, tick: 0, tanks, nextTankId: tanks.length, furniture: [], nextFurnitureId: 0 };
}

/**
 * Avance tous les bacs de `steps` pas, par identifiant croissant, avec l'horloge commune,
 * puis le compteur de la pièce. Fonction pure : `room` et ses mondes ne sont pas modifiés.
 * Chaque bac est avancé seul (`advance`) : son état est identique, au bit près, à celui
 * d'un bac sans voisin.
 * @throws RangeError si `steps` n'est pas un entier positif ou nul.
 */
export function stepRoom(room: RoomState, steps: number, clock: SimClock = null): RoomState {
  const tanks = room.tanks.map((tank) => ({ ...tank, world: advance(tank.world, steps, clock) }));
  return { ...room, tick: room.tick + steps, tanks };
}

/** Bac d'identifiant `id`, ou `undefined`. */
export function findTank(room: RoomState, id: number): RoomTank | undefined {
  return room.tanks.find((tank) => tank.id === id);
}

/**
 * Identifiant du bac sélectionné : `wanted` s'il existe, sinon le plus petit identifiant
 * (bac supprimé, sauvegarde modifiée ou sélection absente, ADR 0061).
 */
export function resolveSelectedTank(room: RoomState, wanted: number | null | undefined): number {
  const first = room.tanks[0];
  if (first === undefined) {
    throw new RangeError('pièce sans bac');
  }
  return wanted !== null && wanted !== undefined && findTank(room, wanted) !== undefined
    ? wanted
    : first.id;
}

/** Mondes d'une pièce vus par l'hôte : le bac sélectionné et les autres (mondes rangés). */
export interface RoomWorlds {
  readonly world: World;
  readonly others: readonly World[];
  readonly selectedTankId: number;
}

/**
 * Mondes de la pièce pour l'hôte du lot 1, qui garde au plus un bac par environnement
 * (ADR 0063) : le monde du bac sélectionné et ceux des autres bacs, dans l'ordre des
 * identifiants.
 * @throws RangeError si deux bacs ont le même environnement (pièce d'un lot ultérieur).
 */
export function roomWorlds(room: RoomState, selectedTankId: number | null): RoomWorlds {
  const selected = resolveSelectedTank(room, selectedTankId);
  const seen = new Set<EnvironmentId>();
  for (const tank of room.tanks) {
    if (seen.has(tank.world.environment)) {
      throw new RangeError(
        `plusieurs bacs du même environnement (${tank.world.environment}) : pas encore pris en charge`,
      );
    }
    seen.add(tank.world.environment);
  }
  const world = (findTank(room, selected) as RoomTank).world;
  const others = room.tanks.filter((tank) => tank.id !== selected).map((tank) => tank.world);
  return { world, others, selectedTankId: selected };
}

/**
 * Pièce de l'hôte du lot 1, à partir du monde affiché et des mondes rangés (au plus un par
 * environnement). Les bacs déjà présents dans `previous` (même environnement) gardent leur
 * identifiant et leur nom ; un environnement nouveau reçoit le prochain identifiant. Sans
 * pièce précédente, le monde affiché est le bac 0 et les autres suivent dans l'ordre de
 * `ENVIRONMENT_IDS` (comme la migration du schéma 1). Le compteur de la pièce est celui du
 * monde affiché ; les mondes ne sont pas copiés.
 * @throws RangeError si deux mondes ont le même environnement, ou s'il y a trop de bacs.
 */
export function syncRoom(
  previous: RoomState | null,
  shown: World,
  others: readonly World[],
): { readonly room: RoomState; readonly selectedTankId: number } {
  const byEnvironment = new Map<EnvironmentId, World>([[shown.environment, shown]]);
  for (const world of others) {
    if (byEnvironment.has(world.environment)) {
      throw new RangeError(`environnement en double (${world.environment})`);
    }
    byEnvironment.set(world.environment, world);
  }
  if (byEnvironment.size > MAX_ROOM_TANKS) {
    throw new RangeError(`trop de bacs (${byEnvironment.size}, ${MAX_ROOM_TANKS} au plus)`);
  }
  const tanks: RoomTank[] = [];
  let nextTankId = previous?.nextTankId ?? 0;
  for (const tank of previous?.tanks ?? []) {
    const world = byEnvironment.get(tank.world.environment);
    if (world !== undefined) {
      tanks.push({ ...tank, world });
      byEnvironment.delete(tank.world.environment);
    }
  }
  const remaining = [shown.environment, ...ENVIRONMENT_IDS].filter(
    (id, i, all) => byEnvironment.has(id) && all.indexOf(id) === i,
  );
  for (const environment of remaining) {
    tanks.push(newTank(nextTankId++, byEnvironment.get(environment) as World));
  }
  tanks.sort((a, b) => a.id - b.id);
  const selected = tanks.find((tank) => tank.world === shown) as RoomTank;
  return {
    room: {
      seed: previous?.seed ?? shown.seed,
      tick: shown.tick,
      tanks,
      nextTankId,
      furniture: previous?.furniture ?? [],
      nextFurnitureId: previous?.nextFurnitureId ?? 0,
    },
    selectedTankId: selected.id,
  };
}

function newTank(id: number, world: World): RoomTank {
  return {
    id,
    name: defaultTankName(world.environment),
    place: placeOf(world.environment),
    placement: null,
    world,
  };
}

// ─── Lot 2 : bacs et meubles (ADR 0073) ──────────────────────────────────────────────────

/** Nombre maximal de meubles supports dans la pièce (borne provisoire, comme `MAX_ROOM_ITEMS`). */
export const MAX_ROOM_SUPPORTS = 24;

/**
 * Sol de la pièce, en mètres, origine au centre : une emprise (meuble ou bac posé au sol) doit
 * y tenir entièrement. 8 × 6 m, de quoi aligner plusieurs meubles d'aquarium.
 */
export const ROOM_FLOOR = { halfWidth: 4, halfDepth: 3 } as const;

/** Tailles de bac du catalogue, pour les environnements aux dimensions réglables. */
export const TANK_SIZE_IDS = ['petit', 'moyen', 'grand'] as const;
export type TankSizeId = (typeof TANK_SIZE_IDS)[number];

/** Taille de bac du catalogue : nom affiché et dimensions intérieures (dans `TANK_LIMITS`). */
export interface TankSize {
  readonly name: string;
  readonly dimensions: TankDimensions;
}

/**
 * Catalogue des tailles de bac (ADR 0073). Toutes dans `TANK_LIMITS` (60 à 200 cm de long) ;
 * le nano-bac, sous ces limites, attend leur élargissement.
 */
export const TANK_SIZES: Readonly<Record<TankSizeId, TankSize>> = {
  petit: { name: 'Petit bac (60 cm)', dimensions: { width: 0.6, height: 0.5, depth: 0.3 } },
  moyen: { name: 'Bac moyen (100 cm)', dimensions: { width: 1, height: 0.5, depth: 0.4 } },
  grand: { name: 'Grand bac (150 cm)', dimensions: { width: 1.5, height: 0.6, depth: 0.5 } },
};

/** Types de meubles supports. */
export const SUPPORT_KINDS = ['commode', 'etagere-bacs'] as const;
export type SupportKind = (typeof SUPPORT_KINDS)[number];

/** Modèle d'un meuble support : emprise et hauteur du plateau, en centimètres entiers. */
export interface SupportModel {
  readonly name: string;
  readonly width: number;
  readonly depth: number;
  readonly height: number;
}

/** Catalogue des meubles supports (un seul niveau par meuble au lot 2, ADR 0073). */
export const SUPPORT_CATALOG: Readonly<Record<SupportKind, SupportModel>> = {
  commode: { name: 'Commode', width: 120, depth: 50, height: 75 },
  'etagere-bacs': { name: 'Étagère basse', width: 160, depth: 45, height: 40 },
};

/** Meuble support posé au sol : centre de son emprise (mètres, au centimètre) et quart de tour. */
export interface RoomSupport {
  readonly id: number;
  readonly kind: SupportKind;
  readonly x: number;
  readonly z: number;
  readonly quarter: RoomQuarter;
}

/**
 * Position d'un bac dans la pièce : support (`null` : le sol), centre de son emprise
 * (mètres, au centimètre, repère de la pièce) et quart de tour.
 */
export interface TankPlacement {
  readonly supportId: number | null;
  readonly x: number;
  readonly z: number;
  readonly quarter: RoomQuarter;
}

/** Raisons d'un refus de pose, d'ajout ou de retrait. */
export type RoomLayoutRefusal =
  | 'piece-pleine'
  | 'bac-inconnu'
  | 'meuble-inconnu'
  | 'hors-piece'
  | 'hors-support'
  | 'chevauchement'
  | 'support-occupe'
  | 'jardin'
  | 'dernier-bac'
  | 'position-invalide';

/** Résultat d'une modification de la disposition : nouvelle pièce et identifiant, ou refus. */
export type RoomLayoutResult =
  | { readonly ok: true; readonly room: RoomState; readonly id: number }
  | { readonly ok: false; readonly reason: RoomLayoutRefusal };

/** Boîte alignée sur les axes, en centimètres entiers, base comptée depuis le parquet. */
interface CmBox {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/** Vrai si `value` est un multiple du centimètre, fini (`-1.4` oui, `0.123` non). */
export function isCentimetric(value: number): boolean {
  return Number.isFinite(value) && Math.round(value * 100) / 100 === value;
}

function cm(value: number): number {
  return Math.round(value * 100);
}

function isQuarter(value: unknown): value is RoomQuarter {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

/** Boîte centrée en (x, z) d'une emprise `width` × `depth` tournée de `quarter`. */
function footprintBox(
  x: number,
  z: number,
  width: number,
  depth: number,
  quarter: RoomQuarter,
  minY: number,
  maxY: number,
): CmBox {
  const [w, d] = quarter % 2 === 0 ? [width, depth] : [depth, width];
  // Les demi-cotes impaires tombent au demi-centimètre : on compte en demi-centimètres.
  const cx = cm(x) * 2;
  const cz = cm(z) * 2;
  return {
    minX: cx - w,
    maxX: cx + w,
    minY: minY * 2,
    maxY: maxY * 2,
    minZ: cz - d,
    maxZ: cz + d,
  };
}

function overlaps(a: CmBox, b: CmBox): boolean {
  return (
    a.minX < b.maxX &&
    b.minX < a.maxX &&
    a.minY < b.maxY &&
    b.minY < a.maxY &&
    a.minZ < b.maxZ &&
    b.minZ < a.maxZ
  );
}

function insideFloor(box: CmBox): boolean {
  const hw = ROOM_FLOOR.halfWidth * 200;
  const hd = ROOM_FLOOR.halfDepth * 200;
  return box.minX >= -hw && box.maxX <= hw && box.minZ >= -hd && box.maxZ <= hd;
}

/** Dimensions d'un bac (les siennes, sinon celles de son environnement). */
export function tankDimensionsOf(tank: RoomTank): TankDimensions {
  return placeDimensions(
    tank.world.dimensions === undefined
      ? tank.world.environment
      : { environment: tank.world.environment, dimensions: tank.world.dimensions },
  );
}

function supportBox(support: RoomSupport): CmBox {
  const model = SUPPORT_CATALOG[support.kind];
  return footprintBox(
    support.x,
    support.z,
    model.width,
    model.depth,
    support.quarter,
    0,
    model.height,
  );
}

/** Hauteur maximale d'une colonne réservée (bac à la position historique). */
const COLUMN_TOP = 1_000_000;

/**
 * Boîte d'un bac posé, ou colonne réservée au centre pour un bac à la position historique
 * (`placement` `null` : bac et meuble implicite, jusqu'au plafond), ou `null` au jardin.
 */
function tankBox(room: RoomState, tank: RoomTank, placement = tank.placement): CmBox | null {
  if (tank.place === 'jardin') {
    return null;
  }
  const dims = tankDimensionsOf(tank);
  const width = cm(dims.width);
  const depth = cm(dims.depth);
  if (placement === null) {
    return footprintBox(0, 0, width + 4, depth + 4, 0, 0, COLUMN_TOP);
  }
  const support =
    placement.supportId === null
      ? null
      : room.furniture.find((item) => item.id === placement.supportId);
  const base = support === undefined || support === null ? 0 : SUPPORT_CATALOG[support.kind].height;
  return footprintBox(
    placement.x,
    placement.z,
    width,
    depth,
    placement.quarter,
    base,
    base + cm(dims.height),
  );
}

/**
 * Raison du refus de poser le bac `tank` à `placement` dans `room` (le bac lui-même, s'il y
 * est déjà, est ignoré), ou `null` si la pose est permise : coordonnées au centimètre, support
 * existant, emprise entièrement sur le plateau du support (ou sur le sol de la pièce), aucun
 * chevauchement avec un meuble ou un autre bac (se toucher est permis).
 */
export function tankPlacementRefusal(
  room: RoomState,
  tank: RoomTank,
  placement: TankPlacement,
): RoomLayoutRefusal | null {
  if (tank.place === 'jardin') {
    return 'jardin';
  }
  if (!isCentimetric(placement.x) || !isCentimetric(placement.z) || !isQuarter(placement.quarter)) {
    return 'position-invalide';
  }
  let support: RoomSupport | null = null;
  if (placement.supportId !== null) {
    support = room.furniture.find((item) => item.id === placement.supportId) ?? null;
    if (support === null) {
      return 'meuble-inconnu';
    }
  }
  const box = tankBox(room, tank, placement) as CmBox;
  if (!insideFloor(box)) {
    return 'hors-piece';
  }
  if (support !== null) {
    const top = supportBox(support);
    if (box.minX < top.minX || box.maxX > top.maxX || box.minZ < top.minZ || box.maxZ > top.maxZ) {
      return 'hors-support';
    }
  }
  for (const item of room.furniture) {
    if (overlaps(box, supportBox(item))) {
      return 'chevauchement';
    }
  }
  for (const other of room.tanks) {
    const otherBox = other.id === tank.id ? null : tankBox(room, other);
    if (otherBox !== null && overlaps(box, otherBox)) {
      return 'chevauchement';
    }
  }
  return null;
}

/**
 * Pose un meuble support au sol. Refus : pièce pleine (`MAX_ROOM_SUPPORTS`), position non
 * centimétrique, emprise hors du sol, chevauchement d'un meuble ou d'un bac. Pur.
 */
export function addSupport(
  room: RoomState,
  kind: SupportKind,
  x: number,
  z: number,
  quarter: RoomQuarter = 0,
): RoomLayoutResult {
  if (room.furniture.length >= MAX_ROOM_SUPPORTS) {
    return { ok: false, reason: 'piece-pleine' };
  }
  if (
    !SUPPORT_KINDS.includes(kind) ||
    !isCentimetric(x) ||
    !isCentimetric(z) ||
    !isQuarter(quarter)
  ) {
    return { ok: false, reason: 'position-invalide' };
  }
  const support: RoomSupport = { id: room.nextFurnitureId, kind, x, z, quarter };
  const refusal = supportRefusal(room, support);
  if (refusal !== null) {
    return { ok: false, reason: refusal };
  }
  return {
    ok: true,
    room: {
      ...room,
      furniture: [...room.furniture, support],
      nextFurnitureId: room.nextFurnitureId + 1,
    },
    id: support.id,
  };
}

/** Raison du refus d'un meuble `support` dans `room` (lui-même ignoré), ou `null`. */
export function supportRefusal(room: RoomState, support: RoomSupport): RoomLayoutRefusal | null {
  const box = supportBox(support);
  if (!insideFloor(box)) {
    return 'hors-piece';
  }
  for (const item of room.furniture) {
    if (item.id !== support.id && overlaps(box, supportBox(item))) {
      return 'chevauchement';
    }
  }
  for (const tank of room.tanks) {
    const carried = tank.placement?.supportId === support.id;
    const other = carried ? null : tankBox(room, tank);
    if (other !== null && overlaps(box, other)) {
      return 'chevauchement';
    }
  }
  return null;
}

/** Retire le meuble `id`. Refus : meuble inconnu, ou un bac repose dessus (`support-occupe`). */
export function removeSupport(room: RoomState, id: number): RoomLayoutResult {
  if (!room.furniture.some((item) => item.id === id)) {
    return { ok: false, reason: 'meuble-inconnu' };
  }
  if (room.tanks.some((tank) => tank.placement?.supportId === id)) {
    return { ok: false, reason: 'support-occupe' };
  }
  return { ok: true, room: { ...room, furniture: room.furniture.filter((i) => i.id !== id) }, id };
}

/** Demande d'ajout d'un bac : environnement, taille (environnements réglables) et position. */
export interface AddTankRequest {
  readonly environment: EnvironmentId;
  /** Taille du catalogue ; ignorée si l'environnement a des dimensions fixes. */
  readonly size: TankSizeId;
  readonly placement: TankPlacement;
  /** Nom ; par défaut celui de l'environnement. */
  readonly name?: string;
}

/**
 * Ajoute un bac **vide** (décor de départ de l'environnement, aucun animal) avec l'identifiant
 * `nextTankId` et la graine `tankSeed` : ajouter un bac ne change ni la graine ni l'état des
 * autres. Refus : pièce pleine (`MAX_ROOM_TANKS`), bassin (il est au jardin), pose refusée
 * (`tankPlacementRefusal`). Pur.
 * @throws RangeError si l'environnement est inconnu.
 */
export function addTank(room: RoomState, request: AddTankRequest): RoomLayoutResult {
  if (room.tanks.length >= MAX_ROOM_TANKS) {
    return { ok: false, reason: 'piece-pleine' };
  }
  const { environment } = request;
  const env = environmentById(environment);
  if (placeOf(environment) === 'jardin') {
    return { ok: false, reason: 'jardin' };
  }
  const id = room.nextTankId;
  const empty = createWorld(tankSeed(room.seed, id), [], [], env.decor, environment);
  const world = isTankResizable(environment)
    ? (withTankDimensions(empty, TANK_SIZES[request.size].dimensions) as World)
    : empty;
  const name = cleanTankName(request.name) ?? defaultTankName(environment);
  const tank: RoomTank = { ...newTank(id, world), name, placement: request.placement };
  const refusal = tankPlacementRefusal(room, tank, request.placement);
  if (refusal !== null) {
    return { ok: false, reason: refusal };
  }
  return { ok: true, room: { ...room, tanks: [...room.tanks, tank], nextTankId: id + 1 }, id };
}

/** Déplace (ou tourne) le bac `id` à `placement`. Refus comme `tankPlacementRefusal`. Pur. */
export function moveTank(room: RoomState, id: number, placement: TankPlacement): RoomLayoutResult {
  const tank = findTank(room, id);
  if (tank === undefined) {
    return { ok: false, reason: 'bac-inconnu' };
  }
  const refusal = tankPlacementRefusal(room, tank, placement);
  if (refusal !== null) {
    return { ok: false, reason: refusal };
  }
  return { ok: true, room: replaceTank(room, { ...tank, placement }), id };
}

/**
 * Retire le bac `id` et ses animaux. Refus : bac inconnu, ou dernier bac de la pièce. La
 * confirmation d'un bac peuplé revient à l'interface (`tankAnimalCount`). Les identifiants et
 * graines des autres bacs ne changent pas. Pur.
 */
export function removeTank(room: RoomState, id: number): RoomLayoutResult {
  if (findTank(room, id) === undefined) {
    return { ok: false, reason: 'bac-inconnu' };
  }
  if (room.tanks.length === 1) {
    return { ok: false, reason: 'dernier-bac' };
  }
  return { ok: true, room: { ...room, tanks: room.tanks.filter((t) => t.id !== id) }, id };
}

/** Renomme le bac `id` (nom rogné, 1 à `MAX_TANK_NAME_LENGTH` caractères). `null` si refusé. */
export function renameTank(room: RoomState, id: number, name: string): RoomState | null {
  const tank = findTank(room, id);
  const clean = cleanTankName(name);
  return tank === undefined || clean === null ? null : replaceTank(room, { ...tank, name: clean });
}

/** Nombre d'animaux du bac (confirmation avant de retirer un bac peuplé). */
export function tankAnimalCount(tank: RoomTank): number {
  return tank.world.entities.length;
}

function cleanTankName(name: string | undefined): string | null {
  const clean = typeof name === 'string' ? name.trim() : '';
  return clean.length === 0 || clean.length > MAX_TANK_NAME_LENGTH ? null : clean;
}

function replaceTank(room: RoomState, tank: RoomTank): RoomState {
  return { ...room, tanks: room.tanks.map((t) => (t.id === tank.id ? tank : t)) };
}

/**
 * Problèmes de disposition d'une pièce relue (lot 2) : meubles aux identifiants strictement
 * croissants inférieurs au compteur, sans chevauchement ; bacs posés valides
 * (`tankPlacementRefusal`). Liste vide si la pièce est cohérente.
 */
export function roomLayoutProblems(room: RoomState): string[] {
  const problems: string[] = [];
  if (room.furniture.length > MAX_ROOM_SUPPORTS) {
    problems.push(`trop de meubles (${MAX_ROOM_SUPPORTS} au plus)`);
  }
  room.furniture.forEach((item, i) => {
    const previous = room.furniture[i - 1];
    if (previous !== undefined && item.id <= previous.id) {
      problems.push(`meuble ${item.id} : identifiants non strictement croissants`);
    }
    if (item.id >= room.nextFurnitureId) {
      problems.push(`meuble ${item.id} : identifiant ≥ nextFurnitureId`);
    }
    const refusal = supportRefusal(room, item);
    if (refusal !== null) {
      problems.push(`meuble ${item.id} : ${refusal}`);
    }
  });
  for (const tank of room.tanks) {
    const refusal =
      tank.placement === null ? null : tankPlacementRefusal(room, tank, tank.placement);
    if (refusal !== null) {
      problems.push(`bac ${tank.id} : ${refusal}`);
    }
  }
  return problems;
}
