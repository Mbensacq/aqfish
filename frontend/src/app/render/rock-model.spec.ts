import { Color } from 'three';

import { rockModel } from '../sim/decor';
import { PALETTE_COLORS } from './palette';
import {
  buildRockMesh,
  cellHash,
  createOutlineGeometry,
  createRockGeometry,
  ROCK_COLORS,
  rockFaceColor,
} from './rock-model';

describe('buildRockMesh', () => {
  const model = rockModel(42, 1);
  const data = buildRockMesh(model, 42);

  it('même graine, même maillage', () => {
    expect(buildRockMesh(rockModel(42, 1), 42)).toEqual(data);
  });

  it('deux triangles par face visible, attributs de même longueur', () => {
    expect(data.quads).toBeGreaterThan(0);
    expect(data.positions.length).toBe(data.quads * 6 * 3);
    expect(data.normals.length).toBe(data.positions.length);
    expect(data.colors.length).toBe(data.positions.length);
    expect(data.smoothNormals.length).toBe(data.positions.length);
  });

  it('aucune face sous la base (enterrée) ni sous le sable', () => {
    for (let n = 0; n < data.positions.length; n += 3) {
      expect(data.positions[n + 1]).toBeGreaterThanOrEqual(0);
      if (data.normals[n + 1] === -1) {
        expect(data.positions[n + 1]).toBeGreaterThan(0);
      }
    }
  });

  it('seules les faces exposées : moins de faces que 6 par voxel', () => {
    expect(data.quads).toBeLessThan(model.cells.length * 6);
  });

  it('couleurs : uniquement les couleurs de rocher de la palette', () => {
    const allowed = Object.values(ROCK_COLORS).map((hex) => {
      const c = new Color(hex);
      return [c.r, c.g, c.b].map((v) => v.toFixed(5)).join();
    });
    for (let n = 0; n < data.colors.length; n += 3) {
      const key = [data.colors[n], data.colors[n + 1], data.colors[n + 2]]
        .map((v) => v.toFixed(5))
        .join();
      expect(allowed).toContain(key);
    }
    for (const hex of Object.values(ROCK_COLORS)) {
      expect(PALETTE_COLORS).toContain(hex);
    }
  });

  it('normales lissées unitaires, identiques pour un même sommet', () => {
    const byPosition = new Map<string, string>();
    for (let n = 0; n < data.smoothNormals.length; n += 3) {
      const [x, y, z] = data.smoothNormals.subarray(n, n + 3);
      expect(Math.hypot(x, y, z)).toBeCloseTo(1, 5);
      const key = Array.from(data.positions.subarray(n, n + 3)).join();
      const normal = [x, y, z].join();
      // Une coque gonflée selon des normales différentes au même sommet s'ouvrirait.
      expect(byPosition.get(key) ?? normal).toBe(normal);
      byPosition.set(key, normal);
    }
  });

  it('géométries Three.js : attributs repris tels quels', () => {
    const geometry = createRockGeometry(data);
    const outline = createOutlineGeometry(data);
    expect(geometry.getAttribute('position').array).toBe(data.positions);
    expect(geometry.getAttribute('color').array).toBe(data.colors);
    expect(outline.getAttribute('normal').array).toBe(data.smoothNormals);
    expect(outline.getAttribute('color')).toBeUndefined();
    geometry.dispose();
    outline.dispose();
  });
});

describe('couleurs des faces', () => {
  it('hachage déterministe dans [0, 1)', () => {
    expect(cellHash(1, 2, 3, 4)).toBe(cellHash(1, 2, 3, 4));
    expect(cellHash(1, 2, 3, 4)).not.toBe(cellHash(2, 2, 3, 4));
    for (let i = -20; i < 20; i++) {
      const h = cellHash(0xffffffff, i, i * 7, -i);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(1);
    }
  });

  it('dessus clair ou poudré, flancs de la rangée du bas toujours sombres', () => {
    for (let i = -5; i < 5; i++) {
      expect([ROCK_COLORS.top, ROCK_COLORS.dusted]).toContain(
        rockFaceColor(7, { i, j: 2, k: 0 }, true),
      );
      expect(rockFaceColor(7, { i, j: 0, k: 0 }, false)).toBe(ROCK_COLORS.shade);
    }
  });
});
