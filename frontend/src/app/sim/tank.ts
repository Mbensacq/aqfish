/**
 * Géométrie du bac, partagée par la simulation (bornes de nage) et le rendu (scène, caméra).
 * Repère : Y vers le haut, origine au centre du fond du bac, unités en mètres.
 */

/** Dimensions intérieures du bac, en mètres. */
export interface TankDimensions {
  /** Longueur selon X. */
  readonly width: number;
  /** Hauteur selon Y. */
  readonly height: number;
  /** Profondeur selon Z. */
  readonly depth: number;
}

/** Boîte alignée sur les axes, en mètres. */
export interface Box3 {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/** Bac par défaut : 120 × 60 × 50 cm, un format courant de bac d'eau douce. */
export const DEFAULT_TANK: TankDimensions = { width: 1.2, height: 0.6, depth: 0.5 };

/** Épaisseur de la couche de sable, en mètres. */
export const SAND_THICKNESS = 0.06;

/** Niveau de l'eau, en fraction de la hauteur du bac. */
export const WATER_LEVEL_RATIO = 0.9;

/** Volume d'eau : du dessus du sable à la surface, paroi à paroi. */
export function waterVolume(dims: TankDimensions = DEFAULT_TANK): Box3 {
  return {
    minX: -dims.width / 2,
    maxX: dims.width / 2,
    minY: SAND_THICKNESS,
    maxY: Math.max(dims.height * WATER_LEVEL_RATIO, SAND_THICKNESS),
    minZ: -dims.depth / 2,
    maxZ: dims.depth / 2,
  };
}

/**
 * Boîte rétrécie de `margin` sur chaque face. Si la boîte est trop petite sur un axe, elle
 * se réduit au plan médian de cet axe (jamais de boîte inversée).
 * @throws RangeError si `margin` est négatif ou non fini.
 */
export function shrinkBox(box: Box3, margin: number): Box3 {
  if (!(margin >= 0) || !Number.isFinite(margin)) {
    throw new RangeError(`margin doit être un réel positif ou nul (reçu : ${margin})`);
  }
  const [minX, maxX] = shrinkAxis(box.minX, box.maxX, margin);
  const [minY, maxY] = shrinkAxis(box.minY, box.maxY, margin);
  const [minZ, maxZ] = shrinkAxis(box.minZ, box.maxZ, margin);
  return { minX, maxX, minY, maxY, minZ, maxZ };
}

function shrinkAxis(min: number, max: number, margin: number): [number, number] {
  if (max - min <= 2 * margin) {
    const mid = (min + max) / 2;
    return [mid, mid];
  }
  return [min + margin, max - margin];
}
