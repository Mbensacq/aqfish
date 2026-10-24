import { SIM_DT } from './constants';
import {
  DEFAULT_DECOR,
  decorObstacles,
  decorToTank,
  MAX_DECOR_SCALE,
  MIN_DECOR_SCALE,
  parseDecor,
  parseDecorItems,
  rockBaseY,
  rockModel,
  rockSpheres,
  decorBaseY,
  decorSpheres,
  validateDecorItem,
  withElevation,
  type DecorItem,
} from './decor';
import type { Vec3 } from './flocking';
import { obstacleDistance, sphereObstacle, validateObstacle, type Obstacle } from './obstacles';
import { NEON } from './species';
import { createFish, stepFish, swimBounds, type Fish } from './swimmer';
import { DEFAULT_TANK, SAND_THICKNESS, waterVolume } from './tank';
import { advanceInPlace, createDefaultWorld, createWorld, type MutableWorld } from './world';

type MutableFish = { -readonly [K in keyof Fish]: Fish[K] };

const ROCK: DecorItem = { kind: 'rock', x: 0.1, z: -0.05, rotation: 0.7, scale: 1, seed: 42 };
/** Rochers du décor par défaut (qui contient aussi des plantes, `plant.spec.ts`). */
const DEFAULT_ROCKS = DEFAULT_DECOR.filter((d) => d.kind === 'rock');

function vec(): Vec3 {
  return { x: 0, y: 0, z: 0 };
}

describe('DecorItem : données JSON validées', () => {
  it('un élément valide passe la validation et survit à un aller-retour JSON', () => {
    expect(validateDecorItem(ROCK)).toEqual([]);
    expect(parseDecor(JSON.stringify([ROCK]))).toEqual([ROCK]);
  });

  it('ne garde que les clés connues et copie les éléments', () => {
    const input = [{ ...ROCK }];
    const items = parseDecorItems(input);
    expect(items[0]).not.toBe(input[0]);
    input[0].x = 0.3;
    expect(items[0].x).toBe(0.1);
  });

  it.each([
    ['un objet absent', null, /objet/],
    ['une liste', [], /objet/],
    ['un type inconnu', { ...ROCK, kind: 'tree' }, /kind inconnu : tree/],
    ['une clé inconnue', { ...ROCK, y: 0.2 }, /clé inconnue : y/],
    ['une clé manquante', { kind: 'rock', x: 0, z: 0, rotation: 0, scale: 1 }, /seed/],
    ['un nombre non fini', { ...ROCK, rotation: Number.NaN }, /rotation/],
    ['une chaîne à la place d’un nombre', { ...ROCK, x: '0.1' }, /x doit être un réel fini/],
    ['une échelle trop petite', { ...ROCK, scale: MIN_DECOR_SCALE / 2 }, /scale/],
    ['une échelle trop grande', { ...ROCK, scale: MAX_DECOR_SCALE + 0.1 }, /scale/],
    ['une échelle nulle', { ...ROCK, scale: 0 }, /scale/],
    ['une graine négative', { ...ROCK, seed: -1 }, /seed/],
    ['une graine non entière', { ...ROCK, seed: 1.5 }, /seed/],
    ['une graine au-delà de 32 bits', { ...ROCK, seed: 2 ** 32 }, /seed/],
    ['un x hors du bac', { ...ROCK, x: DEFAULT_TANK.width / 2 + 0.01 }, /x hors du bac/],
    ['un z hors du bac', { ...ROCK, z: -DEFAULT_TANK.depth / 2 - 0.01 }, /z hors du bac/],
  ])('refuse %s', (_, value, message) => {
    const problems = validateDecorItem(value);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join(' ; ')).toMatch(message);
    expect(() => parseDecorItems([ROCK, value])).toThrow(RangeError);
    expect(() => parseDecorItems([ROCK, value])).toThrow(/élément 1/);
  });

  it('accepte les bornes exactes (bord du bac, échelles extrêmes, graine maximale)', () => {
    const edge = { ...ROCK, x: DEFAULT_TANK.width / 2, z: -DEFAULT_TANK.depth / 2 };
    expect(validateDecorItem(edge)).toEqual([]);
    expect(validateDecorItem({ ...ROCK, scale: MIN_DECOR_SCALE })).toEqual([]);
    expect(validateDecorItem({ ...ROCK, scale: MAX_DECOR_SCALE, seed: 0xffffffff })).toEqual([]);
  });

  it('refuse un texte qui n’est pas du JSON, ou pas une liste', () => {
    expect(() => parseDecor('[{')).toThrow(/JSON invalide/);
    expect(() => parseDecor('{"kind": "rock"}')).toThrow(/liste/);
    expect(parseDecor('[]')).toEqual([]);
  });

  it('décor par défaut : quelques rochers valides, de graines distinctes', () => {
    expect(DEFAULT_DECOR.length).toBeGreaterThanOrEqual(3);
    expect(parseDecorItems(DEFAULT_DECOR)).toEqual(DEFAULT_DECOR);
    expect(new Set(DEFAULT_DECOR.map((d) => d.seed)).size).toBe(DEFAULT_DECOR.length);
  });
});

describe('rockModel : rochers voxel générés depuis la graine', () => {
  it('même graine, même forme ; autre graine, autre forme', () => {
    expect(rockModel(7, 1)).toEqual(rockModel(7, 1));
    expect(rockModel(8, 1).cells).not.toEqual(rockModel(7, 1).cells);
  });

  it('l’échelle change la taille des voxels, pas la forme', () => {
    const small = rockModel(7, 0.5);
    const big = rockModel(7, 2);
    expect(big.cells).toEqual(small.cells);
    expect(big.voxelSize).toBeCloseTo(4 * small.voxelSize, 12);
  });

  it.each([0, 1, 42, 0xffffffff])(
    'graine %s : plusieurs blocs, voxels au-dessus de la base, base posée à plat',
    (seed) => {
      const model = rockModel(seed, 1);
      expect(model.blobs.length).toBeGreaterThanOrEqual(2);
      expect(model.blobs.length).toBeLessThanOrEqual(4);
      expect(model.cells.length).toBeGreaterThan(50);
      expect(Math.min(...model.cells.map((c) => c.j))).toBe(0);
      // Assise : la rangée du bas couvre une bonne part de l'emprise du rocher.
      const base = model.cells.filter((c) => c.j === 0).length;
      const footprint = new Set(model.cells.map((c) => `${c.i},${c.k}`)).size;
      expect(base / footprint).toBeGreaterThan(0.5);
      // Pas de voxel en double.
      expect(new Set(model.cells.map((c) => `${c.i},${c.j},${c.k}`)).size).toBe(model.cells.length);
    },
  );

  it('refuse une échelle invalide', () => {
    expect(() => rockModel(1, 0)).toThrow(RangeError);
    expect(() => rockModel(1, Number.NaN)).toThrow(RangeError);
  });
});

describe('forme de collision des rochers (union de sphères)', () => {
  it('une sphère par bloc, valide, avec des identifiants consécutifs', () => {
    const obstacles = decorObstacles(DEFAULT_DECOR, 5);
    expect(obstacles.map((o) => o.id)).toEqual(DEFAULT_DECOR.map((_, i) => 5 + i));
    obstacles.forEach((o, i) => {
      expect(o.shape).toBe('spheres');
      expect(validateObstacle(o)).toEqual([]);
      if (DEFAULT_DECOR[i].kind === 'rock') {
        expect(o.spheres.length).toBe(rockModel(DEFAULT_DECOR[i].seed, 1).blobs.length);
      }
    });
    expect(DEFAULT_ROCKS.length).toBeGreaterThanOrEqual(3);
    expect(JSON.parse(JSON.stringify(obstacles))).toEqual(obstacles);
  });

  it.each([ROCK, ...DEFAULT_ROCKS])(
    'chaque coin de chaque voxel est dans la forme de collision (rocher %#)',
    (item) => {
      const model = rockModel(item.seed, item.scale);
      const obstacle: Obstacle = decorObstacles([item])[0];
      const v = model.voxelSize;
      const p = vec();
      const n = vec();
      for (const c of model.cells) {
        for (let corner = 0; corner < 8; corner++) {
          decorToTank(
            item,
            rockBaseY(v),
            (c.i + (corner & 1)) * v,
            (c.j + ((corner >> 1) & 1)) * v,
            (c.k + ((corner >> 2) & 1)) * v,
            p,
          );
          expect(obstacleDistance(obstacle, p.x, p.y, p.z, n)).toBeLessThanOrEqual(1e-9);
        }
      }
    },
  );

  it('plusieurs sphères et non une enveloppe unique : le rocher n’est pas sa sphère englobante', () => {
    const spheres = rockSpheres(DEFAULT_DECOR[0]);
    expect(spheres.length).toBeGreaterThan(1);
    // Point entre deux blocs, hors de l'union, mais dans une sphère englobant le tout.
    const [a, b] = spheres;
    const mid = {
      x: (a.x + b.x) / 2,
      y: Math.max(a.y, b.y) + Math.max(a.radius, b.radius),
      z: (a.z + b.z) / 2,
    };
    const n = vec();
    expect(
      obstacleDistance(decorObstacles([DEFAULT_DECOR[0]])[0], mid.x, mid.y, mid.z, n),
    ).toBeGreaterThan(0);
  });

  it('les rochers reposent sur le sable : base légèrement enfoncée, sans flotter', () => {
    for (const item of DEFAULT_ROCKS) {
      const v = rockModel(item.seed, item.scale).voxelSize;
      expect(rockBaseY(v)).toBeLessThan(SAND_THICKNESS);
      expect(rockBaseY(v)).toBeGreaterThan(SAND_THICKNESS - v);
    }
  });

  it('decorToTank : rotation autour de Y dans le sens de Three.js (rotation.y)', () => {
    const p = vec();
    decorToTank({ ...ROCK, x: 0, z: 0, rotation: Math.PI / 2 }, 0, 1, 0, 0, p);
    // Rotation de +90° autour de Y : +X devient −Z.
    expect(p.x).toBeCloseTo(0, 12);
    expect(p.z).toBeCloseTo(-1, 12);
  });
});

describe('poissons et rochers', () => {
  it.each([1, 42, 0xffffffff])(
    'graine %s, 60 s simulées dans le monde par défaut : aucun poisson n’entre dans un rocher',
    (seed) => {
      const world = createDefaultWorld(seed) as MutableWorld;
      const rocks = world.obstacles;
      expect(rocks.length).toBe(DEFAULT_DECOR.length);
      const n = vec();
      let inside = 0;
      let minDistance = Infinity;
      for (let i = 0; i < 60 / SIM_DT; i++) {
        advanceInPlace(world, 1);
        for (const f of world.entities) {
          for (const rock of rocks) {
            const d = obstacleDistance(rock, f.x, f.y, f.z, n);
            minDistance = Math.min(minDistance, d);
            if (d < 0) {
              inside++;
            }
          }
        }
      }
      expect(inside).toBe(0);
      expect(minDistance).toBeGreaterThanOrEqual(0);
    },
    15_000,
  );

  it('un poisson traverse un passage de deux fois sa longueur entre deux rochers', () => {
    // Bac très grand : seuls les rochers comptent. Deux rochers de part et d'autre de l'axe
    // X, écartés pour que le passage mesure 2 × la longueur du néon à la hauteur de nage.
    const water = waterVolume({ width: 3, height: 2, depth: 3 });
    const bounds = swimBounds(NEON, water);
    const swimY = bounds.hard.minY + 0.01;
    const gap = 2 * NEON.bodyLength;
    const left: DecorItem = { kind: 'rock', x: 0, z: 0, rotation: 0, scale: 2, seed: 11 };
    const right: DecorItem = { ...left, seed: 3 };
    // Étendue en Z de chaque rocher à la hauteur de nage, rocher centré en z = 0.
    const extentZ = (item: DecorItem, sign: 1 | -1): number =>
      Math.max(
        ...rockSpheres(item)
          .filter((s) => Math.abs(swimY - s.y) < s.radius)
          .map((s) => sign * s.z + Math.sqrt(s.radius ** 2 - (swimY - s.y) ** 2)),
      );
    const items = [
      { ...left, z: -(gap / 2 + extentZ(left, 1)) },
      { ...right, z: gap / 2 + extentZ(right, -1) },
    ];
    const rocks = decorObstacles(items);
    // Le passage est bien ouvert à la hauteur de nage, et de la largeur voulue : tout point
    // de la bande |z| < gap / 2 est hors des deux rochers.
    const n = vec();
    for (let x = -0.3; x <= 0.3; x += 0.005) {
      for (let z = -gap / 2 + 1e-4; z < gap / 2; z += 0.005) {
        for (const rock of rocks) {
          expect(obstacleDistance(rock, x, swimY, z, n)).toBeGreaterThan(0);
        }
      }
    }
    expect(obstacleDistance(rocks[0], 0, swimY, -gap / 2, n)).toBeCloseTo(0, 6);

    const f = createFish(42, 0, 'neon', bounds) as MutableFish;
    Object.assign(f, { x: -0.4, y: swimY, z: 0, yaw: 0, pitch: 0, turn: 0 });
    Object.assign(f, { pitchTarget: 0, speed: 0.06 });
    let crossed = false;
    let minClearance = Infinity;
    let maxAbsZBetween = 0;
    for (let i = 0; i < 1200 && !crossed; i++) {
      f.turn = 0; // errance neutralisée : seul l'évitement oriente le poisson
      stepFish(f, SIM_DT, bounds, 0, 0, 0, rocks);
      for (const rock of rocks) {
        minClearance = Math.min(minClearance, obstacleDistance(rock, f.x, f.y, f.z, n));
      }
      if (Math.abs(f.x) < 0.15) {
        maxAbsZBetween = Math.max(maxAbsZBetween, Math.abs(f.z));
      }
      crossed = f.x > 0.3;
    }
    expect(crossed).toBe(true);
    // Passé par le passage (et non autour des rochers) sans les toucher.
    expect(maxAbsZBetween).toBeLessThan(gap / 2);
    expect(minClearance).toBeGreaterThan(0);
  });

  it('createWorld : obstacles du décor après les obstacles explicites, décor copié', () => {
    const world = createWorld(5, [{ species: 'neon', count: 3 }], [], DEFAULT_DECOR);
    expect(world.decor).toEqual(DEFAULT_DECOR);
    expect(world.decor[0]).not.toBe(DEFAULT_DECOR[0]);
    expect(world.obstacles.map((o) => o.id)).toEqual(DEFAULT_DECOR.map((_, i) => i));
    expect(JSON.parse(JSON.stringify(world))).toEqual(world);
    expect(() => createWorld(5, [], [], [{ ...ROCK, scale: -1 }])).toThrow(RangeError);
    const withSphere = createWorld(5, [], [sphereObstacle(3, 0, 0.3, 0, 0.05)], [ROCK]);
    expect(withSphere.obstacles.map((o) => [o.id, o.shape])).toEqual([
      [3, 'sphere'],
      [4, 'spheres'],
    ]);
  });
});

describe('élévation d’un élément posé sur un autre (#170)', () => {
  it('validée : réel fini dans [0, hauteur du bac] ; absente par défaut', () => {
    expect(validateDecorItem({ ...ROCK, elevation: 0 })).toEqual([]);
    expect(validateDecorItem({ ...ROCK, elevation: DEFAULT_TANK.height })).toEqual([]);
    for (const elevation of [-0.001, DEFAULT_TANK.height + 0.01, NaN, '0.1', null]) {
      expect(validateDecorItem({ ...ROCK, elevation })).toHaveLength(1);
    }
  });

  it('conservée au décodage, omise quand elle est absente', () => {
    const [a, b] = parseDecorItems([{ ...ROCK, elevation: 0.05 }, ROCK]);
    expect(a.elevation).toBe(0.05);
    expect(b).not.toHaveProperty('elevation');
  });

  it('withElevation : clé omise à 0, sans modifier l’original', () => {
    const raised = withElevation(ROCK, 0.03);
    expect(raised).toEqual({ ...ROCK, elevation: 0.03 });
    expect(withElevation(raised, 0)).toEqual(ROCK);
    expect(withElevation(raised, 0)).not.toHaveProperty('elevation');
    expect(ROCK).not.toHaveProperty('elevation');
  });

  it('élève la base et les sphères de collision de chaque type', () => {
    const items: DecorItem[] = [
      ROCK,
      { kind: 'wood', x: 0, z: 0, rotation: 0, scale: 1, seed: 5 },
      { kind: 'plant', form: 'tall', x: 0, z: 0, rotation: 0, scale: 1, seed: 6 },
    ];
    for (const item of items) {
      const raised = withElevation(item, 0.04);
      expect(decorBaseY(raised)).toBeCloseTo(decorBaseY(item) + 0.04, 12);
      const low = decorSpheres(item);
      decorSpheres(raised).forEach((s, n) => {
        expect(s.y).toBeCloseTo(low[n].y + 0.04, 12);
        expect(s.x).toBe(low[n].x);
      });
    }
  });
});
