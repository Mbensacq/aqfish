import { describe, expect, it } from 'vitest';

import { sampleAlgae } from './algae';
import type { DecorItem } from './decor';
import { isFry } from './fry';
import { broodWorldInPlace } from './fry-sample';
import { parseWorld, serializeWorld } from './save';
import {
  canHatch,
  clutchSize,
  CLUTCH_PERIOD_SECONDS,
  COLONY_SPECIES,
  endedWindow,
  endedWindowCount,
  isShrimpFemale,
  MAX_CLUTCH,
  MIN_CLUTCH,
  NERITE_HATCHES_IN_FRESHWATER,
  SHRIMP_FED_HUNGER,
  shrimpPlace,
  stepShrimpColonyInPlace,
} from './shrimp-colony';
import { SPECIES, type SpeciesId } from './species';
import { runScenario, SCENARIO_DAY_SECONDS } from './testing/ecosystem-scenario';
import { waterLoad, type MutableWaterState } from './water';
import { birthYoungInPlace, cloneWorld, createWorld } from './world';
import type { Entity, Mutable, World } from './world-types';

const GOOD: { goodWater: boolean; phOut: boolean } = { goodWater: true, phOut: false };

/** Animal minimal pour `canHatch`. */
function shrimp(overrides: Partial<Mutable<Entity>> = {}): Entity {
  const world = createWorld(1, [{ species: 'cerise', count: 2 }], [], [], 'tropical');
  return { ...world.entities[1], health: 1, hunger: 0, ...overrides } as Entity;
}

/** Bac tropical à filtre mûr avec `population` et `decor`. */
function tank(
  population: { species: SpeciesId; count: number }[],
  decor: DecorItem[] = [],
  seed = 4,
): Mutable<World> {
  const world = cloneWorld(createWorld(seed, population, [], decor, 'tropical'));
  (world.water as MutableWaterState).filter = 1;
  return world;
}

function count(world: World, species: SpeciesId): number {
  return world.entities.filter((e) => e.species === species).length;
}

/** Touffes d'échelle `scale` au fond du bac tropical (1,8 : couverture pleine, comme S13). */
function tufts(scale: number): DecorItem[] {
  return [-0.4, 0, 0.4].map((x, i) => ({
    kind: 'plant',
    form: 'tuft',
    x,
    z: -0.05,
    rotation: i,
    scale,
    seed: 300 + i,
  }));
}

describe('colonie de crevettes (#836)', () => {
  it('endedWindow : une fenêtre s’achève une seule fois, même quand le temps tombe juste dessous', () => {
    expect(endedWindow(55, 60, 60)).toBe(0);
    expect(endedWindow(60, 65, 60)).toBe(-1);
    expect(endedWindow(59.99999999999999, 60.1, 60)).toBe(-1);
    expect(endedWindow(0, 0, 60)).toBe(-1);
  });

  it('endedWindowCount : toutes les fenêtres achevées par un pas, 0 sans fin de fenêtre (#838)', () => {
    expect(endedWindowCount(55, 60, 60)).toBe(1);
    expect(endedWindowCount(60, 65, 60)).toBe(0);
    expect(endedWindowCount(59.99999999999999, 60.1, 60)).toBe(0);
    expect(endedWindowCount(0, 130, 60)).toBe(2);
    expect(endedWindowCount(0, 1500, 60)).toBe(25);
    expect(endedWindowCount(1000, 2500, CLUTCH_PERIOD_SECONDS)).toBe(2);
    expect(endedWindowCount(0, 1500, CLUTCH_PERIOD_SECONDS)).toBe(1);
    expect(endedWindow(1000, 2500, CLUTCH_PERIOD_SECONDS)).toBe(1);
  });

  it('shrimpPlace : 3 L par crevette adulte (capacité #729), rien sans eau', () => {
    expect(shrimpPlace(30)).toBe(10);
    expect(shrimpPlace(2.9)).toBe(0);
    expect(shrimpPlace(0)).toBe(0);
    expect(shrimpPlace(Number.NaN)).toBe(0);
    expect(shrimpPlace(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('clutchSize : dans les bornes, déterministe, variable d’une couvée à l’autre', () => {
    const sizes = Array.from({ length: 40 }, (_, k) => clutchSize(9, 3, k));

    expect(Math.min(...sizes)).toBe(MIN_CLUTCH);
    expect(Math.max(...sizes)).toBe(MAX_CLUTCH);
    expect(clutchSize(9, 3, 7)).toBe(sizes[7]);
  });

  it('canHatch : femelle adulte nourrie en bonne santé dans une bonne eau, rien d’autre', () => {
    expect(isShrimpFemale({ id: 1 })).toBe(true);
    expect(isShrimpFemale({ id: 2 })).toBe(false);
    expect(canHatch(shrimp({ id: 1 }), GOOD)).toBe(true);
    expect(canHatch(shrimp({ id: 2 }), GOOD)).toBe(false);
    expect(canHatch(shrimp({ id: 1, hunger: SHRIMP_FED_HUNGER }), GOOD)).toBe(false);
    expect(canHatch(shrimp({ id: 1, health: 0.9 }), GOOD)).toBe(false);
    expect(canHatch(shrimp({ id: 1, growth: 10 }), GOOD)).toBe(false);
    expect(canHatch(shrimp({ id: 1, species: 'neritine' }), GOOD)).toBe(false);
    expect(canHatch(shrimp({ id: 1 }), { goodWater: false, phOut: false })).toBe(false);
    expect(canHatch(shrimp({ id: 1 }), { goodWater: true, phOut: true })).toBe(false);
  });

  it('aucune éclosion de néritine en eau douce, même nourrie avec des algues (source)', () => {
    const world = tank([{ species: 'neritine', count: 4 }]);
    (world.water as MutableWaterState).algae = sampleAlgae(0.6);

    const after = runScenario({ world, care: { feedEverySeconds: 60 }, days: 3 }).world;

    expect(COLONY_SPECIES).not.toContain('neritine');
    expect(NERITE_HATCHES_IN_FRESHWATER.value).toBe(false);
    expect(NERITE_HATCHES_IN_FRESHWATER.status.kind).toBe('source');
    expect(count(after, 'neritine')).toBe(4);
    expect(after.entities.some(isFry)).toBe(false);
  });

  it('des crevettes nourries éclosent quand la place le permet ; affamées ou à l’étroit, jamais', () => {
    const fed = runScenario({
      world: tank([{ species: 'cerise', count: 4 }]),
      liters: 60,
      care: { feedEverySeconds: 60 },
      days: 1.5,
    }).world;
    const hungry = runScenario({
      world: tank([{ species: 'cerise', count: 4 }]),
      liters: 60,
      care: {},
      days: 1.5,
    }).world;
    const crowded = runScenario({
      world: tank([{ species: 'cerise', count: 10 }]),
      liters: 30,
      care: { feedEverySeconds: 60 },
      days: 1.5,
    }).world;

    expect(count(fed, 'cerise')).toBeGreaterThan(4);
    expect(fed.entities.some(isFry)).toBe(true);
    expect(count(hungry, 'cerise')).toBe(4);
    expect(count(crowded, 'cerise')).toBe(10);
  });

  it('la colonie est déterministe : même bac, mêmes naissances', () => {
    const scenario = {
      world: tank([{ species: 'cerise', count: 4 }]),
      liters: 60,
      care: { feedEverySeconds: 60 },
      days: (2 * CLUTCH_PERIOD_SECONDS) / SCENARIO_DAY_SECONDS,
    };

    const first = runScenario(scenario).world.entities.map((e) => [e.id, e.growth]);
    const second = runScenario(scenario).world.entities.map((e) => [e.id, e.growth]);

    expect(second).toEqual(first);
  });

  it('caractérisation : naissances et pertes figées (graine 4, couvées et prédation)', () => {
    const fed = runScenario({
      world: tank([{ species: 'cerise', count: 4 }]),
      liters: 300,
      care: { feedEverySeconds: 60 },
      days: 2.5,
    }).world;
    const hunted = tank([{ species: 'guppy', count: 6 }]);
    for (const x of [-0.4, 0, 0.4]) {
      for (let k = 0; k < 4; k++) {
        const young = birthYoungInPlace(hunted, 'cerise', { x, y: 0.05, z: -0.05 });
        (young as Mutable<Entity>).growth = 0;
      }
    }
    const after = runScenario({ world: hunted, care: { feedEverySeconds: 60 }, days: 0.1 }).world;

    const ids = (world: World): number[] =>
      world.entities.filter((e) => e.species === 'cerise').map((e) => e.id);
    expect(ids(fed)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]);
    expect(ids(after)).toEqual([8, 10, 11, 16]);
  });

  it('un pas de 1500 s fait éclore les deux couvées qu’il achève, comme deux pas (#838)', () => {
    const fedTank = (): Mutable<World> => {
      const world = tank([{ species: 'cerise', count: 4 }]);
      for (const animal of world.entities as Mutable<Entity>[]) {
        animal.health = 1;
        animal.hunger = 0;
      }
      return world;
    };
    const ids = (world: World): number[] => world.entities.map((e) => e.id);

    const long = fedTank();
    long.time = 2500;
    const longBorn = stepShrimpColonyInPlace(long, 1500, birthYoungInPlace, 300);
    const split = fedTank();
    split.time = 1200;
    const firstBorn = stepShrimpColonyInPlace(split, 200, birthYoungInPlace, 300);
    split.time = 2500;
    const secondBorn = stepShrimpColonyInPlace(split, 1300, birthYoungInPlace, 300);
    const single = fedTank();
    single.time = 1500;

    expect(firstBorn).toBeGreaterThan(0);
    expect(secondBorn).toBeGreaterThan(0);
    expect(longBorn).toBe(firstBorn + secondBorn);
    expect(ids(long)).toEqual(ids(split));
    expect(stepShrimpColonyInPlace(single, 1500, birthYoungInPlace, 300)).toBe(firstBorn);
  });

  it('prédation : un pas de 130 s ou de 1500 s compose le risque de toutes ses fenêtres (#838)', () => {
    const YOUNG = 20;
    const SEEDS = [1, 2, 3, 4, 5];
    const eatenOver = (dt: number): number => {
      let eaten = 0;
      for (const seed of SEEDS) {
        const world = tank([{ species: 'guppy', count: 6 }], [], seed);
        for (let k = 0; k < YOUNG; k++) {
          const near = { x: (k % 10) * 0.05 - 0.25, y: 0.05, z: 0 };
          (birthYoungInPlace(world, 'cerise', near) as Mutable<Entity>).growth = 0;
        }
        world.time = dt;
        eaten -= stepShrimpColonyInPlace(world, dt, birthYoungInPlace, 300);
      }
      return eaten;
    };
    // Six guppys, jeunes à découvert : 1 − exp(−6 / 600 × 60 × n) pour un pas de n fenêtres.
    const total = YOUNG * SEEDS.length;
    const one = eatenOver(60);
    const two = eatenOver(130);

    expect(one).toBeGreaterThan(total * (1 - Math.exp(-0.6)) - 15);
    expect(one).toBeLessThan(total * (1 - Math.exp(-0.6)) + 15);
    expect(two).toBeGreaterThan(total * (1 - Math.exp(-1.2)) - 15);
    expect(two).toBeLessThan(total * (1 - Math.exp(-1.2)) + 15);
    expect(eatenOver(1500)).toBe(total);
  });

  it('un refuge de plantes réduit les pertes de jeunes crevettes face aux guppys', () => {
    const survivors = (decor: DecorItem[]): number => {
      const world = tank([{ species: 'guppy', count: 6 }], decor);
      for (const x of [-0.4, 0, 0.4]) {
        for (let k = 0; k < 4; k++) {
          const young = birthYoungInPlace(world, 'cerise', { x, y: 0.05, z: -0.05 });
          (young as Mutable<Entity>).growth = 0;
        }
      }
      const after = runScenario({ world, care: { feedEverySeconds: 60 }, days: 0.5 }).world;
      return count(after, 'cerise');
    };

    const dense = survivors(tufts(1.8));
    const bare = survivors([]);

    expect(dense).toBe(12);
    expect(bare).toBeLessThan(6);
  });
  it('sauvegarde : les jeunes crevettes se rechargent avec leur âge ; une sauvegarde sans jeune aussi', () => {
    const world = tank([{ species: 'cerise', count: 6 }]);
    const born = broodWorldInPlace(world);
    const young = world.entities.filter(isFry).map((e) => [e.id, e.species, e.growth]);

    const read = parseWorld(serializeWorld(world));
    const old = parseWorld(serializeWorld(tank([{ species: 'cerise', count: 6 }])));

    expect(born).toBeGreaterThan(0);
    expect(young.every(([, species]) => species === 'cerise')).toBe(true);
    expect(
      read.ok && read.world.entities.filter(isFry).map((e) => [e.id, e.species, e.growth]),
    ).toEqual(young);
    expect(old.ok && old.world.entities).toHaveLength(6);
  });
  it('waterLoad : une crevette cerise pèse selon ses 3 cm réels, pas son modèle de 10 cm', () => {
    const shrimpLoad = waterLoad([{ species: 'cerise' }]);
    const neonLoad = waterLoad([{ species: 'neon' }]);

    expect(SPECIES.cerise.bodyLength).toBe(0.1);
    expect(shrimpLoad).toBeLessThan(neonLoad);
    expect(shrimpLoad).toBeCloseTo(neonLoad * (0.03 / SPECIES.neon.bodyLength) ** 3, 12);
  });
});
