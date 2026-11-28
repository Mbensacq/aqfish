import { describe, expect, it } from 'vitest';
import { ADULT_MIN_SHARE, lifespanSeconds } from './aging';
import { DEFAULT_DAY_LENGTH_SECONDS } from './daylight';
import {
  bodyScale,
  GROWTH_DAYS,
  GROWTH_MIN_SCALE,
  GROWTH_SECONDS,
  growsWithAge,
  growthScale,
  JUVENILE_START_SCALE,
} from './fish-growth';
import { FRY_GROWTH_TIME, fryScale, growFryInPlace } from './fry';
import { GROWTH_SAMPLE_AGES, growWorldInPlace } from './fry-sample';
import { SPECIES, type SpeciesId } from './species';
import { birthFryInPlace, cloneWorld, createWorld } from './world';
import type { Entity, Mutable } from './world-types';

const DAY = DEFAULT_DAY_LENGTH_SECONDS;
const SPECIES_IDS = Object.keys(SPECIES) as SpeciesId[];

describe('growthScale', () => {
  it('vaut la taille minimale (≈ 0,45) à la naissance', () => {
    expect(growthScale(0, 'platy')).toBe(GROWTH_MIN_SCALE);
    expect(GROWTH_MIN_SCALE).toBeCloseTo(0.45, 5);
  });

  it('traite un âge négatif comme une naissance', () => {
    expect(growthScale(-50, 'guppy')).toBe(GROWTH_MIN_SCALE);
  });

  it('suit les jalons de l’alevin pendant son premier jour', () => {
    for (const age of [0, 399, 400, 799, 800, FRY_GROWTH_TIME - 1]) {
      expect(growthScale(age, 'platy')).toBe(fryScale(age));
    }
  });

  it('part de la taille du subadulte quand le poisson cesse d’être alevin', () => {
    expect(growthScale(FRY_GROWTH_TIME, 'platy')).toBe(JUVENILE_START_SCALE);
  });

  it('vaut 1 à l’âge adulte et au-delà, même très âgé', () => {
    expect(growthScale(GROWTH_SECONDS, 'platy')).toBe(1);
    expect(growthScale(GROWTH_SECONDS + 1, 'platy')).toBe(1);
    expect(growthScale(lifespanSeconds('platy') * 2, 'platy')).toBe(1);
  });

  it('reste dans [taille minimale, 1] et ne décroît jamais', () => {
    let previous = 0;
    for (let age = -DAY; age <= GROWTH_SECONDS + DAY; age += DAY / 8) {
      const scale = growthScale(age, 'guppy');
      expect(scale).toBeGreaterThanOrEqual(GROWTH_MIN_SCALE);
      expect(scale).toBeLessThanOrEqual(1);
      expect(scale).toBeGreaterThanOrEqual(previous);
      previous = scale;
    }
  });

  it('est à mi-chemin entre subadulte et adulte au milieu de la croissance du jeune', () => {
    const middle = (FRY_GROWTH_TIME + GROWTH_SECONDS) / 2;
    expect(growthScale(middle, 'platy')).toBeCloseTo((JUVENILE_START_SCALE + 1) / 2, 10);
  });

  it('vaut 1 pour un âge non fini', () => {
    expect(growthScale(Number.NaN, 'platy')).toBe(1);
    expect(growthScale(Number.POSITIVE_INFINITY, 'platy')).toBe(1);
    expect(growthScale(Number.NEGATIVE_INFINITY, 'platy')).toBe(1);
  });

  it('vaut 1 pour une espèce sans donnée de croissance ou inconnue', () => {
    expect(growthScale(0, 'axolotl')).toBe(1);
    expect(growthScale(0, 'crevette' as SpeciesId)).toBe(1);
    expect(growthScale(0, 'espece-inconnue' as SpeciesId)).toBe(1);
  });
});

describe('growsWithAge', () => {
  it('retient les nageurs et écarte marcheurs et amphibiens', () => {
    for (const id of SPECIES_IDS) {
      const def = SPECIES[id];
      expect(growsWithAge(id)).toBe(def.walker === undefined && def.amphibian === undefined);
    }
  });
});

describe('monde neuf', () => {
  it('tout adulte tiré de la graine a déjà sa taille adulte, quelle que soit l’espèce', () => {
    for (const id of SPECIES_IDS) {
      expect(GROWTH_SECONDS).toBeLessThanOrEqual(ADULT_MIN_SHARE * lifespanSeconds(id));
    }
  });
});

describe('bodyScale', () => {
  it('garde fryScale pour un alevin, même avec une naissance connue', () => {
    expect(bodyScale({ species: 'platy', growth: 500, bornAt: -9999 }, 0)).toBe(fryScale(500));
  });

  it('vaut 1 pour un adulte sans naissance connue', () => {
    expect(bodyScale({ species: 'platy' }, 12345)).toBe(1);
  });

  it('vaut fryScale sans temps affiché', () => {
    expect(bodyScale({ species: 'platy', bornAt: 0 }, undefined)).toBe(1);
    expect(bodyScale({ species: 'platy', growth: 0, bornAt: 0 }, undefined)).toBe(GROWTH_MIN_SCALE);
  });

  it('suit l’âge d’un jeune né au bac', () => {
    const fish = { species: 'platy' as const, bornAt: 1000 };
    expect(bodyScale(fish, 1000 + FRY_GROWTH_TIME)).toBe(JUVENILE_START_SCALE);
    expect(bodyScale(fish, 1000 + GROWTH_SECONDS)).toBe(1);
  });
});

describe('croissance d’un alevin de platy né au bac', () => {
  it('naît à la taille minimale et atteint la taille adulte en trois semaines de jeu', () => {
    const world = cloneWorld(createWorld(7, [{ species: 'platy', count: 2 }]));
    const mother = world.entities[1];
    const fry = birthFryInPlace(world, mother) as Mutable<Entity>;
    expect(bodyScale(fry, world.time)).toBe(GROWTH_MIN_SCALE);

    const scales: number[] = [];
    let time = world.time;
    for (let day = 1; day <= GROWTH_DAYS; day++) {
      growFryInPlace([fry], DAY);
      time += DAY;
      scales.push(bodyScale(fry, time));
    }
    expect(fry.growth).toBeUndefined();
    expect(scales[0]).toBe(JUVENILE_START_SCALE);
    expect(scales[GROWTH_DAYS - 2]).toBeLessThan(1);
    expect(scales[GROWTH_DAYS - 1]).toBe(1);
    expect([...scales].sort((a, b) => a - b)).toEqual(scales);
    expect(GROWTH_DAYS).toBeGreaterThanOrEqual(14);
  });

  it('ne change rien à la taille des adultes du monde neuf', () => {
    const world = createWorld(7, [{ species: 'platy', count: 4 }]);
    for (const fish of world.entities) {
      expect(bodyScale(fish, world.time)).toBe(1);
    }
  });
});

describe('jeunes d’exemple (alevins=jeunes)', () => {
  it('étalent les âges des alevins aux jeunes, du plus petit au presque adulte', () => {
    const world = cloneWorld(createWorld(42, [{ species: 'platy', count: 4 }]));
    const first = world.entities.length;
    const born = growWorldInPlace(world);
    const young = world.entities.slice(first);
    expect(born).toBe(young.length);
    expect(born).toBeGreaterThanOrEqual(GROWTH_SAMPLE_AGES.length);
    young.forEach((fish, k) => {
      const age = GROWTH_SAMPLE_AGES[k % GROWTH_SAMPLE_AGES.length];
      expect(fish.bornAt).toBe(world.time - age);
      expect(fish.growth).toBe(age < FRY_GROWTH_TIME ? age : undefined);
    });
    const scales = young.slice(0, GROWTH_SAMPLE_AGES.length).map((f) => bodyScale(f, 0));
    expect(scales[0]).toBe(GROWTH_MIN_SCALE);
    expect(new Set(scales).size).toBe(GROWTH_SAMPLE_AGES.length);
    expect([...scales].sort((a, b) => a - b)).toEqual(scales);
    expect(Math.max(...scales)).toBeLessThan(1);
  });

  it('laissent les jeunes crevettes comme les alevins d’exemple', () => {
    const world = cloneWorld(createWorld(42, [{ species: 'crevette', count: 6 }]));
    const first = world.entities.length;
    growWorldInPlace(world);
    for (const fish of world.entities.slice(first)) {
      expect(fish.bornAt).toBe(0);
    }
  });
});
