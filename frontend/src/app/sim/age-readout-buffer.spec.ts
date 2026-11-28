import { describe, expect, it } from 'vitest';

import { AgeReadoutBuffer } from './age-readout-buffer';
import { NO_AGES, speciesAges, type AgeReadout } from './aging-text';
import { DEFAULT_DAY_LENGTH_SECONDS } from './daylight';
import { sameAgeDays } from './testing/age-readout-oracle';
import { createWorld } from './world';
import type { World } from './world-types';

const DAY = DEFAULT_DAY_LENGTH_SECONDS;

function tank(seed: number): World {
  return createWorld(seed, [
    { species: 'neon', count: 5 },
    { species: 'guppy', count: 2 },
  ]);
}

function at(world: World, time: number): World {
  return { ...world, time };
}

describe('tampon du relevé des âges (#868)', () => {
  it('premier relevé : identique à speciesAges, nouvel objet', () => {
    const world = tank(42);
    const ages = new AgeReadoutBuffer().readout(world, NO_AGES);
    expect(ages).not.toBe(NO_AGES);
    expect(ages).toEqual(speciesAges(world));
  });

  it('mêmes jours affichés : le relevé affiché est rendu tel quel', () => {
    const buffer = new AgeReadoutBuffer();
    const world = tank(42);
    const shown = buffer.readout(world, NO_AGES);
    expect(buffer.readout(world, shown)).toBe(shown);
    // Quelques secondes de jeu plus tard : aucun nombre de jours ne change.
    expect(buffer.readout(at(world, world.time + 1), shown)).toBe(shown);
  });

  it('un jour de jeu de plus : nouveau relevé, identique à speciesAges', () => {
    const buffer = new AgeReadoutBuffer();
    const world = tank(7);
    const shown = buffer.readout(world, NO_AGES);
    const later = at(world, world.time + DAY);
    const next = buffer.readout(later, shown);
    expect(next).not.toBe(shown);
    expect(next).toEqual(speciesAges(later));
  });

  it('une espèce disparaît puis revient : relevé recalculé à chaque fois', () => {
    const buffer = new AgeReadoutBuffer();
    const world = tank(3);
    const shown = buffer.readout(world, NO_AGES);
    const neonsOnly = { ...world, entities: world.entities.filter((f) => f.species === 'neon') };
    const without = buffer.readout(neonsOnly, shown);
    expect(Object.keys(without)).toEqual(['neon']);
    expect(without).toEqual(speciesAges(neonsOnly));
    const back = buffer.readout(world, without);
    expect(back).toEqual(speciesAges(world));
    expect(buffer.readout(world, back)).toBe(back);
  });

  it('bac vide : le relevé vide reste le même objet', () => {
    const empty = { ...tank(1), entities: [] };
    expect(new AgeReadoutBuffer().readout(empty, NO_AGES)).toBe(NO_AGES);
  });

  it('relevé affiché étranger (espèce en trop ou jours différents) : recalculé', () => {
    const buffer = new AgeReadoutBuffer();
    const world = tank(9);
    const exact = speciesAges(world);
    const extra: AgeReadout = { ...exact, koi: { youngest: 0, oldest: 0 } };
    expect(buffer.readout(world, extra)).toEqual(exact);
    const neon = exact.neon!;
    const shifted: AgeReadout = { ...exact, neon: { ...neon, oldest: neon.oldest + DAY } };
    expect(buffer.readout(world, shifted)).toEqual(exact);
  });

  it('graines et temps variés : toujours les mêmes jours que speciesAges', () => {
    for (const seed of [1, 2, 42, 1234]) {
      const buffer = new AgeReadoutBuffer();
      let shown: AgeReadout = NO_AGES;
      for (const time of [0, 10, DAY - 1, DAY, 3.5 * DAY, 400 * DAY]) {
        const world = at(tank(seed), time);
        shown = buffer.readout(world, shown);
        expect(sameAgeDays(shown, speciesAges(world))).toBe(true);
      }
    }
  });

  it('oracle : deux relevés de mêmes jours sont égaux ; un jour de plus les distingue', () => {
    const a = { neon: { youngest: DAY, oldest: 2 * DAY } };
    expect(sameAgeDays(a, { neon: { youngest: DAY + 5, oldest: 2 * DAY + 5 } })).toBe(true);
    expect(sameAgeDays(a, { neon: { youngest: DAY, oldest: 3 * DAY } })).toBe(false);
    expect(sameAgeDays(a, {})).toBe(false);
    expect(sameAgeDays(a, { guppy: { youngest: DAY, oldest: 2 * DAY } })).toBe(false);
  });
});
