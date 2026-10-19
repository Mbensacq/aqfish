import { Mesh, Points, type MeshBasicMaterial, type PointsMaterial } from 'three';
import {
  createBubbleBuffer,
  DEFAULT_BUBBLE_SOURCE,
  fillBubbles,
  MAX_BUBBLES,
} from '../sim/bubbles';
import { BUBBLE_COLOR, BUBBLE_RENDER_ORDER, BubbleLayer } from './bubble-layer';
import { FISH_RENDER_ORDER } from './fish-layer';
import { PALETTE_COLORS } from './palette';

function clouds(layer: BubbleLayer): Points[] {
  return layer.object.children.filter((c): c is Points => c instanceof Points);
}

describe('BubbleLayer', () => {
  it('deux nuages de points (1 et 2 pixels), taille fixe à l’écran, couleur de la palette', () => {
    const layer = new BubbleLayer();
    const [small, large] = clouds(layer);
    expect(PALETTE_COLORS).toContain(BUBBLE_COLOR);
    for (const [cloud, size] of [
      [small, 1],
      [large, 2],
    ] as const) {
      const material = cloud.material as PointsMaterial;
      expect(material.size).toBe(size);
      expect(material.sizeAttenuation).toBe(false);
      expect('#' + material.color.getHexString()).toBe(BUBBLE_COLOR);
      expect(cloud.renderOrder).toBe(BUBBLE_RENDER_ORDER);
    }
    expect(BUBBLE_RENDER_ORDER).toBeGreaterThan(FISH_RENDER_ORDER);
    expect(layer.object.children.some((c) => c instanceof Mesh && c.name === 'diffuseur')).toBe(
      true,
    );
    layer.dispose();
  });

  it('reprend exactement les bulles de la simulation, réparties par taille', () => {
    const layer = new BubbleLayer();
    layer.setSeed(42);
    layer.update(20);
    const expected = createBubbleBuffer();
    fillBubbles(42, 20, expected);
    expect(layer.count).toBe(expected.count);
    const large = Array.from(expected.sizes.subarray(0, expected.count)).filter((s) => s === 2);
    expect(layer.countsBySize).toEqual([expected.count - large.length, large.length]);
    const [small] = clouds(layer);
    expect(small.geometry.drawRange.count).toBe(layer.countsBySize[0]);
    // Première petite bulle : mêmes coordonnées (en flottants 32 bits).
    const i = Array.from(expected.sizes).indexOf(1);
    const array = small.geometry.getAttribute('position').array;
    expect(array[0]).toBe(Math.fround(expected.positions[3 * i]));
    expect(array[1]).toBe(Math.fround(expected.positions[3 * i + 1]));
    layer.dispose();
  });

  it('sans allocation : mêmes tableaux d’une image à l’autre, plafond respecté', () => {
    const layer = new BubbleLayer();
    layer.setSeed(7);
    const arrays = clouds(layer).map((c) => c.geometry.getAttribute('position').array);
    for (let t = 0; t < 60; t += 0.7) {
      layer.update(t);
      expect(layer.count).toBeLessThanOrEqual(MAX_BUBBLES);
    }
    expect(clouds(layer).map((c) => c.geometry.getAttribute('position').array)).toEqual(arrays);
    expect(arrays.every((a) => a.length === MAX_BUBBLES * 3)).toBe(true);
    layer.dispose();
  });

  it('temps négatif ramené à 0 ; autre graine ⇒ autres positions', () => {
    const layer = new BubbleLayer();
    layer.setSeed(42);
    layer.update(-5);
    expect(layer.count).toBe(1);
    layer.update(9);
    const a = Array.from(clouds(layer)[0].geometry.getAttribute('position').array);
    layer.setSeed(43);
    layer.update(9);
    const b = Array.from(clouds(layer)[0].geometry.getAttribute('position').array);
    expect(a).not.toEqual(b);
    layer.dispose();
  });

  it('échelle des points : taille × échelle, valeurs invalides ramenées à 1', () => {
    const layer = new BubbleLayer();
    const [small, large] = clouds(layer).map((c) => c.material as PointsMaterial);
    layer.setPointScale(3);
    expect([small.size, large.size]).toEqual([3, 6]);
    layer.setPointScale(Number.NaN);
    expect([small.size, large.size]).toEqual([1, 2]);
    layer.setPointScale(0);
    expect(small.size).toBe(1);
    layer.dispose();
  });

  it('diffuseur sous le point d’émission', () => {
    const layer = new BubbleLayer();
    const diffuser = layer.object.getObjectByName('diffuseur')!;
    expect(diffuser.position.x).toBe(DEFAULT_BUBBLE_SOURCE.x);
    expect(diffuser.position.z).toBe(DEFAULT_BUBBLE_SOURCE.z);
    layer.dispose();
  });

  it('luminosité : bulles et diffuseur assombris, couleurs d’origine exactes à 1', () => {
    const layer = new BubbleLayer();
    const materials = [
      ...clouds(layer).map((c) => c.material as PointsMaterial),
      (layer.object.getObjectByName('diffuseur') as Mesh).material as MeshBasicMaterial,
    ];
    const before = materials.map((m) => m.color.clone());
    expect(layer.brightness).toBe(1);
    layer.setBrightness(0.5);
    expect(layer.brightness).toBe(0.5);
    materials.forEach((m, i) => {
      expect(m.color.r).toBeCloseTo(before[i].r * 0.5, 12);
      expect(m.color.g).toBeCloseTo(before[i].g * 0.5, 12);
      expect(m.color.b).toBeCloseTo(before[i].b * 0.5, 12);
    });
    layer.setBrightness(Number.NaN);
    layer.setBrightness(-0.1);
    expect(layer.brightness).toBe(0.5);
    layer.setBrightness(1);
    materials.forEach((m, i) => expect(m.color.equals(before[i])).toBe(true));
    expect('#' + materials[0].color.getHexString()).toBe(BUBBLE_COLOR);
    layer.dispose();
  });
});
