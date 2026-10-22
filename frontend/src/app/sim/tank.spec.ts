import { DEFAULT_TANK, SAND_THICKNESS, WATER_LEVEL_RATIO, shrinkBox, waterVolume } from './tank';

describe('waterVolume', () => {
  it('va du dessus du sable à la surface, paroi à paroi (bac par défaut)', () => {
    expect(waterVolume()).toEqual({
      minX: -0.6,
      maxX: 0.6,
      minY: SAND_THICKNESS,
      maxY: DEFAULT_TANK.height * WATER_LEVEL_RATIO,
      minZ: -0.25,
      maxZ: 0.25,
    });
  });

  it('niveau d’eau réglable (paludarium, #129) : seule la surface change', () => {
    const box = waterVolume({ width: 1, height: 0.6, depth: 0.5 }, 0.45);
    expect(box.maxY).toBeCloseTo(0.27, 12);
    expect(box.minY).toBe(SAND_THICKNESS);
    expect(box.maxX).toBe(0.5);
    // Niveau sous le sable : volume plat, jamais inversé.
    expect(waterVolume(DEFAULT_TANK, 0).maxY).toBe(SAND_THICKNESS);
  });

  it('un bac plus bas que le sable donne un volume plat, jamais inversé', () => {
    const box = waterVolume({ width: 1, height: 0.01, depth: 1 });
    expect(box.maxY).toBe(box.minY);
  });
});

describe('shrinkBox', () => {
  const box = { minX: -1, maxX: 1, minY: 0, maxY: 2, minZ: -0.5, maxZ: 0.5 };

  it('rétrécit chaque face de la marge', () => {
    expect(shrinkBox(box, 0.1)).toEqual({
      minX: -0.9,
      maxX: 0.9,
      minY: 0.1,
      maxY: 1.9,
      minZ: -0.4,
      maxZ: 0.4,
    });
  });

  it('marge nulle : boîte identique', () => {
    expect(shrinkBox(box, 0)).toEqual(box);
  });

  it('marge trop grande sur un axe : réduite au plan médian de cet axe', () => {
    const shrunk = shrinkBox(box, 0.6);
    expect(shrunk.minZ).toBe(0);
    expect(shrunk.maxZ).toBe(0);
    expect(shrunk.minX).toBeCloseTo(-0.4, 12);
  });

  it.each([-0.1, Number.NaN, Number.POSITIVE_INFINITY])('refuse la marge %s', (margin) => {
    expect(() => shrinkBox(box, margin)).toThrow(RangeError);
  });
});
