import { describe, expect, it } from 'vitest';

import { approx, range, sourced } from './sheet-field';
import { SPECIES, type SpeciesId } from './species';
import {
  canAdd,
  capacityProfile,
  capacityStatus,
  occupation,
  populationNeedLiters,
  populationOf,
  sourceLabel,
  speciesNeedLiters,
  type CapacityProfile,
} from './tank-capacity';
import { realWaterLiters } from './tank-water-volume';
import { createDefaultWorld, createWorld } from './world';

const ALL_SPECIES = Object.keys(SPECIES) as SpeciesId[];

/** Profil fabriqué : 10 cm, 1,5 à 2 L/cm, 20 L au moins, sans volume par adulte. */
function profile(overrides: Partial<CapacityProfile> = {}): CapacityProfile {
  return {
    species: 'neon',
    adultSizeCm: approx(10),
    litersPerCm: approx(range(1.5, 2)),
    minLiters: approx(20),
    extraLitersPerAdult: approx(null),
    firstAdultLiters: null,
    reference: 'eau',
    ...overrides,
  };
}

describe('capacité du bac : données (#807)', () => {
  it.each(ALL_SPECIES)(
    '« %s » a une longueur, un volume minimal et une densité utilisables',
    (id) => {
      const p = capacityProfile(id);

      expect(p.adultSizeCm.value).toBeGreaterThan(0);
      expect(p.minLiters.value).toBeGreaterThan(0);
      expect(p.litersPerCm.value.min).toBeGreaterThan(0);
      expect(p.litersPerCm.value.max).toBeGreaterThanOrEqual(p.litersPerCm.value.min);
      expect(speciesNeedLiters(p, 1)).toBeGreaterThan(0);
    },
  );

  it('tropical : plafond 1,5 L/cm et conseillé 2 L/cm (RSPCA)', () => {
    const neon = capacityProfile('neon');

    expect(neon.litersPerCm.value).toEqual({ min: 1.5, max: 2 });
    expect(sourceLabel(neon.litersPerCm)).toBe('RSPCA');
    expect(speciesNeedLiters(neon, 10, 'plafond')).toBe(10 * 4 * 1.5);
    expect(speciesNeedLiters(neon, 10, 'conseille')).toBe(10 * 4 * 2);
  });

  it('poisson rouge : 100 L pour le premier, puis 50 L par adulte (OATA), désaccord RSPCA noté', () => {
    const rouge = capacityProfile('rouge');

    expect([1, 2, 3].map((n) => speciesNeedLiters(rouge, n))).toEqual([100, 150, 200]);
    expect(speciesNeedLiters(rouge, 2, 'conseille')).toBe(150);
    expect(sourceLabel(rouge.extraLitersPerAdult)).toBe('OATA');
  });

  it('néritine : 40 L chacune, la première comprise (Aquarium Breeder)', () => {
    const neritine = capacityProfile('neritine');

    expect([1, 2, 3].map((n) => speciesNeedLiters(neritine, n))).toEqual([40, 80, 120]);
  });

  it('la source d’une approximation est dite telle quelle', () => {
    expect(sourceLabel(approx(1))).toBe('approximation de jeu');
    expect(sourceLabel(sourced(1, 'docs/SOINS.md § 3 (Holmes-Farley)'))).toBe(
      'documentation du projet (Holmes-Farley)',
    );
  });
});

describe('capacité du bac : besoin et occupation (#807)', () => {
  it('aucun animal, aucun besoin ; effectif non fini, négatif ou fractionnaire', () => {
    const p = profile();

    expect(speciesNeedLiters(p, 0)).toBe(0);
    expect(speciesNeedLiters(p, -3)).toBe(0);
    expect(speciesNeedLiters(p, Number.NaN)).toBe(0);
    expect(speciesNeedLiters(p, Number.POSITIVE_INFINITY)).toBe(0);
    expect(speciesNeedLiters(p, 2.9)).toBe(speciesNeedLiters(p, 2));
  });

  it('espèce sans longueur : aucun besoin par cm, seul le volume minimal compte', () => {
    expect(speciesNeedLiters(profile({ adultSizeCm: approx(0) }), 5)).toBe(0);
    expect(speciesNeedLiters(profile({ adultSizeCm: approx(Number.NaN) }), 5)).toBe(0);
  });

  it('occupation : bac vide à 0, plein à 1, sans eau infinie', () => {
    expect(occupation(100, 0)).toBe(0);
    expect(occupation(100, 100)).toBe(1);
    expect(occupation(0, 0)).toBe(0);
    expect(occupation(0, 10)).toBe(Number.POSITIVE_INFINITY);
    expect(occupation(Number.NaN, 10)).toBe(Number.POSITIVE_INFINITY);
  });

  it('capacité mixte : plusieurs espèces s’additionnent, occupation en %', () => {
    const population = [
      { species: 'neon' as const, count: 8 },
      { species: 'guppy' as const, count: 4 },
    ];

    const status = capacityStatus({ liters: 120, population });

    expect(populationNeedLiters(population)).toBe(8 * 4 * 1.5 + 4 * 5 * 1.5);
    expect(status.needLiters).toBe(78);
    expect(status.occupation).toBeCloseTo(0.65, 12);
    expect(status.over).toBe(false);
  });

  it('bac vide : besoin nul, occupation nulle, pas de dépassement', () => {
    expect(capacityStatus({ liters: 100, population: [] })).toEqual({
      needLiters: 0,
      milieuNeedLiters: 0,
      occupation: 0,
      over: false,
    });
  });

  it('population d’un monde : effectif de chaque espèce', () => {
    const world = createWorld(1, [
      { species: 'neon', count: 3 },
      { species: 'guppy', count: 2 },
    ]);

    expect(populationOf(world)).toEqual([
      { species: 'neon', count: 3 },
      { species: 'guppy', count: 2 },
    ]);
  });
});

describe('capacité du bac : verdict d’ajout (#807)', () => {
  it('volume minimal : refus sous le minimum, accord au minimum exact', () => {
    const below = canAdd({ liters: 53, population: [] }, 'rasbora');
    const exact = canAdd({ liters: 54, population: [] }, 'rasbora');

    expect(below.ok).toBe(false);
    expect(below.limit).toBe('volume-minimal');
    expect(below.reason).toBe(
      '53 L : un rasbora arlequin demande un bac d’au moins 54 L (Seriously Fish)',
    );
    expect(exact.ok).toBe(true);
    expect(exact.limit).toBe('aucune');
  });

  it('accorde le féminin dans la raison', () => {
    expect(canAdd({ liters: 10, population: [] }, 'kuhli').reason).toContain('une loche kuhli');
  });

  it('plafond 1,5 L/cm : le 10e néon entre dans 60 L, pas le 11e', () => {
    const nine = { liters: 60, population: [{ species: 'neon' as const, count: 9 }] };
    const ten = { liters: 60, population: [{ species: 'neon' as const, count: 10 }] };

    expect(canAdd(nine, 'neon').ok).toBe(true);
    expect(canAdd(nine, 'neon').occupation).toBe(1);
    expect(canAdd(ten, 'neon').ok).toBe(false);
    expect(canAdd(ten, 'neon').limit).toBe('capacite');
  });

  it('conseillé 2 L/cm : plus strict que le plafond', () => {
    const tank = { liters: 60, population: [{ species: 'neon' as const, count: 7 }] };

    expect(canAdd(tank, 'neon', 'plafond').ok).toBe(true);
    expect(canAdd(tank, 'neon', 'conseille').ok).toBe(false);
    expect(canAdd(tank, 'neon', 'conseille').reason).toContain('2 L par cm');
  });

  it('capacité mixte : les autres espèces occupent la place', () => {
    const tank = {
      liters: 60,
      population: [
        { species: 'guppy' as const, count: 7 },
        { species: 'neon' as const, count: 2 },
      ],
    };

    const verdict = canAdd(tank, 'neon');

    expect(verdict.ok).toBe(false);
    expect(verdict.occupation).toBeCloseTo((7 * 5 * 1.5 + 3 * 4 * 1.5) / 60, 12);
  });

  it('le décor, qui réduit le volume réel, peut faire refuser un animal', () => {
    const world = createDefaultWorld(1, 'tropical');
    const real = realWaterLiters(world);
    const count = Math.floor(real / 6);
    const population = [{ species: 'neon' as const, count }];

    expect(canAdd({ liters: real + 6, population }, 'neon').ok).toBe(true);
    expect(canAdd({ liters: real, population }, 'neon').ok).toBe(false);
  });

  it('bac sans eau : tout est refusé par le volume minimal', () => {
    for (const liters of [0, -5, Number.NaN]) {
      const verdict = canAdd({ liters, population: [] }, 'neon');

      expect(verdict.ok).toBe(false);
      expect(verdict.limit).toBe('volume-minimal');
      expect(verdict.occupation).toBe(Number.POSITIVE_INFINITY);
      expect(verdict.reason.startsWith('0 L : ')).toBe(true);
    }
  });

  it('accord : la raison dit la place et la règle', () => {
    const verdict = canAdd({ liters: 120, population: [] }, 'neon');

    expect(verdict.ok).toBe(true);
    expect(verdict.occupation).toBeCloseTo(6 / 120, 12);
    expect(verdict.reason).toBe(
      '120 L : place pour un néon de plus (5 % de la capacité) ; un néon adulte de 4 cm demande 6 L (1,5 L par cm) (RSPCA)',
    );
    expect(verdict.disagreement).toBeNull();
  });

  it('mode décor : aucune contrainte, l’occupation reste calculée', () => {
    const tank = {
      liters: 10,
      population: [{ species: 'rouge' as const, count: 5 }],
      mode: 'decor' as const,
    };

    const verdict = canAdd(tank, 'rouge');

    expect(verdict.ok).toBe(true);
    expect(verdict.limit).toBe('mode-decor');
    expect(verdict.occupation).toBeGreaterThan(1);
  });

  it('mode soins explicite : mêmes contraintes que sans mode', () => {
    const population = [{ species: 'rouge' as const, count: 1 }];

    expect(canAdd({ liters: 120, population, mode: 'soins' }, 'rouge')).toEqual(
      canAdd({ liters: 120, population }, 'rouge'),
    );
  });

  it('sauvegarde au-delà de la capacité : signalée, aucun animal retiré', () => {
    const world = createWorld(1, [{ species: 'rouge', count: 4 }]);
    const before = JSON.stringify(world);

    const status = capacityStatus({ liters: 120, population: populationOf(world) });

    expect(status.over).toBe(true);
    expect(status.needLiters).toBe(250);
    expect(JSON.stringify(world)).toBe(before);
    expect(world.entities).toHaveLength(4);
  });
});
