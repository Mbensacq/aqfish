import { Color } from 'three';

import { createWorld, feed } from '../sim/world';
import { MAX_FOOD, type FoodPellet } from '../sim/food';
import { FOOD_COLOR, FOOD_POINT_SIZE, FoodLayer } from './food-layer';
import { NIGHT_FLAT_BRIGHTNESS } from './night-shade';
import { PALETTE_COLORS } from './palette';

describe('render/food-layer', () => {
  let layer: FoodLayer;
  beforeEach(() => (layer = new FoodLayer()));
  afterEach(() => layer.dispose());

  it('sans granulé : rien n’est dessiné', () => {
    expect(layer.count).toBe(0);
    expect(layer.geometry.drawRange.count).toBe(0);
    layer.update([]);
    expect(layer.geometry.drawRange.count).toBe(0);
  });

  it('pose chaque granulé à sa position, plage de dessin ajustée', () => {
    const food = feed(createWorld(42), 0.1, 0.05).food;
    layer.update(food);
    expect(layer.count).toBe(food.length);
    expect(layer.geometry.drawRange.count).toBe(food.length);
    const positions = layer.geometry.getAttribute('position');
    expect(positions.getX(2)).toBeCloseTo(food[2].x, 6);
    expect(positions.getY(2)).toBeCloseTo(food[2].y, 6);
    expect(positions.getZ(2)).toBeCloseTo(food[2].z, 6);
    layer.update([]);
    expect(layer.count).toBe(0);
  });

  it('borné par MAX_FOOD, sans réallocation', () => {
    const pellet = feed(createWorld(1), 0, 0).food[0];
    const many: FoodPellet[] = Array.from({ length: MAX_FOOD + 5 }, (_, id) => ({ ...pellet, id }));
    const array = layer.geometry.getAttribute('position').array;
    layer.update(many);
    expect(layer.count).toBe(MAX_FOOD);
    expect(layer.geometry.getAttribute('position').array).toBe(array);
  });

  it('couleur de la palette, assombrie la nuit comme les couleurs plates', () => {
    expect(PALETTE_COLORS).toContain(FOOD_COLOR);
    expect(layer.colorHex).toBe(new Color(FOOD_COLOR).getHex());
    layer.setBrightness(NIGHT_FLAT_BRIGHTNESS);
    expect(layer.brightness).toBe(NIGHT_FLAT_BRIGHTNESS);
    expect(layer.colorHex).toBe(
      new Color(FOOD_COLOR).multiplyScalar(NIGHT_FLAT_BRIGHTNESS).getHex(),
    );
    layer.setBrightness(Number.NaN);
    layer.setBrightness(-1);
    expect(layer.brightness).toBe(NIGHT_FLAT_BRIGHTNESS);
    layer.setBrightness(1);
    expect(layer.colorHex).toBe(new Color(FOOD_COLOR).getHex());
  });

  it('taille fixe en pixels de scène, mise à l’échelle sans filtre', () => {
    expect(layer.pointSize).toBe(FOOD_POINT_SIZE);
    layer.setPointScale(6);
    expect(layer.pointSize).toBe(FOOD_POINT_SIZE * 6);
    layer.setPointScale(0);
    expect(layer.pointSize).toBe(FOOD_POINT_SIZE);
  });
});
