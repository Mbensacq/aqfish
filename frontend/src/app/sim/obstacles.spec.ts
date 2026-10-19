import type { Vec3 } from './flocking';
import { obstacleDistance, sphereObstacle, validateObstacle, type Obstacle } from './obstacles';

function vec(): Vec3 {
  return { x: 0, y: 0, z: 0 };
}

describe('sphereObstacle', () => {
  it('crée une sphère sérialisable en JSON', () => {
    const o = sphereObstacle(3, 0.1, 0.2, -0.1, 0.05);
    expect(o).toEqual({ id: 3, shape: 'sphere', x: 0.1, y: 0.2, z: -0.1, radius: 0.05 });
    expect(JSON.parse(JSON.stringify(o))).toEqual(o);
  });

  it.each([
    [-1, 0, 0, 0, 0.1],
    [1.5, 0, 0, 0, 0.1],
    [0, Number.NaN, 0, 0, 0.1],
    [0, 0, Infinity, 0, 0.1],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, -0.1],
    [0, 0, 0, 0, Infinity],
  ])('refuse des valeurs invalides (%s, %s, %s, %s, %s)', (id, x, y, z, r) => {
    expect(() => sphereObstacle(id, x, y, z, r)).toThrow(RangeError);
  });

  it('signale une forme inconnue', () => {
    const bogus = { id: 0, shape: 'cube', x: 0, y: 0, z: 0, radius: 1 } as unknown as Obstacle;
    expect(validateObstacle(bogus)).toEqual(['forme d’obstacle inconnue : cube']);
  });
});

describe('obstacleDistance (sphère)', () => {
  const o = sphereObstacle(0, 1, 2, 3, 0.5);

  it('dehors : distance positive et normale sortante unitaire', () => {
    const n = vec();
    expect(obstacleDistance(o, 1, 2, 5, n)).toBe(1.5);
    expect(n).toEqual({ x: 0, y: 0, z: 1 });
  });

  it('sur la surface : distance nulle', () => {
    const n = vec();
    expect(obstacleDistance(o, 0.5, 2, 3, n)).toBe(0);
    expect(n).toEqual({ x: -1, y: 0, z: 0 });
  });

  it('dedans : distance négative', () => {
    const n = vec();
    expect(obstacleDistance(o, 1, 2.25, 3, n)).toBe(-0.25);
    expect(n).toEqual({ x: 0, y: 1, z: 0 });
  });

  it('centre exact : −rayon, normale +X par convention', () => {
    const n = vec();
    expect(obstacleDistance(o, 1, 2, 3, n)).toBe(-0.5);
    expect(n).toEqual({ x: 1, y: 0, z: 0 });
  });

  it('diagonale : normale normalisée', () => {
    const n = vec();
    const d = obstacleDistance(o, 4, 6, 3, n); // écart (3, 4, 0), norme 5
    expect(d).toBe(4.5);
    expect(n.x).toBeCloseTo(0.6, 15);
    expect(n.y).toBeCloseTo(0.8, 15);
    expect(n.z).toBe(0);
  });
});

describe('obstacle en union de sphères', () => {
  const union: Obstacle = {
    id: 1,
    shape: 'spheres',
    spheres: [
      { x: 0, y: 0, z: 0, radius: 1 },
      { x: 3, y: 0, z: 0, radius: 0.5 },
    ],
  };

  it('valide, sérialisable en JSON', () => {
    expect(validateObstacle(union)).toEqual([]);
    expect(JSON.parse(JSON.stringify(union))).toEqual(union);
  });

  it('refuse une liste vide ou une sphère invalide, en nommant la sphère', () => {
    expect(validateObstacle({ id: 0, shape: 'spheres', spheres: [] })).toEqual([
      'spheres doit être une liste non vide',
    ]);
    const bad: Obstacle = {
      id: 0,
      shape: 'spheres',
      spheres: [union.spheres[0], { x: Number.NaN, y: 0, z: 0, radius: -1 }],
    };
    expect(validateObstacle(bad)).toEqual([
      'spheres[1].x doit être un réel fini (reçu : NaN)',
      'spheres[1].radius doit être un réel strictement positif (reçu : -1)',
    ]);
  });

  it('distance : la plus petite des sphères, normale de la sphère la plus proche', () => {
    const n = vec();
    expect(obstacleDistance(union, 4, 0, 0, n)).toBeCloseTo(0.5, 12);
    expect(n).toEqual({ x: 1, y: 0, z: 0 });
    expect(obstacleDistance(union, -2, 0, 0, n)).toBeCloseTo(1, 12);
    expect(n).toEqual({ x: -1, y: 0, z: 0 });
  });

  it('entre deux sphères : hors de l’union (pas d’enveloppe unique)', () => {
    const n = vec();
    // x = 1,8 : à 0,8 de la première surface, à 0,7 de la seconde.
    expect(obstacleDistance(union, 1.8, 0, 0, n)).toBeCloseTo(0.7, 12);
    expect(n.x).toBeCloseTo(-1, 12);
  });

  it('à l’intérieur : distance négative ; à égalité, la première sphère', () => {
    const n = vec();
    expect(obstacleDistance(union, 3, 0.25, 0, n)).toBeCloseTo(-0.25, 12);
    expect(n).toEqual({ x: 0, y: 1, z: 0 });
    const twins: Obstacle = {
      id: 2,
      shape: 'spheres',
      spheres: [
        { x: -1, y: 0, z: 0, radius: 0.5 },
        { x: 1, y: 0, z: 0, radius: 0.5 },
      ],
    };
    expect(obstacleDistance(twins, 0, 0, 0, n)).toBeCloseTo(0.5, 12);
    expect(n).toEqual({ x: 1, y: 0, z: 0 });
  });
});
