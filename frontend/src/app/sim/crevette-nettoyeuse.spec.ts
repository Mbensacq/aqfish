import { describe, expect, it } from 'vitest';

import {
  cleaningTarget,
  createWalker,
  groundHeight,
  hasCleaningWalker,
  neighborsInto,
  stepWalker,
  walkerCleansAt,
  walkerPhaseAt,
  type WalkerGround,
  type WalkerNeighbor,
} from './axolotl';
import { SIM_DT } from './constants';
import { ENVIRONMENTS, environmentWater, livesIn, REEF } from './environment';
import { legalStatus } from './species-legal';
import { speciesSheet } from './species-sheet';
import { CREVETTE, SPECIES, validateSpecies, type SpeciesDefinition } from './species';
import { createFish, type Fish } from './swimmer';
import { advanceInPlace, boundsFor, createWorld, type MutableWorld } from './world';

/**
 * Issue #656 : crevette nettoyeuse du récif qui approche de temps en temps un poisson de
 * passage (ADR 0148). Graines fixes, temps simulé uniquement.
 */
type Mutable<T> = { -readonly [K in keyof T]: T[K] };

const WALKER = CREVETTE.walker!;
const CLEANING = WALKER.cleaning!;
const WATER = environmentWater('recif');
const BOUNDS = boundsFor('crevette', 'recif');
const GROUND: WalkerGround = { water: WATER, terrain: REEF.terrain };

function reef(seed: number, withFish: boolean): MutableWorld {
  return createWorld(
    seed,
    withFish
      ? [
          { species: 'clown', count: 3 },
          { species: 'chirurgien', count: 4 },
          { species: 'chromis', count: 7 },
          { species: 'gobie', count: 2 },
          { species: 'blennie', count: 1 },
          { species: 'crevette', count: 2 },
        ]
      : [{ species: 'crevette', count: 2 }],
    [],
    [],
    'recif',
  ) as MutableWorld;
}

function shrimps(world: MutableWorld): Fish[] {
  return world.entities.filter((e) => e.species === 'crevette');
}

/** Premier instant (pas de `SIM_DT`) d'un créneau de marche tiré pour l'approche. */
function cleaningTime(seed: number, id: number): number {
  for (let step = 1; step < 100_000; step++) {
    const time = step * SIM_DT;
    const phase = walkerPhaseAt(WALKER, seed, id, time);
    if (
      phase.mode === 'marche' &&
      phase.progress < 0.1 &&
      walkerCleansAt(CLEANING, seed, id, phase.slot)
    ) {
      return time;
    }
  }
  throw new Error('aucun créneau d’approche');
}

/** Poisson `species` placé en (x, y, z), cap quelconque. */
function fishAt(id: number, species: 'chromis' | 'gobie', x: number, y: number, z: number): Fish {
  const fish = createFish(5, id, species, boundsFor(species, 'recif')) as Mutable<Fish>;
  fish.x = x;
  fish.y = y;
  fish.z = z;
  return fish;
}

describe('crevette nettoyeuse (#656) : espèce et fiche', () => {
  it('déclarée, valide, approche des poissons déclarée et bornée', () => {
    expect(SPECIES.crevette).toBe(CREVETTE);
    expect(validateSpecies(CREVETTE)).toEqual([]);
    expect(CLEANING.share).toBeGreaterThan(0);
    expect(CLEANING.share).toBeLessThanOrEqual(1);
    expect(CLEANING.standoff).toBeLessThan(CLEANING.radius);
    // Aucune autre espèce n'approche les poissons (crevette cerise, axolotl inchangés).
    for (const def of Object.values(SPECIES)) {
      if (def.id !== 'crevette') {
        expect(def.walker?.cleaning, def.id).toBeUndefined();
      }
    }
  });

  it.each([
    [{ share: 0, radius: 0.3, standoff: 0.05, maxHeight: 0.2 }, 'share'],
    [{ share: 1.5, radius: 0.3, standoff: 0.05, maxHeight: 0.2 }, 'share'],
    [{ share: 0.5, radius: 0.3, standoff: 0.3, maxHeight: 0.2 }, 'standoff'],
    [{ share: 0.5, radius: Number.NaN, standoff: 0.05, maxHeight: 0.2 }, 'radius'],
    [{ share: 0.5, radius: 0.3, standoff: 0.05, maxHeight: -1 }, 'maxHeight'],
  ])('paramètres d’approche invalides refusés (%o)', (cleaning, field) => {
    const def: SpeciesDefinition = { ...CREVETTE, walker: { ...WALKER, cleaning } };
    expect(validateSpecies(def).some((p) => p.includes(field))).toBe(true);
  });

  it('fiche complète : statut légal, origine, température, salinité', () => {
    const sheet = speciesSheet('crevette');
    expect(sheet.temperatureTolerated.status.kind).toBe('source');
    expect(sheet.temperaturePreferred.status.kind).toBe('approximation');
    const legal = legalStatus('crevette');
    expect(sheet.legal.value).toBe(legal);
    expect(legal.confirmed).toBe(false);
    expect(legal.note).toContain('origine');
    expect(legal.reference.trim()).not.toBe('');
    const salinity = sheet.notes.find((n) => n.text.includes('salinité'));
    expect(salinity?.status.kind).toBe('source');
  });

  it('au récif seulement : absente de tous les environnements d’eau douce', () => {
    expect(livesIn('recif', 'crevette')).toBe(true);
    const others = Object.values(ENVIRONMENTS).filter((env) => env.id !== 'recif');
    expect(others.length).toBeGreaterThan(0);
    for (const env of others) {
      expect(livesIn(env.id, 'crevette'), env.id).toBe(false);
      expect(env.species, env.id).not.toContain('crevette');
    }
  });
});

describe('crevette nettoyeuse (#656) : approche des poissons', () => {
  it('créneaux d’approche : fonction pure, part proche de `share`', () => {
    let count = 0;
    for (let slot = 0; slot < 2000; slot++) {
      const a = walkerCleansAt(CLEANING, 42, 3, slot);
      expect(walkerCleansAt(CLEANING, 42, 3, slot)).toBe(a);
      count += a ? 1 : 0;
    }
    expect(count / 2000).toBeGreaterThan(CLEANING.share - 0.05);
    expect(count / 2000).toBeLessThan(CLEANING.share + 0.05);
    expect(walkerCleansAt({ ...CLEANING, share: 1 }, 42, 3, 7)).toBe(true);
    expect(() => walkerCleansAt(CLEANING, -1, 3, 7)).toThrow(RangeError);
  });

  it('cible : le nageur bas le plus proche ; ni elle-même, ni marcheur, ni poisson trop loin', () => {
    const shrimp = createWalker(42, 0, 'crevette', BOUNDS, GROUND);
    const { x, y, z } = shrimp;
    const near = fishAt(1, 'gobie', x + 0.1, y + 0.05, z);
    const nearer = fishAt(2, 'chromis', x, y + 0.1, z + 0.06);
    const far = fishAt(3, 'chromis', x + CLEANING.radius + 0.01, y, z);
    const high = fishAt(4, 'chromis', x + 0.01, y + CLEANING.maxHeight + 0.01, z);
    const below = fishAt(5, 'chromis', x + 0.01, y - 0.001, z);
    const other = createWalker(42, 6, 'crevette', BOUNDS, GROUND) as Mutable<Fish>;
    other.x = x + 0.01;
    other.y = y + 0.01;
    other.z = z;
    expect(cleaningTarget(shrimp, [], CLEANING)).toBeNull();
    expect(cleaningTarget(shrimp, [shrimp, other, far, high, below], CLEANING)).toBeNull();
    expect(cleaningTarget(shrimp, [near, far], CLEANING)).toBe(near);
    expect(cleaningTarget(shrimp, [near, nearer, far], CLEANING)).toBe(nearer);
    // Exactement à la portée : retenu ; à égalité, le premier du tableau.
    const origin = { ...shrimp, x: 0, z: 0 };
    const edge = fishAt(7, 'gobie', CLEANING.radius, y, 0);
    const twin = fishAt(8, 'gobie', CLEANING.radius, y, 0);
    expect(cleaningTarget(origin, [edge, twin], CLEANING)).toBe(edge);
    expect(cleaningTarget(origin, [twin, edge], CLEANING)).toBe(twin);
  });

  it('en créneau d’approche, elle se dirige vers le poisson, sur le fond, puis s’arrête', () => {
    const seed = 42;
    const shrimp = createWalker(seed, 0, 'crevette', BOUNDS, GROUND) as Mutable<Fish>;
    // Point dégagé au centre du bac, loin des vitres ; aucun obstacle.
    shrimp.x = (BOUNDS.hard.minX + BOUNDS.hard.maxX) / 2;
    shrimp.z = (BOUNDS.hard.minZ + BOUNDS.hard.maxZ) / 2;
    shrimp.y = groundHeight(shrimp.x, shrimp.z, GROUND) + WALKER.clearance;
    const start = cleaningTime(seed, 0);
    const fish = fishAt(1, 'gobie', shrimp.x + 0.1, shrimp.y + 0.05, shrimp.z + 0.06);
    shrimp.yaw = Math.atan2(-0.06, -0.1); // dos au poisson
    const distance = () => Math.hypot(fish.x - shrimp.x, fish.z - shrimp.z);
    const before = distance();
    let time = start;
    for (let i = 0; i < Math.round((WALKER.slotDuration * 0.8) / SIM_DT); i++) {
      time += SIM_DT;
      stepWalker(shrimp, SIM_DT, seed, time, BOUNDS, GROUND, [], [fish]);
      const floor = groundHeight(shrimp.x, shrimp.z, GROUND) + WALKER.clearance;
      expect(shrimp.y).toBeGreaterThanOrEqual(Math.max(BOUNDS.hard.minY, floor) - 1e-9);
    }
    expect(distance()).toBeLessThan(before / 2);
    expect(distance()).toBeLessThan(CLEANING.standoff + 0.02);
    expect(shrimp.speed).toBeLessThan(WALKER.walkSpeed);
  });

  it('sans poisson à portée : même trajectoire qu’en l’absence de tout poisson', () => {
    const a = createWalker(9, 0, 'crevette', BOUNDS, GROUND) as Mutable<Fish>;
    const b = createWalker(9, 0, 'crevette', BOUNDS, GROUND) as Mutable<Fish>;
    const far = fishAt(1, 'chromis', BOUNDS.hard.maxX, BOUNDS.hard.maxY, BOUNDS.hard.maxZ);
    let time = 0;
    for (let i = 0; i < Math.round(30 / SIM_DT); i++) {
      time += SIM_DT;
      stepWalker(a, SIM_DT, 9, time, BOUNDS, GROUND, []);
      stepWalker(b, SIM_DT, 9, time, BOUNDS, GROUND, [], [far]);
    }
    expect(b).toEqual(a);
  });
});

describe('crevette nettoyeuse (#656) : récif simulé', () => {
  it.each([
    [42, true],
    [7, true],
    [1234, false],
  ])(
    'graine %i (poissons : %s) : toujours sur le fond, dans le bac, hors des rochers',
    (seed, withFish) => {
      const world = reef(seed, withFish);
      for (let i = 0; i < Math.round(90 / SIM_DT); i++) {
        advanceInPlace(world, 1);
        for (const e of shrimps(world)) {
          const { hard } = BOUNDS;
          expect(e.x).toBeGreaterThanOrEqual(hard.minX);
          expect(e.x).toBeLessThanOrEqual(hard.maxX);
          expect(e.z).toBeGreaterThanOrEqual(hard.minZ);
          expect(e.z).toBeLessThanOrEqual(hard.maxZ);
          const floor = groundHeight(e.x, e.z, GROUND) + WALKER.clearance;
          expect(e.y).toBeGreaterThanOrEqual(Math.max(hard.minY, floor) - 1e-9);
          expect(e.y).toBeLessThanOrEqual(hard.maxY);
        }
      }
    },
    30_000,
  );

  it('les crevettes approchent réellement des poissons au fil du temps (graine 42)', () => {
    const world = reef(42, true);
    let approaches = 0;
    for (let i = 0; i < Math.round(120 / SIM_DT); i++) {
      advanceInPlace(world, 1);
      for (const e of shrimps(world)) {
        const phase = walkerPhaseAt(WALKER, world.seed, e.id, world.time);
        if (
          phase.mode === 'marche' &&
          walkerCleansAt(CLEANING, world.seed, e.id, phase.slot) &&
          cleaningTarget(e, world.entities, CLEANING) !== null
        ) {
          approaches++;
        }
      }
    }
    expect(approaches).toBeGreaterThan(0);
  }, 30_000);

  it('zéro rocher, zéro poisson ou zéro crevette : aucune exception', () => {
    const alone = createWalker(3, 0, 'crevette', BOUNDS, { water: WATER, terrain: null });
    expect(() =>
      stepWalker(alone as Mutable<Fish>, SIM_DT, 3, SIM_DT, BOUNDS, GROUND, [], []),
    ).not.toThrow();
    const none = createWorld(42, [{ species: 'crevette', count: 0 }], [], [], 'recif');
    expect(none.entities).toEqual([]);
    const solo = reef(5, false);
    expect(() => advanceInPlace(solo, Math.round(20 / SIM_DT))).not.toThrow();
    const noRocks = createWorld(
      5,
      [{ species: 'crevette', count: 2 }],
      [],
      [],
      'recif',
    ) as MutableWorld;
    (noRocks as { obstacles: unknown }).obstacles = [];
    expect(() => advanceInPlace(noRocks, Math.round(20 / SIM_DT))).not.toThrow();
    for (const e of shrimps(noRocks)) {
      expect(Number.isFinite(e.x) && Number.isFinite(e.y) && Number.isFinite(e.z)).toBe(true);
    }
  });

  it('même graine, même trajectoire ; autre graine, autre trajectoire', () => {
    const a = reef(11, true);
    const b = reef(11, true);
    const c = reef(12, true);
    for (const w of [a, b, c]) {
      advanceInPlace(w, Math.round(40 / SIM_DT));
    }
    expect(a.entities).toEqual(b.entities);
    expect(shrimps(a).map((e) => e.x)).not.toEqual(shrimps(c).map((e) => e.x));
  });
});

describe('crevette nettoyeuse (#669) : positions du début du pas', () => {
  it('instantané : longueur suivie, objets réutilisés, aucune référence aux poissons', () => {
    const a = fishAt(0, 'gobie', 0.1, 0.2, 0.3);
    const b = fishAt(1, 'chromis', -0.1, 0.25, 0);
    const out: Mutable<WalkerNeighbor>[] = [];
    neighborsInto([a, b], out);
    expect(out).toEqual([
      { id: 0, species: 'gobie', x: 0.1, y: 0.2, z: 0.3 },
      { id: 1, species: 'chromis', x: -0.1, y: 0.25, z: 0 },
    ]);
    const kept = out[0];
    expect(kept).not.toBe(a);
    (a as Mutable<Fish>).x = 0.5;
    expect(out[0].x).toBe(0.1);
    neighborsInto([b], out);
    expect(out).toHaveLength(1);
    expect(out[0]).toBe(kept);
    expect(out[0]).toEqual({ id: 1, species: 'chromis', x: -0.1, y: 0.25, z: 0 });
    expect(neighborsInto([], out)).toEqual([]);
  });

  it('présence d’une espèce qui approche les poissons', () => {
    expect(hasCleaningWalker([])).toBe(false);
    expect(hasCleaningWalker([{ species: 'gobie' }, { species: 'axolotl' }])).toBe(false);
    expect(hasCleaningWalker([{ species: 'gobie' }, { species: 'crevette' }])).toBe(true);
  });

  it.each([42, 7])(
    'graine %i : la crevette vise le poisson à sa position du début du pas, même s’il a déjà nagé',
    (seed) => {
      const world = createWorld(
        seed,
        [
          { species: 'gobie', count: 1 },
          { species: 'crevette', count: 1 },
        ],
        [],
        [],
        'recif',
      ) as MutableWorld;
      (world as { obstacles: unknown }).obstacles = [];
      const fishes = world.entities as Mutable<Fish>[];
      const goby = fishes.findIndex((e) => e.species === 'gobie');
      const index = fishes.findIndex((e) => e.species === 'crevette');
      // Le gobie est avant la crevette dans le tableau : il a déjà nagé quand elle avance.
      expect(goby).toBeLessThan(index);
      const shrimp = fishes[index];
      shrimp.x = (BOUNDS.hard.minX + BOUNDS.hard.maxX) / 2;
      shrimp.z = (BOUNDS.hard.minZ + BOUNDS.hard.maxZ) / 2;
      shrimp.y = groundHeight(shrimp.x, shrimp.z, GROUND) + WALKER.clearance;
      shrimp.yaw = Math.atan2(-0.06, -0.1);
      fishes[goby].x = shrimp.x + 0.1;
      fishes[goby].y = shrimp.y + 0.05;
      fishes[goby].z = shrimp.z + 0.06;
      (world as { tick: number }).tick = Math.round(cleaningTime(seed, shrimp.id) / SIM_DT) - 1;
      let approached = 0;
      for (let i = 0; i < 60; i++) {
        const start = structuredClone(fishes);
        const expected = start[index];
        const time = (world.tick + 1) * SIM_DT;
        if (cleaningTarget(expected, start, CLEANING) !== null) {
          approached++;
        }
        stepWalker(expected, SIM_DT, seed, time, BOUNDS, GROUND, [], start);
        advanceInPlace(world, 1);
        expect([shrimp.x, shrimp.z, shrimp.yaw]).toEqual([expected.x, expected.z, expected.yaw]);
      }
      expect(approached).toBeGreaterThan(0);
    },
  );
});
