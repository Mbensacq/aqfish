import {
  populationCounts,
  populationLimit,
  SPECIES_IDS,
  type PopulationCounts,
} from './population';
import { findTank, ROOM_TANK_CAP, tankAnimalCount, type RoomState } from './room-state';
import type { SpeciesId } from './species';
import type { World } from './world';

/**
 * Plafonds de performance de la pièce de N bacs (épopée #264, lot 4, issue #392, ADR 0096).
 *
 * Tous les bacs avancent (ADR 0076) : le coût de simulation d'une pièce est la somme de celui
 * de ses bacs, et celui d'un bac croît comme le carré de son nombre d'animaux (banc et
 * espacement entre congénères, `sim/flocking.ts`). Deux plafonds, mesurés par
 * `scripts/mesure-piece.mjs` :
 *
 * - `ROOM_TANK_CAP` bacs : refus d'**ajouter** un bac au-delà ;
 * - `ROOM_ANIMAL_CAP` animaux, tous bacs confondus : refus d'**ajouter** un animal au-delà.
 *
 * Ce sont des plafonds d'ajout, pas de validation : une sauvegarde qui les dépasse (faite
 * avant ce lot) se charge toujours (`MAX_ROOM_TANKS`, `MAX_TOTAL_FISH` restent les bornes de
 * validation), seuls les ajouts sont refusés. Fonctions pures, sans effet de bord.
 */

export { ROOM_TANK_CAP };

/** Nombre maximal d'animaux, tous bacs confondus, que l'on peut avoir après un ajout. */
export const ROOM_ANIMAL_CAP = 240;

/** Message du refus d'ajouter un bac à une pièce pleine. */
export const ROOM_TANK_CAP_MESSAGE = `La pièce est pleine (${ROOM_TANK_CAP} bacs au plus) : retirez-en un d’abord.`;

/** Message affiché quand la pièce a atteint son plafond d'animaux. */
export const ROOM_ANIMAL_CAP_MESSAGE = `Plafond de la pièce atteint : ${ROOM_ANIMAL_CAP} animaux au plus, tous bacs confondus.`;

/** Nombre d'animaux de la pièce, tous bacs confondus. */
export function roomAnimalCount(room: RoomState): number {
  let total = 0;
  for (const tank of room.tanks) {
    total += tankAnimalCount(tank);
  }
  return total;
}

/**
 * Coût déterministe d'un pas de simulation de la pièce, en paires d'animaux examinées :
 * somme, sur les bacs, du carré du nombre d'animaux (les boucles du banc parcourent tous les
 * animaux du bac pour chacun, `sim/flocking.ts`). Majorant indépendant de la machine, à
 * comparer aux temps mesurés par `scripts/mesure-piece.mjs`.
 */
export function roomSimulationCost(room: RoomState): number {
  let cost = 0;
  for (const tank of room.tanks) {
    const n = tankAnimalCount(tank);
    cost += n * n;
  }
  return cost;
}

/**
 * Refus (message) d'ajouter un bac à `room`, ou `null` si l'ajout est permis (`addTank`
 * applique le même plafond et refuse par `piece-pleine`).
 */
export function roomTankCapRefusal(room: RoomState): string | null {
  return room.tanks.length >= ROOM_TANK_CAP ? ROOM_TANK_CAP_MESSAGE : null;
}

/**
 * Place restante pour des animaux dans le bac `tankId` sous `ROOM_ANIMAL_CAP` : plafond moins
 * les animaux des **autres** bacs moins ceux du bac, jamais négatif. `shown` : monde affiché
 * du bac, s'il est plus récent que celui de la pièce (l'hôte l'avance en place).
 * @throws RangeError si le bac est inconnu.
 */
export function roomAnimalRoom(room: RoomState, tankId: number, shown?: World): number {
  const tank = findTank(room, tankId);
  if (tank === undefined) {
    throw new RangeError(`bac inconnu (${tankId})`);
  }
  const own = (shown ?? tank.world).entities.length;
  const others = roomAnimalCount(room) - tankAnimalCount(tank);
  return Math.max(0, ROOM_ANIMAL_CAP - others - own);
}

/**
 * Refus (message) d'ajouter `added` animaux au bac `tankId`, ou `null` si l'ajout est permis
 * (retirer ou garder l'effectif est toujours permis).
 * @throws RangeError si le bac est inconnu.
 */
export function roomAnimalCapRefusal(
  room: RoomState,
  tankId: number,
  added = 1,
  shown?: World,
): string | null {
  if (added <= 0) {
    return null;
  }
  return roomAnimalRoom(room, tankId, shown) < added ? ROOM_ANIMAL_CAP_MESSAGE : null;
}

/**
 * Effectif maximal de chaque espèce dans le bac `tankId` : celui du bac (`populationLimit`),
 * ramené sous le plafond de la pièce (effectif actuel plus la place restante). Jamais sous
 * l'effectif actuel : un bac au-delà du plafond (ancienne sauvegarde) garde ses animaux.
 * @throws RangeError si le bac est inconnu.
 */
export function roomPopulationLimits(
  room: RoomState,
  tankId: number,
  shown?: World,
): PopulationCounts {
  const world = shown ?? (findTank(room, tankId)?.world as World);
  const free = roomAnimalRoom(room, tankId, shown);
  const counts = populationCounts(world);
  return Object.fromEntries(
    SPECIES_IDS.map((id: SpeciesId) => [
      id,
      Math.max(counts[id], Math.min(populationLimit(world, id), counts[id] + free)),
    ]),
  ) as Record<SpeciesId, number>;
}
