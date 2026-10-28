import { environmentById, type EnvironmentId } from './environment';
import { SPECIES_LABELS } from './species-catalog';
import { cohabitation, COHABITATION_STATUS, feedingRows, type CareRow } from './species-care';
import { sheetNotes, sheetRows, type SheetRow } from './species-sheet';
import { SPECIES, type SpeciesId } from './species';

/**
 * Wiki des espèces (ADR 0066, 0068) : recherche, liste en deux parties (dans le bac,
 * ajoutables ici), modèle de vue d'une fiche (lot 1/2, #287), alimentation et cohabitation
 * (lot 2/2, #291).
 *
 * Pur et sans état : tout vient du catalogue (`SPECIES`, `SPECIES_LABELS`), de
 * l'environnement et des fiches (`sim/species-sheet.ts`, ADR 0058). Aucune valeur n'est
 * recopiée ici : le wiki n'est qu'une autre vue des mêmes données que le panneau
 * « Population ».
 */

/** Ligne de la liste du wiki. */
export interface WikiEntry {
  readonly species: SpeciesId;
  /** Nom affiché (`SpeciesDefinition.name`). */
  readonly name: string;
  readonly scientificName: string;
  /** Effectif dans le bac (0 pour une espèce ajoutable). */
  readonly count: number;
}

/** Les deux parties de la liste. */
export interface WikiLists {
  /** Espèces présentes dans le bac (effectif > 0) : celles de l'environnement d'abord. */
  readonly present: readonly WikiEntry[];
  /** Espèces de l'environnement absentes du bac, qu'on peut y ajouter. */
  readonly addable: readonly WikiEntry[];
}

/** Modèle de vue d'une fiche du wiki. */
export interface WikiSheet {
  readonly species: SpeciesId;
  readonly name: string;
  readonly scientificName: string;
  /** Lignes de la fiche (`sheetRows`), chacune avec le texte de son statut de sourçage. */
  readonly rows: readonly SheetRow[];
  /** Mises en garde de la fiche (`sheetNotes`). */
  readonly notes: readonly { readonly text: string; readonly status: string }[];
}

const SPECIES_IDS = Object.keys(SPECIES) as SpeciesId[];

/**
 * Clé de recherche d'un texte : minuscules, sans accents ni signes diacritiques, espaces,
 * tirets et apostrophes ramenés à une seule espace, sans espace aux bords.
 */
export function searchKey(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[\s\-'’]+/g, ' ')
    .trim();
}

/** Textes cherchés pour une espèce : nom affiché, nom scientifique, singulier et pluriel. */
const SEARCH_KEYS: Readonly<Record<SpeciesId, readonly string[]>> = Object.fromEntries(
  SPECIES_IDS.map((id) => {
    const { name, scientificName } = SPECIES[id];
    const { singular, plural } = SPECIES_LABELS[id];
    return [id, Object.freeze([name, scientificName, singular, plural].map(searchKey))];
  }),
) as Record<SpeciesId, readonly string[]>;

/**
 * Vrai si l'espèce `id` correspond à la recherche `query` : la clé de la recherche est
 * contenue dans l'un de ses noms (courant ou scientifique), sans tenir compte de la casse ni
 * des accents. Une recherche vide (ou faite de blancs) correspond à toutes les espèces.
 */
export function matchesWikiSearch(id: SpeciesId, query: string): boolean {
  const key = searchKey(query);
  return key === '' || SEARCH_KEYS[id].some((text) => text.includes(key));
}

/** Effectif lu dans `counts` : un nombre fini strictement positif, sinon 0. */
function countOf(counts: Readonly<Partial<Record<string, number>>>, id: SpeciesId): number {
  const n = Object.hasOwn(counts, id) ? counts[id] : undefined;
  return n !== undefined && Number.isFinite(n) && n > 0 ? n : 0;
}

function entry(id: SpeciesId, count: number): WikiEntry {
  const { name, scientificName } = SPECIES[id];
  return Object.freeze({ species: id, name, scientificName, count });
}

/**
 * Liste du wiki pour l'environnement `environment` peuplé de `counts`, filtrée par `query` :
 *
 * - `present` : toute espèce d'effectif fini strictement positif, dans l'ordre de
 *   l'environnement, puis (cas anormal, montré tel quel) celles qui n'y vivent pas, dans
 *   l'ordre de `SPECIES` ;
 * - `addable` : les espèces de l'environnement d'effectif nul (ou absent, ou invalide).
 *
 * Une espèce n'apparaît que dans une partie. Les clés inconnues de `counts` sont ignorées.
 * @throws RangeError si l'environnement est inconnu.
 */
export function wikiLists(
  environment: EnvironmentId,
  counts: Readonly<Partial<Record<string, number>>>,
  query = '',
): WikiLists {
  const local = environmentById(environment).species;
  const order = [...local, ...SPECIES_IDS.filter((id) => !local.includes(id))];
  const present: WikiEntry[] = [];
  const addable: WikiEntry[] = [];
  for (const id of order) {
    if (!matchesWikiSearch(id, query)) {
      continue;
    }
    const count = countOf(counts, id);
    if (count > 0) {
      present.push(entry(id, count));
    } else if (local.includes(id)) {
      addable.push(entry(id, 0));
    }
  }
  return Object.freeze({ present: Object.freeze(present), addable: Object.freeze(addable) });
}

/** Modèle de vue de la fiche de `id` : lignes et mises en garde de `sim/species-sheet.ts`. */
export function wikiSheet(id: SpeciesId): WikiSheet {
  const { name, scientificName } = SPECIES[id];
  return Object.freeze({
    species: id,
    name,
    scientificName,
    rows: sheetRows(id),
    notes: sheetNotes(id),
  });
}

/** Espèce citée dans la cohabitation : nom affiché et raison du verdict. */
export interface CohabitationItem {
  readonly species: SpeciesId;
  readonly name: string;
  readonly reason: string;
}

/** Section « Cohabitation » d'une fiche, en trois groupes. */
export interface WikiCohabitation {
  /** Espèces déconseillées (verdict ≠ `compatible`), où qu'elles vivent. */
  readonly avoid: readonly CohabitationItem[];
  /** Espèces compatibles qu'un environnement du jeu accueille avec celle-ci. */
  readonly together: readonly CohabitationItem[];
  /** Noms des espèces compatibles d'autres milieux, jamais dans le même bac du jeu. */
  readonly elsewhere: readonly string[];
  /** Texte du statut des raisons (approximation de jeu, ADR 0055). */
  readonly status: string;
}

/** Soins de la fiche du wiki : alimentation et cohabitation (lot 2/2). */
export interface WikiCare {
  readonly feeding: readonly CareRow[];
  readonly cohabitation: WikiCohabitation;
}

/** Modèle de vue des soins de `id` (`sim/species-care.ts`). */
export function wikiCare(id: SpeciesId): WikiCare {
  const avoid: CohabitationItem[] = [];
  const together: CohabitationItem[] = [];
  const elsewhere: string[] = [];
  for (const entry of cohabitation(id)) {
    const item = Object.freeze({
      species: entry.other,
      name: SPECIES[entry.other].name,
      reason: entry.reason,
    });
    if (entry.verdict !== 'compatible') {
      avoid.push(item);
    } else if (entry.sameEnvironment) {
      together.push(item);
    } else {
      elsewhere.push(item.name);
    }
  }
  return Object.freeze({
    feeding: feedingRows(id),
    cohabitation: Object.freeze({
      avoid: Object.freeze(avoid),
      together: Object.freeze(together),
      elsewhere: Object.freeze(elsewhere),
      status: COHABITATION_STATUS,
    }),
  });
}
