import { SIM_DT } from './constants';
import { DEFAULT_DECOR, rockSpheres, type DecorItem } from './decor';
import {
  clutchSize,
  eatEggsInPlace,
  EGG_HATCH_TIME,
  EGG_SAND_LIFT,
  eggRoom,
  hatchesToFry,
  isEggExposed,
  laysCapsules,
  laysEggs,
  laysInLeaves,
  laysNearAnemone,
  laysOnVegetation,
  MAX_EGGS,
  SPAWN_TEMPERATURE,
  SPAWN_TICKS,
  spawnTemperature,
  type Egg,
  type MutableEgg,
} from './eggs';
import { laySpeciesClutch } from './eggs-clutch';
import { hardSurfaces, layCapsuleClutch } from './eggs-nerite';
import { environmentWater } from './environment';
import { observeJournal, watchJournal } from './journal';
import { parseWorld, serializeWorld } from './save';
import { NERITE_HATCHES_IN_FRESHWATER } from './shrimp-colony';
import { speciesSheet } from './species-sheet';
import type { Fish } from './swimmer';
import { sampleWater } from './water-quality';
import {
  advanceInPlace,
  cloneWorld,
  createWorld,
  layEggsWorldInPlace,
  spawnEggsInPlace,
  step,
  stepEggsInPlace,
} from './world';
import type { MutableWorld, World } from './world-types';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

const WATER = environmentWater('tropical');
const ROCKS = DEFAULT_DECOR.filter((item) => item.kind === 'rock');
const PLANTS = DEFAULT_DECOR.filter((item) => item.kind === 'plant');

/** Bac tropical avec `count` néritines nourries et en forme, décor `decor`, avant la fin de période. */
function fedSnails(
  decor: readonly DecorItem[] = DEFAULT_DECOR,
  count = 2,
  seed = 42,
): MutableWorld {
  const world = cloneWorld(createWorld(seed, [{ species: 'neritine', count }], [], decor));
  for (const fish of world.entities as Mutable<Fish>[]) {
    fish.hunger = 0.1;
    fish.health = 1;
  }
  world.tick = SPAWN_TICKS - 1;
  world.time = world.tick * SIM_DT;
  return world;
}

const capsules = (world: World): readonly Egg[] =>
  (world.eggs ?? []).filter((egg) => egg.species === 'neritine');

/** Distance de `egg` à la surface du rocher le plus proche (négative : dedans). */
function rockGap(egg: Egg, rocks: readonly DecorItem[] = ROCKS): number {
  let best = Infinity;
  for (const rock of rocks) {
    for (const s of rockSpheres(rock)) {
      best = Math.min(best, Math.hypot(egg.x - s.x, egg.y - s.y, egg.z - s.z) - s.radius);
    }
  }
  return best;
}

/** Vrai si `egg` est dans une sphère d'un rocher (enfoui). */
const buried = (egg: Egg): boolean =>
  ROCKS.some((rock) =>
    rockSpheres(rock).some(
      (s) => Math.hypot(egg.x - s.x, egg.y - s.y, egg.z - s.z) < s.radius - 1e-6,
    ),
  );

describe('capsules d’œufs de la néritine (#678)', () => {
  it('la néritine colle des capsules, jamais écloses en eau douce, de 22 à 26 °C', () => {
    expect(laysEggs('neritine')).toBe(true);
    expect(laysCapsules('neritine')).toBe(true);
    expect(laysInLeaves('neritine')).toBe(false);
    expect(laysNearAnemone('neritine')).toBe(false);
    expect(laysOnVegetation('neritine')).toBe(false);
    expect(hatchesToFry('neritine')).toBe(false);
    expect(NERITE_HATCHES_IN_FRESHWATER.value).toBe(false);
    expect(spawnTemperature('neritine')).toEqual(SPAWN_TEMPERATURE);
    for (const species of ['corydora', 'clown', 'rouge', 'triton'] as const) {
      expect(laysCapsules(species)).toBe(false);
    }
    expect(hatchesToFry('corydora')).toBe(true);
  });

  it('un couple nourri colle, en fin de période, ses capsules sur les rochers du décor', () => {
    const world = fedSnails();
    const next = step(world);
    const eggs = capsules(next);
    const room = eggRoom(world.entities, [], 'neritine');
    expect(room).toBeGreaterThan(0);
    expect(eggs.length).toBe(Math.min(clutchSize(42, 'neritine', 0), room));
    for (const egg of eggs) {
      expect(egg.surface).toBe('rocher');
      expect(egg.age).toBe(0);
      // Sur la surface d'un rocher (à quelques millimètres), jamais enfouie.
      expect(Math.abs(rockGap(egg))).toBeLessThan(0.01);
      expect(buried(egg)).toBe(false);
      expect(egg.y).toBeGreaterThanOrEqual(WATER.minY + EGG_SAND_LIFT);
      expect(egg.y).toBeLessThan(WATER.maxY);
      expect(egg.x).toBeGreaterThan(WATER.minX);
      expect(egg.x).toBeLessThan(WATER.maxX);
      expect(egg.z).toBeGreaterThan(WATER.minZ);
      expect(egg.z).toBeLessThan(WATER.maxZ);
    }
    // Dures : à l'abri des adultes.
    expect(eggs.every((egg) => !isEggExposed(egg))).toBe(true);
    const copy = [...eggs];
    expect(eatEggsInPlace(copy, next.entities)).toBe(0);
  });

  it('une ponte au plus par période ; total borné par `MAX_EGGS`', () => {
    const world = fedSnails();
    world.tick = SPAWN_TICKS;
    stepEggsInPlace(world, SIM_DT);
    const first = capsules(world).length;
    expect(first).toBeGreaterThan(0);
    for (let k = 1; k < 20; k++) {
      world.tick = SPAWN_TICKS + k;
      expect(spawnEggsInPlace(world)).toBe(0);
    }
    world.tick = 2 * SPAWN_TICKS - 1;
    expect(spawnEggsInPlace(world)).toBe(0);
    expect(capsules(world).length).toBe(first);
    // Bac presque plein d'œufs : la ponte s'arrête au plafond.
    const full = fedSnails();
    full.eggs = Array.from({ length: MAX_EGGS - 2 }, (_, k) => ({
      species: 'neritine' as const,
      x: 0,
      y: WATER.minY + 0.02 + k * 0.001,
      z: 0,
      age: 0,
      surface: 'rocher' as const,
    }));
    full.tick = SPAWN_TICKS;
    expect(spawnEggsInPlace(full)).toBe(2);
    expect(full.eggs?.length).toBe(MAX_EGGS);
    full.tick = 2 * SPAWN_TICKS;
    expect(spawnEggsInPlace(full)).toBe(0);
  });

  it('sans couple sain et nourri, sans rocher ou hors de la plage, aucune ponte', () => {
    const none = (mutate: (w: MutableWorld) => void, decor?: readonly DecorItem[]): void => {
      const world = fedSnails(decor);
      mutate(world);
      world.tick = SPAWN_TICKS;
      expect(() => spawnEggsInPlace(world)).not.toThrow();
      expect(capsules(world).length).toBe(0);
    };
    const snails = (w: MutableWorld): Mutable<Fish>[] => w.entities as Mutable<Fish>[];
    none((w) => snails(w).forEach((f) => (f.hunger = 0.6)));
    none((w) => snails(w).forEach((f) => (f.health = 0.5)));
    none((w) => (snails(w)[1]!.health = 0.5));
    none((w) => (w.water = sampleWater(w.environment, 'a-surveiller')));
    none((w) => (w.water = { ...w.water, temperature: SPAWN_TEMPERATURE[0] - 0.5 }));
    none((w) => (w.water = { ...w.water, temperature: SPAWN_TEMPERATURE[1] + 0.5 }));
    // Zéro surface dure : décor vide ou plantes seules.
    none(() => undefined, []);
    none(() => undefined, PLANTS);
    const lone = fedSnails(DEFAULT_DECOR, 1);
    lone.tick = SPAWN_TICKS;
    expect(spawnEggsInPlace(lone)).toBe(0);
  });

  it('cas absents (`undefined`, `null`, zéro rocher, zéro capsule) : pas d’exception', () => {
    const clutch = { seed: 42, species: 'neritine' as const, spawn: 0, count: 4 };
    expect(layCapsuleClutch(clutch, WATER, undefined)).toEqual([]);
    expect(layCapsuleClutch(clutch, WATER, null)).toEqual([]);
    expect(layCapsuleClutch(clutch, WATER, [])).toEqual([]);
    expect(layCapsuleClutch(clutch, WATER, PLANTS)).toEqual([]);
    expect(layCapsuleClutch({ ...clutch, count: 0 }, WATER, ROCKS)).toEqual([]);
    expect(layCapsuleClutch({ ...clutch, count: -3 }, WATER, ROCKS)).toEqual([]);
    expect(hardSurfaces(undefined)).toEqual([]);
    expect(hardSurfaces(null)).toEqual([]);
    expect(hardSurfaces(DEFAULT_DECOR)).toEqual(ROCKS);
    // Le répartiteur passe la néritine aux capsules.
    const surfaces = { decor: ROCKS, plants: PLANTS, anemones: undefined, pads: null, laid: [] };
    expect(laySpeciesClutch(clutch, WATER, surfaces)).toEqual(
      layCapsuleClutch(clutch, WATER, ROCKS),
    );
  });

  it('ponte déterministe ; capsules réparties sur les rochers, dans l’eau même au bord du bac', () => {
    const clutch = { seed: 42, species: 'neritine' as const, spawn: 5, count: 10 };
    const a = layCapsuleClutch(clutch, WATER, ROCKS);
    expect(layCapsuleClutch(clutch, WATER, ROCKS)).toEqual(a);
    expect(layCapsuleClutch({ ...clutch, seed: 43 }, WATER, ROCKS)).not.toEqual(a);
    expect(a.length).toBe(10);
    // Isolées : pas deux capsules au même point.
    expect(new Set(a.map((e) => `${e.x}|${e.y}|${e.z}`)).size).toBe(a.length);
    // Rocher collé contre une vitre et dans un coin : capsules ramenées dans l'eau.
    const corner: DecorItem = { ...ROCKS[0]!, x: WATER.maxX - 0.01, z: WATER.maxZ - 0.01 };
    for (let spawn = 0; spawn < 20; spawn++) {
      for (const egg of layCapsuleClutch({ ...clutch, spawn }, WATER, [corner])) {
        expect(egg.x).toBeLessThan(WATER.maxX);
        expect(egg.z).toBeLessThan(WATER.maxZ);
        expect(egg.y).toBeGreaterThanOrEqual(WATER.minY + EGG_SAND_LIFT);
      }
    }
  });

  it('jamais d’éclosion : les capsules s’effacent à `EGG_HATCH_TIME`, sans alevin', () => {
    const world = fedSnails();
    world.tick = SPAWN_TICKS;
    spawnEggsInPlace(world);
    expect(capsules(world).length).toBeGreaterThan(0);
    const animals = world.entities.length;
    for (const e of world.eggs as MutableEgg[]) {
      e.age = EGG_HATCH_TIME - SIM_DT * 1.5;
    }
    world.tick = SPAWN_TICKS + 1;
    stepEggsInPlace(world, SIM_DT);
    expect(capsules(world).length).toBeGreaterThan(0);
    stepEggsInPlace(world, SIM_DT);
    expect(world.eggs).toBeUndefined();
    expect(world.entities.length).toBe(animals);
    expect(world.entities.every((fish) => fish.species === 'neritine')).toBe(true);
  });

  it('le journal signale la ponte', () => {
    const world = fedSnails();
    const watch = watchJournal(world);
    const next = step(world);
    const events = observeJournal(watch, next);
    const ponte = events.find((event) => event.kind === 'ponte');
    expect(ponte).toBeDefined();
    expect(ponte!.detail).toBe('neritine');
    expect(ponte!.count).toBe(capsules(next).length);
  });

  it('sauvegarde : l’aller-retour conserve les capsules', () => {
    const world = step(fedSnails());
    expect(capsules(world).length).toBeGreaterThan(0);
    const text = serializeWorld(world);
    const read = parseWorld(text);
    expect(read.ok).toBe(true);
    if (!read.ok) {
      return;
    }
    expect(read.world.eggs).toEqual(world.eggs);
    expect(serializeWorld(read.world)).toBe(text);
    const later = (w: World): string => {
      const copy = cloneWorld(w);
      advanceInPlace(copy, 200);
      return serializeWorld(copy);
    };
    expect(later(read.world)).toBe(later(world));
  });

  it('œufs d’exemple (`oeufs=1`) : capsules sur les rochers du bac tropical', () => {
    const world = fedSnails();
    world.tick = 0;
    world.time = 0;
    const laid = layEggsWorldInPlace(world);
    expect(laid).toBe(
      Math.min(clutchSize(42, 'neritine', 0), eggRoom(world.entities, [], 'neritine')),
    );
    expect(laid).toBeGreaterThan(0);
    expect(capsules(world).every((egg) => egg.surface === 'rocher')).toBe(true);
  });

  it('la fiche cite une source pour la ponte', () => {
    const ponte = speciesSheet('neritine').notes.find((n) => n.text.startsWith('Reproduction'));
    expect(ponte).toBeDefined();
    expect(ponte!.status.kind).toBe('source');
    expect(ponte!.status.kind === 'source' && ponte!.status.reference).toMatch(/fishkeeper/);
  });
});
