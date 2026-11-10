import { describe, expect, it } from 'vitest';

import { SIM_DT } from './constants';
import { DEFAULT_DECOR, type DecorItem } from './decor';
import { environmentWater } from './environment';
import { startFilterCyclingInPlace, stepFilterMaturationInPlace } from './filter-maturation';
import { PHARMACY_PRODUCTS } from './pharmacy';
import { growthOf, stepPlantGrowthInPlace } from './plant-growth';
import {
  filterMaturationFactor,
  MEDICATION_FILTER_SLOWDOWN,
  plantGrowthFactor,
  SALT_PLANT_SLOWDOWN,
  SIDE_EFFECTS,
  sideEffectsOf,
  sideEffectText,
  sideEffectWarning,
} from './side-effects';
import { copyWater, freshWater, type MutableWaterState } from './water';
import { advanceInPlace, createWorld, type MutableWorld } from './world';

const TALL: DecorItem = {
  kind: 'plant',
  form: 'tall',
  x: 0.1,
  z: -0.1,
  rotation: 1.1,
  scale: 1,
  seed: 31,
};
const SURFACE = environmentWater('tropical').maxY;
/** Dix minutes simulées (une demi-journée) : quelques voxels de pousse. */
const STEPS = Math.round(600 / SIM_DT);

/** Bac tropical au décor par défaut, sans animal, filtre jeune ; `water` complète son eau. */
function youngTank(water: Partial<MutableWaterState> = {}): MutableWorld {
  const world = createWorld(42, [], [], DEFAULT_DECOR, 'tropical') as MutableWorld;
  const w = world.water as MutableWaterState;
  startFilterCyclingInPlace(w);
  Object.assign(w, water);
  return world;
}

/** Pousse totale des plantes et filtre après `STEPS` pas. */
function afterHalfDay(world: MutableWorld): { growth: number; filter: number } {
  advanceInPlace(world, STEPS);
  const growth = Object.values(world.water.plantGrowth ?? {}).reduce((a, b) => a + b, 0);
  return { growth, filter: world.water.filter };
}

describe('effets secondaires des traitements (#549)', () => {
  describe('déclarations', () => {
    it('seuls le médicament et le sel déclarent des effets', () => {
      expect(Object.keys(SIDE_EFFECTS).sort()).toEqual(['medicament', 'sel']);
      const without = PHARMACY_PRODUCTS.filter((p) => p !== 'medicament' && p !== 'sel');
      for (const product of without) {
        expect(sideEffectsOf(product)).toEqual([]);
        expect(sideEffectWarning(product)).toBeNull();
      }
    });

    it('médicament : filtre et invertébrés ; sel : plantes et invertébrés', () => {
      expect(sideEffectsOf('medicament').map((e) => e.target)).toEqual(['filtre', 'invertebres']);
      expect(sideEffectsOf('sel').map((e) => e.target)).toEqual(['plantes', 'invertebres']);
    });

    it('chaque effet est sourcé ou marqué « approximation de jeu »', () => {
      for (const effects of Object.values(SIDE_EFFECTS)) {
        for (const effect of effects) {
          const text = sideEffectText(effect);
          expect(text).toMatch(/\((approximation de jeu|.*docs\/SOINS\.md.*)\)$/);
        }
      }
      expect(sideEffectWarning('sel')).toBe(
        'Effets secondaires : Plantes : pousse ralentie de 10 % par g/L (approximation de jeu) ; ' +
          'Invertébrés : toxique, refusé si le bac en compte (prudence, non vérifié : docs/SOINS.md § 12).',
      );
    });
  });

  describe('facteurs', () => {
    it('exactement 1 sans produit, ou avec une valeur absurde', () => {
      expect(plantGrowthFactor({})).toBe(1);
      expect(plantGrowthFactor({ salt: 0 })).toBe(1);
      expect(plantGrowthFactor({ salt: Number.NaN })).toBe(1);
      expect(plantGrowthFactor({ salt: -3 })).toBe(1);
      expect(filterMaturationFactor({})).toBe(1);
      expect(filterMaturationFactor({ medication: 0 })).toBe(1);
      expect(filterMaturationFactor({ medication: Number.NaN })).toBe(1);
    });

    it('sel : 10 % par g/L, moitié à 5 g/L, jamais négatif', () => {
      expect(plantGrowthFactor({ salt: 1 })).toBeCloseTo(1 - SALT_PLANT_SLOWDOWN, 12);
      expect(plantGrowthFactor({ salt: 5 })).toBeCloseTo(0.5, 12);
      expect(plantGrowthFactor({ salt: 10 })).toBe(0);
      expect(plantGrowthFactor({ salt: 1e9 })).toBe(0);
    });

    it('médicament : maturation ralentie de 25 % quelle que soit la dose', () => {
      expect(filterMaturationFactor({ medication: 0.01 })).toBe(1 - MEDICATION_FILTER_SLOWDOWN);
      expect(filterMaturationFactor({ medication: 1 })).toBe(1 - MEDICATION_FILTER_SLOWDOWN);
    });
  });

  describe('pas en place', () => {
    it('pousse des plantes : facteur 1 identique au bit près, ½ deux fois moins, 0 rien', () => {
      const plain = stepPlantGrowthInPlace(undefined, [TALL], 60, SURFACE);
      const one = stepPlantGrowthInPlace(undefined, [TALL], 60, SURFACE, 1);
      const half = stepPlantGrowthInPlace(undefined, [TALL], 60, SURFACE, 0.5);
      expect(growthOf(one, 31)).toBe(growthOf(plain, 31));
      expect(growthOf(half, 31)).toBeCloseTo(growthOf(plain, 31) / 2, 12);
      expect(stepPlantGrowthInPlace(undefined, [TALL], 60, SURFACE, 0)).toBeUndefined();
      expect(stepPlantGrowthInPlace(undefined, [TALL], 60, SURFACE, Number.NaN)).toBeUndefined();
    });

    it('filtre jeune : plus lent avec du médicament ; filtre mûr inchangé', () => {
      const young = (medication?: number): MutableWaterState => {
        const water = copyWater(freshWater('tropical'));
        startFilterCyclingInPlace(water);
        if (medication !== undefined) {
          water.medication = medication;
        }
        return water;
      };
      const plain = young();
      const treated = young(1);
      stepFilterMaturationInPlace(plain, 3600);
      stepFilterMaturationInPlace(treated, 3600);
      expect(treated.filter).toBeLessThan(plain.filter);
      expect(treated.filter).toBeGreaterThan(young().filter);

      const mature = copyWater(freshWater('tropical'));
      mature.medication = 1;
      const before = mature.filter;
      stepFilterMaturationInPlace(mature, 3600);
      expect(mature.filter).toBe(before);
    });
  });

  describe('dans le monde : l’élément concerné, et lui seul', () => {
    const plain = afterHalfDay(youngTank());

    it('le bac sans produit pousse et mûrit', () => {
      expect(plain.growth).toBeGreaterThan(1);
      expect(plain.filter).toBeGreaterThan(youngTank().water.filter);
    });

    it('sel : plantes ralenties de moitié à 5 g/L, filtre identique', () => {
      const salted = afterHalfDay(youngTank({ salt: 5 }));
      expect(salted.growth).toBeCloseTo(plain.growth / 2, 6);
      expect(salted.filter).toBe(plain.filter);
    });

    it('médicament : filtre ralenti, plantes identiques', () => {
      const treated = afterHalfDay(youngTank({ medication: 1 }));
      expect(treated.filter).toBeLessThan(plain.filter);
      expect(treated.growth).toBe(plain.growth);
    });

    it('produit sans effet déclaré (charbon) : comportement inchangé au bit près', () => {
      const carbon = afterHalfDay(youngTank({ carbon: true }));
      expect(carbon.growth).toBe(plain.growth);
      expect(carbon.filter).toBe(plain.filter);
    });
  });
});
