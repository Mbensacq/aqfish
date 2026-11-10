import { describe, expect, it } from 'vitest';

import { doseBacteriaStarterInPlace } from './bacteria-starter';
import { SIM_DT } from './constants';
import { DEFAULT_DAY_LENGTH_SECONDS } from './daylight';
import {
  FILTER_MATURATION_DAYS,
  FILTER_MATURE_AT,
  FILTER_SEED,
  NEW_TANK_FILTER,
  filterMaturityPercent,
  isFilterCycling,
  startFilterCyclingInPlace,
  stepFilterMaturationInPlace,
} from './filter-maturation';
import { addTank, createRoom } from './room-state';
import { parseWorld, serializeWorld } from './save';
import {
  changeWaterInPlace,
  copyWater,
  freshWater,
  readWater,
  stepWaterInPlace,
  type MutableWaterState,
} from './water';
import { createDefaultWorld, type MutableWorld } from './world';

const DAY = DEFAULT_DAY_LENGTH_SECONDS;

/** Eau d'un bac neuf, filtre en maturation. */
function cycling(): MutableWaterState {
  const water = copyWater(freshWater('tropical'));
  startFilterCyclingInPlace(water);
  return water;
}

/** `days` journées de maturation, par pas d'une heure simulée. */
function mature(water: MutableWaterState, days: number): MutableWaterState {
  const step = DAY / 24;
  for (let i = 0; i < Math.round(days * 24); i++) {
    stepFilterMaturationInPlace(water, step);
  }
  return water;
}

describe('maturation du filtre (#538)', () => {
  it('un bac neuf démarre avec un filtre presque vide, marqué en maturation', () => {
    const water = cycling();
    expect(water.filter).toBe(NEW_TANK_FILTER);
    expect(isFilterCycling(water)).toBe(true);
    expect(filterMaturityPercent(water)).toBe(5);
  });

  it('suit la source : faible à 2 semaines, efficace à 6, mûr à 8 (UF/IFAS FA16)', () => {
    const water = cycling();
    mature(water, 14);
    expect(water.filter).toBeLessThan(0.3);
    mature(water, 28);
    expect(water.filter).toBeGreaterThan(0.9);
    expect(isFilterCycling(water)).toBe(true);
    mature(water, FILTER_MATURATION_DAYS - 42 + 0.1);
    expect(water.filter).toBe(1);
    expect(isFilterCycling(water)).toBe(false);
    expect('cycling' in water).toBe(false);
  });

  it('ne mûrit pas avant 8 semaines moins un jour', () => {
    const water = mature(cycling(), FILTER_MATURATION_DAYS - 1);
    expect(water.filter).toBeLessThan(FILTER_MATURE_AT);
    expect(water.filter).toBeGreaterThan(0.98);
    expect(water.cycling).toBe(true);
  });

  it('croît sans jamais redescendre', () => {
    const water = cycling();
    let previous = water.filter;
    for (let day = 0; day < FILTER_MATURATION_DAYS + 1; day++) {
      stepFilterMaturationInPlace(water, DAY);
      expect(water.filter).toBeGreaterThanOrEqual(previous);
      previous = water.filter;
    }
    expect(water.filter).toBe(1);
  });

  it('ne dépend pas du pas : forme exacte de la logistique', () => {
    const coarse = cycling();
    stepFilterMaturationInPlace(coarse, 10 * DAY);
    const fine = cycling();
    for (let i = 0; i < 10 * 1000; i++) {
      stepFilterMaturationInPlace(fine, DAY / 1000);
    }
    expect(fine.filter).toBeCloseTo(coarse.filter, 10);
  });

  it('sans marque, le filtre ne bouge pas (bac du jeu, sauvegarde antérieure)', () => {
    for (const filter of [0, 0.2, 1]) {
      const water = copyWater({ ...freshWater('tropical'), filter });
      stepFilterMaturationInPlace(water, 30 * DAY);
      expect(water.filter).toBe(filter);
      expect('cycling' in water).toBe(false);
    }
  });

  it('un filtre à 0 en maturation repart de quelques bactéries', () => {
    const water = copyWater({ ...freshWater('tropical'), filter: 0, cycling: true });
    stepFilterMaturationInPlace(water, SIM_DT);
    expect(water.filter).toBeGreaterThanOrEqual(FILTER_SEED);
    expect(water.filter).toBeLessThan(FILTER_SEED * 1.01);
  });

  it('un filtre déjà mûr perd sa marque au premier pas', () => {
    const water = copyWater({ ...freshWater('tropical'), filter: 1, cycling: true });
    stepFilterMaturationInPlace(water, SIM_DT);
    expect(water.filter).toBe(1);
    expect('cycling' in water).toBe(false);
  });

  it('l’amorce de bactéries accélère la maturation', () => {
    const [helped, alone] = [cycling(), cycling()];
    expect(doseBacteriaStarterInPlace(helped, 1).ok).toBe(true);
    for (let i = 0; i < 7 * 24; i++) {
      for (const water of [helped, alone]) {
        stepWaterInPlace(water, DAY / 24, 0, 100, water.temperature);
      }
    }
    expect(helped.filter).toBeGreaterThan(alone.filter + 0.4);
    expect(helped.cycling).toBe(true);
  });

  it('l’amorce peut finir la maturation : la marque disparaît', () => {
    const water = copyWater({ ...freshWater('tropical'), filter: 0.7, cycling: true });
    doseBacteriaStarterInPlace(water, 1);
    for (let i = 0; i < 7 * 24; i++) {
      stepWaterInPlace(water, DAY / 24, 0, 100, water.temperature);
    }
    expect(water.filter).toBe(1);
    expect('cycling' in water).toBe(false);
    expect('bacteriaStarter' in water).toBe(false);
  });

  it('un filtre neuf convertit moins l’ammoniaque qu’un filtre mûr', () => {
    const young = cycling();
    const old = copyWater(freshWater('tropical'));
    for (let i = 0; i < 600; i++) {
      for (const water of [young, old]) {
        stepWaterInPlace(water, 1, 5, 100, water.temperature);
      }
    }
    expect(young.ammonia).toBeGreaterThan(old.ammonia);
  });

  it('le changement d’eau garde le filtre et sa marque', () => {
    const water = mature(cycling(), 10);
    const filter = water.filter;
    changeWaterInPlace(water, 'tropical');
    expect(water.filter).toBe(filter);
    expect(water.cycling).toBe(true);
  });

  it('pourcentage borné et entier, même sur une valeur invalide', () => {
    expect(filterMaturityPercent({ filter: 0.999 })).toBe(99);
    expect(filterMaturityPercent({ filter: 0.29 })).toBe(29);
    expect(filterMaturityPercent({ filter: 1 })).toBe(100);
    expect(filterMaturityPercent({ filter: -1 })).toBe(0);
    expect(filterMaturityPercent({ filter: 2 })).toBe(100);
    expect(filterMaturityPercent({ filter: Number.NaN })).toBe(0);
  });
});

describe('maturation du filtre : bacs et sauvegardes (#538)', () => {
  it('le bac par défaut garde un filtre mûr, sans marque', () => {
    const world = createDefaultWorld(1, 'tropical');
    expect(world.water.filter).toBe(1);
    expect('cycling' in world.water).toBe(false);
  });

  it('un bac ajouté à la pièce démarre en maturation, les autres sont inchangés', () => {
    const room = createRoom(3);
    const result = addTank(room, {
      environment: 'recif',
      size: 'petit',
      placement: { supportId: null, x: 2.5, z: 2, quarter: 0 },
    });
    if (!result.ok) {
      throw new Error(`ajout refusé : ${result.reason}`);
    }
    const added = result.room.tanks.find((t) => t.id === result.id);
    expect(added?.world.water.filter).toBe(NEW_TANK_FILTER);
    expect(added?.world.water.cycling).toBe(true);
    for (const tank of room.tanks) {
      expect(result.room.tanks.find((t) => t.id === tank.id)).toEqual(tank);
    }
  });

  it('la marque traverse une sauvegarde', () => {
    const world = { ...createDefaultWorld(2, 'tropical') } as MutableWorld;
    world.water = { ...world.water, filter: 0.3, cycling: true };
    const parsed = parseWorld(serializeWorld(world));
    if (!parsed.ok) {
      throw new Error(parsed.error);
    }
    expect(parsed.world.water.filter).toBe(0.3);
    expect(parsed.world.water.cycling).toBe(true);
  });

  it('une sauvegarde antérieure se lit sans marque ; une marque invalide est refusée', () => {
    const plain = readWater({ ...freshWater('tropical'), filter: 0.4 }, 'tropical');
    expect(plain.ok && 'cycling' in plain.water).toBe(false);
    for (const cyclingValue of [false, 1, 'oui', null]) {
      const read = readWater({ ...freshWater('tropical'), cycling: cyclingValue }, 'tropical');
      expect(read).toEqual({ ok: false, error: 'eau : cycling doit valoir true ou être absent' });
    }
  });
});
