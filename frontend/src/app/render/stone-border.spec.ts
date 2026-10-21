import { Mesh, MeshLambertMaterial } from 'three';

import { POND_DIMENSIONS } from '../sim/environment';
import {
  createStoneBorder,
  STONE_BORDER_THICKNESS,
  STONE_RISE,
  stoneBorderBlocks,
  type StoneBlock,
} from './stone-border';

function extent(b: StoneBlock) {
  return {
    minX: b.x - b.width / 2,
    maxX: b.x + b.width / 2,
    minZ: b.z - b.depth / 2,
    maxZ: b.z + b.depth / 2,
  };
}

describe('stoneBorderBlocks', () => {
  const dims = POND_DIMENSIONS;
  const blocks = stoneBorderBlocks(dims);

  it('pose un anneau de blocs hors du volume d’eau, du sol au-dessus du bord', () => {
    expect(blocks.length).toBeGreaterThan(8);
    for (const block of blocks) {
      const e = extent(block);
      const outsideX = e.maxX <= -dims.width / 2 + 1e-9 || e.minX >= dims.width / 2 - 1e-9;
      const outsideZ = e.maxZ <= -dims.depth / 2 + 1e-9 || e.minZ >= dims.depth / 2 - 1e-9;
      expect(outsideX || outsideZ).toBe(true);
      expect(block.y - block.height / 2).toBeCloseTo(0);
      expect(block.height).toBeGreaterThan(dims.height);
      expect(block.height).toBeLessThan(dims.height + 2 * STONE_RISE + 1e-9);
    }
  });

  it('entoure les quatre côtés, coins compris, sans chevauchement', () => {
    const t = STONE_BORDER_THICKNESS;
    const all = blocks.map(extent);
    expect(Math.min(...all.map((e) => e.minX))).toBeCloseTo(-dims.width / 2 - t, 2);
    expect(Math.max(...all.map((e) => e.maxX))).toBeCloseTo(dims.width / 2 + t, 2);
    expect(Math.min(...all.map((e) => e.minZ))).toBeCloseTo(-dims.depth / 2 - t);
    expect(Math.max(...all.map((e) => e.maxZ))).toBeCloseTo(dims.depth / 2 + t);
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i];
        const b = all[j];
        const overlap =
          Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX) > 1e-9 &&
          Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ) > 1e-9;
        expect(overlap).toBe(false);
      }
    }
  });

  it('est déterministe et numérote les blocs dans l’ordre', () => {
    expect(stoneBorderBlocks(dims)).toEqual(blocks);
    expect(blocks.map((b) => b.index)).toEqual(blocks.map((_, i) => i));
  });

  it('range chaque bloc de son côté du bassin (coins : côtés selon X)', () => {
    for (const block of blocks) {
      const e = extent(block);
      switch (block.side) {
        case '+x':
          expect(e.minX).toBeGreaterThanOrEqual(dims.width / 2 - 1e-9);
          break;
        case '-x':
          expect(e.maxX).toBeLessThanOrEqual(-dims.width / 2 + 1e-9);
          break;
        case '+z':
          expect(e.minZ).toBeGreaterThanOrEqual(dims.depth / 2 - 1e-9);
          break;
        case '-z':
          expect(e.maxZ).toBeLessThanOrEqual(-dims.depth / 2 + 1e-9);
          break;
      }
    }
    expect(new Set(blocks.map((b) => b.side)).size).toBe(4);
  });

  it('garde au moins un bloc par côté pour un très petit bassin', () => {
    expect(stoneBorderBlocks({ width: 0.05, height: 0.1, depth: 0.05 })).toHaveLength(4);
  });

  it('refuse des dimensions nulles, négatives ou non finies', () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => stoneBorderBlocks({ ...dims, width: bad })).toThrow(RangeError);
      expect(() => stoneBorderBlocks({ ...dims, height: bad })).toThrow(RangeError);
    }
  });
});

describe('createStoneBorder', () => {
  it('crée un maillage par bloc, au nom de la margelle', () => {
    const border = createStoneBorder(POND_DIMENSIONS);
    expect(border.object.name).toBe('margelle');
    expect(border.object.children).toHaveLength(stoneBorderBlocks(POND_DIMENSIONS).length);
    expect(border.object.children.every((c) => c instanceof Mesh)).toBe(true);
  });

  it('masque les blocs des côtés retirés (vue en coupe), et les rend ensuite', () => {
    const border = createStoneBorder(POND_DIMENSIONS);
    const blocks = stoneBorderBlocks(POND_DIMENSIONS);
    border.setHiddenSides(new Set(['+z', '-x']));
    border.object.children.forEach((child, i) => {
      expect(child.visible).toBe(blocks[i].side !== '+z' && blocks[i].side !== '-x');
    });
    border.setHiddenSides(new Set());
    expect(border.object.children.every((c) => c.visible)).toBe(true);
  });

  it('ignore une intensité non finie (traitée comme midi)', () => {
    const border = createStoneBorder(POND_DIMENSIONS);
    border.setDaylight(Number.NaN);
    const mesh = border.object.children[0] as Mesh;
    const material = (mesh.material as MeshLambertMaterial[])[2];
    expect(material.emissive.getHex()).toBe(0);
  });
});
