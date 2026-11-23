import { describe, expect, it } from 'vitest';

import { startFilterCyclingInPlace } from './filter-maturation';
import {
  NORMAL_CARE,
  runScenario,
  SCENARIO_DAY_SECONDS,
  type EcosystemScenario,
} from './testing/ecosystem-scenario';
import type { MutableWaterState } from './water';
import { COMPOUND_THRESHOLDS } from './water-quality';
import { cloneWorld, createDefaultWorld, createWorld } from './world';
import type { World } from './world-types';

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

describe('scénarios de référence de l’écosystème (#799)', () => {
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

  it('sans entretien, un bac peuplé finit en eau mauvaise (le harnais voit la dégradation)', () => {
    const record = runScenario({
      world: createDefaultWorld(1, 'tropical'),
      care: {},
      days: 30,
    });

    expect(record.worstQuality).toBe('mauvaise');
    expect(record.firstBadDay).toBeGreaterThan(0);
  });
});
