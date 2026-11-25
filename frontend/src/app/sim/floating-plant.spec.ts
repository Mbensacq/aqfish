import { describe, expect, it } from 'vitest';

import {
  DEFAULT_DECOR,
  decorBaseY,
  decorSpheres,
  floatingPlantElevation,
  isFloatingPlant,
  validateDecorItem,
  type DecorItem,
} from './decor';
import { decorDropScene, groundDecorItem } from './decor-drop';
import { addDecorItem, removeDecorItem, scaleDecorItem, setDecorInPlace } from './decor-edit';
import { isDecorItemSupported, releaseUnsupportedDecor } from './decor-release';
import { environmentWater } from './environment';
import { fryCover, fryProtection, isSheltered, type FryRefugeSource } from './fry';
import {
  FLOATING_FRONDS,
  FLOATING_LEAF_ROW,
  FLOATING_RAFT_RADIUS,
  plantCollision,
  plantModel,
  PLANT_VOXEL_SIZE,
} from './plant';
import {
  PLANT_FORM_KIND,
  plantMass,
  plantUptakeCapacity,
  PLANT_UPTAKE_MG_N_PER_M2_DAY,
} from './plant-uptake';
import { parseWorld, serializeWorld } from './save';
import { DEFAULT_TANK } from './tank';
import { setTankDimensionsInPlace } from './tank-resize';
import { createWorld } from './world';

/** Plantes flottantes : salvinia posée à la surface, absorption et refuge (issue #824). */

const SURFACE = environmentWater('tropical').maxY;
const WORLD_SEED = 42;

function floating(x = 0, z = 0, scale = 1, seed = 11): DecorItem {
  const item: DecorItem = { kind: 'plant', form: 'floating', x, z, rotation: 0, scale, seed };
  return { ...item, elevation: floatingPlantElevation(item, SURFACE) };
}

function tall(scale = 1, x = 0, seed = 11): DecorItem {
  return { kind: 'plant', form: 'tall', x, z: 0, rotation: 0, scale, seed };
}

describe('modèle voxel du radeau (#824)', () => {
  it('même graine, même radeau ; deux graines, deux radeaux', () => {
    expect(plantModel(5, 1, 'floating')).toEqual(plantModel(5, 1, 'floating'));
    expect(plantModel(5, 1, 'floating').cells).not.toEqual(plantModel(6, 1, 'floating').cells);
  });

  it('feuilles sur une seule rangée, racines dessous, sans tige ni ondulation', () => {
    for (const seed of [0, 1, 99, 0xffffffff]) {
      const model = plantModel(seed, 1, 'floating');
      expect(model.amplitude).toBe(0);
      expect(model.height).toBe(FLOATING_LEAF_ROW + 1);
      expect(model.strands).toBeGreaterThanOrEqual(FLOATING_FRONDS.min);
      expect(model.strands).toBeLessThanOrEqual(FLOATING_FRONDS.max);
      expect(model.cells.every((c) => c.part === 'leaf')).toBe(true);
      const leaves = model.cells.filter((c) => c.j === FLOATING_LEAF_ROW);
      const roots = model.cells.filter((c) => c.j < FLOATING_LEAF_ROW);
      expect(leaves.length).toBeGreaterThan(roots.length);
      // Chaque racine pend sous une feuille.
      for (const r of roots) {
        expect(leaves.some((l) => l.i === r.i && l.k === r.k)).toBe(true);
      }
      // Tout tient dans le disque du radeau, élargi d'une demi-fronde (diagonale comprise).
      for (const c of model.cells) {
        expect(Math.hypot(c.i, c.k)).toBeLessThanOrEqual(FLOATING_RAFT_RADIUS + 2);
      }
    }
  });

  it('collision : une seule petite sphère sous le centre, le feuillage reste traversable', () => {
    expect(plantCollision(plantModel(3, 1, 'floating'))).toHaveLength(1);
  });
});

describe('pose et retrait par l’éditeur du décor (#824)', () => {
  it('se pose à la surface du bac tropical, feuilles à fleur d’eau', () => {
    const decor = addDecorItem([], 'floating', 0.1, 0.05, WORLD_SEED, 'tropical');
    expect(decor).not.toBeNull();
    const item = decor![0];
    expect(isFloatingPlant(item)).toBe(true);
    expect(validateDecorItem(item)).toEqual([]);
    const v = PLANT_VOXEL_SIZE * item.scale;
    const leavesMid = decorBaseY(item) + (FLOATING_LEAF_ROW + 0.5) * v;
    expect(leavesMid).toBeCloseTo(SURFACE, 5);
  });

  it('se retire : le décor revient à l’identique', () => {
    const added = addDecorItem(DEFAULT_DECOR, 'floating', 0, 0, WORLD_SEED, 'tropical')!;
    expect(added).toHaveLength(DEFAULT_DECOR.length + 1);
    expect(removeDecorItem(added, added.length - 1)).toEqual(DEFAULT_DECOR);
  });

  it('ne tombe pas : pas de chute, toujours soutenue, reste à la surface sans moteur', () => {
    const decor = [floating()];
    expect(decorDropScene(decor, 0, 'tropical')).toBeNull();
    expect(isDecorItemSupported(decor, 0)).toBe(true);
    expect(groundDecorItem(decor, 0)).toEqual(decor);
    expect(releaseUnsupportedDecor(decor, null).decor).toBe(decor);
  });

  it('un changement d’échelle la garde à fleur d’eau', () => {
    const scaled = scaleDecorItem([floating()], 0, 2, 'tropical')!;
    const item = scaled[0];
    expect(item.scale).toBe(1.5);
    expect(item.elevation).toBe(floatingPlantElevation(item, SURFACE));
  });

  it('suit la surface quand la hauteur du bac change', () => {
    const world = createWorld(WORLD_SEED, [], [], [floating()], 'tropical');
    const dims = { ...DEFAULT_TANK, height: DEFAULT_TANK.height - 0.1 };
    const mutable = { ...world };
    expect(setTankDimensionsInPlace(mutable, dims)).not.toBeNull();
    const surface = environmentWater(mutable).maxY;
    expect(mutable.decor[0].elevation).toBe(floatingPlantElevation(mutable.decor[0], surface));
    expect(surface).toBeLessThan(SURFACE);
  });

  it('installée dans un monde, elle a sa forme de collision', () => {
    const world = { ...createWorld(WORLD_SEED, [], [], [], 'tropical') };
    setDecorInPlace(world, [floating()]);
    expect(world.obstacles.length).toBeGreaterThanOrEqual(1);
    expect(decorSpheres(world.decor[0])).toHaveLength(1);
  });
});

describe('absorption de la plante flottante (#824)', () => {
  it('est du type flottante', () => {
    expect(PLANT_FORM_KIND.floating).toBe('flottante');
  });

  it('à masse égale, absorbe plus d’azote qu’une plante à tige', () => {
    const f = floating();
    const t = tall();
    expect(plantMass(f, undefined, SURFACE)).toBeCloseTo(plantMass(t, undefined, SURFACE), 12);
    const capFloating = plantUptakeCapacity([f], undefined, SURFACE, 1);
    const capTall = plantUptakeCapacity([t], undefined, SURFACE, 1);
    expect(capFloating).toBeGreaterThan(capTall);
    expect(capFloating / capTall).toBeCloseTo(
      PLANT_UPTAKE_MG_N_PER_M2_DAY.flottante / PLANT_UPTAKE_MG_N_PER_M2_DAY.rapide,
      9,
    );
  });

  it('sa masse suit la surface couverte (échelle au carré)', () => {
    expect(plantMass(floating(0, 0, 2), undefined, SURFACE)).toBeCloseTo(
      4 * plantMass(floating(), undefined, SURFACE),
      12,
    );
  });

  it('sans lumière, n’absorbe rien', () => {
    expect(plantUptakeCapacity([floating()], undefined, SURFACE, 0)).toBe(0);
  });
});

describe('refuge des alevins sous une couverture flottante (#824)', () => {
  const source: FryRefugeSource = { environment: 'tropical', seed: 7, water: {} };

  function share(plants: readonly DecorItem[]): number {
    let count = 0;
    for (let id = 0; id < 2000; id++) {
      count += isSheltered({ id, x: 0, z: 0 }, plants, source, SURFACE) ? 1 : 0;
    }
    return count / 2000;
  }

  it('un alevin sous le radeau est mieux protégé qu’un alevin à découvert', () => {
    const cover = fryCover([floating()], 0, 0, undefined, SURFACE);
    expect(cover).toBeGreaterThan(0);
    expect(fryProtection(cover)).toBeGreaterThan(0);
    expect(share([floating()])).toBeGreaterThan(share([floating(0.5, 0.2)]));
    expect(share([floating(0.5, 0.2)])).toBe(0);
  });
});

describe('sauvegardes (#824)', () => {
  it('une sauvegarde ancienne, sans plante flottante, se relit à l’identique', () => {
    const world = createWorld(WORLD_SEED, [], [], DEFAULT_DECOR, 'tropical');
    const text = serializeWorld(world);
    const read = parseWorld(text);
    expect(read.ok).toBe(true);
    if (!read.ok) {
      return;
    }
    expect(read.world.decor).toEqual(DEFAULT_DECOR);
    expect(serializeWorld(read.world)).toBe(text);
  });

  it('une plante flottante se sauvegarde et se relit, toujours à la surface', () => {
    const world = createWorld(WORLD_SEED, [], [], [...DEFAULT_DECOR, floating(0.2)], 'tropical');
    const read = parseWorld(serializeWorld(world));
    expect(read.ok).toBe(true);
    if (!read.ok) {
      return;
    }
    expect(read.world.decor.at(-1)).toEqual(floating(0.2));
  });
});
