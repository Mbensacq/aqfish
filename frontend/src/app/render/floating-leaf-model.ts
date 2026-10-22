import { Color } from 'three';

import { deriveSeed, prngNextState, prngOutput } from '../core/random/prng';
import { LEAF_SHAPE_COUNT, LEAF_TINT_COUNT } from '../sim/floating-leaves';
import { PALETTE } from './palette';

/**
 * Maillage d'une feuille morte flottante (issue #107) : mince prisme au contour irrégulier,
 * de longueur 1 (mise à l'échelle par la couche), dessus en deux tons de part et d'autre de
 * la nervure, plus une coque de contour d'un pixel. Données brutes, sans objet Three.js :
 * testables sans WebGL.
 *
 * Repère local : Y vers le haut, dessous en y = 0, pointe vers +X, base vers −X ; l'angle θ
 * d'un sommet du bord se mesure de +X vers +Z.
 */

/** Épaisseur de la feuille, en mètres (non mise à l'échelle). */
export const FLOATING_LEAF_THICKNESS = 0.003;
/** Sommets du bord. */
export const FLOATING_LEAF_VERTICES = 12;
/** Largeur relative à la longueur, tirée par forme. */
export const FLOATING_LEAF_WIDTH = { min: 0.45, max: 0.62 } as const;
/** Irrégularité du bord : écart relatif maximal du rayon de chaque sommet (hors pointe). */
export const FLOATING_LEAF_JAGGEDNESS = 0.22;
/** Allongement maximal du décalage du contour aux creux (évite une pointe). */
export const FLOATING_LEAF_MAX_MITER = 3;
/** Graine fixe des formes : les mêmes dans tous les mondes. */
export const FLOATING_LEAF_SHAPE_SEED = 0x5ea1eaf;

/**
 * Couleurs par teinte (`LEAF_TINT_COUNT`, 0 brune, 1 ocre) : moitié claire du dessus, moitié
 * sombre (de l'autre côté de la nervure), puis côtés et dessous. Tons chauds, plus clairs
 * que l'eau du bassin et sans vert : distincts des nénuphars et des rochers (gris `roche`
 * sous l'eau). Les gris de la roche rendaient les feuilles semblables aux pierres.
 */
export const FLOATING_LEAF_COLORS: readonly (readonly [string, string, string])[] = [
  [PALETTE.sableSombre, PALETTE.sableOmbre, PALETTE.rocheSombre],
  [PALETTE.tritonOrange, PALETTE.sableSombre, PALETTE.sableOmbre],
];

type Vec3 = readonly [number, number, number];

/** Sommet du bord : x, z (longueur 1). */
export type LeafOutline = readonly (readonly [number, number])[];

/**
 * Contour de la forme n° `shape` : `FLOATING_LEAF_VERTICES` sommets dans l'ordre de θ
 * croissant, autour de l'origine (toujours en étoile depuis elle). Pointe en (0,5, 0), base
 * en (−0,5, 0), plus large vers la base ; rayons des autres sommets tirés à
 * `FLOATING_LEAF_JAGGEDNESS` près, d'une graine fixe.
 * @throws RangeError si `shape` n'est pas un entier dans [0, `LEAF_SHAPE_COUNT`[.
 */
export function floatingLeafOutline(shape: number): LeafOutline {
  if (!Number.isInteger(shape) || shape < 0 || shape >= LEAF_SHAPE_COUNT) {
    throw new RangeError(`forme de feuille invalide : ${shape}`);
  }
  let state = deriveSeed(FLOATING_LEAF_SHAPE_SEED, shape);
  const next = (): number => {
    state = prngNextState(state);
    return prngOutput(state) / 4294967296;
  };
  const width =
    FLOATING_LEAF_WIDTH.min + (FLOATING_LEAF_WIDTH.max - FLOATING_LEAF_WIDTH.min) * next();
  return Array.from({ length: FLOATING_LEAF_VERTICES }, (_, i) => {
    const theta = (2 * Math.PI * i) / FLOATING_LEAF_VERTICES;
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    // Ellipse effilée vers la pointe (+X), sauf pointe et base, bord irrégulier.
    const jag = i === 0 ? 1 : 1 + FLOATING_LEAF_JAGGEDNESS * (2 * next() - 1);
    return [0.5 * c * jag, 0.5 * width * s * (1 - 0.35 * c) * jag] as const;
  });
}

/** Maillage de la feuille : triangles indépendants (positions, normales, couleurs). */
export interface FloatingLeafMeshData {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly colors: Float32Array;
}

/** Coque du contour : triangles du prisme et, par sommet, le décalage horizontal. */
export interface FloatingLeafHullData {
  readonly positions: Float32Array;
  readonly offsets: Float32Array;
}

/**
 * Maillage de la forme `outline` en teinte `tint` : dessus clair du côté +Z de la nervure
 * (axe X), sombre du côté −Z ; côtés et dessous sombres.
 * @throws RangeError si `tint` n'est pas un entier dans [0, `LEAF_TINT_COUNT`[.
 */
export function buildFloatingLeafMesh(outline: LeafOutline, tint: number): FloatingLeafMeshData {
  if (!Number.isInteger(tint) || tint < 0 || tint >= LEAF_TINT_COUNT) {
    throw new RangeError(`teinte de feuille invalide : ${tint}`);
  }
  const [light, dark, under] = FLOATING_LEAF_COLORS[tint].map((c) => new Color(c));
  const h = FLOATING_LEAF_THICKNESS;
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const push = (a: Vec3, b: Vec3, c: Vec3, color: Color, normal: Vec3): void => {
    for (const p of [a, b, c]) {
      positions.push(...p);
      normals.push(...normal);
      colors.push(color.r, color.g, color.b);
    }
  };
  const n = outline.length;
  for (let i = 0; i < n; i++) {
    const [x0, z0] = outline[i];
    const [x1, z1] = outline[(i + 1) % n];
    const t0: Vec3 = [x0, h, z0];
    const t1: Vec3 = [x1, h, z1];
    const b0: Vec3 = [x0, 0, z0];
    const b1: Vec3 = [x1, 0, z1];
    // Dessus (normale +Y : sens horaire vu de dessus dans le plan X-Z), ton selon le côté.
    push([0, h, 0], t1, t0, z0 + z1 >= 0 ? light : dark, [0, 1, 0]);
    push([0, 0, 0], b0, b1, under, [0, -1, 0]);
    const side = outwardNormal(x0, z0, x1, z1);
    push(b0, t0, t1, under, [side[0], 0, side[1]]);
    push(b0, t1, b1, under, [side[0], 0, side[1]]);
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    colors: new Float32Array(colors),
  };
}

/**
 * Coque du contour de `outline` : le prisme (dessus, dessous, côtés) et le décalage de chaque
 * sommet du bord, onglet des normales des deux arêtes voisines (longueur `1 / cos` du
 * demi-angle, bornée à `FLOATING_LEAF_MAX_MITER`) ; aucun décalage au centre.
 */
export function buildFloatingLeafHull(outline: LeafOutline): FloatingLeafHullData {
  const h = FLOATING_LEAF_THICKNESS;
  const n = outline.length;
  const miters = outline.map((_, i) => {
    const [xp, zp] = outline[(i + n - 1) % n];
    const [x, z] = outline[i];
    const [xn, zn] = outline[(i + 1) % n];
    const a = outwardNormal(xp, zp, x, z);
    const b = outwardNormal(x, z, xn, zn);
    const mx = a[0] + b[0];
    const mz = a[1] + b[1];
    const len = Math.hypot(mx, mz);
    if (len < 1e-9) {
      return [a[0], 0, a[1]] as Vec3;
    }
    const cos = (mx * a[0] + mz * a[1]) / len;
    const k = Math.min(1 / Math.max(cos, 1e-6), FLOATING_LEAF_MAX_MITER) / len;
    return [mx * k, 0, mz * k] as Vec3;
  });
  const positions: number[] = [];
  const offsets: number[] = [];
  const zero: Vec3 = [0, 0, 0];
  const push = (...vertices: [Vec3, Vec3][]): void => {
    for (const [p, o] of vertices) {
      positions.push(...p);
      offsets.push(...o);
    }
  };
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const t0: Vec3 = [outline[i][0], h, outline[i][1]];
    const t1: Vec3 = [outline[j][0], h, outline[j][1]];
    const b0: Vec3 = [outline[i][0], 0, outline[i][1]];
    const b1: Vec3 = [outline[j][0], 0, outline[j][1]];
    push([[0, h, 0], zero], [t1, miters[j]], [t0, miters[i]]);
    push([[0, 0, 0], zero], [b0, miters[i]], [b1, miters[j]]);
    push([b0, miters[i]], [t0, miters[i]], [t1, miters[j]]);
    push([b0, miters[i]], [t1, miters[j]], [b1, miters[j]]);
  }
  return { positions: new Float32Array(positions), offsets: new Float32Array(offsets) };
}

/** Normale unitaire (x, z) de l'arête (x0, z0) → (x1, z1), tournée à l'opposé de l'origine. */
export function outwardNormal(x0: number, z0: number, x1: number, z1: number): [number, number] {
  let nx = z1 - z0;
  let nz = -(x1 - x0);
  const len = Math.hypot(nx, nz) || 1;
  nx /= len;
  nz /= len;
  if (nx * (x0 + x1) + nz * (z0 + z1) < 0) {
    nx = -nx;
    nz = -nz;
  }
  return [nx, nz];
}
