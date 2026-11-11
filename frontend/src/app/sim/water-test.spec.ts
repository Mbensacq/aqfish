import { describe, expect, it } from 'vitest';

import {
  dropCount,
  formatKitValue,
  isWaterKit,
  kitAdvice,
  MAX_DROPS,
  readKit,
  roundToChart,
  sameWaterTestView,
  startWaterTest,
  WATER_KIT_INFO,
  WATER_KITS,
  WATER_TEST_TICKS,
  waterTestDone,
  waterTestRemainingTicks,
  waterTestView,
  type WaterTestSample,
} from './water-test';

const SAMPLE: WaterTestSample = {
  ph: 7.13,
  ammonia: 0.1,
  nitrite: 0.4,
  nitrate: 33,
  gh: 9.2,
  kh: 4,
};

describe('roundToChart', () => {
  const chart = WATER_KIT_INFO.ammoniaque.chart;

  it('lit le palier le plus proche', () => {
    expect(roundToChart(0, chart)).toEqual({ value: 0, bound: 'dedans' });
    expect(roundToChart(0.1, chart)).toEqual({ value: 0, bound: 'dedans' });
    expect(roundToChart(0.7, chart)).toEqual({ value: 0.5, bound: 'dedans' });
    expect(roundToChart(3.1, chart)).toEqual({ value: 4, bound: 'dedans' });
    expect(roundToChart(8, chart)).toEqual({ value: 8, bound: 'dedans' });
  });

  it('à égale distance, lit le palier du dessus (prudent)', () => {
    expect(roundToChart(0.125, chart).value).toBe(0.25);
    expect(roundToChart(0.375, chart).value).toBe(0.5);
    expect(roundToChart(3, chart).value).toBe(4);
    expect(roundToChart(7.1, WATER_KIT_INFO.ph.chart).value).toBe(7.2);
  });

  it('hors des bornes : palier extrême, marqué', () => {
    expect(roundToChart(9, chart)).toEqual({ value: 8, bound: 'au-dessus' });
    expect(roundToChart(-1, chart)).toEqual({ value: 0, bound: 'au-dessous' });
    expect(roundToChart(5.5, WATER_KIT_INFO.ph.chart)).toEqual({ value: 6, bound: 'au-dessous' });
    expect(roundToChart(9.5, WATER_KIT_INFO.ph.chart)).toEqual({
      value: 8.8,
      bound: 'au-dessus',
    });
  });

  it('valeur non finie : dernier palier, au-dessus (jamais rassurant)', () => {
    expect(roundToChart(Number.NaN, chart)).toEqual({ value: 8, bound: 'au-dessus' });
    expect(roundToChart(Number.POSITIVE_INFINITY, chart).bound).toBe('au-dessus');
    expect(roundToChart(Number.NEGATIVE_INFINITY, chart).bound).toBe('au-dessus');
  });

  it('carte vide : erreur', () => {
    expect(() => roundToChart(1, [])).toThrow(RangeError);
  });

  it('cartes croissantes, sans doublon', () => {
    for (const kit of WATER_KITS) {
      const { chart: steps, reading } = WATER_KIT_INFO[kit];
      expect(steps.length > 0).toBe(reading === 'carte');
      steps.forEach((step, n) => n > 0 && expect(step).toBeGreaterThan(steps[n - 1]));
    }
  });
});

describe('dropCount', () => {
  it('une goutte par degré, arrondi au-dessus, au moins une', () => {
    expect(dropCount(0)).toEqual({ value: 1, bound: 'dedans' });
    expect(dropCount(0.2).value).toBe(1);
    expect(dropCount(4).value).toBe(4);
    expect(dropCount(4.0000001).value).toBe(4);
    expect(dropCount(4.3).value).toBe(5);
    expect(dropCount(MAX_DROPS)).toEqual({ value: MAX_DROPS, bound: 'dedans' });
  });

  it('au-delà du plafond ou non finie : plafond, au-dessus', () => {
    expect(dropCount(MAX_DROPS + 0.5)).toEqual({ value: MAX_DROPS, bound: 'au-dessus' });
    expect(dropCount(400).bound).toBe('au-dessus');
    expect(dropCount(Number.NaN)).toEqual({ value: MAX_DROPS, bound: 'au-dessus' });
  });
});

describe('readKit et formatKitValue', () => {
  it('chaque kit lit ses grandeurs', () => {
    expect(readKit('ph', SAMPLE)).toEqual([{ parameter: 'ph', value: 7.2, bound: 'dedans' }]);
    expect(readKit('nitrites', SAMPLE)[0].value).toBe(0.5);
    expect(readKit('nitrates', SAMPLE)[0].value).toBe(40);
    expect(readKit('durete', SAMPLE)).toEqual([
      { parameter: 'gh', value: 10, bound: 'dedans' },
      { parameter: 'kh', value: 4, bound: 'dedans' },
    ]);
  });

  it('affiche la virgule, l’unité et les bornes', () => {
    expect(formatKitValue('ph', { parameter: 'ph', value: 7.2, bound: 'dedans' })).toBe('7,2');
    expect(formatKitValue('ph', { parameter: 'ph', value: 6, bound: 'au-dessous' })).toBe('≤ 6,0');
    expect(
      formatKitValue('ammoniaque', { parameter: 'ammonia', value: 8, bound: 'au-dessus' }),
    ).toBe('≥ 8 u.');
    expect(formatKitValue('durete', { parameter: 'gh', value: 1, bound: 'dedans' })).toBe(
      '1 goutte',
    );
    expect(formatKitValue('durete', { parameter: 'kh', value: 7, bound: 'dedans' })).toBe(
      '7 gouttes',
    );
  });
});

describe('délai du test', () => {
  it('se termine après WATER_TEST_TICKS pas, ni avant ni après', () => {
    const test = startWaterTest('ph', SAMPLE, 1000);
    expect(waterTestRemainingTicks(test, 1000)).toBe(WATER_TEST_TICKS);
    expect(waterTestDone(test, 1000 + WATER_TEST_TICKS - 1)).toBe(false);
    expect(waterTestDone(test, 1000 + WATER_TEST_TICKS)).toBe(true);
    expect(waterTestRemainingTicks(test, 1e9)).toBe(0);
  });

  it('déterministe : même échantillon, même pas, même test', () => {
    expect(startWaterTest('nitrates', SAMPLE, 5)).toEqual(startWaterTest('nitrates', SAMPLE, 5));
  });

  it('pas antérieur au départ ou non fini : délai entier', () => {
    const test = startWaterTest('ph', SAMPLE, 1000);
    expect(waterTestRemainingTicks(test, 0)).toBe(WATER_TEST_TICKS);
    expect(waterTestRemainingTicks(test, Number.NaN)).toBe(WATER_TEST_TICKS);
  });

  it('l’échantillon est pris au lancement', () => {
    const test = startWaterTest('nitrates', SAMPLE, 0);
    expect(test.values[0].value).toBe(40);
  });
});

describe('waterTestView', () => {
  it('en cours : secondes restantes, aucun résultat', () => {
    const test = startWaterTest('ph', SAMPLE, 0);
    const view = waterTestView(test, 0);
    expect(view).toMatchObject({ done: false, remainingSeconds: 10, results: [], advice: null });
    expect(waterTestView(test, 1).remainingSeconds).toBe(10);
    expect(waterTestView(test, WATER_TEST_TICKS - 1).remainingSeconds).toBe(1);
  });

  it('terminé : valeurs et conseil', () => {
    const view = waterTestView(startWaterTest('durete', SAMPLE, 0), WATER_TEST_TICKS);
    expect(view.done).toBe(true);
    expect(view.remainingSeconds).toBe(0);
    expect(view.results).toEqual([
      { label: 'GH', text: '10 gouttes' },
      { label: 'KH', text: '4 gouttes' },
    ]);
    expect(view.advice).toContain('changement d’eau');
  });

  it('sameWaterTestView', () => {
    const test = startWaterTest('ph', SAMPLE, 0);
    expect(sameWaterTestView(null, null)).toBe(true);
    expect(sameWaterTestView(waterTestView(test, 0), null)).toBe(false);
    expect(sameWaterTestView(waterTestView(test, 0), waterTestView(test, 1))).toBe(true);
    expect(sameWaterTestView(waterTestView(test, 0), waterTestView(test, 120))).toBe(false);
  });
});

describe('kitAdvice', () => {
  const value = (parameter: 'ammonia' | 'nitrate', v: number) =>
    [{ parameter, value: v, bound: 'dedans' as const }] as const;

  it('ammoniaque : rien, à surveiller, trop haut', () => {
    expect(kitAdvice('ammoniaque', value('ammonia', 0))).toContain('Rien à signaler');
    expect(kitAdvice('ammoniaque', value('ammonia', 2))).toContain('à surveiller');
    expect(kitAdvice('ammoniaque', value('ammonia', 8))).toContain('trop haut');
    expect(
      kitAdvice('nitrites', [{ parameter: 'nitrite', value: 8, bound: 'au-dessus' }]),
    ).toContain('amorce');
  });

  it('nitrates : seuils du tableau de bord', () => {
    expect(kitAdvice('nitrates', value('nitrate', 10))).toBe('Rien à signaler.');
    expect(kitAdvice('nitrates', value('nitrate', 20))).toContain('à surveiller');
    expect(kitAdvice('nitrates', value('nitrate', 40))).toContain('trop haut');
  });

  it('pH et dureté : conseil fixe ; aucune valeur : rien à signaler', () => {
    expect(kitAdvice('ph', [])).toContain('régulateur de pH');
    expect(kitAdvice('durete', [])).toContain('robinet');
    expect(kitAdvice('ammoniaque', [])).toContain('Rien à signaler');
  });
});

describe('isWaterKit', () => {
  it('reconnaît les kits seulement', () => {
    expect(WATER_KITS.every(isWaterKit)).toBe(true);
    expect(isWaterKit('chlore')).toBe(false);
    expect(isWaterKit(null)).toBe(false);
  });
});
