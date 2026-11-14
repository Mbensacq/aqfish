import { FILTER_MATURE_AT, filterMaturityPercent } from './filter-maturation';
import type { MutableWaterState, WaterState } from './water';

/**
 * Rinçage de l'éponge du filtre, étape « filtre » de la séance d'entretien guidée (issue #606,
 * lot 3 de #593, ADR 0140). Fonctions pures, sans hasard ni horloge.
 *
 * Dans l'eau du bac (retirée au seau), l'éponge perd sa saleté et garde ses bactéries
 * nitrifiantes : rien ne change. Au robinet, le chlore tue une part `TAP_RINSE_LOSS` des
 * bactéries : l'efficacité du filtre (`water.filter`) baisse d'autant, et le filtre repart en
 * maturation (`sim/filter-maturation.ts`, marque `cycling`) pour se repeupler. L'ammoniaque
 * n'est pas touchée sur le coup : c'est le filtre affaibli qui la convertit moins bien, d'où le
 * pic des jours suivants (`stepWaterInPlace`).
 */

/** Eau de rinçage de l'éponge. */
export type FilterRinseWater = 'bac' | 'robinet';

/** Eaux de rinçage proposées, dans l'ordre d'affichage. */
export const FILTER_RINSE_WATERS: readonly FilterRinseWater[] = ['bac', 'robinet'];

/**
 * Part des bactéries du filtre tuée par un rinçage à l'eau du robinet. Approximation de jeu :
 * aucune source chiffrée, seulement le conseil de rincer dans l'eau du bac.
 */
export const TAP_RINSE_LOSS = 0.5;

/** Libellé du choix et phrase « pourquoi » affichée une fois choisi. */
export const FILTER_RINSE_TEXT: Readonly<
  Record<FilterRinseWater, { readonly label: string; readonly why: string }>
> = {
  bac: {
    label: 'Dans l’eau du bac',
    why: 'L’eau du bac n’a pas de chlore : l’éponge est propre et garde ses bonnes bactéries.',
  },
  robinet: {
    label: 'À l’eau du robinet',
    why: 'Le chlore du robinet tue une partie des bonnes bactéries : le filtre devra se repeupler, et l’ammoniaque montera les jours suivants.',
  },
};

/** Vrai si `value` est une eau de rinçage connue. */
export function isFilterRinseWater(value: unknown): value is FilterRinseWater {
  return value === 'bac' || value === 'robinet';
}

/**
 * Efficacité du filtre `filter` après un rinçage à l'eau `rinse`. Bac : inchangée. Robinet :
 * réduite de `TAP_RINSE_LOSS`. Une valeur non finie compte comme un filtre absent (0).
 */
export function filterAfterRinse(filter: number, rinse: FilterRinseWater): number {
  const f = Number.isFinite(filter) ? Math.min(1, Math.max(0, filter)) : 0;
  return rinse === 'robinet' ? f * (1 - TAP_RINSE_LOSS) : f;
}

/**
 * Rince l'éponge du filtre de `water` à l'eau `rinse`, **en le modifiant**, et le renvoie.
 * Bac : rien ne change. Robinet : efficacité réduite (`filterAfterRinse`) ; si elle passe sous
 * `FILTER_MATURE_AT`, le filtre est marqué en maturation pour se repeupler. Filtre absent
 * (efficacité nulle) : rien à tuer, rien ne change.
 */
export function rinseFilterInPlace(
  water: MutableWaterState,
  rinse: FilterRinseWater,
): MutableWaterState {
  if (rinse !== 'robinet' || !(water.filter > 0)) {
    return water;
  }
  water.filter = filterAfterRinse(water.filter, rinse);
  if (water.filter < FILTER_MATURE_AT) {
    water.cycling = true;
  }
  return water;
}

/** Consigne de l'étape « filtre » : efficacité actuelle et choix à faire. */
export function filterStepHint(water: Pick<WaterState, 'filter'>): string {
  return `Bactéries du filtre : ${filterMaturityPercent(water)} %. Où rincer l’éponge ?`;
}
