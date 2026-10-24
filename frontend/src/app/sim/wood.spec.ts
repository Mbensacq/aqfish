import { MAX_SEED } from '../core/random/prng';
import { SIM_DT } from './constants';
import {
  DEFAULT_DECOR,
  decorBaseY,
  decorObstacles,
  decorSpheres,
  parseDecor,
  validateDecorItem,
  woodBaseY,
  woodSpheres,
  type DecorItem,
} from './decor';
import {
  addDecorItem,
  DECOR_CATALOG,
  decorFootprint,
  decorItemsOverlap,
  withDecor,
} from './decor-edit';
import { FOOD_RADIUS, restHeightAt, woodTopAt } from './food';
import type { Vec3 } from './flocking';
import { obstacleDistance, validateObstacle } from './obstacles';
import { NEON, SPECIES } from './species';
import { createFish, stepFish, swimBounds, type Fish } from './swimmer';
import { parseWorld, serializeWorld } from './save';
import { SAND_THICKNESS, waterVolume } from './tank';
import { createDefaultWorld } from './world';
import {
  MAX_WOOD_SPHERES,
  WOOD_SINK_RATIO,
  WOOD_VOXEL_SIZE,
  woodModel,
  woodSkeleton,
  type WoodModel,
  type WoodSphere,
} from './wood';

type MutableFish = { -readonly [K in keyof Fish]: Fish[K] };

/** Graines balayées par les tests de propriété (0 et la graine maximale comprises). */
const SEEDS = [...Array.from({ length: 300 }, (_, n) => n * 7919 + 1), 0, MAX_SEED];

/**
 * Largeur du plus petit poisson, majorée par sa longueur : la plus petite `bodyLength` de
 * toutes les espèces (aucune espèce n'est plus large que longue).
 */
const SMALLEST_FISH = Math.min(...Object.values(SPECIES).map((s) => s.bodyLength));

function vec(): Vec3 {
  return { x: 0, y: 0, z: 0 };
}

/** Plus petite distance (en voxels) du point à la surface de l'union de sphères. */
function clearance(spheres: readonly WoodSphere[], x: number, y: number, z: number): number {
  return Math.min(...spheres.map((s) => Math.hypot(s.x - x, s.y - y, s.z - z) - s.r));
}

/**
 * Plus large passage entre deux branches distinctes (en voxels) : pour chaque paire de bouts
 * de branche (sphère la plus éloignée du tronc), le point du segment qui les relie le plus
 * dégagé de toutes les sphères donne un disque libre de diamètre 2 × son dégagement.
 */
function widestPassage(model: WoodModel): number {
  const branches = [...new Set(model.spheres.map((s) => s.branch))].filter((b) => b > 0);
  const tip = (b: number): WoodSphere => model.spheres.filter((s) => s.branch === b).at(-1)!;
  let best = -Infinity;
  for (const a of branches) {
    for (const b of branches) {
      if (a >= b) continue;
      const p = tip(a);
      const q = tip(b);
      for (let u = 0; u <= 1 + 1e-9; u += 0.05) {
        const free = clearance(
          model.spheres,
          p.x + (q.x - p.x) * u,
          p.y + (q.y - p.y) * u,
          p.z + (q.z - p.z) * u,
        );
        best = Math.max(best, 2 * free);
      }
    }
  }
  return best;
}

/** Nombre de composantes connexes des voxels (voisinage 26). */
function components(model: WoodModel): number {
  const key = (i: number, j: number, k: number): string => `${i},${j},${k}`;
  const filled = new Set(model.cells.map((c) => key(c.i, c.j, c.k)));
  const seen = new Set<string>();
  let count = 0;
  for (const c of model.cells) {
    if (seen.has(key(c.i, c.j, c.k))) continue;
    count++;
    const stack = [[c.i, c.j, c.k]];
    seen.add(key(c.i, c.j, c.k));
    while (stack.length > 0) {
      const [i, j, k] = stack.pop()!;
      for (let a = -1; a <= 1; a++)
        for (let b = -1; b <= 1; b++)
          for (let d = -1; d <= 1; d++) {
            const n = key(i + a, j + b, k + d);
            if (filled.has(n) && !seen.has(n)) {
              seen.add(n);
              stack.push([i + a, j + b, k + d]);
            }
          }
    }
  }
  return count;
}

describe('woodModel : bois flotté à branches tiré de sa graine', () => {
  it('même graine, même forme ; deux graines, deux silhouettes', () => {
    expect(woodModel(7, 1)).toEqual(woodModel(7, 1));
    expect(woodSkeleton(7)).toEqual(woodSkeleton(7));
    const silhouette = (seed: number): string =>
      woodModel(seed, 1)
        .cells.map((c) => `${c.i},${c.j},${c.k}`)
        .join(';');
    expect(silhouette(7)).not.toBe(silhouette(8));
    // Sur 50 graines, 50 silhouettes distinctes.
    expect(new Set(SEEDS.slice(0, 50).map(silhouette)).size).toBe(50);
  });

  it('un tronc et 2 à 4 branches (dont une fourche au plus)', () => {
    for (const seed of SEEDS) {
      const branches = new Set(woodSkeleton(seed).map((s) => s.branch));
      expect(branches.has(0)).toBe(true);
      expect(branches.size - 1).toBeGreaterThanOrEqual(2);
      expect(branches.size - 1).toBeLessThanOrEqual(4);
    }
  });

  it('voxels triés, sans doublon, au-dessus de la base, d’un seul tenant, posés sur le sable', () => {
    for (const seed of SEEDS) {
      const model = woodModel(seed, 1);
      const keys = model.cells.map((c) => `${c.i},${c.j},${c.k}`);
      expect(new Set(keys).size).toBe(keys.length);
      for (let n = 1; n < model.cells.length; n++) {
        const a = model.cells[n - 1];
        const b = model.cells[n];
        expect(a.j - b.j || a.i - b.i || a.k - b.k).toBeLessThan(0);
      }
      expect(model.cells.every((c) => c.j >= 0)).toBe(true);
      expect(model.cells.some((c) => c.j === 0)).toBe(true);
      expect(components(model)).toBe(1);
    }
  });

  it('plus long que haut, à branches qui montent au-dessus du tronc', () => {
    for (const seed of SEEDS) {
      const { cells } = woodModel(seed, 1);
      const height = Math.max(...cells.map((c) => c.j)) + 1;
      const length = Math.max(...cells.map((c) => c.i)) - Math.min(...cells.map((c) => c.i)) + 1;
      expect(length).toBeGreaterThan(height);
      expect(height).toBeGreaterThanOrEqual(10);
    }
  });

  it('l’échelle change la taille des voxels, pas la forme', () => {
    const small = woodModel(5, 0.25);
    const big = woodModel(5, 3);
    expect(small.voxelSize).toBeCloseTo(WOOD_VOXEL_SIZE * 0.25, 12);
    expect(big.voxelSize).toBeCloseTo(WOOD_VOXEL_SIZE * 3, 12);
    expect(big.cells).toEqual(small.cells);
    expect(big.spheres).toEqual(small.spheres);
  });

  it('refuse une échelle ou une graine invalide', () => {
    for (const scale of [0, -1, Number.NaN, Infinity]) {
      expect(() => woodModel(1, scale)).toThrow(RangeError);
    }
    for (const seed of [-1, 1.5, MAX_SEED + 1, Number.NaN]) {
      expect(() => woodModel(seed, 1)).toThrow(RangeError);
    }
  });
});

describe('forme de collision du bois (sphères fines le long des branches)', () => {
  it(`au plus ${MAX_WOOD_SPHERES} sphères, toutes valides, sur chaque branche`, () => {
    for (const seed of SEEDS) {
      const model = woodModel(seed, 1);
      expect(model.spheres.length).toBeLessThanOrEqual(MAX_WOOD_SPHERES);
      expect(model.spheres.every((s) => s.r > 0 && Number.isFinite(s.r))).toBe(true);
      const carried = new Set(model.spheres.map((s) => s.branch));
      expect(carried).toEqual(new Set(model.segments.map((s) => s.branch)));
    }
  });

  it('fines : aucune sphère plus épaisse que 3,5 voxels de rayon', () => {
    for (const seed of SEEDS) {
      expect(Math.max(...woodModel(seed, 1).spheres.map((s) => s.r))).toBeLessThanOrEqual(3.5);
    }
  });

  it('chaque voxel est entièrement dans une sphère (ses huit coins)', () => {
    for (const seed of SEEDS) {
      const { cells, spheres } = woodModel(seed, 1);
      for (const c of cells) {
        const inside = spheres.some((s) => {
          const dx = Math.max(Math.abs(c.i - s.x), Math.abs(c.i + 1 - s.x));
          const dy = Math.max(Math.abs(c.j - s.y), Math.abs(c.j + 1 - s.y));
          const dz = Math.max(Math.abs(c.k - s.z), Math.abs(c.k + 1 - s.z));
          return Math.hypot(dx, dy, dz) <= s.r + 1e-9;
        });
        expect(inside).toBe(true);
      }
    }
  });

  it('entre deux branches écartées, un passage libre d’au moins la largeur du plus petit poisson', () => {
    expect(SMALLEST_FISH).toBe(0.05); // grenouille (5 cm)
    for (const seed of SEEDS) {
      const model = woodModel(seed, 1);
      expect(widestPassage(model) * model.voxelSize).toBeGreaterThanOrEqual(SMALLEST_FISH);
    }
  });

  it('woodSpheres : sphères du modèle posées dans le bac (rotation, base enfoncée)', () => {
    const item: DecorItem = { kind: 'wood', x: 0.1, z: -0.05, rotation: 0.6, scale: 1.5, seed: 9 };
    const model = woodModel(item.seed, item.scale);
    const spheres = woodSpheres(item);
    expect(spheres).toHaveLength(model.spheres.length);
    const v = model.voxelSize;
    expect(woodBaseY(v)).toBeCloseTo(SAND_THICKNESS - WOOD_SINK_RATIO * v, 12);
    spheres.forEach((s, n) => {
      const b = model.spheres[n];
      expect(s.radius).toBeCloseTo(b.r * v, 12);
      expect(s.y).toBeCloseTo(woodBaseY(v) + b.y * v, 12);
      // Distance horizontale au centre de l'élément conservée par la rotation.
      expect(Math.hypot(s.x - item.x, s.z - item.z)).toBeCloseTo(Math.hypot(b.x, b.z) * v, 9);
    });
    const [obstacle] = decorObstacles([item], 4);
    expect(obstacle.id).toBe(4);
    expect(validateObstacle(obstacle)).toEqual([]);
  });
});

describe('poissons et bois flotté', () => {
  // Bac très grand : seul le bois compte. Un néon lancé droit sur une sphère d'une branche,
  // errance neutralisée : l'évitement et le filet de sécurité ne le laissent jamais entrer.
  it.each([
    [3, 1],
    [42, 2],
    [MAX_SEED, 1],
  ])(
    'graine %s, branche %s : 200 pas lancé vers la branche sans jamais y entrer',
    (seed, branch) => {
      const water = waterVolume({ width: 3, height: 2, depth: 3 });
      const bounds = swimBounds(NEON, water);
      const item: DecorItem = { kind: 'wood', x: 0, z: 0, rotation: 0, scale: 1, seed };
      const [obstacle] = decorObstacles([item]);
      const model = woodModel(seed, 1);
      const onBranch = model.spheres
        .map((s, n) => ({ s, n }))
        .filter(({ s }) => s.branch === branch);
      const target = woodSpheres(item)[onBranch[Math.floor(onBranch.length / 2)].n];
      const n = vec();
      let inside = 0;
      let minDistance = Infinity;
      for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
        const f = createFish(seed, 0, 'neon', bounds) as MutableFish;
        // Départ à 25 cm de la sphère visée, cap droit dessus, à pleine vitesse.
        Object.assign(f, {
          x: target.x - Math.cos(yaw) * 0.25,
          y: target.y,
          z: target.z - Math.sin(yaw) * 0.25,
          yaw,
          pitch: 0,
          pitchTarget: 0,
          turn: 0,
          speed: NEON.maxSpeed,
        });
        for (let step = 0; step < 200; step++) {
          f.turn = 0;
          stepFish(f, SIM_DT, bounds, 0, 0, 0, [obstacle]);
          const d = obstacleDistance(obstacle, f.x, f.y, f.z, n);
          minDistance = Math.min(minDistance, d);
          // Le filet de sécurité pose le centre sur la surface : distance nulle à l'arrondi
          // près (≈ 1e-17 m). Dedans : plus d'un nanomètre sous la surface.
          if (d < -1e-9) inside++;
        }
      }
      expect(inside).toBe(0);
      expect(minDistance).toBeGreaterThanOrEqual(-1e-9);
      // Le poisson est bien venu au contact du bois (le test n'est pas vide) : à moins de sa
      // marge d'évitement de la surface.
      expect(minDistance).toBeLessThan(NEON.wallMargin);
    },
  );
});

describe('le bois dans le décor (type « wood »)', () => {
  const WOOD: DecorItem = { kind: 'wood', x: -0.1, z: 0.05, rotation: 0.4, scale: 1, seed: 7 };

  it('validé comme les autres éléments, sans forme de plante', () => {
    expect(validateDecorItem(WOOD)).toEqual([]);
    expect(parseDecor(JSON.stringify([WOOD]))).toEqual([WOOD]);
    expect(validateDecorItem({ ...WOOD, form: 'tall' })).toEqual(['form est réservée aux plantes']);
    expect(validateDecorItem({ ...WOOD, kind: 'souche' })).toEqual(['kind inconnu : souche']);
    expect(decorBaseY(WOOD)).toBe(woodBaseY(woodModel(7, 1).voxelSize));
    expect(decorSpheres(WOOD)).toEqual(woodSpheres(WOOD));
  });

  it('sauvegarde : un décor sans bois se charge toujours, un décor avec bois fait l’aller-retour', () => {
    // Décor par défaut (rochers et plantes seulement), comme les sauvegardes d'avant #169.
    expect(DEFAULT_DECOR.some((d) => d.kind === 'wood')).toBe(false);
    const old = parseWorld(serializeWorld(createDefaultWorld(42)));
    expect(old.ok && old.world.decor).toEqual(DEFAULT_DECOR);
    const world = withDecor(createDefaultWorld(42), [...DEFAULT_DECOR, WOOD]);
    const result = parseWorld(serializeWorld(world));
    expect(result.ok).toBe(true);
    expect(result.ok && result.world.decor.at(-1)).toEqual(WOOD);
    expect(result.ok && result.world.obstacles).toEqual(world.obstacles);
  });

  it('catalogue de l’éditeur : « Bois flotté » se pose sur le sable, graine tirée du monde', () => {
    expect(DECOR_CATALOG.wood).toEqual({ id: 'wood', name: 'Bois flotté', kind: 'wood' });
    // Point où le bois tient entier dans le bac : posé exactement là (à z = −0,1, son emprise
    // dépassait la vitre du fond ; il est désormais ramené vers l'intérieur, #59).
    const decor = addDecorItem([], 'wood', 0.2, -0.04, 42, 'tropical')!;
    expect(decor).toHaveLength(1);
    expect(decor[0]).toMatchObject({ kind: 'wood', x: 0.2, z: -0.04, scale: 1 });
    expect(decor[0]).not.toHaveProperty('form');
    expect(validateDecorItem(decor[0])).toEqual([]);
  });

  it('emprise : contient tous les voxels ; chevauchement avec un voisin détecté', () => {
    const model = woodModel(WOOD.seed, WOOD.scale);
    const reach = decorFootprint(WOOD);
    for (const c of model.cells) {
      for (const [x, z] of [
        [c.i, c.k],
        [c.i + 1, c.k + 1],
      ]) {
        expect(Math.hypot(x, z) * model.voxelSize).toBeLessThanOrEqual(reach + 1e-12);
      }
    }
    expect(decorItemsOverlap(WOOD, { ...WOOD, x: WOOD.x + 0.02 })).toBe(true);
    expect(decorItemsOverlap(WOOD, { ...WOOD, x: WOOD.x + 0.5 })).toBe(false);
  });

  it('nourriture : un granulé se pose sur le dessus d’une branche, à côté sur le sable', () => {
    const model = woodModel(WOOD.seed, WOOD.scale);
    const v = model.voxelSize;
    // Voxel le plus haut : centre de sa colonne dans le repère du bac.
    const top = model.cells.reduce((a, b) => (b.j > a.j ? b : a));
    const lx = (top.i + 0.5) * v;
    const lz = (top.k + 0.5) * v;
    const c = Math.cos(WOOD.rotation);
    const s = Math.sin(WOOD.rotation);
    const x = WOOD.x + c * lx + s * lz;
    const z = WOOD.z - s * lx + c * lz;
    const expected = woodBaseY(v) + (top.j + 1) * v;
    expect(woodTopAt(WOOD, x, z)).toBeCloseTo(expected, 12);
    expect(restHeightAt([WOOD], x, z)).toBeCloseTo(expected + FOOD_RADIUS, 12);
    expect(woodTopAt(WOOD, WOOD.x + 0.4, WOOD.z)).toBeNull();
    expect(restHeightAt([WOOD], WOOD.x + 0.4, WOOD.z)).toBeCloseTo(
      SAND_THICKNESS + FOOD_RADIUS,
      12,
    );
  });
});
