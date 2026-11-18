/*
 * Échelle de la santé des animaux (issue #208, ADR 0054, `sim/wellbeing.ts`) : bornes et
 * effets d'une santé sur la nage et les couleurs. Sans aucune dépendance (#687) : la nage
 * (`sim/swimmer.ts`) la lit sans dépendre des causes de souffrance (maladies, eau).
 *
 * Valeurs de jeu (approximations, pas des mesures).
 */

/** Santé minimale : un animal malade ne meurt pas dans ce sprint. */
export const HEALTH_FLOOR = 0.2;
/** Santé d'un animal neuf (et d'une sauvegarde antérieure à l'issue #208). */
export const HEALTH_START = 1;
/** Ralentissement au plancher : la nage y garde `1 − HEALTH_SLOWDOWN` de sa vitesse. */
export const HEALTH_SLOWDOWN = 0.4;

/**
 * Facteur de vitesse de nage pour une santé : exactement 1 à santé 1, `1 − HEALTH_SLOWDOWN`
 * au plancher, linéaire entre les deux. Santé hors bornes ramenée dans [plancher, 1] ; non
 * finie, comptée comme pleine.
 */
export function vigor(health: number): number {
  return 1 - HEALTH_SLOWDOWN * dullness(health);
}

/**
 * Ternissement des couleurs pour une santé, dans [0, 1] : exactement 0 à santé 1, 1 au
 * plancher, linéaire entre les deux. Santé hors bornes ramenée dans [plancher, 1] ; non
 * finie, comptée comme pleine.
 */
export function dullness(health: number): number {
  if (!Number.isFinite(health) || health >= 1) {
    return 0;
  }
  const h = health < HEALTH_FLOOR ? HEALTH_FLOOR : health;
  return (1 - h) / (1 - HEALTH_FLOOR);
}
