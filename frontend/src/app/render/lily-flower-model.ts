import { mix } from '../sim/daylight';
import { PALETTE } from './palette';

/**
 * Fleurs des nénuphars et des lotus (issue #104) : géométrie et pose des pétales, en données
 * brutes (tableaux), sans objet Three.js : testables sans WebGL.
 *
 * Une fleur est un cœur jaune entouré de deux couronnes de pétales roses. Chaque pétale est
 * un losange épais articulé à sa base : vertical (bouton fermé) quand l'ouverture vaut 0,
 * presque à plat quand elle vaut 1 (`petalTilt`). Repère local de la fleur : Y vers le haut,
 * base du cœur en y = 0.
 */

/** Couleurs de la fleur (docs/DA.md : nénuphar rose, cœur jaune ; tige de lotus sombre). */
export const LILY_FLOWER_COLORS = {
  petal: PALETTE.nenupharRose,
  core: PALETTE.coeurFleur,
  stalk: PALETTE.vegetationSombre,
} as const;

/** Couronne de pétales : nombre, base, taille et inclinaison fermée puis ouverte. */
export interface PetalRing {
  /** Nombre de pétales de la couronne. */
  readonly count: number;
  /** Distance de la base des pétales à l'axe de la fleur, en mètres. */
  readonly baseRadius: number;
  /** Longueur et largeur d'un pétale, en mètres. */
  readonly length: number;
  readonly width: number;
  /** Inclinaison depuis la verticale (radians), fleur fermée puis grande ouverte. */
  readonly closedTilt: number;
  readonly openTilt: number;
  /** Décalage angulaire de la couronne autour de l'axe (radians). */
  readonly phase: number;
}

/** Couronnes de pétales, de l'extérieur vers l'intérieur. */
export const PETAL_RINGS: readonly PetalRing[] = [
  {
    count: 8,
    baseRadius: 0.008,
    length: 0.048,
    width: 0.026,
    closedTilt: 0.16,
    openTilt: 1.25,
    phase: 0,
  },
  {
    count: 5,
    baseRadius: 0.004,
    length: 0.032,
    width: 0.018,
    closedTilt: 0.06,
    openTilt: 0.7,
    phase: Math.PI / 5,
  },
];

/** Épaisseur d'un pétale, en mètres. */
export const PETAL_THICKNESS = 0.003;
/** Rayon et hauteur du cœur, en mètres. */
export const FLOWER_CORE_RADIUS = 0.013;
export const FLOWER_CORE_HEIGHT = 0.012;
/** Taille d'une fleur de lotus, en multiple de celle d'un nénuphar. */
export const LOTUS_FLOWER_SCALE = 1.35;
/** Hauteur de la tige d'un lotus au-dessus de sa feuille, et sa demi-largeur, en mètres. */
export const LOTUS_STALK_HEIGHT = 0.07;
export const LOTUS_STALK_HALF_WIDTH = 0.004;
/**
 * Distance du pied de la fleur au centre de la feuille, en fraction du rayon de la feuille,
 * du côté opposé à l'encoche (−X local de la feuille).
 */
export const FLOWER_OFFSET_RATIO = 0.15;

/** Prisme convexe indexé (sommets partagés : normales lissées pour la coque du contour). */
export interface PrismData {
  readonly positions: Float32Array;
  readonly indices: Uint16Array;
}

type Point2 = readonly [number, number];

/**
 * Prisme convexe de section `polygon` (convexe, au moins 3 sommets) et d'épaisseur `depth`.
 * Axe `y` : sommets (x, z) du polygone, extrudés de y = 0 à y = `depth`. Axe `x` : sommets
 * (y, z), extrudés de x = −depth/2 à x = depth/2. Triangles orientés vers l'extérieur.
 * @throws RangeError si le polygone a moins de 3 sommets ou si `depth` n'est pas > 0.
 */
export function buildPrism(polygon: readonly Point2[], depth: number, axis: 'x' | 'y'): PrismData {
  if (polygon.length < 3) {
    throw new RangeError(`polygone de moins de 3 sommets (${polygon.length})`);
  }
  if (!(depth > 0) || !Number.isFinite(depth)) {
    throw new RangeError(`depth doit être un réel strictement positif (reçu : ${depth})`);
  }
  const n = polygon.length;
  const positions: number[] = [];
  for (const level of [0, 1]) {
    for (const [a, b] of polygon) {
      if (axis === 'y') {
        positions.push(a, level * depth, b);
      } else {
        positions.push((level - 0.5) * depth, a, b);
      }
    }
  }
  const triangles: [number, number, number][] = [];
  for (let i = 1; i < n - 1; i++) {
    triangles.push([0, i, i + 1], [n, n + i, n + i + 1]);
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    triangles.push([i, j, n + j], [i, n + j, n + i]);
  }
  const center = [0, 1, 2].map(
    (k) => positions.filter((_, index) => index % 3 === k).reduce((s, v) => s + v, 0) / (2 * n),
  );
  const at = (i: number) => [positions[3 * i], positions[3 * i + 1], positions[3 * i + 2]];
  const indices: number[] = [];
  for (const [i, j, k] of triangles) {
    const [a, b, c] = [at(i), at(j), at(k)];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const normal = [
      u[1] * v[2] - u[2] * v[1],
      u[2] * v[0] - u[0] * v[2],
      u[0] * v[1] - u[1] * v[0],
    ];
    const out = [0, 1, 2].map((m) => (a[m] + b[m] + c[m]) / 3 - center[m]);
    const facing = normal[0] * out[0] + normal[1] * out[1] + normal[2] * out[2];
    indices.push(...(facing >= 0 ? [i, j, k] : [i, k, j]));
  }
  return { positions: new Float32Array(positions), indices: new Uint16Array(indices) };
}

/**
 * Pétale de la couronne `ring` : losange dans le plan (Y, Z), base en (0, 0, 0), pointe en
 * (0, length, 0), plus large aux 45 % de sa longueur, épais de `PETAL_THICKNESS` selon X.
 */
export function buildPetal(ring: Pick<PetalRing, 'length' | 'width'>): PrismData {
  const { length, width } = ring;
  return buildPrism(
    [
      [0, 0],
      [0.45 * length, -width / 2],
      [length, 0],
      [0.45 * length, width / 2],
    ],
    PETAL_THICKNESS,
    'x',
  );
}

/** Cœur de la fleur : octogone de rayon `FLOWER_CORE_RADIUS`, haut de `FLOWER_CORE_HEIGHT`. */
export function buildFlowerCore(): PrismData {
  const polygon = Array.from({ length: 8 }, (_, i): Point2 => {
    const theta = (-2 * Math.PI * i) / 8;
    return [FLOWER_CORE_RADIUS * Math.cos(theta), FLOWER_CORE_RADIUS * Math.sin(theta)];
  });
  return buildPrism(polygon, FLOWER_CORE_HEIGHT, 'y');
}

/** Tige d'un lotus : section carrée de demi-largeur `LOTUS_STALK_HALF_WIDTH`, haute de `height`. */
export function buildLotusStalk(height = LOTUS_STALK_HEIGHT): PrismData {
  const w = LOTUS_STALK_HALF_WIDTH;
  return buildPrism(
    [
      [-w, -w],
      [w, -w],
      [w, w],
      [-w, w],
    ],
    height,
    'y',
  );
}

/**
 * Inclinaison d'un pétale de la couronne `ring` depuis la verticale (radians) pour
 * l'ouverture `openness` : exactement `closedTilt` à 0 et `openTilt` à 1, linéaire entre.
 * @throws RangeError si `openness` n'est pas dans [0, 1].
 */
export function petalTilt(
  ring: Pick<PetalRing, 'closedTilt' | 'openTilt'>,
  openness: number,
): number {
  if (!(openness >= 0 && openness <= 1)) {
    throw new RangeError(`ouverture hors de [0, 1] (reçu : ${openness})`);
  }
  return mix(ring.closedTilt, ring.openTilt, openness);
}

/**
 * Rayon de la fleur vue de dessus (mètres, à l'échelle 1) pour l'ouverture `openness` : plus
 * grande distance à l'axe d'un point des pétales ou du cœur.
 */
export function flowerSpread(openness: number): number {
  let spread = FLOWER_CORE_RADIUS;
  for (const ring of PETAL_RINGS) {
    const tilt = petalTilt(ring, openness);
    // Pointe du pétale et coins de sa partie large (demi-largeur hors du plan d'inclinaison).
    const tip = ring.baseRadius + ring.length * Math.sin(tilt);
    const wide = Math.hypot(ring.baseRadius + 0.45 * ring.length * Math.sin(tilt), ring.width / 2);
    spread = Math.max(spread, tip + PETAL_THICKNESS, wide + PETAL_THICKNESS);
  }
  return spread;
}
