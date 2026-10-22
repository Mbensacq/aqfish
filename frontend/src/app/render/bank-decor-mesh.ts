import { Group, Mesh, MeshLambertMaterial } from 'three';

import type { BankDecor, MossPatch, Root } from '../sim/bank-decor';
import type { RockCell } from '../sim/decor';
import type { Box3 } from '../sim/tank';
import type { TerrainSettings } from '../sim/terrain';
import { PALETTE } from './palette';
import { buildVoxelMesh, cellHash, createRockGeometry, type VoxelMeshData } from './rock-model';
import { TERRAIN_STEP, terrainGrid, type TerrainGrid } from './terrain-mesh';

/**
 * Mousses et racines de la berge du paludarium (issue #132, ADR 0038), dessinées en voxels
 * comme les rochers (`render/rock-model.ts`), éclairées comme le sol (`MeshLambertMaterial`).
 *
 * - **Mousse** : voxels de `MOSS_VOXEL` posés sur les colonnes **dessinées** du sol
 *   (`terrainGrid`, hauteurs arrondies), pas sur la carte de hauteurs exacte : le tapis épouse
 *   les marches de la berge sans flotter ni s'y enfoncer. Bord irrégulier et quelques coussins
 *   d'un voxel de plus, tirés d'un hachage de la cellule.
 * - **Racine** : voxels de `ROOT_VOXEL` dont le centre est à moins du rayon local de la ligne
 *   de la racine (`sim/bank-decor.ts`).
 */

/** Arête d'un voxel de mousse : le pas de hauteur du sol, pour poser le tapis sur les marches. */
export const MOSS_VOXEL = TERRAIN_STEP;
/** Arête d'un voxel de racine (mètres). */
export const ROOT_VOXEL = 0.008;

/** Couleurs de la mousse : dessus, dessus clair (rare), flancs. */
export const MOSS_COLORS = {
  top: PALETTE.vegetation,
  light: PALETTE.vegetationClaire,
  side: PALETTE.vegetation,
} as const;
/** Couleurs des racines : dessus, flancs, nœuds sombres. */
export const ROOT_COLORS = {
  top: PALETTE.sableOmbre,
  side: PALETTE.rocheSombre,
} as const;

/** Part des cellules d'un tapis qui portent un coussin (un voxel de plus), loin du bord. */
const MOSS_CUSHION_SHARE = 0.3;
/** Part des dessus de mousse en ton clair. */
const MOSS_LIGHT_SHARE = 0.3;

/**
 * Voxels de mousse de tous les tapis, dans le repère du bac (indices × `MOSS_VOXEL`) : pour
 * chaque cellule dont le centre tombe dans un tapis (bord irrégulier), un voxel au-dessus de
 * la colonne du sol, deux pour un coussin. Une cellule n'est comptée qu'une fois.
 */
export function mossCells(
  mosses: readonly MossPatch[],
  grid: TerrainGrid,
  water: Box3,
): RockCell[] {
  const cells: RockCell[] = [];
  const seen = new Set<string>();
  const width = water.maxX - water.minX;
  const depth = water.maxZ - water.minZ;
  for (const patch of mosses) {
    const i0 = Math.floor((patch.x - patch.radius) / MOSS_VOXEL);
    const i1 = Math.ceil((patch.x + patch.radius) / MOSS_VOXEL);
    const k0 = Math.floor((patch.z - patch.radius) / MOSS_VOXEL);
    const k1 = Math.ceil((patch.z + patch.radius) / MOSS_VOXEL);
    for (let i = i0; i < i1; i++) {
      for (let k = k0; k < k1; k++) {
        const cx = (i + 0.5) * MOSS_VOXEL;
        const cz = (k + 0.5) * MOSS_VOXEL;
        const d = Math.hypot(cx - patch.x, cz - patch.z) / patch.radius;
        // Bord en lobes (forme propre au tapis) et irrégulier à la cellule près, sans jamais
        // sortir du disque (placé tout entier sur la terre, `sim/bank-decor.ts`).
        const angle = Math.atan2(cz - patch.z, cx - patch.x);
        const lobes =
          0.12 * Math.sin(3 * angle + patch.id * 2.4) + 0.06 * Math.sin(5 * angle + patch.id);
        const h = cellHash(patch.id + 0x6d055, i, 0, k);
        if (d > Math.min(1, 0.8 + lobes + 0.16 * h) || seen.has(`${i},${k}`)) {
          continue;
        }
        const column = Math.floor(((cx - water.minX) / width) * grid.columns);
        const row = Math.floor(((cz - water.minZ) / depth) * grid.rows);
        if (column < 0 || row < 0 || column >= grid.columns || row >= grid.rows) {
          continue;
        }
        const ground = grid.cells[row * grid.columns + column];
        if (ground.submerged) {
          continue;
        }
        seen.add(`${i},${k}`);
        const j = Math.round(ground.height / MOSS_VOXEL);
        cells.push({ i, j, k });
        if (d < 0.6 && cellHash(patch.id + 0xc0551, i, 1, k) < MOSS_CUSHION_SHARE) {
          cells.push({ i, j: j + 1, k });
        }
      }
    }
  }
  return cells;
}

/** Voxels d'une racine : centre à moins du rayon local de sa ligne (indices × `ROOT_VOXEL`). */
export function rootCells(root: Root): RockCell[] {
  const pts = root.points;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x - p.radius);
    maxX = Math.max(maxX, p.x + p.radius);
    minY = Math.min(minY, p.y - p.radius);
    maxY = Math.max(maxY, p.y + p.radius);
    minZ = Math.min(minZ, p.z - p.radius);
    maxZ = Math.max(maxZ, p.z + p.radius);
  }
  const v = ROOT_VOXEL;
  const cells: RockCell[] = [];
  for (let j = Math.floor(minY / v); j < Math.ceil(maxY / v); j++) {
    for (let i = Math.floor(minX / v); i < Math.ceil(maxX / v); i++) {
      for (let k = Math.floor(minZ / v); k < Math.ceil(maxZ / v); k++) {
        if (insideRoot(root, (i + 0.5) * v, (j + 0.5) * v, (k + 0.5) * v)) {
          cells.push({ i, j, k });
        }
      }
    }
  }
  return cells;
}

/** Vrai si le point est à moins du rayon (interpolé) d'un tronçon de la racine. */
function insideRoot(root: Root, x: number, y: number, z: number): boolean {
  const pts = root.points;
  for (let s = 1; s < pts.length; s++) {
    const a = pts[s - 1];
    const b = pts[s];
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const vz = b.z - a.z;
    const len2 = vx * vx + vy * vy + vz * vz;
    const t =
      len2 > 0
        ? Math.min(Math.max(((x - a.x) * vx + (y - a.y) * vy + (z - a.z) * vz) / len2, 0), 1)
        : 0;
    const r = a.radius + (b.radius - a.radius) * t;
    const dx = x - (a.x + t * vx);
    const dy = y - (a.y + t * vy);
    const dz = z - (a.z + t * vz);
    if (dx * dx + dy * dy + dz * dz <= r * r) {
      return true;
    }
  }
  return false;
}

/** Maillage de la mousse (repère du bac). */
export function buildMossMesh(cells: readonly RockCell[]): VoxelMeshData {
  return buildVoxelMesh(cells, MOSS_VOXEL, (cell, up) => {
    if (!up) {
      return MOSS_COLORS.side;
    }
    return cellHash(0x6d055, cell.i, cell.j, cell.k) < MOSS_LIGHT_SHARE
      ? MOSS_COLORS.light
      : MOSS_COLORS.top;
  });
}

/** Maillage de toutes les racines (repère du bac). */
export function buildRootMesh(roots: readonly Root[]): VoxelMeshData {
  return buildVoxelMesh(roots.flatMap(rootCells), ROOT_VOXEL, (_cell, up) =>
    up ? ROOT_COLORS.top : ROOT_COLORS.side,
  );
}

/**
 * Objet Three.js du décor de berge : deux maillages opaques (`mousses`, `racines`), éclairés
 * comme le sol. Les racines sous l'eau sont donc teintées par elle, comme le fond.
 */
export function createBankDecorObject(
  decor: BankDecor,
  terrain: TerrainSettings,
  water: Box3,
): Group {
  const group = new Group();
  group.name = 'berge';
  const material = new MeshLambertMaterial({ vertexColors: true });
  const parts: [string, VoxelMeshData][] = [
    ['mousses', buildMossMesh(mossCells(decor.mosses, terrainGrid(terrain, water), water))],
    ['racines', buildRootMesh(decor.roots)],
  ];
  for (const [name, data] of parts) {
    if (data.quads === 0) {
      continue;
    }
    const mesh = new Mesh(createRockGeometry(data), material);
    mesh.name = name;
    group.add(mesh);
  }
  return group;
}
