import { describe, expect, it } from 'vitest';

import { SIM_DT } from './constants';
import {
  advanceEcosystemInPlace,
  ECOSYSTEM_STEP_SECONDS,
  ecosystemLiters,
  feedAnimalsInPlace,
  MEAN_PELLET_MASS,
} from './ecosystem-step';
import { environmentWater } from './environment';
import { PELLET_SATIATION } from './feeding';
import { EATEN_FOOD_AMMONIA } from './food-decay';
import { startFilterCyclingInPlace } from './filter-maturation';
import { waterLiters, type MutableWaterState } from './water';
import { NITROGEN_DAY_SCALE } from './water-units';
import { advance, cloneWorld, createDefaultWorld, createWorld } from './world';
import type { Entity, Mutable, MutableWorld, World } from './world-types';

/**
 * Écart relatif toléré entre le pas long (`ECOSYSTEM_STEP_SECONDS`, 5 s) et le pas fin
 * (`SIM_DT`) : 3 % (mesuré : 2,1 % sur l'ammoniaque d'un bac nourri, 0,4 % en cyclage).
 */
const COARSE_TOLERANCE = 0.03;

/** Pas fins du monde complet comparé (30 s simulées : la nage coûte cher sous couverture en CI). */
const FULL_WORLD_STEPS = 1800;

/** Délai des tests au pas fin : 72 000 pas, lents sous couverture en CI. */
const FINE_STEP_TIMEOUT_MS = 30_000;

function tropical(seed = 7): MutableWorld {
  return cloneWorld(createDefaultWorld(seed, 'tropical'));
}

function setHunger(world: MutableWorld, hunger: number): void {
  for (const animal of world.entities as Mutable<Entity>[]) {
    animal.hunger = hunger;
  }
}

function relativeGap(a: number, b: number): number {
  return Math.abs(a - b) / Math.max(Math.abs(b), 1e-9);
}

/** Écart relatif le plus grand sur les composés azotés, le pH, la température et la santé. */
function largestGap(coarse: World, fine: World): number {
  const keys = ['ammonia', 'nitrite', 'nitrate', 'ph', 'temperature', 'filter'] as const;
  let gap = 0;
  for (const key of keys) {
    gap = Math.max(gap, relativeGap(coarse.water[key], fine.water[key]));
  }
  coarse.entities.forEach((animal, i) => {
    gap = Math.max(gap, relativeGap(animal.health, fine.entities[i].health));
    gap = Math.max(gap, relativeGap(animal.hunger, fine.entities[i].hunger));
  });
  return gap;
}

describe('avance écosystème à gros pas (#799)', () => {
  it(
    'le pas long suit le pas fin à 3 % près sur un jour de bac peuplé, nourri au départ',
    () => {
      const coarse = tropical();
      feedAnimalsInPlace(coarse);
      const fine = cloneWorld(coarse);

      advanceEcosystemInPlace(coarse, 1200);
      advanceEcosystemInPlace(fine, 1200, { stepSeconds: SIM_DT });

      // Seuils de signification ramenés au cycle de l'azote ralenti (#805) : en un jour, les
      // nitrates se forment déjà (≈ 0,04 mg/L), à comparer à leur huitième d'avant (1 mg/L).
      expect(coarse.water.nitrate).toBeGreaterThan(0.25 * NITROGEN_DAY_SCALE);
      expect(largestGap(coarse, fine)).toBeLessThan(COARSE_TOLERANCE);
    },
    FINE_STEP_TIMEOUT_MS,
  );

  it(
    'le pas long suit le pas fin à 3 % près pendant le premier jour de cyclage d’un bac neuf',
    () => {
      const coarse = tropical();
      startFilterCyclingInPlace(coarse.water as MutableWaterState);
      const fine = cloneWorld(coarse);

      advanceEcosystemInPlace(coarse, 1200);
      advanceEcosystemInPlace(fine, 1200, { stepSeconds: SIM_DT });

      expect(coarse.water.ammonia).toBeGreaterThan(0.5 * NITROGEN_DAY_SCALE);
      expect(largestGap(coarse, fine)).toBeLessThan(COARSE_TOLERANCE);
    },
    FINE_STEP_TIMEOUT_MS,
  );

  it(
    'au pas fin, l’eau d’un bac jamais nourri suit celle du monde complet (nage comprise)',
    () => {
      const world = createDefaultWorld(3, 'tropical');
      const eco = cloneWorld(world);

      const full = advance(world, FULL_WORLD_STEPS);
      advanceEcosystemInPlace(eco, FULL_WORLD_STEPS * SIM_DT, { stepSeconds: SIM_DT });

      for (const key of ['ammonia', 'nitrite', 'nitrate', 'ph', 'temperature'] as const) {
        expect(eco.water[key]).toBeCloseTo(full.water[key], 9);
      }
      expect(eco.time).toBeCloseTo(full.time, 9);
    },
    FINE_STEP_TIMEOUT_MS,
  );

  it('même monde, même résultat, au bit près', () => {
    const a = tropical(11);
    const b = tropical(11);

    advanceEcosystemInPlace(a, 5000);
    advanceEcosystemInPlace(b, 5000);

    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('une graine différente ne change que ce qui dépend du tirage (eau identique)', () => {
    const a = tropical(1);
    const b = tropical(2);

    advanceEcosystemInPlace(a, 5000);
    advanceEcosystemInPlace(b, 5000);

    expect(a.water.nitrate).toBe(b.water.nitrate);
  });

  it('une durée nulle ne change rien', () => {
    const world = tropical();
    const before = JSON.stringify(world);

    advanceEcosystemInPlace(world, 0);

    expect(JSON.stringify(world)).toBe(before);
  });

  it('le dernier pas, plus court, finit la durée exactement', () => {
    const world = tropical();

    advanceEcosystemInPlace(world, 30 * ECOSYSTEM_STEP_SECONDS + 2);

    expect(world.time).toBe(30 * ECOSYSTEM_STEP_SECONDS + 2);
    expect(world.tick).toBe(0);
  });

  it('découper la durée en pas longs entiers ne change rien', () => {
    const once = tropical();
    const twice = tropical();

    advanceEcosystemInPlace(once, 2 * ECOSYSTEM_STEP_SECONDS * 10);
    advanceEcosystemInPlace(twice, ECOSYSTEM_STEP_SECONDS * 10);
    advanceEcosystemInPlace(twice, ECOSYSTEM_STEP_SECONDS * 10);

    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
  });

  it('en mode décor, seul le temps avance', () => {
    const world = tropical();
    world.careMode = 'decor';
    const water = JSON.stringify(world.water);
    const hunger = world.entities.map((animal) => animal.hunger);

    advanceEcosystemInPlace(world, 3600);

    expect(world.time).toBe(3600);
    expect(JSON.stringify(world.water)).toBe(water);
    expect(world.entities.map((animal) => animal.hunger)).toEqual(hunger);
  });

  it('un volume imposé plus petit concentre la pollution', () => {
    const large = tropical();
    const small = tropical();

    advanceEcosystemInPlace(large, 1200);
    advanceEcosystemInPlace(small, 1200, { liters: 30 });

    expect(small.water.nitrate).toBeGreaterThan(5 * large.water.nitrate);
  });

  it('un bac vide garde une eau sans azote', () => {
    const world = cloneWorld(createWorld(5, [], [], [], 'tropical'));

    advanceEcosystemInPlace(world, 10 * 1200);

    expect(world.water.ammonia).toBe(0);
    expect(world.water.nitrate).toBe(0);
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])('refuse la durée %s', (duration) => {
    const world = tropical();
    const before = JSON.stringify(world);

    expect(() => advanceEcosystemInPlace(world, duration)).toThrow(RangeError);
    expect(JSON.stringify(world)).toBe(before);
  });

  it.each([0, -60, Number.NaN])('refuse le pas %s', (stepSeconds) => {
    expect(() => advanceEcosystemInPlace(tropical(), 60, { stepSeconds })).toThrow(RangeError);
  });

  it.each([0, -10, Number.NaN, Number.POSITIVE_INFINITY])('refuse le volume %s', (liters) => {
    expect(() => advanceEcosystemInPlace(tropical(), 60, { liters })).toThrow(RangeError);
    expect(() => feedAnimalsInPlace(tropical(), liters)).toThrow(RangeError);
  });

  it('sans volume imposé, prend celui de la boîte d’eau du monde', () => {
    const world = tropical();

    expect(ecosystemLiters(world)).toBe(waterLiters(environmentWater(world)));
  });
});

describe('repas sans nage (#799)', () => {
  it('chaque animal affamé mange jusqu’à ne plus avoir faim, et l’eau reçoit l’ammoniaque des repas', () => {
    const world = cloneWorld(createWorld(5, [{ species: 'guppy', count: 2 }], [], [], 'tropical'));
    setHunger(world, 1);
    const liters = ecosystemLiters(world);

    const mass = feedAnimalsInPlace(world);

    // 1 → 0,75 → 0,5 → 0,25 : trois granulés chacun.
    expect(mass).toBeCloseTo(6 * MEAN_PELLET_MASS, 12);
    expect(world.entities.every((animal) => animal.hunger < PELLET_SATIATION + 0.05)).toBe(true);
    expect(world.water.ammonia).toBeCloseTo((EATEN_FOOD_AMMONIA * mass) / liters, 12);
  });

  it('un animal rassasié ne mange rien et l’eau ne change pas', () => {
    const world = tropical();
    setHunger(world, 0);

    expect(feedAnimalsInPlace(world)).toBe(0);
    expect(world.water.ammonia).toBe(0);
  });

  it('les marcheurs du fond et les amphibiens ne mangent pas de granulés', () => {
    const world = cloneWorld(createDefaultWorld(5, 'paludarium'));
    setHunger(world, 1);

    expect(feedAnimalsInPlace(world)).toBe(0);
    expect(world.entities.every((animal) => animal.hunger === 1)).toBe(true);
  });

  it('la masse moyenne d’un granulé est celle des trois tailles tirées', () => {
    expect(MEAN_PELLET_MASS).toBeCloseTo((0.85 ** 3 + 1 + 1.15 ** 3) / 3, 12);
  });
});
