import { Color, Matrix4 } from 'three';

import { EGG_HATCH_TIME, MAX_EGGS, type Egg } from '../sim/eggs';
import { EGG_COLOR, EGG_RIPE_COLOR, EGG_VOXEL, EggLayer } from './egg-layer';

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
});
