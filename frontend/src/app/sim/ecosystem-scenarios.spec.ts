import { describe, expect, it } from 'vitest';

import { startFilterCyclingInPlace } from './filter-maturation';
import {
  NORMAL_CARE,
  runScenario,
  SCENARIO_DAY_SECONDS,
  type EcosystemScenario,
  type ScenarioRecord,
} from './testing/ecosystem-scenario';
import type { MutableWaterState } from './water';
import { COMPOUND_THRESHOLDS } from './water-quality';
import { canAdd, populationOf } from './tank-capacity';
import { ENVIRONMENT_IDS } from './environment';
import { cloneWorld, createDefaultWorld, createWorld } from './world';
import type { World } from './world-types';
import type { DecorItem } from './decor';

/**
 * Scénarios de référence de l'écosystème (`docs/ECOSYSTEME.md` § 4, issue #799) : chacun fait
 * tourner un bac des semaines durant à gros pas et vérifie l'issue attendue. Un échec est une
 * **régression de réalisme**. Chaque scénario tourne en bien moins de 5 s (`timeout`).
 */

/** Durée maximale d'un scénario, en millisecondes (critère de l'issue #799). */
const SCENARIO_TIMEOUT_MS = 5000;

/** Santé en dessous de laquelle un animal est dit malade (moitié de la pleine santé). */
const SICK_HEALTH = 0.5;

function goldfish(filter: number): World {
  const world = cloneWorld(createWorld(1, [{ species: 'rouge', count: 1 }], [], [], 'bassin'));
  (world.water as MutableWaterState).filter = filter;
  return world;
}

/** Volume des scénarios du bac planté (S5, S6, S7). */
const PLANTED_LITERS = 60;

/**
 * Bac des scénarios S5 à S7 (`docs/ECOSYSTEME.md` § 4) : `neons` néons, filtre mûr, et, si
 * `planted`, seize plantes à tige (rapides) sur deux rangs au fond et huit touffes devant.
 */
function plantedTank(neons: number, planted: boolean): World {
  const decor: DecorItem[] = [];
  if (planted) {
    for (let i = 0; i < 16; i++) {
      const x = -0.5 + (i % 8) * 0.14;
      decor.push({
        kind: 'plant',
        form: 'tall',
        x,
        z: i < 8 ? -0.17 : -0.07,
        rotation: i,
        scale: 1,
        seed: 1000 + i,
      });
    }
    for (let i = 0; i < 8; i++) {
      const x = -0.5 + i * 0.14;
      decor.push({ kind: 'plant', form: 'tuft', x, z: 0.1, rotation: i, scale: 1, seed: 2000 + i });
    }
  }
  const world = cloneWorld(
    createWorld(1, [{ species: 'neon', count: neons }], [], decor, 'tropical'),
  );
  (world.water as MutableWaterState).filter = 1;
  return world;
}

/** Entretien des scénarios S5 à S7 : repas normaux, **aucun** changement d'eau. */
const NO_WATER_CHANGE = { feedEverySeconds: NORMAL_CARE.feedEverySeconds };

/** Durée des scénarios « stable » : trois mois de jeu. */
const STABLE_DAYS = 90;

/**
 * Bac stable : l'eau n'est jamais « mauvaise », l'ammoniaque et les nitrites restent sous le
 * seuil « à surveiller », les nitrates sous le seuil « mauvaise », et aucun animal n'est malade.
 */
function expectStable(record: ScenarioRecord): void {
  expect(record.firstBadDay).toBeNull();
  expect(record.ammonia.value).toBeLessThan(COMPOUND_THRESHOLDS.ammonia.watch);
  expect(record.nitrite.value).toBeLessThan(COMPOUND_THRESHOLDS.nitrite.watch);
  expect(record.nitrate.value).toBeLessThan(COMPOUND_THRESHOLDS.nitrate.bad);
  expect(record.minHealth).toBeGreaterThanOrEqual(SICK_HEALTH);
}

describe('scénarios de référence de l’écosystème (#799, #805, #807, #821)', () => {
  it(
    'S1 — bocal de 10 L, un poisson rouge, sans filtre : ammoniaque toxique en quelques jours, poisson malade',
    () => {
      const scenario: EcosystemScenario = {
        world: goldfish(0),
        liters: 10,
        care: { feedEverySeconds: NORMAL_CARE.feedEverySeconds },
        days: 7,
      };

      const record = runScenario(scenario);

      expect(record.firstBadDay).not.toBeNull();
      expect(record.firstBadDay!).toBeLessThanOrEqual(3);
      expect(record.ammonia.value).toBeGreaterThan(COMPOUND_THRESHOLDS.ammonia.bad);
      expect(record.minHealth).toBeLessThan(SICK_HEALTH);
    },
    SCENARIO_TIMEOUT_MS,
  );

  it(
    'S4 — bac neuf non cyclé rempli d’un coup : pic d’ammoniaque, puis de nitrites, puis retour au calme',
    () => {
      const world = cloneWorld(createDefaultWorld(1, 'tropical'));
      startFilterCyclingInPlace(world.water as MutableWaterState);

      const record = runScenario({ world, care: NORMAL_CARE, days: 63 });

      expect(record.ammonia.value).toBeGreaterThan(COMPOUND_THRESHOLDS.ammonia.watch);
      expect(record.nitrite.value).toBeGreaterThan(COMPOUND_THRESHOLDS.nitrite.watch);
      expect(record.ammonia.day).toBeLessThan(record.nitrite.day);
      expect(record.nitrite.day).toBeLessThan(21);
      expect(record.world.water.cycling).toBeUndefined();
      expect(record.world.water.ammonia).toBeLessThan(COMPOUND_THRESHOLDS.ammonia.watch);
      expect(record.world.water.nitrite).toBeLessThan(COMPOUND_THRESHOLDS.nitrite.watch);
    },
    SCENARIO_TIMEOUT_MS,
  );

  it(
    'S2 — 120 L filtré et mûr, un poisson rouge, 25 % d’eau changée par semaine : stable sur 3 mois',
    () => {
      const record = runScenario({
        world: goldfish(1),
        liters: 120,
        care: { ...NORMAL_CARE, waterChangeEveryDays: 7, waterChangeShare: 0.25 },
        days: STABLE_DAYS,
      });

      expectStable(record);
    },
    SCENARIO_TIMEOUT_MS,
  );

  it('S3 — 120 L, un poisson rouge adulte : le deuxième est refusé par la capacité (OATA : 150 L pour deux)', () => {
    const tank = { liters: 120, population: populationOf(goldfish(1)) };

    const first = canAdd({ liters: 120, population: [] }, 'rouge');
    const second = canAdd(tank, 'rouge');

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    expect(second.limit).toBe('capacite');
    expect(second.reason).toBe(
      '120 L : un poisson rouge adulte demande 100 L, puis 50 L par poisson rouge en plus (OATA) ; il faudrait 150 L',
    );
    expect(second.disagreement).toContain('RSPCA');
  });

  it.each(ENVIRONMENT_IDS)(
    'S12 — bac par défaut « %s », entretien normal : stable sur 3 mois',
    (environment) => {
      const record = runScenario({
        world: createDefaultWorld(1, environment),
        care: NORMAL_CARE,
        days: STABLE_DAYS,
      });

      expectStable(record);
    },
    SCENARIO_TIMEOUT_MS,
  );

  it(
    'S5 — 60 L très planté, 10 néons, sans changement d’eau : stable sur 3 mois, nitrates bas, pas d’algues',
    () => {
      const record = runScenario({
        world: plantedTank(10, true),
        liters: PLANTED_LITERS,
        care: NO_WATER_CHANGE,
        days: STABLE_DAYS,
      });

      expectStable(record);
      expect(record.nitrate.value).toBeLessThan(COMPOUND_THRESHOLDS.nitrate.watch / 2);
      expect(record.maxAlgae).toBe(0);
      expect(record.worstQuality).toBe('bonne');
    },
    SCENARIO_TIMEOUT_MS,
  );

  it(
    'S6 — le même sans plantes : nitrates qui montent sans cesse, algues, eau mauvaise en moins de 3 mois',
    () => {
      const record = runScenario({
        world: plantedTank(10, false),
        liters: PLANTED_LITERS,
        care: NO_WATER_CHANGE,
        days: STABLE_DAYS,
      });

      expect(record.firstBadDay).not.toBeNull();
      expect(record.nitrate.value).toBeGreaterThan(COMPOUND_THRESHOLDS.nitrate.bad);
      expect(record.nitrate.day).toBeGreaterThan(record.firstBadDay!);
      expect(record.maxAlgae).toBeGreaterThan(0);
      expect(record.minHealth).toBeLessThan(SICK_HEALTH);
    },
    SCENARIO_TIMEOUT_MS,
  );

  it(
    'S7 — le même bac planté surpeuplé (30 néons, au-delà de la capacité) : algues et nitrates montent malgré les plantes',
    () => {
      const crowded = plantedTank(30, true);
      expect(canAdd({ liters: PLANTED_LITERS, population: populationOf(crowded) }, 'neon').ok).toBe(
        false,
      );

      const record = runScenario({
        world: crowded,
        liters: PLANTED_LITERS,
        care: NO_WATER_CHANGE,
        days: STABLE_DAYS,
      });

      expect(record.nitrate.value).toBeGreaterThan(COMPOUND_THRESHOLDS.nitrate.bad);
      expect(record.maxAlgae).toBeGreaterThan(0);
      expect(record.worstQuality).toBe('mauvaise');
    },
    SCENARIO_TIMEOUT_MS,
  );

  it('le harnais ne modifie jamais le bac de départ et rend le même relevé deux fois', () => {
    const world = goldfish(1);
    const before = JSON.stringify(world);
    const scenario: EcosystemScenario = { world, liters: 120, care: NORMAL_CARE, days: 3 };

    const first = runScenario(scenario);
    const second = runScenario(scenario);

    expect(JSON.stringify(world)).toBe(before);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(first.world.time).toBe(3 * SCENARIO_DAY_SECONDS);
  });

  it.each([
    { feedEverySeconds: 7 },
    { feedEverySeconds: -60 },
    { feedEverySeconds: Number.NaN },
    { waterChangeEveryDays: 1e-4 },
    { waterChangeEveryDays: Number.POSITIVE_INFINITY },
  ])('le harnais refuse une période d’entretien qui ne tombe pas sur un pas : %o', (care) => {
    expect(() => runScenario({ world: goldfish(1), care, days: 1 })).toThrow(RangeError);
  });

  it('nourri sans changement d’eau, un bac peuplé finit en eau mauvaise (le harnais voit la dégradation)', () => {
    const record = runScenario({
      world: createDefaultWorld(1, 'tropical'),
      care: { feedEverySeconds: NORMAL_CARE.feedEverySeconds },
      days: 60,
    });

    expect(record.worstQuality).toBe('mauvaise');
    expect(record.firstBadDay).toBeGreaterThan(0);
  });
});
