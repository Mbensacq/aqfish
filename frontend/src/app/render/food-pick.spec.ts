import { CLICK_TOLERANCE_PX, isClick, toNormalizedDevice, waterSurfacePoint } from './food-pick';
import { DEFAULT_TANK, waterVolume } from '../sim/tank';

const SURFACE_Y = waterVolume().maxY;

describe('render/food-pick', () => {
  describe('isClick', () => {
    it('immobile ou presque : clic ; au-delà de la tolérance : glisser', () => {
      expect(isClick({ x: 10, y: 10 }, { x: 10, y: 10 })).toBe(true);
      expect(isClick({ x: 10, y: 10 }, { x: 10 + CLICK_TOLERANCE_PX, y: 10 })).toBe(true);
      expect(isClick({ x: 10, y: 10 }, { x: 13, y: 13 })).toBe(false);
      expect(isClick({ x: 0, y: 0 }, { x: 200, y: 0 })).toBe(false);
      expect(isClick({ x: 0, y: 0 }, { x: 1, y: 0 }, 0)).toBe(false);
    });
  });

  describe('toNormalizedDevice', () => {
    const rect = { left: 100, top: 50, width: 200, height: 100 };

    it('centre, coins et axe Y vers le haut', () => {
      expect(toNormalizedDevice(200, 100, rect)).toEqual({ x: 0, y: 0 });
      expect(toNormalizedDevice(100, 50, rect)).toEqual({ x: -1, y: 1 });
      expect(toNormalizedDevice(300, 150, rect)).toEqual({ x: 1, y: -1 });
    });

    it('hors du rectangle ou rectangle vide : null', () => {
      expect(toNormalizedDevice(99, 100, rect)).toBeNull();
      expect(toNormalizedDevice(200, 151, rect)).toBeNull();
      expect(toNormalizedDevice(0, 0, { left: 0, top: 0, width: 0, height: 10 })).toBeNull();
    });
  });

  describe('waterSurfacePoint', () => {
    it('vue de dessus : le point à la verticale', () => {
      expect(waterSurfacePoint([0.1, 2, -0.05], [0, -1, 0], DEFAULT_TANK)).toEqual({
        x: 0.1,
        z: -0.05,
      });
    });

    it('rayon oblique (trois-quarts) : intersection avec le plan de la surface', () => {
      const origin = [1, SURFACE_Y + 1, 1] as const;
      const point = waterSurfacePoint(origin, [-1, -1, -1.2], DEFAULT_TANK);
      expect(point?.x).toBeCloseTo(0, 12);
      expect(point?.z).toBeCloseTo(-0.2, 12);
    });

    it('depuis le dessous (vue de dessous), le rayon montant atteint aussi la surface', () => {
      expect(waterSurfacePoint([0, -1, 0], [0, 1, 0], DEFAULT_TANK)).toEqual({ x: 0, z: 0 });
    });

    it('rayon parallèle, qui s’éloigne, ou point hors du bac : null', () => {
      expect(waterSurfacePoint([0, 2, 0], [1, 0, 0], DEFAULT_TANK)).toBeNull();
      expect(waterSurfacePoint([0, 2, 0], [0, 1, 0], DEFAULT_TANK)).toBeNull();
      expect(waterSurfacePoint([2, 2, 0], [0, -1, 0], DEFAULT_TANK)).toBeNull();
      expect(waterSurfacePoint([0, 2, 0.3], [0, -1, 0], DEFAULT_TANK)).toBeNull();
    });
  });
});
