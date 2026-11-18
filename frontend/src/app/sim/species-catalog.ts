import type { MixWarning } from './compatibility';
import { environmentById, livesIn, type EnvironmentId } from './environment';
import { SPECIES, type SpeciesId } from './species';

/**
 * Catalogue d'espèces (issue #189) : les espèces qu'un environnement accueille, avec leurs
 * libellés, leur effectif par défaut et leur effectif maximal. L'application d'effectifs
 * demandés vit dans `sim/species-counts.ts` (#687) : ce module de données ne dépend pas du
 * monde.
 */

/**
 * Libellés d'une espèce, en minuscules, pour construire les textes de l'interface (#95) :
 * pluriels irréguliers et genre portés par la donnée, pas devinés.
 */
export interface SpeciesLabels {
  /** Nom au singulier (« néon », « sonneur oriental »). */
  readonly singular: string;
  /** Nom au pluriel (« néons », « poissons-clowns », « chirurgiens bleus »). */
  readonly plural: string;
  /** Vrai si le nom est féminin (« une loche kuhli »). */
  readonly feminine: boolean;
}

/** Libellés de chaque espèce ; le type impose une entrée pour toute nouvelle espèce. */
export const SPECIES_LABELS: Readonly<Record<SpeciesId, SpeciesLabels>> = {
  neon: { singular: 'néon', plural: 'néons', feminine: false },
  guppy: { singular: 'guppy', plural: 'guppys', feminine: false },
  corydora: { singular: 'corydora', plural: 'corydoras', feminine: false },
  koi: { singular: 'koï', plural: 'koïs', feminine: false },
  axolotl: { singular: 'axolotl', plural: 'axolotls', feminine: false },
  grenouille: { singular: 'sonneur oriental', plural: 'sonneurs orientaux', feminine: false },
  triton: {
    singular: 'triton à ventre de feu',
    plural: 'tritons à ventre de feu',
    feminine: false,
  },
  clown: { singular: 'poisson-clown', plural: 'poissons-clowns', feminine: false },
  chirurgien: { singular: 'chirurgien bleu', plural: 'chirurgiens bleus', feminine: false },
  rasbora: { singular: 'rasbora arlequin', plural: 'rasboras arlequins', feminine: false },
  tetra: { singular: 'tétra citron', plural: 'tétras citrons', feminine: false },
  kuhli: { singular: 'loche kuhli', plural: 'loches kuhli', feminine: true },
  gourami: { singular: 'gourami nain', plural: 'gouramis nains', feminine: false },
  platy: { singular: 'platy', plural: 'platys', feminine: false },
  danio: { singular: 'danio zébré', plural: 'danios zébrés', feminine: false },
  ancistrus: { singular: 'ancistrus commun', plural: 'ancistrus communs', feminine: false },
  otocinclus: { singular: 'otocinclus', plural: 'otocinclus', feminine: false },
  braise: { singular: 'tétra braise', plural: 'tétras braise', feminine: false },
  molly: { singular: 'molly', plural: 'mollys', feminine: false },
  miel: { singular: 'gourami miel', plural: 'gouramis miel', feminine: false },
  chromis: { singular: 'chromis vert', plural: 'chromis verts', feminine: false },
  gobie: {
    singular: 'gobie à crevette jaune',
    plural: 'gobies à crevette jaunes',
    feminine: false,
  },
  gramma: { singular: 'gramma royal', plural: 'grammas royaux', feminine: false },
  crevette: { singular: 'crevette nettoyeuse', plural: 'crevettes nettoyeuses', feminine: true },
  blennie: { singular: 'blennie bicolore', plural: 'blennies bicolores', feminine: true },
  xipho: { singular: 'xipho', plural: 'xiphos', feminine: false },
  cerise: { singular: 'crevette cerise', plural: 'crevettes cerises', feminine: true },
  neritine: { singular: 'néritine zèbre', plural: 'néritines zèbres', feminine: true },
  rouge: { singular: 'poisson rouge', plural: 'poissons rouges', feminine: false },
};

/** Entrée du catalogue d'un environnement. */
export interface CatalogEntry {
  readonly species: SpeciesId;
  /** Nom affiché (`SpeciesDefinition.name`). */
  readonly name: string;
  readonly scientificName: string;
  readonly labels: SpeciesLabels;
  /** Effectif au départ dans cet environnement (0 si l'espèce n'y est pas peuplée d'office). */
  readonly defaultCount: number;
  /** Effectif maximal de l'espèce seule (`maxPopulation`) ; le total reste borné à part. */
  readonly maxCount: number;
}

const CATALOG_CACHE = new Map<EnvironmentId, readonly CatalogEntry[]>();

/**
 * Espèces de l'environnement `id`, dans l'ordre de `Environment.species` (celui du panneau).
 * Résultat figé, partagé entre les appels.
 * @throws RangeError si l'environnement est inconnu.
 */
export function speciesCatalog(id: EnvironmentId): readonly CatalogEntry[] {
  const env = environmentById(id);
  const cached = CATALOG_CACHE.get(id);
  if (cached !== undefined) {
    return cached;
  }
  const entries = Object.freeze(env.species.map((species) => catalogEntry(id, species)));
  CATALOG_CACHE.set(id, entries);
  return entries;
}

const DECOR_CATALOG_CACHE = new Map<EnvironmentId, readonly CatalogEntry[]>();

/**
 * Catalogue d'un bac de l'environnement `id` en mode décor (#278) : toutes les espèces du
 * simulateur, celles de l'environnement d'abord (ordre du catalogue habituel), puis les
 * autres dans l'ordre de `SPECIES`. Les espèces exclues pour raison légale (#262) ne sont pas
 * dans `SPECIES` : elles restent absentes. Résultat figé, partagé entre les appels.
 * @throws RangeError si l'environnement est inconnu.
 */
export function decorCatalog(id: EnvironmentId): readonly CatalogEntry[] {
  const cached = DECOR_CATALOG_CACHE.get(id);
  if (cached !== undefined) {
    return cached;
  }
  const own = speciesCatalog(id);
  const others = (Object.keys(SPECIES) as SpeciesId[])
    .filter((species) => !livesIn(id, species))
    .map((species) => catalogEntry(id, species));
  const entries = Object.freeze([...own, ...others]);
  DECOR_CATALOG_CACHE.set(id, entries);
  return entries;
}

function catalogEntry(id: EnvironmentId, species: SpeciesId): CatalogEntry {
  const def = SPECIES[species];
  const initial = environmentById(id).population.find((entry) => entry.species === species);
  return Object.freeze({
    species,
    name: def.name,
    scientificName: def.scientificName,
    labels: SPECIES_LABELS[species],
    defaultCount: initial?.count ?? 0,
    maxCount: def.maxPopulation,
  });
}

/** Raison affichée d'un mélange déconseillé (`sim/compatibility.ts`, issue #209). */
export const MIX_REASON_TEXT: Readonly<Record<MixWarning['reason'], string>> = {
  predateur: 'prédateur',
  territorial: 'deux espèces territoriales',
  temperature: 'eau froide et eau tropicale',
};

/**
 * Libellé d'un mélange déconseillé, pour le panneau (issue #209) : « Mélange déconseillé :
 * axolotls et tritons (prédateur) ».
 */
export function mixWarningText(warning: MixWarning): string {
  const first = SPECIES_LABELS[warning.first].plural;
  const second = SPECIES_LABELS[warning.second].plural;
  return `Mélange déconseillé : ${first} et ${second} (${MIX_REASON_TEXT[warning.reason]})`;
}
