import type { MixWarning } from './compatibility';
import { environmentById, livesIn, type EnvironmentId } from './environment';
import { isSpeciesId, setPopulationInPlace } from './population';
import { SPECIES, type SpeciesId } from './species';
import { cloneWorld, type MutableWorld, type World } from './world';

/**
 * Catalogue d'espèces (issue #189) : les espèces qu'un environnement accueille, avec leurs
 * libellés, leur effectif par défaut et leur effectif maximal, et l'application d'effectifs
 * demandés, bornés (`sim/population.ts`).
 *
 * Pur et déterministe : même graine et mêmes effectifs demandés (dans le même ordre),
 * même monde. Les effectifs sont appliqués dans l'ordre de la demande : c'est lui qui fixe
 * les identifiants des poissons ajoutés, donc leurs sous-générateurs.
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

/** Effectif demandé pour une espèce ; l'espèce et le nombre ne sont pas encore vérifiés. */
export interface SpeciesCountRequest {
  readonly species: string;
  readonly count: number;
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
  const entries = Object.freeze(
    env.species.map((species): CatalogEntry => {
      const def = SPECIES[species];
      const initial = env.population.find((entry) => entry.species === species);
      return Object.freeze({
        species,
        name: def.name,
        scientificName: def.scientificName,
        labels: SPECIES_LABELS[species],
        defaultCount: initial?.count ?? 0,
        maxCount: def.maxPopulation,
      });
    }),
  );
  CATALOG_CACHE.set(id, entries);
  return entries;
}

/**
 * Effectif demandé ramené à un entier positif ou nul (arrondi au plus proche), `null` s'il
 * n'est pas un nombre fini. La borne haute est celle de `setPopulationInPlace`.
 */
export function normalizedCount(count: number): number | null {
  if (typeof count !== 'number' || !Number.isFinite(count)) {
    return null;
  }
  return Math.max(0, Math.round(count));
}

/**
 * Applique les effectifs `requests` à `world`, **en le modifiant**, dans l'ordre donné ;
 * renvoie les espèces effectivement réglées et leur effectif obtenu. Chaque effectif est
 * arrondi, ramené à 0 au moins et à `populationLimit` au plus (maximum de l'espèce et place
 * restante sous `MAX_TOTAL_FISH`). Ignorés sans erreur : espèce inconnue (clés héritées
 * comprises), espèce qui ne vit pas dans l'environnement du monde, nombre non fini.
 * Réservé au propriétaire unique du monde, comme `setPopulationInPlace`.
 */
export function applySpeciesCountsInPlace(
  world: MutableWorld,
  requests: readonly SpeciesCountRequest[],
): readonly { species: SpeciesId; count: number }[] {
  const applied: { species: SpeciesId; count: number }[] = [];
  for (const { species, count } of requests) {
    const normalized = normalizedCount(count);
    if (!isSpeciesId(species) || !livesIn(world.environment, species) || normalized === null) {
      continue;
    }
    applied.push({ species, count: setPopulationInPlace(world, species, normalized) });
  }
  return applied;
}

/** Comme `applySpeciesCountsInPlace`, sans modifier `world` : renvoie un nouveau monde. */
export function applySpeciesCounts(world: World, requests: readonly SpeciesCountRequest[]): World {
  const next = cloneWorld(world);
  applySpeciesCountsInPlace(next, requests);
  return next;
}

/** Raison affichée d'un mélange déconseillé (`sim/compatibility.ts`, issue #209). */
export const MIX_REASON_TEXT: Readonly<Record<MixWarning['reason'], string>> = {
  predateur: 'prédateur',
  territorial: 'deux espèces territoriales',
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
