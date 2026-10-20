import { MAX_STEPS_PER_FRAME, SIM_DT } from './constants';
import { fixedStepInto, type FixedStepState } from './fixed-step';
import { DEFAULT_SIM_SPEED, isSimSpeed, maxStepsForSpeed, scaledDt, SIM_SPEEDS } from './sim-speed';

describe('vitesse de simulation (#52)', () => {
  it('propose 0, 0,5, 1, 2 et 4, temps réel par défaut', () => {
    expect(SIM_SPEEDS).toEqual([0, 0.5, 1, 2, 4]);
    expect(DEFAULT_SIM_SPEED).toBe(1);
  });

  it('isSimSpeed : seules les vitesses proposées', () => {
    for (const speed of SIM_SPEEDS) {
      expect(isSimSpeed(speed)).toBe(true);
    }
    for (const value of [-1, 0.25, 3, 8, Number.NaN, Infinity, -0.5]) {
      expect(isSimSpeed(value)).toBe(false);
    }
  });

  it('scaledDt multiplie le temps réel par la vitesse', () => {
    expect(scaledDt(0.1, 0)).toBe(0);
    expect(scaledDt(0.1, 0.5)).toBeCloseTo(0.05, 12);
    expect(scaledDt(0.1, 1)).toBe(0.1);
    expect(scaledDt(0.1, 2)).toBeCloseTo(0.2, 12);
    expect(scaledDt(0.1, 4)).toBeCloseTo(0.4, 12);
  });

  it('scaledDt : temps réel négatif, nul, NaN ou infini compte pour 0 (jamais −0)', () => {
    for (const realDt of [-1, 0, -0, Number.NaN, Infinity, -Infinity]) {
      expect(Object.is(scaledDt(realDt, 2), 0)).toBe(true);
    }
  });

  it('vitesse invalide : RangeError', () => {
    expect(() => scaledDt(0.1, 3)).toThrow(RangeError);
    expect(() => scaledDt(0.1, Number.NaN)).toThrow(/vitesse de simulation invalide/);
    expect(() => maxStepsForSpeed(-1)).toThrow(RangeError);
  });

  it('maxStepsForSpeed : plafond de base jusqu’à ×1, multiplié au-delà', () => {
    expect(maxStepsForSpeed(0)).toBe(MAX_STEPS_PER_FRAME);
    expect(maxStepsForSpeed(0.5)).toBe(MAX_STEPS_PER_FRAME);
    expect(maxStepsForSpeed(1)).toBe(MAX_STEPS_PER_FRAME);
    expect(maxStepsForSpeed(2)).toBe(2 * MAX_STEPS_PER_FRAME);
    expect(maxStepsForSpeed(4)).toBe(4 * MAX_STEPS_PER_FRAME);
    expect(maxStepsForSpeed(4, 3)).toBe(12);
  });

  describe('branchée sur la boucle à pas fixe', () => {
    /** Pas exécutés pendant `seconds` secondes réelles à `fps` images par seconde. */
    function stepsAt(speed: number, seconds: number, fps = 60): number {
      const state: FixedStepState = { steps: 0, accumulator: 0, alpha: 0 };
      let total = 0;
      for (let i = 0; i < Math.round(seconds * fps); i++) {
        fixedStepInto(
          state.accumulator,
          scaledDt(1 / fps, speed),
          state,
          SIM_DT,
          maxStepsForSpeed(speed),
        );
        total += state.steps;
      }
      return total;
    }

    it('à 0 : aucun pas, l’accumulateur ne bouge pas', () => {
      expect(stepsAt(0, 10)).toBe(0);
      const state: FixedStepState = { steps: 0, accumulator: 0.004, alpha: 0 };
      fixedStepInto(state.accumulator, scaledDt(0.5, 0), state);
      expect(state.steps).toBe(0);
      expect(state.accumulator).toBeCloseTo(0.004, 12);
    });

    it('1 s réelle : 30, 60, 120 et 240 pas à ×0,5, ×1, ×2 et ×4', () => {
      expect(stepsAt(0.5, 1)).toBe(30);
      expect(stepsAt(1, 1)).toBe(60);
      expect(stepsAt(2, 1)).toBe(120);
      expect(stepsAt(4, 1)).toBe(240);
    });

    it('×4 à 30 images par seconde : pas de retard (8 pas par image, sous le plafond)', () => {
      expect(stepsAt(4, 2, 30)).toBe(480);
    });

    it('après une longue pause, le plafond s’applique toujours', () => {
      const state: FixedStepState = { steps: 0, accumulator: 0, alpha: 0 };
      fixedStepInto(0, scaledDt(60, 4), state, SIM_DT, maxStepsForSpeed(4));
      expect(state.steps).toBe(4 * MAX_STEPS_PER_FRAME);
      expect(state.accumulator).toBeGreaterThanOrEqual(0);
      expect(state.accumulator).toBeLessThan(SIM_DT);
    });
  });
});
