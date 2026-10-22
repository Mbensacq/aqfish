import { Group, Mesh, ShaderMaterial, Vector2, type BufferGeometry } from 'three';

import { environmentWater } from '../sim/environment';
import {
  createFloatingLeafBuffer,
  fillFloatingLeaves,
  LEAF_STRIDE,
  LEAF_TINT_COUNT,
  MAX_FLOATING_LEAVES,
} from '../sim/floating-leaves';
import { DECOR_RENDER_ORDER } from './decor-layer';
import {
  FLOATING_LEAF_LIFT,
  FLOATING_LEAF_OUTLINE_MIN_LENGTH,
  FLOATING_LEAF_RENDER_ORDER,
  FloatingLeafLayer,
} from './floating-leaf-layer';
import { FISH_RENDER_ORDER } from './fish-layer';
import { FLOWER_RENDER_ORDER, LILY_PAD_LIFT } from './lily-pad-layer';
import { LILY_PAD_THICKNESS } from './lily-pad-model';

const WATER = environmentWater('bassin');

function leafGroups(layer: FloatingLeafLayer): Group[] {
  return layer.object.children as Group[];
}

function parts(leaf: Group): { outline: Mesh; body: Mesh } {
  const [outline, body] = leaf.children as Mesh[];
  return { outline, body };
}

describe('FloatingLeafLayer (#107)', () => {
  let layer: FloatingLeafLayer;

  beforeEach(() => {
    layer = new FloatingLeafLayer(WATER);
    layer.setSeed(42);
  });

  afterEach(() => layer.dispose());

  it('emplacements créés une fois, au-dessus des nénuphars, après leurs fleurs et avant les poissons', () => {
    expect(layer.object.name).toBe('feuilles-mortes');
    expect(leafGroups(layer)).toHaveLength(MAX_FLOATING_LEAVES);
    expect(FLOATING_LEAF_LIFT).toBeGreaterThan(LILY_PAD_LIFT + LILY_PAD_THICKNESS);
    expect(FLOATING_LEAF_RENDER_ORDER).toBeGreaterThan(FLOWER_RENDER_ORDER);
    expect(FLOATING_LEAF_RENDER_ORDER).toBeGreaterThan(DECOR_RENDER_ORDER);
    expect(FLOATING_LEAF_RENDER_ORDER).toBeLessThan(FISH_RENDER_ORDER);
    for (const leaf of leafGroups(layer)) {
      expect(leaf.position.y).toBeCloseTo(WATER.maxY + FLOATING_LEAF_LIFT, 12);
      expect(leaf.visible).toBe(false);
      const { outline, body } = parts(leaf);
      expect(outline.renderOrder).toBe(FLOATING_LEAF_RENDER_ORDER);
      expect(body.renderOrder).toBe(FLOATING_LEAF_RENDER_ORDER);
      expect(outline.material).toBeInstanceOf(ShaderMaterial);
    }
  });

  it('t = 0 : aucune feuille', () => {
    layer.update(0);
    expect(layer.count).toBe(0);
    expect(leafGroups(layer).every((leaf) => !leaf.visible)).toBe(true);
  });

  it('reprend exactement les feuilles de la simulation (position, rotation, taille, forme)', () => {
    const expected = createFloatingLeafBuffer();
    for (const time of [400, 95.5, 30]) {
      layer.update(time);
      const count = fillFloatingLeaves(42, time, WATER, expected);
      expect(layer.count).toBe(count);
      leafGroups(layer).forEach((leaf, i) => {
        expect(leaf.visible).toBe(i < count);
        if (i >= count) {
          return;
        }
        const j = i * LEAF_STRIDE;
        expect(leaf.position.x).toBe(expected.leaves[j]);
        expect(leaf.position.z).toBe(expected.leaves[j + 1]);
        expect(leaf.rotation.y).toBeCloseTo(expected.leaves[j + 2], 12);
        expect(leaf.scale.x).toBeCloseTo(Math.max(expected.leaves[j + 3], 1e-6), 12);
        expect(leaf.scale.y).toBe(1);
        const { outline } = parts(leaf);
        expect(outline.visible).toBe(expected.leaves[j + 3] >= FLOATING_LEAF_OUTLINE_MIN_LENGTH);
      });
    }
    expect(layer.count).toBeGreaterThan(0);
  });

  it('graine 42 à t = 30 s (captures) : au moins deux feuilles, de deux formes ou teintes', () => {
    layer.update(30);
    expect(layer.count).toBeGreaterThanOrEqual(2);
    const geometries = new Set(
      leafGroups(layer)
        .filter((leaf) => leaf.visible)
        .map((leaf) => parts(leaf).body.geometry),
    );
    expect(geometries.size).toBeGreaterThanOrEqual(2);
  });

  it('sans allocation : géométries partagées, prises dans un jeu fixe', () => {
    const shared = new Set<BufferGeometry>();
    for (let t = 0; t < 900; t += 11) {
      layer.update(t);
      for (const leaf of leafGroups(layer)) {
        shared.add(parts(leaf).body.geometry);
        shared.add(parts(leaf).outline.geometry);
      }
    }
    // Au plus forme × teinte maillages et une coque par forme.
    expect(shared.size).toBeLessThanOrEqual(6 * LEAF_TINT_COUNT + 6);
    expect(shared.size).toBeGreaterThan(4);
  });

  it('luminosité : couleurs exactes à 1, assombries la nuit, valeur invalide ignorée', () => {
    expect(layer.brightness).toBe(1);
    expect(layer.color.getHex()).toBe(0xffffff);
    layer.setBrightness(0.5);
    expect(layer.brightness).toBe(0.5);
    expect(layer.color.r).toBeCloseTo(0.5, 12);
    for (const bad of [NaN, -1, Infinity]) {
      layer.setBrightness(bad);
      expect(layer.brightness).toBe(0.5);
    }
    layer.setBrightness(1);
    expect(layer.color.getHex()).toBe(0xffffff);
  });

  it('temps négatif ramené à 0 ; résolution du contour bornée à 1 pixel', () => {
    layer.update(-5);
    expect(layer.count).toBe(0);
    layer.setResolution(0, 240);
    const outline = parts(leafGroups(layer)[0]).outline.material as ShaderMaterial;
    expect((outline.uniforms['uResolution'].value as Vector2).toArray()).toEqual([1, 240]);
  });
});
