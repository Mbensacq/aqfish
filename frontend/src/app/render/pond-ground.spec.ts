import { Mesh, MeshLambertMaterial } from 'three';

import { POND_DIMENSIONS } from '../sim/environment';
import type { PondSide } from './pond-cutaway';
import {
  createPondGround,
  pondGrassTufts,
  pondGroundSlabs,
  pondGroundTop,
  POND_GROUND_BELOW_RIM,
  POND_GROUND_MARGIN,
  POND_GROUND_OVERLAP,
  POND_GROUND_SINK,
  POND_TUFT_COUNT,
  POND_TUFT_SIZE,
  type GroundSlab,
} from './pond-ground';
import { STONE_BORDER_THICKNESS, STONE_RISE, stoneBorderBlocks } from './stone-border';

function extent(s: { x: number; z: number; width: number; depth: number }) {
  return {
    minX: s.x - s.width / 2,
    maxX: s.x + s.width / 2,
    minZ: s.z - s.depth / 2,
    maxZ: s.z + s.depth / 2,
  };
}

describe('pondGroundSlabs', () => {
  const dims = POND_DIMENSIONS;
  const slabs = pondGroundSlabs(dims);
  const outerX = dims.width / 2 + STONE_BORDER_THICKNESS + POND_GROUND_MARGIN;
  const outerZ = dims.depth / 2 + STONE_BORDER_THICKNESS + POND_GROUND_MARGIN;

  it('pose deux couches de quatre dalles, herbe sur terre, sous le bord du bassin', () => {
    expect(slabs).toHaveLength(8);
    const top = (s: GroundSlab) => s.y + s.height / 2;
    const bottom = (s: GroundSlab) => s.y - s.height / 2;
    const grass = slabs.filter((s) => s.layer === 'herbe');
    const earth = slabs.filter((s) => s.layer === 'terre');
    expect(grass).toHaveLength(4);
    expect(earth).toHaveLength(4);
    for (const s of grass) {
      expect(top(s)).toBeCloseTo(dims.height - POND_GROUND_BELOW_RIM);
      expect(top(s)).toBeCloseTo(pondGroundTop(dims));
    }
    for (const s of earth) {
      expect(bottom(s)).toBeCloseTo(-POND_GROUND_SINK);
      expect(top(s)).toBeCloseTo(bottom(grass[0]));
    }
    for (const s of slabs) {
      expect(s.height).toBeGreaterThan(0);
    }
  });

  it('laisse dépasser une margelle basse : chaque pierre dépasse du sol, de peu', () => {
    for (const block of stoneBorderBlocks(dims)) {
      const above = block.y + block.height / 2 - pondGroundTop(dims);
      expect(above).toBeGreaterThan(0.01);
      expect(above).toBeLessThan(POND_GROUND_BELOW_RIM + 2 * STONE_RISE);
    }
  });

  it('entoure la margelle sans entrer dans l’eau ni laisser de trou', () => {
    for (const s of slabs) {
      const e = extent(s);
      const outsideX = e.maxX <= -dims.width / 2 || e.minX >= dims.width / 2;
      const outsideZ = e.maxZ <= -dims.depth / 2 || e.minZ >= dims.depth / 2;
      expect(outsideX || outsideZ).toBe(true);
      expect(e.minX).toBeGreaterThanOrEqual(-outerX - 1e-9);
      expect(e.maxX).toBeLessThanOrEqual(outerX + 1e-9);
      expect(e.minZ).toBeGreaterThanOrEqual(-outerZ - 1e-9);
      expect(e.maxZ).toBeLessThanOrEqual(outerZ + 1e-9);
    }
    // Le bord intérieur entre dans les pierres (recouvrement), sans atteindre l'eau.
    const innerX = dims.width / 2 + STONE_BORDER_THICKNESS - POND_GROUND_OVERLAP;
    const innerZ = dims.depth / 2 + STONE_BORDER_THICKNESS - POND_GROUND_OVERLAP;
    const plusX = slabs.find((s) => s.layer === 'herbe' && s.side === '+x');
    expect(plusX && extent(plusX).minX).toBeCloseTo(innerX);
    // Échantillonnage de l'anneau : tout point du sol est couvert par une dalle de chaque couche.
    for (let i = 0; i <= 40; i++) {
      for (let j = 0; j <= 40; j++) {
        const x = -outerX + (2 * outerX * i) / 40;
        const z = -outerZ + (2 * outerZ * j) / 40;
        if (Math.abs(x) < innerX && Math.abs(z) < innerZ) {
          continue;
        }
        for (const layer of ['herbe', 'terre'] as const) {
          const covered = slabs.some((s) => {
            const e = extent(s);
            return (
              s.layer === layer &&
              x >= e.minX - 1e-9 &&
              x <= e.maxX + 1e-9 &&
              z >= e.minZ - 1e-9 &&
              z <= e.maxZ + 1e-9
            );
          });
          expect(covered).toBe(true);
        }
      }
    }
  });

  it('attribue une dalle de chaque couche à chacun des quatre côtés', () => {
    for (const layer of ['herbe', 'terre'] as const) {
      const sides = slabs.filter((s) => s.layer === layer).map((s) => s.side);
      expect([...sides].sort()).toEqual(['+x', '+z', '-x', '-z']);
    }
    const side = (name: PondSide) => slabs.find((s) => s.layer === 'herbe' && s.side === name);
    expect(side('+x')?.x).toBeGreaterThan(0);
    expect(side('-x')?.x).toBeLessThan(0);
    expect(side('+z')?.z).toBeGreaterThan(0);
    expect(side('-z')?.z).toBeLessThan(0);
  });

  it('garde une herbe d’épaisseur positive pour un bassin très peu profond', () => {
    const shallow = pondGroundSlabs({ width: 0.3, height: 0.012, depth: 0.2 });
    for (const s of shallow) {
      expect(s.height).toBeGreaterThan(0);
    }
  });

  it('refuse des dimensions nulles, négatives ou non finies', () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => pondGroundSlabs({ ...dims, width: bad })).toThrow(RangeError);
      expect(() => pondGroundSlabs({ ...dims, depth: bad })).toThrow(RangeError);
      expect(() => pondGrassTufts({ ...dims, height: bad })).toThrow(RangeError);
    }
  });
});

describe('pondGrassTufts', () => {
  const dims = POND_DIMENSIONS;
  const tufts = pondGrassTufts(dims);

  it('sème toutes les touffes sur le sol, hors de la margelle, de façon déterministe', () => {
    expect(tufts).toHaveLength(POND_TUFT_COUNT);
    expect(pondGrassTufts(dims)).toEqual(tufts);
    const half = POND_TUFT_SIZE / 2;
    const stoneX = dims.width / 2 + STONE_BORDER_THICKNESS;
    const stoneZ = dims.depth / 2 + STONE_BORDER_THICKNESS;
    for (const t of tufts) {
      expect(Math.abs(t.x) >= stoneX + half - 1e-9 || Math.abs(t.z) >= stoneZ + half - 1e-9).toBe(
        true,
      );
      expect(Math.abs(t.x)).toBeLessThanOrEqual(stoneX + POND_GROUND_MARGIN - half + 1e-9);
      expect(Math.abs(t.z)).toBeLessThanOrEqual(stoneZ + POND_GROUND_MARGIN - half + 1e-9);
    }
  });

  it('range chaque touffe du côté qui la porte et mêle les deux tons', () => {
    const stoneZ = dims.depth / 2 + STONE_BORDER_THICKNESS + POND_TUFT_SIZE / 2;
    for (const t of tufts) {
      if (Math.abs(t.z) >= stoneZ) {
        expect(t.side).toBe(t.z > 0 ? '+z' : '-z');
      } else {
        expect(t.side).toBe(t.x > 0 ? '+x' : '-x');
      }
    }
    expect(new Set(tufts.map((t) => t.side)).size).toBe(4);
    expect(new Set(tufts.map((t) => t.tone))).toEqual(new Set([0, 1]));
  });
});

describe('createPondGround', () => {
  it('crée un maillage par dalle et par touffe, au nom du sol du bassin', () => {
    const ground = createPondGround(POND_DIMENSIONS);
    expect(ground.object.name).toBe('sol-bassin');
    expect(ground.object.children).toHaveLength(8 + POND_TUFT_COUNT);
    expect(ground.object.children.every((c) => c instanceof Mesh)).toBe(true);
  });

  it('ne luit pas à midi, luit la nuit, et traite une intensité non finie comme midi', () => {
    const ground = createPondGround(POND_DIMENSIONS);
    const slab = ground.object.children[0] as Mesh;
    const emissive = () => (slab.material as MeshLambertMaterial[])[0].emissive.getHex();
    ground.setDaylight(1);
    expect(emissive()).toBe(0);
    ground.setDaylight(0);
    expect(emissive()).not.toBe(0);
    ground.setDaylight(Number.NaN);
    expect(emissive()).toBe(0);
  });

  it('masque les dalles et les touffes des côtés retirés, et les rend ensuite', () => {
    const ground = createPondGround(POND_DIMENSIONS);
    const visible = () => ground.object.children.filter((c) => c.visible).length;
    const total = ground.object.children.length;
    ground.setHiddenSides(new Set(['+x']));
    const hidden = total - visible();
    // Deux dalles (herbe et terre) et les touffes du côté +x.
    const plusXTufts = pondGrassTufts(POND_DIMENSIONS).filter((t) => t.side === '+x').length;
    expect(hidden).toBe(2 + plusXTufts);
    ground.setHiddenSides(new Set());
    expect(visible()).toBe(total);
  });
});
