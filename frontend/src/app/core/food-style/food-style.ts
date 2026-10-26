/**
 * Rendu des granulés de nourriture (issues #117 et #226) : petits voxels (grains, flocons,
 * paillettes ; par défaut depuis #226) ou points (carrés à l'écran). Le choix est enregistré
 * avec les autres réglages de la sauvegarde (ADR 0022).
 *
 * Module pur (ni Angular, ni Three.js).
 */

export const FOOD_STYLES = ['points', 'voxels'] as const;

export type FoodStyle = (typeof FOOD_STYLES)[number];

/** Rendu par défaut, et celui d'une sauvegarde qui ne précise rien. */
export const DEFAULT_FOOD_STYLE: FoodStyle = 'voxels';

/** Vrai si `value` est exactement un rendu connu. */
export function isFoodStyle(value: unknown): value is FoodStyle {
  return FOOD_STYLES.some((style) => style === value);
}

/** L'autre rendu (bouton du panneau). */
export function toggleFoodStyle(style: FoodStyle): FoodStyle {
  return style === 'points' ? 'voxels' : 'points';
}
