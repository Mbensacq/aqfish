import { createDayLight, DEFAULT_DAY_LENGTH_SECONDS, lightAtInto } from './daylight';
import {
  gameDayAt,
  LUNAR_CYCLE_DAYS,
  LUNAR_PHASE_AT_START,
  lunarPhase,
  moonGlow,
  moonIllumination,
  moonShadeAt,
  NEW_MOON_GLOW,
  REDUCED_MOON_AMPLITUDE,
  withMoonInto,
} from './moon';

/** Jour de jeu de la nouvelle lune qui suit le départ (pleine lune au jour 0). */
const FIRST_NEW_MOON_DAY = LUNAR_CYCLE_DAYS / 2;

describe('cycle lunaire (#856)', () => {
  describe('gameDayAt', () => {
    it('compte les journées simulées depuis le temps 0', () => {
      expect(gameDayAt(0, DEFAULT_DAY_LENGTH_SECONDS)).toBe(0);
      expect(gameDayAt(DEFAULT_DAY_LENGTH_SECONDS, DEFAULT_DAY_LENGTH_SECONDS)).toBe(1);
      expect(gameDayAt(1800, 1200)).toBe(1.5);
    });

    it('refuse un temps négatif ou non fini et une durée du jour nulle', () => {
      expect(() => gameDayAt(-1, 1200)).toThrow(RangeError);
      expect(() => gameDayAt(Number.NaN, 1200)).toThrow(RangeError);
      expect(() => gameDayAt(10, 0)).toThrow(RangeError);
      expect(() => gameDayAt(10, Number.POSITIVE_INFINITY)).toThrow(RangeError);
    });
  });

  describe('lunarPhase', () => {
    it('commence à la pleine lune', () => {
      expect(LUNAR_PHASE_AT_START).toBe(0.5);
      expect(lunarPhase(0)).toBe(0.5);
      expect(moonIllumination(lunarPhase(0))).toBe(1);
    });

    it('atteint la nouvelle lune un demi-cycle plus tard, puis revient à la pleine lune', () => {
      expect(lunarPhase(FIRST_NEW_MOON_DAY)).toBe(0);
      expect(moonIllumination(lunarPhase(FIRST_NEW_MOON_DAY))).toBe(0);
      expect(lunarPhase(LUNAR_CYCLE_DAYS)).toBeCloseTo(0.5, 12);
      expect(lunarPhase(3 * LUNAR_CYCLE_DAYS)).toBeCloseTo(0.5, 12);
    });

    it('reste dans [0, 1) et varie continûment (aucun saut d’un pas de jeu à l’autre)', () => {
      // Un pas fixe de simulation vaut 1/72 000 de journée (journée de 20 min, pas de 1/60 s).
      const step = 1 / 72_000;
      for (let day = 0; day < 2 * LUNAR_CYCLE_DAYS; day += 0.37) {
        const phase = lunarPhase(day);
        expect(phase).toBeGreaterThanOrEqual(0);
        expect(phase).toBeLessThan(1);
        const jump = moonIllumination(lunarPhase(day + step)) - moonIllumination(phase);
        expect(Math.abs(jump)).toBeLessThan(1e-4);
      }
    });

    it('est une fonction pure du jour de jeu', () => {
      expect(lunarPhase(123.456)).toBe(lunarPhase(123.456));
    });

    it('refuse un jour négatif ou non fini', () => {
      expect(() => lunarPhase(-0.5)).toThrow(RangeError);
      expect(() => lunarPhase(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    });
  });

  describe('moonIllumination', () => {
    it('vaut 0 à la nouvelle lune, 1/2 aux quartiers, 1 à la pleine lune', () => {
      expect(moonIllumination(0)).toBe(0);
      expect(moonIllumination(0.25)).toBeCloseTo(0.5, 12);
      expect(moonIllumination(0.5)).toBe(1);
      expect(moonIllumination(0.75)).toBeCloseTo(0.5, 12);
    });

    it('ramène toute phase finie dans [0, 1)', () => {
      expect(moonIllumination(1)).toBe(0);
      expect(moonIllumination(-0.5)).toBe(1);
      expect(moonIllumination(2.5)).toBe(1);
      expect(() => moonIllumination(Number.NaN)).toThrow(RangeError);
    });
  });

  describe('moonGlow', () => {
    it('vaut 1 à la pleine lune et NEW_MOON_GLOW à la nouvelle lune', () => {
      expect(moonGlow(0.5, 1)).toBe(1);
      expect(moonGlow(0, 1)).toBe(NEW_MOON_GLOW);
    });

    it('reste à 1 sans variation (option « lune » coupée), quelle que soit la phase', () => {
      for (const phase of [0, 0.1, 0.25, 0.5, 0.9]) {
        expect(moonGlow(phase, 0)).toBe(1);
      }
      expect(moonGlow(0, Number.NaN)).toBe(1);
      expect(moonGlow(0, -3)).toBe(1);
    });

    it('réduit la variation au minimum avec « Réduire les mouvements »', () => {
      const reduced = moonGlow(0, REDUCED_MOON_AMPLITUDE);
      expect(reduced).toBeLessThan(1);
      expect(reduced).toBeGreaterThan(moonGlow(0, 1));
      expect(1 - reduced).toBeCloseTo((1 - NEW_MOON_GLOW) * REDUCED_MOON_AMPLITUDE, 2);
    });

    it('borne l’amplitude à 1', () => {
      expect(moonGlow(0, 5)).toBe(NEW_MOON_GLOW);
    });

    it('arrondit au centième : près de la pleine lune, exactement 1', () => {
      expect(moonGlow(lunarPhase(1), 1)).toBe(1);
      const glow = moonGlow(0.3, 1);
      expect(Math.round(glow * 100) / 100).toBe(glow);
    });
  });

  describe('moonShadeAt et withMoonInto', () => {
    it('vaut exactement 1 en plein jour, quelle que soit la lune', () => {
      for (const glow of [NEW_MOON_GLOW, 0.9, 1]) {
        expect(moonShadeAt(glow, 1)).toBe(1);
      }
      expect(moonShadeAt(NEW_MOON_GLOW, Number.NaN)).toBe(1);
    });

    it('vaut la clarté de nuit en pleine nuit et fond entre les deux', () => {
      expect(moonShadeAt(NEW_MOON_GLOW, 0)).toBe(NEW_MOON_GLOW);
      const dusk = moonShadeAt(NEW_MOON_GLOW, 0.5);
      expect(dusk).toBeGreaterThan(NEW_MOON_GLOW);
      expect(dusk).toBeLessThan(1);
    });

    it('ignore une clarté hors de ]0, 1]', () => {
      expect(moonShadeAt(0, 0)).toBe(1);
      expect(moonShadeAt(1.5, 0)).toBe(1);
      expect(moonShadeAt(Number.NaN, 0)).toBe(1);
    });

    it('laisse la lumière de midi intacte et assombrit celle de minuit', () => {
      const noon = withMoonInto(lightAtInto(12, createDayLight()), NEW_MOON_GLOW);
      expect(noon.moon).toBe(1);
      const midnight = withMoonInto(lightAtInto(0, createDayLight()), NEW_MOON_GLOW);
      expect(midnight.moon).toBe(NEW_MOON_GLOW);
      expect(midnight.intensity).toBe(0);
    });

    it('une lampe allumée (intensité relevée) efface la lune', () => {
      const light = lightAtInto(0, createDayLight());
      light.intensity = 1;
      expect(withMoonInto(light, NEW_MOON_GLOW).moon).toBe(1);
    });
  });
});
