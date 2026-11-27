import { SIM_DT } from './constants';
import { DEFAULT_DAY_LENGTH_SECONDS } from './daylight';
import { nightRest, restWeight } from './day-rhythm';
import {
  COLD_ACTIVE_TEMPERATURE,
  COLD_APPETITE_FLOOR,
  COLD_DORMANT_TEMPERATURE,
  coldAppetite,
  coldRest,
  dashboardSeason,
  DAYS_PER_YEAR,
  dayOfYear,
  MAX_POND_TEMPERATURE,
  MIN_POND_TEMPERATURE,
  pondSeasonReadout,
  pondTemperature,
  pondTemperatureOnDay,
  pondTemperatureSlope,
  seasonOfDay,
  START_DAY_OF_YEAR,
  trendOfDay,
  WARMEST_DAY_OF_YEAR,
} from './pond-season';
import { SPECIES } from './species';
import { ambientTemperature, readWater, targetTemperature, WATER_TEMPERATURES } from './water';
import { waterQuality } from './water-quality';
import { advance, createDefaultWorld } from './world';
import type { MutableWorld, World } from './world-types';

const DAY = DEFAULT_DAY_LENGTH_SECONDS;

/** Temps du monde (s) du jour `day` de l'année, dans la première année de jeu. */
function timeOfDay(day: number): number {
  return (((day - START_DAY_OF_YEAR + DAYS_PER_YEAR) % DAYS_PER_YEAR) * DAY) as number;
}

/** Monde par défaut de `environment` placé au pas le plus proche du temps `time`. */
function worldAt(environment: 'bassin' | 'tropical', time: number, temperature?: number): World {
  const world = structuredClone(createDefaultWorld(7, environment)) as MutableWorld;
  world.tick = Math.round(time / SIM_DT);
  world.time = world.tick * SIM_DT;
  if (temperature !== undefined) {
    (world.water as { temperature: number }).temperature = temperature;
  }
  return world;
}

function travelled(from: World, to: World, species: string): number {
  const a = from.entities.filter((f) => f.species === species);
  const b = to.entities.filter((f) => f.species === species);
  return a.reduce((sum, f, i) => sum + Math.hypot(b[i].x - f.x, b[i].z - f.z), 0);
}

function meanHunger(world: World, species: string): number {
  const fishes = world.entities.filter((f) => f.species === species);
  return fishes.reduce((sum, f) => sum + f.hunger, 0) / fishes.length;
}

describe('saisons du bassin : calendrier (issue #858)', () => {
  it('dayOfYear part de START_DAY_OF_YEAR et avance d’un jour par jour de jeu', () => {
    expect(dayOfYear(0)).toBe(START_DAY_OF_YEAR);
    expect(dayOfYear(DAY)).toBe(START_DAY_OF_YEAR + 1);
    expect(dayOfYear(DAY / 2)).toBe(START_DAY_OF_YEAR + 0.5);
  });

  it('dayOfYear boucle sur l’année et reste dans [0, 365[', () => {
    expect(dayOfYear(DAYS_PER_YEAR * DAY)).toBe(START_DAY_OF_YEAR);
    expect(dayOfYear((DAYS_PER_YEAR - START_DAY_OF_YEAR) * DAY)).toBe(0);
    expect(dayOfYear(-START_DAY_OF_YEAR * DAY - DAY)).toBe(DAYS_PER_YEAR - 1);
    for (const t of [0, 1e6, 1e9, -1e7]) {
      const day = dayOfYear(t);
      expect(day).toBeGreaterThanOrEqual(0);
      expect(day).toBeLessThan(DAYS_PER_YEAR);
    }
  });

  it('dayOfYear : un temps non fini compte comme 0', () => {
    expect(dayOfYear(NaN)).toBe(START_DAY_OF_YEAR);
    expect(dayOfYear(Infinity)).toBe(START_DAY_OF_YEAR);
  });
});

describe('saisons du bassin : courbe de température (issue #858)', () => {
  it('maximum le jour le plus chaud, minimum six mois plus tôt', () => {
    expect(pondTemperatureOnDay(WARMEST_DAY_OF_YEAR)).toBeCloseTo(MAX_POND_TEMPERATURE, 10);
    expect(pondTemperatureOnDay(WARMEST_DAY_OF_YEAR - DAYS_PER_YEAR / 2)).toBeCloseTo(
      MIN_POND_TEMPERATURE,
      10,
    );
    expect(MIN_POND_TEMPERATURE).toBe(4);
    expect(MAX_POND_TEMPERATURE).toBe(24);
  });

  it('reste dans [MIN, MAX] toute l’année et passe sous le seuil d’activité en hiver', () => {
    const values = Array.from({ length: DAYS_PER_YEAR * 4 }, (_, i) => pondTemperatureOnDay(i / 4));
    expect(Math.min(...values)).toBeGreaterThanOrEqual(MIN_POND_TEMPERATURE - 1e-9);
    expect(Math.max(...values)).toBeLessThanOrEqual(MAX_POND_TEMPERATURE + 1e-9);
    expect(Math.min(...values)).toBeLessThan(COLD_ACTIVE_TEMPERATURE);
  });

  it('est continue : moins de 0,2 °C d’un jour au suivant, passage d’année compris', () => {
    for (let t = 0; t < DAYS_PER_YEAR * DAY * 1.01; t += DAY) {
      expect(Math.abs(pondTemperature(t + DAY) - pondTemperature(t))).toBeLessThan(0.2);
    }
    const lastDay = pondTemperatureOnDay(DAYS_PER_YEAR - 1e-9);
    expect(pondTemperatureOnDay(0)).toBeCloseTo(lastDay, 6);
  });

  it('démarre près des 18 °C du bassin d’avant (jour de capture inchangé)', () => {
    expect(Math.abs(pondTemperature(0) - WATER_TEMPERATURES.bassin)).toBeLessThan(0.5);
  });

  it('pente : nulle aux extrêmes, positive au printemps, négative en automne', () => {
    expect(pondTemperatureSlope(WARMEST_DAY_OF_YEAR)).toBeCloseTo(0, 10);
    expect(pondTemperatureSlope(100)).toBeGreaterThan(0);
    expect(pondTemperatureSlope(290)).toBeLessThan(0);
  });
});

describe('saisons du bassin : saison et tendance (issue #858)', () => {
  it('saisons météorologiques aux bornes', () => {
    expect(seasonOfDay(0)).toBe('hiver');
    expect(seasonOfDay(58.9)).toBe('hiver');
    expect(seasonOfDay(59)).toBe('printemps');
    expect(seasonOfDay(151)).toBe('ete');
    expect(seasonOfDay(243)).toBe('automne');
    expect(seasonOfDay(334)).toBe('hiver');
    expect(seasonOfDay(364.9)).toBe('hiver');
  });

  it('tendance : hausse au printemps, baisse en automne, stable au cœur de l’été', () => {
    expect(trendOfDay(100)).toBe('hausse');
    expect(trendOfDay(290)).toBe('baisse');
    expect(trendOfDay(WARMEST_DAY_OF_YEAR)).toBe('stable');
    expect(trendOfDay(WARMEST_DAY_OF_YEAR - DAYS_PER_YEAR / 2)).toBe('stable');
  });

  it('relevé : texte en toutes lettres et température au dixième', () => {
    const summer = pondSeasonReadout(timeOfDay(WARMEST_DAY_OF_YEAR));
    expect(summer).toEqual({
      season: 'ete',
      trend: 'stable',
      ambient: 24,
      text: 'été, température stable',
    });
    const spring = pondSeasonReadout(timeOfDay(100));
    expect(spring.text).toBe('printemps, l’eau se réchauffe');
    expect(pondSeasonReadout(timeOfDay(300)).text).toBe('automne, l’eau se refroidit');
    expect(pondSeasonReadout(timeOfDay(10)).season).toBe('hiver');
  });
});

describe('saisons du bassin : tableau de bord (issue #858)', () => {
  it('dashboardSeason : null sans température ambiante ou au pas non fini', () => {
    expect(dashboardSeason({ tick: 0 })).toBeNull();
    expect(dashboardSeason({ tick: NaN, ambient: 10 })).toBeNull();
  });

  it('dashboardSeason : mot en capitale, phrase lue, au pas du relevé', () => {
    const winter = Math.round(timeOfDay(15) / SIM_DT);
    expect(dashboardSeason({ tick: winter, ambient: 4 })).toEqual({
      season: 'hiver',
      trend: 'stable',
      label: 'Hiver',
      text: 'hiver, température stable',
      spoken: 'Saison : hiver, température stable',
    });
    const summer = Math.round(timeOfDay(170) / SIM_DT);
    expect(dashboardSeason({ tick: summer, ambient: 20 })?.label).toBe('Été');
  });
});

describe('saisons du bassin : activité et appétit des koïs (issue #858)', () => {
  it('coldRest : 0 au seuil et au-dessus, 1 au repos hivernal et en dessous, linéaire entre', () => {
    expect(coldRest('koi', COLD_ACTIVE_TEMPERATURE)).toBe(0);
    expect(coldRest('koi', 25)).toBe(0);
    expect(coldRest('koi', COLD_DORMANT_TEMPERATURE)).toBe(1);
    expect(coldRest('koi', 0)).toBe(1);
    expect(coldRest('koi', 7.5)).toBeCloseTo(0.5, 12);
    expect(coldRest('rouge', 7.5)).toBeCloseTo(0.5, 12);
  });

  it('coldRest : espèces tropicales, inconnues et température non finie', () => {
    expect(coldRest('neon', 2)).toBe(0);
    expect(coldRest('axolotl', 2)).toBe(0);
    expect(coldRest('requin', 2)).toBe(0);
    expect(coldRest('constructor', 2)).toBe(0);
    expect(coldRest('koi', NaN)).toBe(0);
    expect(coldRest('koi', -Infinity)).toBe(0);
  });

  it('coldAppetite : 1 au-dessus du seuil, plancher au repos hivernal', () => {
    expect(coldAppetite('koi', 18)).toBe(1);
    expect(coldAppetite('koi', COLD_ACTIVE_TEMPERATURE)).toBe(1);
    expect(coldAppetite('koi', COLD_DORMANT_TEMPERATURE)).toBeCloseTo(COLD_APPETITE_FLOOR, 12);
    expect(coldAppetite('koi', -5)).toBeCloseTo(COLD_APPETITE_FLOOR, 12);
    expect(coldAppetite('neon', 2)).toBe(1);
  });

  it('restWeight : exactement le repos de nuit sans froid, le froid sinon', () => {
    expect(restWeight('koi', 1, 18)).toBe(nightRest('koi', 1));
    expect(restWeight('koi', 0.25, 18)).toBe(nightRest('koi', 0.25));
    expect(restWeight('koi', 1, 4)).toBe(1);
    expect(restWeight('koi', 0, 7.5)).toBe(1);
    expect(restWeight('neon', 1, 4)).toBe(0);
  });
});

describe('saisons du bassin : monde (issue #858)', () => {
  it('le pas pose la température ambiante du jour au bassin et l’eau la suit', () => {
    const winter = timeOfDay(WARMEST_DAY_OF_YEAR - DAYS_PER_YEAR / 2);
    const after = advance(worldAt('bassin', winter), 60 * 60 * 10);
    expect(after.water.ambient).toBeCloseTo(MIN_POND_TEMPERATURE, 2);
    expect(targetTemperature(after.water, 'bassin')).toBe(after.water.ambient);
    expect(after.water.temperature).toBeLessThan(WATER_TEMPERATURES.bassin - 6);
    // Eau à la température de saison : ni mauvaise ni stressante pour la référence.
    expect(ambientTemperature(after.water, 'bassin')).toBe(after.water.ambient);
    expect(waterQuality({ ...after.water, temperature: MIN_POND_TEMPERATURE }, 'bassin')).not.toBe(
      'mauvaise',
    );
  });

  it('les autres environnements n’ont pas de température ambiante', () => {
    const after = advance(worldAt('tropical', 0), 60);
    expect(after.water.ambient).toBeUndefined();
    expect(targetTemperature(after.water, 'tropical')).toBe(WATER_TEMPERATURES.tropical);
  });

  it('en eau froide, les koïs nagent moins et ont moins faim qu’en été', () => {
    const summer = worldAt('bassin', timeOfDay(WARMEST_DAY_OF_YEAR), 22);
    const winter = worldAt('bassin', timeOfDay(WARMEST_DAY_OF_YEAR), 4);
    const steps = 60 * 20;
    const summerAfter = advance(summer, steps);
    const winterAfter = advance(winter, steps);
    expect(travelled(winter, winterAfter, 'koi')).toBeLessThan(
      0.7 * travelled(summer, summerAfter, 'koi'),
    );
    const summerHunger = meanHunger(summerAfter, 'koi') - meanHunger(summer, 'koi');
    const winterHunger = meanHunger(winterAfter, 'koi') - meanHunger(winter, 'koi');
    expect(summerHunger).toBeGreaterThan(0);
    expect(winterHunger).toBeLessThan(0.5 * summerHunger);
    expect(winterHunger).toBeGreaterThanOrEqual(0);
  });

  it('la faim d’un poisson transi ne passe jamais sous 0', () => {
    const cold = worldAt('bassin', 0, 2);
    const winter = { ...cold, entities: cold.entities.map((f) => ({ ...f, hunger: 0 })) };
    const after = advance(winter, 30);
    for (const fish of after.entities) {
      expect(fish.hunger).toBeGreaterThanOrEqual(0);
    }
    expect(SPECIES.koi.feeding.hungerRate).toBeGreaterThan(0);
  });

  it('la sauvegarde relit la température ambiante, et refuse une valeur hors bornes', () => {
    const water = advance(worldAt('bassin', 0), 2).water;
    const read = readWater(JSON.parse(JSON.stringify(water)), 'bassin');
    expect(read.ok && read.water.ambient).toBe(water.ambient);
    const bad = readWater({ ...water, ambient: 99 }, 'bassin');
    expect(bad.ok).toBe(false);
    expect(readWater({ ...water, ambient: 'chaud' }, 'bassin').ok).toBe(false);
  });
});
