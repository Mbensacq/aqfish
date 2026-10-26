import {
  FOOD_MIN_SCENE_PIXELS,
  FOOD_OUTLINE_MIN_CORE,
  FOOD_PELLET_DIAMETER,
  foodCoreSize,
  foodOutlineExtra,
  FOOD_SHAPE_PROPORTIONS,
  foodVoxelDimensions,
  foodVoxelSide,
  scenePixelsPerMeter,
} from './food-size';
import { FOOD_SHAPES } from '../sim/food';

describe('render/food-size', () => {
  it('pixels de scène par mètre : hauteur de l’image sur la hauteur visible', () => {
    // Champ de 90° : à 1 m, 2 m visibles sur la hauteur.
    expect(scenePixelsPerMeter(1, 90, 240)).toBeCloseTo(120, 9);
    // Deux fois plus loin : deux fois moins de pixels par mètre.
    expect(scenePixelsPerMeter(2, 90, 240)).toBeCloseTo(60, 9);
    expect(scenePixelsPerMeter(1, 45, 240)).toBeCloseTo(240 / (2 * Math.tan(Math.PI / 8)), 9);
  });

  it('pixels par mètre : 0 pour une entrée invalide', () => {
    for (const [d, fov, h] of [
      [0, 45, 240],
      [-1, 45, 240],
      [Number.NaN, 45, 240],
      [Number.POSITIVE_INFINITY, 45, 240],
      [1, 0, 240],
      [1, 180, 240],
      [1, Number.NaN, 240],
      [1, 45, 0],
      [1, 45, Number.POSITIVE_INFINITY],
    ]) {
      expect(scenePixelsPerMeter(d, fov, h)).toBe(0);
    }
  });

  it('cœur : suit le zoom, en pixels entiers (zoom proche, vue par défaut)', () => {
    // Zoom proche : 500 pixels par mètre, granulé de 1,2 cm → 6 pixels.
    expect(foodCoreSize(500)).toBe(Math.round(FOOD_PELLET_DIAMETER * 500));
    expect(foodCoreSize(500)).toBe(6);
    // Vue trois-quarts sur bureau 1280 × 720 (~148 px/m) : 2 pixels, comme avant #117.
    expect(foodCoreSize(148)).toBe(2);
    // Même vue sur téléphone 390 × 844 (~85 px/m) : 1 pixel.
    expect(foodCoreSize(85)).toBe(1);
    expect(Number.isInteger(foodCoreSize(333))).toBe(true);
  });

  it('cœur : plancher d’un pixel de scène en dézoomé ou sans échelle', () => {
    expect(FOOD_MIN_SCENE_PIXELS).toBe(1);
    expect(foodCoreSize(60)).toBe(1);
    expect(foodCoreSize(10)).toBe(1);
    expect(foodCoreSize(1e-6)).toBe(1);
    for (const ppm of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(foodCoreSize(ppm)).toBe(1);
    }
  });

  it('liseré : complet à partir du seuil, réduit à un pixel en dessous', () => {
    expect(FOOD_OUTLINE_MIN_CORE).toBe(2);
    expect(foodOutlineExtra(1)).toBe(1);
    expect(foodOutlineExtra(2)).toBe(2);
    expect(foodOutlineExtra(6)).toBe(2);
    // Un granulé lointain (1 pixel) fait 2 pixels liseré compris, au lieu de 4 avant #117.
    expect(foodCoreSize(50) + foodOutlineExtra(foodCoreSize(50))).toBe(2);
  });

  it('voxel : diamètre du granulé, au moins un pixel de scène', () => {
    expect(foodVoxelSide(500)).toBe(FOOD_PELLET_DIAMETER);
    expect(foodVoxelSide(85)).toBe(FOOD_PELLET_DIAMETER);
    // En dessous de ~83 px/m, un granulé ferait moins d'un pixel : plancher.
    expect(foodVoxelSide(50)).toBeCloseTo(1 / 50, 12);
    expect(foodVoxelSide(50) * 50).toBeCloseTo(1, 12);
    for (const ppm of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(foodVoxelSide(ppm)).toBe(FOOD_PELLET_DIAMETER);
    }
  });

  it('formes (#226) : proportions du grain appliquées au diamètre et au facteur de taille', () => {
    expect(FOOD_SHAPE_PROPORTIONS.grain).toEqual([1, 1, 1]);
    for (const shape of FOOD_SHAPES) {
      const [x, y, z] = foodVoxelDimensions(shape, 1, 0);
      const [px, py, pz] = FOOD_SHAPE_PROPORTIONS[shape];
      expect(x).toBeCloseTo(FOOD_PELLET_DIAMETER * px, 12);
      expect(y).toBeCloseTo(FOOD_PELLET_DIAMETER * py, 12);
      expect(z).toBeCloseTo(FOOD_PELLET_DIAMETER * pz, 12);
      const big = foodVoxelDimensions(shape, 1.15, 0);
      expect(big[0]).toBeCloseTo(x * 1.15, 12);
    }
    // Flocon : plus large et bien plus fin qu'un grain ; paillette : plus petite qu'un grain.
    const [fx, fy] = FOOD_SHAPE_PROPORTIONS.flocon;
    expect(fx).toBeGreaterThan(1);
    expect(fy).toBeLessThan(0.5);
    const [px, py, pz] = FOOD_SHAPE_PROPORTIONS.paillette;
    expect(px * py * pz).toBeLessThan(fx * fy * FOOD_SHAPE_PROPORTIONS.flocon[2]);
  });

  it('formes : chaque dimension au moins un pixel de scène ; facteur invalide ⇒ 1', () => {
    for (const shape of FOOD_SHAPES) {
      for (const ppm of [40, 85, 148]) {
        for (const d of foodVoxelDimensions(shape, 0.85, ppm)) {
          expect(d * ppm).toBeGreaterThanOrEqual(FOOD_MIN_SCENE_PIXELS - 1e-9);
        }
      }
      for (const factor of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(foodVoxelDimensions(shape, factor, 500)).toEqual(foodVoxelDimensions(shape, 1, 500));
      }
    }
    // Zoom proche : rien n'est relevé au plancher, le flocon reste fin.
    const [, y] = foodVoxelDimensions('flocon', 1, 500);
    expect(y).toBeCloseTo(FOOD_PELLET_DIAMETER * FOOD_SHAPE_PROPORTIONS.flocon[1], 12);
  });
});
