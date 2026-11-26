import { Color, type Mesh, MeshBasicMaterial } from 'three';
import { describe, expect, it } from 'vitest';

import type { DecorItem } from '../sim/decor';
import { FLOATING_LEAF_ROW, plantModel } from '../sim/plant';
import { SAND_THICKNESS } from '../sim/tank';
import { DecorLayer } from './decor-layer';
import {
  createFloatingPlantShadow,
  FLOATING_SHADOW_LIFT,
  FLOATING_SHADOW_OFFSET,
  FLOATING_SHADOW_COLOR,
  floatingPlantShadowGeometry,
} from './floating-plant-shadow';
import { FLOOR_NIGHT_SHADOW_COLOR, floorShadowInto } from './floor-shadow';
import { PALETTE } from './palette';

/** Ombre des plantes flottantes sur le fond (issue #824). */

const ITEM: DecorItem = {
  kind: 'plant',
  form: 'floating',
  x: 0.1,
  z: -0.05,
  rotation: 0.7,
  scale: 1,
  seed: 9,
  elevation: 0.4,
};

describe('ombre des plantes flottantes (#824)', () => {
  it('un carré à plat (deux triangles vers le haut) par feuille du radeau', () => {
    const model = plantModel(9, 1, 'floating');
    const leaves = model.cells.filter((c) => c.j === FLOATING_LEAF_ROW).length;
    const geometry = floatingPlantShadowGeometry(model);
    const position = geometry.getAttribute('position');
    expect(position.count).toBe(leaves * 6);
    for (let n = 0; n < position.count; n++) {
      expect(position.getY(n)).toBe(0);
    }
    geometry.computeVertexNormals();
    expect(geometry.getAttribute('normal').getY(0)).toBeCloseTo(1, 6);
  });

  it('posée sur le sable sous le radeau, décalée comme celle des nénuphars', () => {
    const shadow = createFloatingPlantShadow(ITEM, 3, new MeshBasicMaterial());
    expect(shadow.name).toBe('plante-3-ombre');
    expect(shadow.position.x).toBeCloseTo(ITEM.x + FLOATING_SHADOW_OFFSET.x, 9);
    expect(shadow.position.y).toBeCloseTo(SAND_THICKNESS + FLOATING_SHADOW_LIFT, 9);
    expect(shadow.position.z).toBeCloseTo(ITEM.z + FLOATING_SHADOW_OFFSET.z, 9);
    expect(shadow.rotation.y).toBeCloseTo(ITEM.rotation, 9);
  });

  it('la couche du décor ajoute une ombre par plante flottante, hors du compte des éléments', () => {
    const layer = new DecorLayer();
    const rock: DecorItem = { kind: 'rock', x: 0, z: 0, rotation: 0, scale: 1, seed: 3 };
    layer.setDecor([rock, ITEM]);
    expect(layer.count).toBe(2);
    expect(layer.object.getObjectByName('plante-1-ombre')).toBeDefined();
    expect(layer.object.getObjectByName('plante-1')?.position.y).toBeGreaterThan(0.4);
    layer.setDecor([rock]);
    expect(layer.count).toBe(1);
    expect(layer.object.getObjectByName('plante-1-ombre')).toBeUndefined();
    layer.dispose();
  });

  it('l’ombre suit la lumière comme celle des nénuphars (#832), sans allocation', () => {
    const layer = new DecorLayer();
    layer.setDecor([ITEM]);
    const shadow = layer.object.getObjectByName('plante-0-ombre') as Mesh;
    const color = layer.floatingShadowColor;
    expect(shadow.material).toBeInstanceOf(MeshBasicMaterial);
    expect((shadow.material as MeshBasicMaterial).color).toBe(color);
    expect(FLOATING_SHADOW_COLOR).toBe(PALETTE.eauProfonde);
    // Plein jour sous une teinte blanche : l'eau profonde, à l'octet près.
    layer.setTint([1, 1, 1]);
    expect(`#${color.getHexString()}`).toBe(FLOATING_SHADOW_COLOR);
    // Pleine nuit, ciel clair : le bleu nuit des ombres du fond, même objet couleur.
    layer.setTint([0.3, 0.35, 0.5], 0.9, 0, 1);
    expect(layer.floatingShadowColor).toBe(color);
    expect(`#${color.getHexString()}`).toBe(FLOOR_NIGHT_SHADOW_COLOR);
    // Entre les deux : la même couleur que l'ombre des nénuphars, sans le facteur de canopée.
    layer.setTint([0.6, 0.7, 0.8], 0.88, 0.4, 0.7);
    const expected = floorShadowInto([0.6, 0.7, 0.8], 0.4, 0.7, new Color());
    expect(color.equals(expected)).toBe(true);
    layer.dispose();
  });
});
