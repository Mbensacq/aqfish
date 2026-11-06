import { Color, Group, Mesh, ShaderMaterial, Vector2, type BufferGeometry } from 'three';

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
  floatingLeafTintInto,
  LEAF_NIGHT_TINT,
} from './floating-leaf-layer';
import { FLOATING_LEAF_COLORS } from './floating-leaf-model';
import { NIGHT_FLAT_BRIGHTNESS } from './night-shade';
import { NIGHT_TONE_COLORS, PALETTE, PALETTE_COLORS } from './palette';
import { hexToRgb, linearToSrgb, nearestPaletteIndex } from './pixel-art';
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

  it('luminosité : couleurs exactes à 1, teinte de nuit (#466), valeur invalide ignorée', () => {
    expect(layer.brightness).toBe(1);
    expect(layer.color.getHex()).toBe(0xffffff);
    layer.setBrightness(NIGHT_FLAT_BRIGHTNESS);
    expect(layer.brightness).toBe(NIGHT_FLAT_BRIGHTNESS);
    expect(layer.color.r).toBeCloseTo(LEAF_NIGHT_TINT[0], 12);
    expect(layer.color.g).toBeCloseTo(LEAF_NIGHT_TINT[1], 12);
    expect(layer.color.b).toBeCloseTo(LEAF_NIGHT_TINT[2], 12);
    for (const bad of [NaN, -1, Infinity]) {
      layer.setBrightness(bad);
      expect(layer.brightness).toBe(NIGHT_FLAT_BRIGHTNESS);
    }
    layer.setBrightness(1);
    expect(layer.color.getHex()).toBe(0xffffff);
  });

  it('teinte de nuit (#466) : blanche le jour, linéaire, bornée la nuit et au-delà', () => {
    const out = new Color();
    expect(floatingLeafTintInto(1, out)).toBe(out);
    expect(out.getHex()).toBe(0xffffff);
    // Au-delà de 1 (jamais en pratique) : reste blanche.
    expect(floatingLeafTintInto(1.5, out).getHex()).toBe(0xffffff);
    const half = (1 + NIGHT_FLAT_BRIGHTNESS) / 2;
    floatingLeafTintInto(half, out);
    expect(out.r).toBeCloseTo((1 + LEAF_NIGHT_TINT[0]) / 2, 12);
    expect(out.g).toBeCloseTo((1 + LEAF_NIGHT_TINT[1]) / 2, 12);
    expect(out.b).toBeCloseTo((1 + LEAF_NIGHT_TINT[2]) / 2, 12);
    for (const b of [NIGHT_FLAT_BRIGHTNESS, 0]) {
      floatingLeafTintInto(b, out);
      expect([out.r, out.g, out.b]).toEqual([...LEAF_NIGHT_TINT]);
    }
  });

  it('teinte de nuit (#466) : la feuille ocre ne retombe plus sur les tons des koïs', () => {
    const palette = [...PALETTE_COLORS, ...NIGHT_TONE_COLORS];
    const rgbs = palette.map(hexToRgb);
    const fishTones = [
      PALETTE.koiRouge,
      PALETTE.koiOrange,
      PALETTE.koiOr,
      PALETTE.tritonOrange,
      PALETTE.neonRouge,
    ];
    const tint = floatingLeafTintInto(NIGHT_FLAT_BRIGHTNESS, new Color());
    const shown = (hex: string): string => {
      // Couleur de sommet (linéaire) × matériau, puis passe palette en sRGB.
      const c = new Color(hex);
      const rgb = [c.r * tint.r, c.g * tint.g, c.b * tint.b].map(linearToSrgb) as [
        number,
        number,
        number,
      ];
      return palette[nearestPaletteIndex(rgb, rgbs)];
    };
    for (const colors of FLOATING_LEAF_COLORS) {
      for (const hex of colors) {
        expect(fishTones).not.toContain(shown(hex));
      }
    }
    // Les deux teintes restent distinctes sous la lune (dessus clair).
    expect(shown(FLOATING_LEAF_COLORS[0][0])).not.toBe(shown(FLOATING_LEAF_COLORS[1][0]));
    // Témoin : un simple assombrissement ramenait l'ocre sur koiRouge.
    const dimmed = new Color(PALETTE.tritonOrange).multiplyScalar(NIGHT_FLAT_BRIGHTNESS);
    const dimmedRgb = [dimmed.r, dimmed.g, dimmed.b].map(linearToSrgb) as [number, number, number];
    expect(palette[nearestPaletteIndex(dimmedRgb, rgbs)]).toBe(PALETTE.koiRouge);
  });

  it('temps négatif ramené à 0 ; résolution du contour bornée à 1 pixel', () => {
    layer.update(-5);
    expect(layer.count).toBe(0);
    layer.setResolution(0, 240);
    const outline = parts(leafGroups(layer)[0]).outline.material as ShaderMaterial;
    expect((outline.uniforms['uResolution'].value as Vector2).toArray()).toEqual([1, 240]);
  });
});
