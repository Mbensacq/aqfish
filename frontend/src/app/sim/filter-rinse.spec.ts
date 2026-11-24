import { describe, expect, it } from 'vitest';

import {
  careStepTask,
  completeCareStep,
  readCareSession,
  serializeCareSession,
  skipCareStep,
  startCareSession,
  withRinse,
  type CareSession,
} from './care-session';
import { DEFAULT_DAY_LENGTH_SECONDS } from './daylight';
import { FILTER_MATURE_AT, NEW_TANK_FILTER, startFilterCyclingInPlace } from './filter-maturation';
import {
  FILTER_RINSE_TEXT,
  FILTER_RINSE_WATERS,
  TAP_RINSE_LOSS,
  filterAfterRinse,
  filterStepHint,
  isFilterRinseWater,
  rinseFilterInPlace,
} from './filter-rinse';
import { initialMaintenance, maintenanceDone } from './maintenance';
import { copyWater, freshWater, stepWaterInPlace, type MutableWaterState } from './water';
import { createDefaultWorld, rinseWorldFilterInPlace } from './world';
import type { MutableWorld } from './world-types';

const DAY = DEFAULT_DAY_LENGTH_SECONDS;

/** Eau d'un bac tropical au filtre mûr. */
function matureWater(): MutableWaterState {
  return copyWater(freshWater('tropical'));
}

/** `hours` heures simulées d'un bac de 100 L à la charge `load`, par pas d'une minute. */
function run(water: MutableWaterState, hours: number, load = 5): MutableWaterState {
  const step = DAY / (24 * 60);
  for (let i = 0; i < hours * 60; i++) {
    stepWaterInPlace(water, step, load, 100, water.temperature);
  }
  return water;
}

/** Séance arrivée à l'étape « filtre » (vitres et siphon passés). */
function atFilter(): CareSession {
  const session = skipCareStep(skipCareStep(startCareSession()));
  expect(session.step).toBe('filtre');
  return session;
}

describe('rinçage dans l’eau du bac (#606)', () => {
  it('maturation inchangée, aucune marque de maturation', () => {
    const water = matureWater();
    const before = { ...water };
    rinseFilterInPlace(water, 'bac');
    expect(water).toEqual(before);
    expect(water.filter).toBe(1);
    expect(water.cycling).toBeUndefined();
  });

  it('filtre neuf : maturation inchangée', () => {
    const water = matureWater();
    startFilterCyclingInPlace(water);
    rinseFilterInPlace(water, 'bac');
    expect(water.filter).toBe(NEW_TANK_FILTER);
    expect(water.cycling).toBe(true);
  });

  it('ammoniaque identique à un bac qu’on n’a pas rincé', () => {
    const rinsed = run(rinseFilterInPlace(matureWater(), 'bac'), 48);
    const untouched = run(matureWater(), 48);
    expect(rinsed.ammonia).toBe(untouched.ammonia);
  });
});

describe('rinçage à l’eau du robinet (#606)', () => {
  it('filtre mûr : réduit de TAP_RINSE_LOSS et reparti en maturation', () => {
    expect(TAP_RINSE_LOSS).toBeGreaterThan(0);
    expect(TAP_RINSE_LOSS).toBeLessThan(1);
    const water = matureWater();
    rinseFilterInPlace(water, 'robinet');
    expect(water.filter).toBeCloseTo(1 - TAP_RINSE_LOSS, 12);
    expect(water.cycling).toBe(true);
  });

  it('pic d’ammoniaque les jours suivants, plus haut qu’au rinçage dans le bac', () => {
    const tap = rinseFilterInPlace(matureWater(), 'robinet');
    const tank = rinseFilterInPlace(matureWater(), 'bac');
    // Sur le coup, l'ammoniaque ne bouge pas : c'est le filtre affaibli qui la convertit moins.
    expect(tap.ammonia).toBe(tank.ammonia);
    // Trois jours : l'azote suit le filtre affaibli plus lentement depuis #805.
    run(tap, 72);
    run(tank, 72);
    expect(tap.ammonia).toBeGreaterThan(tank.ammonia * 1.5);
    expect(tap.filter).toBeLessThan(1);
  });

  it('le filtre se repeuple ensuite (maturation)', () => {
    const water = rinseFilterInPlace(matureWater(), 'robinet');
    const after = water.filter;
    run(water, 24 * 7, 0);
    expect(water.filter).toBeGreaterThan(after);
  });

  it('filtre neuf : réduit lui aussi, toujours en maturation', () => {
    const water = matureWater();
    startFilterCyclingInPlace(water);
    rinseFilterInPlace(water, 'robinet');
    expect(water.filter).toBeCloseTo(NEW_TANK_FILTER * (1 - TAP_RINSE_LOSS), 12);
    expect(water.cycling).toBe(true);
  });

  it('filtre absent (efficacité nulle) : rien à tuer, rien ne change', () => {
    const water = matureWater();
    water.filter = 0;
    rinseFilterInPlace(water, 'robinet');
    expect(water.filter).toBe(0);
    expect(water.cycling).toBeUndefined();
  });

  it('efficacité non finie ou hors bornes ramenée dans [0, 1]', () => {
    expect(filterAfterRinse(Number.NaN, 'robinet')).toBe(0);
    expect(filterAfterRinse(2, 'robinet')).toBeCloseTo(1 - TAP_RINSE_LOSS, 12);
    expect(filterAfterRinse(-1, 'bac')).toBe(0);
    expect(filterAfterRinse(0.4, 'bac')).toBe(0.4);
  });

  it('dans le monde : seul le filtre du bac change', () => {
    const world: MutableWorld = createDefaultWorld(7);
    const before = { ...world.water };
    rinseWorldFilterInPlace(world, 'bac');
    expect(world.water).toEqual(before);
    rinseWorldFilterInPlace(world, 'robinet');
    expect(world.water.filter).toBeCloseTo(before.filter * (1 - TAP_RINSE_LOSS), 12);
    expect(world.water.ammonia).toBe(before.ammonia);
    expect(world.water.filter).toBeLessThan(FILTER_MATURE_AT);
  });
});

describe('textes du rinçage (#606)', () => {
  it('chaque choix a un libellé et une phrase « pourquoi »', () => {
    expect(FILTER_RINSE_WATERS).toEqual(['bac', 'robinet']);
    for (const rinse of FILTER_RINSE_WATERS) {
      expect(FILTER_RINSE_TEXT[rinse].label.length).toBeGreaterThan(0);
      expect(FILTER_RINSE_TEXT[rinse].why.length).toBeGreaterThan(0);
    }
    expect(FILTER_RINSE_TEXT.robinet.why).toContain('chlore');
  });

  it('consigne : efficacité du filtre en pour cent', () => {
    expect(filterStepHint({ filter: 1 })).toContain('100 %');
    expect(filterStepHint({ filter: 0.5 })).toContain('50 %');
    expect(filterStepHint({ filter: Number.NaN })).toContain('0 %');
  });

  it('eaux de rinçage reconnues', () => {
    expect(isFilterRinseWater('bac')).toBe(true);
    expect(isFilterRinseWater('robinet')).toBe(true);
    for (const value of ['', 'Bac', 'pluie', null, undefined, 1]) {
      expect(isFilterRinseWater(value)).toBe(false);
    }
  });
});

describe('séance : étape « filtre » (#606)', () => {
  it('étape faite : nettoyage du filtre au calendrier', () => {
    expect(careStepTask('filtre')).toBe('filter');
    const before = initialMaintenance(0);
    const after = maintenanceDone(before, 'filter', 3 * DAY);
    expect(after.lastDone.filter).toBe(3 * DAY);
    expect(after.log[0]).toEqual({ task: 'filter', time: 3 * DAY });
  });

  it('étape sautée : aucune eau de rinçage retenue, l’eau ne change pas', () => {
    const session = skipCareStep(atFilter());
    expect(session.step).toBe('eau');
    expect(session.outcomes.filtre).toBe('saute');
    expect(session.rinse).toBeUndefined();
  });

  it('choix retenu, gardé à l’étape suivante et relu après rechargement', () => {
    const chosen = withRinse(atFilter(), 'robinet');
    expect(chosen.rinse).toBe('robinet');
    expect(withRinse(chosen, 'bac').rinse).toBe('bac');
    const done = completeCareStep(chosen);
    expect(done.outcomes.filtre).toBe('fait');
    expect(readCareSession(serializeCareSession(chosen))).toEqual(chosen);
    expect(readCareSession(serializeCareSession(done))).toEqual(done);
  });

  it('choix inconnu ignoré ; séance enregistrée au choix inconnu refusée', () => {
    const session = atFilter();
    expect(withRinse(session, 'pluie' as never)).toBe(session);
    expect(readCareSession('{"step":"filtre","outcomes":{},"rinse":"pluie"}')).toBeNull();
    expect(readCareSession('{"step":"filtre","outcomes":{},"rinse":1}')).toBeNull();
  });
});
