import { describe, expect, it } from 'vitest';

import type { Fish } from '../sim/swimmer';
import { ALERT_MARKER_LIFT, AlertHighlightLayer, MAX_ALERT_MARKERS } from './alert-highlight-layer';
import { Matrix4, Vector3, type InstancedMesh } from 'three';

function fish(id: number, x = 0.1, y = 0.2, z = 0.3): Fish {
  return {
    id,
    x,
    y,
    z,
    px: x,
    py: y,
    pz: z,
    yaw: 0,
    pyaw: 0,
    pitch: 0,
    ppitch: 0,
    phase: 0,
    pphase: 0,
  } as Fish;
}

describe('AlertHighlightLayer (#483)', () => {
  it('masquée par défaut, sans désignation', () => {
    const layer = new AlertHighlightLayer();
    layer.update([fish(1)], 1);
    expect(layer.object.visible).toBe(false);
    expect(layer.count).toBe(0);
    layer.dispose();
  });

  it('pose un repère au-dessus des seuls animaux désignés', () => {
    const layer = new AlertHighlightLayer();
    layer.setAnimals([2, 99]);
    layer.update([fish(1), fish(2, 0.4, 0.5, 0.6)], 1);
    expect(layer.object.visible).toBe(true);
    expect(layer.count).toBe(1);
    const matrix = new Matrix4();
    (layer.object as InstancedMesh).getMatrixAt(0, matrix);
    const at = new Vector3().setFromMatrixPosition(matrix);
    expect(at.x).toBeCloseTo(0.4);
    expect(at.y).toBeCloseTo(0.5 + ALERT_MARKER_LIFT);
    expect(at.z).toBeCloseTo(0.6);
    layer.dispose();
  });

  it('se masque quand la désignation se vide', () => {
    const layer = new AlertHighlightLayer();
    layer.setAnimals([1]);
    layer.update([fish(1)], 1);
    layer.setAnimals([]);
    expect(layer.object.visible).toBe(false);
    expect(layer.count).toBe(0);
    layer.dispose();
  });

  it('ne dépasse jamais la capacité', () => {
    const layer = new AlertHighlightLayer();
    const many = Array.from({ length: MAX_ALERT_MARKERS + 5 }, (_, i) => fish(i));
    layer.setAnimals(many.map((f) => f.id));
    layer.update(many, 1);
    expect(layer.count).toBe(MAX_ALERT_MARKERS);
    layer.dispose();
  });
});
