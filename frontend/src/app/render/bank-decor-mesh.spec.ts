import { Mesh, MeshLambertMaterial } from 'three';

import { bankDecorLayout, type BankDecorSettings, type Root } from '../sim/bank-decor';
import { environmentWater, PALUDARIUM } from '../sim/environment';
import type { TerrainSettings } from '../sim/terrain';
import {
  buildMossMesh,
  buildRootMesh,
  createBankDecorObject,
  MOSS_COLORS,
  MOSS_VOXEL,
  mossCells,
  ROOT_COLORS,
  ROOT_VOXEL,
  rootCells,
} from './bank-decor-mesh';
import { terrainGrid } from './terrain-mesh';

const TERRAIN = PALUDARIUM.terrain as TerrainSettings;
const WATER = environmentWater('paludarium');
const DECOR = bankDecorLayout(PALUDARIUM.bankDecor as BankDecorSettings, TERRAIN, WATER);
const GRID = terrainGrid(TERRAIN, WATER);

/** Colonne dessinée du sol sous le point (x, z). */
function columnAt(x: number, z: number) {
  const i = Math.floor(((x - WATER.minX) / (WATER.maxX - WATER.minX)) * GRID.columns);
  const j = Math.floor(((z - WATER.minZ) / (WATER.maxZ - WATER.minZ)) * GRID.rows);
  return GRID.cells[j * GRID.columns + i];
}

describe('mossCells (tapis de mousse posés sur la berge, #132)', () => {
  const cells = mossCells(DECOR.mosses, GRID, WATER);

  it('pose chaque voxel sur la colonne émergée dessinée, un ou deux voxels d’épaisseur', () => {
    expect(cells.length).toBeGreaterThan(100);
    const base = new Map<string, number>();
    for (const cell of cells) {
      const column = columnAt((cell.i + 0.5) * MOSS_VOXEL, (cell.k + 0.5) * MOSS_VOXEL);
      expect(column.submerged).toBe(false);
      const ground = Math.round(column.height / MOSS_VOXEL);
      expect([ground, ground + 1]).toContain(cell.j);
      const key = `${cell.i},${cell.k}`;
      base.set(key, Math.min(base.get(key) ?? Infinity, cell.j));
    }
    // Un coussin repose toujours sur un voxel de base.
    for (const cell of cells) {
      expect(base.get(`${cell.i},${cell.k}`)).toBe(
        Math.round(
          columnAt((cell.i + 0.5) * MOSS_VOXEL, (cell.k + 0.5) * MOSS_VOXEL).height / MOSS_VOXEL,
        ),
      );
    }
  });

  it('reste dans le disque de son tapis, sans voxel en double', () => {
    const keys = cells.map((c) => `${c.i},${c.j},${c.k}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const cell of cells) {
      const x = (cell.i + 0.5) * MOSS_VOXEL;
      const z = (cell.k + 0.5) * MOSS_VOXEL;
      expect(DECOR.mosses.some((m) => Math.hypot(x - m.x, z - m.z) <= m.radius)).toBe(true);
    }
  });

  it('aucun tapis : aucun voxel', () => {
    expect(mossCells([], GRID, WATER)).toEqual([]);
  });

  it('couleurs : vert de la palette, dessus clairs minoritaires', () => {
    const mesh = buildMossMesh(cells);
    expect(mesh.quads).toBeGreaterThan(0);
    expect(MOSS_COLORS.top).not.toBe(MOSS_COLORS.light);
  });
});

describe('rootCells (racines en voxels, #132)', () => {
  it('chaque racine du paludarium a des voxels, proches de sa ligne', () => {
    expect(DECOR.roots.length).toBeGreaterThan(0);
    for (const root of DECOR.roots) {
      const cells = rootCells(root);
      expect(cells.length).toBeGreaterThan(20);
      for (const cell of cells) {
        const x = (cell.i + 0.5) * ROOT_VOXEL;
        const y = (cell.j + 0.5) * ROOT_VOXEL;
        const z = (cell.k + 0.5) * ROOT_VOXEL;
        const near = root.points.some(
          (p) => Math.hypot(x - p.x, y - p.y, z - p.z) <= p.radius + 0.05,
        );
        expect(near).toBe(true);
      }
    }
  });

  it('une racine plus fine que le voxel reste vide sans erreur', () => {
    const thin: Root = {
      id: 0,
      points: [
        { x: 0.0001, y: 0.1001, z: 0.0001, radius: 1e-5 },
        { x: 0.0002, y: 0.1001, z: 0.0001, radius: 1e-5 },
      ],
    };
    expect(rootCells(thin)).toEqual([]);
    expect(buildRootMesh([thin]).quads).toBe(0);
  });
});

describe('createBankDecorObject', () => {
  it('deux maillages opaques éclairés, mousses puis racines', () => {
    const group = createBankDecorObject(DECOR, TERRAIN, WATER);
    expect(group.name).toBe('berge');
    expect(group.children.map((c) => c.name)).toEqual(['mousses', 'racines']);
    for (const child of group.children) {
      const mesh = child as Mesh;
      expect(mesh.material).toBeInstanceOf(MeshLambertMaterial);
      expect((mesh.material as MeshLambertMaterial).vertexColors).toBe(true);
      expect((mesh.material as MeshLambertMaterial).transparent).toBe(false);
    }
  });

  it('décor vide : aucun maillage', () => {
    expect(createBankDecorObject({ roots: [], mosses: [] }, TERRAIN, WATER).children).toEqual([]);
  });

  it('couleurs des racines : dessus et flancs distincts', () => {
    expect(ROOT_COLORS.top).not.toBe(ROOT_COLORS.side);
  });
});
