import {
  FOOD_SHADE_COUNT,
  FOOD_SHAPES,
  FOOD_SIZE_FACTORS,
  FOOD_TURN_STEPS,
  foodLook,
  type FoodShape,
} from './food';
import { createWorld, feed } from './world';

describe('sim/food : aspect des granulés (#226)', () => {
  it('même identifiant, même aspect', () => {
    for (const id of [0, 1, 7, 59, 1234, 0xffffffff]) {
      expect(foodLook(id)).toEqual(foodLook(id));
    }
  });

  it('valeurs toujours dans leurs bornes, y compris aux identifiants extrêmes', () => {
    const ids = [0, 1, 2, 0x7fffffff, 0xffffffff, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER];
    for (let id = 0; id < 2000; id++) {
      ids.push(id);
    }
    for (const id of ids) {
      const look = foodLook(id);
      expect(FOOD_SHAPES).toContain(look.shape);
      expect(Number.isInteger(look.shade)).toBe(true);
      expect(look.shade).toBeGreaterThanOrEqual(0);
      expect(look.shade).toBeLessThan(FOOD_SHADE_COUNT);
      expect(FOOD_SIZE_FACTORS).toContain(look.size);
      expect(look.turn).toBeGreaterThanOrEqual(0);
      expect(look.turn).toBeLessThan(Math.PI / 2);
    }
  });

  it('identifiant ramené sur 32 bits : -1 et 2³² - 1 se confondent', () => {
    expect(foodLook(-1)).toEqual(foodLook(0xffffffff));
    expect(foodLook(Number.NaN)).toEqual(foodLook(0));
  });

  it('répartition des formes, nuances, tailles et orientations', () => {
    const n = 20000;
    const shapes = new Map<FoodShape, number>();
    const shades = new Array<number>(FOOD_SHADE_COUNT).fill(0);
    const sizes = new Map<number, number>();
    const turns = new Set<number>();
    for (let id = 0; id < n; id++) {
      const look = foodLook(id);
      shapes.set(look.shape, (shapes.get(look.shape) ?? 0) + 1);
      shades[look.shade]++;
      sizes.set(look.size, (sizes.get(look.size) ?? 0) + 1);
      turns.add(look.turn);
    }
    expect((shapes.get('grain') ?? 0) / n).toBeCloseTo(0.5, 1);
    expect((shapes.get('flocon') ?? 0) / n).toBeCloseTo(0.3, 1);
    expect((shapes.get('paillette') ?? 0) / n).toBeCloseTo(0.2, 1);
    for (const count of shades) {
      expect(count / n).toBeCloseTo(1 / FOOD_SHADE_COUNT, 1);
    }
    for (const factor of FOOD_SIZE_FACTORS) {
      expect((sizes.get(factor) ?? 0) / n).toBeCloseTo(1 / FOOD_SIZE_FACTORS.length, 1);
    }
    expect(turns.size).toBe(FOOD_TURN_STEPS);
  });

  it('un dépôt de 5 granulés n’est pas uniforme (au moins deux nuances)', () => {
    const food = feed(createWorld(42), 0.1, 0.05).food;
    expect(new Set(food.map((p) => foodLook(p.id).shade)).size).toBeGreaterThan(1);
  });

  it('pur : ne touche pas au monde ni à son hasard', () => {
    const a = feed(createWorld(42), 0.1, 0.05);
    const before = JSON.stringify(a);
    for (const pellet of a.food) {
      foodLook(pellet.id);
    }
    expect(JSON.stringify(a)).toBe(before);
    expect(JSON.stringify(feed(createWorld(42), 0.1, 0.05))).toBe(before);
  });
});
