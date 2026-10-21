import {
  FOOD_MIN_SCENE_PIXELS,
  FOOD_OUTLINE_MIN_CORE,
  FOOD_PELLET_DIAMETER,
  foodCoreSize,
  foodOutlineExtra,
  foodVoxelOutlineSide,
  foodVoxelSide,
  scenePixelsPerMeter,
} from './food-size';

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

  it('coque du voxel : 2 pixels de plus au-dessus du seuil, 1 en dessous, aucun sans échelle', () => {
    // 500 px/m : cube de 6 pixels, coque de 8 pixels.
    expect(foodVoxelOutlineSide(500) * 500).toBeCloseTo(8, 9);
    // 50 px/m : cube d'un pixel (plancher), coque de 2 pixels.
    expect(foodVoxelOutlineSide(50) * 50).toBeCloseTo(2, 9);
    expect(foodVoxelOutlineSide(0)).toBe(FOOD_PELLET_DIAMETER);
    expect(foodVoxelOutlineSide(Number.NaN)).toBe(FOOD_PELLET_DIAMETER);
  });
});
