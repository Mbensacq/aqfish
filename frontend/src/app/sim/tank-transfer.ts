import { environmentById, environmentWater, livesIn } from './environment';
import { populationCounts, populationLimit } from './population';
import { findTank, type RoomState, type RoomTank } from './room-state';
import { SPECIES } from './species';
import { SPECIES_LABELS } from './species-catalog';
import { addWarnings, speciesSheet, type AddWarning } from './species-sheet';
import { waterLiters } from './water';
import {
  bondedCount,
  cloneWorld,
  homeForRank,
  spawnEntity,
  worldAnemoneHomes,
  type Entity,
} from './world';

/**
 * Transfert d'un animal d'un bac à un autre « à l'épuisette » (épopée #264, lot 3, ADR 0061
 * et 0075). Seule action de la simulation qui lit deux bacs : elle retire l'animal du bac de
 * départ et l'ajoute au bac d'arrivée comme un ajout ordinaire (`spawnEntity`, nouvel
 * identifiant `nextFishId` et sous-générateur dérivés de la graine du bac d'arrivée), en
 * gardant sa faim et sa santé. Fonctions pures et déterministes.
 */

/** Raison d'un transfert refusé. */
export type TransferRefusal =
  'bac-inconnu' | 'meme-bac' | 'animal-inconnu' | 'milieu' | 'temperature' | 'bac-plein';

/** Résultat d'un transfert. */
export type TransferResult =
  | {
      readonly ok: true;
      readonly room: RoomState;
      /** Identifiant de l'animal dans le bac d'arrivée. */
      readonly id: number;
      /** Avertissements d'ajout du bac d'arrivée (#237), non bloquants. */
      readonly warnings: readonly AddWarning[];
    }
  | { readonly ok: false; readonly reason: TransferRefusal; readonly message: string };

/**
 * Raison pour laquelle l'animal `fishId` du bac `fromId` ne peut pas aller dans le bac
 * `toId`, ou `null` s'il le peut. Contrôles, dans l'ordre : bacs et animal existants, bacs
 * distincts ; **milieu** (l'espèce vit-elle dans l'environnement d'arrivée : eau de mer, eau
 * douce, eau froide, `livesIn`) ; **température** de l'eau d'arrivée dans la plage tolérée de
 * l'espèce (fiche, `temperatureTolerated`) ; **place** (`populationLimit` : plafond de l'espèce
 * et `MAX_TOTAL_FISH`). Le volume conseillé n'est qu'un avertissement (`addWarnings`).
 */
export function transferRefusal(
  room: RoomState,
  fromId: number,
  toId: number,
  fishId: number,
): TransferRefusal | null {
  const from = findTank(room, fromId);
  const to = findTank(room, toId);
  if (from === undefined || to === undefined) {
    return 'bac-inconnu';
  }
  if (fromId === toId) {
    return 'meme-bac';
  }
  const fish = from.world.entities.find((entity) => entity.id === fishId);
  if (fish === undefined) {
    return 'animal-inconnu';
  }
  if (!livesIn(to.world.environment, fish.species)) {
    return 'milieu';
  }
  const tolerated = speciesSheet(fish.species).temperatureTolerated.value;
  const temperature = to.world.water.temperature;
  if (!(temperature >= tolerated.min && temperature <= tolerated.max)) {
    return 'temperature';
  }
  const present = populationCounts(to.world)[fish.species];
  if (populationLimit(to.world, fish.species) <= present) {
    return 'bac-plein';
  }
  return null;
}

/**
 * Transfère l'animal `fishId` du bac `fromId` au bac `toId` (contrôles de
 * `transferRefusal`). Le bac de départ perd l'animal ; le bac d'arrivée gagne un animal de la
 * même espèce, d'identifiant `nextFishId`, né dans sa zone de naissance comme à un ajout, avec
 * la faim et la santé de l'animal transféré (un animal malade le reste). Les autres bacs, la
 * graine et le compteur de la pièce ne changent pas. Fonction pure : `room` n'est pas modifiée.
 */
export function transferFish(
  room: RoomState,
  fromId: number,
  toId: number,
  fishId: number,
): TransferResult {
  const refusal = transferRefusal(room, fromId, toId, fishId);
  const from = findTank(room, fromId);
  const to = findTank(room, toId);
  const fish = from?.world.entities.find((entity) => entity.id === fishId);
  if (refusal !== null || from === undefined || to === undefined || fish === undefined) {
    const reason = refusal ?? 'bac-inconnu';
    return { ok: false, reason, message: transferMessage(reason, fish, to) };
  }
  const departure = cloneWorld(from.world);
  departure.entities = departure.entities.filter((entity) => entity.id !== fishId);
  const arrival = cloneWorld(to.world);
  const id = arrival.nextFishId;
  const entities = arrival.entities as Entity[];
  const spawned = spawnEntity(
    arrival.seed,
    id,
    fish.species,
    arrival,
    arrival.obstacles,
    homeForRank(worldAnemoneHomes(arrival), SPECIES[fish.species].anemone, bondedCount(entities)),
  );
  entities.push({ ...spawned, hunger: fish.hunger, health: fish.health });
  arrival.nextFishId = id + 1;
  const counts = populationCounts(arrival);
  const warnings = addWarnings(
    fish.species,
    counts[fish.species],
    waterLiters(environmentWater(arrival)),
    counts,
    environmentById(arrival.environment).species,
  );
  const tanks = room.tanks.map((tank): RoomTank =>
    tank.id === fromId
      ? { ...tank, world: departure }
      : tank.id === toId
        ? { ...tank, world: arrival }
        : tank,
  );
  return { ok: true, room: { ...room, tanks }, id, warnings };
}

/** Message affiché d'un transfert refusé (`fish` et `to` absents si inconnus). */
export function transferMessage(
  reason: TransferRefusal,
  fish: Pick<Entity, 'species'> | undefined,
  to: Pick<RoomTank, 'name' | 'world'> | undefined,
): string {
  const label = fish === undefined ? null : SPECIES_LABELS[fish.species];
  const plural = label?.plural ?? 'animaux';
  const destination = to?.name ?? 'ce bac';
  switch (reason) {
    case 'bac-inconnu':
      return 'Bac introuvable';
    case 'meme-bac':
      return 'Choisir un autre bac que celui de départ';
    case 'animal-inconnu':
      return 'Animal introuvable dans ce bac';
    case 'milieu':
      return `Les ${plural} ne vivent pas dans « ${destination} » (${
        to === undefined ? 'autre milieu' : environmentById(to.world.environment).name
      })`;
    case 'temperature': {
      const range = fish === undefined ? null : speciesSheet(fish.species).temperatureTolerated;
      const temperature =
        to === undefined ? null : Math.round(to.world.water.temperature * 10) / 10;
      return `Eau de « ${destination} » à ${String(temperature).replace('.', ',')} °C : les ${plural} tolèrent ${
        range === null ? '?' : `${range.value.min} à ${range.value.max}`
      } °C`;
    }
    case 'bac-plein':
      return `« ${destination} » est plein pour les ${plural}`;
  }
}
