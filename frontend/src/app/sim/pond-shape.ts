import type { Box3 } from './tank';

/**
 * Forme du bassin vue de dessus (issue #190, ADR 0080) : rectangle (la boîte d'eau entière),
 * ovale (ellipse inscrite dans la boîte) ou haricot (ellipse creusée d'une échancrure ronde au
 * milieu du côté +Z, coins adoucis).
 *
 * La forme est décrite par une **distance signée au bord** dans le plan horizontal, positive
 * à l'intérieur (en mètres, approchée près du bord, exacte au signe). Tout s'en déduit : point
 * dans la forme, force d'évitement des bords, projection d'un poisson sorti, contour du rendu.
 * Fonctions pures et sans allocation (les normales sont écrites dans un vecteur fourni).
 */

/** Formes possibles du bassin ; `rectangle` est la forme par défaut (boîte d'eau entière). */
export const POND_SHAPES = ['rectangle', 'ovale', 'haricot'] as const;

export type PondShape = (typeof POND_SHAPES)[number];

/** Forme par défaut : celle d'avant l'issue #190. */
export const DEFAULT_POND_SHAPE: PondShape = 'rectangle';

/** Libellés des formes (panneau de contrôle). */
export const POND_SHAPE_LABELS: Readonly<Record<PondShape, string>> = {
  rectangle: 'Rectangle',
  ovale: 'Ovale',
  haricot: 'Haricot',
};

/** Vrai si `value` est une forme connue. */
export function isPondShape(value: unknown): value is PondShape {
  return typeof value === 'string' && (POND_SHAPES as readonly string[]).includes(value);
}

/**
 * Contour horizontal d'une forme dans une boîte d'eau : centre et demi-étendues en X et Z.
 * Ne dépend que de la boîte et de la forme (aucun état).
 */
export interface ShapeOutline {
  readonly shape: PondShape;
  readonly cx: number;
  readonly cz: number;
  readonly halfX: number;
  readonly halfZ: number;
}

/**
 * Échancrure du haricot, en fractions des demi-étendues : cercle de rayon
 * `BEAN_BITE_RADIUS · halfX`, qui mord le bord +Z de `BEAN_BITE_DEPTH · halfZ` (assez peu pour
 * que le centre de la boîte reste dans l'eau, loin du bord). `BEAN_SMOOTHING` (fraction de
 * `halfZ`) arrondit les deux pointes où l'échancrure rejoint l'ellipse.
 */
const BEAN_BITE_RADIUS = 0.5;
const BEAN_BITE_DEPTH = 0.42;
const BEAN_SMOOTHING = 0.25;
/** Pas des différences finies de la normale, en mètres. */
const GRADIENT_STEP = 1e-4;
/** Passes de projection le long de la normale, puis dichotomie vers le centre. */
const PROJECTION_PASSES = 3;
const BISECTION_STEPS = 24;
/** Échantillons du balayage d'un rayon du contour (`shapeContour`). */
const CONTOUR_SCAN = 64;

/** Contour de la forme `shape` dans la boîte `box` (seuls X et Z comptent). */
export function shapeOutline(shape: PondShape, box: Box3): ShapeOutline {
  return {
    shape,
    cx: (box.minX + box.maxX) / 2,
    cz: (box.minZ + box.maxZ) / 2,
    halfX: Math.max(0, (box.maxX - box.minX) / 2),
    halfZ: Math.max(0, (box.maxZ - box.minZ) / 2),
  };
}

/**
 * Distance signée du point `(x, z)` au bord de la forme, positive à l'intérieur, négative à
 * l'extérieur, nulle sur le bord (mètres). Rectangle : distance au bord de la boîte (exacte à
 * l'intérieur ; −∞ pour une boîte vide ou plate). Ovale : approximation du premier ordre de la distance à l'ellipse, exacte sur
 * le bord et sur les axes. Haricot : intersection adoucie de l'ovale et de l'extérieur du
 * cercle d'échancrure (toujours au plus la plus petite des deux distances).
 */
export function shapeDistance(outline: ShapeOutline, x: number, z: number): number {
  const u = x - outline.cx;
  const v = z - outline.cz;
  const { halfX, halfZ } = outline;
  if (!(halfX > 0) || !(halfZ > 0)) {
    return Number.NEGATIVE_INFINITY; // boîte dégénérée : aucune eau
  }
  if (outline.shape === 'rectangle') {
    const dx = halfX - Math.abs(u);
    const dz = halfZ - Math.abs(v);
    if (dx >= 0 && dz >= 0) {
      return Math.min(dx, dz);
    }
    return -Math.hypot(Math.min(0, dx), Math.min(0, dz));
  }
  const ellipse = ellipseDistance(u, v, halfX, halfZ);
  if (outline.shape === 'ovale') {
    return ellipse;
  }
  const r = BEAN_BITE_RADIUS * halfX;
  const bz = halfZ + r - BEAN_BITE_DEPTH * halfZ;
  const bite = Math.hypot(u, v - bz) - r;
  return smoothMin(ellipse, bite, BEAN_SMOOTHING * halfZ);
}

/** Vrai si `(x, z)` est dans la forme, à au moins `margin` mètres du bord. */
export function insideShape(outline: ShapeOutline, x: number, z: number, margin = 0): boolean {
  return shapeDistance(outline, x, z) >= margin;
}

/**
 * Normale intérieure (vers l'eau) au point `(x, z)`, unitaire, écrite dans `out` (`out.x`,
 * `out.z`) et renvoyée : gradient de `shapeDistance` par différences centrées. Au centre d'un
 * ovale ou là où le gradient s'annule, `(0, 0)`.
 */
export function shapeNormal<T extends { x: number; z: number }>(
  outline: ShapeOutline,
  x: number,
  z: number,
  out: T,
): T {
  const h = GRADIENT_STEP;
  const gx = shapeDistance(outline, x + h, z) - shapeDistance(outline, x - h, z);
  const gz = shapeDistance(outline, x, z + h) - shapeDistance(outline, x, z - h);
  const n = Math.hypot(gx, gz);
  out.x = n > 0 ? gx / n : 0;
  out.z = n > 0 ? gz / n : 0;
  return out;
}

const SCRATCH: { x: number; z: number } = { x: 0, z: 0 };

/**
 * Ramène `(x, z)` dans la forme, à au moins `margin` du bord, et écrit le résultat dans `out`
 * (renvoyé) ; un point déjà dedans est recopié tel quel. D'abord quelques projections le long
 * de la normale intérieure, puis, si cela ne suffit pas (marge plus grande que la forme, point
 * très loin), une dichotomie sur le segment vers le centre de la boîte, dont le résultat est
 * toujours dedans dès que le centre l'est. Sans allocation.
 */
export function constrainToShape<T extends { x: number; z: number }>(
  outline: ShapeOutline,
  x: number,
  z: number,
  margin: number,
  out: T,
): T {
  let px = x;
  let pz = z;
  for (let pass = 0; pass < PROJECTION_PASSES; pass++) {
    const d = shapeDistance(outline, px, pz);
    if (d >= margin) {
      out.x = px;
      out.z = pz;
      return out;
    }
    shapeNormal(outline, px, pz, SCRATCH);
    if (SCRATCH.x === 0 && SCRATCH.z === 0) {
      break;
    }
    // Un peu au-delà de la marge : la distance est approchée, la passe suivante corrige.
    const push = margin - d + 1e-6;
    px += SCRATCH.x * push;
    pz += SCRATCH.z * push;
  }
  if (shapeDistance(outline, px, pz) >= margin) {
    out.x = px;
    out.z = pz;
    return out;
  }
  // Dichotomie entre le centre (dedans, sinon renvoyé tel quel) et le point de départ.
  const { cx, cz } = outline;
  if (shapeDistance(outline, cx, cz) < margin) {
    out.x = cx;
    out.z = cz;
    return out;
  }
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < BISECTION_STEPS; i++) {
    const t = (lo + hi) / 2;
    if (shapeDistance(outline, cx + (x - cx) * t, cz + (z - cz) * t) >= margin) {
      lo = t;
    } else {
      hi = t;
    }
  }
  out.x = cx + (x - cx) * lo;
  out.z = cz + (z - cz) * lo;
  return out;
}

/**
 * Points du bord de la forme, `count` au moins 3, dans le sens des angles croissants autour
 * du centre (de +X vers +Z) : pour chaque angle, le point du rayon où la distance s'annule
 * (dichotomie, le plus lointain point intérieur du rayon). Écrits à plat `[x0, z0, x1, z1…]`.
 * Utilisé par le rendu (eau, sol, margelle).
 * @throws RangeError si `count` n'est pas un entier ≥ 3.
 */
export function shapeContour(outline: ShapeOutline, count: number): number[] {
  if (!Number.isInteger(count) || count < 3) {
    throw new RangeError(`count doit être un entier ≥ 3 (reçu : ${count})`);
  }
  const { cx, cz, halfX, halfZ } = outline;
  const reach = Math.hypot(halfX, halfZ) + 1e-9;
  const points: number[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    // Point intérieur le plus lointain du rayon : balayage depuis l'extérieur, puis dichotomie
    // entre le premier échantillon intérieur et le précédent (robuste à une forme non étoilée).
    let lo = 0;
    let hi = reach;
    for (let s = CONTOUR_SCAN - 1; s >= 0; s--) {
      const t = (reach * s) / CONTOUR_SCAN;
      if (shapeDistance(outline, cx + dx * t, cz + dz * t) >= 0) {
        lo = t;
        hi = (reach * (s + 1)) / CONTOUR_SCAN;
        break;
      }
    }
    for (let k = 0; k < 40; k++) {
      const t = (lo + hi) / 2;
      if (shapeDistance(outline, cx + dx * t, cz + dz * t) >= 0) {
        lo = t;
      } else {
        hi = t;
      }
    }
    points.push(cx + dx * lo, cz + dz * lo);
  }
  return points;
}

/**
 * Distance signée approchée à l'ellipse de demi-axes `a`, `b` centrée en 0, positive à
 * l'intérieur : `−k0 (k0 − 1) / k1` (développement au premier ordre de la fonction implicite,
 * exact sur le bord et le long des axes). Au centre, le plus petit demi-axe.
 */
function ellipseDistance(u: number, v: number, a: number, b: number): number {
  const k0 = Math.hypot(u / a, v / b);
  const k1 = Math.hypot(u / (a * a), v / (b * b));
  if (!(k1 > 1e-12)) {
    return Math.min(a, b);
  }
  return (-k0 * (k0 - 1)) / k1;
}

/** Minimum adouci (polynomial) de `a` et `b`, de rayon `k` : toujours ≤ `min(a, b)`. */
function smoothMin(a: number, b: number, k: number): number {
  if (!(k > 0)) {
    return Math.min(a, b);
  }
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - (h * h * k) / 4;
}

/**
 * Ramène en place le point `p` (`p.x`, `p.z`) dans la forme à `margin` du bord
 * (`constrainToShape`) ; sans effet s'il y est déjà. Sans allocation.
 */
export function keepInShape(
  p: { x: number; z: number },
  outline: ShapeOutline,
  margin: number,
): void {
  if (shapeDistance(outline, p.x, p.z) >= margin) {
    return;
  }
  constrainToShape(outline, p.x, p.z, margin, KEEP_SCRATCH);
  p.x = KEEP_SCRATCH.x;
  p.z = KEEP_SCRATCH.z;
}

const KEEP_SCRATCH: { x: number; z: number } = { x: 0, z: 0 };
