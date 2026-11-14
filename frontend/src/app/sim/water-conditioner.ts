import { DEFAULT_DAY_LENGTH_SECONDS } from './daylight';
import type { MutableWaterState, WaterState } from './water';

/**
 * Chlore de l'eau du robinet et conditionneurs (issue #530, ADR 0121). Pur et déterministe :
 * aucun hasard, aucune horloge, aucune allocation par pas.
 *
 * Modèle (`docs/SOINS.md` § 2) : un changement d'eau à l'eau non traitée
 * (`WaterState.untreatedTap`, désactivée par défaut) ajoute du chlore, dilué comme les autres
 * composés. Le conditionneur le ramène à 0 instantanément ; la variante « liant » protège en
 * plus de l'ammoniaque pendant `AMMONIA_BINDER_SECONDS`, sans baisser la valeur mesurée
 * (`toxicAmmonia`). Chloramine et test d'eau sont hors périmètre.
 *
 * Valeurs : le seuil de nocivité reprend les 0,02 mg/L du Merck, la durée les 48 h revendiquées
 * par l'étiquette (temps compressé), la capacité ≈ 1 mg/L par dose. La teneur du robinet n'a pas
 * été vérifiée pour la France : **approximation de jeu**.
 */

/** Teneur en chlore de l'eau du robinet non traitée, en mg/L. Approximation de jeu. */
export const TAP_CHLORINE = 0.5;
/** Teneur maximale gardée dans le bac, en mg/L (changements d'eau répétés sans conditionneur). */
export const MAX_CHLORINE = 2;
/** Teneur à partir de laquelle le chlore nuit aux animaux, en mg/L (Merck). */
export const CHLORINE_HARMFUL = 0.02;
/** Teneur sous laquelle le chlore est considéré absent (le champ disparaît), en mg/L. */
export const CHLORINE_TRACE = 0.001;
/** Durée de protection de l'ammoniaque liée, en secondes simulées (2 journées). */
export const AMMONIA_BINDER_SECONDS = 2 * DEFAULT_DAY_LENGTH_SECONDS;
/** Ammoniaque neutralisée pendant la protection, en unités de jeu (≈ 1 mg/L par dose). */
export const AMMONIA_BINDER_CAPACITY = 1;

/** Conditionneur : simple (thiosulfate, chlore seul) ou liant aussi l'ammoniaque. */
export type ConditionerKind = 'thiosulfate' | 'liant';

/** Raison d'un refus : dose invalide, ou conditionneur simple sans chlore à neutraliser. */
export type ConditionerRefusal = 'dose-invalide' | 'sans-chlore';

/** Résultat d'une dose : versée ou refusée, toujours avec un message pour le joueur. */
export type ConditionerOutcome =
  | { readonly ok: true; readonly message: string }
  | { readonly ok: false; readonly reason: ConditionerRefusal; readonly message: string };

const PRODUCTS_PAGE = 'voir la page « Produits et traitements » du wiki';

/**
 * Verse `amount` doses de conditionneur `kind` dans `water`, **en le modifiant** : le chlore
 * revient à 0. La variante liante (re)lance la protection de l'ammoniaque pour sa durée
 * entière : une double dose ne la prolonge pas. Refusé, sans rien changer, si la dose n'est pas
 * un réel strictement positif, ou si le conditionneur simple ne trouve aucun chlore.
 */
export function doseConditionerInPlace(
  water: MutableWaterState,
  kind: ConditionerKind,
  amount: number,
): ConditionerOutcome {
  if (!(amount > 0) || !Number.isFinite(amount)) {
    return { ok: false, reason: 'dose-invalide', message: 'Dose de conditionneur invalide.' };
  }
  if (kind === 'thiosulfate' && water.chlorine === undefined) {
    return {
      ok: false,
      reason: 'sans-chlore',
      message: `Aucun chlore dans l’eau : le conditionneur n’apporterait rien (${PRODUCTS_PAGE}).`,
    };
  }
  delete water.chlorine;
  if (kind === 'thiosulfate') {
    return { ok: true, message: `Chlore neutralisé (${PRODUCTS_PAGE}).` };
  }
  water.ammoniaBinder = AMMONIA_BINDER_SECONDS;
  return {
    ok: true,
    message: `Chlore neutralisé, ammoniaque liée pour deux jours : elle reste mesurée, le filtre doit suivre (${PRODUCTS_PAGE}).`,
  };
}

/**
 * Part de changement d'eau `share` appliquée au chlore de `water`, **en le modifiant** : le
 * chlore présent est dilué ; avec l'eau non traitée (`untreated`, par défaut le réglage
 * `untreatedTap` du bac ; un seau sans conditionneur, #605), celle du robinet en apporte.
 */
export function chlorineAfterWaterChangeInPlace(
  water: MutableWaterState,
  share: number,
  untreated: boolean = water.untreatedTap === true,
): void {
  const added = untreated ? share * TAP_CHLORINE : 0;
  const next = Math.min(MAX_CHLORINE, (water.chlorine ?? 0) * (1 - share) + added);
  if (next >= CHLORINE_TRACE) {
    water.chlorine = next;
  } else {
    delete water.chlorine;
  }
}

/** Un pas de `dt` secondes de la protection de `water`, **en le modifiant**. */
export function stepAmmoniaBinderInPlace(water: MutableWaterState, dt: number): void {
  if (water.ammoniaBinder === undefined) {
    return;
  }
  const left = water.ammoniaBinder - dt;
  if (left > 0) {
    water.ammoniaBinder = left;
  } else {
    delete water.ammoniaBinder;
  }
}

/** Ammoniaque qui agit sur les animaux : la valeur mesurée, moins la part liée. */
export function toxicAmmonia(water: Pick<WaterState, 'ammonia' | 'ammoniaBinder'>): number {
  return water.ammoniaBinder === undefined
    ? water.ammonia
    : Math.max(0, water.ammonia - AMMONIA_BINDER_CAPACITY);
}
