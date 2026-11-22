/** Pixel plein d'une icône, `[x, y]` depuis le coin haut gauche. */
export type IconPixel = readonly [number, number];

/**
 * Pixels pleins d'un masque d'icône (`#` plein, `.` vide), ligne par ligne, pour une grille de
 * `grid` × `grid` (charte, `docs/INTERFACE.md` : icônes en pixels sur une grille de 12).
 * @throws RangeError si le masque n'a pas `grid` lignes de `grid` cases, ou contient un autre
 * caractère que `#` et `.`.
 */
export function iconPixels(mask: readonly string[], grid: number): readonly IconPixel[] {
  if (mask.length !== grid || mask.some((row) => row.length !== grid || /[^#.]/.test(row))) {
    throw new RangeError(
      `Masque d'icône : ${grid} lignes de ${grid} cases « # » ou « . » attendues`,
    );
  }
  return Object.freeze(
    mask.flatMap((row, y) =>
      [...row].flatMap((cell, x) => (cell === '#' ? [Object.freeze([x, y] as const)] : [])),
    ),
  );
}
