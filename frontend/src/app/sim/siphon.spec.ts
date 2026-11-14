import { describe, expect, it } from 'vitest';

import type { ScraperRay } from './algae';
import {
  careSessionSummary,
  careStepTask,
  completeCareStep,
  readCareSession,
  serializeCareSession,
  skipCareStep,
  startCareSession,
  withPoured,
  withSiphoned,
} from './care-session';
import type { FoodPellet } from './food';
import {
  initialMaintenance,
  maintenanceDone,
  maintenanceReadout,
  MAINTENANCE_DAY_SECONDS,
  readMaintenance,
} from './maintenance';
import {
  BUCKET_SHARE,
  freshWaterStepHint,
  freshWaterWarnings,
  freshWaterWarningTexts,
  MAX_SIPHON_SHARE,
  pouredShare,
  sharePercent,
  SIPHON_REACH,
  SIPHON_SHARE_PER_POINT,
  siphonedFood,
  siphonedShare,
  siphonFloorPoint,
  siphonStepHint,
  siphonWarning,
  TEMPERATURE_GAP_WARNING,
} from './siphon';
import type { Box3 } from './tank';
import { TAP_CHLORINE } from './water-conditioner';
import { changeWaterInPlace, copyWater, freshWater, WATER_CHANGE_SHARE } from './water';
import {
  createDefaultWorld,
  refillWorldWaterInPlace,
  siphonWorldInPlace,
  type MutableWorld,
} from './world';

const WATER: Box3 = { minX: -0.4, maxX: 0.4, minY: 0, maxY: 0.4, minZ: -0.2, maxZ: 0.2 };

/** Granulé posé au sol en (x, z) (âge au-delà de sa chute). */
const landed = (id: number, x: number, z: number): FoodPellet => ({
  id,
  x,
  y: 0.002,
  z,
  vy: 0,
  age: 20,
  floatY: 0.398,
  floatTime: 2,
  restY: 0.002,
});

/** Granulé qui flotte encore en (x, z). */
const floating = (id: number, x: number, z: number): FoodPellet => ({
  ...landed(id, x, z),
  y: 0.398,
  age: 0.5,
});

describe('point du sol visé par le tuyau (#605)', () => {
  it('vue de dessus : là où le rayon coupe le fond', () => {
    const ray: ScraperRay = { origin: [0.1, 2, -0.05], direction: [0, -1, 0] };
    expect(siphonFloorPoint(ray, WATER)).toEqual({ x: 0.1, z: -0.05 });
  });

  it('vue de côté : aplomb du point d’entrée dans l’eau', () => {
    const ray: ScraperRay = { origin: [0.1, 0.2, 2], direction: [0, 0, -1] };
    const point = siphonFloorPoint(ray, WATER)!;
    expect(point.x).toBe(0.1);
    expect(point.z).toBeCloseTo(0.2, 10);
  });

  it('rayon qui manque le bac, ou non fini : aucun point', () => {
    expect(siphonFloorPoint({ origin: [2, 0.2, 2], direction: [0, 0, -1] }, WATER)).toBeNull();
    expect(siphonFloorPoint({ origin: [0, 2, 0], direction: [0, 1, 0] }, WATER)).toBeNull();
    expect(
      siphonFloorPoint({ origin: [Number.NaN, 2, 0], direction: [0, -1, 0] }, WATER),
    ).toBeNull();
  });
});

describe('volume siphonné et jauge (#605)', () => {
  it('zéro point : rien retiré, jauge à 0 %', () => {
    expect(siphonedShare(0, 0, 60)).toBe(0);
    expect(sharePercent(siphonedShare(0, 0, 60))).toBe(0);
    expect(siphonStepHint(0)).toContain('Promenez le tuyau');
  });

  it('chaque point retire une part fixe ; jauge en pourcentage entier', () => {
    const share = siphonedShare(0, 100, 60);
    expect(share).toBeCloseTo(100 * SIPHON_SHARE_PER_POINT, 10);
    expect(sharePercent(share)).toBe(Math.round(100 * SIPHON_SHARE_PER_POINT * 100));
    expect(siphonedShare(share, 50, 60)).toBeCloseTo(150 * SIPHON_SHARE_PER_POINT, 10);
  });

  it('plafond : jamais plus que MAX_SIPHON_SHARE', () => {
    expect(siphonedShare(0, 1e9, 60)).toBe(MAX_SIPHON_SHARE);
    expect(siphonedShare(MAX_SIPHON_SHARE, 10, 60)).toBe(MAX_SIPHON_SHARE);
    expect(siphonedShare(5, 0, 60)).toBe(MAX_SIPHON_SHARE);
  });

  it('bac vide (sans eau) : rien retiré', () => {
    for (const liters of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(siphonedShare(0.2, 100, liters)).toBe(0);
    }
  });

  it('entrées invalides : ni NaN ni recul', () => {
    expect(siphonedShare(Number.NaN, 10, 60)).toBeCloseTo(10 * SIPHON_SHARE_PER_POINT, 10);
    expect(siphonedShare(0.1, -5, 60)).toBe(0.1);
    expect(sharePercent(Number.NaN)).toBe(0);
    expect(sharePercent(2)).toBe(100);
  });

  it('avertissement au-delà de 50 % (UF/IFAS, docs/SOINS.md § 14)', () => {
    expect(siphonWarning(0.5)).toBe(false);
    expect(siphonWarning(0.51)).toBe(true);
    expect(siphonStepHint(0.3)).toBe('30 % de l’eau retirée (25 à 50 % conseillés).');
    expect(siphonStepHint(0.6)).toContain('c’est trop');
  });
});

describe('nourriture et dépôts retirés par zone du sol (#605)', () => {
  const food = [landed(0, 0, 0), landed(1, 0.3, 0.1), floating(2, 0, 0), landed(3, 0.02, 0)];

  it('seuls les granulés posés sous le tuyau partent', () => {
    expect(siphonedFood(food, [{ x: 0, z: 0 }])).toEqual([0, 3]);
    expect(siphonedFood(food, [{ x: 0.3, z: 0.1 + SIPHON_REACH * 0.9 }])).toEqual([1]);
    expect(siphonedFood(food, [{ x: 0.3, z: 0.1 + SIPHON_REACH * 1.1 }])).toEqual([]);
    expect(siphonedFood(food, [])).toEqual([]);
    expect(siphonedFood([], [{ x: 0, z: 0 }])).toEqual([]);
  });

  it('dans le monde : granulés retirés, poissons et eau inchangés', () => {
    const world = createDefaultWorld(42) as MutableWorld;
    world.food = [landed(0, 0, 0), landed(1, 0.25, 0.1), floating(2, 0, 0)];
    const before = JSON.stringify({ entities: world.entities, water: world.water });
    const down = (x: number, z: number): ScraperRay => ({
      origin: [x, 3, z],
      direction: [0, -1, 0],
    });
    const pass = siphonWorldInPlace(world, [down(0, 0), down(0.01, 0), down(9, 9)]);
    expect(pass).toEqual({ points: 2, food: 1 });
    expect(world.food.map((p) => p.id)).toEqual([1, 2]);
    expect(JSON.stringify({ entities: world.entities, water: world.water })).toBe(before);
    expect(siphonWorldInPlace(world, [])).toEqual({ points: 0, food: 0 });
  });
});

describe('eau neuve (#605)', () => {
  it('seaux versés jusqu’à l’eau retirée, pas au-delà', () => {
    expect(pouredShare(0, 0.25)).toBeCloseTo(BUCKET_SHARE, 10);
    expect(pouredShare(0.2, 0.25)).toBe(0.25);
    expect(pouredShare(0.25, 0.25)).toBe(0.25);
    expect(pouredShare(0, 0)).toBe(0);
    expect(pouredShare(Number.NaN, Number.NaN)).toBe(0);
    expect(freshWaterStepHint(0, 0)).toContain('rien à remplacer');
    expect(freshWaterStepHint(0.1, 0.3)).toBe('Versez l’eau neuve au seau : 10 % sur 30 %.');
    expect(freshWaterStepHint(0.3, 0.3)).toContain('plein');
  });

  it('sans conditionneur : chlore ajouté ; avec : aucun', () => {
    const world = createDefaultWorld(42) as MutableWorld;
    const treated = createDefaultWorld(42) as MutableWorld;
    refillWorldWaterInPlace(world, 0.4, false, world.water.temperature);
    refillWorldWaterInPlace(treated, 0.4, true, treated.water.temperature);
    expect(world.water.chlorine).toBeCloseTo(0.4 * TAP_CHLORINE, 10);
    expect(treated.water.chlorine).toBeUndefined();
    expect(freshWaterWarningTexts(freshWaterWarnings(false, 24, 24))).toEqual([
      'Sans conditionneur, le chlore du robinet passe dans le bac.',
    ]);
    expect(freshWaterWarningTexts(freshWaterWarnings(true, 24, 24))).toEqual([]);
  });

  it('la part versée dilue les nitrates d’autant', () => {
    const world = createDefaultWorld(42) as MutableWorld;
    world.water = { ...world.water, nitrate: 40 };
    refillWorldWaterInPlace(world, 0.25, true, world.water.temperature);
    expect(world.water.nitrate).toBeCloseTo(30, 10);
  });

  it('écart de température signalé, et l’eau du bac se mélange', () => {
    expect(freshWaterWarnings(true, 18, 24).temperatureGap).toBe(-6);
    expect(freshWaterWarnings(true, 24 + TEMPERATURE_GAP_WARNING, 24).temperatureGap).toBe(0);
    expect(freshWaterWarnings(true, 30.04, 24).temperatureGap).toBe(6);
    expect(freshWaterWarnings(true, Number.NaN, 24).temperatureGap).toBe(0);
    expect(freshWaterWarningTexts(freshWaterWarnings(true, 18, 24))).toEqual([
      'Eau plus froide que le bac de 6 °C : un choc pour les poissons.',
    ]);
    expect(freshWaterWarningTexts(freshWaterWarnings(true, 26.5, 24))[0]).toContain(
      'plus chaude que le bac de 2,5 °C',
    );
    const world = createDefaultWorld(42) as MutableWorld;
    const t = world.water.temperature;
    refillWorldWaterInPlace(world, 0.5, true, t - 6);
    expect(world.water.temperature).toBeCloseTo(t - 3, 10);
  });

  it('changement d’eau du bouton inchangé : part et température d’avant', () => {
    const water = { ...freshWater('tropical'), nitrate: 50, temperature: 22 };
    const a = changeWaterInPlace(copyWater(water), 'tropical');
    const b = changeWaterInPlace(copyWater(water), 'tropical', WATER_CHANGE_SHARE, null);
    expect(a).toEqual(b);
    expect(a.nitrate).toBeCloseTo(50 * (1 - WATER_CHANGE_SHARE), 10);
    expect(a.temperature).toBe(22);
    expect(changeWaterInPlace(copyWater(water), 'tropical', Number.NaN).nitrate).toBe(50);
    expect(changeWaterInPlace(copyWater(water), 'tropical', 2).nitrate).toBe(0);
  });
});

describe('séance : siphon et eau neuve au calendrier (#605)', () => {
  it('chaque étape faite enregistre sa tâche', () => {
    expect(careStepTask('vitres')).toBe('glass');
    expect(careStepTask('siphon')).toBe('siphon');
    expect(careStepTask('eau')).toBe('waterChange');
    expect(careStepTask('filtre')).toBeNull();
    expect(careStepTask('bilan')).toBeNull();
  });

  it('le siphon entre au calendrier après une première séance seulement', () => {
    const fresh = initialMaintenance(0);
    expect(maintenanceReadout(fresh, 0).items.map((i) => i.task)).not.toContain('siphon');
    const done = maintenanceDone(fresh, 'siphon', MAINTENANCE_DAY_SECONDS);
    const readout = maintenanceReadout(done, MAINTENANCE_DAY_SECONDS);
    expect(readout.items.at(-1)).toMatchObject({ task: 'siphon', text: 'Dans 7 j' });
    expect(readout.log[0]).toMatchObject({ task: 'siphon', label: 'Siphon du sol', day: 2 });
    const both = maintenanceDone(done, 'glass', MAINTENANCE_DAY_SECONDS);
    expect(
      maintenanceReadout(both, 0)
        .items.slice(-2)
        .map((i) => i.task),
    ).toEqual(['glass', 'siphon']);
    const problems: string[] = [];
    expect(readMaintenance(JSON.parse(JSON.stringify(both)), problems)).toEqual(both);
    expect(problems).toEqual([]);
    const bad = { ...both, lastDone: { ...both.lastDone, siphon: -3 } };
    expect(readMaintenance(bad, problems)).toBeNull();
    expect(problems).toEqual(['maintenance.lastDone.siphon doit être un temps']);
  });

  it('parts retirée et versée gardées d’une étape à l’autre et relues', () => {
    let session = completeCareStep(startCareSession());
    session = withSiphoned(session, 0.3);
    session = completeCareStep(session);
    session = skipCareStep(session);
    expect(session.step).toBe('eau');
    session = withPoured(session, 0.2);
    expect(session).toMatchObject({ siphoned: 0.3, poured: 0.2 });
    expect(readCareSession(serializeCareSession(session))).toEqual(session);
    expect(withPoured(session, 0.5).poured).toBe(0.2);
    expect(withSiphoned(session, MAX_SIPHON_SHARE + 0.1).siphoned).toBe(0.3);
    session = completeCareStep(withPoured(session, 0.3));
    expect(careSessionSummary(session).map((l) => l.outcome)).toEqual([
      'fait',
      'fait',
      'saute',
      'fait',
      null,
    ]);
  });

  it('séance enregistrée aux parts incohérentes : refusée', () => {
    const base = { step: 'eau', outcomes: { vitres: 'fait', siphon: 'fait', filtre: 'saute' } };
    for (const extra of [
      { siphoned: -0.1 },
      { siphoned: MAX_SIPHON_SHARE + 0.01 },
      { siphoned: 'beaucoup' },
      { siphoned: 0.2, poured: 0.3 },
      { poured: 0.1 },
    ]) {
      expect(readCareSession(JSON.stringify({ ...base, ...extra }))).toBeNull();
    }
    expect(readCareSession(JSON.stringify({ ...base, siphoned: 0.2, poured: 0.2 }))).toEqual({
      ...base,
      siphoned: 0.2,
      poured: 0.2,
    });
  });
});
