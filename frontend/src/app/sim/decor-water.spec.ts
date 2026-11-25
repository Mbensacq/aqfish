import { describe, expect, it } from 'vitest';

import {
  decorMaterial,
  parseDecor,
  parseDecorItems,
  validateDecorItem,
  type DecorItem,
} from './decor';
import {
  DECOR_REFERENCE_LITERS,
  LIMESTONE_INACTIVE_PH,
  LIMESTONE_KH_CEILING,
  LIMESTONE_PH_TARGET,
  LIMESTONE_RATE,
  LIMESTONE_STILL_WATER_FACTOR,
  limestoneDissolved,
  limestonePh,
  limestoneRate,
  limestoneSurface,
  stepDecorWaterInPlace,
  WOOD_PH_FLOOR,
  woodPh,
  woodSurface,
} from './decor-water';
import { freshWater, type MutableWaterState } from './water';
import { TAP_HARDNESS } from './water-hardness';

/** Roches et bois qui agissent sur l'eau (issue #733, ADR 0181). */

const DAY = 1200;

function rock(material?: 'inert' | 'limestone', scale = 1): DecorItem {
  const base: DecorItem = { kind: 'rock', x: 0, z: 0, rotation: 0, scale, seed: 7 };
  return material === undefined ? base : { ...base, material };
}

const WOOD: DecorItem = { kind: 'wood', x: 0.1, z: 0, rotation: 0, scale: 1, seed: 8 };
const PLANT: DecorItem = {
  kind: 'plant',
  form: 'tall',
  x: -0.1,
  z: 0,
  rotation: 0,
  scale: 1,
  seed: 9,
};

function tropicalWater(): MutableWaterState {
  const water = { ...freshWater('tropical') } as MutableWaterState;
  water.filter = 1;
  return water;
}

/** Fait agir `decor` pendant `days` jours de jeu, par pas de 5 s. */
function soak(water: MutableWaterState, decor: DecorItem[], days: number, liters = 60): void {
  const steps = (days * DAY) / 5;
  for (let i = 0; i < steps; i++) {
    stepDecorWaterInPlace(water, decor, 'tropical', liters, 5);
  }
}

describe('matière du décor (#733)', () => {
  it('un rocher sans matière écrite (sauvegarde ancienne) est inerte', () => {
    const [old] = parseDecor(
      '[{ "kind": "rock", "x": 0, "z": 0, "rotation": 0, "scale": 1, "seed": 3 }]',
    );
    expect(old.material).toBeUndefined();
    expect(decorMaterial(old)).toBe('inert');
    expect(decorMaterial(WOOD)).toBe('wood');
    expect(decorMaterial(PLANT)).toBeNull();
  });

  it('la matière calcaire est gardée à la relecture, la matière inerte n’est pas écrite', () => {
    const [limestone, inert] = parseDecorItems([rock('limestone'), rock('inert')]);
    expect(limestone.material).toBe('limestone');
    expect('material' in inert).toBe(false);
    expect(JSON.stringify(parseDecorItems([rock('limestone')]))).toContain(
      '"material":"limestone"',
    );
  });

  it('refuse une matière inconnue ou donnée à autre chose qu’un rocher', () => {
    expect(validateDecorItem({ ...rock(), material: 'granit' })[0]).toContain('material doit être');
    expect(validateDecorItem({ ...WOOD, material: 'limestone' })).toEqual([
      'material est réservée aux rochers',
    ]);
    expect(validateDecorItem({ ...PLANT, material: 'inert' })).toEqual([
      'material est réservée aux rochers',
    ]);
    expect(validateDecorItem(rock('limestone'))).toEqual([]);
  });
});

describe('surfaces et taux', () => {
  it('surface : somme des échelles au carré, seules les roches calcaires et les bois comptent', () => {
    const decor = [rock('limestone', 2), rock('inert', 3), rock(undefined, 1.5), WOOD, PLANT];
    expect(limestoneSurface(decor)).toBe(4);
    expect(woodSurface(decor)).toBe(1);
    expect(limestoneSurface([])).toBe(0);
    expect(woodSurface([])).toBe(0);
  });

  it('le pas lit les mêmes surfaces que limestoneSurface et woodSurface (décor mixte)', () => {
    const decor = [rock('limestone', 2), rock('inert', 3), rock(undefined, 1.5), WOOD, PLANT];
    const stepped = tropicalWater();
    stepped.ph = 7;
    stepDecorWaterInPlace(stepped, decor, 'tropical', 60, DAY);

    const expected = tropicalWater();
    const rate = limestoneRate(limestoneSurface(decor), expected.filter, 60);
    const dissolved = limestoneDissolved(TAP_HARDNESS.tropical.kh, 7, rate, DAY);
    const ph = woodPh(limestonePh(7, rate, DAY), woodSurface(decor), 60, DAY);

    expect(stepped.kh).toBe(TAP_HARDNESS.tropical.kh + dissolved);
    expect(stepped.ph).toBe(ph);
  });

  it('le courant accélère la roche ; sans filtre, elle garde le quart de son taux', () => {
    expect(limestoneRate(1, 1, DECOR_REFERENCE_LITERS)).toBeCloseTo(LIMESTONE_RATE, 15);
    expect(limestoneRate(1, 0, DECOR_REFERENCE_LITERS)).toBeCloseTo(
      LIMESTONE_RATE * LIMESTONE_STILL_WATER_FACTOR,
      15,
    );
    // Deux fois moins d'eau, deux fois plus vite ; deux fois plus de surface, de même.
    expect(limestoneRate(2, 1, DECOR_REFERENCE_LITERS)).toBeCloseTo(
      limestoneRate(1, 1, DECOR_REFERENCE_LITERS / 2),
      15,
    );
  });
});

describe('roche calcaire', () => {
  it('tire le pH vers la cible sans jamais la dépasser, même sur un pas immense', () => {
    expect(limestonePh(7, 1, 1e9)).toBe(LIMESTONE_PH_TARGET);
    const ph = limestonePh(7, LIMESTONE_RATE, DAY);
    expect(ph).toBeGreaterThan(7);
    expect(ph).toBeLessThan(LIMESTONE_PH_TARGET);
  });

  it('plafond : n’abaisse jamais un pH déjà au-dessus de la cible (une roche n’acidifie pas)', () => {
    expect(limestonePh(LIMESTONE_PH_TARGET, 1, DAY)).toBe(LIMESTONE_PH_TARGET);
    expect(limestonePh(8.2, 1, DAY)).toBe(8.2);
    expect(limestonePh(7, 0, DAY)).toBe(7);
  });

  it('ne se dissout plus au-dessus de pH 8,4 ni au plafond de dureté carbonatée', () => {
    expect(limestoneDissolved(6, LIMESTONE_INACTIVE_PH + 0.01, 1, DAY)).toBe(0);
    expect(limestoneDissolved(LIMESTONE_KH_CEILING, 7, 1, DAY)).toBe(0);
    expect(limestoneDissolved(6, 7, 0, DAY)).toBe(0);
    expect(limestoneDissolved(6, LIMESTONE_INACTIVE_PH, 1, 1e9)).toBeCloseTo(
      LIMESTONE_KH_CEILING - 6,
      12,
    );
  });

  it('relève autant la dureté carbonatée que la générale, et tire le pH vers 7,6–7,9', () => {
    const water = tropicalWater();
    soak(water, [rock('limestone')], 90);
    const tap = TAP_HARDNESS.tropical;
    expect(water.kh).toBeGreaterThan(tap.kh + 3);
    expect(water.kh).toBeLessThanOrEqual(LIMESTONE_KH_CEILING);
    expect(water.gh! - tap.gh).toBeCloseTo(water.kh! - tap.kh, 9);
    expect(water.ph).toBeGreaterThanOrEqual(7.6);
    expect(water.ph).toBeLessThanOrEqual(7.9);
  });

  it('un bloc en eau calme agit en mois, pas en jours', () => {
    const still = tropicalWater();
    still.filter = 0;
    soak(still, [rock('limestone')], 7, DECOR_REFERENCE_LITERS);
    expect(still.ph).toBeLessThan(7.1);
    soak(still, [rock('limestone')], 173, DECOR_REFERENCE_LITERS);
    expect(still.ph).toBeGreaterThan(7.35);
  });

  it('sans effet au-dessus de pH 8,4 : ni dureté ni pH ne bougent', () => {
    const water = tropicalWater();
    water.ph = 8.5;
    soak(water, [rock('limestone')], 30);
    expect(water.ph).toBe(8.5);
    expect(water.kh).toBeUndefined();
    expect(water.gh).toBeUndefined();
  });
});

describe('roche inerte et bac sans matière active', () => {
  it('une roche inerte n’a aucun effet : l’eau reste identique au bit près', () => {
    const water = tropicalWater();
    water.ph = 6.4;
    const before = JSON.stringify(water);
    soak(water, [rock('inert', 3), rock(undefined, 2), PLANT], 60);
    expect(JSON.stringify(water)).toBe(before);
  });
});

describe('bois flotté', () => {
  it('tire légèrement le pH vers son plancher, jamais en dessous', () => {
    expect(woodPh(7, 1, DECOR_REFERENCE_LITERS, 1e12)).toBe(WOOD_PH_FLOOR);
    expect(woodPh(WOOD_PH_FLOOR - 0.5, 1, DECOR_REFERENCE_LITERS, DAY)).toBe(WOOD_PH_FLOOR - 0.5);
    expect(woodPh(7, 0, DECOR_REFERENCE_LITERS, DAY)).toBe(7);
    const water = tropicalWater();
    soak(water, [WOOD], 30, DECOR_REFERENCE_LITERS);
    expect(water.ph).toBeLessThan(7);
    expect(water.ph).toBeGreaterThan(6.9);
    expect(water.kh).toBeUndefined();
  });

  it('avec une roche calcaire, le bois retient un peu le pH sous la cible', () => {
    const both = tropicalWater();
    soak(both, [rock('limestone'), WOOD], 90);
    const alone = tropicalWater();
    soak(alone, [rock('limestone')], 90);
    expect(both.ph).toBeLessThan(alone.ph);
    expect(both.ph).toBeGreaterThan(7.4);
  });
});
