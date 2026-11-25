import type { PossibleSpecies } from './possible-species';
import type { SpeciesId } from './species';

/**
 * Capacité du bac telle que l'interface l'affiche (#809, #818) : ligne d'occupation, alerte,
 * raisons des refus et espèces encore possibles. Module à part (issue #820) pour que
 * `tank-capacity-limits.ts` et `possible-species.ts` ne s'importent pas l'un l'autre.
 */

/** Capacité telle que l'interface l'affiche (#809). */
export interface CapacityShown {
  /** Ligne d'occupation et de volume (`capacityLine`), `null` avant le démarrage. */
  readonly text: string | null;
  /** Alerte d'un bac trop plein (`capacityAlert`), sinon `null`. */
  readonly alert: string | null;
  /** Raison du refus d'un animal de plus, pour les espèces que la capacité bloque. */
  readonly reasons: Readonly<Partial<Record<SpeciesId, string>>>;
  /** Espèces encore possibles du milieu, triées par verdict (`possibleSpecies`, #818). */
  readonly possible: readonly PossibleSpecies[];
}

/** Rien à afficher (avant le démarrage). */
export const NO_CAPACITY: CapacityShown = Object.freeze({
  text: null,
  alert: null,
  reasons: {},
  possible: [],
});
