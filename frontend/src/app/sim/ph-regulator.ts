import { DEFAULT_DAY_LENGTH_SECONDS } from './daylight';
import type { MutableWaterState } from './water';
import { MAX_PH, MIN_PH } from './water-ph';

/**
 * Régulateurs de pH (issue #531, ADR 0122). Pur et déterministe : aucun hasard, aucune horloge,
 * aucune allocation par pas.
 *
 * Modèle (`docs/SOINS.md` §§ 1.2 et 3, tampons « pH Up/Down », doses non vérifiées) : chaque dose
 * déplace le pH d'un cran, puis le produit attend `PH_REGULATOR_WAIT_SECONDS`
 * (`WaterState.phRegulatorWait`). Ce délai plafonne la variation sur toute période d'une journée
 * simulée à `PH_REGULATOR_MAX_PER_DAY`. **Approximation de jeu**.
 */

/** Variation du pH par dose. Approximation de jeu. */
export const PH_REGULATOR_STEP = 0.1;
/** Doses permises par journée simulée. Approximation de jeu. */
export const PH_REGULATOR_DOSES_PER_DAY = 3;
/** Variation maximale du pH par journée simulée. */
export const PH_REGULATOR_MAX_PER_DAY = PH_REGULATOR_STEP * PH_REGULATOR_DOSES_PER_DAY;
/** Attente entre deux doses, en secondes simulées. */
export const PH_REGULATOR_WAIT_SECONDS = DEFAULT_DAY_LENGTH_SECONDS / PH_REGULATOR_DOSES_PER_DAY;

/** Sens d'une dose : baisser (−1) ou monter (+1) le pH. */
export type PhRegulatorDirection = -1 | 1;

/** Raison d'un refus : dose trop rapprochée, ou pH déjà à la borne du modèle. */
export type PhRegulatorRefusal = 'trop-tot' | 'borne';

/** Résultat d'une dose : versée (avec sa mise en garde) ou refusée. */
export type PhRegulatorOutcome =
  | { readonly ok: true; readonly message: string; readonly warning: string }
  | { readonly ok: false; readonly reason: PhRegulatorRefusal; readonly message: string };

const SUDDEN_CHANGE_WARNING =
  'Éviter les variations brusques : au plus 0,3 de pH par jour, elles stressent les animaux.';

function phText(ph: number): string {
  return ph.toFixed(1).replace('.', ',');
}

/**
 * Dose de régulateur dans le sens `direction`, **en modifiant** `water` si elle est acceptée.
 * Le pH reste dans [`MIN_PH`, `MAX_PH`] ; refusée s'il y est déjà, ou pendant l'attente.
 */
export function dosePhRegulatorInPlace(
  water: MutableWaterState,
  direction: PhRegulatorDirection,
): PhRegulatorOutcome {
  if (water.phRegulatorWait !== undefined) {
    return {
      ok: false,
      reason: 'trop-tot',
      message: `Dose refusée : attendre avant de corriger encore le pH. ${SUDDEN_CHANGE_WARNING}`,
    };
  }
  const next = Math.min(MAX_PH, Math.max(MIN_PH, water.ph + direction * PH_REGULATOR_STEP));
  if (!Number.isFinite(water.ph) || Math.abs(next - water.ph) < 1e-9) {
    return {
      ok: false,
      reason: 'borne',
      message: `Dose refusée : le pH est déjà à sa limite (${phText(next)}).`,
    };
  }
  water.ph = next;
  water.phRegulatorWait = PH_REGULATOR_WAIT_SECONDS;
  return { ok: true, message: `pH : ${phText(next)}.`, warning: SUDDEN_CHANGE_WARNING };
}

/** Un pas de `dt` secondes de l'attente de `water`, **en le modifiant**. */
export function stepPhRegulatorInPlace(water: MutableWaterState, dt: number): void {
  if (water.phRegulatorWait === undefined) {
    return;
  }
  const left = water.phRegulatorWait - dt;
  if (left > 0) {
    water.phRegulatorWait = left;
  } else {
    delete water.phRegulatorWait;
  }
}
