import { SIM_DT } from './constants';
import { DEFAULT_DECOR } from './decor';
import { environmentWater } from './environment';
import { eatMassInPlace, type MutableFeeder } from './feeding';
import { FOOD_GROUND_SECONDS, MAX_FOOD, pelletMass, type FoodPellet } from './food';
import {
  addDecayedFoodInPlace,
  addEatenFoodInPlace,
  DECAYED_FOOD_AMMONIA_SHARE,
  EATEN_FOOD_AMMONIA,
  EATEN_FOOD_AMMONIA_SHARE,
  FOOD_DECAY_AMMONIA,
  PELLET_FOOD_MG,
} from './food-decay';
import { parseSave, serializeRoom } from './room-save';
import { createRoom } from './room-state';
import {
  freshWater,
  MAX_CONCENTRATIONS,
  RESTING_AMMONIA_PER_LOAD_LITER,
  waterLiters,
  waterLoad,
  type MutableWaterState,
} from './water';
import { NITROGEN_DAY_SCALE } from './water-units';
import { advance, advanceTo, createWorld, feedInPlace } from './world';
import type { MutableWorld, World } from './world-types';

/**
 * Pollution liée à la nourriture (issue #798, tranche 2b de #728) : ammoniaque selon la
 * nourriture mangée, part au repos selon la masse, nourriture non mangée qui pourrit.
 */

/** Tolérance relative des rapports (calcul flottant, aucune approximation du modèle). */
const RATIO_DIGITS = 12;

function liters(world: World): number {
  return waterLiters(environmentWater(world.environment));
}

/** Bac tropical sans filtre : l'ammoniaque produite y reste. */
function withoutFilter(world: World): MutableWorld {
  const copy = { ...world } as MutableWorld;
  copy.water = { ...world.water, filter: 0 };
  return copy;
}

describe('ammoniaque de la nourriture mangée (#798)', () => {
  it('4 % du poids de nourriture, moitié de la part pourrie (le poisson retient la moitié)', () => {
    expect(EATEN_FOOD_AMMONIA_SHARE).toBeGreaterThanOrEqual(0.03);
    expect(EATEN_FOOD_AMMONIA_SHARE).toBeLessThanOrEqual(0.05);
    expect(EATEN_FOOD_AMMONIA).toBeCloseTo(PELLET_FOOD_MG * EATEN_FOOD_AMMONIA_SHARE, 12);
    expect(FOOD_DECAY_AMMONIA).toBeCloseTo(2 * EATEN_FOOD_AMMONIA, 12);
  });

  it('constantes dérivées des parts : mêmes valeurs au bit près que les littéraux (#803)', () => {
    expect(DECAYED_FOOD_AMMONIA_SHARE).toBe(2 * EATEN_FOOD_AMMONIA_SHARE);
    expect(EATEN_FOOD_AMMONIA).toBe(1.25 * NITROGEN_DAY_SCALE);
    expect(FOOD_DECAY_AMMONIA).toBe(2.5 * NITROGEN_DAY_SCALE);
  });

  it('doubler la nourriture mangée double l’ammoniaque (tolérance relative 1e-12)', () => {
    for (const mass of [0.1, 1, 3.7, 40]) {
      const once = freshWater('tropical') as MutableWaterState;
      const twice = freshWater('tropical') as MutableWaterState;
      const a = addEatenFoodInPlace(once, mass, 288);
      const b = addEatenFoodInPlace(twice, 2 * mass, 288);
      expect(a).toBeCloseTo((EATEN_FOOD_AMMONIA * mass) / 288, 12);
      expect(b / a).toBeCloseTo(2, RATIO_DIGITS);
    }
  });

  it('rien de mangé : eau inchangée ; plafonnée ; entrée invalide refusée', () => {
    const water = { ...freshWater('tropical'), ammonia: 0.4 } as MutableWaterState;
    expect(addEatenFoodInPlace(water, 0, 288)).toBe(0);
    expect(water.ammonia).toBe(0.4);
    addEatenFoodInPlace(water, 1e9, 1);
    expect(water.ammonia).toBe(MAX_CONCENTRATIONS.ammonia);
    expect(() => addEatenFoodInPlace(water, -1, 288)).toThrow(RangeError);
    expect(() => addEatenFoodInPlace(water, 1, 0)).toThrow(RangeError);
    expect(() => addEatenFoodInPlace(water, Number.NaN, 288)).toThrow(RangeError);
  });

  it('eatMassInPlace : deux affamés mangent chacun le sien, renvoie la masse mangée', () => {
    const fishes = (): MutableFeeder[] => [
      { x: 0, y: 0.5, z: 0, hunger: 1 },
      { x: 0.3, y: 0.5, z: 0, hunger: 1 },
      { x: 0.6, y: 0.5, z: 0, hunger: 0 },
    ];
    const pellets = (): FoodPellet[] =>
      [0, 0.3, 0.6].map((x, id) => ({ id, x, y: 0.5, z: 0, vy: 0, age: 0 }) as FoodPellet);
    const band = (): { minY: number; maxY: number } => ({ minY: 0, maxY: 1 });
    const box = () => ({ minX: -1, maxX: 1, minY: 0, maxY: 1, minZ: -1, maxZ: 1 });
    const b = pellets();
    const fb = fishes();
    expect(eatMassInPlace(fb, b, band, box)).toBeCloseTo(
      pelletMass({ id: 0 }) + pelletMass({ id: 1 }),
      12,
    );
    expect(b.map((p) => p.id)).toEqual([2]);
    expect(fb[0].hunger).toBeLessThan(1);
    expect(fb[1].hunger).toBeLessThan(1);
    expect(fb[2].hunger).toBe(0);
    expect(eatMassInPlace(fishes(), [], band, box)).toBe(0);
  });

  it('dans le monde : deux rations mangées, deux fois l’ammoniaque d’une (à la masse près)', () => {
    const run = (rations: number): { ammonia: number; mass: number } => {
      // Poissons affamés, filtre arrêté : l'ammoniaque des repas s'ajoute à la part au repos.
      const world = withoutFilter(
        createWorld(5, [{ species: 'neon', count: 12 }], [], DEFAULT_DECOR),
      );
      for (const fish of world.entities as unknown as { hunger: number }[]) {
        fish.hunger = 1;
      }
      for (let i = 0; i < rations; i++) {
        feedInPlace(world, 0, 0);
      }
      const mass = world.food.reduce((sum, p) => sum + pelletMass(p), 0);
      const fasting = advanceTo(
        withoutFilter(createWorld(5, [{ species: 'neon', count: 12 }], [], DEFAULT_DECOR)),
        20,
      );
      const fed = advanceTo(world, 20);
      expect(fed.food).toEqual([]);
      return { ammonia: fed.water.ammonia - fasting.water.ammonia, mass };
    };
    const one = run(1);
    const two = run(2);
    expect(one.ammonia).toBeGreaterThan(0);
    expect(two.ammonia / one.ammonia).toBeCloseTo(two.mass / one.mass, 6);
  }, 30_000);
});

describe('part au repos (#798) : sans nourriture, selon la masse', () => {
  function fastingAmmonia(population: Parameters<typeof createWorld>[1], seconds = 10): number {
    const world = withoutFilter(createWorld(3, population, [], DEFAULT_DECOR));
    return advance(world, Math.round(seconds / SIM_DT)).water.ammonia;
  }

  it('bac sans nourriture : seulement la part au repos, RESTING × masse / litres × durée', () => {
    const world = withoutFilter(
      createWorld(3, [{ species: 'neon', count: 10 }], [], DEFAULT_DECOR),
    );
    const after = advance(world, Math.round(10 / SIM_DT));
    const expected =
      ((RESTING_AMMONIA_PER_LOAD_LITER * waterLoad(world.entities)) / liters(world)) * 10;
    expect(after.food).toEqual([]);
    expect(after.water.ammonia).toBeCloseTo(expected, 12);
  });

  it('proportionnelle à la masse : deux fois plus d’animaux, deux fois plus', () => {
    const ten = fastingAmmonia([{ species: 'neon', count: 10 }]);
    const twenty = fastingAmmonia([{ species: 'neon', count: 20 }]);
    expect(twenty / ten).toBeCloseTo(2, RATIO_DIGITS);
  });

  it('une espèce plus massive produit plus, au cube de sa taille', () => {
    const neon = fastingAmmonia([{ species: 'neon', count: 4 }]);
    const gourami = fastingAmmonia([{ species: 'gourami', count: 4 }]);
    const ratio = waterLoad([{ species: 'gourami' }]) / waterLoad([{ species: 'neon' }]);
    expect(ratio).toBeGreaterThan(1);
    expect(gourami / neon).toBeCloseTo(ratio, RATIO_DIGITS);
  });

  it('bac vide : aucune ammoniaque', () => {
    expect(fastingAmmonia([])).toBe(0);
  });
});

describe('nourriture non mangée (#638, #798) : pollution croissante et bornée', () => {
  it('rations pourries successives : l’ammoniaque croît, puis s’arrête au plafond', () => {
    const water = freshWater('tropical') as MutableWaterState;
    let previous = 0;
    let rations = 0;
    while (water.ammonia < MAX_CONCENTRATIONS.ammonia) {
      addDecayedFoodInPlace(water, 5, 288);
      expect(water.ammonia).toBeGreaterThan(previous);
      previous = water.ammonia;
      rations++;
    }
    expect(rations).toBeGreaterThan(1);
    addDecayedFoodInPlace(water, 5, 288);
    expect(water.ammonia).toBe(MAX_CONCENTRATIONS.ammonia);
  });

  it('dans le monde, sans animal : plus de rations, plus d’ammoniaque, bornée par MAX_FOOD', () => {
    const pollution = (clicks: number): number => {
      const world = withoutFilter(createWorld(7, [], [], DEFAULT_DECOR));
      for (let i = 0; i < clicks; i++) {
        feedInPlace(world, 0, 0);
      }
      expect(world.food.length).toBeLessThanOrEqual(MAX_FOOD);
      return advanceTo(world, FOOD_GROUND_SECONDS + 60).water.ammonia;
    };
    const values = [1, 2, 4, 8].map(pollution);
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThan(values[i - 1]!);
    }
    // Au-delà de MAX_FOOD granulés, un clic n'ajoute rien : la pollution d'un coup est bornée.
    const full = pollution(MAX_FOOD);
    expect(pollution(MAX_FOOD * 2)).toBe(full);
    expect(full).toBeLessThan(MAX_CONCENTRATIONS.ammonia);
  }, 30_000);
});

describe('sauvegardes du schéma 3 (#793) toujours lisibles (#798)', () => {
  it('une pièce écrite au schéma 3 se relit à l’identique et avance avec les repas', () => {
    const room = createRoom(42, ['tropical', 'bassin']);
    const text = serializeRoom(room, room.tanks[0]!.id, undefined);
    expect(JSON.parse(text)).toMatchObject({ schema: 3 });
    const read = parseSave(text);
    expect(read.ok).toBe(true);
    if (!read.ok) {
      return;
    }
    expect(serializeRoom(read.room, read.selectedTankId, read.settings)).toBe(text);
    const world = read.room.tanks[0]!.world as MutableWorld;
    feedInPlace(world, 0, 0);
    const later = advance(world, Math.round(30 / SIM_DT));
    expect(Number.isFinite(later.water.ammonia)).toBe(true);
    expect(later.water.ammonia).toBeGreaterThan(0);
  });
});
