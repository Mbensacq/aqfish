import { algaeGrowth, ALGAE_LIGHT_LIMIT_HOURS, DEFAULT_LIGHTING_HOURS } from './algae';
import { createDayLight, lightAt, lightAtInto } from './daylight';
import {
  DEFAULT_LAMP_ON_HOUR,
  LAMP_ADVISED_MAX_HOURS,
  LAMP_ADVISED_MIN_HOURS,
  LAMP_FADE_HOURS,
  LAMP_MAX_HOURS,
  LAMP_MIN_HOURS,
  isLampOnHour,
  lampAdvice,
  lampIntensityAt,
  lampOnOf,
  lampReadout,
  lampScheduleText,
  setLampOnInPlace,
  waterLampAt,
  withLampInto,
  type LampWater,
} from './lamp';
import { plantLightFactor } from './plant-growth';
import { freshWater, readWater } from './water';

describe('lampe du bac (#584)', () => {
  describe('lampIntensityAt', () => {
    it('éteinte avant l’allumage et après la durée, allumée entre les fondus', () => {
      expect(lampIntensityAt(9.99, 10, 8)).toBe(0);
      expect(lampIntensityAt(10, 10, 8)).toBe(0);
      expect(lampIntensityAt(10 + LAMP_FADE_HOURS, 10, 8)).toBe(1);
      expect(lampIntensityAt(12, 10, 8)).toBe(1);
      expect(lampIntensityAt(18 - LAMP_FADE_HOURS, 10, 8)).toBe(1);
      expect(lampIntensityAt(18, 10, 8)).toBe(0);
      expect(lampIntensityAt(0, 10, 8)).toBe(0);
    });

    it('fondu linéaire à l’allumage et à l’extinction', () => {
      expect(lampIntensityAt(10.25, 10, 8)).toBeCloseTo(0.5, 12);
      expect(lampIntensityAt(17.75, 10, 8)).toBeCloseTo(0.5, 12);
      expect(lampIntensityAt(10.1, 10, 8)).toBeLessThan(lampIntensityAt(10.2, 10, 8));
      expect(lampIntensityAt(17.8, 10, 8)).toBeGreaterThan(lampIntensityAt(17.9, 10, 8));
    });

    it('passage de minuit : allumée à 20 h pour 8 h, jusqu’à 4 h', () => {
      expect(lampIntensityAt(23, 20, 8)).toBe(1);
      expect(lampIntensityAt(0, 20, 8)).toBe(1);
      expect(lampIntensityAt(24, 20, 8)).toBe(1);
      expect(lampIntensityAt(3, 20, 8)).toBe(1);
      expect(lampIntensityAt(3.75, 20, 8)).toBeCloseTo(0.5, 12);
      expect(lampIntensityAt(4, 20, 8)).toBe(0);
      expect(lampIntensityAt(12, 20, 8)).toBe(0);
      expect(lampIntensityAt(-1, 20, 8)).toBe(1);
      // Allumage à 23 h : le fondu chevauche minuit.
      expect(lampIntensityAt(23.25, 23, 8)).toBeCloseTo(0.5, 12);
      expect(lampIntensityAt(0.5, 23, 8)).toBe(1);
    });

    it('sans fondu (« Réduire les mouvements ») : changement net', () => {
      expect(lampIntensityAt(10, 10, 8, 0)).toBe(1);
      expect(lampIntensityAt(10.01, 10, 8, 0)).toBe(1);
      expect(lampIntensityAt(17.99, 10, 8, 0)).toBe(1);
      expect(lampIntensityAt(18, 10, 8, 0)).toBe(0);
      expect(lampIntensityAt(9.99, 10, 8, 0)).toBe(0);
      for (const fade of [Number.NaN, -1, Number.NEGATIVE_INFINITY]) {
        expect(lampIntensityAt(10.25, 10, 8, fade)).toBe(1);
      }
    });

    it('durées extrêmes : nulle, négative, non finie, journée entière, très courte', () => {
      expect(lampIntensityAt(12, 10, 0)).toBe(0);
      expect(lampIntensityAt(12, 10, -3)).toBe(0);
      expect(lampIntensityAt(12, 10, Number.NaN)).toBe(0);
      expect(lampIntensityAt(3, 10, 24)).toBe(1);
      expect(lampIntensityAt(3, 10, Number.POSITIVE_INFINITY)).toBe(1);
      // Durée plus courte que deux fondus : le fondu est raccourci, l'intensité reste ≤ 1.
      expect(lampIntensityAt(10.25, 10, 0.5)).toBeCloseTo(1, 12);
      expect(lampIntensityAt(10.1, 10, 0.5)).toBeCloseTo(0.4, 12);
    });

    it('reste dans [0, 1] sur toute la journée, pour chaque durée du réglage', () => {
      for (let d = LAMP_MIN_HOURS; d <= LAMP_MAX_HOURS; d++) {
        for (let h = 0; h < 24; h += 0.05) {
          const i = lampIntensityAt(h, 21, d);
          expect(i).toBeGreaterThanOrEqual(0);
          expect(i).toBeLessThanOrEqual(1);
        }
      }
    });

    it('heure ou allumage non fini : RangeError', () => {
      expect(() => lampIntensityAt(Number.NaN, 10, 8)).toThrow(RangeError);
      expect(() => lampIntensityAt(12, Number.POSITIVE_INFINITY, 8)).toThrow(RangeError);
    });
  });

  describe('réglage de l’allumage', () => {
    it('heures entières de 0 à 23 ; défaut non écrit', () => {
      const water: LampWater = {};
      expect(lampOnOf(water)).toBe(DEFAULT_LAMP_ON_HOUR);
      expect(setLampOnInPlace(water, 20)).toBe(true);
      expect(water.lampOn).toBe(20);
      expect(lampOnOf(water)).toBe(20);
      expect(setLampOnInPlace(water, 0)).toBe(true);
      expect(water.lampOn).toBe(0);
      expect(setLampOnInPlace(water, DEFAULT_LAMP_ON_HOUR)).toBe(true);
      expect('lampOn' in water).toBe(false);
      for (const bad of [24, -1, 9.5, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(setLampOnInPlace(water, bad)).toBe(false);
        expect(isLampOnHour(bad)).toBe(false);
      }
      expect('lampOn' in water).toBe(false);
    });

    it('waterLampAt lit la durée et l’allumage de l’eau', () => {
      expect(waterLampAt({}, 12)).toBe(1);
      expect(waterLampAt({}, 0)).toBe(0);
      expect(waterLampAt({ lighting: 4, lampOn: 20 }, 23)).toBe(1);
      expect(waterLampAt({ lighting: 4, lampOn: 20 }, 0)).toBe(0);
      expect(waterLampAt({}, 10.25, 0)).toBe(1);
    });

    it('sauvegarde : lampOn relu, refusé hors des heures entières', () => {
      const ok = readWater({ ...freshWater('tropical'), lampOn: 21 }, 'tropical');
      expect(ok.ok && ok.water.lampOn).toBe(21);
      const absent = readWater({ ...freshWater('tropical') }, 'tropical');
      expect(absent.ok && 'lampOn' in absent.water).toBe(false);
      for (const bad of [24, -1, 7.5, '8']) {
        expect(readWater({ ...freshWater('tropical'), lampOn: bad }, 'tropical').ok).toBe(false);
      }
    });
  });

  describe('lumière', () => {
    it('lampe éteinte : lumière du jour exactement inchangée', () => {
      for (const hour of [0, 3, 6, 12, 19]) {
        const light = lightAtInto(hour, createDayLight());
        expect(withLampInto(light, 0)).toEqual(lightAt(hour));
        expect(withLampInto(lightAtInto(hour, createDayLight()), Number.NaN)).toEqual(
          lightAt(hour),
        );
      }
    });

    it('midi, lampe allumée : lumière exactement inchangée (captures par défaut)', () => {
      expect(withLampInto(lightAtInto(12, createDayLight()), 1)).toEqual(lightAt(12));
    });

    it('minuit, lampe allumée : intensité de la lampe, teintes blanches', () => {
      const night = withLampInto(lightAtInto(0, createDayLight()), 1);
      expect(night.intensity).toBe(1);
      expect(night.tint).toEqual([1, 1, 1]);
      expect(night.sky).toEqual([1, 1, 1]);
      const half = withLampInto(lightAtInto(0, createDayLight()), 0.5);
      expect(half.intensity).toBe(0.5);
      expect(half.tint[0]).toBeGreaterThan(lightAt(0).tint[0]);
      expect(half.tint[0]).toBeLessThanOrEqual(1);
    });

    it('n’assombrit jamais le jour', () => {
      for (const hour of [7, 9, 16, 17.5]) {
        expect(
          withLampInto(lightAtInto(hour, createDayLight()), 0.3).intensity,
        ).toBeGreaterThanOrEqual(lightAt(hour).intensity);
      }
    });
  });

  describe('tableau de bord', () => {
    it('avis : 8 à 10 h conseillées', () => {
      expect(lampAdvice(LAMP_ADVISED_MIN_HOURS - 1)).toBe('courte');
      expect(lampAdvice(LAMP_ADVISED_MIN_HOURS)).toBe('conseillee');
      expect(lampAdvice(LAMP_ADVISED_MAX_HOURS)).toBe('conseillee');
      expect(lampAdvice(LAMP_ADVISED_MAX_HOURS + 1)).toBe('longue');
      // Le seuil des algues est la borne haute conseillée.
      expect(LAMP_ADVISED_MAX_HOURS).toBe(ALGAE_LIGHT_LIMIT_HOURS);
    });

    it('relevé : durée, plage (passage de minuit) et mention d’approximation', () => {
      const r = lampReadout({});
      expect(r.hours).toBe(DEFAULT_LIGHTING_HOURS);
      expect(r.schedule).toBe('10:00 → 18:00');
      expect(r.advice).toBe('conseillee');
      expect(r.text).toContain('approximation de jeu');
      expect(r.text).toContain('8 à 10 h');
      expect(lampReadout({ lighting: 14, lampOn: 20 }).schedule).toBe('20:00 → 10:00');
      expect(lampReadout({ lighting: 14 }).advice).toBe('longue');
      expect(lampScheduleText(22, 4)).toBe('22:00 → 02:00');
    });
  });

  describe('algues et plantes selon la durée', () => {
    it('algues : aucune pousse sur la plage conseillée, pousse au-delà (eau propre)', () => {
      for (let h = LAMP_MIN_HOURS; h <= LAMP_ADVISED_MAX_HOURS; h++) {
        expect(algaeGrowth(h, 0)).toBe(0);
      }
      expect(algaeGrowth(LAMP_ADVISED_MAX_HOURS + 1, 0)).toBeGreaterThan(0);
      expect(algaeGrowth(LAMP_MAX_HOURS, 0)).toBeGreaterThan(algaeGrowth(12, 0));
    });

    it('plantes : pousse pleine dès 8 h, ralentie en dessous, nulle sans lumière', () => {
      expect(plantLightFactor(DEFAULT_LIGHTING_HOURS)).toBe(1);
      expect(plantLightFactor(LAMP_MAX_HOURS)).toBe(1);
      expect(plantLightFactor(LAMP_MIN_HOURS)).toBe(0.5);
      expect(plantLightFactor(6)).toBe(0.75);
      for (const bad of [0, -2, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(plantLightFactor(bad)).toBe(0);
      }
    });
  });
});
