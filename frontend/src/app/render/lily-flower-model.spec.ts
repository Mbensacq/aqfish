import { PALETTE_COLORS } from './palette';
import {
  buildFlowerCore,
  buildLotusStalk,
  buildPetal,
  buildPrism,
  FLOWER_CORE_RADIUS,
  flowerSpread,
  LILY_FLOWER_COLORS,
  LOTUS_STALK_HEIGHT,
  PETAL_RINGS,
  PETAL_THICKNESS,
  petalTilt,
  type PrismData,
} from './lily-flower-model';

/** Vérifie que chaque triangle d'un prisme convexe est orienté vers l'extérieur. */
function expectOutward(prism: PrismData): void {
  const p = prism.positions;
  const count = p.length / 3;
  const center = [0, 1, 2].map((k) => {
    let sum = 0;
    for (let i = 0; i < count; i++) sum += p[3 * i + k];
    return sum / count;
  });
  const at = (i: number) => [p[3 * i], p[3 * i + 1], p[3 * i + 2]];
  for (let t = 0; t < prism.indices.length; t += 3) {
    const [a, b, c] = [at(prism.indices[t]), at(prism.indices[t + 1]), at(prism.indices[t + 2])];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const out = [0, 1, 2].map((m) => (a[m] + b[m] + c[m]) / 3 - center[m]);
    expect(n[0] * out[0] + n[1] * out[1] + n[2] * out[2]).toBeGreaterThan(0);
  }
}

describe('lily-flower-model', () => {
  it('couleurs de la palette : rose nénuphar, cœur jaune (docs/DA.md)', () => {
    expect(LILY_FLOWER_COLORS.petal).toBe('#f06a9b');
    expect(LILY_FLOWER_COLORS.core).toBe('#ffb703');
    for (const color of Object.values(LILY_FLOWER_COLORS)) {
      expect(PALETTE_COLORS).toContain(color);
    }
  });

  it('prisme : 2n sommets, 4n − 4 triangles, tous orientés vers l’extérieur', () => {
    const square: [number, number][] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    for (const axis of ['x', 'y'] as const) {
      const prism = buildPrism(square, 0.5, axis);
      expect(prism.positions.length).toBe(2 * 4 * 3);
      expect(prism.indices.length).toBe(3 * (4 * 4 - 4));
      expectOutward(prism);
    }
    // Ordre des sommets indifférent (horaire ou trigonométrique).
    expectOutward(buildPrism([...square].reverse(), 0.5, 'y'));
  });

  it('pétales, cœur et tige : prismes fermés orientés vers l’extérieur', () => {
    for (const ring of PETAL_RINGS) {
      expectOutward(buildPetal(ring));
    }
    expectOutward(buildFlowerCore());
    expectOutward(buildLotusStalk());
  });

  it('pétale : base à l’origine, pointe à sa longueur, épaisseur selon X', () => {
    const ring = PETAL_RINGS[0];
    const p = buildPetal(ring).positions;
    const ys = p.filter((_, i) => i % 3 === 1);
    const xs = p.filter((_, i) => i % 3 === 0);
    expect(Math.min(...ys)).toBe(0);
    expect(Math.max(...ys)).toBeCloseTo(ring.length, 6);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(PETAL_THICKNESS, 6);
  });

  it('tige du lotus : de la feuille (y = 0) à LOTUS_STALK_HEIGHT', () => {
    const ys = buildLotusStalk().positions.filter((_, i) => i % 3 === 1);
    expect(Math.min(...ys)).toBe(0);
    expect(Math.max(...ys)).toBeCloseTo(LOTUS_STALK_HEIGHT, 6);
  });

  it('inclinaison exacte aux bornes, croissante avec l’ouverture', () => {
    for (const ring of PETAL_RINGS) {
      expect(petalTilt(ring, 0)).toBe(ring.closedTilt);
      expect(petalTilt(ring, 1)).toBe(ring.openTilt);
      expect(petalTilt(ring, 0.5)).toBeGreaterThan(ring.closedTilt);
      expect(petalTilt(ring, 0.5)).toBeLessThan(ring.openTilt);
      // Fermée, presque verticale ; ouverte, nettement penchée sans dépasser l'horizontale.
      expect(ring.closedTilt).toBeLessThan(0.2);
      expect(ring.openTilt).toBeLessThan(Math.PI / 2);
    }
  });

  it.each([-0.01, 1.01, Number.NaN])('refuse l’ouverture %s', (openness) => {
    expect(() => petalTilt(PETAL_RINGS[0], openness)).toThrow(RangeError);
  });

  it('vue de dessus : fermée, un petit bouton ; ouverte, une fleur bien plus large', () => {
    const closed = flowerSpread(0);
    const open = flowerSpread(1);
    expect(closed).toBeGreaterThanOrEqual(FLOWER_CORE_RADIUS);
    expect(open).toBeGreaterThan(2.5 * closed);
    expect(flowerSpread(0.5)).toBeGreaterThan(closed);
    expect(flowerSpread(0.5)).toBeLessThan(open);
  });

  it.each([
    [
      [
        [0, 0],
        [1, 0],
      ],
      1,
    ],
    [
      [
        [0, 0],
        [1, 0],
        [0, 1],
      ],
      0,
    ],
    [
      [
        [0, 0],
        [1, 0],
        [0, 1],
      ],
      Number.NaN,
    ],
  ] as const)('buildPrism refuse un polygone ou une épaisseur invalide', (polygon, depth) => {
    expect(() => buildPrism(polygon, depth, 'y')).toThrow(RangeError);
  });
});
