import type { Mesh, MeshLambertMaterial } from 'three';

import { POND_DIMENSIONS, POND, placeEnvironmentData } from '../sim/environment';
import { shapeDistance } from '../sim/pond-shape';
import { createAquariumScene } from './aquarium-scene';
import { createPondShapeBank, curvedStones, pondShapeOutline } from './pond-shape-bank';
import { pondGroundTop } from './pond-ground';
import { STONE_BLOCK_LENGTH, STONE_BORDER_THICKNESS, STONE_RISE } from './stone-border';

describe('berge d’un bassin ovale ou haricot (#190)', () => {
  it('pierres le long du contour, à l’extérieur de l’eau, longueur proche du pas visé', () => {
    for (const shape of ['ovale', 'haricot'] as const) {
      const outline = pondShapeOutline(POND_DIMENSIONS, shape);
      const stones = curvedStones(POND_DIMENSIONS, shape);
      expect(stones.length).toBeGreaterThan(10);
      expect(stones.map((s) => s.index)).toEqual(stones.map((_, i) => i));
      for (const s of stones) {
        // Milieu de la pierre à une demi-épaisseur hors de l'eau (distance approchée).
        const d = shapeDistance(outline, s.x, s.z);
        expect(d).toBeLessThan(0);
        expect(d).toBeGreaterThan(-STONE_BORDER_THICKNESS);
        expect(s.length).toBeGreaterThan(STONE_BLOCK_LENGTH * 0.6);
        expect(s.length).toBeLessThan(STONE_BLOCK_LENGTH * 1.4);
        expect(s.height).toBeGreaterThan(POND_DIMENSIONS.height);
        expect(s.height).toBeLessThan(POND_DIMENSIONS.height + 2 * STONE_RISE);
        expect(s.y).toBeCloseTo(s.height / 2, 12);
        expect(Number.isFinite(s.angle)).toBe(true);
      }
    }
  });

  it('déterministe ; dimensions invalides refusées', () => {
    expect(curvedStones(POND_DIMENSIONS, 'haricot')).toEqual(
      curvedStones(POND_DIMENSIONS, 'haricot'),
    );
    expect(() => curvedStones({ ...POND_DIMENSIONS, width: 0 }, 'ovale')).toThrow(RangeError);
    expect(() => createPondShapeBank({ ...POND_DIMENSIONS, depth: NaN }, 'ovale')).toThrow(
      RangeError,
    );
  });

  it('berge : terre et herbe jusqu’au niveau du sol ; lueur de nuit ; masquée en coupe', () => {
    const bank = createPondShapeBank(POND_DIMENSIONS, 'ovale');
    const turf = bank.object.getObjectByName('berge-herbe') as Mesh;
    turf.geometry.computeBoundingBox();
    turf.updateMatrixWorld(true);
    const world = turf.geometry.boundingBox!.clone().applyMatrix4(turf.matrixWorld);
    expect(world.max.y).toBeCloseTo(pondGroundTop(POND_DIMENSIONS), 6);
    expect(world.max.x).toBeCloseTo(POND_DIMENSIONS.width / 2 + STONE_BORDER_THICKNESS, 6);
    expect(world.max.z).toBeCloseTo(POND_DIMENSIONS.depth / 2 + STONE_BORDER_THICKNESS, 6);
    const material = (turf.material as MeshLambertMaterial[])[0];
    bank.setDaylight(1);
    expect(material.emissive.getHex()).toBe(0);
    bank.setDaylight(0);
    expect(material.emissive.getHex()).not.toBe(0);
    bank.setCutaway(true);
    expect(bank.object.visible).toBe(false);
    bank.setCutaway(false);
    expect(bank.object.visible).toBe(true);
  });

  it('scène : berge à la place de la margelle droite seulement hors rectangle', () => {
    const rect = createAquariumScene(POND);
    expect(rect.scene.getObjectByName('margelle')).toBeDefined();
    expect(rect.scene.getObjectByName('berge-forme')).toBeUndefined();
    rect.dispose();
    const env = placeEnvironmentData({ environment: 'bassin', shape: 'haricot' });
    expect(env.shape).toBe('haricot');
    const shaped = createAquariumScene(env);
    expect(shaped.scene.getObjectByName('margelle')).toBeUndefined();
    expect(shaped.scene.getObjectByName('berge-forme')).toBeDefined();
    expect(shaped.scene.getObjectByName('sol-bassin')).toBeDefined();
    shaped.setDaylight({ intensity: 0.5, sky: [1, 1, 1], tint: [1, 1, 1] } as never);
    shaped.setViewpoint(0, -1, 3);
    shaped.dispose();
    expect(placeEnvironmentData({ environment: 'bassin', shape: 'rectangle' })).toBe(POND);
    expect(placeEnvironmentData({ environment: 'tropical', shape: 'ovale' }).shape).toBe(undefined);
  });
});
