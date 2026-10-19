import { SIM_DT } from './constants';
import { DEFAULT_DECOR, type DecorItem } from './decor';
import {
  dropFoodInPlace,
  expiryAge,
  FOOD_DROP_RADIUS,
  FOOD_GROUND_SECONDS,
  FOOD_MAX_FLOAT_SECONDS,
  FOOD_MIN_FLOAT_SECONDS,
  FOOD_PER_DROP,
  FOOD_RADIUS,
  FOOD_SINK_SPEED,
  isInsideTank,
  isLanded,
  landingAge,
  MAX_FOOD,
  restHeightAt,
  rockTopAt,
  stepFoodInPlace,
  type FoodPellet,
  type FoodState,
} from './food';
import { SAND_THICKNESS, waterVolume } from './tank';
import {
  advance,
  advanceTo,
  advanceToWithFeedings,
  createDefaultWorld,
  createWorld,
  feed,
  feedInPlace,
  type MutableWorld,
} from './world';

const WATER = waterVolume();
const FLOAT_Y = WATER.maxY - FOOD_RADIUS;
const ROCK: DecorItem = DEFAULT_DECOR[0];

function emptyState(seed = 42, decor: readonly DecorItem[] = []): FoodState {
  return { seed, decor, food: [], nextFoodId: 0 };
}

/** Fait vieillir les granulés par pas de `SIM_DT` pendant `seconds` secondes. */
function age(food: FoodPellet[], seconds: number): void {
  const steps = Math.round(seconds / SIM_DT);
  for (let i = 0; i < steps; i++) {
    stepFoodInPlace(food, SIM_DT);
  }
}

describe('sim/food : dépôt', () => {
  it('dépose FOOD_PER_DROP granulés à la surface, autour du point visé, identifiants consécutifs', () => {
    const state = emptyState();
    expect(dropFoodInPlace(state, 0.1, -0.05)).toBe(FOOD_PER_DROP);
    expect(state.food.map((p) => p.id)).toEqual([0, 1, 2, 3, 4]);
    expect(state.nextFoodId).toBe(FOOD_PER_DROP);
    for (const p of state.food) {
      expect(p.y).toBe(FLOAT_Y);
      expect(p.vy).toBe(0);
      expect(p.age).toBe(0);
      expect(Math.hypot(p.x - 0.1, p.z + 0.05)).toBeLessThanOrEqual(FOOD_DROP_RADIUS + 1e-12);
      expect(p.floatTime).toBeGreaterThanOrEqual(FOOD_MIN_FLOAT_SECONDS);
      expect(p.floatTime).toBeLessThan(FOOD_MAX_FLOAT_SECONDS);
      expect(p.restY).toBeCloseTo(SAND_THICKNESS + FOOD_RADIUS, 12);
    }
    // Dispersés : pas deux granulés au même endroit.
    expect(new Set(state.food.map((p) => `${p.x},${p.z}`)).size).toBe(FOOD_PER_DROP);
    // Un second dépôt poursuit la numérotation.
    dropFoodInPlace(state, 0, 0);
    expect(state.food.map((p) => p.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('hors du bac : ignoré, état inchangé ; bords du bac compris', () => {
    const state = emptyState();
    for (const [x, z] of [
      [WATER.maxX + 0.001, 0],
      [WATER.minX - 0.001, 0],
      [0, WATER.maxZ + 0.001],
      [0, WATER.minZ - 1],
      [10, 10],
    ]) {
      expect(dropFoodInPlace(state, x, z)).toBe(0);
    }
    expect(state.food).toEqual([]);
    expect(state.nextFoodId).toBe(0);
    expect(isInsideTank(WATER.maxX, WATER.minZ)).toBe(true);
    expect(dropFoodInPlace(state, WATER.maxX, WATER.minZ)).toBe(FOOD_PER_DROP);
  });

  it('dans un coin, les granulés restent dans l’eau (dispersion ramenée sous les vitres)', () => {
    const state = emptyState(7);
    for (let n = 0; n < 4; n++) {
      dropFoodInPlace(state, WATER.maxX, WATER.maxZ);
      dropFoodInPlace(state, WATER.minX, WATER.minZ);
    }
    for (const p of state.food) {
      expect(p.x).toBeGreaterThanOrEqual(WATER.minX + FOOD_RADIUS);
      expect(p.x).toBeLessThanOrEqual(WATER.maxX - FOOD_RADIUS);
      expect(p.z).toBeGreaterThanOrEqual(WATER.minZ + FOOD_RADIUS);
      expect(p.z).toBeLessThanOrEqual(WATER.maxZ - FOOD_RADIUS);
    }
  });

  it('point non fini : RangeError, état inchangé', () => {
    const state = emptyState();
    for (const [x, z] of [
      [NaN, 0],
      [0, Infinity],
      [-Infinity, 0],
    ]) {
      expect(() => dropFoodInPlace(state, x, z)).toThrow(RangeError);
    }
    expect(state.food).toEqual([]);
    expect(state.nextFoodId).toBe(0);
  });

  it('bac plein : jamais plus de MAX_FOOD granulés ; dernier dépôt tronqué puis ignoré', () => {
    const state = emptyState();
    let added = 0;
    for (let n = 0; n < 2 * MAX_FOOD; n++) {
      added += dropFoodInPlace(state, 0, 0);
      expect(state.food.length).toBeLessThanOrEqual(MAX_FOOD);
    }
    expect(added).toBe(MAX_FOOD);
    expect(state.food.length).toBe(MAX_FOOD);
    expect(dropFoodInPlace(state, 0.2, 0.1)).toBe(0);
    expect(state.nextFoodId).toBe(MAX_FOOD);

    // Reste de la division : dépôt partiel.
    const partial = emptyState();
    while (partial.food.length < MAX_FOOD - 2) {
      partial.food.push({ ...state.food[0], id: partial.nextFoodId++ });
    }
    expect(dropFoodInPlace(partial, 0, 0)).toBe(2);
    expect(partial.food.length).toBe(MAX_FOOD);
  });

  it('déterministe : même graine, mêmes dépôts ⇒ mêmes granulés ; autre graine ⇒ autres positions', () => {
    const a = emptyState(42);
    const b = emptyState(42);
    const c = emptyState(43);
    for (const state of [a, b, c]) {
      dropFoodInPlace(state, 0.1, 0.1);
      dropFoodInPlace(state, -0.2, 0);
    }
    expect(a).toEqual(b);
    expect(c.food.map((p) => p.x)).not.toEqual(a.food.map((p) => p.x));
  });
});

describe('sim/food : sol', () => {
  it('sans rocher : posé sur le sable', () => {
    expect(restHeightAt([], 0.3, 0.1)).toBeCloseTo(SAND_THICKNESS + FOOD_RADIUS, 12);
  });

  it('au-dessus d’un rocher : sur son dessus, plus haut que le sable ; à côté : sable', () => {
    const top = rockTopAt(ROCK, ROCK.x, ROCK.z);
    expect(top).not.toBeNull();
    expect(top!).toBeGreaterThan(SAND_THICKNESS + 0.03);
    expect(top!).toBeLessThan(WATER.maxY);
    expect(restHeightAt([ROCK], ROCK.x, ROCK.z)).toBeCloseTo(top! + FOOD_RADIUS, 12);
    expect(rockTopAt(ROCK, ROCK.x + 0.3, ROCK.z)).toBeNull();
    expect(restHeightAt([ROCK], ROCK.x + 0.3, ROCK.z)).toBeCloseTo(
      SAND_THICKNESS + FOOD_RADIUS,
      12,
    );
  });

  it('les plantes sont traversées (seuls les rochers retiennent la nourriture)', () => {
    const plant = DEFAULT_DECOR.find((item) => item.kind === 'plant')!;
    expect(restHeightAt([plant], plant.x, plant.z)).toBeCloseTo(SAND_THICKNESS + FOOD_RADIUS, 12);
  });

  it('le dessus suit la rotation du rocher (même hauteur au point tourné avec lui)', () => {
    const turned: DecorItem = { ...ROCK, x: 0, z: 0, rotation: ROCK.rotation + Math.PI / 2 };
    const base: DecorItem = { ...ROCK, x: 0, z: 0 };
    // Un point (dx, dz) du rocher de base se retrouve en (dz, -dx) après un quart de tour.
    const [dx, dz] = [0.021, -0.013];
    expect(rockTopAt(base, dx, dz)).not.toBeNull();
    expect(rockTopAt(turned, dz, -dx)).toBe(rockTopAt(base, dx, dz));
  });
});

describe('sim/food : chute', () => {
  function oneDrop(decor: readonly DecorItem[] = [], x = 0, z = 0): FoodPellet[] {
    const state = emptyState(42, decor);
    dropFoodInPlace(state, x, z);
    return state.food;
  }

  it('flotte jusqu’à floatTime, puis coule à vitesse constante', () => {
    const food = oneDrop();
    const p = food[0];
    age(food, p.floatTime - 0.1);
    expect(p.y).toBe(FLOAT_Y);
    expect(p.vy).toBe(0);
    age(food, 1);
    const y1 = p.y;
    expect(p.vy).toBe(-FOOD_SINK_SPEED);
    age(food, 2);
    expect(y1 - p.y).toBeCloseTo(2 * FOOD_SINK_SPEED, 6);
    expect(p.vy).toBe(-FOOD_SINK_SPEED);
  });

  it('se pose sur le sable à landingAge, immobile, puis disparaît après FOOD_GROUND_SECONDS', () => {
    const food = oneDrop();
    const p = food[0];
    const landing = landingAge(p);
    expect(landing).toBeCloseTo(p.floatTime + (FLOAT_Y - p.restY) / FOOD_SINK_SPEED, 12);
    age(food, landing + 0.5);
    expect(isLanded(p)).toBe(true);
    expect(p.y).toBe(p.restY);
    expect(p.vy).toBe(0);
    age(food, 5);
    expect(p.y).toBe(p.restY);
    expect(food).toContain(p);
    age(food, FOOD_GROUND_SECONDS);
    expect(food).toEqual([]);
    expect(expiryAge(p)).toBeCloseTo(landing + FOOD_GROUND_SECONDS, 12);
  });

  it('jamais sous le sol, ni au-dessus de la surface, à tout instant', () => {
    const food = oneDrop([ROCK], ROCK.x, ROCK.z);
    const rests = food.map((p) => p.restY);
    expect(Math.min(...rests)).toBeGreaterThan(SAND_THICKNESS + FOOD_RADIUS);
    const steps = Math.round(60 / SIM_DT);
    for (let i = 0; i < steps && food.length > 0; i++) {
      stepFoodInPlace(food, SIM_DT);
      for (const p of food) {
        expect(p.y).toBeGreaterThanOrEqual(p.restY);
        expect(p.y).toBeLessThanOrEqual(FLOAT_Y);
      }
    }
  });

  it('retrait en place : l’ordre des granulés restants est conservé', () => {
    const state = emptyState();
    dropFoodInPlace(state, 0, 0);
    // Les deux premiers vieillissent plus que les autres : ils disparaissent seuls.
    const [first, second] = state.food;
    stepFoodInPlace([first, second], expiryAge(first) + expiryAge(second));
    const ids = state.food.map((p) => p.id);
    stepFoodInPlace(state.food, SIM_DT);
    expect(state.food.map((p) => p.id)).toEqual(ids.slice(2));
  });

  it('liste vide : sans effet', () => {
    const food: FoodPellet[] = [];
    stepFoodInPlace(food, SIM_DT);
    expect(food).toEqual([]);
  });
});

describe('sim/world : nourriture', () => {
  it('monde créé sans nourriture', () => {
    const world = createDefaultWorld(42);
    expect(world.food).toEqual([]);
    expect(world.nextFoodId).toBe(0);
  });

  it('feed est pure ; l’état reste sérialisable en JSON', () => {
    const world = createDefaultWorld(42);
    const before = structuredClone(world);
    const fed = feed(world, 0.1, 0.05);
    expect(world).toEqual(before);
    expect(fed.food).toHaveLength(FOOD_PER_DROP);
    const later = advance(fed, 120);
    expect(JSON.parse(JSON.stringify(later))).toEqual(later);
  });

  it('feedInPlace : clic hors du bac sans effet', () => {
    const world: MutableWorld = createWorld(1);
    expect(feedInPlace(world, 5, 0)).toBe(0);
    expect(world.food).toEqual([]);
  });

  it('la nourriture ne consomme pas le hasard des poissons (trajectoires changées par l’attraction, #68)', () => {
    const plain = advance(createDefaultWorld(42), 300);
    const fed = advance(feed(createDefaultWorld(42), 0, 0), 300);
    // Même suite de tirages avec ou sans nourriture (ADR 0023)…
    expect(fed.entities.map((f) => f.rng)).toEqual(plain.entities.map((f) => f.rng));
    // …mais les poissons affamés viennent manger : trajectoires différentes.
    expect(fed.entities).not.toEqual(plain.entities);
  });

  it('les granulés coulent dans le monde et disparaissent tous', () => {
    const fed = feed(createWorld(3, [], [], DEFAULT_DECOR), -0.1, 0.1);
    const mid = advanceTo(fed, 3.5);
    expect(mid.food.some((p) => p.y < FLOAT_Y)).toBe(true);
    const end = advanceTo(fed, Math.max(...fed.food.map(expiryAge)) + 1);
    expect(end.food).toEqual([]);
    expect(end.nextFoodId).toBe(FOOD_PER_DROP);
  });

  describe('advanceToWithFeedings (contrat de capture)', () => {
    it('équivaut à avancer puis nourrir au temps de chaque dépôt', () => {
      const start = createDefaultWorld(42);
      const manual = advanceTo(feed(advanceTo(feed(advanceTo(start, 2), 0, 0), 5), 0.2, 0.1), 8);
      const auto = advanceToWithFeedings(start, 8, [
        { time: 5, x: 0.2, z: 0.1 },
        { time: 2, x: 0, z: 0 },
      ]);
      expect(auto).toEqual(manual);
    });

    it('même graine et mêmes dépôts ⇒ même état ; dépôts après `time` ignorés', () => {
      const feedings = [
        { time: 0, x: 0, z: 0 },
        { time: 1.5, x: -0.3, z: 0.1 },
        { time: 30, x: 0.1, z: 0 },
      ];
      const a = advanceToWithFeedings(createDefaultWorld(9), 4, feedings);
      const b = advanceToWithFeedings(createDefaultWorld(9), 4, feedings);
      expect(a).toEqual(b);
      expect(a.nextFoodId).toBe(2 * FOOD_PER_DROP);
      expect(a.tick).toBe(Math.round(4 / SIM_DT));
    });

    it('sans dépôt : identique à advanceTo', () => {
      const start = createDefaultWorld(42);
      expect(advanceToWithFeedings(start, 3, [])).toEqual(advanceTo(start, 3));
    });
  });
});
