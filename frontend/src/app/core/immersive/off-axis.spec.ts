import { describe, expect, it } from 'vitest';
import {
  EYE_DISTANCE_MM,
  clampEyeDistanceMm,
  defaultEyeDistanceMm,
  frustumMatrix,
  offAxisFrustum,
  projectToNdc,
  type OffAxisInput,
} from './off-axis';

/** NDC du point `p` de l'écran (repère de l'écran) vu depuis l'œil de `input`. */
function screenPointNdc(input: OffAxisInput, p: [number, number, number]): number[] {
  const m = frustumMatrix(offAxisFrustum(input));
  return projectToNdc(m, [p[0] - input.eye.x, p[1] - input.eye.y, p[2] - input.eye.z]);
}

describe('off-axis', () => {
  const eyes = [
    { x: 0, y: 0, z: 0.4 },
    { x: 0.12, y: -0.05, z: 0.3 },
    { x: -1, y: 2, z: 0.05 },
    { x: 0, y: 0, z: 1e4 },
  ];

  it('les quatre coins de l’écran se projettent sur les quatre coins de l’image', () => {
    for (const eye of eyes) {
      for (const [w, h] of [
        [0.065, 0.14],
        [0.3, 0.19],
        [2, 0.4],
      ]) {
        const input: OffAxisInput = {
          screenWidth: w,
          screenHeight: h,
          eye,
          near: eye.z / 2,
          far: eye.z + 5,
        };
        for (const [sx, sy] of [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ]) {
          const [x, y] = screenPointNdc(input, [(sx * w) / 2, (sy * h) / 2, 0]);
          expect(x).toBeCloseTo(sx, 9);
          expect(y).toBeCloseTo(sy, 9);
        }
        // Le centre de la vitre reste au centre de l'image ; un point derrière la vitre, sur
        // l'axe de l'écran, apparaît décalé du côté de l'œil (parallaxe).
        const [cx, cy] = screenPointNdc(input, [0, 0, 0]);
        expect(cx).toBeCloseTo(0, 9);
        expect(cy).toBeCloseTo(0, 9);
        const behind = 0.2;
        const [bx, by] = screenPointNdc(input, [0, 0, -behind]);
        const t = behind / (eye.z + behind);
        expect(bx).toBeCloseTo((2 * eye.x * t) / w, 9);
        expect(by).toBeCloseTo((2 * eye.y * t) / h, 9);
      }
    }
  });

  it('un point derrière la vitre reste dans l’image tant qu’il est vu à travers', () => {
    const input: OffAxisInput = {
      screenWidth: 0.3,
      screenHeight: 0.2,
      eye: { x: 0, y: 0, z: 0.5 },
      near: 0.1,
      far: 3,
    };
    const [x, y, z] = screenPointNdc(input, [0.1, 0.05, -0.3]);
    expect(Math.abs(x)).toBeLessThan(1);
    expect(Math.abs(y)).toBeLessThan(1);
    expect(z).toBeGreaterThan(-1);
    expect(z).toBeLessThan(1);
  });

  it('profondeur : −1 au plan proche, +1 au plan lointain', () => {
    const m = frustumMatrix(
      offAxisFrustum({
        screenWidth: 1,
        screenHeight: 1,
        eye: { x: 0.2, y: 0, z: 1 },
        near: 0.25,
        far: 4,
      }),
    );
    expect(projectToNdc(m, [0, 0, -0.25])[2]).toBeCloseTo(-1, 9);
    expect(projectToNdc(m, [0, 0, -4])[2]).toBeCloseTo(1, 9);
  });

  it('œil en face : tronc symétrique', () => {
    const f = offAxisFrustum({
      screenWidth: 0.4,
      screenHeight: 0.2,
      eye: { x: 0, y: 0, z: 0.5 },
      near: 0.1,
      far: 2,
    });
    expect(f.left).toBeCloseTo(-f.right, 12);
    expect(f.bottom).toBeCloseTo(-f.top, 12);
    expect(f.right).toBeCloseTo(0.04, 12);
  });

  it('refuse les valeurs non finies, l’écran vide, l’œil derrière et les plans invalides', () => {
    const ok: OffAxisInput = {
      screenWidth: 1,
      screenHeight: 1,
      eye: { x: 0, y: 0, z: 1 },
      near: 0.1,
      far: 2,
    };
    const bad: Partial<OffAxisInput>[] = [
      { screenWidth: 0 },
      { screenHeight: -1 },
      { screenWidth: Number.NaN },
      { eye: { x: 0, y: 0, z: 0 } },
      { eye: { x: 0, y: 0, z: -1 } },
      { eye: { x: Number.POSITIVE_INFINITY, y: 0, z: 1 } },
      { near: 0 },
      { near: 2, far: 2 },
      { far: Number.NaN },
    ];
    expect(() => offAxisFrustum(ok)).not.toThrow();
    for (const patch of bad) {
      expect(() => offAxisFrustum({ ...ok, ...patch })).toThrow(RangeError);
    }
  });

  it('distance d’œil par défaut selon la diagonale ; bornée', () => {
    expect(defaultEyeDistanceMm(65, 140)).toBe(EYE_DISTANCE_MM.phone);
    expect(defaultEyeDistanceMm(160, 220)).toBe(EYE_DISTANCE_MM.tablet);
    expect(defaultEyeDistanceMm(300, 190)).toBe(EYE_DISTANCE_MM.desktop);
    expect(defaultEyeDistanceMm(Number.NaN, 1)).toBe(EYE_DISTANCE_MM.desktop);
    expect(defaultEyeDistanceMm(0, 0)).toBe(EYE_DISTANCE_MM.desktop);
    expect(clampEyeDistanceMm(10)).toBe(EYE_DISTANCE_MM.min);
    expect(clampEyeDistanceMm(1e9)).toBe(EYE_DISTANCE_MM.max);
    expect(clampEyeDistanceMm(420)).toBe(420);
    expect(clampEyeDistanceMm(Number.NaN, 350)).toBe(350);
    for (const d of Object.values(EYE_DISTANCE_MM)) {
      expect(clampEyeDistanceMm(d)).toBe(d);
    }
  });
});
