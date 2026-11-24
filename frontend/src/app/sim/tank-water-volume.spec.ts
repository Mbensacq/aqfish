import { describe, expect, it } from 'vitest';

import type { DecorItem } from './decor';
import { environmentById, environmentWater } from './environment';
import type { BoxObstacle } from './obstacles';
import {
  boxObstaclesLiters,
  CORAL_FILL_RATIO,
  decorItemLiters,
  realWaterLiters,
  terrainLiters,
  waterVolumeBreakdown,
} from './tank-water-volume';
import { waterLiters } from './water';
import { createDefaultWorld, createWorld } from './world';

const TROPICAL_WATER = environmentWater('tropical');

const ROCK: DecorItem = { kind: 'rock', x: 0, z: 0, rotation: 0, scale: 1, seed: 7 };

function box(x: number, y: number, z: number, half: number): BoxObstacle {
  return { id: 0, shape: 'box', x, y, z, halfX: half, halfY: half, halfZ: half };
}

describe('volume d’eau réel du bac (#807)', () => {
  it('bac vide sans décor : le volume réel est celui des réglages', () => {
    const world = createWorld(1, [], [], [], 'tropical');

    const volume = waterVolumeBreakdown(world);

    expect(volume.grossLiters).toBe(waterLiters(TROPICAL_WATER));
    expect(volume.decorLiters).toBe(0);
    expect(volume.coralLiters).toBe(0);
    expect(volume.terrainLiters).toBe(0);
    expect(volume.liters).toBe(volume.grossLiters);
  });

  it('le décor par défaut du bac tropical réduit le volume d’eau réel', () => {
    const world = createDefaultWorld(1, 'tropical');

    const volume = waterVolumeBreakdown(world);

    expect(volume.decorLiters).toBeGreaterThan(0);
    expect(volume.liters).toBeCloseTo(volume.grossLiters - volume.decorLiters, 9);
    expect(volume.liters).toBeLessThan(volume.grossLiters);
    expect(realWaterLiters(world)).toBe(volume.liters);
  });

  it('les coraux du récif réduisent le volume d’eau réel', () => {
    const volume = waterVolumeBreakdown(createDefaultWorld(1, 'recif'));

    expect(volume.coralLiters).toBeGreaterThan(0);
    expect(volume.liters).toBeLessThan(volume.grossLiters);
  });

  it('la berge du paludarium est déduite, sans dépasser l’eau du bac', () => {
    const volume = waterVolumeBreakdown(createDefaultWorld(1, 'paludarium'));

    expect(volume.terrainLiters).toBeGreaterThan(0.2 * volume.grossLiters);
    expect(volume.terrainLiters).toBeLessThan(volume.grossLiters);
  });

  it('un sol plat (sans berge) ne retire rien', () => {
    expect(terrainLiters(null, TROPICAL_WATER)).toBe(0);
  });

  it('un rocher retire de l’eau, d’autant plus qu’il est grand', () => {
    const small = decorItemLiters(ROCK, TROPICAL_WATER);
    const large = decorItemLiters({ ...ROCK, scale: 2 }, TROPICAL_WATER);

    expect(small).toBeGreaterThan(0);
    expect(large).toBeGreaterThan(6 * small);
  });

  it('une plante ne retire rien (approximation de jeu)', () => {
    const plant: DecorItem = { ...ROCK, kind: 'plant', form: 'tall' };

    expect(decorItemLiters(plant, TROPICAL_WATER)).toBe(0);
  });

  it('un rocher posé au-dessus de la surface ne retire rien', () => {
    expect(decorItemLiters({ ...ROCK, elevation: 2 }, TROPICAL_WATER)).toBe(0);
  });

  it('une boîte de corail compte pour sa part immergée, pondérée', () => {
    const inside = box(0, 0.2, 0, 0.05);
    const across = box(0, TROPICAL_WATER.maxY, 0, 0.05);
    const outside = box(0, TROPICAL_WATER.maxY + 1, 0, 0.05);

    expect(boxObstaclesLiters([inside], TROPICAL_WATER)).toBeCloseTo(1 * CORAL_FILL_RATIO, 9);
    expect(boxObstaclesLiters([across], TROPICAL_WATER)).toBeCloseTo(0.5 * CORAL_FILL_RATIO, 9);
    expect(boxObstaclesLiters([outside], TROPICAL_WATER)).toBe(0);
  });

  it('le volume réel ne devient jamais négatif', () => {
    const whole = box(0, 0.3, 0, 2);
    const world = { ...createWorld(1, [], [], [], 'tropical'), obstacles: [whole, whole, whole] };

    expect(realWaterLiters(world)).toBe(0);
  });

  it('suit les dimensions réglées du bac', () => {
    const dimensions = { width: 0.6, height: 0.5, depth: 0.3 };
    const world = createWorld(1, [], [], [], { environment: 'tropical', dimensions });

    expect(realWaterLiters(world)).toBe(
      waterLiters(environmentWater({ environment: 'tropical', dimensions })),
    );
    expect(realWaterLiters(world)).toBeLessThan(waterLiters(TROPICAL_WATER));
  });

  it('même bac, même volume (déterministe)', () => {
    const world = createDefaultWorld(3, 'paludarium');

    expect(waterVolumeBreakdown(world)).toEqual(waterVolumeBreakdown(world));
    expect(environmentById('paludarium').terrain).not.toBeNull();
  });
});
