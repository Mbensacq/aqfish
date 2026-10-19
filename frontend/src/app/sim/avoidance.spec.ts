import { deflect, obstacleAvoidance, proximity, wallAvoidance } from './avoidance';
import type { Vec3 } from './flocking';
import { createPrng } from '../core/random/prng';
import { DEFAULT_DECOR, decorObstacles } from './decor';
import { obstacleDistance, sphereObstacle, type Obstacle } from './obstacles';
import type { Box3 } from './tank';

function vec(): Vec3 {
  return { x: 0, y: 0, z: 0 };
}

const BOX: Box3 = { minX: -1, maxX: 1, minY: 0, maxY: 1, minZ: -0.5, maxZ: 0.5 };

describe('proximity', () => {
  it.each([
    [0.25, 1, 0.75],
    [0.5, 1, 0.5],
    [0, 1, 1],
    [-0.3, 1, 1],
    [1, 1, 0],
    [2, 1, 0],
    [0.05, 0.1, 0.5],
    [0.5, 0, 0],
    [0.5, -1, 0],
    [Number.NaN, 1, 0],
    [-Infinity, 1, 1],
    [Infinity, 1, 0],
  ])('proximity(%s, %s) = %s', (d, range, expected) => {
    expect(proximity(d, range)).toBeCloseTo(expected, 15);
  });
});

describe('wallAvoidance', () => {
  it('loin des parois : force nulle', () => {
    expect(wallAvoidance(0, 0.5, 0, BOX, 0.25, vec())).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('proportionnelle à la proximité de la paroi, dirigée vers l’intérieur', () => {
    // À 0,1 de +X avec une portée de 0,4 : 1 − 0,1 / 0,4 = 0,75 vers −X.
    expect(wallAvoidance(0.9, 0.5, 0, BOX, 0.4, vec()).x).toBeCloseTo(-0.75, 15);
    // À 0,3 de −X : 0,25 vers +X.
    expect(wallAvoidance(-0.7, 0.5, 0, BOX, 0.4, vec()).x).toBeCloseTo(0.25, 15);
    // Plus près ⇒ plus fort.
    const near = wallAvoidance(0.95, 0.5, 0, BOX, 0.4, vec()).x;
    const far = wallAvoidance(0.8, 0.5, 0, BOX, 0.4, vec()).x;
    expect(Math.abs(near)).toBeGreaterThan(Math.abs(far));
  });

  it('sable (bas) : vers le haut ; surface (haut) : vers le bas', () => {
    expect(wallAvoidance(0, 0.1, 0, BOX, 0.4, vec())).toEqual({ x: 0, y: 0.75, z: 0 });
    const top = wallAvoidance(0, 0.8, 0, BOX, 0.4, vec());
    expect(top.y).toBeCloseTo(-0.5, 15);
    expect([top.x, top.z]).toEqual([0, 0]);
  });

  it('coin : somme des deux faces', () => {
    const f = wallAvoidance(0.9, 0.5, -0.4, BOX, 0.2, vec());
    expect(f.x).toBeCloseTo(-0.5, 15);
    expect(f.y).toBe(0);
    expect(f.z).toBeCloseTo(0.5, 15);
  });

  it('au contact ou au-delà : 1 (bornée)', () => {
    expect(wallAvoidance(1, 0.5, 0, BOX, 0.2, vec()).x).toBe(-1);
    expect(wallAvoidance(5, 0.5, 0, BOX, 0.2, vec()).x).toBe(-1);
  });

  it('boîte réduite à un plan : faces opposées qui s’annulent', () => {
    const flat: Box3 = { ...BOX, minZ: 0, maxZ: 0 };
    expect(wallAvoidance(0, 0.5, 0, flat, 0.2, vec()).z).toBe(0);
  });

  it('portée nulle : aucune force', () => {
    expect(wallAvoidance(1, 0, 0.5, BOX, 0, vec())).toEqual({ x: 0, y: 0, z: 0 });
  });
});

describe('obstacleAvoidance', () => {
  const rock = sphereObstacle(0, 0, 0, 0, 0.1);

  it('aucun obstacle : force nulle', () => {
    expect(obstacleAvoidance(0, 0, 0, 1, 0, 0, [], 0, 1, vec())).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('valeur exacte : normale au point le plus proche × proximité (marge déduite)', () => {
    // Segment de (0, 0,3, 0) à (0, 0,2, 0) : point le plus proche (0, 0,2, 0), à 0,1 de la
    // surface ; marge 0,02 ⇒ d = 0,08 ; portée 0,16 ⇒ 0,5 vers +Y.
    const f = obstacleAvoidance(0, 0.3, 0, 0, 0.2, 0, [rock], 0.02, 0.16, vec());
    expect(f.x).toBe(0);
    expect(f.y).toBeCloseTo(0.5, 15);
    expect(f.z).toBe(0);
  });

  it('utilise le milieu du segment : un petit obstacle entre position et point visé est vu', () => {
    // Le segment traverse la sphère par son centre : le milieu est le centre (proximité 1).
    const f = obstacleAvoidance(-0.5, 0, 0, 0.5, 0, 0, [rock], 0, 0.05, vec());
    expect(f).toEqual({ x: 1, y: 0, z: 0 });
  });

  it('hors de portée : force nulle', () => {
    expect(obstacleAvoidance(0, 0.5, 0, 0, 0.4, 0, [rock], 0, 0.2, vec())).toEqual({
      x: 0,
      y: 0,
      z: 0,
    });
  });

  it('plusieurs obstacles : contributions additionnées', () => {
    const other = sphereObstacle(1, 0, 0.6, 0, 0.1);
    // Point (0, 0,3, 0) : à 0,2 de chaque surface, portée 0,4 ⇒ +0,5 et −0,5.
    const f = obstacleAvoidance(0, 0.3, 0, 0, 0.3, 0, [rock, other], 0, 0.4, vec());
    expect(f.y).toBeCloseTo(0, 15);
  });
});

describe('deflect', () => {
  it('force perpendiculaire au cap : inchangée ; dans le sens du cap : atténuée', () => {
    expect(deflect(0, 0.4, 0, 0, 1, vec())).toEqual({ x: 0, y: 0.4, z: 0 });
    // Le poisson fuit déjà tout droit : plus rien à corriger (y recopié).
    expect(deflect(0.3, 0.1, 0, 0, 1, vec())).toEqual({ x: 0, y: 0.1, z: 0 });
    // À 60° : garde 1 − cos 60° = 0,5 de la force.
    const f = deflect(0.5, 0, Math.sqrt(3) / 2, 0, 1, vec());
    expect(f.x).toBeCloseTo(0.25, 15);
    expect(f.z).toBeCloseTo(Math.sqrt(3) / 4, 15);
    expect(deflect(0, 0, 0.5, 0, 1, vec())).toEqual({ x: 0, y: 0, z: 0.5 });
    expect(deflect(0, 0, 0, 0, 1, vec())).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('force oblique opposée : composante opposée tournée du côté demandé (valeurs exactes)', () => {
    // Cap +X, force (−0,6 ; 0,2 ; 0,8) : latéral (0 ; 0,8) ± 0,6 selon Z ; y recopié.
    const left = deflect(-0.6, 0.2, 0.8, 0, 1, vec());
    expect(left.x).toBeCloseTo(0, 15);
    expect(left.y).toBe(0.2);
    expect(left.z).toBeCloseTo(1.4, 15);
    const right = deflect(-0.6, 0.2, 0.8, 0, -1, vec());
    expect(right.x).toBeCloseTo(0, 15);
    expect(right.z).toBeCloseTo(0.2, 15);
  });

  it('pile en face : virage perpendiculaire du côté demandé, même norme', () => {
    const left = deflect(-0.5, 0, 0, 0, 1, vec());
    expect(left.x).toBeCloseTo(0, 15);
    expect(left.z).toBeCloseTo(0.5, 15);
    const right = deflect(-0.5, 0, 0, 0, -1, vec());
    expect(right.x).toBeCloseTo(0, 15);
    expect(right.z).toBeCloseTo(-0.5, 15);
    // Cap +Z (yaw = π/2), côté positif : vers −X (caps croissants).
    const f = deflect(0, 0, -2, Math.PI / 2, 0, vec());
    expect(f.x).toBeCloseTo(-2, 15);
    expect(f.z).toBeCloseTo(0, 15);
  });

  it('force nettement oblique : la géométrie l’emporte sur `side`', () => {
    // Cap +X, paroi devant à droite (force vers −Z dominante) : latéral (0 ; −0,9) + 0,3 ⇒ −0,6.
    const f = deflect(-0.3, 0, -0.9, 0, 1, vec());
    expect(f.x).toBeCloseTo(0, 15);
    expect(f.z).toBeCloseTo(-0.6, 15);
  });

  it('continue en yaw : un coin (petite force latérale qui apparaît) ne fait pas basculer le côté', () => {
    // Coin +X / +Z : cap presque +Z, force de +X présente ou non selon le point visé.
    const withCorner = deflect(-0.047, 0, -1, 1.524, -1, vec());
    const without = deflect(0, 0, -1, 1.566, -1, vec());
    expect(Math.sign(withCorner.x)).toBe(Math.sign(without.x));
    expect(Math.abs(withCorner.x - without.x)).toBeLessThan(0.1);
  });

  it('ne dépend pas de l’inclinaison : composante verticale sans effet dans le plan', () => {
    const flat = deflect(-0.05, 0, 1, -1.517, 1, vec());
    const withY = deflect(-0.05, 0.27, 1, -1.517, 1, vec());
    expect(withY.x).toBe(flat.x);
    expect(withY.z).toBe(flat.z);
  });
});

describe('obstacleAvoidance : rejet des obstacles lointains', () => {
  /** Calcul complet, sans rejet : référence. */
  function reference(
    a: Vec3,
    b: Vec3,
    obstacles: readonly Obstacle[],
    clearance: number,
    range: number,
  ): Vec3 {
    const out = vec();
    const n = vec();
    for (const o of obstacles) {
      let best = Infinity;
      let nb = vec();
      for (const t of [0, 0.5, 1]) {
        const d = obstacleDistance(
          o,
          a.x + (b.x - a.x) * t,
          a.y + (b.y - a.y) * t,
          a.z + (b.z - a.z) * t,
          n,
        );
        if (d < best) {
          best = d;
          nb = { ...n };
        }
      }
      const w = proximity(best - clearance, range);
      out.x += nb.x * w;
      out.y += nb.y * w;
      out.z += nb.z * w;
    }
    return out;
  }

  it('même résultat que le calcul complet, au bit près (décor par défaut, balayage)', () => {
    const obstacles = decorObstacles(DEFAULT_DECOR);
    const rng = createPrng(21);
    const out = vec();
    let nonZero = 0;
    for (let k = 0; k < 2000; k++) {
      const a = {
        x: (rng.next() - 0.5) * 1.2,
        y: 0.06 + rng.next() * 0.5,
        z: (rng.next() - 0.5) * 0.5,
      };
      const b = {
        x: a.x + (rng.next() - 0.5) * 0.2,
        y: a.y + (rng.next() - 0.5) * 0.1,
        z: a.z + (rng.next() - 0.5) * 0.2,
      };
      obstacleAvoidance(a.x, a.y, a.z, b.x, b.y, b.z, obstacles, 0.01, 0.07, out);
      const expected = reference(a, b, obstacles, 0.01, 0.07);
      expect(out.x).toBe(expected.x);
      expect(out.y).toBe(expected.y);
      expect(out.z).toBe(expected.z);
      if (out.x !== 0 || out.z !== 0) {
        nonZero++;
      }
    }
    // Le balayage couvre des segments proches (force non nulle) et lointains.
    expect(nonZero).toBeGreaterThan(100);
    expect(nonZero).toBeLessThan(1900);
  });
});
