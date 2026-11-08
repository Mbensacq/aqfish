import { describe, expect, it } from 'vitest';

import {
  alertAnimalsText,
  alertTargets,
  NO_ALERT_TARGETS,
  sameAlertTargets,
  targetOfAlert,
  TARGETED_ALERTS,
  type AlertAnimal,
  type AlertAnimalsContext,
} from './alert-animals';
import { speciesSheet } from './species-sheet';
import { SPECIES_PH } from './water-ph';
import type { SpeciesId } from './species';

const CALM: AlertAnimalsContext = {
  temperature: 24,
  ph: 6.8,
  mixes: [],
};

function animal(id: number, species: SpeciesId, extra: Partial<AlertAnimal> = {}): AlertAnimal {
  return { id, species, hunger: 0, health: 1, ...extra };
}

describe('alertTargets (#483)', () => {
  it('bac vide : aucun animal désigné', () => {
    expect(alertTargets([], { ...CALM, temperature: Number.NaN })).toBe(NO_ALERT_TARGETS);
  });

  it('eau saine, animaux en forme : aucune désignation', () => {
    const targets = alertTargets([animal(1, 'neon'), animal(2, 'neon')], CALM);
    for (const id of TARGETED_ALERTS) {
      expect(targets[id].ids, id).toEqual([]);
    }
  });

  it('santé : malades sans signe de maladie, seuil compris', () => {
    const targets = alertTargets(
      [
        animal(1, 'neon', { health: 0.8 }),
        animal(2, 'neon', { health: 0.81 }),
        animal(3, 'neon', { health: 0.5, ich: 900 }),
        animal(4, 'neon', { health: Number.NaN }),
      ],
      CALM,
    );
    expect(targets.health.ids).toEqual([1]);
    expect(targets.ich.ids).toEqual([3]);
  });

  it('faim : les affamés seuls s’il y en a, sinon ceux qui ont faim', () => {
    const hungry = [animal(1, 'neon', { hunger: 0.7 }), animal(2, 'neon', { hunger: 0.69 })];
    expect(alertTargets(hungry, CALM).hunger.ids).toEqual([1]);
    expect(alertTargets([...hungry, animal(3, 'neon', { hunger: 1 })], CALM).hunger.ids).toEqual([
      3,
    ]);
  });

  it('température : seules les espèces hors de leur plage tolérée', () => {
    const { max } = speciesSheet('neon').temperatureTolerated.value;
    const guppyMax = speciesSheet('guppy').temperatureTolerated.value.max;
    expect(guppyMax).toBeGreaterThan(max);
    const animals = [animal(1, 'neon'), animal(2, 'guppy')];
    const context = { ...CALM, temperature: max + 0.5 };
    const target = alertTargets(animals, context).temperature;
    expect(target.ids).toEqual([1]);
    expect(target.groups).toEqual([{ species: 'neon', count: 1 }]);
    // Bornes comprises : à la limite, l'espèce tolère encore.
    expect(alertTargets(animals, { ...CALM, temperature: max }).temperature.ids).toEqual([]);
  });

  it('pH : hors plage tolérée d’abord, sinon hors plage idéale', () => {
    const { tolerated, ideal } = SPECIES_PH.neon;
    const animals = [animal(1, 'neon')];
    expect(alertTargets(animals, { ...CALM, ph: tolerated.max + 0.1 }).ph.ids).toEqual([1]);
    expect(alertTargets(animals, { ...CALM, ph: (ideal.min + ideal.max) / 2 }).ph.ids).toEqual([]);
    if (ideal.max < tolerated.max) {
      expect(alertTargets(animals, { ...CALM, ph: tolerated.max }).ph.ids).toEqual([1]);
    }
  });

  it('valeurs non finies : tous les animaux, jamais rassurant', () => {
    const animals = [animal(1, 'neon'), animal(2, 'guppy')];
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY]) {
      const targets = alertTargets(animals, { ...CALM, temperature: value, ph: value });
      expect(targets.temperature.ids).toEqual([1, 2]);
      expect(targets.ph.ids).toEqual([1, 2]);
    }
  });

  it('mélange : les deux espèces nommées, pas les autres', () => {
    const targets = alertTargets(
      [animal(1, 'axolotl'), animal(2, 'grenouille'), animal(3, 'neon')],
      {
        ...CALM,
        mixes: [{ first: 'axolotl', second: 'grenouille', reason: 'predateur' }],
      } as AlertAnimalsContext,
    );
    expect(targets.mix.ids).toEqual([1, 2]);
  });

  it('toutes les espèces touchées : groupes du plus nombreux au moins nombreux', () => {
    const target = alertTargets(
      [
        animal(5, 'guppy', { health: 0.2 }),
        animal(1, 'neon', { health: 0.2 }),
        animal(2, 'neon', { health: 0.2 }),
      ],
      CALM,
    ).health;
    expect(target.ids).toEqual([1, 2, 5]);
    expect(target.groups).toEqual([
      { species: 'neon', count: 2 },
      { species: 'guppy', count: 1 },
    ]);
  });
});

describe('targetOfAlert (#483)', () => {
  it('rend la liste des alertes ciblées, null pour les autres', () => {
    expect(targetOfAlert(NO_ALERT_TARGETS, 'ph')).toBe(NO_ALERT_TARGETS.ph);
    expect(targetOfAlert(NO_ALERT_TARGETS, 'ammonia')).toBeNull();
    expect(targetOfAlert(NO_ALERT_TARGETS, 'treatment')).toBeNull();
  });
});

describe('alertAnimalsText (#483)', () => {
  it('nomme les espèces et leur nombre, singulier et pluriel', () => {
    expect(
      alertAnimalsText([
        { species: 'neon', count: 3 },
        { species: 'corydora', count: 1 },
      ]),
    ).toBe('3 néons, 1 corydora');
  });

  it('liste vide : le dit', () => {
    expect(alertAnimalsText([])).toBe('aucun pour l’instant');
  });
});

describe('sameAlertTargets (#483)', () => {
  it('compare les identifiants de chaque alerte', () => {
    const one = alertTargets([animal(1, 'neon', { health: 0.2 })], CALM);
    const same = alertTargets([animal(1, 'neon', { health: 0.3 })], CALM);
    const other = alertTargets([animal(2, 'neon', { health: 0.2 })], CALM);
    expect(sameAlertTargets(one, same)).toBe(true);
    expect(sameAlertTargets(one, other)).toBe(false);
    expect(sameAlertTargets(one, NO_ALERT_TARGETS)).toBe(false);
  });
});
