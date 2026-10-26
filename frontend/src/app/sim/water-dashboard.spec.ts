import { freshWater, MAX_HEATER_TEMPERATURE, MIN_HEATER_TEMPERATURE } from './water';
import {
  compoundLevel,
  DASHBOARD_GAUGES,
  dashboardGauges,
  DEFAULT_DASHBOARD_GAUGES,
  DEFAULT_WATER_SAMPLE,
  EMPTY_TREND_STATE,
  formatTenth,
  gaugeTrends,
  nextTrendState,
  phFill,
  STABLE_TRENDS,
  temperatureFill,
  temperatureLevel,
  TREND_THRESHOLDS,
  TREND_WINDOW_TICKS,
  trendOf,
  waterSample,
  type TrendState,
  type WaterSample,
} from './water-dashboard';
import { MAX_PH, MIN_PH, phBands, phZone } from './water-ph';
import { COMPOUND_THRESHOLDS, DEFAULT_WATER_READOUT, waterReadout } from './water-quality';

/** Relevé du bac tropical au pas `tick`, valeurs modifiées par `patch`. */
function sample(tick: number, patch: Partial<WaterSample> = {}): WaterSample {
  return { ...waterSample(freshWater('tropical'), 'tropical', tick), ...patch };
}

describe('tableau de bord de l’eau (#256)', () => {
  describe('trendOf', () => {
    it('hausse, baisse et stable, seuil compris', () => {
      expect(trendOf(10, 10.2, 0.2)).toBe('hausse');
      expect(trendOf(10, 9.8, 0.2)).toBe('baisse');
      expect(trendOf(10, 10.19, 0.2)).toBe('stable');
      expect(trendOf(10, 9.81, 0.2)).toBe('stable');
      expect(trendOf(10, 10, 0.2)).toBe('stable');
    });

    it('seuil atteint malgré l’arrondi des flottants (0,3 − 0,25)', () => {
      expect(0.3 - 0.25).toBeLessThan(0.05);
      expect(trendOf(0.25, 0.3, 0.05)).toBe('hausse');
      expect(trendOf(0.3, 0.25, 0.05)).toBe('baisse');
    });

    it('valeurs non finies ou seuil invalide : stable', () => {
      for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
        expect(trendOf(bad, 5, 0.1)).toBe('stable');
        expect(trendOf(5, bad, 0.1)).toBe('stable');
        expect(trendOf(0, 5, bad)).toBe('stable');
      }
      expect(trendOf(0, 5, 0)).toBe('stable');
      expect(trendOf(0, 5, -1)).toBe('stable');
    });
  });

  describe('mémoire de la tendance', () => {
    it('premier relevé : référence posée, tout stable', () => {
      const first = sample(0);
      const state = nextTrendState(EMPTY_TREND_STATE, first);
      expect(state).toEqual({ base: null, checkpoint: first });
      expect(gaugeTrends(state, first)).toEqual(STABLE_TRENDS);
      expect(gaugeTrends(EMPTY_TREND_STATE, first)).toEqual(STABLE_TRENDS);
    });

    it('avant une fenêtre : comparaison au premier relevé ; à la fenêtre, base décalée', () => {
      let state: TrendState = nextTrendState(EMPTY_TREND_STATE, sample(0, { nitrate: 10 }));
      const early = sample(600, { nitrate: 10.5, ph: 6.9 });
      state = nextTrendState(state, early);
      expect(state.base).toBeNull();
      expect(gaugeTrends(state, early)).toMatchObject({
        nitrate: 'hausse',
        ph: 'baisse',
        temperature: 'stable',
        ammonia: 'stable',
        nitrite: 'stable',
      });
      // Une fenêtre pile : le relevé de départ devient la base.
      const later = sample(TREND_WINDOW_TICKS, { nitrate: 11 });
      state = nextTrendState(state, later);
      expect(state.base?.tick).toBe(0);
      expect(state.checkpoint?.tick).toBe(TREND_WINDOW_TICKS);
      // Deux fenêtres : la base suit.
      const next = sample(2 * TREND_WINDOW_TICKS, { nitrate: 11 });
      state = nextTrendState(state, next);
      expect(state.base?.tick).toBe(TREND_WINDOW_TICKS);
      expect(gaugeTrends(state, next).nitrate).toBe('stable');
    });

    it('les valeurs cessent de bouger : la tendance redevient stable après une fenêtre', () => {
      let state: TrendState = EMPTY_TREND_STATE;
      let last = sample(0);
      // Température qui monte 3 minutes, puis se stabilise 3 minutes (relevés toutes les 0,5 s).
      for (let tick = 0; tick <= 6 * TREND_WINDOW_TICKS; tick += 30) {
        const temperature = 25 + Math.min(tick, 3 * TREND_WINDOW_TICKS) / TREND_WINDOW_TICKS;
        last = sample(tick, { temperature });
        state = nextTrendState(state, last);
        if (tick === 3 * TREND_WINDOW_TICKS) {
          expect(gaugeTrends(state, last).temperature).toBe('hausse');
        }
      }
      expect(gaugeTrends(state, last).temperature).toBe('stable');
    });

    it('monde changé : environnement, pas qui recule, saut de plus de deux fenêtres', () => {
      const start = nextTrendState(
        nextTrendState(EMPTY_TREND_STATE, sample(0)),
        sample(TREND_WINDOW_TICKS),
      );
      expect(start.base).not.toBeNull();
      const reef = { ...sample(TREND_WINDOW_TICKS + 30), environment: 'recif' as const };
      expect(nextTrendState(start, reef)).toEqual({ base: null, checkpoint: reef });
      const back = sample(10);
      expect(nextTrendState(start, back)).toEqual({ base: null, checkpoint: back });
      const jump = sample(3 * TREND_WINDOW_TICKS + 1);
      expect(nextTrendState(start, jump)).toEqual({ base: null, checkpoint: jump });
      const bad = sample(Number.NaN);
      expect(nextTrendState(start, bad)).toEqual({ base: null, checkpoint: bad });
      // Exactement deux fenêtres : même monde, la base avance.
      const edge = sample(3 * TREND_WINDOW_TICKS);
      expect(nextTrendState(start, edge).base?.tick).toBe(TREND_WINDOW_TICKS);
    });

    it('bac tropical par défaut : nitrates en hausse et pH en baisse dans les seuils', () => {
      // Pentes d'ADR 0053 et 0057 : +25 nitrates et −0,25 de pH par heure simulée.
      const perWindow = TREND_WINDOW_TICKS / 60 / 3600;
      expect(25 * perWindow).toBeGreaterThanOrEqual(TREND_THRESHOLDS.nitrate);
      expect(0.25 * perWindow).toBeGreaterThanOrEqual(TREND_THRESHOLDS.ph);
    });
  });

  describe('niveaux et remplissages', () => {
    it('température : écart à celle de l’environnement, dans les deux sens, bornes comprises', () => {
      expect(temperatureLevel(25, 'tropical')).toBe('vert');
      expect(temperatureLevel(27.9, 'tropical')).toBe('vert');
      expect(temperatureLevel(28, 'tropical')).toBe('orange');
      expect(temperatureLevel(22, 'tropical')).toBe('orange');
      expect(temperatureLevel(31, 'tropical')).toBe('rouge');
      expect(temperatureLevel(19, 'tropical')).toBe('rouge');
      // Eau de mer : 26 °C au récif.
      expect(temperatureLevel(26, 'recif')).toBe('vert');
      expect(temperatureLevel(Number.NaN, 'recif')).toBe('rouge');
      expect(temperatureLevel(Number.POSITIVE_INFINITY, 'bassin')).toBe('rouge');
    });

    it('composés : seuils de qualité, bornes comprises, non fini rouge', () => {
      for (const compound of ['ammonia', 'nitrite', 'nitrate'] as const) {
        const { watch, bad } = COMPOUND_THRESHOLDS[compound];
        expect(compoundLevel(compound, 0)).toBe('vert');
        expect(compoundLevel(compound, watch - 0.01)).toBe('vert');
        expect(compoundLevel(compound, watch)).toBe('orange');
        expect(compoundLevel(compound, bad)).toBe('rouge');
        expect(compoundLevel(compound, Number.NaN)).toBe('rouge');
        expect(compoundLevel(compound, Number.NEGATIVE_INFINITY)).toBe('rouge');
      }
    });

    it('remplissages bornés à [0, 1], non fini : 0', () => {
      expect(temperatureFill(MIN_HEATER_TEMPERATURE)).toBe(0);
      expect(temperatureFill(MAX_HEATER_TEMPERATURE)).toBe(1);
      expect(temperatureFill(24)).toBe(0.5);
      expect(temperatureFill(-40)).toBe(0);
      expect(temperatureFill(90)).toBe(1);
      expect(phFill(MIN_PH)).toBe(0);
      expect(phFill(MAX_PH)).toBe(1);
      expect(phFill(6.75)).toBe(0.5);
      for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
        expect(temperatureFill(bad)).toBe(0);
        expect(phFill(bad)).toBe(0);
      }
    });

    it('formatTenth : un chiffre après la virgule ; non fini : tiret ; pas de « −0,0 »', () => {
      expect(formatTenth(25)).toBe('25,0');
      expect(formatTenth(0.84)).toBe('0,8');
      expect(formatTenth(0)).toBe('0,0');
      expect(formatTenth(-0.04)).toBe('0,0');
      expect(formatTenth(Number.NaN)).toBe('–');
      expect(formatTenth(Number.POSITIVE_INFINITY)).toBe('–');
    });
  });

  describe('dashboardGauges', () => {
    it('eau neuve du bac tropical : cinq jauges vertes, stables, nommées et lues', () => {
      expect(DEFAULT_DASHBOARD_GAUGES.map((g) => g.id)).toEqual(DASHBOARD_GAUGES);
      expect(DEFAULT_DASHBOARD_GAUGES.map((g) => g.level)).toEqual([
        'vert',
        'vert',
        'vert',
        'vert',
        'vert',
      ]);
      const [temperature, , , nitrate, ph] = DEFAULT_DASHBOARD_GAUGES;
      expect(temperature).toMatchObject({ label: 'Temp.', value: '25,0', unit: '°C' });
      expect(temperature?.spoken).toBe('Température : 25,0 degrés, bon, stable');
      expect(nitrate).toMatchObject({ label: 'NO₃⁻', value: '0,0', unit: 'u.', fill: 0 });
      expect(ph).toMatchObject({ value: '7,0', unit: '', levelLabel: 'Idéal' });
      expect(ph?.spoken).toBe('pH : 7,0, idéal, stable');
    });

    it('eau polluée : niveaux sur les valeurs exactes, tendances reprises', () => {
      const polluted = sample(100, { ammonia: 2, nitrite: 4.99, nitrate: 42.46, ph: 6 });
      const readout = waterReadout(freshWater('tropical'), 'tropical', ['guppy']);
      const gauges = dashboardGauges(
        polluted,
        { phZone: phZone(polluted.ph, readout.phBands) },
        { ...STABLE_TRENDS, nitrate: 'hausse', ph: 'baisse' },
      );
      const byId = Object.fromEntries(gauges.map((g) => [g.id, g]));
      expect(byId['ammonia']?.level).toBe('orange');
      expect(byId['nitrite']?.level).toBe('orange');
      // 4,99 s'affiche 5,0 mais reste sous le seuil « mauvaise ».
      expect(byId['nitrite']?.value).toBe('5,0');
      expect(byId['nitrate']).toMatchObject({
        level: 'rouge',
        levelLabel: 'Critique',
        value: '42,5',
      });
      expect(byId['nitrate']?.spoken).toBe(
        'Nitrates (NO₃⁻) : 42,5 unités de jeu, critique, en hausse',
      );
      expect(byId['ph']).toMatchObject({
        level: 'rouge',
        levelLabel: 'Hors plage',
        trend: 'baisse',
      });
    });

    it('bac sans animal : pH idéal sur toute l’échelle', () => {
      const bands = phBands([]);
      for (const ph of [MIN_PH, 6, 9, MAX_PH]) {
        const gauges = dashboardGauges(sample(0, { ph }), { phZone: phZone(ph, bands) });
        expect(gauges.at(-1)?.level).toBe('vert');
      }
    });

    it('eau de mer : température du récif, pH du récif idéal pour ses espèces', () => {
      const reef = waterSample(freshWater('recif'), 'recif', 0);
      const readout = waterReadout(freshWater('recif'), 'recif', ['clown', 'chirurgien']);
      const gauges = dashboardGauges(reef, readout);
      expect(gauges.map((g) => g.level)).toEqual(['vert', 'vert', 'vert', 'vert', 'vert']);
      expect(gauges[0]?.value).toBe('26,0');
      expect(gauges.at(-1)?.value).toBe('8,2');
    });

    it('valeurs non finies : tiret, rouge, jauge vide, jamais rassurant', () => {
      const broken = sample(0, {
        temperature: Number.NaN,
        ammonia: Number.POSITIVE_INFINITY,
        nitrite: Number.NEGATIVE_INFINITY,
        nitrate: Number.NaN,
        ph: Number.NaN,
      });
      const gauges = dashboardGauges(broken, { phZone: phZone(Number.NaN, phBands(['neon'])) });
      for (const gauge of gauges) {
        expect(gauge.value).toBe('–');
        expect(gauge.level).toBe('rouge');
        expect(gauge.fill).toBe(0);
        expect(gauge.trend).toBe('stable');
      }
    });

    it('relevé par défaut cohérent avec le relevé arrondi de l’interface', () => {
      expect(DEFAULT_WATER_SAMPLE.environment).toBe('tropical');
      expect(DEFAULT_WATER_SAMPLE.tick).toBe(0);
      expect(formatTenth(DEFAULT_WATER_SAMPLE.temperature)).toBe(
        formatTenth(DEFAULT_WATER_READOUT.temperature),
      );
      expect(DEFAULT_WATER_SAMPLE.ph).toBe(DEFAULT_WATER_READOUT.ph);
    });
  });
});
