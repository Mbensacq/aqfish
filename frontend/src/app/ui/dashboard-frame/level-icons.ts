import type { GaugeLevel } from '../../sim/water-dashboard';
import type { JournalGroup } from '../../sim/journal';

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
  return maskPixels(mask);
}

/** Icône du rappel d'entretien (calendrier) : forme distincte des trois niveaux (#513). */
export const MAINTENANCE_ICON_PIXELS: readonly (readonly [number, number])[] = maskPixels([
  '#####',
  '#...#',
  '#.#.#',
  '#...#',
  '#####',
]);

/**
 * Chevron dessiné (#724) : pointe vers le bas, retourné quand la partie qu'il commande est
 * dépliée. Remplace les flèches de texte ▴ ▾ (charte : pas de flèche décorative).
 */
export const CHEVRON_ICON_PIXELS: readonly (readonly [number, number])[] = maskPixels([
  '.....',
  '#...#',
  '.#.#.',
  '..#..',
  '.....',
]);

/** Icône du bilan du bac (#514) : une liste de trois lignes. */
export const REVIEW_ICON_PIXELS: readonly (readonly [number, number])[] = maskPixels([
  '#.###',
  '.....',
  '#.###',
  '.....',
  '#.###',
]);

/**
 * Icônes des familles du journal (#655), une forme par famille : croix de soin (santé), œuf
 * (reproduction), raclette (entretien), point d'exclamation (alertes).
 */
const JOURNAL_ICON_MASKS: Readonly<Record<JournalGroup, readonly string[]>> = {
  sante: ['..#..', '..#..', '#####', '..#..', '..#..'],
  reproduction: ['..#..', '.###.', '#####', '#####', '.###.'],
  entretien: ['#####', '..#..', '..#..', '..#..', '..#..'],
  alertes: LEVEL_ICON_MASKS.orange,
};

/** Pixels pleins de l'icône de chaque famille du journal, `[x, y]`. */
export const JOURNAL_ICON_PIXELS: Readonly<
  Record<JournalGroup, readonly (readonly [number, number])[]>
> = {
  sante: maskPixels(JOURNAL_ICON_MASKS.sante),
  reproduction: maskPixels(JOURNAL_ICON_MASKS.reproduction),
  entretien: maskPixels(JOURNAL_ICON_MASKS.entretien),
  alertes: maskPixels(JOURNAL_ICON_MASKS.alertes),
};

/** Pixels pleins d'un masque (`#` plein, `.` vide), `[x, y]`, ligne par ligne. */
function maskPixels(mask: readonly string[]): readonly (readonly [number, number])[] {
  return mask.flatMap((row, y) =>
    [...row].flatMap((cell, x) => (cell === '#' ? [[x, y] as const] : [])),
  );
}
