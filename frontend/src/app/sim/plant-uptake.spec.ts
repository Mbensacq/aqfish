import { describe, expect, it } from 'vitest';

import { DEFAULT_DAY_LENGTH_SECONDS } from './daylight';
import { DEFAULT_DECOR, type DecorItem } from './decor';
import { advanceEcosystemInPlace } from './ecosystem-step';
import { environmentWater } from './environment';
import { isGrowingPlant, prunePlantInPlace, type MutablePlantGrowth } from './plant-growth';
import {
  absorbNitrogenInPlace,
  AMMONIA_MG_PER_MG_N,
  NITRATE_MG_PER_MG_N,
  nitrogenGrowthFactor,
  phAfterUptake,
  PH_RISE_PER_MG_N_PER_L,
  PLANT_FOOTPRINT_M2,
  PLANT_MIN_NITROGEN_GROWTH,
  PLANT_UPTAKE_MG_N_PER_M2_DAY,
  plantMass,
  plantUptakeCapacity,
  type NitrogenWater,
} from './plant-uptake';
import { parseWorld, serializeWorld } from './save';
import type { MutableWaterState } from './water';
import { cloneWorld, createDefaultWorld, createWorld } from './world';
import { stepPlantsStageInPlace } from './world-step-life';
import type { MutableWorld } from './world-types';

/** Plantes actives (#821, ADR 0175) : absorption, masse, pousse liée à l'azote. */

const SURFACE = environmentWater('tropical').maxY;

function plant(form: 'tall' | 'tuft', seed: number, scale = 1): DecorItem {
  return { kind: 'plant', form, x: 0, z: -0.1, rotation: 0, scale, seed };
}

const TALL = plant('tall', 101);
const ROCK = DEFAULT_DECOR.find((item) => item.kind !== 'plant')!;

function water(ammonia: number, nitrate: number): NitrogenWater {
  return { ammonia, nitrate };
}

describe('masse des plantes (#821)', () => {
  it('vaut l’emprise de la forme × échelle² sans pousse, 0 pour un autre élément', () => {
    expect(plantMass(plant('tuft', 1), undefined, SURFACE)).toBe(PLANT_FOOTPRINT_M2.tuft);
    expect(plantMass(plant('tuft', 1, 2), undefined, SURFACE)).toBe(4 * PLANT_FOOTPRINT_M2.tuft);
    expect(plantMass(TALL, undefined, SURFACE)).toBe(PLANT_FOOTPRINT_M2.tall);
    expect(plantMass(ROCK, undefined, SURFACE)).toBe(0);
  });

  it('croît avec la pousse d’une plante à tige ; la taille retire de la masse', () => {
    const growth: MutablePlantGrowth = { [String(TALL.seed)]: 40 };
    const grown = plantMass(TALL, growth, SURFACE);

    const cut = prunePlantInPlace(growth, TALL, SURFACE);

    expect(grown).toBeGreaterThan(PLANT_FOOTPRINT_M2.tall);
    expect(cut).toBe(true);
    expect(plantMass(TALL, growth, SURFACE)).toBeLessThan(grown);
    expect(plantMass(TALL, growth, SURFACE)).toBeGreaterThanOrEqual(PLANT_FOOTPRINT_M2.tall);
  });
});

describe('capacité d’absorption (#821)', () => {
  it('est nulle sans lumière, sans plante, ou pour une lumière non finie', () => {
    expect(plantUptakeCapacity(DEFAULT_DECOR, undefined, SURFACE, 0)).toBe(0);
    expect(plantUptakeCapacity(DEFAULT_DECOR, undefined, SURFACE, Number.NaN)).toBe(0);
    expect(plantUptakeCapacity([ROCK], undefined, SURFACE, 1)).toBe(0);
    expect(plantUptakeCapacity([], undefined, SURFACE, 1)).toBe(0);
  });

  it('suit la masse et le type : une plante rapide absorbe 4 fois une lente de même masse, une flottante plus encore', () => {
    const tall = plantUptakeCapacity([TALL], undefined, SURFACE, 1);
    const twoTall = plantUptakeCapacity([TALL, plant('tall', 202)], undefined, SURFACE, 1);
    const tuft = plantUptakeCapacity([plant('tuft', 1, Math.SQRT2)], undefined, SURFACE, 1);

    expect(tall).toBeCloseTo(
      (PLANT_FOOTPRINT_M2.tall * PLANT_UPTAKE_MG_N_PER_M2_DAY.rapide) / DEFAULT_DAY_LENGTH_SECONDS,
      12,
    );
    expect(twoTall).toBeCloseTo(2 * tall, 12);
    expect(tall / tuft).toBeCloseTo(4, 9);
    expect(PLANT_UPTAKE_MG_N_PER_M2_DAY.flottante).toBeGreaterThan(
      PLANT_UPTAKE_MG_N_PER_M2_DAY.rapide,
    );
  });

  it('est proportionnelle à la lumière, plafonnée à la lumière pleine', () => {
    const full = plantUptakeCapacity([TALL], undefined, SURFACE, 1);

    expect(plantUptakeCapacity([TALL], undefined, SURFACE, 0.5)).toBeCloseTo(full / 2, 12);
    expect(plantUptakeCapacity([TALL], undefined, SURFACE, 3)).toBe(full);
  });
});

describe('absorption de l’azote (#821)', () => {
  it('prend l’ammonium avant le nitrate', () => {
    const w = water(5, 20);

    absorbNitrogenInPlace(w, 0.001, 10, 1);

    const fromAmmonium = (5 - w.ammonia) / AMMONIA_MG_PER_MG_N;
    const fromNitrate = (20 - w.nitrate) / NITRATE_MG_PER_MG_N;
    expect(fromAmmonium).toBeGreaterThan(0);
    expect(fromNitrate).toBeLessThan(fromAmmonium / 50);
  });

  it('prend le nitrate quand l’ammonium manque', () => {
    const w = water(0, 20);

    const absorbed = absorbNitrogenInPlace(w, 0.001, 10, 1);

    expect(w.ammonia).toBe(0);
    expect(absorbed).toBeGreaterThan(0);
    expect(w.nitrate).toBeCloseTo(20 - absorbed * NITRATE_MG_PER_MG_N, 12);
  });

  it('ne dépasse jamais le plafond de la masse de plantes, même en eau très chargée', () => {
    const capacity = plantUptakeCapacity([TALL], undefined, SURFACE, 1);
    const ceiling = (capacity * 5) / 60;

    const absorbed = absorbNitrogenInPlace(water(50, 100), capacity, 60, 5);

    expect(absorbed).toBeLessThanOrEqual(ceiling);
    expect(absorbed).toBeGreaterThan(0.95 * ceiling);
  });

  it('ne retire jamais plus que ce qui est dissous', () => {
    const w = water(1e-6, 1e-6);

    absorbNitrogenInPlace(w, 1e6, 1, 1000);

    expect(w.ammonia).toBeGreaterThanOrEqual(0);
    expect(w.nitrate).toBeGreaterThanOrEqual(0);
  });

  it('ne change rien sans capacité ni azote', () => {
    const none = water(3, 30);
    const empty = water(0, 0);

    expect(absorbNitrogenInPlace(none, 0, 10, 1)).toBe(0);
    expect(absorbNitrogenInPlace(empty, 1, 10, 1)).toBe(0);
    expect(none).toEqual(water(3, 30));
    expect(empty).toEqual(water(0, 0));
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'refuse un volume invalide (%s litres)',
    (liters) => {
      expect(() => absorbNitrogenInPlace(water(1, 1), 1, liters, 1)).toThrow(RangeError);
    },
  );

  it('refuse un pas invalide', () => {
    expect(() => absorbNitrogenInPlace(water(1, 1), 1, 10, 0)).toThrow(RangeError);
  });
});

describe('pousse liée à l’azote (#821)', () => {
  it('est au plancher sans azote et presque pleine en eau chargée', () => {
    expect(nitrogenGrowthFactor(water(0, 0))).toBe(PLANT_MIN_NITROGEN_GROWTH);
    expect(nitrogenGrowthFactor(water(Number.NaN, 0))).toBe(PLANT_MIN_NITROGEN_GROWTH);
    expect(nitrogenGrowthFactor(water(0, 20))).toBeGreaterThan(0.98);
    expect(nitrogenGrowthFactor(water(0, 20))).toBeLessThan(1);
  });

  it('une plante sans azote disponible pousse moins vite qu’en eau qui en a', () => {
    const grow = (nitrate: number): number => {
      const world = cloneWorld(createDefaultWorld(1));
      (world.water as MutableWaterState).nitrate = nitrate;
      stepPlantsStageInPlace(world, 60);
      return world.water.plantGrowth?.[String(DEFAULT_DECOR.find(isGrowingPlant)!.seed)] ?? 0;
    };

    const starved = grow(0);
    const fed = grow(20);

    expect(starved).toBeGreaterThan(0);
    expect(starved).toBeLessThan(fed / 3);
  });
});

describe('pH relevé par l’absorption (#821)', () => {
  it('remonte de l’azote absorbé × la constante, jamais au-dessus de l’eau neuve', () => {
    expect(phAfterUptake(6.5, 1, 7)).toBeCloseTo(6.5 + PH_RISE_PER_MG_N_PER_L, 12);
    expect(phAfterUptake(6.99, 100, 7)).toBe(7);
    expect(phAfterUptake(7.5, 1, 7)).toBe(7.5);
    expect(phAfterUptake(6.5, 0, 7)).toBe(6.5);
    expect(phAfterUptake(6.5, Number.NaN, 7)).toBe(6.5);
  });
});

describe('plantes dans le pas du bac (#821)', () => {
  function tankWith(decor: readonly DecorItem[], lighting?: number): MutableWorld {
    const world = cloneWorld(createWorld(3, [], [], decor, 'tropical'));
    const w = world.water as MutableWaterState;
    w.ammonia = 1;
    w.nitrate = 20;
    if (lighting !== undefined) {
      w.lighting = lighting;
    }
    return world;
  }

  it('lampe éteinte : aucune absorption', () => {
    const world = tankWith([TALL], 0);

    stepPlantsStageInPlace(world, 60);

    expect(world.water.ammonia).toBe(1);
    expect(world.water.nitrate).toBe(20);
  });

  it('bac planté éclairé : l’ammoniaque et les nitrates baissent ; sans plante, rien ne bouge', () => {
    const planted = tankWith([TALL]);
    const bare = tankWith([ROCK]);

    stepPlantsStageInPlace(planted, 60, 10);
    stepPlantsStageInPlace(bare, 60, 10);

    expect(planted.water.ammonia).toBeLessThan(1);
    expect(planted.water.nitrate).toBeLessThanOrEqual(20);
    expect(bare.water.ammonia).toBe(1);
    expect(bare.water.nitrate).toBe(20);
  });

  it('le bassin et le récif n’ont pas encore de plantes actives', () => {
    for (const environment of ['bassin', 'recif'] as const) {
      const world = cloneWorld(createDefaultWorld(1, environment));
      (world.water as MutableWaterState).ammonia = 1;

      stepPlantsStageInPlace(world, 60);

      expect(world.water.ammonia).toBe(1);
    }
  });

  it('une ancienne sauvegarde, sans pousse enregistrée, se relit et ses plantes absorbent', () => {
    const world = cloneWorld(createDefaultWorld(5));
    (world.water as MutableWaterState).nitrate = 30;
    const data = JSON.parse(serializeWorld(world)) as Record<string, unknown>;
    delete (data['water'] as Record<string, unknown>)['plantGrowth'];

    const result = parseWorld(JSON.stringify(data));
    expect(result.ok).toBe(true);
    const back = cloneWorld(result.ok ? result.world : world);
    stepPlantsStageInPlace(back, 600);

    expect(back.water.nitrate).toBeLessThan(30);
  });

  it('est déterministe : même bac, même eau au bit près', () => {
    const a = cloneWorld(createDefaultWorld(7));
    const b = cloneWorld(createDefaultWorld(7));

    advanceEcosystemInPlace(a, DEFAULT_DAY_LENGTH_SECONDS);
    advanceEcosystemInPlace(b, DEFAULT_DAY_LENGTH_SECONDS);

    expect(JSON.stringify(a.water)).toBe(JSON.stringify(b.water));
  });
});
