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
import { birthFryInPlace, boundsFor } from './world';
import type { Entity, Mutable, MutableWorld } from './world-types';

/**
 * Alevins d'exemple (paramètre d'URL `alevins=1`, issue #459), **en modifiant** `world`
 * (monde en construction, avant le rendu) : chaque femelle d'une espèce vivipare met bas sa
 * première portée, sans condition de santé ni d'eau, dans la limite des plafonds, près de la
 * plante la plus proche (déjà à couvert) ; les alevins sont répartis entre les `FRY_STAGES`
 * jalons de croissance pour qu'ils se voient tous.
 * Renvoie le nombre d'alevins.
 */
export function broodWorldInPlace(world: MutableWorld): number {
  const mothers = world.entities.filter(
    (fish) => hasFry(fish.species) && !isFry(fish) && isFemale(fish, world.seed),
  );
  const plants = fryPlants(world.decor);
  let born = 0;
  for (const mother of mothers) {
    const size = broodSize(world.seed, mother.id, 0);
    const bounds = boundsFor(mother.species, world);
    const near = fryTarget(mother, plants, 0, bounds, { x: 0, y: 0, z: 0 }) ?? mother;
    for (let k = 0; k < size; k++) {
      const fry = birthFryInPlace(world, mother, near) as Mutable<Entity> | null;
      if (fry === null) {
        return born;
      }
      fry.growth = ((born % FRY_STAGES) * FRY_GROWTH_TIME) / FRY_STAGES;
      born += 1;
    }
  }
  return born;
}
