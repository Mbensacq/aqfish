import { DEFAULT_DAY_LENGTH_SECONDS } from './daylight';
import type { MutableWaterState, WaterState } from './water';

/**
 * Amorce de bactéries nitrifiantes (issue #529, ADR 0120) : une bouteille versée dans le bac
 * fait monter l'efficacité du filtre (`WaterState.filter`) pendant quelques journées simulées,
 * sans aucun effet chimique immédiat (`docs/SOINS.md` § 1.1). Pur et déterministe : aucun
 * hasard, aucune horloge, aucune allocation par pas.
 *
 * Modèle : la réserve (`WaterState.bacteriaStarter`, en doses) se vide à vitesse constante et
 * chaque dose consommée rend `STARTER_FILTER_GAIN` de filtre. La vitesse ne dépend pas de la
 * réserve : surdoser n'accélère rien. Sans réserve, le filtre ne bouge pas.
 *
 * Valeurs : la durée reprend les 7 jours de l'étiquette Stability (`docs/SOINS.md` § 1.1,
 * source secondaire, temps compressé) ; le gain, le plafond et le seuil de redosage sont des
 * **approximations de jeu**.
 */

/** Réserve maximale, en doses : au-delà, le surplus est perdu (surdose plafonnée). */
export const MAX_BACTERIA_STARTER = 1;
/** Quantité versée par le bouton du panneau, en doses. */
export const BACTERIA_STARTER_DOSE = 1;
/** Réserve au-dessus de laquelle une dose est refusée (délai entre deux doses), en doses. */
export const BACTERIA_STARTER_REDOSE_AT = 0.5;
/** Durée de consommation d'une dose entière, en secondes simulées (7 journées). */
export const BACTERIA_STARTER_SECONDS = 7 * DEFAULT_DAY_LENGTH_SECONDS;
/** Efficacité du filtre gagnée par dose entière consommée. Approximation de jeu. */
export const STARTER_FILTER_GAIN = 0.5;
/** Réserve sous laquelle un changement d'eau retire ce qui reste, en doses. */
export const BACTERIA_STARTER_TRACE = 0.01;

/** Raison d'un refus : dose invalide, filtre déjà mûr, dose précédente pas assez consommée. */
export type BacteriaStarterRefusal = 'dose-invalide' | 'filtre-mur' | 'surdosage';

/** Résultat d'une dose : versée ou refusée, toujours avec un message pour le joueur. */
export type BacteriaStarterOutcome =
  | { readonly ok: true; readonly message: string }
  | { readonly ok: false; readonly reason: BacteriaStarterRefusal; readonly message: string };

const PRODUCTS_PAGE = 'voir la page « Produits et traitements » du wiki';

/** Vrai si le filtre de `water` est déjà à son efficacité maximale. */
export function isFilterMature(water: Pick<WaterState, 'filter'>): boolean {
  return water.filter >= 1;
}

/**
 * Verse `amount` doses d'amorce dans `water`, **en le modifiant** : la réserve est plafonnée à
 * `MAX_BACTERIA_STARTER`. Refusé, sans rien changer, si la dose n'est pas un réel strictement
 * positif, si le filtre est déjà mûr, ou si la réserve dépasse `BACTERIA_STARTER_REDOSE_AT`.
 */
export function doseBacteriaStarterInPlace(
  water: MutableWaterState,
  amount: number,
): BacteriaStarterOutcome {
  if (!(amount > 0) || !Number.isFinite(amount)) {
    return { ok: false, reason: 'dose-invalide', message: 'Dose d’amorce invalide.' };
  }
  if (isFilterMature(water)) {
    return {
      ok: false,
      reason: 'filtre-mur',
      message: `Filtre déjà mûr : l’amorce de bactéries n’apporterait rien (${PRODUCTS_PAGE}).`,
    };
  }
  const reserve = water.bacteriaStarter ?? 0;
  if (reserve > BACTERIA_STARTER_REDOSE_AT) {
    return {
      ok: false,
      reason: 'surdosage',
      message: 'Amorce encore active : attendre avant d’en verser de nouveau.',
    };
  }
  water.bacteriaStarter = Math.min(MAX_BACTERIA_STARTER, reserve + amount);
  return {
    ok: true,
    message: `Amorce de bactéries versée : le filtre mûrit plus vite, sans effet immédiat sur l’eau (${PRODUCTS_PAGE}).`,
  };
}

/**
 * Un pas de `dt` secondes de l'amorce de `water`, **en le modifiant** : consomme la réserve et
 * fait monter le filtre d'autant, sans dépasser 1. La réserve disparaît une fois vide, ou dès
 * que le filtre est mûr. Sans réserve, ne fait rien. `dt` est validé par `stepWaterInPlace`.
 */
export function stepBacteriaStarterInPlace(water: MutableWaterState, dt: number): void {
  const reserve = water.bacteriaStarter;
  if (reserve === undefined) {
    return;
  }
  const used = Math.min(reserve, dt / BACTERIA_STARTER_SECONDS);
  water.filter = Math.min(1, water.filter + STARTER_FILTER_GAIN * used);
  const left = reserve - used;
  if (left > 0 && !isFilterMature(water)) {
    water.bacteriaStarter = left;
  } else {
    delete water.bacteriaStarter;
  }
}
