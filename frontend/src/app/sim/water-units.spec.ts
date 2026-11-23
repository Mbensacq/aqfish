import { SIM_DT } from './constants';
import { environmentWater } from './environment';
import { addDecayedFoodInPlace, FOOD_DECAY_AMMONIA } from './food-decay';
import {
  AMMONIA_CONVERSION,
  AMMONIA_PER_LOAD_LITER,
  freshWater,
  NITRITE_CONVERSION,
  RESTING_AMMONIA_PER_LOAD_LITER,
  stepWaterInPlace,
  waterLiters,
  waterLoad,
  type MutableWaterState,
} from './water';
import { AMMONIA_BINDER_CAPACITY } from './water-conditioner';
import { COMPOUND_THRESHOLDS, GAUGE_MAX } from './water-quality';
import {
  LEGACY_MAX_CONCENTRATION,
  MAX_CONCENTRATIONS,
  MG_PER_LITER_PER_GAME_UNIT,
  NITRATE_PER_NITRITE,
  NITRITE_PER_AMMONIA,
  NITROGEN_COMPOUNDS,
} from './water-units';
import { createDefaultWorld, PLANT_CUT_AMMONIA } from './world';

/** Anciennes valeurs, en unités de jeu (avant #793), pour vérifier leur conversion. */
const LEGACY = {
  ammoniaPerLoadLiter: 0.045,
  /** Production au repos (#798, après #793) exprimée en unités de jeu : un tiers de 0,045. */
  restingAmmoniaPerLoadLiter: 0.015,
  foodDecayAmmonia: 5,
  plantCutAmmonia: 0.05,
  binderCapacity: 1,
  thresholds: {
    ammonia: { watch: 2, bad: 5 },
    nitrite: { watch: 2, bad: 5 },
    nitrate: { watch: 20, bad: 40 },
  },
  gaugeMax: { ammonia: 7.5, nitrite: 7.5, nitrate: 60 },
} as const;

/** Ancien pas de l'eau (unités de jeu), réduit aux composés azotés : la référence. */
function legacyStep(
  water: { ammonia: number; nitrite: number; nitrate: number },
  dt: number,
  load: number,
  liters: number,
): void {
  const clamp = (v: number) => Math.min(Math.max(v, 0), LEGACY_MAX_CONCENTRATION);
  const toNitrite = water.ammonia * (1 - Math.exp(-AMMONIA_CONVERSION * dt));
  const toNitrate = water.nitrite * (1 - Math.exp(-NITRITE_CONVERSION * dt));
  const produced = ((LEGACY.restingAmmoniaPerLoadLiter * load) / liters) * dt;
  water.ammonia = clamp(water.ammonia - toNitrite + produced);
  water.nitrite = clamp(water.nitrite + toNitrite - toNitrate);
  water.nitrate = clamp(water.nitrate + toNitrate);
}

describe('unités des composés azotés (mg/L, #793)', () => {
  it('les facteurs de conversion sont des puissances de deux (conversion exacte)', () => {
    for (const compound of NITROGEN_COMPOUNDS) {
      const exponent = Math.log2(MG_PER_LITER_PER_GAME_UNIT[compound]);
      expect(Number.isInteger(exponent)).toBe(true);
    }
  });

  it('les seuils sont les anciens seuils convertis, en mg/L', () => {
    for (const compound of NITROGEN_COMPOUNDS) {
      const k = MG_PER_LITER_PER_GAME_UNIT[compound];
      expect(COMPOUND_THRESHOLDS[compound].watch).toBe(LEGACY.thresholds[compound].watch * k);
      expect(COMPOUND_THRESHOLDS[compound].bad).toBe(LEGACY.thresholds[compound].bad * k);
      expect(GAUGE_MAX[compound]).toBe(LEGACY.gaugeMax[compound] * k);
      expect(MAX_CONCENTRATIONS[compound]).toBe(LEGACY_MAX_CONCENTRATION * k);
    }
  });

  it('les seuils restent dans les bornes des sources de docs/SOINS.md', () => {
    // Ammoniaque : 1 mg/L déjà dangereux à pH 8 (§ 6) ; tolérance TAN < 2 mg/L (Loh 2015).
    expect(COMPOUND_THRESHOLDS.ammonia).toEqual({ watch: 1, bad: 2.5 });
    // Nitrites : toxiques dès 0,1 mg/L (§ 1) ; tolérance < 0,5 mg/L (Loh 2015).
    expect(COMPOUND_THRESHOLDS.nitrite.watch).toBeGreaterThan(0.1);
    expect(COMPOUND_THRESHOLDS.nitrite.bad).toBeLessThan(1);
    // Nitrates : < 10 idéal, < 70 à 110 tolérés (Loh 2015).
    expect(COMPOUND_THRESHOLDS.nitrate).toEqual({ watch: 20, bad: 40 });
  });

  it('les apports d’ammoniaque sont les anciens apports convertis', () => {
    const k = MG_PER_LITER_PER_GAME_UNIT.ammonia;
    expect(AMMONIA_PER_LOAD_LITER).toBe(LEGACY.ammoniaPerLoadLiter * k);
    expect(RESTING_AMMONIA_PER_LOAD_LITER).toBe(LEGACY.restingAmmoniaPerLoadLiter * k);
    expect(FOOD_DECAY_AMMONIA).toBe(LEGACY.foodDecayAmmonia * k);
    expect(PLANT_CUT_AMMONIA).toBe(LEGACY.plantCutAmmonia * k);
    expect(AMMONIA_BINDER_CAPACITY).toBe(LEGACY.binderCapacity * k);
  });

  it('la masse convertie garde le rapport d’avant (une unité donnait une unité)', () => {
    expect(NITRITE_PER_AMMONIA).toBe(0.25);
    expect(NITRATE_PER_NITRITE).toBe(8);
  });

  it('un bac tropical peuplé évolue sur 1 h simulée comme l’ancien pas (part au repos, #798), au facteur près, au bit près', () => {
    const world = createDefaultWorld(7, 'tropical');
    // Charge triple : au repos, la production d'un bac nourri à sa faim (#798).
    const load = 3 * waterLoad(world.entities);
    const liters = waterLiters(environmentWater('tropical'));
    const water: MutableWaterState = { ...freshWater('tropical'), ammonia: 1, nitrite: 0.5 };
    const legacy = { ammonia: 2, nitrite: 4, nitrate: 0 };
    for (let tick = 0; tick < 3600 / SIM_DT; tick++) {
      stepWaterInPlace(water, SIM_DT, load, liters, 24);
      legacyStep(legacy, SIM_DT, load, liters);
    }
    for (const compound of NITROGEN_COMPOUNDS) {
      expect(water[compound]).toBe(legacy[compound] * MG_PER_LITER_PER_GAME_UNIT[compound]);
    }
    expect(water.nitrate).toBeGreaterThan(COMPOUND_THRESHOLDS.nitrate.watch);
  });

  it('les plafonds sont tenus par composé', () => {
    const water: MutableWaterState = {
      ...freshWater('tropical'),
      ammonia: MAX_CONCENTRATIONS.ammonia,
      nitrite: MAX_CONCENTRATIONS.nitrite,
      nitrate: MAX_CONCENTRATIONS.nitrate,
    };
    stepWaterInPlace(water, 60, 1000, 1, 24);
    addDecayedFoodInPlace(water, 1000, 1);
    for (const compound of NITROGEN_COMPOUNDS) {
      expect(water[compound]).toBeLessThanOrEqual(MAX_CONCENTRATIONS[compound]);
    }
  });
});
