import { Color, LineSegments, type LineBasicMaterial } from 'three';

import { environmentWater } from '../sim/environment';
import {
  createRainBuffer,
  fillRain,
  RAIN_STREAK_LENGTH,
  RIPPLE_DURATION,
  RIPPLE_RING_GAP,
  rippleRadius,
} from '../sim/rain';
import { BUBBLE_RENDER_ORDER } from './bubble-layer';
import { DECOR_RENDER_ORDER } from './decor-layer';
import { PALETTE_COLORS } from './palette';
import {
  RAIN_DROP_COLOR,
  RAIN_DROP_RENDER_ORDER,
  RainLayer,
  RIPPLE_LIFT,
  RIPPLE_OLD_COLOR,
  RIPPLE_RENDER_ORDER,
  RIPPLE_SEGMENTS,
  RIPPLE_YOUNG_COLOR,
} from './rain-layer';
import { SURFACE_RENDER_ORDER } from './water-light';

const WATER = environmentWater('bassin');

function lines(layer: RainLayer): { drops: LineSegments; ripples: LineSegments } {
  const all = layer.object.children.filter((c): c is LineSegments => c instanceof LineSegments);
  return {
    drops: all.find((c) => c.name === 'pluie-gouttes')!,
    ripples: all.find((c) => c.name === 'pluie-ronds')!,
  };
}

describe('RainLayer (#106)', () => {
  it('couleurs de la palette, ordres de rendu : ronds avant les nénuphars, gouttes en dernier', () => {
    for (const color of [RAIN_DROP_COLOR, RIPPLE_YOUNG_COLOR, RIPPLE_OLD_COLOR]) {
      expect(PALETTE_COLORS).toContain(color);
    }
    const layer = new RainLayer(WATER);
    const { drops, ripples } = lines(layer);
    expect(ripples.renderOrder).toBe(RIPPLE_RENDER_ORDER);
    expect(drops.renderOrder).toBe(RAIN_DROP_RENDER_ORDER);
    expect(RIPPLE_RENDER_ORDER).toBeGreaterThan(SURFACE_RENDER_ORDER);
    expect(RIPPLE_RENDER_ORDER).toBeLessThan(DECOR_RENDER_ORDER);
    expect(RAIN_DROP_RENDER_ORDER).toBeGreaterThan(BUBBLE_RENDER_ORDER);
    expect('#' + (drops.material as LineBasicMaterial).color.getHexString()).toBe(RAIN_DROP_COLOR);
    layer.dispose();
  });

  it('désactivée par défaut : invisible, rien de posé', () => {
    const layer = new RainLayer(WATER);
    layer.setSeed(42);
    layer.update(10);
    expect(layer.isEnabled).toBe(false);
    expect(layer.object.visible).toBe(false);
    expect(layer.dropCount).toBe(0);
    expect(layer.rippleCount).toBe(0);
    layer.dispose();
  });

  it('reprend exactement les gouttes et les ronds de la simulation', () => {
    const layer = new RainLayer(WATER);
    layer.setSeed(42);
    layer.setEnabled(true);
    layer.update(12.34);
    const expected = createRainBuffer();
    fillRain(42, 12.34, WATER, expected);
    expect(layer.object.visible).toBe(true);
    expect(layer.dropCount).toBe(expected.dropCount);
    expect(layer.rippleCount).toBe(expected.rippleCount);
    const { drops, ripples } = lines(layer);
    expect(drops.geometry.drawRange.count).toBe(2 * expected.dropCount);
    // Premier trait : de la goutte vers le haut, à la verticale.
    const d = drops.geometry.getAttribute('position').array;
    expect(d[0]).toBe(Math.fround(expected.drops[0]));
    expect(d[1]).toBe(Math.fround(expected.drops[1]));
    expect(d[3]).toBe(d[0]);
    expect(d[4]).toBeCloseTo(expected.drops[1] + RAIN_STREAK_LENGTH, 5);
    // Ronds : un ou deux cercles par impact, selon le rayon.
    let rings = 0;
    for (let i = 0; i < expected.rippleCount; i++) {
      const outer = rippleRadius(expected.ripples[3 * i + 2]);
      rings += outer > 0 ? 1 : 0;
      rings += outer - RIPPLE_RING_GAP > 0 ? 1 : 0;
    }
    expect(layer.ringCount).toBe(rings);
    expect(ripples.geometry.drawRange.count).toBe(rings * 2 * RIPPLE_SEGMENTS);
    layer.dispose();
  });

  it('premier cercle : centré sur l’impact, au rayon du rond, juste au-dessus de la surface', () => {
    const layer = new RainLayer(WATER);
    layer.setSeed(3);
    layer.setEnabled(true);
    layer.update(20);
    const expected = createRainBuffer();
    fillRain(3, 20, WATER, expected);
    const [x, z, age] = expected.ripples.subarray(0, 3);
    const radius = rippleRadius(age);
    const p = lines(layer).ripples.geometry.getAttribute('position').array;
    // Sommet 0 du cercle : angle 0, donc (x + r, y, z).
    expect(p[0]).toBeCloseTo(x + radius, 5);
    expect(p[1]).toBeCloseTo(WATER.maxY + RIPPLE_LIFT, 5);
    expect(p[2]).toBeCloseTo(z, 5);
    // Tous les sommets du premier cercle à la distance r du centre.
    for (let v = 0; v < 2 * RIPPLE_SEGMENTS; v++) {
      expect(Math.hypot(p[3 * v] - x, p[3 * v + 2] - z)).toBeCloseTo(radius, 5);
    }
    // Couleur : claire dans la première moitié de la vie, puis plus sombre.
    const c = lines(layer).ripples.geometry.getAttribute('color').array;
    const hex = age < RIPPLE_DURATION / 2 ? RIPPLE_YOUNG_COLOR : RIPPLE_OLD_COLOR;
    expect(c[0]).toBeCloseTo(new Color(hex).r, 5);
    layer.dispose();
  });

  it('sans allocation : mêmes tableaux d’une image à l’autre ; coupée, plus rien', () => {
    const layer = new RainLayer(WATER);
    layer.setSeed(7);
    layer.setEnabled(true);
    const { drops, ripples } = lines(layer);
    const arrays = [drops, ripples].map((l) => l.geometry.getAttribute('position').array);
    for (const t of [0, 1, 5.5, 300]) {
      layer.update(t);
    }
    expect([drops, ripples].map((l) => l.geometry.getAttribute('position').array)).toEqual(arrays);
    expect(layer.rippleCount).toBeGreaterThan(0);
    layer.setEnabled(false);
    expect(layer.object.visible).toBe(false);
    expect(layer.dropCount).toBe(0);
    expect(drops.geometry.drawRange.count).toBe(0);
    expect(ripples.geometry.drawRange.count).toBe(0);
    layer.dispose();
  });

  it('luminosité : couleurs exactes à 1, assombries la nuit, valeur invalide ignorée', () => {
    const layer = new RainLayer(WATER);
    const { drops, ripples } = lines(layer);
    layer.setBrightness(1);
    expect('#' + (drops.material as LineBasicMaterial).color.getHexString()).toBe(RAIN_DROP_COLOR);
    expect((ripples.material as LineBasicMaterial).color.r).toBe(1);
    layer.setBrightness(0.6);
    expect(layer.brightness).toBe(0.6);
    expect((ripples.material as LineBasicMaterial).color.g).toBeCloseTo(0.6, 12);
    layer.setBrightness(Number.NaN);
    layer.setBrightness(-1);
    expect(layer.brightness).toBe(0.6);
    layer.dispose();
  });
});
