import { Color } from 'three';

import {
  buildLilyPadHull,
  buildLilyPadMesh,
  buildLilyPadShadow,
  LILY_PAD_COLORS,
  LILY_PAD_MAX_MITER,
  LILY_PAD_SEGMENTS,
  LILY_PAD_THICKNESS,
  lilyPadRimAngles,
} from './lily-pad-model';
import { PALETTE_COLORS } from './palette';

type V = [number, number, number];

function vertex(array: Float32Array, i: number): V {
  return [array[3 * i], array[3 * i + 1], array[3 * i + 2]];
}

/** Normale géométrique (ordre trigonométrique) du triangle `t`. */
function triangleNormal(positions: Float32Array, t: number): V {
  const [a, b, c] = [0, 1, 2].map((k) => vertex(positions, 3 * t + k));
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n: V = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const len = Math.hypot(...n);
  return [n[0] / len, n[1] / len, n[2] / len];
}

function centroid(positions: Float32Array, t: number): V {
  const [a, b, c] = [0, 1, 2].map((k) => vertex(positions, 3 * t + k));
  return [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
}

/**
 * Vrai si la normale du triangle `t` pointe hors du prisme : vers le haut sur le dessus, vers
 * le bas dessous, vers l'extérieur de l'arc sur les côtés, vers l'encoche (+X) sur ses côtés.
 */
function pointsOutward(positions: Float32Array, t: number, radius: number): boolean {
  const n = triangleNormal(positions, t);
  const c = centroid(positions, t);
  if (Math.abs(n[1]) > 0.99) {
    return c[1] > LILY_PAD_THICKNESS / 2 ? n[1] > 0 : n[1] < 0;
  }
  const onArc = Math.hypot(c[0], c[2]) > radius * 0.9;
  return onArc ? n[0] * c[0] + n[2] * c[2] > 0 : n[0] > 0;
}

describe('maillage des nénuphars', () => {
  const RADIUS = 0.1;
  const NOTCH = 0.25;

  it('lilyPadRimAngles : de l’encoche au tour complet moins l’encoche', () => {
    const angles = lilyPadRimAngles(NOTCH);
    expect(angles).toHaveLength(LILY_PAD_SEGMENTS + 1);
    expect(angles[0]).toBeCloseTo(NOTCH, 12);
    expect(angles.at(-1)).toBeCloseTo(2 * Math.PI - NOTCH, 12);
  });

  it.each([0, -0.1, Math.PI / 2, Number.NaN])('refuse l’encoche invalide %s', (notch) => {
    expect(() => lilyPadRimAngles(notch)).toThrow(RangeError);
    expect(() => buildLilyPadMesh(RADIUS, notch)).toThrow(RangeError);
  });

  it.each([0, -1, Number.POSITIVE_INFINITY])('refuse le rayon invalide %s', (radius) => {
    expect(() => buildLilyPadMesh(radius, NOTCH)).toThrow(RangeError);
    expect(() => buildLilyPadHull(radius, NOTCH)).toThrow(RangeError);
    expect(() => buildLilyPadShadow(radius, NOTCH)).toThrow(RangeError);
  });

  it('refuse un nombre de segments invalide', () => {
    expect(() => lilyPadRimAngles(NOTCH, 2)).toThrow(RangeError);
    expect(() => lilyPadRimAngles(NOTCH, 4.5)).toThrow(RangeError);
  });

  it('la feuille : faces tournées vers l’extérieur, normales stockées cohérentes', () => {
    const mesh = buildLilyPadMesh(RADIUS, NOTCH);
    const triangles = mesh.positions.length / 9;
    expect(triangles).toBe(LILY_PAD_SEGMENTS * 6 + 4);
    for (let t = 0; t < triangles; t++) {
      expect(pointsOutward(mesh.positions, t, RADIUS)).toBe(true);
      const n = triangleNormal(mesh.positions, t);
      const stored = vertex(mesh.normals, 3 * t);
      stored.forEach((value, k) => expect(value).toBeCloseTo(n[k], 5));
    }
  });

  it('la feuille tient dans son rayon, son épaisseur, et laisse l’encoche vide', () => {
    const mesh = buildLilyPadMesh(RADIUS, NOTCH);
    for (let i = 0; i < mesh.positions.length / 3; i++) {
      const [x, y, z] = vertex(mesh.positions, i);
      expect(Math.hypot(x, z)).toBeLessThanOrEqual(RADIUS + 1e-6);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(LILY_PAD_THICKNESS + 1e-6);
      if (Math.hypot(x, z) > 1e-6) {
        // Aucun sommet strictement dans l'encoche (|angle| < notch).
        expect(Math.abs(Math.atan2(z, x))).toBeGreaterThanOrEqual(NOTCH - 1e-6);
      }
    }
  });

  it('couleurs de la palette : cœur et bord sur le dessus, ton d’ombre ailleurs', () => {
    const mesh = buildLilyPadMesh(RADIUS, NOTCH);
    const hex = new Set<string>();
    for (let i = 0; i < mesh.colors.length / 3; i++) {
      const [r, g, b] = vertex(mesh.colors, i);
      hex.add(`#${new Color(r, g, b).getHexString()}`);
    }
    expect([...hex].sort()).toEqual(
      [LILY_PAD_COLORS.core, LILY_PAD_COLORS.rim, LILY_PAD_COLORS.under].sort(),
    );
    for (const color of hex) {
      expect(PALETTE_COLORS).toContain(color);
    }
  });

  it('la coque : mêmes faces que la feuille, décalages horizontaux d’au moins un pixel', () => {
    const hull = buildLilyPadHull(RADIUS, NOTCH);
    const triangles = hull.positions.length / 9;
    expect(triangles).toBe(LILY_PAD_SEGMENTS * 4 + 4);
    for (let t = 0; t < triangles; t++) {
      expect(pointsOutward(hull.positions, t, RADIUS)).toBe(true);
    }
    for (let i = 0; i < hull.offsets.length / 3; i++) {
      const [ox, oy, oz] = vertex(hull.offsets, i);
      const [px, , pz] = vertex(hull.positions, i);
      expect(oy).toBe(0);
      const len = Math.hypot(ox, oz);
      expect(len).toBeGreaterThanOrEqual(1 - 1e-6);
      expect(len).toBeLessThanOrEqual(LILY_PAD_MAX_MITER + 1e-6);
      // Le décalage pousse vers l'extérieur : hors du disque sur le bord, vers l'encoche au centre.
      if (Math.hypot(px, pz) > 1e-6) {
        expect(ox * px + oz * pz).toBeGreaterThan(0);
      } else {
        expect(ox).toBeGreaterThan(0);
      }
    }
  });

  it('coins de l’encoche : onglet perpendiculaire au côté et à l’arc', () => {
    const hull = buildLilyPadHull(RADIUS, NOTCH);
    const corners = new Map<string, V>();
    for (let i = 0; i < hull.positions.length / 3; i++) {
      const [px, , pz] = vertex(hull.positions, i);
      const angle = Math.atan2(pz, px);
      if (Math.hypot(px, pz) > 1e-6 && Math.abs(Math.abs(angle) - NOTCH) < 1e-6) {
        corners.set(angle > 0 ? 'haut' : 'bas', vertex(hull.offsets, i));
      }
    }
    expect(corners.size).toBe(2);
    for (const [side, offset] of corners) {
      const a = side === 'haut' ? NOTCH : -NOTCH;
      // Composante 1 selon la normale radiale et selon la normale du côté de l'encoche.
      expect(offset[0] * Math.cos(a) + offset[2] * Math.sin(a)).toBeCloseTo(1, 5);
      const edge = side === 'haut' ? [Math.sin(a), -Math.cos(a)] : [-Math.sin(a), Math.cos(a)];
      expect(offset[0] * edge[0] + offset[2] * edge[1]).toBeCloseTo(1, 5);
    }
  });

  it('l’ombre : disque à encoche à plat, faces vers le haut', () => {
    const shadow = buildLilyPadShadow(RADIUS, NOTCH);
    expect(shadow.length / 9).toBe(LILY_PAD_SEGMENTS);
    for (let t = 0; t < shadow.length / 9; t++) {
      expect(triangleNormal(shadow, t)[1]).toBeCloseTo(1, 6);
    }
    for (let i = 0; i < shadow.length / 3; i++) {
      expect(shadow[3 * i + 1]).toBe(0);
    }
  });
});
