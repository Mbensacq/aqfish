import { deriveSeed } from '../core/random/prng';
import { ENVIRONMENT_IDS, environmentById, type EnvironmentId } from './environment';
import { advance, createDefaultWorld, type SimClock, type World } from './world';

/**
 * État de la pièce de N bacs (épopée #264, ADR 0061 et 0069), lot 1 : modèle de données
 * seulement. Chaque bac porte un `World` inchangé, dans son propre repère ; la pièce ajoute
 * autour un identifiant, un nom, un lieu (pièce ou jardin), une graine et un compteur de pas.
 *
 * Aucune lecture croisée : une fonction qui avance un bac ne voit jamais les autres
 * (`stepRoom`). Les meubles, supports et positions des bacs dans la pièce arrivent au lot 2
 * (ADR 0069) ; d'ici là, la pièce graphique reste celle des réglages (`sim/room.ts`).
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
  return { seed, tick: 0, tanks, nextTankId: tanks.length };
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
    room: { seed: previous?.seed ?? shown.seed, tick: shown.tick, tanks, nextTankId },
    selectedTankId: selected.id,
  };
}

function newTank(id: number, world: World): RoomTank {
  return {
    id,
    name: defaultTankName(world.environment),
    place: placeOf(world.environment),
    world,
  };
}
