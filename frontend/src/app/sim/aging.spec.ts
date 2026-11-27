import { describe, expect, it } from 'vitest';

import {
  ADULT_MAX_SHARE,
  ADULT_MIN_SHARE,
  adultBornAt,
  ageSeconds,
  averageLifespanYears,
  birthTime,
  DECLINE_SHARE,
  diesOfOldAge,
  initialAgeSeconds,
  isBirthTime,
  lifespanSeconds,
  oldAgeRate,
  OLD_AGE_RATE,
  vitality,
  YEAR_SECONDS,
} from './aging';
import { DEFAULT_DAY_LENGTH_SECONDS } from './daylight';
import { SPECIES, type SpeciesId } from './species';
import { speciesSheet } from './species-sheet';

const ALL = Object.keys(SPECIES) as SpeciesId[];

describe('durée de vie des espèces (#857)', () => {
  it('chaque espèce a une durée de vie moyenne finie, avec source ou approximation de jeu', () => {
    for (const id of ALL) {
      const years = averageLifespanYears(id);
      expect(Number.isFinite(years) && years >= 1, id).toBe(true);
      expect(['source', 'approximation'], id).toContain(speciesSheet(id).lifespan.status.kind);
    }
  });

  it('la moyenne est le milieu de la plage de la fiche, en secondes de jeu', () => {
    expect(averageLifespanYears('neon')).toBe(4);
    expect(lifespanSeconds('neon')).toBe(4 * 365 * DEFAULT_DAY_LENGTH_SECONDS);
    expect(YEAR_SECONDS).toBe(365 * DEFAULT_DAY_LENGTH_SECONDS);
  });
});

describe('âge initial tiré de la graine', () => {
  it('reste un âge adulte, dans la part prévue de la durée de vie', () => {
    for (const id of ALL) {
      for (const seed of [0, 42, 0xffffffff]) {
        for (const fishId of [0, 1, 17, 0xffffffff]) {
          const share = initialAgeSeconds(seed, fishId, id) / lifespanSeconds(id);
          expect(share, `${id} ${seed} ${fishId}`).toBeGreaterThanOrEqual(ADULT_MIN_SHARE);
          expect(share, `${id} ${seed} ${fishId}`).toBeLessThan(ADULT_MAX_SHARE);
        }
      }
    }
  });

  it('est déterministe et varie avec la graine et l’identifiant', () => {
    expect(initialAgeSeconds(42, 3, 'guppy')).toBe(initialAgeSeconds(42, 3, 'guppy'));
    expect(initialAgeSeconds(42, 3, 'guppy')).not.toBe(initialAgeSeconds(43, 3, 'guppy'));
    expect(initialAgeSeconds(42, 3, 'guppy')).not.toBe(initialAgeSeconds(42, 4, 'guppy'));
  });

  it('sans naissance enregistrée (monde neuf, ancienne sauvegarde), l’animal est né avant 0', () => {
    const animal = { id: 5, species: 'neon' as const };
    expect(birthTime(animal, 42)).toBe(-initialAgeSeconds(42, 5, 'neon'));
    expect(ageSeconds(animal, 42, 0)).toBe(initialAgeSeconds(42, 5, 'neon'));
    expect(ageSeconds(animal, 42, 1200)).toBe(initialAgeSeconds(42, 5, 'neon') + 1200);
  });

  it('une naissance enregistrée prime, et l’âge n’est jamais négatif', () => {
    expect(ageSeconds({ id: 1, species: 'guppy', bornAt: 100 }, 42, 400)).toBe(300);
    expect(ageSeconds({ id: 1, species: 'guppy', bornAt: 500 }, 42, 400)).toBe(0);
  });

  it('un adulte ajouté au temps 0 n’écrit aucune naissance, plus tard il part de l’heure d’ajout', () => {
    expect(adultBornAt(42, 9, 'koi', 0)).toBeUndefined();
    const bornAt = adultBornAt(42, 9, 'koi', 5000)!;
    expect(ageSeconds({ id: 9, species: 'koi', bornAt }, 42, 5000)).toBeCloseTo(
      initialAgeSeconds(42, 9, 'koi'),
      6,
    );
  });
});

describe('vitalité et mort de vieillesse', () => {
  const lifespan = lifespanSeconds('cerise');

  it('vitalité pleine jusqu’à la durée de vie comprise, puis baisse linéaire jusqu’à 0', () => {
    expect(vitality('cerise', 0)).toBe(1);
    expect(vitality('cerise', lifespan)).toBe(1);
    expect(vitality('cerise', lifespan + 1)).toBeLessThan(1);
    expect(vitality('cerise', lifespan * (1 + DECLINE_SHARE / 2))).toBeCloseTo(0.5, 12);
    expect(vitality('cerise', lifespan * (1 + DECLINE_SHARE))).toBe(0);
    expect(vitality('cerise', lifespan * 10)).toBe(0);
  });

  it('un âge non fini ne fait pas décliner (état corrompu)', () => {
    expect(vitality('cerise', Number.NaN)).toBe(1);
    expect(vitality('cerise', Number.POSITIVE_INFINITY)).toBe(1);
  });

  it('aucun risque juste avant la durée de vie, un risque juste après', () => {
    expect(oldAgeRate('cerise', lifespan)).toBe(0);
    expect(oldAgeRate('cerise', lifespan + 60)).toBeGreaterThan(0);
    expect(oldAgeRate('cerise', lifespan * 2)).toBe(OLD_AGE_RATE);
  });

  it('un animal jeune ne meurt jamais de vieillesse, quel que soit le pas', () => {
    const young = { id: 1, species: 'cerise' as const, bornAt: 0 };
    for (let tick = 0; tick < 2000; tick++) {
      expect(diesOfOldAge(young, { seed: 42, tick, time: lifespan }, 1 / 60)).toBe(false);
    }
  });

  it('un animal en fin de déclin finit par mourir, de façon reproductible', () => {
    const old = { id: 1, species: 'cerise' as const, bornAt: -2 * lifespan };
    const clock = (tick: number) => ({ seed: 42, tick, time: 0 });
    let first = -1;
    for (let tick = 0; tick < 100_000 && first < 0; tick++) {
      if (diesOfOldAge(old, clock(tick), 1)) {
        first = tick;
      }
    }
    expect(first).toBeGreaterThanOrEqual(0);
    expect(diesOfOldAge(old, clock(first), 1)).toBe(true);
  });

  it('pas nul ou négatif : aucun décès', () => {
    const old = { id: 1, species: 'cerise' as const, bornAt: -2 * lifespan };
    expect(diesOfOldAge(old, { seed: 1, tick: 0, time: 0 }, 0)).toBe(false);
    expect(diesOfOldAge(old, { seed: 1, tick: 0, time: 0 }, -1)).toBe(false);
  });

  it('naissance relue : nombre fini seulement', () => {
    expect(isBirthTime(-12.5)).toBe(true);
    expect(isBirthTime(Number.NaN)).toBe(false);
    expect(isBirthTime('0')).toBe(false);
  });
});
