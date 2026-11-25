import { describe, expect, it } from 'vitest';

import { HUNGRY_THRESHOLD, PELLET_SATIATION } from './feeding';
import { landingAge, pelletMass, type FoodPellet } from './food';
import { isScavenger, scavengeFoodInPlace, SCAVENGERS, type ScavengingAnimal } from './scavenging';
import { SPECIES, type SpeciesId } from './species';
import type { MutableWaterState } from './water';
import { advanceInPlace, cloneWorld, createWorld, feedInPlace } from './world';
import type { Entity, Mutable, MutableWorld } from './world-types';

/** Granulé `id` posé au fond (âge = âge de pose) ou encore en chute (`landed` faux). */
function pellet(id: number, landed: boolean): FoodPellet {
  const base: FoodPellet = {
    id,
    x: 0,
    y: 0.5,
    z: 0,
    vy: 0,
    age: 0,
    floatY: 0.5,
    floatTime: 2,
    restY: 0.1,
  } as FoodPellet;
  return { ...base, age: landed ? landingAge(base) : 0 };
}

function animal(species: SpeciesId, hunger: number): ScavengingAnimal {
  return { species, hunger };
}

/** Bac tropical à filtre mûr avec `population`, nourri d'une pincée si `fed`, après 60 s. */
function tankAfterMinute(
  population: { species: SpeciesId; count: number }[],
  fed: boolean,
): MutableWorld {
  const world = cloneWorld(createWorld(5, population, [], [], 'tropical'));
  (world.water as MutableWaterState).filter = 1;
  for (const animal of world.entities as Mutable<Entity>[]) {
    animal.hunger = 1;
  }
  if (fed) {
    feedInPlace(world, 0, 0);
  }
  advanceInPlace(world, 60 * 60);
  return world;
}

describe('charognards (#836)', () => {
  it('les crevettes cerises et les néritines sont charognardes, pas les nageurs', () => {
    expect((Object.keys(SPECIES) as SpeciesId[]).filter(isScavenger)).toEqual([
      'cerise',
      'neritine',
    ]);
    expect(SCAVENGERS.cerise?.status).toEqual({
      kind: 'source',
      reference: expect.stringContaining('garnelio'),
    });
  });

  it('un charognard affamé mange le premier granulé posé, et sa faim baisse', () => {
    const food = [pellet(1, false), pellet(2, true), pellet(3, true)];
    const shrimp = animal('cerise', 0.8);

    const mass = scavengeFoodInPlace([shrimp], food);

    expect(mass).toBe(pelletMass(pellet(2, true)));
    expect(food.map((p) => p.id)).toEqual([1, 3]);
    expect(shrimp.hunger).toBeCloseTo(0.8 - PELLET_SATIATION, 12);
  });

  it('ni granulé en chute, ni charognard rassasié, ni nageur : rien n’est mangé', () => {
    const falling = [pellet(1, false)];
    const landed = [pellet(2, true)];

    expect(scavengeFoodInPlace([animal('cerise', 1)], falling)).toBe(0);
    expect(scavengeFoodInPlace([animal('cerise', HUNGRY_THRESHOLD / 2)], landed)).toBe(0);
    expect(scavengeFoodInPlace([animal('neon', 1)], landed)).toBe(0);
    expect(scavengeFoodInPlace([animal('cerise', 1)], [])).toBe(0);
    expect(landed).toHaveLength(1);
  });

  it('chaque charognard mange un granulé par pas, dans l’ordre du tableau', () => {
    const food = [pellet(1, true), pellet(2, true)];
    const animals = [animal('cerise', 1), animal('neritine', 1), animal('cerise', 1)];

    scavengeFoodInPlace(animals, food);

    expect(food).toHaveLength(0);
    expect(animals.map((a) => a.hunger)).toEqual([1 - PELLET_SATIATION, 1 - PELLET_SATIATION, 1]);
  });

  it('avec des crevettes, la nourriture tombée est mangée et son ammoniaque de décomposition baisse (même graine)', () => {
    const shrimps = [{ species: 'cerise' as const, count: 8 }];

    const withScavengers =
      tankAfterMinute(shrimps, true).water.ammonia - tankAfterMinute(shrimps, false).water.ammonia;
    const without =
      tankAfterMinute([], true).water.ammonia - tankAfterMinute([], false).water.ammonia;
    const again =
      tankAfterMinute(shrimps, true).water.ammonia - tankAfterMinute(shrimps, false).water.ammonia;

    expect(without).toBeGreaterThan(0);
    expect(withScavengers).toBeGreaterThan(0);
    expect(withScavengers).toBeLessThan(0.75 * without);
    expect(again).toBe(withScavengers);
  });
});
