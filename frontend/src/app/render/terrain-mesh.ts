import {
  BufferGeometry,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
} from 'three';

import type { Box3 } from '../sim/tank';
import { terrainAt, type TerrainKind, type TerrainSettings } from '../sim/terrain';
import { PALETTE, type PaletteColorName } from './palette';

/**
 * Sol du paludarium (issue #129, ADR 0034) : la carte de hauteurs de `sim/terrain.ts`
 * dessinée en colonnes, comme des voxels. Chaque cellule de `TERRAIN_CELL` est une colonne
 * dont la hauteur est arrondie à `TERRAIN_STEP` : des marches nettes, lisibles en pixel art.
 * Seules les faces visibles sont émises : dessus, flancs qui dépassent la colonne voisine,
 * flancs du bord du bac jusqu'à y = 0 (la coupe vue à travers la vitre) et un dessous d'un
 * seul tenant.
 */

/** Côté d'une cellule (en X et en Z, au plus), en mètres. */
export const TERRAIN_CELL = 0.02;
/** Pas de hauteur des colonnes, en mètres. */
export const TERRAIN_STEP = 0.01;

/** Couleurs (palette) du dessus et des flancs de chaque nature de sol. */
export const TERRAIN_COLORS: Readonly<
  Record<TerrainKind, { readonly top: PaletteColorName; readonly side: PaletteColorName }>
> = {
  fond: { top: 'sable', side: 'sableSombre' },
  terre: { top: 'sableSombre', side: 'sableSombre' },
  roche: { top: 'roche', side: 'rocheSombre' },
};

/** Colonne du sol : cellule [x0, x1] × [z0, z1], dessus à `height`. */
export interface TerrainColumn {
  readonly x0: number;
  readonly x1: number;
  readonly z0: number;
  readonly z1: number;
  readonly height: number;
  readonly kind: TerrainKind;
  readonly submerged: boolean;
}

/** Grille des colonnes, rangée par rangée (z), de `columns` colonnes (x) chacune. */
export interface TerrainGrid {
  readonly columns: number;
  readonly rows: number;
  readonly cells: readonly TerrainColumn[];
}

/**
 * Colonnes du sol sur le fond du volume d'eau `water` : sol échantillonné au centre de
 * chaque cellule (`terrainAt`), hauteur arrondie à `TERRAIN_STEP`. Une colonne émergée
 * dépasse la surface d'au moins un pas, une colonne immergée reste au moins un pas dessous
 * (sans descendre sous le fond du volume d'eau) : le rivage dessiné est celui de la carte.
 * Fonction pure.
 * @throws RangeError si le volume d'eau est vide en X ou en Z.
 */
export function terrainGrid(settings: TerrainSettings, water: Box3): TerrainGrid {
  const width = water.maxX - water.minX;
  const depth = water.maxZ - water.minZ;
  if (!(width > 0 && depth > 0)) {
    throw new RangeError(`volume d'eau vide : ${JSON.stringify(water)}`);
  }
  const columns = Math.ceil(width / TERRAIN_CELL - 1e-9);
  const rows = Math.ceil(depth / TERRAIN_CELL - 1e-9);
  const level = water.maxY;
  const cells: TerrainColumn[] = [];
  for (let j = 0; j < rows; j++) {
    const z0 = water.minZ + (depth * j) / rows;
    const z1 = water.minZ + (depth * (j + 1)) / rows;
    for (let i = 0; i < columns; i++) {
      const x0 = water.minX + (width * i) / columns;
      const x1 = water.minX + (width * (i + 1)) / columns;
      const sample = terrainAt((x0 + x1) / 2, (z0 + z1) / 2, settings, water);
      const rounded = Math.round(sample.height / TERRAIN_STEP) * TERRAIN_STEP;
      const height = sample.submerged
        ? Math.max(Math.min(rounded, level - TERRAIN_STEP), water.minY)
        : Math.max(rounded, level + TERRAIN_STEP);
      cells.push({ x0, x1, z0, z1, height, kind: sample.kind, submerged: sample.submerged });
    }
  }
  return { columns, rows, cells };
}

/** Ordre des matériaux du maillage : dessus puis flancs de chaque nature, puis dessous. */
const KINDS: readonly TerrainKind[] = ['fond', 'terre', 'roche'];
const BOTTOM_GROUP = KINDS.length * 2;

export interface TerrainMesh {
  readonly mesh: Mesh;
  /** Matériau du dessous (non éclairé), teinté la nuit comme le dessous du sable. */
  readonly bottom: MeshBasicMaterial;
}

/**
 * Maillage du sol : dessus et flancs éclairés (`MeshLambertMaterial`, comme le sable du bac),
 * dessous non éclairé de couleur `bottomColor` (vue de dessous, ADR 0006).
 */
export function createTerrainMesh(
  settings: TerrainSettings,
  water: Box3,
  bottomColor: string,
): TerrainMesh {
  const grid = terrainGrid(settings, water);
  const groups: number[][] = Array.from({ length: BOTTOM_GROUP + 1 }, () => []);
  const normals: number[][] = Array.from({ length: BOTTOM_GROUP + 1 }, () => []);
  const at = (i: number, j: number) =>
    i < 0 || j < 0 || i >= grid.columns || j >= grid.rows ? null : grid.cells[j * grid.columns + i];

  for (let j = 0; j < grid.rows; j++) {
    for (let i = 0; i < grid.columns; i++) {
      const c = grid.cells[j * grid.columns + i];
      const kind = KINDS.indexOf(c.kind);
      const top = groups[kind * 2];
      const h = c.height;
      pushQuad(
        top,
        normals[kind * 2],
        [0, 1, 0],
        [
          [c.x0, h, c.z1],
          [c.x1, h, c.z1],
          [c.x1, h, c.z0],
          [c.x0, h, c.z0],
        ],
      );
      // Flancs : de la hauteur de la voisine jusqu'au dessus ; au bord du bac, depuis y = 0
      // (coupe vue à travers la vitre), en flanc de terre sous une bosse de roche, pour qu'elle
      // ne descende pas en colonne jusqu'au fond.
      const inner = kind * 2 + 1;
      const edge = c.kind === 'roche' ? KINDS.indexOf('terre') * 2 + 1 : inner;
      for (const face of sideFaces(c)) {
        const neighbour = at(i + face.di, j + face.dj);
        if (neighbour) {
          if (neighbour.height < h) {
            pushQuad(groups[inner], normals[inner], face.normal, [
              [face.left[0], neighbour.height, face.left[1]],
              [face.right[0], neighbour.height, face.right[1]],
              [face.right[0], h, face.right[1]],
              [face.left[0], h, face.left[1]],
            ]);
          }
          continue;
        }
        // Coupe au bord : les colonnes voisines le long de la vitre partagent un bord
        // vertical de 0 à la plus basse des deux hauteurs ; un sommet à cette hauteur des
        // deux côtés évite les jonctions en T, qui laissaient passer des pixels du fond.
        const leftCell = at(i + face.left[2], j + face.left[3]);
        const rightCell = at(i + face.right[2], j + face.right[3]);
        pushCut(
          groups[edge],
          normals[edge],
          face.normal,
          face.left,
          face.right,
          h,
          Math.min(h, leftCell?.height ?? h),
          Math.min(h, rightCell?.height ?? h),
        );
      }
    }
  }
  pushQuad(
    groups[BOTTOM_GROUP],
    normals[BOTTOM_GROUP],
    [0, -1, 0],
    [
      [water.minX, 0, water.minZ],
      [water.maxX, 0, water.minZ],
      [water.maxX, 0, water.maxZ],
      [water.minX, 0, water.maxZ],
    ],
  );

  const geometry = new BufferGeometry();
  const positions: number[] = [];
  const allNormals: number[] = [];
  groups.forEach((group, index) => {
    const start = positions.length / 3;
    positions.push(...group);
    allNormals.push(...normals[index]);
    geometry.addGroup(start, group.length / 3, index);
  });
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(allNormals, 3));

  const bottom = new MeshBasicMaterial({ color: bottomColor });
  const materials = KINDS.flatMap((kind) => [
    new MeshLambertMaterial({ color: PALETTE[TERRAIN_COLORS[kind].top] }),
    new MeshLambertMaterial({ color: PALETTE[TERRAIN_COLORS[kind].side] }),
  ]);
  const mesh = new Mesh(geometry, [...materials, bottom]);
  mesh.name = 'sol-paludarium';
  return { mesh, bottom };
}

type Vertex = readonly [number, number, number];

/**
 * Coin bas d'un flanc vu de l'extérieur : (x, z), puis le décalage (di, dj) de la colonne
 * voisine de ce côté le long du flanc.
 */
type Corner = readonly [number, number, number, number];

interface SideFace {
  readonly normal: Vertex;
  /** Décalage de la colonne voisine en face du flanc. */
  readonly di: number;
  readonly dj: number;
  /** Coins gauche et droit, vus de l'extérieur (sens direct). */
  readonly left: Corner;
  readonly right: Corner;
}

/** Les quatre flancs d'une colonne (est, ouest, sud, nord). */
function sideFaces(c: TerrainColumn): SideFace[] {
  return [
    { normal: [1, 0, 0], di: 1, dj: 0, left: [c.x1, c.z1, 0, 1], right: [c.x1, c.z0, 0, -1] },
    { normal: [-1, 0, 0], di: -1, dj: 0, left: [c.x0, c.z0, 0, -1], right: [c.x0, c.z1, 0, 1] },
    { normal: [0, 0, 1], di: 0, dj: 1, left: [c.x0, c.z1, -1, 0], right: [c.x1, c.z1, 1, 0] },
    { normal: [0, 0, -1], di: 0, dj: -1, left: [c.x1, c.z0, 1, 0], right: [c.x0, c.z0, -1, 0] },
  ];
}

/**
 * Flanc de coupe de y = 0 à `h`, avec un sommet à `leftJoin` sur le bord gauche et à
 * `rightJoin` sur le bord droit (hauteurs partagées avec les flancs voisins) : quatre
 * triangles, dont certains plats si une jonction vaut 0 ou `h` (sans effet à l'écran).
 */
function pushCut(
  positions: number[],
  normals: number[],
  normal: Vertex,
  left: Corner,
  right: Corner,
  h: number,
  leftJoin: number,
  rightJoin: number,
): void {
  const a: Vertex = [left[0], 0, left[1]];
  const b: Vertex = [right[0], 0, right[1]];
  const c: Vertex = [right[0], rightJoin, right[1]];
  const d: Vertex = [right[0], h, right[1]];
  const e: Vertex = [left[0], h, left[1]];
  const f: Vertex = [left[0], leftJoin, left[1]];
  for (const v of [a, b, c, a, c, f, f, c, d, f, d, e]) {
    positions.push(v[0], v[1], v[2]);
    normals.push(normal[0], normal[1], normal[2]);
  }
}

/** Ajoute un quadrilatère (sommets dans le sens direct vu de sa face) en deux triangles. */
function pushQuad(
  positions: number[],
  normals: number[],
  normal: Vertex,
  [a, b, c, d]: readonly [Vertex, Vertex, Vertex, Vertex],
): void {
  for (const v of [a, b, c, a, c, d]) {
    positions.push(v[0], v[1], v[2]);
    normals.push(normal[0], normal[1], normal[2]);
  }
}
