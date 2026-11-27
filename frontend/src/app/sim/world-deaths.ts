import { diesOfOldAge } from './aging';
import { deadBody, splitDeaths, toxicWater, type DeadAnimal } from './mortality';
import type { Entity, MutableWorld } from './world-types';

/**
 * Décès du pas si la mortalité est activée (#582, #857), **en modifiant** `world` : décès de
 * faiblesse (`splitDeaths`), puis morts de vieillesse des survivants (`stepOldAgeInPlace`).
 */
export function stepDeathsInPlace(world: MutableWorld, dt: number): void {
  stepMortalityInPlace(world, dt);
  stepOldAgeInPlace(world, dt);
}

/**
 * Décès du pas (`splitDeaths`, `sim/mortality.ts`), **en modifiant** `world` : chaque animal
 * qui meurt passe de `entities` à `dead` (`deadBody`), un seul tirage par animal. Aucune
 * allocation si personne ne meurt. Déplacé de `sim/world.ts` (#857).
 */
function stepMortalityInPlace(world: MutableWorld, dt: number): void {
  const split = splitDeaths(world.entities, toxicWater(world.water), dt, world.seed, world.tick);
  if (split === null) {
    return;
  }
  world.entities = split.living;
  world.dead = [...(world.dead ?? []), ...split.dying.map(deadBody)];
}

/**
 * Morts de vieillesse du pas (issue #857, `sim/aging.ts`), **en modifiant** `world` : chaque
 * animal qui meurt passe de `entities` à `dead`, son corps marqué `cause: 'vieillesse'` (le
 * journal en tire une ligne neutre, sans alerte). Appelé seulement si la mortalité est
 * activée, après les décès de faiblesse. Aucune allocation si personne ne meurt, ce qui est
 * le cas de tout animal avant sa durée de vie moyenne.
 */
function stepOldAgeInPlace(world: MutableWorld, dt: number): void {
  let dying: Entity[] | null = null;
  for (const animal of world.entities) {
    if (diesOfOldAge(animal, world, dt)) {
      (dying ??= []).push(animal);
    }
  }
  if (dying === null) {
    return;
  }
  const gone = new Set(dying);
  world.entities = world.entities.filter((animal) => !gone.has(animal));
  const bodies: DeadAnimal[] = dying.map((animal) => ({
    ...deadBody(animal),
    cause: 'vieillesse',
  }));
  world.dead = [...(world.dead ?? []), ...bodies];
}
