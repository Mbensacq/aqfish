import type { GaugeLevel } from '../../sim/water-dashboard';

/** Côté des icônes de niveau, en pixels d'icône. */
export const LEVEL_ICON_GRID = 5;

/**
 * Icônes de niveau en pixel art (`#` plein, `.` vide) : coche (vert), point d'exclamation
 * (orange), croix (rouge). La forme distingue les niveaux sans la couleur.
 */
const LEVEL_ICON_MASKS: Readonly<Record<GaugeLevel, readonly string[]>> = {
  vert: ['.....', '....#', '...#.', '#.#..', '.#...'],
  orange: ['..#..', '..#..', '..#..', '.....', '..#..'],
  rouge: ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
};

/** Pixels pleins de l'icône d'un niveau, `[x, y]`. @throws Error si le masque est mal formé. */
export function levelIconPixels(level: GaugeLevel): readonly (readonly [number, number])[] {
  const mask = LEVEL_ICON_MASKS[level];
  if (mask.length !== LEVEL_ICON_GRID || mask.some((row) => row.length !== LEVEL_ICON_GRID)) {
    throw new Error(`Icône « ${level} » : grille ${LEVEL_ICON_GRID} × ${LEVEL_ICON_GRID} attendue`);
  }
  return mask.flatMap((row, y) =>
    [...row].flatMap((cell, x) => (cell === '#' ? [[x, y] as const] : [])),
  );
}
