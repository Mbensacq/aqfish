import { Color } from 'three';

import { LEAF_SHAPE_COUNT, LEAF_TINT_COUNT } from '../sim/floating-leaves';
import {
  buildFloatingLeafHull,
  buildFloatingLeafMesh,
  FLOATING_LEAF_COLORS,
  FLOATING_LEAF_MAX_MITER,
  FLOATING_LEAF_THICKNESS,
  FLOATING_LEAF_VERTICES,
  floatingLeafOutline,
  outwardNormal,
} from './floating-leaf-model';
import { LILY_PAD_COLORS } from './lily-pad-model';
import { PALETTE_COLORS } from './palette';

const SHAPES = Array.from({ length: LEAF_SHAPE_COUNT }, (_, i) => i);

describe('feuille morte : contour (#107)', () => {
  it('déterministe, en étoile autour de l’origine, pointe en +X, dans la longueur 1', () => {
    for (const shape of SHAPES) {
      const outline = floatingLeafOutline(shape);
      expect(floatingLeafOutline(shape)).toEqual(outline);
      expect(outline).toHaveLength(FLOATING_LEAF_VERTICES);
      expect(outline[0][0]).toBeCloseTo(0.5, 12);
      expect(outline[0][1]).toBeCloseTo(0, 12);
      let previous = -Infinity;
      for (const [x, z] of outline) {
        expect(Math.abs(x)).toBeLessThanOrEqual(0.5 * 1.22 + 1e-12);
        expect(Math.hypot(x, z)).toBeGreaterThan(0.1);
        // Angles strictement croissants : en étoile depuis l'origine (pas de croisement).
        let angle = Math.atan2(z, x);
        if (angle < -1e-12) {
          angle += 2 * Math.PI;
        }
        expect(angle).toBeGreaterThan(previous);
        previous = angle;
      }
    }
  });

  it('formes différentes les unes des autres (bord irrégulier)', () => {
    const keys = SHAPES.map((shape) => JSON.stringify(floatingLeafOutline(shape)));
    expect(new Set(keys).size).toBe(LEAF_SHAPE_COUNT);
  });

  it('refuse une forme hors plage', () => {
    for (const bad of [-1, LEAF_SHAPE_COUNT, 1.5, NaN]) {
      expect(() => floatingLeafOutline(bad)).toThrow(RangeError);
    }
  });
});

describe('feuille morte : maillage (#107)', () => {
  it('couleurs de la palette, brunes et ocre, jamais celles des nénuphars', () => {
    const leafColors = new Set<string>(Object.values(LILY_PAD_COLORS));
    for (const colors of FLOATING_LEAF_COLORS) {
      for (const color of colors) {
        expect(PALETTE_COLORS).toContain(color);
        expect(leafColors.has(color)).toBe(false);
      }
    }
    expect(FLOATING_LEAF_COLORS).toHaveLength(LEAF_TINT_COUNT);
    expect(FLOATING_LEAF_COLORS[0][0]).not.toBe(FLOATING_LEAF_COLORS[1][0]);
  });

  it('dessus en deux tons de part et d’autre de la nervure, dessous sombre, prisme mince', () => {
    for (let tint = 0; tint < LEAF_TINT_COUNT; tint++) {
      const outline = floatingLeafOutline(2);
      const mesh = buildFloatingLeafMesh(outline, tint);
      const vertices = mesh.positions.length / 3;
      expect(vertices).toBe(FLOATING_LEAF_VERTICES * 4 * 3);
      expect(mesh.normals.length).toBe(mesh.positions.length);
      const [light, dark, under] = FLOATING_LEAF_COLORS[tint].map((c) => new Color(c));
      const topColors = new Set<string>();
      for (let v = 0; v < vertices; v++) {
        const y = mesh.positions[3 * v + 1];
        expect(y === 0 || y === Math.fround(FLOATING_LEAF_THICKNESS)).toBe(true);
        const color = new Color(
          mesh.colors[3 * v],
          mesh.colors[3 * v + 1],
          mesh.colors[3 * v + 2],
        ).getHex();
        if (mesh.normals[3 * v + 1] === 1) {
          topColors.add(color.toString(16));
          expect([light.getHex(), dark.getHex()]).toContain(color);
        } else {
          expect(color).toBe(under.getHex());
        }
      }
      expect(topColors.size).toBe(2);
    }
  });

  it('faces avant vers l’extérieur : normales des côtés opposées à l’origine', () => {
    const mesh = buildFloatingLeafMesh(floatingLeafOutline(0), 0);
    for (let t = 0; t < mesh.positions.length / 9; t++) {
      const v = t * 9;
      const ny = mesh.normals[v + 1];
      if (Math.abs(ny) > 0.5) {
        continue;
      }
      const cx = (mesh.positions[v] + mesh.positions[v + 3] + mesh.positions[v + 6]) / 3;
      const cz = (mesh.positions[v + 2] + mesh.positions[v + 5] + mesh.positions[v + 8]) / 3;
      expect(mesh.normals[v] * cx + mesh.normals[v + 2] * cz).toBeGreaterThan(0);
    }
  });

  it('refuse une teinte hors plage', () => {
    for (const bad of [-1, LEAF_TINT_COUNT, 0.5]) {
      expect(() => buildFloatingLeafMesh(floatingLeafOutline(0), bad)).toThrow(RangeError);
    }
  });
});

describe('feuille morte : coque du contour (#107)', () => {
  it('décalages horizontaux vers l’extérieur, de longueur 1 à l’onglet maximal, nuls au centre', () => {
    for (const shape of SHAPES) {
      const hull = buildFloatingLeafHull(floatingLeafOutline(shape));
      expect(hull.offsets.length).toBe(hull.positions.length);
      for (let v = 0; v < hull.positions.length / 3; v++) {
        const x = hull.positions[3 * v];
        const z = hull.positions[3 * v + 2];
        const ox = hull.offsets[3 * v];
        const oz = hull.offsets[3 * v + 2];
        expect(hull.offsets[3 * v + 1]).toBe(0);
        const length = Math.hypot(ox, oz);
        if (x === 0 && z === 0) {
          expect(length).toBe(0);
          continue;
        }
        expect(length).toBeGreaterThan(1 - 1e-6);
        expect(length).toBeLessThanOrEqual(FLOATING_LEAF_MAX_MITER + 1e-6);
        expect(ox * x + oz * z).toBeGreaterThan(0);
      }
    }
  });

  it('normale d’arête tournée à l’opposé de l’origine, quel que soit le sens', () => {
    for (const [ax, az, bx, bz] of [
      [1, -1, 1, 1],
      [1, 1, 1, -1],
    ]) {
      const [x, z] = outwardNormal(ax, az, bx, bz);
      expect(x).toBeCloseTo(1, 12);
      expect(Math.abs(z)).toBeCloseTo(0, 12);
    }
    const [nx, nz] = outwardNormal(0, 1, -1, 0);
    expect(nx).toBeCloseTo(-Math.SQRT1_2, 12);
    expect(nz).toBeCloseTo(Math.SQRT1_2, 12);
  });
});
