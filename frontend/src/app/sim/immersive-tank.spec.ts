import { describe, expect, it } from 'vitest';
import { isDecorMode } from './care-mode';
import {
  IMMERSIVE_DEPTH_MM,
  clampDepthMm,
  createImmersiveWorld,
  defaultDepthMm,
  immersiveLayout,
  immersivePopulation,
  smallSwimmers,
} from './immersive-tank';
import { SPECIES } from './species';
import { IMMERSIVE_LIMITS, TANK_LIMITS } from './tank';
import { advance } from './world';

const screens = [
  { width: 65, height: 140 }, // téléphone en portrait
  { width: 140, height: 65 }, // téléphone en paysage
  { width: 300, height: 190 }, // ordinateur portable
  { width: 600, height: 340 }, // écran de bureau
  { width: 1200, height: 680 }, // grand téléviseur
];

describe('immersive-tank', () => {
  it('vitre aux proportions exactes de l’écran, dans les bornes immersives', () => {
    for (const screen of screens) {
      const layout = immersiveLayout(screen, defaultDepthMm(screen));
      const d = layout.dimensions;
      expect(layout.aspectClamped).toBe(false);
      expect(d.width / d.height).toBeCloseTo(screen.width / screen.height, 9);
      expect(d.width).toBeCloseTo((screen.width / 1000) * layout.scale, 9);
      for (const key of ['width', 'height', 'depth'] as const) {
        expect(d[key]).toBeGreaterThanOrEqual(IMMERSIVE_LIMITS[key].min);
        expect(d[key]).toBeLessThanOrEqual(IMMERSIVE_LIMITS[key].max);
      }
    }
  });

  it('échelle au plus près du réel : 1 dès que l’écran est assez grand', () => {
    expect(immersiveLayout({ width: 600, height: 400 }, 300).scale).toBe(1);
    expect(immersiveLayout({ width: 65, height: 140 }, 40).scale).toBeCloseTo(0.3 / 0.065, 9);
    expect(immersiveLayout({ width: 4000, height: 2000 }, 300).scale).toBeCloseTo(0.5, 9);
  });

  it('proportions extrêmes : bornées et signalées', () => {
    const layout = immersiveLayout({ width: 10, height: 1000 }, 50);
    expect(layout.aspectClamped).toBe(true);
    expect(layout.dimensions.width).toBe(IMMERSIVE_LIMITS.width.min);
  });

  it('refuse un écran vide ou non fini', () => {
    for (const screen of [
      { width: 0, height: 100 },
      { width: 100, height: -1 },
      { width: Number.NaN, height: 100 },
      { width: 100, height: Number.POSITIVE_INFINITY },
    ]) {
      expect(() => immersiveLayout(screen, 50)).toThrow(RangeError);
    }
  });

  it('profondeur : défaut raisonnable, bornée, non finie ramenée au minimum', () => {
    expect(defaultDepthMm({ width: 300, height: 190 })).toBeCloseTo(114, 9);
    expect(defaultDepthMm({ width: 10, height: 10 })).toBe(IMMERSIVE_DEPTH_MM.min);
    expect(clampDepthMm(1e6)).toBe(IMMERSIVE_DEPTH_MM.max);
    expect(clampDepthMm(Number.NaN)).toBe(IMMERSIVE_DEPTH_MM.min);
    const shallow = immersiveLayout({ width: 600, height: 400 }, 20).dimensions.depth;
    const deep = immersiveLayout({ width: 600, height: 400 }, 500).dimensions.depth;
    expect(shallow).toBe(IMMERSIVE_LIMITS.depth.min);
    expect(deep).toBeCloseTo(0.5, 9);
  });

  it('suit le redimensionnement et l’orientation : portrait et paysage échangent les côtés', () => {
    const portrait = immersiveLayout({ width: 65, height: 140 }, 40).dimensions;
    const landscape = immersiveLayout({ width: 140, height: 65 }, 40).dimensions;
    expect(portrait.width).toBeLessThan(portrait.height);
    expect(landscape.width).toBeGreaterThan(landscape.height);
    expect(landscape.width / landscape.height).toBeCloseTo(portrait.height / portrait.width, 9);
  });

  it('plus petites espèces nageuses d’abord, sans marcheur ni amphibien', () => {
    const ids = smallSwimmers();
    expect(ids.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < ids.length; i++) {
      expect(SPECIES[ids[i]].bodyLength).toBeGreaterThanOrEqual(SPECIES[ids[i - 1]].bodyLength);
    }
    for (const id of ids) {
      expect(SPECIES[id].walker).toBeUndefined();
      expect(SPECIES[id].amphibian).toBeUndefined();
    }
    expect(immersivePopulation().map((e) => e.species)).toEqual(ids.slice(0, 3));
  });

  it('monde en mode décor, hors des bornes du bac réglable, qui nage sans sortir du bac', () => {
    for (const screen of screens) {
      const layout = immersiveLayout(screen, defaultDepthMm(screen));
      const world = createImmersiveWorld(345, layout);
      expect(isDecorMode(world)).toBe(true);
      expect(world.decor).toEqual([]);
      expect(world.dimensions).toEqual(layout.dimensions);
      const later = advance(world, 600);
      const { width, height, depth } = layout.dimensions;
      for (const fish of later.entities) {
        for (const v of [fish.x, fish.y, fish.z]) {
          expect(Number.isFinite(v)).toBe(true);
        }
        expect(Math.abs(fish.x)).toBeLessThanOrEqual(width / 2);
        expect(Math.abs(fish.z)).toBeLessThanOrEqual(depth / 2);
        expect(fish.y).toBeGreaterThanOrEqual(0);
        expect(fish.y).toBeLessThanOrEqual(height);
      }
    }
    // Le téléphone en portrait sort bien des bornes du bac réglable.
    expect(immersiveLayout({ width: 65, height: 140 }, 40).dimensions.width).toBeLessThan(
      TANK_LIMITS.width.min,
    );
  });

  it('déterministe : même graine, même monde', () => {
    const layout = immersiveLayout({ width: 300, height: 190 }, 100);
    expect(advance(createImmersiveWorld(7, layout), 120)).toEqual(
      advance(createImmersiveWorld(7, layout), 120),
    );
  });
});
