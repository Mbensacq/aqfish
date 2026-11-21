import type { SpeciesId } from '../../sim/species';
import type {
  SettingsCategory,
  SettingsCategoryId,
  SettingsSectionKey,
} from './settings-categories';

/**
 * Index de la recherche des réglages (#723, `docs/INTERFACE.md` section 2) : construit à
 * partir de la déclaration des catégories (`settings-categories.ts`, seule source) et des
 * espèces du milieu affiché. Module pur, sans DOM.
 */

/** Espèce cherchable : identifiant, nom courant et nom scientifique. */
export interface SearchableSpecies {
  readonly species: SpeciesId;
  readonly name: string;
  readonly scientificName: string;
}

/** Un résultat de recherche : un réglage déclaré, ou la tuile d'une espèce. */
export interface SettingsSearchResult {
  readonly kind: 'reglage' | 'espece';
  /** Nom affiché (nom du réglage, ou nom courant de l'espèce). */
  readonly name: string;
  /** Explication (celle du réglage, ou le nom scientifique de l'espèce). */
  readonly explanation: string;
  readonly category: SettingsCategoryId;
  readonly categoryTitle: string;
  /** Section qui porte le réglage, montrée dans les résultats pour le régler sur place. */
  readonly section: SettingsSectionKey;
  /** Espèce de la tuile (résultat `espece`), sinon `null`. */
  readonly species: SpeciesId | null;
}

/** Entrée de l'index : le résultat et ses textes déjà normalisés. */
interface IndexEntry {
  readonly result: SettingsSearchResult;
  readonly name: string;
  readonly words: readonly string[];
  readonly explanation: string;
}

/** Index construit une fois par milieu (`buildSettingsIndex`). */
export interface SettingsIndex {
  readonly entries: readonly IndexEntry[];
}

/**
 * Texte normalisé pour la recherche : minuscules, sans diacritiques (NFD puis retrait des
 * marques combinantes), espaces réduits. « Éclairage » et « eclairage » donnent le même texte ;
 * les apostrophes typographiques deviennent droites.
 */
export function normalizeSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’‘]/g, "'")
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function entry(result: SettingsSearchResult, words: readonly string[]): IndexEntry {
  return {
    result,
    name: normalizeSearch(result.name),
    words: words.map(normalizeSearch),
    explanation: normalizeSearch(result.explanation),
  };
}

/**
 * Index des réglages de `categories` (dans leur ordre), puis des espèces `species` (rangées
 * dans la catégorie « Population », trouvées par leur nom courant et scientifique).
 */
export function buildSettingsIndex(
  categories: readonly SettingsCategory[],
  species: readonly SearchableSpecies[],
): SettingsIndex {
  const settings = categories.flatMap((category) =>
    category.controls.map((control) =>
      entry(
        {
          kind: 'reglage',
          name: control.name,
          explanation: control.explanation,
          category: category.id,
          categoryTitle: category.title,
          section: control.section,
          species: null,
        },
        control.synonyms,
      ),
    ),
  );
  const population = categories.find((category) => category.id === 'population');
  const animals =
    population === undefined
      ? []
      : species.map((animal) =>
          entry(
            {
              kind: 'espece',
              name: animal.name,
              explanation: animal.scientificName,
              category: population.id,
              categoryTitle: population.title,
              section: 'population',
              species: animal.species,
            },
            [animal.scientificName],
          ),
        );
  return { entries: [...settings, ...animals] };
}

/** Vrai si un mot de `text` (séparé par une espace, une apostrophe ou un tiret) commence par `query`. */
function hasWordStarting(text: string, query: string): boolean {
  return text.startsWith(query) || text.split(/[\s'-]+/).some((word) => word.startsWith(query));
}

/**
 * Vrai si `query` apparaît dans `text` au début d'un mot (début du texte, ou après un caractère
 * qui n'est ni une lettre ni un chiffre) : « lum » est trouvé dans « (lumière) », pas dans
 * « volume » ; une requête de plusieurs mots (« d'eau ») aussi (#764).
 */
function startsAtWord(text: string, query: string): boolean {
  for (let at = text.indexOf(query); at >= 0; at = text.indexOf(query, at + 1)) {
    if (at === 0 || !/[\p{L}\p{N}]/u.test(text[at - 1])) {
      return true;
    }
  }
  return false;
}

/**
 * Rang d'une entrée pour `query` (plus petit = mieux), `null` si elle ne correspond pas :
 * 0 nom qui commence par la requête, 1 mot du nom qui commence par elle, 2 mot voisin (ou nom
 * scientifique) dont un mot commence par elle, 3 nom qui la contient, 4 mot voisin qui la
 * contient, 5 explication dont un mot commence par elle (#764 : « lum » ne trouve pas la fiche
 * de l'espèce par « volume »). « lum » trouve donc l'éclairage (« lumière ») avant le volume.
 */
function rank(item: IndexEntry, query: string): number | null {
  const checks: readonly boolean[] = [
    item.name.startsWith(query),
    hasWordStarting(item.name, query),
    item.words.some((word) => hasWordStarting(word, query)),
    item.name.includes(query),
    item.words.some((word) => word.includes(query)),
    startsAtWord(item.explanation, query),
  ];
  const found = checks.indexOf(true);
  return found < 0 ? null : found;
}

/**
 * Résultats de `query` dans `index` : casse et accents ignorés ; rangés par pertinence
 * (`rank`), puis dans l'ordre de la déclaration (tri stable). Requête vide ou blanche : aucun
 * résultat.
 */
export function searchSettings(index: SettingsIndex, query: string): SettingsSearchResult[] {
  const needle = normalizeSearch(query);
  if (needle === '') {
    return [];
  }
  return index.entries
    .map((item) => ({ item, rank: rank(item, needle) }))
    .filter((match): match is { item: IndexEntry; rank: number } => match.rank !== null)
    .sort((a, b) => a.rank - b.rank)
    .map((match) => match.item.result);
}

/** Ce que le contenu de la fenêtre montre pendant une recherche (#723). */
export interface SearchDisplay {
  /** Sections qui portent les résultats, à montrer sous la liste. */
  readonly sections: ReadonlySet<SettingsSectionKey>;
  /** Noms des réglages trouvés : seuls leurs contrôles restent visibles dans ces sections (#764). */
  readonly settings: ReadonlySet<string>;
  /**
   * Tuiles de « Population » à garder : les espèces trouvées, ou `null` pour toutes (un
   * réglage de la population est lui-même trouvé, ou aucune espèce ne l'est).
   */
  readonly species: readonly SpeciesId[] | null;
}

/** Sections, réglages et tuiles à montrer pour `results` (aucun résultat : aucune section). */
export function searchDisplay(results: readonly SettingsSearchResult[]): SearchDisplay {
  const sections = new Set(results.map((result) => result.section));
  const settingInPopulation = results.some(
    (result) => result.kind === 'reglage' && result.section === 'population',
  );
  const species = results.flatMap((result) => (result.species === null ? [] : [result.species]));
  const settings = new Set(
    results.flatMap((result) => (result.kind === 'reglage' ? [result.name] : [])),
  );
  return {
    sections,
    settings,
    species: settingInPopulation || species.length === 0 ? null : species,
  };
}
