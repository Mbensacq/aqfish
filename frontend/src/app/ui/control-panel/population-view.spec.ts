import { NO_FISH, type PopulationCounts } from '../../sim/population';
import { speciesCatalog } from '../../sim/species-catalog';
import { populationSummary, populationTiles } from './population-view';

const tropical = speciesCatalog('tropical');
const paludarium = speciesCatalog('paludarium');
const ids = (entries: readonly { species: string }[]) => entries.map((entry) => entry.species);

/** Effectifs du bac tropical de départ : 12 néons, 6 guppys, 6 corydoras. */
const START: PopulationCounts = { ...NO_FISH, neon: 12, guppy: 6, corydora: 6 };

describe('tuiles de la population : filtres (#723)', () => {
  it('« Toutes » : tout le catalogue, dans l’ordre du milieu, catalogue non modifié', () => {
    const before = ids(tropical);
    expect(ids(populationTiles(tropical, START, 'toutes', 'milieu'))).toEqual(before);
    expect(ids(tropical)).toEqual(before);
  });

  it('« Dans le bac » : les espèces d’au moins un animal ; bac vide : aucune', () => {
    expect(ids(populationTiles(tropical, START, 'bac', 'milieu'))).toEqual([
      'neon',
      'guppy',
      'corydora',
    ]);
    expect(populationTiles(tropical, NO_FISH, 'bac', 'milieu')).toEqual([]);
  });

  it('« Invertébrés » : crevette cerise et néritine ; « Poissons » : tout le reste', () => {
    expect(ids(populationTiles(tropical, START, 'invertebres', 'milieu'))).toEqual([
      'cerise',
      'neritine',
    ]);
    const fish = ids(populationTiles(tropical, START, 'poissons', 'milieu'));
    expect(fish).toHaveLength(tropical.length - 2);
    expect(fish).not.toContain('cerise');
  });

  it('paludarium : les amphibiens ne sont ni poissons ni invertébrés', () => {
    expect(populationTiles(paludarium, NO_FISH, 'poissons', 'milieu')).toEqual([]);
    expect(populationTiles(paludarium, NO_FISH, 'invertebres', 'milieu')).toEqual([]);
    expect(populationTiles(paludarium, NO_FISH, 'toutes', 'milieu')).toHaveLength(3);
  });

  it('catalogue vide : aucune tuile, quel que soit le filtre', () => {
    expect(populationTiles([], START, 'toutes', 'nom')).toEqual([]);
    expect(populationTiles([], START, 'bac', 'nombre')).toEqual([]);
  });
});

describe('tuiles de la population : tris (#723)', () => {
  it('par nom : ordre alphabétique français, accents ignorés (« Néon » entre « Molly » et « Néritine »)', () => {
    const names = populationTiles(tropical, START, 'toutes', 'nom').map((entry) => entry.name);
    expect(names[0]).toBe('Ancistrus commun');
    expect(names.indexOf('Néon')).toBeLessThan(names.indexOf('Néritine zèbre'));
    expect(names.indexOf('Molly')).toBeLessThan(names.indexOf('Néon'));
    expect(names.indexOf('Tétra braise')).toBeLessThan(names.indexOf('Tétra citron'));
    expect([...names].sort((a, b) => a.localeCompare(b, 'fr'))).toEqual(names);
  });

  it('par nombre : le plus nombreux d’abord, égalités dans l’ordre du milieu (stable)', () => {
    const sorted = ids(populationTiles(tropical, START, 'toutes', 'nombre'));
    // Guppys et corydoras à égalité (6) : ordre du milieu ; puis les absents, ordre du milieu.
    expect(sorted.slice(0, 3)).toEqual(['neon', 'guppy', 'corydora']);
    expect(sorted.slice(3)).toEqual(ids(tropical).slice(3));
    const reversed: PopulationCounts = { ...NO_FISH, corydora: 9, guppy: 1 };
    expect(ids(populationTiles(tropical, reversed, 'bac', 'nombre'))).toEqual([
      'corydora',
      'guppy',
    ]);
  });

  it('par taille adulte : la plus grande d’abord, égalités dans l’ordre du milieu', () => {
    const sorted = populationTiles(tropical, START, 'toutes', 'taille');
    expect(['molly', 'xipho']).toContain(sorted[0].species);
    // Molly et xipho (0,12 m) à égalité : molly vient avant dans le milieu.
    expect(ids(sorted).slice(0, 2)).toEqual(['molly', 'xipho']);
    expect(sorted[sorted.length - 1].species).toBe('otocinclus');
  });

  it('filtre puis tri : invertébrés par nom', () => {
    expect(ids(populationTiles(tropical, START, 'invertebres', 'nom'))).toEqual([
      'cerise',
      'neritine',
    ]);
  });
});

describe('résumé de la population (#723)', () => {
  it('« 24 animaux, 3 espèces » pour le bac de départ', () => {
    expect(populationSummary(tropical, START)).toBe('24 animaux, 3 espèces');
  });

  it('singulier pour 0 et 1', () => {
    expect(populationSummary(tropical, NO_FISH)).toBe('0 animal, 0 espèce');
    expect(populationSummary(tropical, { ...NO_FISH, neon: 1 })).toBe('1 animal, 1 espèce');
    expect(populationSummary(tropical, { ...NO_FISH, neon: 2 })).toBe('2 animaux, 1 espèce');
  });

  it('seules comptent les espèces du milieu affiché', () => {
    const counts: PopulationCounts = { ...NO_FISH, neon: 5, koi: 7 };
    expect(populationSummary(tropical, counts)).toBe('5 animaux, 1 espèce');
    expect(populationSummary([], counts)).toBe('0 animal, 0 espèce');
  });
});
