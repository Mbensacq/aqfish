import {
  broodSize,
  FRY_GROWTH_TIME,
  FRY_STAGES,
  fryPlants,
  fryTarget,
  hasFry,
  isFemale,
  isFry,
} from './fry';
import { GROWTH_SECONDS } from './fish-growth';
import { isColonySpecies, isShrimpFemale } from './shrimp-colony';
import { birthFryInPlace, boundsFor } from './world';
import type { Entity, Mutable, MutableWorld } from './world-types';

/**
 * Alevins d'exemple (paramètre d'URL `alevins=1`, issue #459), **en modifiant** `world` (monde en
 * construction, avant le rendu) : chaque femelle d'une espèce vivipare met bas sa première portée,
 * et chaque crevette cerise femelle fait éclore autant de jeunes (#836), sans condition de santé ni
 * d'eau, dans la limite des plafonds, près de la plante la plus proche (déjà à couvert) ; les
 * alevins sont répartis entre les `FRY_STAGES` jalons de croissance pour qu'ils se voient tous.
 * Renvoie le nombre d'alevins.
 */
export function broodWorldInPlace(world: MutableWorld): number {
  const mothers = world.entities.filter((fish) => isSampleMother(fish, world.seed));
  const plants = fryPlants(world.decor);
  let born = 0;
  for (const mother of mothers) {
    const size = broodSize(world.seed, mother.id, 0);
    const bounds = boundsFor(mother.species, world);
    const walker = isColonySpecies(mother.species);
    const near = walker
      ? mother
      : (fryTarget(mother, plants, 0, bounds, { x: 0, y: 0, z: 0 }) ?? mother);
    for (let k = 0; k < size; k++) {
      const fry = birthFryInPlace(world, mother, near) as Mutable<Entity> | null;
      if (fry === null) {
        return born;
      }
      if (walker) {
        // Jeune crevette (#836) : posée au fond près de sa mère.
        fry.y = mother.y;
      }
      fry.growth = ((born % FRY_STAGES) * FRY_GROWTH_TIME) / FRY_STAGES;
      born += 1;
    }
  }
  return born;
}

/** Mère des jeunes d'exemple : femelle adulte vivipare ou d'une colonie de crevettes. */
function isSampleMother(fish: Entity, seed: number): boolean {
  if (isFry(fish)) {
    return false;
  }
  if (isColonySpecies(fish.species)) {
    return isShrimpFemale(fish);
  }
  return hasFry(fish.species) && isFemale(fish, seed);
}

/**
 * Âges des jeunes d'exemple de `growWorldInPlace`, en secondes : les trois jalons d'alevin
 * puis trois jeunes sortis de l'alevinage, au quart, à la moitié et aux trois quarts de leur
 * croissance (#876).
 */
export const GROWTH_SAMPLE_AGES: readonly number[] = Object.freeze([
  0,
  FRY_GROWTH_TIME / FRY_STAGES,
  (2 * FRY_GROWTH_TIME) / FRY_STAGES,
  FRY_GROWTH_TIME + (GROWTH_SECONDS - FRY_GROWTH_TIME) / 4,
  FRY_GROWTH_TIME + (GROWTH_SECONDS - FRY_GROWTH_TIME) / 2,
  FRY_GROWTH_TIME + (3 * (GROWTH_SECONDS - FRY_GROWTH_TIME)) / 4,
]);

/**
 * Jeunes d'exemple (paramètre d'URL `alevins=jeunes`, issue #876), **en modifiant** `world` :
 * la portée de `broodWorldInPlace`, mais chaque jeune nageur reçoit à son tour un âge de
 * `GROWTH_SAMPLE_AGES` (naissance `bornAt` avant le temps du monde) : alevins aux trois
 * jalons, puis jeunes qui ne sont plus alevins et grandissent encore (`bodyScale`). Les jeunes
 * crevettes restent comme dans `broodWorldInPlace`. Renvoie le nombre de jeunes.
 */
export function growWorldInPlace(world: MutableWorld): number {
  const first = world.entities.length;
  const born = broodWorldInPlace(world);
  let k = 0;
  for (const young of world.entities.slice(first) as Mutable<Entity>[]) {
    if (isColonySpecies(young.species)) {
      continue;
    }
    const age = GROWTH_SAMPLE_AGES[k % GROWTH_SAMPLE_AGES.length];
    k += 1;
    young.bornAt = world.time - age;
    if (age < FRY_GROWTH_TIME) {
      young.growth = age;
    } else {
      delete young.growth;
    }
  }
  return born;
}
