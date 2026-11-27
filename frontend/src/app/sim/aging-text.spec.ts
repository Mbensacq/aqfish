import { describe, expect, it } from 'vitest';

import { lifespanSeconds, YEAR_SECONDS } from './aging';
import { AGE_STATUS, ageDays, ageRows, ageText, lifespanText, speciesAges } from './aging-text';
import { DEFAULT_DAY_LENGTH_SECONDS } from './daylight';
import { createWorld } from './world';

const DAY = DEFAULT_DAY_LENGTH_SECONDS;

describe('textes de l’âge (#857)', () => {
  it('jours entiers vécus, 0 pour un âge négatif ou non fini', () => {
    expect(ageDays(0)).toBe(0);
    expect(ageDays(DAY - 1)).toBe(0);
    expect(ageDays(DAY)).toBe(1);
    expect(ageDays(-5)).toBe(0);
    expect(ageDays(Number.NaN)).toBe(0);
    expect(ageDays(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('âge en ans et jours de jeu, accordé', () => {
    expect(ageText(10)).toBe('moins d’un jour');
    expect(ageText(DAY)).toBe('1 jour');
    expect(ageText(12 * DAY)).toBe('12 jours');
    expect(ageText(YEAR_SECONDS)).toBe('1 an');
    expect(ageText(2 * YEAR_SECONDS + 3 * DAY)).toBe('2 ans et 3 jours');
    expect(ageText(YEAR_SECONDS + DAY)).toBe('1 an et 1 jour');
  });

  it('durée de vie moyenne à la française', () => {
    expect(lifespanText('neon')).toBe('4 ans');
    expect(lifespanText('cerise')).toBe('1,5 an');
  });
});

describe('lignes de la fiche', () => {
  it('sans animal de l’espèce : seulement la durée de vie moyenne, avec son statut', () => {
    expect(ageRows('neon', undefined)).toEqual([
      {
        field: 'averageLifespan',
        label: 'Durée de vie moyenne',
        value: '4 ans',
        status: 'Approximation de jeu',
      },
    ]);
  });

  it('un seul âge affiché si le plus jeune et le plus âgé ont le même nombre de jours', () => {
    const [age] = ageRows('neon', { youngest: 3 * DAY, oldest: 3 * DAY + 10 });
    expect(age).toEqual({
      field: 'age',
      label: 'Âge dans le bac',
      value: '3 jours',
      status: AGE_STATUS,
    });
  });

  it('du plus jeune au plus âgé, et la fin de vie signalée sans alarme', () => {
    const young = ageRows('neon', { youngest: DAY, oldest: YEAR_SECONDS })[0]!;
    expect(young.value).toBe('de 1 jour à 1 an');
    const old = ageRows('neon', { youngest: DAY, oldest: lifespanSeconds('neon') + DAY })[0]!;
    expect(old.value).toBe('de 1 jour à 4 ans et 1 jour (le plus âgé est en fin de vie)');
    const limit = ageRows('neon', { youngest: DAY, oldest: lifespanSeconds('neon') })[0]!;
    expect(limit.value).toBe('de 1 jour à 4 ans');
  });
});

describe('relevé des âges du bac', () => {
  it('âges extrêmes par espèce présente, aucune entrée pour une espèce absente', () => {
    const world = createWorld(42, [
      { species: 'neon', count: 4 },
      { species: 'guppy', count: 1 },
    ]);
    const ages = speciesAges(world);
    expect(Object.keys(ages).sort()).toEqual(['guppy', 'neon']);
    expect(ages.neon!.youngest).toBeLessThanOrEqual(ages.neon!.oldest);
    expect(ages.guppy!.youngest).toBe(ages.guppy!.oldest);
    expect(speciesAges({ ...world, entities: [] })).toEqual({});
  });
});
