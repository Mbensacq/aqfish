import { describe, expect, it } from 'vitest';

import { environmentById } from './environment';
import { NO_FISH, type PopulationCounts } from './population';
import {
  possibleSpecies,
  type PossibleSpecies,
  type PossibleSpeciesTank,
} from './possible-species';
import { LEVEL_LABELS, possibleReasonText, possibleSpeciesCartel } from './possible-species-text';
import type { SpeciesId } from './species';
import { capacityLimits } from './tank-capacity-limits';
import type { PopulationEntry } from './world-types';

/** Bornes techniques uniformes, pour isoler la capacité et les verdicts. */
function bounds(value: number): PopulationCounts {
  return Object.fromEntries(Object.keys(NO_FISH).map((id) => [id, value])) as Record<
    SpeciesId,
    number
  >;
}

const TROPICAL = environmentById('tropical').species;

function tank(overrides: Partial<PossibleSpeciesTank> = {}): PossibleSpeciesTank {
  return { liters: 300, population: [], species: TROPICAL, bounds: bounds(30), ...overrides };
}

function entry(list: readonly PossibleSpecies[], id: SpeciesId): PossibleSpecies {
  const found = list.find((e) => e.species === id);
  if (!found) {
    throw new Error(`absente : ${id}`);
  }
  return found;
}

describe('espèces encore possibles (#818)', () => {
  it('bac vide : toutes les espèces du milieu sont compatibles et ont de la place', () => {
    const list = possibleSpecies(tank());

    expect(list.map((e) => e.species).sort()).toEqual([...TROPICAL].sort());
    for (const e of list) {
      expect(e.level).toBe('compatible');
      expect(e.reasons).toEqual([]);
      expect(e.remaining).toBeGreaterThan(0);
    }
  });

  it('bac vide : l’ordre du catalogue est gardé quand tout est compatible', () => {
    expect(possibleSpecies(tank()).map((e) => e.species)).toEqual(TROPICAL);
  });

  it('bac avec un poisson rouge : le néon est incompatible par la température', () => {
    const list = possibleSpecies(
      tank({ species: ['neon', 'rouge'], population: [{ species: 'rouge', count: 1 }] }),
    );

    const neon = entry(list, 'neon');
    expect(neon.level).toBe('incompatible');
    expect(neon.reasons).toContainEqual(
      expect.objectContaining({
        kind: 'verdict',
        against: 'rouge',
        reason: expect.objectContaining({ axis: 'eau', cause: 'classe-thermique' }),
      }),
    );
    // Le poisson rouge face à lui-même : aucune raison.
    expect(entry(list, 'rouge').reasons.filter((r) => r.kind === 'verdict')).toEqual([]);
  });

  it('crevette cerise face à un poisson rouge : prédation (mange les adultes)', () => {
    const list = possibleSpecies(
      tank({ species: ['cerise'], population: [{ species: 'rouge', count: 1 }] }),
    );

    const cerise = entry(list, 'cerise');
    expect(cerise.level).toBe('incompatible');
    expect(cerise.reasons).toContainEqual(
      expect.objectContaining({
        against: 'rouge',
        reason: expect.objectContaining({ axis: 'predation', actor: 'rouge' }),
      }),
    );
  });

  it('un prédateur ajouté dégrade sa proie : le xipho met la crevette cerise en précautions', () => {
    const before = entry(
      possibleSpecies(tank({ population: [{ species: 'neon', count: 6 }] })),
      'cerise',
    );
    const after = entry(
      possibleSpecies(
        tank({
          population: [
            { species: 'neon', count: 6 },
            { species: 'xipho', count: 1 },
          ],
        }),
      ),
      'cerise',
    );

    expect(before.level).toBe('compatible');
    expect(after.level).toBe('precautions');
    expect(after.reasons).toContainEqual(
      expect.objectContaining({
        against: 'xipho',
        reason: expect.objectContaining({ cause: 'mange-jeunes', actor: 'xipho' }),
      }),
    );
  });

  it('liste triée : compatibles, puis précautions, puis incompatibles', () => {
    const list = possibleSpecies(
      tank({
        species: ['neon', 'cerise', 'rouge', 'guppy'],
        population: [{ species: 'xipho', count: 1 }],
      }),
    );

    const ranks = list.map((e) => ['compatible', 'precautions', 'incompatible'].indexOf(e.level));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(list.at(-1)?.species).toBe('rouge');
    expect(entry(list, 'cerise').level).toBe('precautions');
  });

  it('bac plein : nombre restant 0 avec la raison « capacité », incompatible', () => {
    const population: PopulationEntry[] = [{ species: 'rouge', count: 1 }];
    const list = possibleSpecies(tank({ liters: 120, species: ['rouge'], population }));

    const rouge = entry(list, 'rouge');
    expect(rouge.remaining).toBe(0);
    expect(rouge.level).toBe('incompatible');
    expect(rouge.reasons).toEqual([{ kind: 'capacite', text: expect.stringContaining('OATA') }]);
  });

  it('borne atteinte sans refus de capacité : raison « capacité » sans texte', () => {
    const list = possibleSpecies(
      tank({ species: ['neon'], population: [{ species: 'neon', count: 2 }], bounds: bounds(2) }),
    );

    expect(entry(list, 'neon').remaining).toBe(0);
    expect(entry(list, 'neon').reasons).toEqual([{ kind: 'capacite', text: null }]);
  });

  it('nombre restant : effectif maximal de la capacité moins l’effectif actuel', () => {
    const t = tank({ liters: 60, population: [{ species: 'neon', count: 4 }] });
    const { limits } = capacityLimits(t, t.species, t.bounds);

    expect(entry(possibleSpecies(t), 'neon').remaining).toBe(limits.neon - 4);
  });

  it('bac déjà au-delà de sa capacité : rien n’est retiré, la place restante est 0', () => {
    const population: PopulationEntry[] = [{ species: 'rouge', count: 5 }];
    const t = tank({ liters: 120, species: ['rouge'], population });

    expect(entry(possibleSpecies(t), 'rouge').remaining).toBe(0);
    expect(t.population).toEqual([{ species: 'rouge', count: 5 }]);
  });

  it('mode décor : ni verdict ni capacité, tout est compatible dans la limite des bornes', () => {
    const list = possibleSpecies(
      tank({
        mode: 'decor',
        liters: 10,
        species: ['neon', 'rouge'],
        population: [{ species: 'rouge', count: 3 }],
      }),
    );

    expect(list.map((e) => [e.species, e.level, e.remaining])).toEqual([
      ['neon', 'compatible', 30],
      ['rouge', 'compatible', 27],
    ]);
  });

  it('effectifs nuls, négatifs ou non finis : l’espèce ne compte pas comme présente', () => {
    const list = possibleSpecies(
      tank({
        species: ['neon'],
        population: [
          { species: 'rouge', count: 0 },
          { species: 'koi', count: -2 },
          { species: 'axolotl', count: Number.NaN },
        ],
      }),
    );

    expect(entry(list, 'neon').level).toBe('compatible');
  });

  it('bac sans eau : plus aucune place, avec la raison du volume minimal', () => {
    const list = possibleSpecies(tank({ liters: 0, species: ['neon'] }));

    expect(entry(list, 'neon').remaining).toBe(0);
    expect(entry(list, 'neon').reasons[0]).toEqual({
      kind: 'capacite',
      text: expect.stringContaining('au moins'),
    });
  });

  it('milieu sans espèce : liste vide', () => {
    expect(possibleSpecies(tank({ species: [] }))).toEqual([]);
  });

  it('capacité déjà calculée par l’appelant : même résultat', () => {
    const t = tank({ liters: 80, population: [{ species: 'neon', count: 10 }] });

    expect(possibleSpecies(t, capacityLimits(t, t.species, t.bounds))).toEqual(possibleSpecies(t));
  });

  it('espèce inconnue : RangeError du verdict', () => {
    const t = tank({
      species: ['inconnue' as SpeciesId],
      population: [{ species: 'neon', count: 1 }],
    });

    expect(() => possibleSpecies(t)).toThrow(RangeError);
  });
});

describe('cartel des espèces encore possibles (#818)', () => {
  it('intitulés des trois niveaux', () => {
    expect(LEVEL_LABELS).toEqual({
      compatible: 'Compatible',
      precautions: 'Avec précautions',
      incompatible: 'Incompatible',
    });
  });

  it('espèce compatible : nom, nom scientifique et place restante', () => {
    const cartel = possibleSpeciesCartel({
      species: 'neon',
      level: 'compatible',
      remaining: 12,
      reasons: [],
    });

    expect(cartel).toEqual({
      species: 'neon',
      level: 'compatible',
      name: 'Néon',
      scientificName: 'Paracheirodon innesi',
      summary: 'Compatible · encore 12',
      reasons: [],
    });
  });

  it('raison de l’eau : espèce présente nommée, approximation de jeu', () => {
    const [neon] = possibleSpecies(
      tank({ species: ['neon'], population: [{ species: 'rouge', count: 1 }] }),
    );

    expect(possibleSpeciesCartel(neon).reasons).toContain(
      'Avec les poissons rouges : eau froide et eau tropicale (incompatible) — approximation de jeu',
    );
  });

  it('prédation par l’espèce proposée : la proie présente est nommée en tête', () => {
    const [xipho] = possibleSpecies(
      tank({ species: ['xipho'], population: [{ species: 'cerise', count: 6 }] }),
    );

    expect(possibleSpeciesCartel(xipho).reasons).toEqual([
      'Avec les crevettes cerises : xipho mange les jeunes (précautions) — FishKeeper',
    ]);
  });

  it('prédation : l’espèce qui mange est nommée, avec sa source', () => {
    const [cerise] = possibleSpecies(
      tank({ species: ['cerise'], population: [{ species: 'xipho', count: 1 }] }),
    );

    expect(possibleSpeciesCartel(cerise).reasons).toEqual([
      'Avec les xiphos : xipho mange les jeunes (précautions) — FishKeeper',
    ]);
  });

  it('plus de place : « plus de place » et la raison de capacité, ou la borne', () => {
    expect(possibleReasonText({ kind: 'capacite', text: 'Bac plein (OATA)' })).toBe(
      'Bac plein (OATA)',
    );
    expect(possibleReasonText({ kind: 'capacite', text: null })).toBe(
      'Effectif maximal atteint pour ce bac',
    );
    expect(
      possibleSpeciesCartel({
        species: 'rouge',
        level: 'incompatible',
        remaining: 0,
        reasons: [{ kind: 'capacite', text: null }],
      }).summary,
    ).toBe('Incompatible · plus de place');
  });
});
