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

/**
 * Volume d'eau : du dessus du sable à la surface, paroi à paroi. `levelRatio` : niveau de
 * l'eau en fraction de la hauteur (`Environment.waterLevel` ; `WATER_LEVEL_RATIO` par défaut).
 */
export function waterVolume(
  dims: TankDimensions = DEFAULT_TANK,
  levelRatio: number = WATER_LEVEL_RATIO,
): Box3 {
  return {
    minX: -dims.width / 2,
    maxX: dims.width / 2,
    minY: SAND_THICKNESS,
    maxY: Math.max(dims.height * levelRatio, SAND_THICKNESS),
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

/** Intervalle réglable d'une dimension du bac, en mètres, parcouru par pas de `step`. */
export interface DimensionRange {
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

/**
 * Bornes des dimensions réglables du bac (issue #171) : de 60 × 50 × 30 cm à
 * 200 × 90 × 90 cm. `DEFAULT_TANK` tombe sur un pas de chaque intervalle. Hauteur d'au
 * moins 50 cm : la plus haute plante du décor (45 voxels de 8 mm sur le sable) reste sous
 * l'eau.
 */
export const TANK_LIMITS: Readonly<Record<keyof TankDimensions, DimensionRange>> = {
  width: { min: 0.6, max: 2, step: 0.1 },
  height: { min: 0.5, max: 0.9, step: 0.05 },
  depth: { min: 0.3, max: 0.9, step: 0.05 },
};

/** Plus grand bac réglable (`TANK_LIMITS`). */
export const MAX_TANK: TankDimensions = {
  width: TANK_LIMITS.width.max,
  height: TANK_LIMITS.height.max,
  depth: TANK_LIMITS.depth.max,
};

/**
 * Valeur `value` bornée à `range` et ramenée au pas le plus proche (arrondie au micron, pour
 * que `0.6 + 6 × 0.1` donne exactement `1.2`). Une valeur non finie donne `fallback`.
 */
export function clampDimension(value: number, range: DimensionRange, fallback: number): number {
  const v = Number.isFinite(value) ? value : fallback;
  const bounded = Math.min(range.max, Math.max(range.min, v));
  const snapped = range.min + Math.round((bounded - range.min) / range.step) * range.step;
  return Math.round(Math.min(range.max, snapped) * 1e6) / 1e6;
}

/**
 * Dimensions `dims` bornées à `TANK_LIMITS`, au pas (`clampDimension`) : une valeur hors des
 * bornes est ramenée à la borne, jamais refusée ; une valeur non finie prend celle de
 * `DEFAULT_TANK`. Renvoie un nouvel objet.
 */
export function clampTankDimensions(dims: TankDimensions): TankDimensions {
  return {
    width: clampDimension(dims.width, TANK_LIMITS.width, DEFAULT_TANK.width),
    height: clampDimension(dims.height, TANK_LIMITS.height, DEFAULT_TANK.height),
    depth: clampDimension(dims.depth, TANK_LIMITS.depth, DEFAULT_TANK.depth),
  };
}

/** Vrai si `a` et `b` ont exactement les mêmes dimensions. */
export function sameDimensions(a: TankDimensions, b: TankDimensions): boolean {
  return a.width === b.width && a.height === b.height && a.depth === b.depth;
}
