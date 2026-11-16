import { SIM_DT } from './constants';
import { DEFAULT_DECOR } from './decor';
import { environmentWater } from './environment';
import {
  dropFoodInPlace,
  expiryAge,
  FOOD_GROUND_SECONDS,
  FOOD_PER_DROP,
  FOOD_SIZE_FACTORS,
  MAX_FOOD,
  pelletMass,
  stepFoodInPlace,
  type FoodPellet,
  type FoodState,
} from './food';
import { addDecayedFoodInPlace, FOOD_DECAY_AMMONIA } from './food-decay';
import { freshWater, MAX_CONCENTRATION, waterLiters, type MutableWaterState } from './water';
import {
  advanceTo,
  advanceToWithFeedings,
  createDefaultWorld,
  createWorld,
  feedInPlace,
  type MutableWorld,
  type World,
} from './world';

/** Monde sans animaux ni filtre : l'ammoniaque n'y vient que de la nourriture et y reste. */
function emptyWorldWithoutFilter(seed = 7): MutableWorld {
  const world = createWorld(seed, [], [], DEFAULT_DECOR) as MutableWorld;
  world.water = { ...freshWater('tropical'), filter: 0 };
  return world;
}

function liters(world: World): number {
  return waterLiters(environmentWater(world.environment));
}

function massOf(food: readonly FoodPellet[]): number {
  return food.reduce((sum, pellet) => sum + pelletMass(pellet), 0);
}

describe('sim/food-decay : masse d’un granulé (#638)', () => {
  it('cube du facteur de taille, déterministe, toujours positive', () => {
    const allowed = FOOD_SIZE_FACTORS.map((s) => s * s * s);
    for (let id = 0; id < 200; id++) {
      const mass = pelletMass({ id });
      expect(allowed).toContain(mass);
      expect(pelletMass({ id })).toBe(mass);
    }
  });
});

describe('sim/food-decay : addDecayedFoodInPlace (#638)', () => {
  it('ration nulle : eau inchangée', () => {
    const water = { ...freshWater('tropical'), ammonia: 1.2 } as MutableWaterState;
    const before = { ...water };
    expect(addDecayedFoodInPlace(water, 0, 288)).toBe(0);
    expect(water).toEqual(before);
  });

  it('ammoniaque proportionnelle à la masse et inverse au volume', () => {
    const one = freshWater('tropical') as MutableWaterState;
    const two = freshWater('tropical') as MutableWaterState;
    const small = freshWater('tropical') as MutableWaterState;
    const added = addDecayedFoodInPlace(one, 3, 300);
    expect(added).toBeCloseTo((FOOD_DECAY_AMMONIA * 3) / 300, 12);
    expect(one.ammonia).toBeCloseTo(added, 12);
    addDecayedFoodInPlace(two, 6, 300);
    expect(two.ammonia).toBeCloseTo(2 * one.ammonia, 12);
    addDecayedFoodInPlace(small, 3, 30);
    expect(small.ammonia).toBeCloseTo(10 * one.ammonia, 12);
  });

  it('plafonnée à MAX_CONCENTRATION ; seuls nitrites et nitrates inchangés', () => {
    const water = { ...freshWater('tropical'), ammonia: MAX_CONCENTRATION - 0.5 };
    const added = addDecayedFoodInPlace(water as MutableWaterState, 1e6, 1);
    expect(water.ammonia).toBe(MAX_CONCENTRATION);
    expect(added).toBeCloseTo(0.5, 12);
    expect(water.nitrite).toBe(0);
    expect(water.nitrate).toBe(0);
  });

  it('masse ou volume invalide : RangeError, eau inchangée', () => {
    const water = freshWater('tropical') as MutableWaterState;
    const before = { ...water };
    for (const mass of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => addDecayedFoodInPlace(water, mass, 100)).toThrow(RangeError);
    }
    for (const volume of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => addDecayedFoodInPlace(water, 1, volume)).toThrow(RangeError);
    }
    expect(water).toEqual(before);
  });
});

describe('sim/food : masse des granulés retirés (#638)', () => {
  function drop(count = 1): FoodState {
    const state: FoodState = { seed: 5, decor: [], food: [], nextFoodId: 0 };
    for (let i = 0; i < count; i++) {
      dropFoodInPlace(state, 0, 0);
    }
    return state;
  }

  it('liste vide ou granulés encore là : 0', () => {
    expect(stepFoodInPlace([], SIM_DT)).toBe(0);
    const state = drop();
    expect(stepFoodInPlace(state.food, SIM_DT)).toBe(0);
    expect(state.food).toHaveLength(FOOD_PER_DROP);
  });

  it('pas qui atteint l’expiration : somme des masses retirées, puis plus rien', () => {
    const state = drop(2);
    const mass = massOf(state.food);
    const last = Math.max(...state.food.map(expiryAge));
    expect(stepFoodInPlace(state.food, last + 0.01)).toBeCloseTo(mass, 12);
    expect(state.food).toEqual([]);
    expect(stepFoodInPlace(state.food, SIM_DT)).toBe(0);
  });
});

// Délai de 30 s pour les tests qui avancent deux fois le bac par défaut (24 animaux) d'une
// minute : plus de 5 s sous la couverture de la CI.
describe('sim/world : nourriture non mangée (#638)', () => {
  it('ration non mangée, bac sans filtre ni animal : ammoniaque proportionnelle après le délai', () => {
    const world = emptyWorldWithoutFilter();
    feedInPlace(world, 0, 0);
    const food = [...world.food];
    const expected = (FOOD_DECAY_AMMONIA * massOf(food)) / liters(world);
    // Avant le délai : rien dans l'eau.
    const before = advanceTo(world, Math.min(...food.map(expiryAge)) - 1);
    expect(before.food).toHaveLength(FOOD_PER_DROP);
    expect(before.water.ammonia).toBe(0);
    // Après : granulés disparus, toute leur masse en ammoniaque, qui reste (filtre arrêté).
    const after = advanceTo(world, Math.max(...food.map(expiryAge)) + 1);
    expect(after.food).toEqual([]);
    expect(after.water.ammonia).toBeCloseTo(expected, 10);
    expect(advanceTo(after, after.time + 120).water.ammonia).toBeCloseTo(expected, 10);
  });

  it('deux rations : deux fois plus d’ammoniaque (à la masse près)', () => {
    const once = emptyWorldWithoutFilter();
    feedInPlace(once, 0, 0);
    const twice = emptyWorldWithoutFilter();
    feedInPlace(twice, 0, 0);
    feedInPlace(twice, 0.1, 0.05);
    const end = FOOD_GROUND_SECONDS + 60;
    const a = advanceTo(once, end).water.ammonia;
    const b = advanceTo(twice, end).water.ammonia;
    const ratio = massOf(twice.food) / massOf(once.food);
    expect(b).toBeCloseTo(a * ratio, 10);
    expect(ratio).toBeGreaterThan(1.5);
    expect(ratio).toBeLessThan(2.5);
  });

  it('surcharge pleine : environ 1 unité dans le bac tropical', () => {
    const world = emptyWorldWithoutFilter();
    while (world.food.length < MAX_FOOD) {
      feedInPlace(world, 0, 0);
    }
    const ammonia = advanceTo(world, FOOD_GROUND_SECONDS + 60).water.ammonia;
    expect(ammonia).toBeGreaterThan(0.7);
    expect(ammonia).toBeLessThan(1.5);
  });

  it('ration mangée en entier : aucune ammoniaque en plus', () => {
    // Poissons du bac par défaut affamés : ils mangent tout avant le délai.
    const start = createDefaultWorld(42) as MutableWorld;
    for (const fish of start.entities as unknown as { hunger: number }[]) {
      fish.hunger = 1;
    }
    const feedings = [{ time: 1, x: 0, z: 0 }];
    // Tout est mangé avant que le premier granulé posé n'ait pu se décomposer.
    const probe = emptyWorldWithoutFilter();
    feedInPlace(probe, 0, 0);
    const firstExpiry = 1 + Math.min(...probe.food.map(expiryAge));
    const eaten = advanceToWithFeedings(start, firstExpiry - 1, feedings);
    expect(eaten.nextFoodId).toBe(FOOD_PER_DROP);
    expect(eaten.food).toEqual([]);
    const end = firstExpiry + 5;
    const plain = advanceTo(start, end);
    const fed = advanceToWithFeedings(start, end, feedings);
    expect(fed.water).toEqual(plain.water);
  }, 30_000);

  it('filtre en marche : l’ammoniaque de la nourriture devient nitrites puis nitrates', () => {
    const world = createWorld(7, [], [], DEFAULT_DECOR) as MutableWorld;
    while (world.food.length < MAX_FOOD) {
      feedInPlace(world, 0, 0);
    }
    const later = advanceTo(world, FOOD_GROUND_SECONDS + 1200);
    expect(later.water.nitrate).toBeGreaterThan(0);
    expect(later.water.ammonia).toBeLessThan(0.1);
  });

  it('déterministe : même graine et mêmes dépôts, même eau ; sans dépôt, eau différente', () => {
    const feedings = [
      { time: 1, x: 0, z: 0 },
      { time: 2, x: 0.1, z: -0.05 },
      { time: 3, x: -0.2, z: 0.1 },
    ];
    const end = FOOD_GROUND_SECONDS + 60;
    const a = advanceToWithFeedings(createDefaultWorld(9), end, feedings);
    const b = advanceToWithFeedings(createDefaultWorld(9), end, feedings);
    expect(b.water).toEqual(a.water);
    expect(b.food).toEqual(a.food);
    const empty = emptyWorldWithoutFilter(9);
    const fed = advanceToWithFeedings(empty, end, feedings);
    expect(fed.water.ammonia).toBeGreaterThan(0);
    expect(advanceTo(empty, end).water.ammonia).toBe(0);
  }, 30_000);
});
