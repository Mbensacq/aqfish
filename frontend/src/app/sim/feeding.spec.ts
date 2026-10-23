import { SIM_DT } from './constants';
import {
  EAT_DISTANCE,
  eatInPlace,
  feedingBand,
  foodTarget,
  growHunger,
  hasLineOfSight,
  HUNGER_START,
  HUNGRY_THRESHOLD,
  isHungry,
  nearestPellet,
  PELLET_SATIATION,
  satiate,
  type FeedingBand,
  type MutableFeeder,
} from './feeding';
import type { Vec3 } from './flocking';
import { expiryAge, type FoodPellet } from './food';
import { obstacleDistance, sphereObstacle, type Obstacle } from './obstacles';
import { CORYDORA, GUPPY, NEON, SPECIES, type SpeciesId } from './species';
import { createFish, stepFish, swimBounds, type Fish } from './swimmer';
import { waterVolume, type Box3 } from './tank';
import {
  advance,
  createDefaultWorld,
  createWorld,
  feed,
  type MutableWorld,
  type World,
} from './world';

type MutableFish = { -readonly [K in keyof Fish]: Fish[K] };

const WATER = waterVolume();
const OPEN_BAND: FeedingBand = { minY: -Infinity, maxY: Infinity };
const OPEN_BOX: Box3 = {
  minX: -Infinity,
  maxX: Infinity,
  minY: -Infinity,
  maxY: Infinity,
  minZ: -Infinity,
  maxZ: Infinity,
};

function pellet(id: number, x: number, y: number, z: number): FoodPellet {
  return { id, x, y, z, vy: 0, age: 0, floatY: y, floatTime: 1e9, restY: y };
}

function feeder(x: number, y: number, z: number, hunger = 1): MutableFeeder {
  return { x, y, z, hunger };
}

/** Copie modifiable d'un monde (JSON : l'état est sérialisable, ADR 0003). */
function editable(world: World): MutableWorld {
  return JSON.parse(JSON.stringify(world)) as MutableWorld;
}

/** Pas un à un ; renvoie, pour chaque granulé mangé (disparu avant son expiration), son altitude. */
function eatenHeights(world: World, seconds: number): { world: World; heights: number[] } {
  const heights: number[] = [];
  let current = world;
  for (let i = 0; i < Math.round(seconds / SIM_DT); i++) {
    const before = current.food;
    current = advance(current, 1);
    const after = new Set(current.food.map((p) => p.id));
    for (const p of before) {
      if (!after.has(p.id) && p.age + SIM_DT < expiryAge(p)) {
        heights.push(p.y);
      }
    }
  }
  return { world: current, heights };
}

describe('sim/feeding : faim', () => {
  it('monte à la vitesse de l’espèce, bornée à 1', () => {
    expect(growHunger(0.5, NEON, 10)).toBeCloseTo(0.5 + 10 * NEON.feeding.hungerRate, 12);
    expect(growHunger(0.5, CORYDORA, 10)).toBeLessThan(growHunger(0.5, NEON, 10));
    expect(growHunger(0.99, NEON, 1e6)).toBe(1);
    expect(growHunger(1, NEON, SIM_DT)).toBe(1);
    expect(growHunger(0, NEON, 0)).toBe(0);
  });

  it('valeur corrompue ramenée dans [0, 1] (non finie : repart de 0)', () => {
    expect(growHunger(Number.NaN, NEON, 0)).toBe(0);
    expect(growHunger(Number.POSITIVE_INFINITY, NEON, 0)).toBe(0);
    expect(growHunger(-3, NEON, 0)).toBe(0);
    expect(growHunger(7, NEON, 0)).toBe(1);
  });

  it('remise à zéro partielle par granulé, jamais négative', () => {
    expect(satiate(0.8)).toBeCloseTo(0.8 - PELLET_SATIATION, 12);
    expect(satiate(PELLET_SATIATION / 2)).toBe(0);
    expect(satiate(0)).toBe(0);
  });

  it('affamé à partir du seuil ; né affamé', () => {
    expect(isHungry(HUNGRY_THRESHOLD)).toBe(true);
    expect(isHungry(HUNGRY_THRESHOLD - 1e-9)).toBe(false);
    expect(isHungry(HUNGER_START)).toBe(true);
    const fish = createFish(42, 0, 'neon', swimBounds(NEON, WATER));
    expect(fish.hunger).toBe(HUNGER_START);
  });

  it('stepFish fait monter la faim sans changer la trajectoire', () => {
    const bounds = swimBounds(NEON, WATER);
    const a = createFish(42, 3, 'neon', bounds) as MutableFish;
    const b = { ...a, hunger: 0.9 };
    for (let i = 0; i < 300; i++) {
      stepFish(a, SIM_DT, bounds);
      stepFish(b, SIM_DT, bounds);
    }
    expect(a.hunger).toBeCloseTo(HUNGER_START + 300 * SIM_DT * NEON.feeding.hungerRate, 9);
    expect({ ...b, hunger: a.hunger }).toEqual(a);
  });

  it('état sérialisable : même monde après un aller-retour JSON, faim dans [0, 1]', () => {
    let world = feed(advance(createDefaultWorld(42), 30), 0, 0);
    world = advance(world, 300);
    expect(JSON.parse(JSON.stringify(world))).toEqual(world);
    for (const fish of world.entities) {
      expect(fish.hunger).toBeGreaterThanOrEqual(0);
      expect(fish.hunger).toBeLessThanOrEqual(1);
    }
  });

  it('déterministe : même graine et mêmes dépôts ⇒ même état ; graine différente ⇒ autre état', () => {
    const run = (seed: number) =>
      advance(feed(feed(createDefaultWorld(seed), 0, 0), 0.2, 0.1), 600);
    expect(run(42)).toEqual(run(42));
    expect(run(7).entities.map((f) => f.hunger)).not.toEqual(run(42).entities.map((f) => f.hunger));
  });
});

describe('sim/feeding : granulé le plus proche, point visé', () => {
  const food = [pellet(0, 0.1, 0.3, 0), pellet(1, 0.05, 0.3, 0), pellet(2, -0.05, 0.3, 0)];

  it('le plus proche ; égalité : le premier dans l’ordre', () => {
    expect(nearestPellet(feeder(0.06, 0.3, 0), food, OPEN_BAND, OPEN_BOX, 1)).toBe(1);
    expect(nearestPellet(feeder(0, 0.3, 0), food, OPEN_BAND, OPEN_BOX, 1)).toBe(1);
  });

  it('hors portée, hors tranche ou déjà pris : ignoré', () => {
    const f = feeder(0.06, 0.3, 0);
    expect(nearestPellet(f, food, OPEN_BAND, OPEN_BOX, 0.005)).toBe(-1);
    expect(nearestPellet(f, food, { minY: 0.4, maxY: 1 }, OPEN_BOX, 1)).toBe(-1);
    const taken = new Uint8Array([0, 1, 0]);
    expect(nearestPellet(f, food, OPEN_BAND, OPEN_BOX, 1, taken)).toBe(0);
    expect(nearestPellet(f, [], OPEN_BAND, OPEN_BOX, 1)).toBe(-1);
  });

  it('distance mesurée au granulé ramené dans les bornes de nage', () => {
    const bounds = swimBounds(NEON, WATER);
    const floating = [pellet(0, 0, WATER.maxY - 0.002, 0)];
    const below = feeder(0, bounds.hard.maxY - EAT_DISTANCE / 2, 0);
    expect(nearestPellet(below, floating, OPEN_BAND, bounds.hard, EAT_DISTANCE)).toBe(0);
    expect(nearestPellet(below, floating, OPEN_BAND, OPEN_BOX, EAT_DISTANCE)).toBe(-1);
  });

  it('avec obstacles : même choix qu’une recherche exhaustive (plus proche visible, égalité : premier)', () => {
    // Référence : tous les candidats, visibilité testée pour chacun (#85 : la recherche
    // optimisée ne doit pas changer le granulé retenu).
    const reference = (
      f: MutableFeeder,
      pellets: readonly FoodPellet[],
      radius: number,
      obstacles: readonly Obstacle[],
      clearance: number,
    ): number => {
      let best = -1;
      let bestSq = radius * radius;
      pellets.forEach((p, i) => {
        const sq = (p.x - f.x) ** 2 + (p.y - f.y) ** 2 + (p.z - f.z) ** 2;
        if (sq < bestSq && hasLineOfSight(f.x, f.y, f.z, p.x, p.y, p.z, obstacles, clearance)) {
          bestSq = sq;
          best = i;
        }
      });
      return best;
    };
    // Générateur local (LCG) : configurations reproductibles, sans dépendre de core/random.
    let state = 12345;
    const rand = () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 2 ** 32;
    let hidden = 0;
    let visible = 0;
    for (let n = 0; n < 300; n++) {
      const obstacles = Array.from({ length: 2 + Math.floor(rand() * 5) }, (_, id) =>
        sphereObstacle(
          id,
          rand() * 0.4 - 0.2,
          rand() * 0.4,
          rand() * 0.4 - 0.2,
          0.03 + rand() * 0.07,
        ),
      );
      const pellets: FoodPellet[] = [];
      for (let i = 0; i < 1 + Math.floor(rand() * 60); i++) {
        // Un granulé sur cinq en double d'un précédent : égalités de distance exactes.
        const twin =
          pellets.length > 0 && rand() < 0.2 ? pellets[Math.floor(rand() * pellets.length)] : null;
        pellets.push(
          twin
            ? pellet(i, twin.x, twin.y, twin.z)
            : pellet(i, rand() * 0.6 - 0.3, rand() * 0.4, rand() * 0.6 - 0.3),
        );
      }
      const f = feeder(rand() * 0.6 - 0.3, rand() * 0.4, rand() * 0.6 - 0.3);
      const radius = 0.05 + rand() * 0.4;
      const expected = reference(f, pellets, radius, obstacles, 0.01);
      const all = nearestPellet(f, pellets, OPEN_BAND, OPEN_BOX, radius);
      expect(nearestPellet(f, pellets, OPEN_BAND, OPEN_BOX, radius, null, obstacles, 0.01)).toBe(
        expected,
      );
      if (expected !== all) {
        hidden++;
      } else if (expected >= 0) {
        visible++;
      }
    }
    // Témoin : les deux cas (plus proche caché, plus proche en vue) sont bien couverts.
    expect(hidden).toBeGreaterThan(15);
    expect(visible).toBeGreaterThan(100);
  });

  it('avec obstacles : tous les candidats cachés ⇒ -1 ; sans obstacle, rien n’est caché', () => {
    const rock = sphereObstacle(0, 0, 0.3, 0, 0.05);
    const behind = [
      pellet(0, 0.1, 0.3, 0),
      pellet(1, 0.12, 0.3, 0.005),
      pellet(2, 0.09, 0.3, -0.004),
    ];
    const f = feeder(-0.1, 0.3, 0);
    expect(nearestPellet(f, behind, OPEN_BAND, OPEN_BOX, 1, null, [rock], 0.01)).toBe(-1);
    expect(nearestPellet(f, behind, OPEN_BAND, OPEN_BOX, 1, null, [], 0.01)).toBe(2);
  });

  it('point visé : granulé ramené dans les bornes ; rien sans faim, sans granulé ou hors perception', () => {
    const bounds = swimBounds(NEON, WATER);
    const band = feedingBand(NEON.feeding, WATER);
    const out: Vec3 = { x: 0, y: 0, z: 0 };
    const floating = [pellet(0, 0.1, WATER.maxY - 0.002, 0.02)];
    const target = foodTarget(feeder(0, 0.4, 0), NEON, floating, band, bounds.hard, out);
    expect(target).toBe(out);
    expect(out).toEqual({ x: 0.1, y: bounds.hard.maxY, z: 0.02 });
    expect(foodTarget(feeder(0, 0.4, 0, 0), NEON, floating, band, bounds.hard, out)).toBeNull();
    expect(foodTarget(feeder(0, 0.4, 0), NEON, [], band, bounds.hard, out)).toBeNull();
    const far = NEON.feeding.perceptionRadius + 0.05;
    const away = feeder(0.1 - far, bounds.hard.maxY, 0.02);
    expect(foodTarget(away, NEON, floating, band, bounds.hard, out)).toBeNull();
  });

  it('tranches d’eau : néons et guppys en surface et en pleine eau, corydoras au fond', () => {
    const neon = feedingBand(NEON.feeding, WATER);
    const guppy = feedingBand(GUPPY.feeding, WATER);
    const cory = feedingBand(CORYDORA.feeding, WATER);
    expect(neon.maxY).toBe(WATER.maxY);
    expect(guppy.maxY).toBe(WATER.maxY);
    expect(cory.minY).toBe(WATER.minY);
    // Aucun chevauchement entre le fond (corydoras) et la pleine eau (néons, guppys).
    expect(cory.maxY).toBeLessThan(Math.min(neon.minY, guppy.minY));
  });
});

describe('sim/feeding : repas', () => {
  const box = OPEN_BOX;
  const bandOf = () => OPEN_BAND;
  const hardOf = () => box;

  it('un granulé touché disparaît et rassasie ; l’ordre des autres est conservé', () => {
    const food = [pellet(0, 1, 0, 0), pellet(1, 0, 0, 0.01), pellet(2, -1, 0, 0)];
    const fish = [feeder(0, 0, 0, 0.8)];
    expect(eatInPlace(fish, food, bandOf, hardOf)).toBe(1);
    expect(food.map((p) => p.id)).toEqual([0, 2]);
    expect(fish[0].hunger).toBeCloseTo(0.8 - PELLET_SATIATION, 12);
  });

  it('deux poissons ne mangent pas le même granulé (le premier dans l’ordre l’emporte)', () => {
    const food = [pellet(0, 0, 0, 0)];
    const fish = [feeder(0.005, 0, 0), feeder(0.001, 0, 0)];
    expect(eatInPlace(fish, food, bandOf, hardOf)).toBe(1);
    expect(food).toEqual([]);
    expect(fish[0].hunger).toBe(1 - PELLET_SATIATION);
    expect(fish[1].hunger).toBe(1);
  });

  it('deux poissons, deux granulés à portée : chacun le sien', () => {
    const food = [pellet(0, 0, 0, 0), pellet(1, 0.008, 0, 0)];
    const fish = [feeder(0.004, 0, 0), feeder(0.004, 0, 0)];
    expect(eatInPlace(fish, food, bandOf, hardOf)).toBe(2);
    expect(food).toEqual([]);
  });

  it('rassasié, trop loin ou hors de sa tranche : ne mange pas', () => {
    const food = [pellet(0, 0, 0.5, 0)];
    expect(eatInPlace([feeder(0, 0.5, 0, 0.1)], food, bandOf, hardOf)).toBe(0);
    expect(eatInPlace([feeder(EAT_DISTANCE * 1.01, 0.5, 0)], food, bandOf, hardOf)).toBe(0);
    const bottom = () => ({ minY: 0, maxY: 0.1 });
    expect(eatInPlace([feeder(0, 0.5, 0)], food, bottom, hardOf)).toBe(0);
    expect(food).toHaveLength(1);
    expect(eatInPlace([feeder(0, 0.5, 0)], [], bandOf, hardOf)).toBe(0);
  });
});

describe('sim/feeding : attraction dans le monde', () => {
  /** Monde d'un seul poisson placé, avec un granulé immobile (flottaison infinie). */
  function single(
    species: SpeciesId,
    at: { x: number; y: number; z: number; yaw: number },
    food: FoodPellet,
    hunger = 0.6,
    obstacles = createWorld(1).obstacles,
  ): MutableWorld {
    const world = editable(createWorld(5, [{ species, count: 1 }], obstacles));
    Object.assign(world.entities[0], { ...at, pitch: 0, turn: 0, hunger });
    world.food = [food];
    world.nextFoodId = 1;
    return world;
  }

  it('affamé : nage vers le granulé et le mange ; rassasié : l’ignore', () => {
    const food = pellet(0, 0.2, 0.35, 0.05);
    const start = { x: -0.05, y: 0.3, z: -0.05, yaw: Math.PI / 2 }; // de côté par rapport au granulé
    const hungry = eatenHeights(single('neon', start, food), 10);
    expect(hungry.heights).toEqual([0.35]);
    expect(hungry.world.entities[0].hunger).toBeLessThan(0.6);

    const full = eatenHeights(single('neon', start, food, 0.1), 10);
    expect(full.heights).toEqual([]);
    expect(full.world.food).toHaveLength(1);
  });

  it('attraction : la distance au granulé décroît dès les premières secondes', () => {
    const food = pellet(0, 0.25, 0.3, 0);
    let world: World = single('guppy', { x: 0, y: 0.3, z: 0, yaw: Math.PI }, food); // dos au granulé
    const dist = (w: World) => Math.hypot(w.entities[0].x - 0.25, w.entities[0].z);
    const d0 = dist(world);
    world = advance(world, Math.round(4 / SIM_DT)); // demi-tour puis approche
    expect(dist(world)).toBeLessThan(d0 - 0.1);
  });

  describe('granulé derrière un rocher', () => {
    const rock = sphereObstacle(0, 0, 0.3, 0, 0.06);
    const n: Vec3 = { x: 0, y: 0, z: 0 };

    it.each([
      ['neon', 0],
      ['neon', 0.02],
      ['guppy', -0.03],
      ['corydora', 0],
    ] as const)('%s (décalage %s m) : ne traverse jamais le rocher', (species, z) => {
      const food = pellet(0, 0.12, 0.3, z);
      let world: World = single(species, { x: -0.13, y: 0.3, z, yaw: 0 }, food, 0.6, [rock]);
      // Témoin : granulé à portée de perception, et la ligne droite traverse le rocher.
      expect(Math.hypot(0.25, 0)).toBeLessThan(SPECIES[species].feeding.perceptionRadius);
      expect(obstacleDistance(rock, 0, 0.3, z, n)).toBeLessThan(0);
      let minClearance = Infinity;
      for (let i = 0; i < Math.round(20 / SIM_DT); i++) {
        world = advance(world, 1);
        const f = world.entities[0];
        minClearance = Math.min(minClearance, obstacleDistance(rock, f.x, f.y, f.z, n));
      }
      // Corps hors du rocher : centre à plus de la moitié de la marge de sa surface.
      expect(minClearance).toBeGreaterThan(SPECIES[species].wallMargin / 2);
    });

    it('caché : aucun point visé ; vu depuis le côté : le poisson le contourne et le mange', () => {
      const food = pellet(0, 0.14, 0.3, 0); // à 8 cm de la surface du rocher
      const out: Vec3 = { x: 0, y: 0, z: 0 };
      const hard = swimBounds(NEON, WATER).hard;
      const band = feedingBand(NEON.feeding, WATER);
      const behind = feeder(-0.13, 0.3, 0);
      expect(foodTarget(behind, NEON, [food], band, hard, out, [rock])).toBeNull();
      expect(foodTarget(behind, NEON, [food], band, hard, out)).not.toBeNull(); // sans rocher

      // Placé de côté (le granulé est en vue), le poisson y va sans traverser le rocher.
      let world: World = single('neon', { x: 0, y: 0.3, z: 0.16, yaw: 0 }, food, 0.6, [rock]);
      let minClearance = Infinity;
      for (let i = 0; i < Math.round(10 / SIM_DT) && world.food.length > 0; i++) {
        world = advance(world, 1);
        const f = world.entities[0];
        minClearance = Math.min(minClearance, obstacleDistance(rock, f.x, f.y, f.z, n));
      }
      expect(world.food).toEqual([]);
      expect(minClearance).toBeGreaterThan(NEON.wallMargin / 2);
    });
  });

  it('monde par défaut nourri : aucun poisson n’entre dans un rocher ou une plante', () => {
    const n: Vec3 = { x: 0, y: 0, z: 0 };
    for (const seed of [42, 7, 123]) {
      let world: World = createDefaultWorld(seed);
      let minRatio = Infinity;
      // 30 s, un double dépôt toutes les 5 s, près des rochers.
      for (let i = 0; i < 1800; i++) {
        if (i % 300 === 0) {
          world = feed(feed(world, -0.36 + (i / 300) * 0.15, -0.09), 0.3, 0.03);
        }
        world = advance(world, 1);
        for (const f of world.entities) {
          for (const o of world.obstacles) {
            const ratio = obstacleDistance(o, f.x, f.y, f.z, n) / SPECIES[f.species].wallMargin;
            minRatio = Math.min(minRatio, ratio);
          }
        }
      }
      // Sans nourriture, le minimum relevé est de 0,64 marge (graine 123) ; nourris et
      // pressés, les poissons frôlent davantage les obstacles : 0,38 marge au pire mesuré
      // (graine 7). Seuil : 0,3 marge, le centre restant hors de l'obstacle.
      expect(minRatio).toBeGreaterThan(0.3);
    }
  }, 15_000);
});

describe('sim/feeding : banc et espèces', () => {
  function neonSpread(world: World): { rms: number; meanNearest: number } {
    const fishes = world.entities.filter((f) => f.species === 'neon');
    const cx = fishes.reduce((s, f) => s + f.x, 0) / fishes.length;
    const cy = fishes.reduce((s, f) => s + f.y, 0) / fishes.length;
    const cz = fishes.reduce((s, f) => s + f.z, 0) / fishes.length;
    let squares = 0;
    let nearestSum = 0;
    for (const a of fishes) {
      squares += (a.x - cx) ** 2 + (a.y - cy) ** 2 + (a.z - cz) ** 2;
      let nearest = Infinity;
      for (const b of fishes) {
        if (a !== b) {
          nearest = Math.min(nearest, Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z));
        }
      }
      nearestSum += nearest;
    }
    return { rms: Math.sqrt(squares / fishes.length), meanNearest: nearestSum / fishes.length };
  }

  it.each([42, 7, 123])(
    'graine %s : les néons convergent vers la nourriture sans s’effondrer en un point',
    (seed) => {
      let world: World = feed(createDefaultWorld(seed), 0, 0);
      let minRms = Infinity;
      let minNearest = Infinity;
      for (let i = 0; i < Math.round(10 / SIM_DT); i++) {
        world = advance(world, 1);
        const { rms, meanNearest } = neonSpread(world);
        minRms = Math.min(minRms, rms);
        minNearest = Math.min(minNearest, meanNearest);
      }
      // Tout est mangé (convergence)…
      expect(world.food).toHaveLength(0);
      // …sans effondrement : écart quadratique moyen au centre du banc ≥ 4 cm (mesuré : 6,3 à
      // 12 cm sur ces graines ; 12 néons à `minDistance` = 2 cm les uns des autres tiendraient
      // dans une sphère de ~3 cm), distance moyenne au plus proche voisin ≥ 1,25 ×
      // `minDistance` (mesuré : 3,3 à 4,8 cm, contre 4,1 à 5,1 cm sans nourriture).
      expect(minRms).toBeGreaterThan(0.04);
      expect(minNearest).toBeGreaterThan(1.25 * NEON.schooling!.minDistance);
    },
    15_000,
  );

  it('néons et guppys mangent en surface et en pleine eau, corydoras au fond seulement', () => {
    const heights: Record<SpeciesId, number[]> = {
      neon: [],
      guppy: [],
      corydora: [],
      koi: [],
      axolotl: [],
      grenouille: [],
      triton: [],
      clown: [],
      chirurgien: [],
    };
    for (const species of ['neon', 'guppy', 'corydora'] as const) {
      for (const seed of [42, 7, 123]) {
        let world = advance(createWorld(seed, [{ species, count: 6 }]), 50);
        world = feed(feed(world, -0.2, 0), 0.2, 0.05);
        heights[species].push(...eatenHeights(world, 50).heights);
      }
    }
    const height = (y: number) => (y - WATER.minY) / (WATER.maxY - WATER.minY);
    for (const species of ['neon', 'guppy', 'corydora'] as const) {
      expect(heights[species].length).toBeGreaterThan(3); // chaque espèce mange
      const band = SPECIES[species].feeding;
      for (const y of heights[species]) {
        expect(height(y)).toBeGreaterThanOrEqual(band.minHeightRatio);
        expect(height(y)).toBeLessThanOrEqual(band.maxHeightRatio);
      }
    }
    // Différence mesurée : le plus bas repas d'un néon ou d'un guppy est au-dessus du plus
    // haut repas d'un corydora.
    const midwater = Math.min(...heights.neon, ...heights.guppy);
    expect(midwater).toBeGreaterThan(Math.max(...heights.corydora));
    expect(height(Math.max(...heights.corydora))).toBeLessThan(0.1);
  }, 15_000);
});
