import { Color } from 'three';

import { PALETTE } from './palette';

/**
 * Maillage d'une feuille de nénuphar (issue #103) : disque plat à encoche, mince prisme dont
 * le dessus a deux tons (cœur et bord), plus une coque de contour et une ombre plate.
 * Données brutes (tableaux), sans objet Three.js : testables sans WebGL.
 *
 * Repère local : Y vers le haut, dessous de la feuille en y = 0, encoche centrée sur +X ;
 * l'angle θ d'un point du bord se mesure de +X vers +Z.
 */

/** Épaisseur de la feuille, en mètres. */
export const LILY_PAD_THICKNESS = 0.006;
/** Nombre de segments de l'arc du bord (hors encoche). */
export const LILY_PAD_SEGMENTS = 24;
/** Rayon du cœur clair, en fraction du rayon de la feuille. */
export const LILY_PAD_CORE_RATIO = 0.72;
/** Couleurs : cœur du dessus, bord du dessus, côtés et dessous (docs/DA.md : feuilles sombres). */
export const LILY_PAD_COLORS = {
  core: PALETTE.vegetation,
  rim: PALETTE.vegetationSombre,
  under: PALETTE.vegetationOmbre,
} as const;
/** Allongement maximal du décalage du contour au creux de l'encoche (évite une pointe). */
export const LILY_PAD_MAX_MITER = 3;

/** Maillage de la feuille : triangles indépendants (positions, normales, couleurs). */
export interface LilyPadMeshData {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly colors: Float32Array;
}

/**
 * Coque du contour : triangles du prisme sans le cœur, avec, par sommet, le vecteur de
 * décalage horizontal (`offsets`, longueur ≥ 1 aux coins : onglet) pour un contour d'épaisseur
 * constante, encoche comprise.
 */
export interface LilyPadHullData {
  readonly positions: Float32Array;
  readonly offsets: Float32Array;
}

type Vec3 = readonly [number, number, number];

/**
 * Angles des sommets du bord, de `notch` à `2π − notch` (bornes comprises).
 * @throws RangeError si `notch` n'est pas dans ]0, π/2[.
 */
export function lilyPadRimAngles(notch: number, segments = LILY_PAD_SEGMENTS): number[] {
  if (!(notch > 0 && notch < Math.PI / 2)) {
    throw new RangeError(`encoche invalide (reçu : ${notch})`);
  }
  if (!Number.isInteger(segments) || segments < 3) {
    throw new RangeError(`segments doit être un entier ≥ 3 (reçu : ${segments})`);
  }
  const span = 2 * Math.PI - 2 * notch;
  return Array.from({ length: segments + 1 }, (_, i) => notch + (span * i) / segments);
}

class TriangleBuffer {
  readonly positions: number[] = [];
  readonly normals: number[] = [];
  readonly colors: number[] = [];

  /** Triangle (a, b, c), dans l'ordre trigonométrique vu du côté de sa face avant. */
  push(a: Vec3, b: Vec3, c: Vec3, color: Color, normal?: Vec3): void {
    const n = normal ?? faceNormal(a, b, c);
    for (const p of [a, b, c]) {
      this.positions.push(...p);
      this.normals.push(...n);
      this.colors.push(color.r, color.g, color.b);
    }
  }
}

function faceNormal(a: Vec3, b: Vec3, c: Vec3): Vec3 {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const vx = c[0] - a[0];
  const vy = c[1] - a[1];
  const vz = c[2] - a[2];
  const x = uy * vz - uz * vy;
  const y = uz * vx - ux * vz;
  const z = ux * vy - uy * vx;
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
}

const point = (r: number, theta: number, y: number): Vec3 => [
  r * Math.cos(theta),
  y,
  r * Math.sin(theta),
];

/**
 * Maillage de la feuille de rayon `radius` et d'encoche `notch` (demi-ouverture, radians).
 * Dessus : cœur `LILY_PAD_COLORS.core` jusqu'à `LILY_PAD_CORE_RATIO`, puis bord
 * `LILY_PAD_COLORS.rim` ; côtés et dessous `LILY_PAD_COLORS.under`. Faces avant vers
 * l'extérieur du prisme.
 * @throws RangeError si `radius` n'est pas un réel strictement positif ou si `notch` est
 * invalide.
 */
export function buildLilyPadMesh(radius: number, notch: number): LilyPadMeshData {
  assertRadius(radius);
  const angles = lilyPadRimAngles(notch);
  const h = LILY_PAD_THICKNESS;
  const core = new Color(LILY_PAD_COLORS.core);
  const rim = new Color(LILY_PAD_COLORS.rim);
  const under = new Color(LILY_PAD_COLORS.under);
  const buffer = new TriangleBuffer();
  const top: Vec3 = [0, h, 0];
  const bottom: Vec3 = [0, 0, 0];
  const inner = radius * LILY_PAD_CORE_RATIO;
  for (let i = 0; i < angles.length - 1; i++) {
    const t0 = angles[i];
    const t1 = angles[i + 1];
    // Dessus (normale +Y : sommets dans l'ordre d'angle décroissant).
    buffer.push(top, point(inner, t1, h), point(inner, t0, h), core);
    const q0 = point(inner, t0, h);
    const q1 = point(inner, t1, h);
    const p0 = point(radius, t0, h);
    const p1 = point(radius, t1, h);
    buffer.push(q0, q1, p1, rim);
    buffer.push(q0, p1, p0, rim);
    // Dessous (normale −Y).
    buffer.push(bottom, point(radius, t0, 0), point(radius, t1, 0), under);
    // Côté de l'arc (normale vers l'extérieur).
    const b0 = point(radius, t0, 0);
    const b1 = point(radius, t1, 0);
    buffer.push(b0, p0, p1, under);
    buffer.push(b0, p1, b1, under);
  }
  // Côtés de l'encoche : du centre au premier et au dernier sommet du bord.
  for (const [theta, flip] of [
    [angles[0], false],
    [angles.at(-1)!, true],
  ] as const) {
    const pt = point(radius, theta, h);
    const pb = point(radius, theta, 0);
    if (flip) {
      buffer.push(bottom, pt, top, under);
      buffer.push(bottom, pb, pt, under);
    } else {
      buffer.push(bottom, top, pt, under);
      buffer.push(bottom, pt, pb, under);
    }
  }
  return {
    positions: new Float32Array(buffer.positions),
    normals: new Float32Array(buffer.normals),
    colors: new Float32Array(buffer.colors),
  };
}

/**
 * Coque du contour de la feuille : le prisme (dessus, dessous, côtés) sans les deux tons du
 * dessus, et le décalage de chaque sommet. Sur l'arc, le décalage est radial (longueur 1) ;
 * aux deux coins de l'encoche, somme des normales de l'arc et du côté (onglet à angle
 * droit) ; au creux de l'encoche, onglet `1 / sin(notch)` vers +X, borné à
 * `LILY_PAD_MAX_MITER`.
 * @throws RangeError si `radius` ou `notch` est invalide.
 */
export function buildLilyPadHull(radius: number, notch: number): LilyPadHullData {
  assertRadius(radius);
  const angles = lilyPadRimAngles(notch);
  const h = LILY_PAD_THICKNESS;
  const positions: number[] = [];
  const offsets: number[] = [];
  const last = angles.length - 1;
  const rimOffset = (i: number): Vec3 => {
    const theta = angles[i];
    const radial: Vec3 = [Math.cos(theta), 0, Math.sin(theta)];
    if (i === 0) {
      // Côté de l'encoche à l'angle `notch` : normale tournée vers l'encoche (angle − π/2).
      return [radial[0] + Math.sin(theta), 0, radial[2] - Math.cos(theta)];
    }
    if (i === last) {
      return [radial[0] - Math.sin(theta), 0, radial[2] + Math.cos(theta)];
    }
    return radial;
  };
  const centerOffset: Vec3 = [Math.min(1 / Math.sin(notch), LILY_PAD_MAX_MITER), 0, 0];
  const push = (...vertices: [Vec3, Vec3][]): void => {
    for (const [p, o] of vertices) {
      positions.push(...p);
      offsets.push(...o);
    }
  };
  const top: Vec3 = [0, h, 0];
  const bottom: Vec3 = [0, 0, 0];
  for (let i = 0; i < last; i++) {
    const o0 = rimOffset(i);
    const o1 = rimOffset(i + 1);
    const p0 = point(radius, angles[i], h);
    const p1 = point(radius, angles[i + 1], h);
    const b0 = point(radius, angles[i], 0);
    const b1 = point(radius, angles[i + 1], 0);
    push([top, centerOffset], [p1, o1], [p0, o0]);
    push([bottom, centerOffset], [b0, o0], [b1, o1]);
    push([b0, o0], [p0, o0], [p1, o1]);
    push([b0, o0], [p1, o1], [b1, o1]);
  }
  const first = [point(radius, angles[0], h), point(radius, angles[0], 0), rimOffset(0)] as const;
  const end = [
    point(radius, angles[last], h),
    point(radius, angles[last], 0),
    rimOffset(last),
  ] as const;
  push([bottom, centerOffset], [top, centerOffset], [first[0], first[2]]);
  push([bottom, centerOffset], [first[0], first[2]], [first[1], first[2]]);
  push([bottom, centerOffset], [end[0], end[2]], [top, centerOffset]);
  push([bottom, centerOffset], [end[1], end[2]], [end[0], end[2]]);
  return { positions: new Float32Array(positions), offsets: new Float32Array(offsets) };
}

/**
 * Ombre portée de la feuille : son contour (disque à encoche) à plat, faces vers le haut,
 * en y = 0 (positions seules).
 * @throws RangeError si `radius` ou `notch` est invalide.
 */
export function buildLilyPadShadow(radius: number, notch: number): Float32Array {
  assertRadius(radius);
  const angles = lilyPadRimAngles(notch);
  const positions: number[] = [];
  for (let i = 0; i < angles.length - 1; i++) {
    positions.push(0, 0, 0, ...point(radius, angles[i + 1], 0), ...point(radius, angles[i], 0));
  }
  return new Float32Array(positions);
}

function assertRadius(radius: number): void {
  if (!(radius > 0) || !Number.isFinite(radius)) {
    throw new RangeError(`radius doit être un réel strictement positif (reçu : ${radius})`);
  }
}
