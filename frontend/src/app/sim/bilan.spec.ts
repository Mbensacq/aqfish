import { describe, expect, it } from 'vitest';

import { ENVIRONMENT_IDS } from './environment';
import {
  DENSITY_THRESHOLDS,
  MAX_REVIEW_POINTS,
  OVERFEEDING_PELLETS,
  REVIEW_ORDER,
  tankReview,
  worldReview,
  type ReviewInput,
} from './bilan';
import { setPopulation } from './population';
import { DEFAULT_WATER_SAMPLE } from './water-dashboard';
import { createDefaultWorld } from './world';

const LITERS = 288;

function input(overrides: Partial<ReviewInput> = {}): ReviewInput {
  return {
    sample: DEFAULT_WATER_SAMPLE,
    animals: 10,
    load: 20,
    liters: LITERS,
    averageHunger: 0.2,
    pellets: 0,
    mixes: [],
    species: ['neon'],
    hardness: { gh: 6, kh: 4 },
    ...overrides,
  };
}

const ALL: ReviewInput = input({
  sample: { ...DEFAULT_WATER_SAMPLE, ammonia: 6, temperature: 31 },
  load: DENSITY_THRESHOLDS.bad * LITERS,
  averageHunger: 0.9,
  mixes: [{ first: 'neon', second: 'gourami', reason: 'predateur' }],
  hardness: { gh: 25, kh: 4 },
});

describe('tankReview (#514)', () => {
  it('bac sain : aucun point', () => {
    expect(tankReview(input())).toEqual([]);
  });

  it('bac vide à l’eau saine : aucun point, même avec des granulés', () => {
    expect(
      tankReview(input({ animals: 0, load: 0, averageHunger: null, species: [], pellets: 60 })),
    ).toEqual([]);
  });

  it('tous les points touchés : trois au plus, critiques d’abord, ordre fixe', () => {
    const points = tankReview(ALL);
    expect(points).toHaveLength(MAX_REVIEW_POINTS);
    expect(points.map((p) => p.id)).toEqual(['density', 'nitrogen', 'temperature']);
    expect(points.every((p) => p.severity === 'critique')).toBe(true);
  });

  it('à gravité égale, l’ordre fixe ; une attention passe après une critique', () => {
    const sample = { ...DEFAULT_WATER_SAMPLE, nitrate: 25, temperature: 32 };
    const points = tankReview(input({ sample, pellets: OVERFEEDING_PELLETS }));
    expect(points.map((p) => [p.id, p.severity])).toEqual([
      ['temperature', 'critique'],
      ['nitrogen', 'attention'],
      ['feeding', 'attention'],
    ]);
    expect(REVIEW_ORDER.indexOf('nitrogen')).toBeLessThan(REVIEW_ORDER.indexOf('feeding'));
  });

  it('ordre stable d’un appel à l’autre', () => {
    expect(tankReview(ALL)).toEqual(tankReview(ALL));
  });

  it('chaque point cite une valeur et une action', () => {
    for (const point of tankReview(ALL)) {
      expect(point.measure).toMatch(/\d/);
      expect(point.action.length).toBeGreaterThan(5);
    }
    expect(tankReview(ALL)[0].measure).toBe(
      `10 animaux dans ${LITERS} L : 250 % de ce que le filtre peut traiter`,
    );
  });

  it('densité : bornes des seuils', () => {
    const at = (share: number) =>
      tankReview(input({ load: share * LITERS })).find((p) => p.id === 'density')?.severity;
    expect(at(DENSITY_THRESHOLDS.watch * 0.99)).toBeUndefined();
    expect(at(DENSITY_THRESHOLDS.watch)).toBe('attention');
    expect(at(DENSITY_THRESHOLDS.bad)).toBe('critique');
  });

  it('valeurs non finies : points critiques, jamais rassurants', () => {
    const points = tankReview(
      input({
        sample: { ...DEFAULT_WATER_SAMPLE, ammonia: NaN, temperature: Infinity },
        load: NaN,
      }),
    );
    expect(points.map((p) => [p.id, p.severity])).toEqual([
      ['density', 'critique'],
      ['nitrogen', 'critique'],
      ['temperature', 'critique'],
    ]);
    for (const point of points) {
      expect(point.measure).toContain('mesure invalide');
    }
  });

  it('litres nuls ou négatifs : mesure invalide', () => {
    for (const liters of [0, -5, NaN]) {
      expect(tankReview(input({ liters }))[0]).toMatchObject({
        id: 'density',
        severity: 'critique',
      });
    }
  });

  it('granulés non finis : point critique', () => {
    expect(tankReview(input({ pellets: NaN }))[0]).toMatchObject({
      id: 'feeding',
      severity: 'critique',
    });
  });

  it('nourrissage : faim moyenne, ou granulés en excès chez des animaux rassasiés', () => {
    expect(tankReview(input({ averageHunger: 1 }))[0]).toMatchObject({
      id: 'feeding',
      severity: 'critique',
      title: 'Animaux affamés',
    });
    expect(tankReview(input({ pellets: OVERFEEDING_PELLETS - 1 }))).toEqual([]);
    const fed = tankReview(input({ pellets: OVERFEEDING_PELLETS }))[0];
    expect(fed.title).toBe('Trop de nourriture');
    expect(fed.measure).toContain('15 granulés');
    expect(tankReview(input({ averageHunger: null, pellets: 20 }))[0].measure).toBe(
      '20 granulés non mangés dans l’eau',
    );
  });

  it('dureté absente du relevé : point ignoré', () => {
    expect(tankReview(input({ hardness: undefined }))).toEqual([]);
  });

  it('dureté hors plage : nomme l’espèce et la valeur ; non finie : critique', () => {
    const point = tankReview(input({ hardness: { gh: 20, kh: 4 } }))[0];
    expect(point.id).toBe('hardness');
    expect(point.severity).toBe('attention');
    expect(point.measure).toContain('20');
    expect(point.measure).toContain('néons');
    expect(tankReview(input({ hardness: { gh: NaN, kh: 4 } }))[0].severity).toBe('critique');
  });

  it('compatibilité : compte les mélanges', () => {
    const point = tankReview(
      input({
        mixes: [
          { first: 'neon', second: 'gourami', reason: 'predateur' },
          { first: 'guppy', second: 'gourami', reason: 'territorial' },
        ],
      }),
    )[0];
    expect(point.id).toBe('compatibility');
    expect(point.measure).toContain('2 mélanges à risque');
  });
});

describe('worldReview (#514)', () => {
  it('population par défaut de chaque environnement : aucun point', () => {
    for (const environment of ENVIRONMENT_IDS) {
      expect(worldReview(createDefaultWorld(42, environment))).toEqual([]);
    }
  });

  it('bac tropical plein : la densité en premier', () => {
    const packed = setPopulation(setPopulation(createDefaultWorld(42), 'neon', 40), 'guppy', 20);
    expect(worldReview(packed)[0].id).toBe('density');
  });
});
