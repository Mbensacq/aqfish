import type { PopulationCounts } from '../../sim/population';
import { SPECIES } from '../../sim/species';
import type { CatalogEntry } from '../../sim/species-catalog';
import { INVERTEBRATES } from '../../sim/treatment';

/**
 * Vue de la catégorie « Population » (#723, `docs/INTERFACE.md` section 2) : filtres, tris
 * et résumé des tuiles d'espèce. Fonctions pures, lues par `population-section.ts` ; la
 * simulation n'est que lue (catalogue, effectifs, taille du corps).
 */

/** Filtre des tuiles : toutes, présentes dans le bac, poissons seuls, invertébrés seuls. */
export type PopulationFilter = 'toutes' | 'bac' | 'poissons' | 'invertebres';

/**
 * Tri des tuiles : ordre du milieu (celui du catalogue, par défaut), nom (A → Z), nombre dans
 * le bac (le plus nombreux d'abord), taille adulte (la plus grande d'abord).
 */
export type PopulationSort = 'milieu' | 'nom' | 'nombre' | 'taille';

/** Filtres proposés, dans l'ordre des boutons, avec leur intitulé. */
export const POPULATION_FILTERS: readonly {
  readonly id: PopulationFilter;
  readonly label: string;
}[] = [
  { id: 'toutes', label: 'Toutes' },
  { id: 'bac', label: 'Dans le bac' },
  { id: 'poissons', label: 'Poissons' },
  { id: 'invertebres', label: 'Invertébrés' },
];

/** Tris proposés, dans l'ordre de la liste, avec leur intitulé. */
export const POPULATION_SORTS: readonly { readonly id: PopulationSort; readonly label: string }[] =
  [
    { id: 'milieu', label: 'Ordre du milieu' },
    { id: 'nom', label: 'Nom' },
    { id: 'nombre', label: 'Nombre dans le bac' },
    { id: 'taille', label: 'Taille adulte' },
  ];

/**
 * Vrai si l'espèce est un poisson : ni invertébré (`sim/treatment.ts`), ni amphibien
 * (marcheur ou amphibie, comme `treatmentGroup`). Les amphibiens n'apparaissent que sous
 * « Toutes » et « Dans le bac ».
 */
function isFish(entry: CatalogEntry): boolean {
  const def = SPECIES[entry.species];
  return (
    !INVERTEBRATES.has(entry.species) && def.walker === undefined && def.amphibian === undefined
  );
}

/** Vrai si `entry` passe le filtre `filter` avec les effectifs `counts`. */
function passes(entry: CatalogEntry, filter: PopulationFilter, counts: PopulationCounts): boolean {
  switch (filter) {
    case 'bac':
      return counts[entry.species] > 0;
    case 'poissons':
      return isFish(entry);
    case 'invertebres':
      return INVERTEBRATES.has(entry.species);
    default:
      return true;
  }
}

/** Comparaison des noms affichés, en français (accents et casse ignorés pour l'ordre). */
const NAME_ORDER = new Intl.Collator('fr', { sensitivity: 'base' });

/** Comparateur du tri `sort` ; 0 laisse l'ordre du milieu (tri stable). */
function comparator(
  sort: PopulationSort,
  counts: PopulationCounts,
): (a: CatalogEntry, b: CatalogEntry) => number {
  switch (sort) {
    case 'nom':
      return (a, b) => NAME_ORDER.compare(a.name, b.name);
    case 'nombre':
      return (a, b) => counts[b.species] - counts[a.species];
    case 'taille':
      return (a, b) => SPECIES[b.species].bodyLength - SPECIES[a.species].bodyLength;
    default:
      return () => 0;
  }
}

/**
 * Tuiles à afficher : les espèces de `catalog` qui passent `filter`, rangées selon `sort`.
 * Les égalités gardent l'ordre du milieu (`Array.prototype.sort` est stable). Le catalogue
 * n'est pas modifié.
 */
export function populationTiles(
  catalog: readonly CatalogEntry[],
  counts: PopulationCounts,
  filter: PopulationFilter,
  sort: PopulationSort,
): readonly CatalogEntry[] {
  return catalog.filter((entry) => passes(entry, filter, counts)).sort(comparator(sort, counts));
}

/**
 * Résumé de la population : « 12 animaux, 3 espèces », au singulier pour 0 ou 1 (« 1 animal,
 * 1 espèce », « 0 animal, 0 espèce »). Seules comptent les espèces de `catalog` (celles du
 * milieu affiché) ; une espèce compte si elle a au moins un animal.
 */
export function populationSummary(
  catalog: readonly CatalogEntry[],
  counts: PopulationCounts,
): string {
  const present = catalog.filter((entry) => counts[entry.species] > 0);
  const animals = present.reduce((sum, entry) => sum + counts[entry.species], 0);
  const species = present.length;
  return `${animals} ${animals > 1 ? 'animaux' : 'animal'}, ${species} ${species > 1 ? 'espèces' : 'espèce'}`;
}
