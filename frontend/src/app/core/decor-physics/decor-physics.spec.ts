import { beforeAll, describe, expect, it } from 'vitest';

import { DEFAULT_DECOR, type DecorItem } from '../../sim/decor';
import { addDecorItem, decorItemsOverlap, isDecorPoseAllowed } from '../../sim/decor-edit';
import { DROP_MAX_STEPS, decorDropScene, settleDecorItem } from '../../sim/decor-drop';
import { initDecorPhysics, type DecorDropper } from './decor-physics';

let dropper: DecorDropper;

beforeAll(async () => {
  dropper = await initDecorPhysics();
});

/** Lâche l'élément `index` de `decor` et renvoie le décor posé. */
function drop(decor: readonly DecorItem[], index: number) {
  const scene = decorDropScene(decor, index, 'tropical');
  if (!scene) throw new Error('scène attendue');
  const result = dropper.drop(scene);
  const settled = settleDecorItem(decor, index, result.rest, 'tropical');
  if (!settled) throw new Error('pose attendue');
  return { result, settled };
}

describe('simulateDrop (Rapier)', () => {
  it('un rocher lâché au-dessus du sable libre se pose sur le sable, à la même place', () => {
    const decor = addDecorItem(DEFAULT_DECOR, 'rock', 0, 0.15, 7, 'tropical');
    if (!decor) throw new Error('ajout attendu');
    const index = decor.length - 1;
    const { result, settled } = drop(decor, index);
    expect(result.settled).toBe(true);
    expect(result.path.length).toBeLessThanOrEqual(DROP_MAX_STEPS);
    expect(settled[index].elevation).toBeUndefined();
    expect(settled[index].x).toBeCloseTo(0, 3);
    expect(settled[index].z).toBeCloseTo(0.15, 3);
    // La trajectoire descend.
    expect(result.path[0].y).toBeGreaterThan(result.rest.y);
  });

  it('lâché sur un autre rocher : posé dessus ou à côté, sans le pénétrer', () => {
    const target = DEFAULT_DECOR[0];
    for (const dx of [0, 0.01, 0.03, 0.06]) {
      const decor = addDecorItem(DEFAULT_DECOR, 'rock', target.x + dx, target.z, 7, 'tropical');
      if (!decor) throw new Error('ajout attendu');
      const index = decor.length - 1;
      const { settled } = drop(decor, index);
      const item = settled[index];
      const onTop = (item.elevation ?? 0) > 0;
      const moved = Math.hypot(item.x - decor[index].x, item.z - decor[index].z) > 0.005;
      expect(onTop || moved).toBe(true);
      expect(decorItemsOverlap(item, target)).toBe(false);
      expect(isDecorPoseAllowed(decor, settled, index)).toBe(true);
    }
  });

  it('au moins un lâcher centré reste posé sur le rocher (élévation enregistrée)', () => {
    const target = DEFAULT_DECOR[0];
    const decor = addDecorItem(DEFAULT_DECOR, 'rock', target.x, target.z, 7, 'tropical');
    if (!decor) throw new Error('ajout attendu');
    const index = decor.length - 1;
    const { settled } = drop(decor, index);
    expect(settled[index].elevation ?? 0).toBeGreaterThan(0.01);
  });

  it('déterministe : même décor, même lâcher, même pose et même trajectoire', () => {
    const decor = addDecorItem(DEFAULT_DECOR, 'wood', -0.3, -0.05, 42, 'tropical');
    if (!decor) throw new Error('ajout attendu');
    const index = decor.length - 1;
    const a = drop(decor, index);
    const b = drop(decor, index);
    expect(b.settled).toEqual(a.settled);
    expect(b.result.path).toEqual(a.result.path);
  });
});
