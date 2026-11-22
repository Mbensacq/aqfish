/**
 * Champs de fiche sourcés (issue #237, ADR 0058), partagés par les fiches d'espèces
 * (`sim/species-sheet.ts`) et leurs données d'écologie (`sim/species-ecology.ts`, #784).
 * Séparés des fiches pour que les données d'écologie les utilisent sans cycle d'import.
 *
 * **Règle de sourçage** : chaque champ porte un statut, `source` (avec une référence non vide,
 * consultable) ou `approximation de jeu` (valeur choisie pour le jeu, sans source consultable
 * pendant le cycle). Aucune valeur n'est présentée comme sourcée sans référence.
 */

/** Statut d'un champ de fiche. */
export type FieldStatus =
  { readonly kind: 'source'; readonly reference: string } | { readonly kind: 'approximation' };

/** Valeur d'une fiche et son statut. */
export interface SheetField<T> {
  readonly value: T;
  readonly status: FieldStatus;
}

/** Plage de valeurs, bornes comprises. */
export interface ValueRange {
  readonly min: number;
  readonly max: number;
}

/**
 * Plage de dureté d'une espèce (issue #484), bornes comprises : dureté générale (`gh`, en
 * °dGH) pour l'eau douce, carbonatée (`kh`, en °dKH) pour le récif, où la GH de l'eau de mer
 * n'a pas de sens pour l'aquariophile (`sim/water-hardness.ts`).
 */
export interface HardnessRange extends ValueRange {
  readonly kind: 'gh' | 'kh';
}

export const APPROXIMATION: FieldStatus = Object.freeze({ kind: 'approximation' });

export function source(reference: string): FieldStatus {
  return Object.freeze({ kind: 'source', reference });
}

export function approx<T>(value: T): SheetField<T> {
  return Object.freeze({ value, status: APPROXIMATION });
}

export function sourced<T>(value: T, reference: string): SheetField<T> {
  return Object.freeze({ value, status: source(reference) });
}

export function range(min: number, max: number): ValueRange {
  return Object.freeze({ min, max });
}

export function gh(min: number, max: number): HardnessRange {
  return Object.freeze({ kind: 'gh', min, max });
}

export function kh(min: number, max: number): HardnessRange {
  return Object.freeze({ kind: 'kh', min, max });
}
