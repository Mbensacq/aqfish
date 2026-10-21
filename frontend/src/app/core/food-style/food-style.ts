/**
 * Rendu des granulés de nourriture (issue #117) : points (carrés à l'écran, par défaut) ou
 * petits voxels (cubes). Réglage provisoire, le temps que Mathis compare les deux sur
 * téléphone (ADR 0022) : il est enregistré avec les autres réglages de la sauvegarde.
 *
 * Module pur (ni Angular, ni Three.js).
 */

export const FOOD_STYLES = ['points', 'voxels'] as const;

export type FoodStyle = (typeof FOOD_STYLES)[number];

/** Rendu par défaut, et celui d'une sauvegarde qui ne précise rien. */
export const DEFAULT_FOOD_STYLE: FoodStyle = 'points';

/** Vrai si `value` est exactement un rendu connu. */
export function isFoodStyle(value: unknown): value is FoodStyle {
  return FOOD_STYLES.some((style) => style === value);
}

/** L'autre rendu (bouton du panneau). */
export function toggleFoodStyle(style: FoodStyle): FoodStyle {
  return style === 'points' ? 'voxels' : 'points';
}
