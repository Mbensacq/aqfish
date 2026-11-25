import { describe, expect, it } from 'vitest';

import type { DecorItem } from './decor';
import { environmentWater } from './environment';
import {
  eatFryInPlace,
  FRY_EAT_RADIUS,
  FRY_FULL_COVER_M2,
  FRY_HIDE_RADIUS,
  FRY_SAFE_AGE,
  fryCover,
  fryProtection,
  fryShelterCount,
  fryVigilance,
  isSheltered,
  type FryRefugeSource,
} from './fry';
import { prunePlantInPlace, type MutablePlantGrowth } from './plant-growth';
import { plantMass } from './plant-uptake';
import { parseWorld, serializeWorld } from './save';
import type { Fish } from './swimmer';
import { birthFryInPlace, cloneWorld, createWorld } from './world';

/** Refuge gradué des alevins (issue #823, tranche 2 de #731, ADR 0176). */

const SURFACE = environmentWater('tropical').maxY;
const SOURCE: FryRefugeSource = { environment: 'tropical', seed: 7, water: {} };
/** Nombre d'alevins fictifs pour mesurer une part à l'abri. */
const SAMPLE = 2000;

function plant(form: 'tall' | 'tuft', scale: number, x = 0, seed = 11): DecorItem {
  return { kind: 'plant', form, x, z: 0, rotation: 0, scale, seed };
}

/** Part des alevins d'identifiants 0 à `SAMPLE - 1`, en (0, 0), à l'abri des plantes. */
function shelteredShare(plants: readonly DecorItem[], source = SOURCE): number {
  let count = 0;
  for (let id = 0; id < SAMPLE; id++) {
    count += isSheltered({ id, x: 0, z: 0 }, plants, source, SURFACE) ? 1 : 0;
  }
  return count / SAMPLE;
}

function animal(id: number, species: Fish['species'], x: number, growth?: number): Fish {
  return {
    id,
    kind: 'fish',
    species,
    x,
    y: 0.1,
    z: 0,
    ...(growth === undefined ? {} : { growth }),
  } as Fish;
}

describe('refuge gradué des alevins (#823)', () => {
  it('protection : nulle sans plante (plancher), proportionnelle, pleine à la couverture pleine', () => {
    expect(fryProtection(0)).toBe(0);
    expect(fryProtection(-1)).toBe(0);
    expect(fryProtection(Number.NaN)).toBe(0);
    expect(fryProtection(Number.POSITIVE_INFINITY)).toBe(0);
    expect(fryProtection(FRY_FULL_COVER_M2 / 2)).toBeCloseTo(0.5, 12);
    expect(fryProtection(FRY_FULL_COVER_M2)).toBe(1);
    expect(fryProtection(10 * FRY_FULL_COVER_M2)).toBe(1);
  });

  it('couverture : somme des masses des plantes dans le rayon horizontal, 0 sans plante proche', () => {
    const a = plant('tall', 1);
    const b = plant('tuft', 1, FRY_HIDE_RADIUS * 0.9, 12);
    const far = plant('tall', 1, FRY_HIDE_RADIUS * 1.5, 13);
    const sum = plantMass(a, undefined, SURFACE) + plantMass(b, undefined, SURFACE);
    expect(fryCover([a, b, far], 0, 0, undefined, SURFACE)).toBeCloseTo(sum, 12);
    expect(fryCover([far], 0, 0, undefined, SURFACE)).toBe(0);
    expect(fryCover([], 0, 0, undefined, SURFACE)).toBe(0);
  });

  it('la survie croît avec la masse de plantes proches et vaut le plancher sans plante', () => {
    const shares = [
      shelteredShare([]),
      shelteredShare([plant('tuft', 0.8)]),
      shelteredShare([plant('tuft', 1.2)]),
      shelteredShare([plant('tall', 1)]),
      shelteredShare([plant('tall', 1), plant('tuft', 1, 0.05, 12)]),
    ];
    expect(shares[0]).toBe(0);
    for (let i = 1; i < shares.length; i++) {
      expect(shares[i]).toBeGreaterThan(shares[i - 1]);
    }
    expect(shares[4]).toBe(1);
    // La part à l'abri suit la protection, à l'échantillonnage près.
    const tall = fryProtection(plantMass(plant('tall', 1), undefined, SURFACE));
    expect(Math.abs(shares[3] - tall)).toBeLessThan(0.04);
  });

  it('une plante taillée protège moins ; même graine, même résultat ; autre graine, autres alevins', () => {
    const stem = plant('tall', 0.8, 0, 101);
    const growth: MutablePlantGrowth = { [String(stem.seed)]: 40 };
    const grown: FryRefugeSource = { ...SOURCE, water: { plantGrowth: { ...growth } } };
    expect(prunePlantInPlace(growth, stem, SURFACE)).toBe(true);
    const cut: FryRefugeSource = { ...SOURCE, water: { plantGrowth: growth } };

    const coverGrown = fryCover([stem], 0, 0, grown.water.plantGrowth, SURFACE);
    const coverCut = fryCover([stem], 0, 0, cut.water.plantGrowth, SURFACE);
    expect(coverCut).toBeLessThan(coverGrown);
    expect(fryProtection(coverGrown)).toBeLessThan(1);
    expect(shelteredShare([stem], cut)).toBeLessThan(shelteredShare([stem], grown));

    expect(shelteredShare([stem], grown)).toBe(shelteredShare([stem], grown));
    expect(fryVigilance(7, 3)).toBe(fryVigilance(7, 3));
    const ids = Array.from({ length: 50 }, (_, id) => id);
    expect(ids.map((id) => fryVigilance(7, id))).not.toEqual(ids.map((id) => fryVigilance(8, id)));
    for (const id of ids) {
      const v = fryVigilance(7, id);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('prédation : un alevin à portée est mangé selon sa vigilance sous une couverture partielle', () => {
    const tuft = plant('tuft', 1);
    const protection = fryProtection(plantMass(tuft, undefined, SURFACE));
    expect(protection).toBeGreaterThan(0);
    expect(protection).toBeLessThan(1);
    let eaten = 0;
    for (let id = 1; id <= 400; id++) {
      const fishes = [animal(0, 'neon', FRY_EAT_RADIUS / 2), animal(id, 'guppy', 0, FRY_SAFE_AGE)];
      const expected = fryVigilance(SOURCE.seed, id) < protection ? 0 : 1;
      expect(eatFryInPlace(fishes, [tuft], SOURCE)).toBe(expected);
      eaten += expected;
    }
    expect(eaten).toBeGreaterThan(0);
    expect(eaten).toBeLessThan(400);
  });

  it('bilan : compte les alevins et ceux à l’abri, aucun sans plante', () => {
    const fishes = [
      animal(0, 'neon', 0),
      animal(1, 'guppy', 0, 10),
      animal(2, 'guppy', 0, 10),
      animal(3, 'guppy', 0, 10),
    ];
    const dense = [plant('tall', 1.3)];
    expect(fryShelterCount(fishes, dense, SOURCE)).toEqual({ fry: 3, sheltered: 3 });
    expect(fryShelterCount(fishes, [], SOURCE)).toEqual({ fry: 3, sheltered: 0 });
    expect(fryShelterCount([animal(0, 'neon', 0)], dense, SOURCE)).toEqual({
      fry: 0,
      sheltered: 0,
    });
  });

  it('sauvegarde : un bac à alevins enregistré se relit, avec le même refuge (aucun champ ajouté)', () => {
    const decor = [plant('tall', 1, 0, 21), plant('tuft', 1, 0.3, 22)];
    const world = cloneWorld(createWorld(5, [{ species: 'guppy', count: 4 }], [], decor));
    for (let i = 0; i < 3; i++) {
      expect(birthFryInPlace(world, world.entities[0], { x: 0, y: 0.1, z: 0 })).not.toBeNull();
    }
    const text = serializeWorld(world);
    expect(text).not.toContain('refuge');
    const read = parseWorld(text);
    expect(read.ok).toBe(true);
    if (!read.ok) {
      return;
    }
    expect(fryShelterCount(read.world.entities, read.world.decor, read.world)).toEqual(
      fryShelterCount(world.entities, world.decor, world),
    );
  });
});
