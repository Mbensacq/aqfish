import { beforeAll, describe, expect, it } from 'vitest';

import { DEFAULT_DECOR, decorElevation, type DecorItem } from '../../sim/decor';
import { decorDropScene, settleDecorItem } from '../../sim/decor-drop';
import {
  addDecorItem,
  isDecorPoseAllowed,
  moveDecorItem,
  removeDecorItem,
} from '../../sim/decor-edit';
import {
  decorFallScene,
  isDecorItemSupported,
  releaseUnsupportedDecor,
  type DecorFall,
} from '../../sim/decor-release';
import { initDecorPhysics, type DecorDropper } from './decor-physics';

/**
 * Relâcher les éléments dont le support disparaît (#182) avec le vrai moteur : un rocher
 * posé sur un autre retombe quand on supprime ou déplace son support ; un élément soutenu
 * garde sa pose à l'octet ; même décor, mêmes gestes : même pose.
 */

let dropper: DecorDropper;

beforeAll(async () => {
  dropper = await initDecorPhysics();
});

/** Chute depuis la pose, comme l'éditeur (`AquariumHost`). */
const fall: DecorFall = (decor, index) => {
  const scene = decorFallScene(decor, index, 'tropical');
  if (!scene) return null;
  const result = dropper.drop(scene);
  const settled = settleDecorItem(decor, index, result.rest, 'tropical');
  return settled ? { decor: settled, path: [scene.start, ...result.path] } : null;
};

/** Lâche un rocher (graine `seed`, échelle `scale`) au-dessus de l'élément `target`. */
function stack(decor: readonly DecorItem[], target: number, seed: number, scale = 0.6) {
  const support = decor[target];
  const added = addDecorItem(decor, 'rock', support.x, support.z, seed, 'tropical');
  if (!added) throw new Error('ajout attendu');
  const index = added.length - 1;
  const sized = added.map((item, n) => (n === index ? { ...item, scale } : item));
  const scene = decorDropScene(sized, index, 'tropical');
  if (!scene) throw new Error('scène attendue');
  const settled = settleDecorItem(sized, index, dropper.drop(scene).rest, 'tropical');
  if (!settled) throw new Error('pose attendue');
  expect(isDecorPoseAllowed(sized, settled, index)).toBe(true);
  return settled;
}

describe('releaseUnsupportedDecor (Rapier)', () => {
  it('un rocher posé sur un autre est soutenu ; rien ne bouge (à l’octet)', () => {
    const decor = stack(DEFAULT_DECOR, 2, 7);
    const top = decor.length - 1;
    expect(decorElevation(decor[top])).toBeGreaterThan(0.01);
    expect(isDecorItemSupported(decor, top)).toBe(true);
    const released = releaseUnsupportedDecor(decor, fall);
    expect(released.falls).toEqual([]);
    expect(released.decor).toBe(decor);
    expect(JSON.stringify(released.decor)).toBe(JSON.stringify(decor));
  });

  it('support supprimé : le rocher porté retombe sur le sable, les autres inchangés', () => {
    const decor = stack(DEFAULT_DECOR, 2, 7);
    const removed = removeDecorItem(decor, 2);
    if (!removed) throw new Error('suppression attendue');
    const top = removed.length - 1;
    expect(isDecorItemSupported(removed, top)).toBe(false);
    const released = releaseUnsupportedDecor(removed, fall);
    expect(released.falls.map((f) => f.index)).toEqual([top]);
    expect(released.falls[0].path.length).toBeGreaterThan(1);
    expect(decorElevation(released.decor[top])).toBe(0);
    expect(released.decor[top].elevation).toBeUndefined();
    released.decor.forEach((item, n) => {
      if (n !== top) expect(item).toBe(removed[n]);
    });
  });

  it('support déplacé : le rocher porté retombe', () => {
    const decor = stack(DEFAULT_DECOR, 2, 7);
    const moved = moveDecorItem(decor, 2, decor[2].x, 0.17, 'tropical');
    if (!moved) throw new Error('déplacement attendu');
    const top = moved.length - 1;
    expect(isDecorItemSupported(moved, top)).toBe(false);
    const released = releaseUnsupportedDecor(moved, fall);
    expect(decorElevation(released.decor[top])).toBeLessThan(decorElevation(moved[top]));
  });

  it('cascade : deux rochers empilés retombent quand le socle disparaît', () => {
    const two = stack(DEFAULT_DECOR, 2, 7, 0.7);
    const middle = two.length - 1;
    const three = stack(two, middle, 9, 0.4);
    const top = three.length - 1;
    expect(decorElevation(three[top])).toBeGreaterThan(decorElevation(three[middle]));
    const removed = removeDecorItem(three, 2);
    if (!removed) throw new Error('suppression attendue');
    const released = releaseUnsupportedDecor(removed, fall);
    // Le milieu tombe d'abord ; le haut retombe sur lui (ou à côté), plus bas qu'avant.
    expect(released.falls[0].index).toBe(middle - 1);
    expect(decorElevation(released.decor[middle - 1])).toBe(0);
    expect(decorElevation(released.decor[top - 1])).toBeLessThan(decorElevation(removed[top - 1]));
    expect(isDecorItemSupported(released.decor, top - 1)).toBe(true);
  });

  it('déterministe : même décor, mêmes gestes, même pose', () => {
    const run = () => {
      const removed = removeDecorItem(stack(DEFAULT_DECOR, 2, 7), 2);
      if (!removed) throw new Error('suppression attendue');
      return releaseUnsupportedDecor(removed, fall);
    };
    const a = run();
    const b = run();
    expect(JSON.stringify(b.decor)).toBe(JSON.stringify(a.decor));
    expect(b.falls).toEqual(a.falls);
  });

  it('sans moteur : posé sur le sable', () => {
    const removed = removeDecorItem(stack(DEFAULT_DECOR, 2, 7), 2);
    if (!removed) throw new Error('suppression attendue');
    const top = removed.length - 1;
    const released = releaseUnsupportedDecor(removed, null);
    expect(released.falls).toEqual([{ index: top, path: [] }]);
    expect(released.decor[top]).toEqual({ ...removed[top], elevation: undefined });
    expect('elevation' in released.decor[top]).toBe(false);
  });
});
