import { acceptsSpecies } from './care-mode';
import { isSpeciesId, setPopulationInPlace } from './population';
import type { SpeciesId } from './species';
import { cloneWorld } from './world';
import type { MutableWorld, World } from './world-types';

/*
 * Effectifs demandés pour le catalogue d'espèces (issue #189, `sim/species-catalog.ts`),
 * appliqués et bornés (`sim/population.ts`). Séparé du catalogue (#687) pour que ce dernier,
 * lu par les textes et les fiches d'espèce, ne dépende pas du monde.
 *
 * Pur et déterministe : même graine et mêmes effectifs demandés (dans le même ordre),
 * même monde. Les effectifs sont appliqués dans l'ordre de la demande : c'est lui qui fixe
 * les identifiants des poissons ajoutés, donc leurs sous-générateurs.
 */

/** Effectif demandé pour une espèce ; l'espèce et le nombre ne sont pas encore vérifiés. */
export interface SpeciesCountRequest {
  readonly species: string;
  readonly count: number;
}

/**
 * Effectif demandé ramené à un entier positif ou nul (arrondi au plus proche), `null` s'il
 * n'est pas un nombre fini. La borne haute est celle de `setPopulationInPlace`.
 * `Number.isFinite` (sans conversion, contrairement à `isFinite`) refuse aussi une valeur
 * qui n'est pas un nombre malgré le type (sauvegarde importée, valeur d'un champ) : le test
 * `typeof` qui le doublait est retiré (#204).
 */
export function normalizedCount(count: number): number | null {
  if (!Number.isFinite(count)) {
    return null;
  }
  return Math.max(0, Math.round(count));
}

/**
 * Applique les effectifs `requests` à `world`, **en le modifiant**, dans l'ordre donné ;
 * renvoie les espèces effectivement réglées et leur effectif obtenu. Chaque effectif est
 * arrondi, ramené à 0 au moins et à `populationLimit` au plus (maximum de l'espèce et place
 * restante sous `MAX_TOTAL_FISH`). Ignorés sans erreur : espèce inconnue (clés héritées
 * comprises), espèce qui ne vit pas dans l'environnement du monde (sauf en mode décor, #278),
 * nombre non fini.
 * Réservé au propriétaire unique du monde, comme `setPopulationInPlace`.
 */
export function applySpeciesCountsInPlace(
  world: MutableWorld,
  requests: readonly SpeciesCountRequest[],
): readonly { species: SpeciesId; count: number }[] {
  const applied: { species: SpeciesId; count: number }[] = [];
  for (const { species, count } of requests) {
    const normalized = normalizedCount(count);
    if (!isSpeciesId(species) || !acceptsSpecies(world, species) || normalized === null) {
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
