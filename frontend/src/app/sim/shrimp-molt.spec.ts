import { describe, expect, it } from 'vitest';

import { FRY_GROWTH_TIME } from './fry';
import {
  addJournalEntry,
  createJournal,
  journalText,
  observeJournal,
  watchJournal,
} from './journal';
import { parseWorld, serializeWorld } from './save';
import { stepShrimpColonyInPlace } from './shrimp-colony';
import {
  EXUVIA_LIFETIME_SECONDS,
  exuviaAge,
  isShrimpHiding,
  lastMoltTime,
  MAX_EXUVIAE,
  MIN_MOLT_INTERVAL_SECONDS,
  MOLT_HIDE_SECONDS,
  MOLT_SECONDS_PER_CM,
  moltIntervalSeconds,
  moltOffset,
  moltsShell,
  shrimpLengthCm,
  stepMoltsInPlace,
  type Exuvia,
} from './shrimp-molt';
import { advanceEcosystemInPlace } from './ecosystem-step';
import type { SpeciesId } from './species';
import type { MutableWaterState } from './water';
import { birthYoungInPlace, cloneWorld, createWorld } from './world';
import type { Entity, Mutable, MutableWorld } from './world-types';

/** Bac tropical à filtre mûr avec `population`. */
function tank(population: { species: SpeciesId; count: number }[], seed = 4): MutableWorld {
  const world = cloneWorld(createWorld(seed, population, [], [], 'tropical'));
  (world.water as MutableWaterState).filter = 1;
  return world;
}

/** Avance les seules mues de `world` jusqu'à `end`, par pas de `dt` secondes. */
function moltUntil(world: MutableWorld, end: number, dt: number): number {
  let molts = 0;
  while (world.time + dt <= end + 1e-9) {
    world.time += dt;
    molts += stepMoltsInPlace(world, dt);
  }
  return molts;
}

describe('mue des crevettes et exuvies (#859)', () => {
  it('moltIntervalSeconds : proportionnel à la taille, plancher pour une taille nulle ou invalide', () => {
    expect(moltIntervalSeconds(3)).toBe(3 * MOLT_SECONDS_PER_CM);
    expect(moltIntervalSeconds(1.35)).toBeCloseTo(1.35 * MOLT_SECONDS_PER_CM);
    expect(moltIntervalSeconds(1.35)).toBeLessThan(moltIntervalSeconds(3));
    expect(moltIntervalSeconds(0.1)).toBe(MIN_MOLT_INTERVAL_SECONDS);
    for (const bad of [0, -2, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(moltIntervalSeconds(bad)).toBe(MIN_MOLT_INTERVAL_SECONDS);
    }
  });

  it('un jeune, plus petit, mue plus souvent qu’un adulte ; seules les crevettes muent', () => {
    expect(moltsShell('cerise')).toBe(true);
    for (const species of ['neon', 'neritine', 'crevette', 'rouge'] as const) {
      expect(moltsShell(species)).toBe(false);
    }
    expect(shrimpLengthCm({})).toBe(3);
    expect(shrimpLengthCm({ growth: 0 })).toBeCloseTo(3 * 0.45);
    expect(shrimpLengthCm({ growth: FRY_GROWTH_TIME - 1 })).toBeCloseTo(3 * 0.85);
    const young = moltIntervalSeconds(shrimpLengthCm({ growth: 0 }));
    const adult = moltIntervalSeconds(shrimpLengthCm({}));
    expect(young).toBeLessThan(adult);
  });

  it('moltOffset : dans [0, intervalle), déterministe, différent d’une crevette à l’autre', () => {
    const offsets = [1, 2, 3, 4, 5].map((id) => moltOffset(7, id, 3600));
    for (const offset of offsets) {
      expect(offset).toBeGreaterThanOrEqual(0);
      expect(offset).toBeLessThan(3600);
    }
    expect(moltOffset(7, 3, 3600)).toBe(offsets[2]);
    expect(new Set(offsets).size).toBe(offsets.length);
    expect(moltOffset(8, 3, 3600)).not.toBe(offsets[2]);
  });

  it('un adulte mue une fois par intervalle, ni avant le début du monde ni deux fois', () => {
    const world = tank([{ species: 'cerise', count: 1 }]);
    const shrimp = world.entities[0];
    const interval = moltIntervalSeconds(3);

    expect(lastMoltTime(shrimp, world.seed, 0)).toBeNull();
    expect(moltUntil(world, interval * 4, 5)).toBe(4);
    const molt = lastMoltTime(shrimp, world.seed, world.time)!;
    expect(molt).toBeGreaterThan(world.time - interval);
    expect(molt).toBeLessThanOrEqual(world.time);
    expect(lastMoltTime({ ...shrimp, species: 'neon' }, world.seed, world.time)).toBeNull();
  });

  it('pas fin et gros pas donnent les mêmes exuvies, aux mêmes instants', () => {
    const fine = tank([{ species: 'cerise', count: 6 }]);
    const coarse = tank([{ species: 'cerise', count: 6 }]);
    moltUntil(fine, 3000, 1 / 60);
    moltUntil(coarse, 3000, 5);

    expect(fine.exuviae!.length).toBeGreaterThan(0);
    expect(coarse.exuviae!.map((s) => [s.time, s.x])).toEqual(
      fine.exuviae!.map((s) => [s.time, s.x]),
    );
  });

  it('l’exuvie reste au sol, à la place de la mue, puis se dissout au bout de sa durée de vie', () => {
    const world = tank([{ species: 'cerise', count: 1 }]);
    const shrimp = world.entities[0] as Mutable<Entity>;
    const interval = moltIntervalSeconds(3);
    moltUntil(world, interval, 5);
    const shell = world.exuviae![0];
    shrimp.x += 0.2;

    expect(world.exuviae).toHaveLength(1);
    expect(shell).toMatchObject({ species: 'cerise', size: 1, yaw: shrimp.yaw });
    expect(exuviaAge(shell, shell.time)).toBe(0);
    expect(exuviaAge(shell, shell.time + EXUVIA_LIFETIME_SECONDS / 2)).toBeCloseTo(0.5);
    // Plus de crevette : l'exuvie reste jusqu'à sa dissolution, puis le champ disparaît.
    world.entities = [];
    moltUntil(world, shell.time + EXUVIA_LIFETIME_SECONDS - 5, 5);
    expect(world.exuviae).toEqual([shell]);
    moltUntil(world, shell.time + EXUVIA_LIFETIME_SECONDS + 5, 5);
    expect(world.exuviae).toBeUndefined();
    expect('exuviae' in world).toBe(false);
  });

  it('au plus MAX_EXUVIAE exuvies : les plus anciennes partent ; sans crevette, rien ne change', () => {
    // Vingt jeunes (intervalle de 1 620 s) : plus de 32 mues pendant la vie d'une exuvie.
    const world = tank([{ species: 'cerise', count: 20 }]);
    for (const shrimp of world.entities as Mutable<Entity>[]) {
      shrimp.growth = 0;
    }
    moltUntil(world, EXUVIA_LIFETIME_SECONDS - 10, 5);
    const times = world.exuviae!.map((s) => s.time);

    expect(world.exuviae).toHaveLength(MAX_EXUVIAE);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    const empty = tank([{ species: 'neon', count: 8 }]);
    expect(moltUntil(empty, 3600, 5)).toBe(0);
    expect('exuviae' in empty).toBe(false);
  });

  it('juste après sa mue, la crevette se cache pendant MOLT_HIDE_SECONDS, puis plus', () => {
    const world = tank([{ species: 'cerise', count: 1 }]);
    const shrimp = world.entities[0];
    moltUntil(world, moltIntervalSeconds(3), 5);
    const molt = world.exuviae![0].time;

    expect(isShrimpHiding(shrimp, world.seed, molt)).toBe(true);
    expect(isShrimpHiding(shrimp, world.seed, molt + MOLT_HIDE_SECONDS - 1)).toBe(true);
    expect(isShrimpHiding(shrimp, world.seed, molt + MOLT_HIDE_SECONDS + 1)).toBe(false);
    expect(isShrimpHiding(shrimp, world.seed, molt - 1)).toBe(false);
    expect(isShrimpHiding({ ...shrimp, species: 'neon' }, world.seed, molt)).toBe(false);
  });

  it('une crevette cachée n’est mangée par aucun poisson ; découverte, si (approximation de jeu)', () => {
    // Jeunes à découvert face à six guppys, compatibles avec les adultes : un pas de 1500 s
    // compose 25 fenêtres, tout jeune visible est mangé, aucun jeune caché ne l'est.
    let hidden = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const world = tank([{ species: 'guppy', count: 6 }], seed);
      for (let k = 0; k < 20; k++) {
        const near = { x: (k % 10) * 0.05 - 0.25, y: 0.05, z: 0 };
        (birthYoungInPlace(world, 'cerise', near) as Mutable<Entity>).growth = 0;
      }
      world.time = 1500;
      const young = world.entities.filter((e) => e.species === 'cerise');
      const hiding = young.filter((e) => isShrimpHiding(e, world.seed, world.time));
      stepShrimpColonyInPlace(world, 1500, birthYoungInPlace, 300);
      const left = world.entities.filter((e) => e.species === 'cerise');
      hidden += hiding.length;

      expect(left.map((e) => e.id)).toEqual(hiding.map((e) => e.id));
    }
    expect(hidden).toBeGreaterThan(0);
  });

  it('sauvegarde : les exuvies se rechargent à l’identique ; une liste invalide est refusée', () => {
    const world = tank([{ species: 'cerise', count: 6 }]);
    advanceEcosystemInPlace(world, 2400);
    const shells = world.exuviae!;
    const read = parseWorld(serializeWorld(world));

    expect(shells.length).toBeGreaterThan(0);
    expect(read.ok && read.world.exuviae).toEqual(shells);
    expect(read.ok && read.world.entities.map((e) => isShrimpHiding(e, e.id, 2400))).toEqual(
      world.entities.map((e) => isShrimpHiding(e, e.id, 2400)),
    );
    const bad = (exuviae: unknown): boolean => {
      const data = JSON.parse(serializeWorld(world)) as Record<string, unknown>;
      data['exuviae'] = exuviae;
      return parseWorld(JSON.stringify(data)).ok;
    };
    const ok: Exuvia = shells[0];
    expect(bad([ok])).toBe(true);
    expect(bad([{ ...ok, species: 'neon' }])).toBe(false);
    expect(bad([{ ...ok, x: 99 }])).toBe(false);
    expect(bad([{ ...ok, size: 0 }])).toBe(false);
    expect(bad([{ ...ok, time: -1 }])).toBe(false);
    expect(bad([{ ...ok, yaw: 'nord' }])).toBe(false);
    expect(bad('exuvies')).toBe(false);
    expect(bad(Array.from({ length: MAX_EXUVIAE + 1 }, () => ok))).toBe(false);
    const without = parseWorld(serializeWorld(tank([{ species: 'neon', count: 3 }])));
    expect(without.ok && 'exuviae' in without.world).toBe(false);
  });

  it('journal : une entrée neutre « Mue » par espèce pour les nouvelles exuvies, rien au premier regard', () => {
    const world = tank([{ species: 'cerise', count: 6 }]);
    advanceEcosystemInPlace(world, 1200);
    const watch = watchJournal(world);
    expect(observeJournal(watch, world)).toEqual([]);
    const before = world.exuviae?.length ?? 0;
    advanceEcosystemInPlace(world, 1800);
    const after = world.exuviae!.filter((s) => s.time > 1200).length;
    const events = observeJournal(watch, world);

    expect(after).toBeGreaterThan(0);
    expect(before + after).toBe(world.exuviae!.length);
    expect(events).toEqual([{ time: world.time, kind: 'mue', detail: 'cerise', count: after }]);
    expect(observeJournal(watch, world)).toEqual([]);
    expect(journalText(events[0])).toMatch(/^Mue : Crevette cerise \(\d+ anima(l|ux)\)$/);
    const journal = createJournal();
    expect(addJournalEntry(journal, events[0])).toBe(true);
  });
});
