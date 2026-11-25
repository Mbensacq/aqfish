import { describe, expect, it } from 'vitest';

import { sampleAlgae } from './algae';
import type { DecorItem } from './decor';
import { isFry } from './fry';
import {
  canHatch,
  clutchSize,
  CLUTCH_PERIOD_SECONDS,
  COLONY_SPECIES,
  endedWindow,
  isShrimpFemale,
  MAX_CLUTCH,
  MIN_CLUTCH,
  NERITE_HATCHES_IN_FRESHWATER,
  SHRIMP_FED_HUNGER,
  shrimpPlace,
} from './shrimp-colony';
import type { SpeciesId } from './species';
import { runScenario, SCENARIO_DAY_SECONDS } from './testing/ecosystem-scenario';
import { parseWorld, serializeWorld } from './save';
import { broodWorldInPlace } from './fry-sample';
import { waterLoad, type MutableWaterState } from './water';
import { SPECIES } from './species';
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
