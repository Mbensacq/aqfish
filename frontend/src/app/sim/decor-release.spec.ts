import { describe, expect, it } from 'vitest';

import { decorBaseY, decorElevation, withElevation, type DecorItem } from './decor';
import { DROP_SKIN, decorDropScene } from './decor-drop';
import { decorItemsOverlap } from './decor-edit';
import {
  SUPPORT_GAP,
  decorFallScene,
  isDecorItemSupported,
  releaseUnsupportedDecor,
  type DecorFall,
} from './decor-release';

const base: DecorItem = { kind: 'rock', x: 0, z: 0, rotation: 0, scale: 1, seed: 11 };
const top: DecorItem = { kind: 'rock', x: 0.01, z: 0, rotation: 0.4, scale: 0.6, seed: 7 };

/** Plus petite élévation (à 0,1 mm près) où `item` ne pénètre plus `support` : au contact. */
function touching(item: DecorItem, support: DecorItem): DecorItem {
  let low = 0;
  let high = 0.3;
  while (high - low > 1e-4) {
    const mid = (low + high) / 2;
    if (decorItemsOverlap(withElevation(item, mid), support)) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return withElevation(item, high);
}

/** Décor de deux rochers : `top` posé sur `base`. */
const stacked = (): DecorItem[] => [base, touching(top, base)];

describe('isDecorItemSupported', () => {
  it('posé sur le sable : soutenu ; indice absent : non', () => {
    expect(isDecorItemSupported([base], 0)).toBe(true);
    expect(isDecorItemSupported([base], 1)).toBe(false);
    expect(isDecorItemSupported([base], -1)).toBe(false);
    expect(isDecorItemSupported([base], 0.5)).toBe(false);
  });

  it('au contact par-dessus : soutenu ; un peu plus haut que le jeu toléré : non', () => {
    const decor = stacked();
    expect(decorElevation(decor[1])).toBeGreaterThan(0.01);
    expect(isDecorItemSupported(decor, 1)).toBe(true);
    const raised = withElevation(decor[1], decorElevation(decor[1]) + DROP_SKIN + SUPPORT_GAP / 2);
    expect(isDecorItemSupported([base, raised], 1)).toBe(true);
    const floating = withElevation(decor[1], decorElevation(decor[1]) + 0.03);
    expect(isDecorItemSupported([base, floating], 1)).toBe(false);
  });

  it('seul, en l’air : non soutenu', () => {
    expect(isDecorItemSupported([stacked()[1]], 0)).toBe(false);
  });

  it('une plante ne porte rien', () => {
    const plant: DecorItem = { ...base, kind: 'plant', form: 'tall', scale: 1 };
    const decor = [plant, touching(top, plant)];
    expect(isDecorItemSupported(decor, 1)).toBe(false);
  });

  it('un voisin plus haut que l’élément ne le porte pas', () => {
    // Le rocher du dessus ne soutient pas celui du dessous (normale vers le bas).
    const decor = stacked();
    const below = withElevation(base, 0.001);
    expect(isDecorItemSupported([below, decor[1]], 0)).toBe(false);
  });
});

describe('decorFallScene', () => {
  it('part de la pose actuelle, sinon identique à la scène du lâcher', () => {
    const decor = stacked();
    const fall = decorFallScene(decor, 1, 'tropical');
    const drop = decorDropScene(decor, 1, 'tropical');
    expect(fall).not.toBeNull();
    if (!fall || !drop) return;
    expect(fall.start).toEqual({ x: decor[1].x, y: decorBaseY(decor[1]), z: decor[1].z });
    expect({ ...fall, start: drop.start }).toEqual(drop);
  });

  it('null pour un indice absent ou hors édition', () => {
    expect(decorFallScene(stacked(), 2, 'tropical')).toBeNull();
    expect(decorFallScene(stacked(), 1, 'recif')).toBeNull();
  });
});

describe('releaseUnsupportedDecor', () => {
  it('rien à relâcher : même décor (mêmes objets), aucune chute', () => {
    const decor = stacked();
    let calls = 0;
    const result = releaseUnsupportedDecor(decor, () => {
      calls++;
      return null;
    });
    expect(result.decor).toBe(decor);
    expect(result.falls).toEqual([]);
    expect(calls).toBe(0);
    expect(releaseUnsupportedDecor([], null)).toEqual({ decor: [], falls: [] });
  });

  it('sans moteur : posé sur le sable (clé omise), les autres inchangés', () => {
    const other: DecorItem = { ...base, x: 0.3, seed: 3 };
    const floating = stacked()[1];
    const decor = [other, floating];
    const result = releaseUnsupportedDecor(decor, null);
    expect(result.falls).toEqual([{ index: 1, path: [] }]);
    expect(result.decor[0]).toBe(other);
    expect('elevation' in result.decor[1]).toBe(false);
    expect(result.decor[1]).toEqual(withElevation(floating, 0));
  });

  it('moteur : la pose et la trajectoire de la chute sont retenues', () => {
    const floating = stacked()[1];
    const path = [{ x: 0, y: 0.2, z: 0 }];
    const fall: DecorFall = (decor, index) => ({
      decor: decor.map((item, n) => (n === index ? withElevation({ ...item, x: 0.05 }, 0) : item)),
      path,
    });
    const result = releaseUnsupportedDecor([floating], fall);
    expect(result.falls).toEqual([{ index: 0, path }]);
    expect(result.decor[0].x).toBe(0.05);
    expect(decorElevation(result.decor[0])).toBe(0);
  });

  it('chute sans effet (moins d’un millimètre) : pose gardée à l’octet', () => {
    const floating = stacked()[1];
    const fall: DecorFall = (decor, index) => ({
      decor: decor.map((item, n) =>
        n === index ? withElevation(item, decorElevation(item) - 0.0005) : item,
      ),
      path: [{ x: 0, y: 0, z: 0 }],
    });
    const decor = [floating];
    const result = releaseUnsupportedDecor(decor, fall);
    expect(result.decor).toBe(decor);
    expect(result.falls).toEqual([]);
  });

  it('chute refusée (pénètre un voisin) ou en échec : repli sur le sable', () => {
    const neighbour: DecorItem = { ...base, x: 0.4, seed: 5 };
    const floating = stacked()[1];
    const into: DecorFall = (decor, index) => ({
      decor: decor.map((item, n) => (n === index ? { ...neighbour, seed: 9 } : item)),
      path: [],
    });
    const refused = releaseUnsupportedDecor([neighbour, floating], into);
    expect(refused.decor[1]).toEqual(withElevation(floating, 0));
    const failed = releaseUnsupportedDecor([neighbour, floating], () => null);
    expect(failed.decor[1]).toEqual(withElevation(floating, 0));
  });

  it('aucune pose permise : l’élément reste où il est, sans boucle', () => {
    // Sur le sable, il pénétrerait le rocher bas posé dessous (sans le toucher en l'air).
    const floating = withElevation({ ...base, seed: 4 }, 0.25);
    const decor = [withElevation(base, 0), floating];
    expect(isDecorItemSupported(decor, 1)).toBe(false);
    let calls = 0;
    const result = releaseUnsupportedDecor(decor, () => {
      calls++;
      return null;
    });
    expect(result.decor).toBe(decor);
    expect(result.falls).toEqual([]);
    expect(calls).toBe(1);
  });

  it('cascade : le plus bas d’abord, puis ce qu’il portait', () => {
    const middle = stacked()[1];
    const upper = touching({ ...top, seed: 9, scale: 0.4 }, middle);
    // Socle supprimé : les deux sont en l'air ; le haut repose sur le milieu.
    const decor = [upper, middle];
    expect(isDecorItemSupported(decor, 0)).toBe(true);
    expect(isDecorItemSupported(decor, 1)).toBe(false);
    // Chaque chute pose l'élément sur le sable, à l'écart des autres.
    const fall: DecorFall = (current, index) => ({
      decor: current.map((item, n) =>
        n === index ? withElevation({ ...item, x: -0.3 + 0.3 * index }, 0) : item,
      ),
      path: [],
    });
    const result = releaseUnsupportedDecor(decor, fall);
    expect(result.falls.map((f) => f.index)).toEqual([1, 0]);
    expect(result.decor.every((item) => decorElevation(item) === 0)).toBe(true);
  });

  it('déterministe : même décor, même résultat', () => {
    const decor = [stacked()[1]];
    expect(releaseUnsupportedDecor(decor, null)).toEqual(releaseUnsupportedDecor(decor, null));
  });
});
