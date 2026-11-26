import { SIM_DT } from './constants';
import type { DecorItem } from './decor';
import {
  clutchSize,
  eatEggsInPlace,
  EGG_HATCH_TIME,
  eggRoom,
  hatchesToFry,
  isEggExposed,
  LEAF_CLUTCH,
  laysEggs,
  laysInLeaves,
  laysNearAnemone,
  laysOnVegetation,
  MAX_EGGS,
  NEWT_SPAWN_TEMPERATURE,
  SPAWN_TICKS,
  spawnTemperature,
  type Egg,
  type MutableEgg,
} from './eggs';
import { layLeafClutch, leafSpots } from './eggs-leaf';
import { environmentWater } from './environment';
import { parseWorld, serializeWorld } from './save';
import { speciesSheet } from './species-sheet';
import type { Fish } from './swimmer';
import { sampleWater } from './water-quality';
import {
  advanceInPlace,
  cloneWorld,
  createDefaultWorld,
  createWorld,
  layEggsWorldInPlace,
  spawnEggsInPlace,
  step,
  stepEggsInPlace,
} from './world';
import type { MutableWorld, World } from './world-types';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

const WATER = environmentWater('paludarium');

/** Plante à tige côté eau du paludarium (moitié +X). */
const PLANT: DecorItem = {
  kind: 'plant',
  form: 'tall',
  x: 0.3,
  z: 0,
  rotation: 0,
  scale: 1,
  seed: 9,
};
const TUFT: DecorItem = { ...PLANT, form: 'tuft', x: 0.38, z: 0.12, seed: 4 };
const FLOATING: DecorItem = { ...PLANT, form: 'floating', x: 0.25, z: -0.1, seed: 5 };

/** Paludarium avec `count` tritons nourris et en forme, plantes `decor`, avant la fin de période. */
function fedNewts(decor: readonly DecorItem[] = [PLANT], count = 2, seed = 42): MutableWorld {
  const world = cloneWorld(
    createWorld(seed, [{ species: 'triton', count }], [], decor, 'paludarium'),
  );
  for (const fish of world.entities as Mutable<Fish>[]) {
    fish.hunger = 0.1;
    fish.health = 1;
  }
  world.tick = SPAWN_TICKS - 1;
  world.time = world.tick * SIM_DT;
  return world;
}

const newtEggs = (world: World): readonly Egg[] =>
  (world.eggs ?? []).filter((egg) => egg.species === 'triton');

const key = (egg: Egg): string => `${egg.x}|${egg.y}|${egg.z}`;

describe('ponte du triton (#676)', () => {
  it('le triton pond dans les feuilles, de 15 à 23 °C, sans larve simulée', () => {
    expect(laysEggs('triton')).toBe(true);
    expect(laysInLeaves('triton')).toBe(true);
    expect(laysOnVegetation('triton')).toBe(false);
    expect(laysNearAnemone('triton')).toBe(false);
    expect(hatchesToFry('triton')).toBe(false);
    expect(laysInLeaves('corydora')).toBe(false);
    expect(laysInLeaves('rouge')).toBe(false);
    expect(laysEggs('grenouille')).toBe(false);
    expect(spawnTemperature('triton')).toEqual(NEWT_SPAWN_TEMPERATURE);
    expect(NEWT_SPAWN_TEMPERATURE).toEqual([15, 23]);
    const t = sampleWater('paludarium', 'bonne').temperature;
    expect(t).toBeGreaterThanOrEqual(NEWT_SPAWN_TEMPERATURE[0]);
    expect(t).toBeLessThanOrEqual(NEWT_SPAWN_TEMPERATURE[1]);
  });

  it('une ponte compte un seul œuf (un à un) ; celle des autres espèces ne change pas', () => {
    for (let spawn = 0; spawn < 50; spawn++) {
      expect(clutchSize(42, 'triton', spawn)).toBe(LEAF_CLUTCH);
      expect(clutchSize(42, 'corydora', spawn)).toBeGreaterThanOrEqual(4);
    }
    expect(LEAF_CLUTCH).toBe(1);
  });

  it('un couple nourri pond, en fin de période, des œufs isolés sur des feuilles immergées', () => {
    const world = fedNewts();
    const next = step(world);
    const eggs = newtEggs(next);
    const room = eggRoom(world.entities, [], 'triton');
    expect(room).toBeGreaterThan(0);
    expect(eggs.length).toBe(Math.min(clutchSize(42, 'triton', 0), room));
    const spots = leafSpots(PLANT, WATER).map((s) => `${s.x}|${s.y}|${s.z}`);
    expect(spots.length).toBeGreaterThan(0);
    for (const egg of eggs) {
      expect(egg.surface).toBe('plante');
      expect(egg.age).toBe(0);
      expect(spots).toContain(key(egg));
      expect(egg.y).toBeLessThan(WATER.maxY);
      expect(egg.y).toBeGreaterThan(WATER.minY);
    }
    // Un œuf par feuille.
    expect(new Set(eggs.map(key)).size).toBe(eggs.length);
    // Repliés dans la feuille : à l'abri des adultes.
    for (const egg of eggs) {
      expect(isEggExposed(egg)).toBe(false);
    }
    const copy = [...eggs];
    expect(eatEggsInPlace(copy, next.entities)).toBe(0);
  });

  it('une ponte au plus par période', () => {
    const world = fedNewts();
    world.tick = SPAWN_TICKS;
    stepEggsInPlace(world, SIM_DT);
    const first = newtEggs(world).length;
    expect(first).toBeGreaterThan(0);
    for (let k = 1; k < 20; k++) {
      world.tick = SPAWN_TICKS + k;
      expect(spawnEggsInPlace(world)).toBe(0);
    }
    world.tick = 2 * SPAWN_TICKS - 1;
    expect(spawnEggsInPlace(world)).toBe(0);
    expect(newtEggs(world).length).toBe(first);
  });

  it('sans couple d’adultes sains et nourris, sans plante ou hors de la plage, aucune ponte', () => {
    const none = (mutate: (w: MutableWorld) => void, decor?: readonly DecorItem[]): void => {
      const world = fedNewts(decor);
      mutate(world);
      world.tick = SPAWN_TICKS;
      expect(() => spawnEggsInPlace(world)).not.toThrow();
      expect(newtEggs(world).length).toBe(0);
    };
    const newts = (w: MutableWorld): Mutable<Fish>[] => w.entities as Mutable<Fish>[];
    none((w) => newts(w).forEach((f) => (f.hunger = 0.6)));
    none((w) => newts(w).forEach((f) => (f.health = 0.5)));
    none((w) => newts(w).forEach((f) => (f.ich = 10)));
    none((w) => (newts(w)[1]!.health = 0.5));
    none((w) => (w.water = sampleWater(w.environment, 'a-surveiller')));
    none((w) => (w.water = { ...w.water, temperature: NEWT_SPAWN_TEMPERATURE[0] - 0.5 }));
    none((w) => (w.water = { ...w.water, temperature: NEWT_SPAWN_TEMPERATURE[1] + 0.5 }));
    // Zéro plante, ou plante flottante seule : aucune feuille où pondre.
    none(() => undefined, []);
    none(() => undefined, [FLOATING]);
    // Un seul triton : pas de couple.
    const lone = fedNewts([PLANT], 1);
    lone.tick = SPAWN_TICKS;
    expect(spawnEggsInPlace(lone)).toBe(0);
    // Paludarium par défaut (sonneurs, sans plante) : rien.
    const frogs = cloneWorld(createDefaultWorld(42, 'paludarium'));
    frogs.tick = SPAWN_TICKS;
    expect(spawnEggsInPlace(frogs)).toBe(0);
    expect(frogs.eggs).toBeUndefined();
  });

  it('cas absents (`undefined`, `null`, zéro plante, zéro œuf) : pas d’exception, pas de ponte', () => {
    const clutch = { seed: 42, species: 'triton' as const, spawn: 0, count: 3 };
    expect(layLeafClutch(clutch, WATER, undefined)).toEqual([]);
    expect(layLeafClutch(clutch, WATER, null)).toEqual([]);
    expect(layLeafClutch(clutch, WATER, [])).toEqual([]);
    expect(layLeafClutch({ ...clutch, count: 0 }, WATER, [PLANT])).toEqual([]);
    expect(layLeafClutch({ ...clutch, count: -2 }, WATER, [PLANT])).toEqual([]);
    expect(leafSpots(FLOATING, WATER)).toEqual([]);
    expect(leafSpots({ ...PLANT, kind: 'rock', form: undefined }, WATER)).toEqual([]);
    // Plante sur la berge émergée (côté −X, hors de l'eau) : aucune feuille immergée.
    const dry = { ...WATER, maxY: WATER.minY };
    expect(leafSpots(PLANT, dry)).toEqual([]);
    expect(layLeafClutch(clutch, dry, [PLANT])).toEqual([]);
  });

  it('jamais deux œufs sur une feuille ; moins de feuilles que d’œufs voulus, moins d’œufs', () => {
    const spots = leafSpots(TUFT, WATER);
    expect(spots.length).toBeGreaterThan(0);
    const many = layLeafClutch(
      { seed: 7, species: 'triton', spawn: 3, count: spots.length + 5 },
      WATER,
      [TUFT],
    );
    expect(many.length).toBe(spots.length);
    expect(new Set(many.map(key)).size).toBe(many.length);
    // Plusieurs plantes : les feuilles de toutes comptent.
    const both = leafSpots(PLANT, WATER).length + spots.length;
    const all = layLeafClutch({ seed: 7, species: 'triton', spawn: 3, count: 400 }, WATER, [
      PLANT,
      TUFT,
      FLOATING,
    ]);
    expect(all.length).toBe(both);
  });

  it('une feuille déjà occupée par un œuf d’une ponte précédente n’en reçoit pas d’autre', () => {
    const spots = leafSpots(TUFT, WATER);
    const clutch = { seed: 7, species: 'triton' as const, spawn: 0, count: spots.length };
    const first = layLeafClutch({ ...clutch, count: 2 }, WATER, [TUFT]);
    const second = layLeafClutch({ ...clutch, spawn: 1 }, WATER, [TUFT], first);
    expect(second.length).toBe(spots.length - 2);
    const keys = new Set([...first, ...second].map(key));
    expect(keys.size).toBe(spots.length);
    // Toutes les feuilles prises : plus rien.
    expect(layLeafClutch(clutch, WATER, [TUFT], [...first, ...second])).toEqual([]);
    // Au paludarium, deux périodes de suite : œufs sur des feuilles distinctes.
    const world = fedNewts();
    world.tick = SPAWN_TICKS;
    spawnEggsInPlace(world);
    world.tick = 2 * SPAWN_TICKS;
    spawnEggsInPlace(world);
    const eggs = newtEggs(world);
    expect(eggs.length).toBe(2);
    expect(new Set(eggs.map(key)).size).toBe(eggs.length);
    // Dix périodes : dix œufs isolés, chacun sur sa feuille.
    for (let k = 3; k <= 10; k++) {
      world.tick = k * SPAWN_TICKS;
      expect(spawnEggsInPlace(world)).toBe(1);
    }
    expect(new Set(newtEggs(world).map(key)).size).toBe(10);
  });

  it('ponte déterministe : même graine, mêmes œufs ; autre graine, autres feuilles', () => {
    const clutch = { seed: 42, species: 'triton' as const, spawn: 5, count: 3 };
    const a = layLeafClutch(clutch, WATER, [PLANT, TUFT]);
    expect(layLeafClutch(clutch, WATER, [PLANT, TUFT])).toEqual(a);
    expect(layLeafClutch({ ...clutch, seed: 43 }, WATER, [PLANT, TUFT])).not.toEqual(a);
    expect(a.length).toBe(3);
  });

  it('éclosion à `EGG_HATCH_TIME`, sans larve ; total borné par `MAX_EGGS`', () => {
    const world = fedNewts();
    world.tick = SPAWN_TICKS;
    spawnEggsInPlace(world);
    expect(newtEggs(world).length).toBeGreaterThan(0);
    const animals = world.entities.length;
    for (const e of world.eggs as MutableEgg[]) {
      e.age = EGG_HATCH_TIME - SIM_DT * 1.5;
    }
    // Hors fin de période : aucune nouvelle ponte pendant l'éclosion.
    world.tick = SPAWN_TICKS + 1;
    stepEggsInPlace(world, SIM_DT);
    expect(newtEggs(world).length).toBeGreaterThan(0);
    stepEggsInPlace(world, SIM_DT);
    expect(world.eggs).toBeUndefined();
    expect(world.entities.length).toBe(animals);
    // Plafond du bac.
    const full = fedNewts();
    full.eggs = Array.from({ length: MAX_EGGS - 1 }, (_, k) => ({
      species: 'triton' as const,
      x: WATER.maxX - 0.01,
      y: WATER.minY + 0.02 + k * 0.001,
      z: 0,
      age: 0,
      surface: 'plante' as const,
    }));
    full.tick = SPAWN_TICKS;
    spawnEggsInPlace(full);
    expect((full.eggs ?? []).length).toBeLessThanOrEqual(MAX_EGGS);
    expect((full.eggs ?? []).length).toBe(MAX_EGGS);
  });

  it('sauvegarde : l’aller-retour conserve les œufs du triton', () => {
    const world = step(fedNewts());
    expect(newtEggs(world).length).toBeGreaterThan(0);
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

  it('œufs d’exemple (`oeufs=1`) au paludarium planté avec deux tritons', () => {
    const world = fedNewts();
    world.tick = 0;
    world.time = 0;
    const laid = layEggsWorldInPlace(world);
    expect(laid).toBe(clutchSize(42, 'triton', 0));
    expect(newtEggs(world).every((egg) => egg.surface === 'plante')).toBe(true);
  });

  it('la fiche cite une source pour la ponte', () => {
    const notes = speciesSheet('triton').notes;
    const ponte = notes.find((note) => note.text.startsWith('Reproduction'));
    expect(ponte).toBeDefined();
    expect(ponte!.status.kind).toBe('source');
    expect(ponte!.status.kind === 'source' && ponte!.status.reference).toMatch(/caudata\.org/);
  });
});
