import { MAX_STEPS_PER_FRAME, SIM_DT } from './constants';
import { fixedStep, fixedStepInto, type FixedStepResult, type FixedStepState } from './fixed-step';

/** Enchaîne `fixedStep` sur une suite de durées réelles et totalise les pas. */
function run(realDts: readonly number[]): { total: number; last: FixedStepResult } {
  let accumulator = 0;
  let total = 0;
  let last: FixedStepResult = { steps: 0, accumulator: 0, alpha: 0 };
  for (const realDt of realDts) {
    last = fixedStep({ accumulator, realDt });
    accumulator = last.accumulator;
    total += last.steps;
  }
  return { total, last };
}

describe('fixedStep', () => {
  it('dt réel nul : aucun pas, accumulateur inchangé', () => {
    expect(fixedStep({ accumulator: 0, realDt: 0 })).toEqual({
      steps: 0,
      accumulator: 0,
      alpha: 0,
    });
    const result = fixedStep({ accumulator: SIM_DT / 2, realDt: 0 });
    expect(result.steps).toBe(0);
    expect(result.accumulator).toBeCloseTo(SIM_DT / 2, 12);
    expect(result.alpha).toBeCloseTo(0.5, 9);
  });

  it('exactement un pas pour exactement SIM_DT', () => {
    const result = fixedStep({ accumulator: 0, realDt: SIM_DT });
    expect(result.steps).toBe(1);
    expect(result.accumulator).toBe(0);
    expect(result.alpha).toBe(0);
  });

  it('conserve le reste d’une image à l’autre', () => {
    const first = fixedStep({ accumulator: 0, realDt: SIM_DT * 0.6 });
    expect(first.steps).toBe(0);
    expect(first.alpha).toBeCloseTo(0.6, 9);

    const second = fixedStep({ accumulator: first.accumulator, realDt: SIM_DT * 0.6 });
    expect(second.steps).toBe(1);
    expect(second.accumulator).toBeCloseTo(SIM_DT * 0.2, 12);
    expect(second.alpha).toBeCloseTo(0.2, 9);
  });

  it('60 images de 1/60 s ⇒ exactement 60 pas (erreur d’arrondi absorbée)', () => {
    const { total, last } = run(new Array<number>(60).fill(1 / 60));
    expect(total).toBe(60);
    expect(last.accumulator).toBe(0);
  });

  it('écran 144 Hz pendant 10 s ⇒ 600 pas', () => {
    expect(run(new Array<number>(1440).fill(1 / 144)).total).toBe(600);
  });

  it('écran 30 Hz : deux pas par image', () => {
    const { total, last } = run(new Array<number>(30).fill(1 / 30));
    expect(total).toBe(60);
    expect(last.steps).toBe(2);
  });

  it('plafonne un dt énorme et abandonne le retard', () => {
    const result = fixedStep({ accumulator: 0, realDt: 10 + SIM_DT * 0.25 });
    expect(result.steps).toBe(MAX_STEPS_PER_FRAME);
    expect(result.accumulator).toBeCloseTo(SIM_DT * 0.25, 9);
    expect(result.alpha).toBeCloseTo(0.25, 6);

    // L'image suivante ne rattrape pas le retard abandonné.
    const next = fixedStep({ accumulator: result.accumulator, realDt: SIM_DT });
    expect(next.steps).toBe(1);
  });

  it('accepte un plafond personnalisé, y compris 0', () => {
    expect(fixedStep({ accumulator: 0, realDt: 1 }, SIM_DT, 2).steps).toBe(2);
    expect(fixedStep({ accumulator: 0, realDt: 1 }, SIM_DT, 0).steps).toBe(0);
  });

  it.each([-0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'traite un dt réel invalide (%s) comme nul',
    (realDt) => {
      const result = fixedStep({ accumulator: SIM_DT / 4, realDt });
      expect(result.steps).toBe(0);
      expect(result.accumulator).toBeCloseTo(SIM_DT / 4, 12);
    },
  );

  it('ignore un accumulateur entrant invalide', () => {
    expect(fixedStep({ accumulator: Number.NaN, realDt: SIM_DT }).steps).toBe(1);
    expect(fixedStep({ accumulator: -1, realDt: 0 }).accumulator).toBe(0);
  });

  it('garde alpha dans [0, 1) et l’accumulateur dans [0, SIM_DT) sur des durées irrégulières', () => {
    let accumulator = 0;
    // Durées pseudo-aléatoires déterministes entre 0 et 120 ms.
    let x = 7;
    for (let i = 0; i < 5000; i++) {
      x = (x * 1103515245 + 12345) % 2147483648;
      const result = fixedStep({ accumulator, realDt: (x / 2147483648) * 0.12 });
      expect(result.alpha).toBeGreaterThanOrEqual(0);
      expect(result.alpha).toBeLessThan(1);
      expect(result.accumulator).toBeGreaterThanOrEqual(0);
      expect(result.accumulator).toBeLessThan(SIM_DT);
      expect(result.steps).toBeLessThanOrEqual(MAX_STEPS_PER_FRAME);
      accumulator = result.accumulator;
    }
  });

  it.each([0, -SIM_DT, Number.NaN, Number.POSITIVE_INFINITY])('refuse un pas fixe de %s', (dt) => {
    expect(() => fixedStep({ accumulator: 0, realDt: 0 }, dt)).toThrow(RangeError);
  });

  it.each([-1, 1.5])('refuse un plafond de %s', (maxSteps) => {
    expect(() => fixedStep({ accumulator: 0, realDt: 0 }, SIM_DT, maxSteps)).toThrow(RangeError);
  });
});

describe('fixedStepInto (boucle d’affichage, sans allocation)', () => {
  it('écrit dans out, le renvoie, et donne le même résultat que fixedStep', () => {
    const out: FixedStepState = { steps: -1, accumulator: -1, alpha: -1 };
    let accumulator = 0;
    let x = 11;
    for (let i = 0; i < 500; i++) {
      x = (x * 1103515245 + 12345) % 2147483648;
      const realDt = (x / 2147483648) * 0.12;
      const expected = fixedStep({ accumulator, realDt });
      expect(fixedStepInto(accumulator, realDt, out)).toBe(out);
      expect(out).toEqual(expected);
      accumulator = out.accumulator;
    }
  });

  it('valide dt et maxSteps comme fixedStep', () => {
    const out: FixedStepState = { steps: 0, accumulator: 0, alpha: 0 };
    expect(() => fixedStepInto(0, 0, out, 0)).toThrow(RangeError);
    expect(() => fixedStepInto(0, 0, out, SIM_DT, -1)).toThrow(RangeError);
  });
});
