import { describe, expect, it } from 'vitest';

import { SIM_DT } from './constants';
import { dashboardAlerts } from './dashboard-alerts';
import { healthSummary } from './health-summary';
import { parseWorld, serializeWorld } from './save';
import {
  changeWaterInPlace,
  freshWater,
  readWater,
  WATER_CHANGE_SHARE,
  type MutableWaterState,
} from './water';
import {
  AMMONIA_BINDER_CAPACITY,
  AMMONIA_BINDER_SECONDS,
  CHLORINE_HARMFUL,
  CHLORINE_TRACE,
  doseConditionerInPlace,
  MAX_CHLORINE,
  stepAmmoniaBinderInPlace,
  TAP_CHLORINE,
  toxicAmmonia,
} from './water-conditioner';
import { waterSample } from './water-dashboard';
import { phBands } from './water-ph';
import { waterQuality } from './water-quality';
import { advanceInPlace, createDefaultWorld, type MutableWorld } from './world';

const water = (): MutableWaterState => freshWater('tropical') as MutableWaterState;

describe('chlore (#530)', () => {
  it('par défaut, un changement d’eau n’apporte aucun chlore', () => {
    const w = water();
    changeWaterInPlace(w, 'tropical');
    expect(w.chlorine).toBeUndefined();
  });

  it('eau non traitée : le chlore monte et rend l’eau mauvaise', () => {
    const w = water();
    w.untreatedTap = true;
    changeWaterInPlace(w, 'tropical');
    expect(w.chlorine).toBeCloseTo(WATER_CHANGE_SHARE * TAP_CHLORINE);
    expect(waterQuality(w, 'tropical')).toBe('mauvaise');
  });

  it('le chlore use la santé des animaux, pas une eau sans chlore', () => {
    const run = (chlorine: number | undefined): number => {
      const world = createDefaultWorld(7, 'tropical') as MutableWorld;
      if (chlorine !== undefined) {
        (world.water as MutableWaterState).chlorine = chlorine;
      }
      advanceInPlace(world, Math.round(120 / SIM_DT));
      return world.entities.reduce((sum, e) => sum + e.health, 0);
    };
    expect(run(0.2)).toBeLessThan(run(undefined));
  }, 30_000);

  it('reste borné par des changements répétés, et une eau traitée le dilue jusqu’à l’effacer', () => {
    const w = water();
    w.untreatedTap = true;
    for (let i = 0; i < 200; i += 1) {
      changeWaterInPlace(w, 'tropical');
    }
    expect(w.chlorine).toBeLessThanOrEqual(MAX_CHLORINE);
    delete w.untreatedTap;
    for (let i = 0; i < 200 && w.chlorine !== undefined; i += 1) {
      changeWaterInPlace(w, 'tropical');
    }
    expect(w.chlorine).toBeUndefined();
    expect(CHLORINE_TRACE).toBeLessThan(CHLORINE_HARMFUL);
  });
});

describe('conditionneur (#530)', () => {
  it('ramène le chlore à 0', () => {
    const w = water();
    w.chlorine = 0.3;
    expect(doseConditionerInPlace(w, 'thiosulfate', 1).ok).toBe(true);
    expect(w.chlorine).toBeUndefined();
    expect(w.ammoniaBinder).toBeUndefined();
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('refuse la dose %s', (dose) => {
    const w = water();
    w.chlorine = 0.3;
    expect(doseConditionerInPlace(w, 'liant', dose)).toMatchObject({
      ok: false,
      reason: 'dose-invalide',
    });
    expect(w.chlorine).toBe(0.3);
  });

  it('le conditionneur simple est refusé sans chlore, sans rien changer', () => {
    const w = water();
    const before = { ...w };
    expect(doseConditionerInPlace(w, 'thiosulfate', 1)).toMatchObject({
      ok: false,
      reason: 'sans-chlore',
    });
    expect(w).toEqual(before);
  });

  it('double dose : la protection repart de sa durée entière, sans cumul', () => {
    const w = water();
    doseConditionerInPlace(w, 'liant', 1);
    stepAmmoniaBinderInPlace(w, 10);
    doseConditionerInPlace(w, 'liant', 2);
    expect(w.ammoniaBinder).toBe(AMMONIA_BINDER_SECONDS);
  });

  it('la protection s’éteint et la toxicité revient à la valeur mesurée', () => {
    const w = water();
    w.ammonia = 3;
    doseConditionerInPlace(w, 'liant', 1);
    expect(toxicAmmonia(w)).toBe(3 - AMMONIA_BINDER_CAPACITY);
    expect(w.ammonia).toBe(3);
    stepAmmoniaBinderInPlace(w, AMMONIA_BINDER_SECONDS);
    expect(w.ammoniaBinder).toBeUndefined();
    expect(toxicAmmonia(w)).toBe(3);
  });

  it('l’ammoniaque liée ne descend jamais sous 0', () => {
    const w = water();
    w.ammonia = 0.2;
    doseConditionerInPlace(w, 'liant', 1);
    expect(toxicAmmonia(w)).toBe(0);
  });

  it('bac vide : même effet sur l’eau, sans animaux', () => {
    const world = createDefaultWorld(3, 'tropical') as MutableWorld;
    world.entities = [];
    const w = world.water as MutableWaterState;
    w.chlorine = 0.15;
    expect(doseConditionerInPlace(w, 'thiosulfate', 1).ok).toBe(true);
    expect(world.water.chlorine).toBeUndefined();
  });
});

describe('alerte chlore (#530)', () => {
  const alerts = (chlorine: number | undefined) => {
    const w = water();
    if (chlorine !== undefined) {
      w.chlorine = chlorine;
    }
    return dashboardAlerts({
      sample: waterSample(w, 'tropical', 0),
      phBands: phBands([]),
      health: healthSummary([]),
    }).filter((a) => a.id === 'chlorine');
  };

  it('absente sans chlore', () => {
    expect(alerts(undefined)).toEqual([]);
  });

  it('critique dès la nocivité, avec cause et action', () => {
    const [alert] = alerts(CHLORINE_HARMFUL);
    expect(alert?.severity).toBe('critique');
    expect(alert?.cause).toContain('robinet');
    expect(alert?.action).toContain('conditionneur');
  });

  it('« attention » sous le seuil', () => {
    expect(alerts(CHLORINE_HARMFUL / 2)[0]?.severity).toBe('attention');
  });
});

describe('sauvegarde du chlore (#530)', () => {
  it('relit une eau sans chlore à l’identique', () => {
    const fresh = freshWater('tropical');
    const read = readWater(JSON.parse(JSON.stringify(fresh)), 'tropical');
    expect(read).toEqual({ ok: true, water: fresh });
  });

  it('relit chlore, option et protection dans une sauvegarde complète', () => {
    const world = createDefaultWorld(5, 'tropical') as MutableWorld;
    const w = world.water as MutableWaterState;
    w.chlorine = 0.15;
    w.untreatedTap = true;
    w.ammoniaBinder = 100;
    const parsed = parseWorld(serializeWorld(world));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.world.water).toMatchObject({
        chlorine: 0.15,
        untreatedTap: true,
        ammoniaBinder: 100,
      });
    }
  });

  it.each([
    ['chlorine', MAX_CHLORINE + 1],
    ['untreatedTap', false],
    ['ammoniaBinder', AMMONIA_BINDER_SECONDS + 1],
  ])('refuse %s invalide', (key, value) => {
    const saved = { ...freshWater('tropical'), [key]: value };
    expect(readWater(saved, 'tropical').ok).toBe(false);
  });
});
