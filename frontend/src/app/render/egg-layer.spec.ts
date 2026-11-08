import { Color, Matrix4 } from 'three';

import { EGG_HATCH_TIME, MAX_EGGS, type Egg } from '../sim/eggs';
import {
  EGG_COLOR,
  EGG_MIN_OUTLINE_PIXELS,
  EGG_MIN_PIXELS,
  EGG_OUTLINE,
  EGG_RIPE_COLOR,
  EGG_VOXEL,
  EggLayer,
} from './egg-layer';

const egg = (age: number, x = 0): Egg => ({
  species: 'corydora',
  x,
  y: 0.1,
  z: 0.24,
  age,
  surface: 'vitre',
});

describe('EggLayer (#478)', () => {
  it('masquée sans œuf, sans rien écrire', () => {
    const layer = new EggLayer();
    layer.update(undefined, EGG_HATCH_TIME);
    expect(layer.count).toBe(0);
    expect(layer.object.visible).toBe(false);
    layer.update([], EGG_HATCH_TIME);
    expect(layer.object.visible).toBe(false);
    layer.dispose();
  });

  it('un voxel par œuf, à sa place, teinte neuve puis mûre', () => {
    const layer = new EggLayer();
    layer.update([egg(0, 0.1), egg(EGG_HATCH_TIME * 0.75, -0.2)], EGG_HATCH_TIME);
    expect(layer.count).toBe(2);
    expect(layer.object.visible).toBe(true);
    const m = layer.mesh;
    const matrix = new Matrix4();
    m.getMatrixAt(1, matrix);
    expect(matrix.elements[12]).toBeCloseTo(-0.2, 6);
    expect(matrix.elements[0]).toBeCloseTo(EGG_VOXEL, 6);
    const c = new Color();
    m.getColorAt(0, c);
    expect(c.getHexString()).toBe(new Color(EGG_COLOR).getHexString());
    m.getColorAt(1, c);
    expect(c.getHexString()).toBe(new Color(EGG_RIPE_COLOR).getHexString());
    // Plus d'œuf : masquée de nouveau.
    layer.update(undefined, EGG_HATCH_TIME);
    expect(layer.count).toBe(0);
    expect(layer.object.visible).toBe(false);
    layer.dispose();
  });

  it('au plus MAX_EGGS œufs, capacité allouée une fois', () => {
    const layer = new EggLayer();
    const array = layer.mesh.instanceMatrix.array;
    layer.update(
      Array.from({ length: MAX_EGGS + 5 }, (_, i) => egg(0, i * 0.01)),
      EGG_HATCH_TIME,
    );
    expect(layer.count).toBe(MAX_EGGS);
    expect(layer.mesh.instanceMatrix.array).toBe(array);
    layer.dispose();
  });

  it('assombrie la nuit ; valeur invalide ignorée', () => {
    const layer = new EggLayer();
    layer.setBrightness(0.5);
    expect(layer.brightness).toBe(0.5);
    layer.setBrightness(Number.NaN);
    layer.setBrightness(-1);
    expect(layer.brightness).toBe(0.5);
    layer.dispose();
  });

  describe('plancher en pixels de scène (#501)', () => {
    /** Côtés (cœur, liseré) de l'œuf `i`, en mètres. */
    const sides = (layer: EggLayer, i = 0): [number, number] => {
      const matrix = new Matrix4();
      layer.mesh.getMatrixAt(i, matrix);
      const core = matrix.elements[0];
      layer.outline.getMatrixAt(i, matrix);
      return [core, matrix.elements[0]];
    };

    it('près de la caméra : tailles de base, inchangées', () => {
      const layer = new EggLayer();
      // 300 px/m à 1 m, œuf à 1 m : 3,9 px de cœur, 2,4 px de liseré, au-dessus des planchers.
      layer.setViewpoint(0, 0.1, 1.24, 300);
      layer.update([egg(0)], EGG_HATCH_TIME);
      expect(sides(layer)[0]).toBeCloseTo(EGG_VOXEL, 9);
      expect(sides(layer)[1]).toBeCloseTo(EGG_VOXEL + EGG_OUTLINE, 9);
      layer.dispose();
    });

    it('loin : au moins EGG_MIN_PIXELS de cœur et un pixel de liseré de chaque côté', () => {
      const layer = new EggLayer();
      layer.update([egg(0), egg(0, 0.1)], EGG_HATCH_TIME);
      // 100 px/m à 1 m, œuf à 2 m : 50 px/m, le cœur ferait 0,65 px.
      layer.setViewpoint(0, 0.1, 2.24, 100);
      const [core, outline] = sides(layer);
      expect(core * 50).toBeCloseTo(EGG_MIN_PIXELS, 6);
      expect((outline - core) * 50).toBeCloseTo(EGG_MIN_OUTLINE_PIXELS, 6);
      // Le second œuf, un peu plus loin, est un peu plus grand.
      expect(sides(layer, 1)[0]).toBeGreaterThan(core);
      // Point de vue rapproché : les œufs posés reprennent leur taille de base.
      layer.setViewpoint(0, 0.1, 0.34, 100);
      expect(sides(layer)[0]).toBeCloseTo(EGG_VOXEL, 9);
      layer.dispose();
    });

    it('échelle inconnue, nulle ou invalide : tailles de base ; caméra sur l’œuf : idem', () => {
      const layer = new EggLayer();
      layer.update([egg(0)], EGG_HATCH_TIME);
      expect(sides(layer)[0]).toBeCloseTo(EGG_VOXEL, 9);
      for (const k of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
        layer.setViewpoint(0, 0.1, 5, k);
        expect(sides(layer)[0]).toBeCloseTo(EGG_VOXEL, 9);
      }
      layer.setViewpoint(0, 0.1, 0.24, 100);
      expect(sides(layer)[0]).toBeCloseTo(EGG_VOXEL, 9);
      layer.dispose();
    });

    it('sans œuf, un changement de point de vue ne montre rien', () => {
      const layer = new EggLayer();
      layer.setViewpoint(1, 2, 3, 100);
      expect(layer.count).toBe(0);
      expect(layer.object.visible).toBe(false);
      layer.dispose();
    });
  });
});
