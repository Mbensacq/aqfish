import { Mesh, MeshBasicMaterial, MeshLambertMaterial, type BufferGeometry } from 'three';

import { environmentWater, PALUDARIUM } from '../sim/environment';
import type { TerrainSettings } from '../sim/terrain';
import { PALETTE } from './palette';
import {
  createTerrainMesh,
  TERRAIN_CELL,
  TERRAIN_COLORS,
  TERRAIN_STEP,
  terrainGrid,
} from './terrain-mesh';

const SETTINGS = PALUDARIUM.terrain as TerrainSettings;
const WATER = environmentWater('paludarium');

describe('terrainGrid (sol du paludarium, #129)', () => {
  const grid = terrainGrid(SETTINGS, WATER);

  it('couvre le fond du bac en cellules d’au plus TERRAIN_CELL, sans trou', () => {
    expect(grid.columns).toBe(Math.round((WATER.maxX - WATER.minX) / TERRAIN_CELL));
    expect(grid.rows).toBe(Math.round((WATER.maxZ - WATER.minZ) / TERRAIN_CELL));
    expect(grid.cells.length).toBe(grid.columns * grid.rows);
    expect(grid.cells[0].x0).toBe(WATER.minX);
    expect(grid.cells[0].z0).toBe(WATER.minZ);
    const last = grid.cells.at(-1);
    expect(last?.x1).toBeCloseTo(WATER.maxX, 12);
    expect(last?.z1).toBeCloseTo(WATER.maxZ, 12);
    for (let k = 1; k < grid.columns; k++) {
      expect(grid.cells[k].x0).toBe(grid.cells[k - 1].x1);
    }
  });

  it('colonnes émergées au moins un pas au-dessus de l’eau, immergées au moins un pas dessous', () => {
    for (const cell of grid.cells) {
      if (cell.submerged) {
        expect(cell.height).toBeLessThanOrEqual(WATER.maxY - TERRAIN_STEP + 1e-12);
        expect(cell.height).toBeGreaterThanOrEqual(WATER.minY);
        expect(cell.kind).toBe('fond');
      } else {
        expect(cell.height).toBeGreaterThanOrEqual(WATER.maxY + TERRAIN_STEP - 1e-12);
        expect(cell.kind).not.toBe('fond');
      }
    }
  });

  it('chaque rangée va de la terre (−X) à l’eau (+X), avec un seul rivage', () => {
    for (let j = 0; j < grid.rows; j++) {
      const row = grid.cells.slice(j * grid.columns, (j + 1) * grid.columns);
      expect(row[0].submerged).toBe(false);
      expect(row.at(-1)?.submerged).toBe(true);
      const changes = row.filter((c, i) => i > 0 && c.submerged !== row[i - 1].submerged).length;
      expect(changes).toBe(1);
    }
  });

  it('hauteurs arrondies au pas (marches nettes)', () => {
    for (const cell of grid.cells) {
      const steps = cell.height / TERRAIN_STEP;
      expect(Math.abs(steps - Math.round(steps))).toBeLessThan(1e-6);
    }
  });

  it('refuse un volume d’eau vide', () => {
    expect(() => terrainGrid(SETTINGS, { ...WATER, maxX: WATER.minX })).toThrow(RangeError);
  });
});

describe('createTerrainMesh', () => {
  const { mesh, bottom } = createTerrainMesh(SETTINGS, WATER, PALETTE.sableSombre);
  const geometry = mesh.geometry as BufferGeometry;

  it('un groupe par matériau : dessus et flancs de chaque nature, puis le dessous', () => {
    expect(mesh).toBeInstanceOf(Mesh);
    const materials = mesh.material as (MeshLambertMaterial | MeshBasicMaterial)[];
    expect(materials.length).toBe(7);
    const hexes = materials.map((m) => `#${m.color.getHexString()}`);
    expect(hexes).toEqual([
      PALETTE[TERRAIN_COLORS.fond.top],
      PALETTE[TERRAIN_COLORS.fond.side],
      PALETTE[TERRAIN_COLORS.terre.top],
      PALETTE[TERRAIN_COLORS.terre.side],
      PALETTE[TERRAIN_COLORS.roche.top],
      PALETTE[TERRAIN_COLORS.roche.side],
      PALETTE.sableSombre,
    ]);
    expect(materials.at(-1)).toBe(bottom);
    expect(bottom).toBeInstanceOf(MeshBasicMaterial);
    expect(geometry.groups.map((g) => g.materialIndex)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    // Groupes contigus couvrant tous les sommets, en triangles entiers.
    let start = 0;
    for (const group of geometry.groups) {
      expect(group.start).toBe(start);
      expect(group.count % 3).toBe(0);
      start += group.count;
    }
    expect(start).toBe(geometry.getAttribute('position').count);
    // Fond, terre et roche sont tous dessinés ; un seul dessous (deux triangles).
    for (const group of geometry.groups.slice(0, 6)) {
      expect(group.count).toBeGreaterThan(0);
    }
    expect(geometry.groups[6].count).toBe(6);
  });

  it('le fond immergé reprend les teintes du sol déclarées par le paludarium', () => {
    expect(TERRAIN_COLORS.fond.top).toBe(PALUDARIUM.ground.top);
    expect(TERRAIN_COLORS.fond.side).toBe(PALUDARIUM.ground.side);
  });

  it('tient dans le bac, de y = 0 au sommet de la berge, sous le haut des vitres', () => {
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    expect(box?.min.y).toBe(0);
    expect(box?.min.x).toBeCloseTo(WATER.minX, 6);
    expect(box?.max.x).toBeCloseTo(WATER.maxX, 6);
    expect(box?.min.z).toBeCloseTo(WATER.minZ, 6);
    expect(box?.max.z).toBeCloseTo(WATER.maxZ, 6);
    expect(box?.max.y).toBeGreaterThan(WATER.maxY);
    expect(box?.max.y).toBeLessThan(PALUDARIUM.dimensions.height);
  });

  it('normales unitaires alignées sur les axes, une par sommet', () => {
    const normals = geometry.getAttribute('normal');
    expect(normals.count).toBe(geometry.getAttribute('position').count);
    for (let k = 0; k < normals.count; k += 97) {
      const n = [normals.getX(k), normals.getY(k), normals.getZ(k)];
      expect(n.map(Math.abs).sort()).toEqual([0, 0, 1]);
    }
  });

  it('coupe le long de la vitre avant sans jonction en T entre colonnes voisines', () => {
    const grid = terrainGrid(SETTINGS, WATER);
    const positions = geometry.getAttribute('position');
    const normals = geometry.getAttribute('normal');
    const onFront = new Set<string>();
    for (let k = 0; k < positions.count; k++) {
      if (normals.getZ(k) === 1 && Math.abs(positions.getZ(k) - WATER.maxZ) < 1e-6) {
        onFront.add(`${positions.getX(k).toFixed(5)}:${positions.getY(k).toFixed(5)}`);
      }
    }
    const row = grid.cells.slice((grid.rows - 1) * grid.columns);
    for (let i = 0; i + 1 < row.length; i++) {
      const join = Math.min(row[i].height, row[i + 1].height);
      // Le bord partagé a un sommet à la hauteur commune, dans la face de chaque colonne.
      expect(onFront.has(`${row[i].x1.toFixed(5)}:${join.toFixed(5)}`)).toBe(true);
    }
  });

  it('même réglage, même maillage (déterministe)', () => {
    const again = createTerrainMesh(SETTINGS, WATER, PALETTE.sableSombre).mesh
      .geometry as BufferGeometry;
    expect(Array.from(again.getAttribute('position').array)).toEqual(
      Array.from(geometry.getAttribute('position').array),
    );
  });
});
