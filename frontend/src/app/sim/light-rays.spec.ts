import { dayIntensityAt } from './daylight';
import {
  clampCloudiness,
  createLightRays,
  lightRaysAt,
  lightRaysInto,
  MAX_RAY_TILT,
  OVERCAST_RAY_RATIO,
  rayTiltAt,
} from './light-rays';

describe('rayons de lumière (#567)', () => {
  describe('force selon l’heure', () => {
    it('pleine à midi par temps clair', () => {
      expect(lightRaysAt(12).strength).toBe(1);
    });

    it('nulle la nuit (minuit, 2 h, 22 h)', () => {
      for (const hour of [0, 2, 22, 23.75]) {
        expect(lightRaysAt(hour).strength).toBe(0);
      }
    });

    it('partielle à l’aube et au crépuscule, croissante le matin', () => {
      const dawn = [5, 5.5, 6, 6.5, 7].map((h) => lightRaysAt(h).strength);
      for (const s of dawn) {
        expect(s).toBeGreaterThan(0);
        expect(s).toBeLessThan(1);
      }
      for (let i = 1; i < dawn.length; i++) {
        expect(dawn[i]).toBeGreaterThan(dawn[i - 1]);
      }
      // Symétrique autour de midi.
      expect(lightRaysAt(18).strength).toBeCloseTo(lightRaysAt(6).strength, 12);
    });

    it('suit exactement l’intensité du jour par temps clair', () => {
      for (let h = 0; h < 24; h += 0.25) {
        expect(lightRaysAt(h, 0).strength).toBe(dayIntensityAt(h));
      }
    });

    it('toujours dans [0, 1]', () => {
      for (let h = -48; h <= 48; h += 0.37) {
        for (const c of [0, 0.5, 1]) {
          const { strength } = lightRaysAt(h, c);
          expect(strength).toBeGreaterThanOrEqual(0);
          expect(strength).toBeLessThanOrEqual(1);
        }
      }
    });
  });

  describe('météo', () => {
    it('ciel couvert : force réduite à OVERCAST_RAY_RATIO', () => {
      expect(lightRaysAt(12, 1).strength).toBeCloseTo(OVERCAST_RAY_RATIO, 12);
      expect(lightRaysAt(12, 0.5).strength).toBeCloseTo((1 + OVERCAST_RAY_RATIO) / 2, 12);
    });

    it('la nuit reste noire sous la pluie', () => {
      expect(lightRaysAt(0, 1).strength).toBe(0);
    });

    it('couverture bornée ; non finie : ciel clair', () => {
      expect(clampCloudiness(-1)).toBe(0);
      expect(clampCloudiness(3)).toBe(1);
      expect(clampCloudiness(Number.NaN)).toBe(0);
      expect(clampCloudiness(Number.POSITIVE_INFINITY)).toBe(0);
      expect(lightRaysAt(12, 5).strength).toBeCloseTo(OVERCAST_RAY_RATIO, 12);
      expect(lightRaysAt(12, Number.NaN).strength).toBe(1);
    });

    it('l’inclinaison ne dépend pas de la météo', () => {
      expect(lightRaysAt(9, 1).tilt).toBe(lightRaysAt(9, 0).tilt);
    });
  });

  describe('inclinaison', () => {
    it('verticale à midi, extrême à 6 h et 18 h', () => {
      expect(rayTiltAt(12)).toBe(0);
      expect(rayTiltAt(6)).toBeCloseTo(-MAX_RAY_TILT, 12);
      expect(rayTiltAt(18)).toBeCloseTo(MAX_RAY_TILT, 12);
    });

    it('négative le matin, positive l’après-midi, bornée', () => {
      expect(rayTiltAt(9)).toBeLessThan(0);
      expect(rayTiltAt(15)).toBeGreaterThan(0);
      for (let h = 0; h < 24; h += 0.1) {
        expect(Math.abs(rayTiltAt(h))).toBeLessThanOrEqual(MAX_RAY_TILT);
      }
    });

    it('périodique de 24 h, sans −0', () => {
      expect(rayTiltAt(9 + 24)).toBeCloseTo(rayTiltAt(9), 12);
      expect(rayTiltAt(-15)).toBeCloseTo(rayTiltAt(9), 12);
      expect(Object.is(rayTiltAt(0), 0)).toBe(true);
      expect(Object.is(rayTiltAt(24), 0)).toBe(true);
    });

    it('continue : petit pas, petit écart', () => {
      for (let h = 0; h < 24; h += 0.05) {
        expect(Math.abs(rayTiltAt(h + 0.01) - rayTiltAt(h))).toBeLessThan(0.01);
      }
    });
  });

  describe('lightRaysInto', () => {
    it('même résultat que lightRaysAt, sans allocation', () => {
      const out = createLightRays();
      for (const [h, c] of [
        [5.5, 0],
        [13, 0.3],
        [21, 1],
      ]) {
        const ref = lightRaysAt(h, c);
        expect(lightRaysInto(h, c, out)).toBe(out);
        expect(out).toEqual(ref);
      }
    });

    it('heure non finie : erreur, tampon intact', () => {
      const out = createLightRays();
      out.strength = 0.42;
      expect(() => lightRaysInto(Number.NaN, 0, out)).toThrow(RangeError);
      expect(() => lightRaysAt(Number.POSITIVE_INFINITY)).toThrow(RangeError);
      expect(out.strength).toBe(0.42);
    });
  });
});
