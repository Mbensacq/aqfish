import { DEFAULT_FOOD_STYLE, FOOD_STYLES, isFoodStyle, toggleFoodStyle } from './food-style';

describe('core/food-style', () => {
  it('points par défaut, deux rendus connus', () => {
    expect(DEFAULT_FOOD_STYLE).toBe('points');
    expect(FOOD_STYLES).toEqual(['points', 'voxels']);
  });

  it('reconnaît exactement les rendus connus', () => {
    expect(isFoodStyle('points')).toBe(true);
    expect(isFoodStyle('voxels')).toBe(true);
    for (const value of ['Points', 'voxel', '', null, undefined, 0, {}, ['points']]) {
      expect(isFoodStyle(value)).toBe(false);
    }
  });

  it('alterne entre les deux rendus', () => {
    expect(toggleFoodStyle('points')).toBe('voxels');
    expect(toggleFoodStyle('voxels')).toBe('points');
  });
});
