import { SIM_DT } from './constants';
import { decorBaseY, floatingPlantElevation, type DecorItem } from './decor';
import { isDecorEditable } from './decor-edit';
import { SPAWN_TICKS, type Egg } from './eggs';
import { leafSpots } from './eggs-leaf';
import { environmentById, environmentWater } from './environment';
import type { Fish } from './swimmer';
import { SAND_THICKNESS } from './tank';
import { terrainAt, terrainHeightAt } from './terrain';
import { waterSidePlants, type WaterSidePlantSpot } from './water-side-plants';
import { cloneWorld, createWorld, step } from './world';
import type { MutableWorld } from './world-types';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

const PALU = environmentById('paludarium');
const TERRAIN = PALU.terrain!;
const WATER = environmentWater('paludarium');
const DIMS = PALU.dimensions;

const isRooted = (item: DecorItem): boolean => item.kind === 'plant' && item.form !== 'floating';

const spot = (over: Partial<WaterSidePlantSpot> = {}): WaterSidePlantSpot => ({
  form: 'tall',
  x: 0.3,
  z: 0,
  rotation: 0,
  scale: 1,
  seed: 1,
  ...over,
});

/**
 * Paludarium au décor par défaut (sans import), deux tritons nourris et en forme, au dernier
 * pas de la période de ponte `period` (≥ 1).
 */
function fedNewtsAtPeriodEnd(seed: number, period: number): MutableWorld {
  const world = cloneWorld(
    createWorld(seed, [{ species: 'triton', count: 2 }], [], PALU.decor, 'paludarium'),
  );
  for (const fish of world.entities as Mutable<Fish>[]) {
    fish.hunger = 0.1;
    fish.health = 1;
  }
  world.tick = period * SPAWN_TICKS - 1;
  world.time = world.tick * SIM_DT;
  return world;
}

const key = (p: { x: number; y: number; z: number }): string => `${p.x}|${p.y}|${p.z}`;

describe('plantes côté eau du paludarium (#847)', () => {
  it('le décor par défaut du paludarium n’a que des plantes, toutes côté eau', () => {
    expect(PALU.decor.length).toBeGreaterThanOrEqual(3);
    for (const item of PALU.decor) {
      expect(item.kind).toBe('plant');
      expect(terrainAt(item.x, item.z, TERRAIN, WATER).submerged).toBe(true);
    }
  });

  it('au moins une plante enracinée est sur la pente immergée, une autre flotte', () => {
    const onSlope = PALU.decor.filter(
      (item) => isRooted(item) && terrainHeightAt(item.x, item.z, TERRAIN, WATER) > SAND_THICKNESS,
    );
    expect(onSlope.length).toBeGreaterThanOrEqual(1);
    expect(PALU.decor.filter((item) => item.form === 'floating')).toHaveLength(1);
  });

  it('une plante enracinée suit le sol en pente : sa base monte de la hauteur du sol', () => {
    for (const plant of PALU.decor.filter(isRooted)) {
      const rise = terrainHeightAt(plant.x, plant.z, TERRAIN, WATER) - SAND_THICKNESS;
      const onSand: DecorItem = { ...plant, elevation: 0 };
      expect(plant.elevation ?? 0).toBeCloseTo(rise, 6);
      expect(decorBaseY(plant) - decorBaseY(onSand)).toBeCloseTo(rise, 6);
    }
  });

  it('la plante flottante affleure la surface de l’eau', () => {
    const floating = PALU.decor.find((item) => item.form === 'floating')!;
    expect(floating.elevation).toBeGreaterThan(0);
    expect(floating.elevation).toBe(floatingPlantElevation(floating, WATER.maxY));
  });

  it('chaque plante enracinée a des feuilles immergées où pondre', () => {
    for (const plant of PALU.decor.filter(isRooted)) {
      expect(leafSpots(plant, WATER).length).toBeGreaterThan(0);
    }
  });

  it('sur le fond plat, la plante n’a pas d’élévation écrite', () => {
    const [plant] = waterSidePlants([spot({ x: 0.45 })], TERRAIN, WATER, DIMS);
    expect(terrainHeightAt(0.45, 0, TERRAIN, WATER)).toBe(SAND_THICKNESS);
    expect(plant).toEqual({
      kind: 'plant',
      form: 'tall',
      x: 0.45,
      z: 0,
      rotation: 0,
      scale: 1,
      seed: 1,
    });
  });

  it('refuse un emplacement côté terre, en citant la position', () => {
    expect(() => waterSidePlants([spot({ x: -0.3 })], TERRAIN, WATER, DIMS)).toThrow(
      /\(-0\.3, 0\) n'est pas sous l'eau/,
    );
  });

  it('refuse une plante invalide comme un décor chargé', () => {
    expect(() => waterSidePlants([spot({ scale: 99 })], TERRAIN, WATER, DIMS)).toThrow(RangeError);
  });

  it('aucun emplacement : aucun décor', () => {
    expect(waterSidePlants([], TERRAIN, WATER, DIMS)).toEqual([]);
  });

  it('mêmes emplacements, même décor', () => {
    const spots = [spot({ x: 0.2, z: 0.1 }), spot({ form: 'floating', x: 0.4, seed: 5 })];
    expect(waterSidePlants(spots, TERRAIN, WATER, DIMS)).toEqual(
      waterSidePlants(spots, TERRAIN, WATER, DIMS),
    );
  });

  it('le décor du paludarium reste fixe (non éditable)', () => {
    expect(isDecorEditable('paludarium')).toBe(false);
  });
});

describe('ponte du triton sans import de sauvegarde (#847)', () => {
  it.each([42, 7, 1234])(
    'un couple de tritons nourris pond dans les feuilles du paludarium par défaut (graine %i)',
    (seed) => {
      const spots = new Set(PALU.decor.flatMap((plant) => leafSpots(plant, WATER)).map(key));
      const eggs: Egg[] =
        step(fedNewtsAtPeriodEnd(seed, 1)).eggs?.filter((egg) => egg.species === 'triton') ?? [];
      expect(eggs).toHaveLength(1);
      expect(eggs[0]!.surface).toBe('plante');
      expect(spots.has(key(eggs[0]!))).toBe(true);
    },
  );
});
