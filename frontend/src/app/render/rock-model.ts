import { BufferAttribute, BufferGeometry, Color } from 'three';

import type { RockCell, RockModel } from '../sim/decor';
import { PALETTE } from './palette';

/**
 * Maillage voxel d'un rocher (`sim/decor.ts`, ADR 0015) et coque de son contour.
 *
 * Couleurs plates de la palette, comme les poissons (ADR 0009) : dessus `roche`, quelques
 * dessus poudrés de sable (`sableOmbre`), flancs `roche` ou `rocheSombre` (base et taches),
 * choisis par un hachage déterministe du voxel et de la graine. Seules les faces dont le
 * voisin est vide sont émises ; la face du dessous de la rangée enterrée (j = 0) est omise.
 */

/** Données brutes d'un maillage voxel (non indexé), testables sans WebGL. */
export interface VoxelMeshData {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly colors: Float32Array;
  /**
   * Normales lissées (moyenne des faces émises partageant le sommet), pour la coque du
   * contour : une coque gonflée selon les normales des faces s'ouvrirait aux arêtes.
   */
  readonly smoothNormals: Float32Array;
  /** Indice, dans la liste des voxels, du voxel de chaque sommet. */
  readonly vertexCells: Uint32Array;
  readonly quads: number;
}

/** Données brutes du maillage d'un rocher. */
export type RockMeshData = VoxelMeshData;

/** Couleurs d'un rocher, dans l'ordre : dessus, dessus poudré, flanc clair, flanc sombre. */
export const ROCK_COLORS = {
  top: PALETTE.roche,
  dusted: PALETTE.sableOmbre,
  side: PALETTE.roche,
  shade: PALETTE.rocheSombre,
} as const;

/** Rangées du bas (en voxels) toujours sombres : ombre de contact avec le sable. */
const SHADED_BASE_ROWS = 1;

type Corner = readonly [number, number, number];

interface Face {
  readonly d: Corner;
  readonly corners: readonly Corner[];
}

function quad(a: Corner, b: Corner, c: Corner, d: Corner): Corner[] {
  return [a, b, c, a, c, d];
}

/**
 * Six faces d'un cube unité, triangles dans le sens antihoraire vus de l'extérieur ; partagées
 * avec la pièce (`render/room-layer.ts`).
 */
export const FACES: readonly Face[] = [
  { d: [1, 0, 0], corners: quad([1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]) },
  { d: [-1, 0, 0], corners: quad([0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]) },
  { d: [0, 1, 0], corners: quad([0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]) },
  { d: [0, -1, 0], corners: quad([0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]) },
  { d: [0, 0, 1], corners: quad([0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]) },
  { d: [0, 0, -1], corners: quad([1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]) },
];

/** Hachage entier déterministe d'un voxel et d'une graine, dans [0, 1). */
export function cellHash(seed: number, i: number, j: number, k: number): number {
  let h =
    (seed ^ Math.imul(i, 0x27d4eb2d) ^ Math.imul(j, 0x165667b1) ^ Math.imul(k, 0x9e3779b1)) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Couleur (nom de palette résolu) d'une face d'un voxel. */
export function rockFaceColor(seed: number, cell: RockCell, up: boolean): string {
  const h = cellHash(seed, cell.i, cell.j, cell.k);
  if (up) {
    return h < 0.15 ? ROCK_COLORS.dusted : ROCK_COLORS.top;
  }
  return cell.j < SHADED_BASE_ROWS || h < 0.3 ? ROCK_COLORS.shade : ROCK_COLORS.side;
}

/**
 * Maillage d'un rocher dans son repère local (mètres, Y = 0 à la base), centré sur l'origine
 * comme son modèle. `seed` choisit les couleurs (même graine, même rocher).
 */
export function buildRockMesh(model: RockModel, seed: number): RockMeshData {
  return buildVoxelMesh(model.cells, model.voxelSize, (cell, up) => rockFaceColor(seed, cell, up));
}

/**
 * Maillage voxel générique (rochers, plantes) : seules les faces dont le voisin est vide
 * sont émises ; la face du dessous de la rangée enterrée (j = 0) est omise. `colorOf`
 * donne la couleur (palette, `#rrggbb`) d'une face, `up` pour le dessus.
 */
export function buildVoxelMesh<C extends RockCell>(
  cells: readonly C[],
  voxelSize: number,
  colorOf: (cell: C, up: boolean) => string,
): VoxelMeshData {
  const key = (i: number, j: number, k: number): string => `${i},${j},${k}`;
  const filled = new Set(cells.map((c) => key(c.i, c.j, c.k)));
  const linear = new Map<string, [number, number, number]>();
  const v = voxelSize;
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const vertexCells: number[] = [];
  let quads = 0;
  cells.forEach((cell, index) => {
    for (const face of FACES) {
      const [dx, dy, dz] = face.d;
      if (filled.has(key(cell.i + dx, cell.j + dy, cell.k + dz))) {
        continue;
      }
      if (dy < 0 && cell.j === 0) {
        continue; // dessous enterré
      }
      const hex = colorOf(cell, dy > 0);
      let color = linear.get(hex);
      if (!color) {
        const c = new Color(hex);
        color = [c.r, c.g, c.b];
        linear.set(hex, color);
      }
      quads++;
      for (const corner of face.corners) {
        positions.push(
          (cell.i + corner[0]) * v,
          (cell.j + corner[1]) * v,
          (cell.k + corner[2]) * v,
        );
        normals.push(dx, dy, dz);
        colors.push(color[0], color[1], color[2]);
        vertexCells.push(index);
      }
    }
  });
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    colors: new Float32Array(colors),
    smoothNormals: smoothNormals(positions, normals),
    vertexCells: new Uint32Array(vertexCells),
    quads,
  };
}

function smoothNormals(positions: readonly number[], normals: readonly number[]): Float32Array {
  const sums = new Map<string, [number, number, number]>();
  const keyAt = (n: number): string =>
    `${positions[n].toFixed(6)},${positions[n + 1].toFixed(6)},${positions[n + 2].toFixed(6)}`;
  for (let n = 0; n < positions.length; n += 3) {
    const k = keyAt(n);
    const sum = sums.get(k) ?? [0, 0, 0];
    sum[0] += normals[n];
    sum[1] += normals[n + 1];
    sum[2] += normals[n + 2];
    sums.set(k, sum);
  }
  const out = new Float32Array(positions.length);
  for (let n = 0; n < positions.length; n += 3) {
    const [x, y, z] = sums.get(keyAt(n)) as [number, number, number];
    const len = Math.hypot(x, y, z);
    // Somme nulle (sommet partagé par des faces opposées) : normale de la face.
    if (len < 1e-9) {
      out.set([normals[n], normals[n + 1], normals[n + 2]], n);
    } else {
      out.set([x / len, y / len, z / len], n);
    }
  }
  return out;
}

/** Géométrie Three.js du rocher (positions, normales des faces, couleurs). */
export function createRockGeometry(data: VoxelMeshData): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(data.positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(data.normals, 3));
  geometry.setAttribute('color', new BufferAttribute(data.colors, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

/** Géométrie de la coque du contour : mêmes positions, normales lissées. */
export function createOutlineGeometry(data: VoxelMeshData): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(data.positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(data.smoothNormals, 3));
  geometry.computeBoundingSphere();
  return geometry;
}
