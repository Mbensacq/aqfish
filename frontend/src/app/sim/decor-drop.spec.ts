import { describe, expect, it } from 'vitest';

import { DEFAULT_DECOR, decorGroundBaseY, decorSpheres, type DecorItem } from './decor';
import {
  DROP_CLEARANCE,
  DROP_GROUND_SNAP,
  DROP_MIN_HEIGHT,
  DROP_SKIN,
  decorDropScene,
  groundDecorItem,
  settleDecorItem,
} from './decor-drop';

const rock: DecorItem = { kind: 'rock', x: 0, z: 0, rotation: 0.5, scale: 1, seed: 11 };

describe('decorDropScene', () => {
  it('corps relatif à sa base, au moins DROP_MIN_HEIGHT au-dessus du sable sans voisin', () => {
    const scene = decorDropScene([rock], 0, 'tropical');
    expect(scene).not.toBeNull();
    if (!scene) return;
    const base = decorGroundBaseY(rock);
    expect(scene.groundBaseY).toBe(base);
    expect(scene.fixed).toEqual([]);
    const world = decorSpheres(rock);
    scene.body.forEach((s, n) => {
      expect(s.x + rock.x).toBeCloseTo(world[n].x, 12);
      // Remontée : aucune sphère sous la base (partie enfouie sur le sable).
      expect(s.y).toBeCloseTo(Math.max(world[n].y - base, world[n].radius), 12);
      expect(s.y - s.radius).toBeGreaterThanOrEqual(-1e-12);
      expect(s.radius).toBe(world[n].radius);
    });
    const lowest = Math.min(...scene.body.map((s) => s.y - s.radius));
    expect(scene.floorY).toBeCloseTo(base + lowest, 12);
    expect(scene.start.y - scene.groundBaseY).toBeCloseTo(DROP_MIN_HEIGHT, 12);
    expect(scene.start.x).toBe(0);
    expect(scene.halfWidth).toBeGreaterThan(0);
  });

  it('part au-dessus du plus haut voisin, épaissi de DROP_SKIN', () => {
    const decor = [...DEFAULT_DECOR, { ...rock, x: DEFAULT_DECOR[0].x, z: DEFAULT_DECOR[0].z }];
    const index = decor.length - 1;
    const scene = decorDropScene(decor, index, 'tropical');
    if (!scene) throw new Error('scène attendue');
    const others = decor
      .slice(0, index)
      .filter((d) => d.kind !== 'plant')
      .flatMap(decorSpheres);
    expect(scene.fixed.length).toBe(others.length);
    expect(scene.fixed[0].radius).toBeCloseTo(others[0].radius + DROP_SKIN, 12);
    const top = Math.max(...scene.fixed.map((s) => s.y + s.radius));
    const bottom = scene.start.y - scene.groundBaseY + scene.floorY;
    expect(bottom).toBeGreaterThanOrEqual(top + DROP_CLEARANCE - 1e-12);
  });

  it('les plantes ne portent rien : aucune sphère fixe pour elles', () => {
    const plant: DecorItem = {
      kind: 'plant',
      form: 'tall',
      x: 0,
      z: 0,
      rotation: 0,
      scale: 1,
      seed: 6,
    };
    const scene = decorDropScene([plant, rock], 1, 'tropical');
    expect(scene?.fixed).toEqual([]);
    expect(scene?.start.y).toBeCloseTo((scene?.groundBaseY ?? 0) + DROP_MIN_HEIGHT, 12);
  });

  it('ignore l’élévation de l’élément lâché', () => {
    const a = decorDropScene([{ ...rock, elevation: 0.1 }], 0, 'tropical');
    expect(a).toEqual(decorDropScene([rock], 0, 'tropical'));
  });

  it('null hors édition ou indice absent', () => {
    expect(decorDropScene([rock], 0, 'recif')).toBeNull();
    expect(decorDropScene([rock], 1, 'tropical')).toBeNull();
    expect(decorDropScene([rock], -1, 'tropical')).toBeNull();
    expect(decorDropScene([rock], 0.5, 'tropical')).toBeNull();
  });
});

describe('settleDecorItem', () => {
  const base = decorGroundBaseY(rock);

  it('pose sur le sable libre : position du lâcher, élévation absente sous DROP_GROUND_SNAP', () => {
    for (const dy of [0, DROP_GROUND_SNAP / 2, -0.001]) {
      const next = settleDecorItem([rock], 0, { x: 0.001, y: base + dy, z: -0.002 }, 'tropical');
      expect(next?.[0]).toEqual(rock);
      expect(next?.[0]).not.toHaveProperty('elevation');
    }
  });

  it('pose sur le sable après avoir glissé d’un voisin : position de repos', () => {
    const neighbour: DecorItem = { ...rock, seed: 12 };
    const next = settleDecorItem([neighbour, rock], 1, { x: 0.1, y: base, z: 0.05 }, 'tropical');
    expect(next?.[1]).toEqual({ ...rock, x: 0.1, z: 0.05 });
  });

  it('pose sur un voisin : élévation enregistrée, rotation et échelle inchangées', () => {
    const next = settleDecorItem([rock], 0, { x: 0, y: base + 0.05, z: 0 }, 'tropical');
    expect(next?.[0].elevation).toBeCloseTo(0.05, 6);
    expect(next?.[0].rotation).toBe(rock.rotation);
    expect(next?.[0].scale).toBe(rock.scale);
  });

  it('position bornée au bac, voisins inchangés', () => {
    const other: DecorItem = { ...rock, x: 0.3, seed: 12 };
    const next = settleDecorItem([rock, other], 0, { x: 5, y: base, z: -5 }, 'tropical');
    expect(next?.[0].x).toBeLessThan(0.6);
    expect(next?.[0].z).toBeGreaterThan(-0.25);
    expect(next?.[1]).toBe(other);
  });

  it('null pour un indice absent, un repos non fini ou trop haut', () => {
    expect(settleDecorItem([rock], 1, { x: 0, y: base, z: 0 }, 'tropical')).toBeNull();
    expect(settleDecorItem([rock], 0, { x: NaN, y: base, z: 0 }, 'tropical')).toBeNull();
    expect(settleDecorItem([rock], 0, { x: 0, y: Infinity, z: 0 }, 'tropical')).toBeNull();
    expect(settleDecorItem([rock], 0, { x: 0, y: base + 5, z: 0 }, 'tropical')).toBeNull();
  });
});

describe('groundDecorItem', () => {
  it('retire l’élévation de l’élément seul', () => {
    const other: DecorItem = { ...rock, elevation: 0.02 };
    const next = groundDecorItem([{ ...rock, elevation: 0.04 }, other], 0);
    expect(next?.[0]).toEqual(rock);
    expect(next?.[1]).toBe(other);
    expect(groundDecorItem([rock], 2)).toBeNull();
  });
});
