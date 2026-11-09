import type { MutableWaterState, WaterState } from './water';

/**
 * Charbon actif du filtre (issue #531, ADR 0122). Pur et déterministe : aucun hasard, aucune
 * horloge, aucune allocation par pas.
 *
 * Modèle (`docs/SOINS.md`, « Charbon actif ») : présent (`WaterState.carbon`, absent par défaut),
 * il adsorbe le médicament (demi-vie courte dans `stepTreatmentInPlace`) et retire la teinte des
 * tanins (`waterReadout`). Il ne retire ni le sel ni la chaleur, et il ne sature pas :
 * **approximation de jeu**.
 */

/** Demi-vie du médicament avec du charbon, en secondes simulées. Approximation de jeu. */
export const CARBON_MEDICATION_HALF_LIFE = 120;

/** Texte de la mise en garde : un médicament et du charbon dans le même bac. */
export const CARBON_TREATMENT_WARNING =
  'Charbon actif présent : il retire le médicament de l’eau. Le retirer pendant le traitement.';

/** Résultat d'un changement du charbon : un message, parfois une mise en garde. */
export interface CarbonOutcome {
  readonly message: string;
  readonly warning?: string;
}

/** Place (`present`) ou retire le charbon de `water`, **en le modifiant**. */
export function setCarbonInPlace(water: MutableWaterState, present: boolean): CarbonOutcome {
  if (!present) {
    delete water.carbon;
    return { message: 'Charbon actif retiré du filtre.' };
  }
  water.carbon = true;
  return {
    message: 'Charbon actif dans le filtre : il retire médicaments et couleur des tanins.',
    ...(carbonAgainstMedication(water) ? { warning: CARBON_TREATMENT_WARNING } : {}),
  };
}

/** Vrai si du charbon côtoie un médicament encore dans l'eau. */
export function carbonAgainstMedication(water: Pick<WaterState, 'carbon' | 'medication'>): boolean {
  return water.carbon === true && water.medication !== undefined;
}
