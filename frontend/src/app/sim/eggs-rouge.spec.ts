import { SIM_DT } from './constants';
import {
  clutchSize,
  eatEggsInPlace,
  EGG_EAT_RADIUS,
  EGG_HATCH_TIME,
  eggRoom,
  GOLDFISH_SPAWN_TEMPERATURE,
  hatchesToFry,
  isEggExposed,
  LILY_EGG_DEPTH,
  LILY_STEM_SPREAD,
  layVegetationClutch,
  laysEggs,
  laysNearAnemone,
  laysOnVegetation,
  MAX_EGGS,
  SPAWN_TICKS,
  spawnTemperature,
  type Egg,
  type MutableEgg,
} from './eggs';
import { environmentById, environmentWater } from './environment';
import type { DecorItem } from './decor';
import { lilyPadLayout } from './lily-pads';
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
  worldLilyPads,
  type MutableWorld,
  type World,
} from './world';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

const POND = environmentById('bassin');

/** Bassin par défaut (koïs) plus quatre poissons rouges, tous nourris, avant la fin de période. */
function fedPond(seed = 42): MutableWorld {
  const world = cloneWorld(
    createWorld(
      seed,
      [...POND.population, { species: 'rouge', count: 4 }],
      [],
      POND.decor,
      'bassin',
    ),
  );
  for (const fish of world.entities as Mutable<Fish>[]) {
    fish.hunger = 0.1;
    fish.health = 1;
  }
  world.tick = SPAWN_TICKS - 1;
  world.time = world.tick * SIM_DT;
  return world;
}

const goldEggs = (world: World): readonly Egg[] =>
  (world.eggs ?? []).filter((egg) => egg.species === 'rouge');

const PLANT: DecorItem = {
  kind: 'plant',
  form: 'tall',
  x: 0.1,
  z: -0.1,
  rotation: 0,
  scale: 1,
  seed: 9,
};

describe('frai du poisson rouge (#675)', () => {
  it('le poisson rouge fraie sur la végétation, dès 15 °C, sans alevin', () => {
    expect(laysEggs('rouge')).toBe(true);
    expect(laysOnVegetation('rouge')).toBe(true);
    expect(laysNearAnemone('rouge')).toBe(false);
    expect(hatchesToFry('rouge')).toBe(false);
    expect(laysOnVegetation('corydora')).toBe(false);
    expect(laysOnVegetation('clown')).toBe(false);
    expect(hatchesToFry('corydora')).toBe(true);
    expect(laysEggs('koi')).toBe(false);
    expect(spawnTemperature('rouge')).toEqual(GOLDFISH_SPAWN_TEMPERATURE);
    expect(GOLDFISH_SPAWN_TEMPERATURE[0]).toBe(15);
    // Le bassin est dans la plage de frai.
    const t = sampleWater('bassin', 'bonne').temperature;
    expect(t).toBeGreaterThanOrEqual(GOLDFISH_SPAWN_TEMPERATURE[0]);
    expect(t).toBeLessThanOrEqual(GOLDFISH_SPAWN_TEMPERATURE[1]);
  });

  it('un groupe nourri au bassin fraie sous les nénuphars en fin de période', () => {
    const world = fedPond();
    const next = step(world);
    const eggs = goldEggs(next);
    const room = eggRoom(world.entities, [], 'rouge');
    expect(room).toBeGreaterThan(0);
    // Des adultes peuvent manger une partie du frai au pas même ? Non : la prédation précède
    // la ponte (`stepEggsInPlace`), la ponte entière est là.
    expect(eggs.length).toBe(Math.min(clutchSize(42, 'rouge', 0), room));
    const water = environmentWater(next);
    const pads = worldLilyPads(next);
    expect(pads.length).toBeGreaterThan(0);
    for (const egg of eggs) {
      expect(egg.surface).toBe('plante');
      expect(egg.age).toBe(0);
      expect(egg.y).toBeLessThanOrEqual(water.maxY - LILY_EGG_DEPTH.min + 1e-9);
      expect(egg.y).toBeGreaterThanOrEqual(water.maxY - LILY_EGG_DEPTH.max - 1e-9);
      // Le long de la tige d'une feuille (à son ancre).
      const under = pads.some(
        (pad) => Math.hypot(egg.x - pad.x, egg.z - pad.z) <= LILY_STEM_SPREAD + 1e-9,
      );
      expect(under).toBe(true);
    }
  });

  it('nénuphars du monde : ceux du rendu (même graine, même eau) ; aucun hors du bassin', () => {
    const world = createDefaultWorld(7, 'bassin');
    expect(worldLilyPads(world)).toEqual(
      lilyPadLayout(7, environmentWater('bassin'), POND.lilyPads),
    );
    expect(worldLilyPads(createDefaultWorld(7, 'tropical'))).toEqual([]);
  });

  it('une ponte au plus par période', () => {
    const world = fedPond();
    world.tick = SPAWN_TICKS;
    stepEggsInPlace(world, SIM_DT);
    const first = goldEggs(world).length;
    expect(first).toBeGreaterThan(0);
    for (let k = 1; k < 20; k++) {
      world.tick = SPAWN_TICKS + k;
      expect(spawnEggsInPlace(world)).toBe(0);
    }
    world.tick = 2 * SPAWN_TICKS - 1;
    expect(spawnEggsInPlace(world)).toBe(0);
    expect(goldEggs(world).length).toBe(first);
  });

  it('sans couple d’adultes sains et nourris, ou hors de la plage de frai, aucune ponte', () => {
    const none = (mutate: (w: MutableWorld) => void): void => {
      const world = fedPond();
      mutate(world);
      world.tick = SPAWN_TICKS;
      spawnEggsInPlace(world);
      expect(goldEggs(world).length).toBe(0);
    };
    const golds = (w: MutableWorld): Mutable<Fish>[] =>
      w.entities.filter((f) => f.species === 'rouge') as Mutable<Fish>[];
    none((w) => golds(w).forEach((f) => (f.hunger = 0.6)));
    none((w) => golds(w).forEach((f) => (f.health = 0.5)));
    none((w) => golds(w).forEach((f) => (f.ich = 10)));
    // Un seul adulte en forme : pas de couple.
    none((w) =>
      golds(w)
        .slice(1)
        .forEach((f) => (f.health = 0.5)),
    );
    none((w) => (w.water = sampleWater(w.environment, 'a-surveiller')));
    none((w) => (w.water = { ...w.water, temperature: GOLDFISH_SPAWN_TEMPERATURE[0] - 0.5 }));
    none((w) => (w.water = { ...w.water, temperature: GOLDFISH_SPAWN_TEMPERATURE[1] + 0.5 }));
    // Les koïs seules ne fraient pas.
    const koi = cloneWorld(createDefaultWorld(42, 'bassin'));
    for (const fish of koi.entities as Mutable<Fish>[]) {
      fish.hunger = 0.1;
    }
    koi.tick = SPAWN_TICKS;
    expect(spawnEggsInPlace(koi)).toBe(0);
    expect(koi.eggs).toBeUndefined();
  });

  it('sans végétation (zéro plante, nénuphars absents ou `undefined`) : pas d’exception, pas de ponte', () => {
    const water = environmentWater('bassin');
    expect(layVegetationClutch(42, 'rouge', 0, 6, water, [], [])).toEqual([]);
    expect(layVegetationClutch(42, 'rouge', 0, 6, water, undefined, undefined)).toEqual([]);
    expect(layVegetationClutch(42, 'rouge', 0, 6, water, null, null)).toEqual([]);
    expect(layVegetationClutch(42, 'rouge', 0, 0, water, [PLANT], [])).toEqual([]);
    expect(layVegetationClutch(42, 'rouge', 0, -3, water, [PLANT], [])).toEqual([]);
    // Bac d'eau froide (17 °C, plantes, pas de nénuphars) avec des poissons rouges : frai au
    // pied des plantes ; même bac sans plante : aucune ponte.
    const withPlants = (decor: readonly DecorItem[]): MutableWorld => {
      const world = cloneWorld(
        createWorld(42, [{ species: 'rouge', count: 3 }], [], decor, 'eaufroide'),
      );
      for (const fish of world.entities as Mutable<Fish>[]) {
        fish.hunger = 0.1;
        fish.health = 1;
      }
      world.tick = SPAWN_TICKS;
      return world;
    };
    const bare = withPlants([]);
    expect(() => spawnEggsInPlace(bare)).not.toThrow();
    expect(bare.eggs).toBeUndefined();
    const planted = withPlants([PLANT]);
    expect(spawnEggsInPlace(planted)).toBeGreaterThan(0);
    for (const egg of goldEggs(planted)) {
      expect(egg.surface).toBe('plante');
      expect(Math.hypot(egg.x - PLANT.x, egg.z - PLANT.z)).toBeLessThanOrEqual(0.025 + 1e-9);
    }
  });

  it('frai déterministe : même graine, mêmes œufs ; autre graine, autres positions', () => {
    const water = environmentWater('bassin');
    const pads = lilyPadLayout(42, water, POND.lilyPads);
    const a = layVegetationClutch(42, 'rouge', 3, 8, water, [], pads);
    expect(layVegetationClutch(42, 'rouge', 3, 8, water, [], pads)).toEqual(a);
    expect(layVegetationClutch(43, 'rouge', 3, 8, water, [], pads)).not.toEqual(a);
    expect(a.length).toBe(8);
  });

  it('les adultes à portée mangent le frai (`EGG_EAT_RADIUS`), pas au-delà', () => {
    const world = fedPond();
    const adult = world.entities.find((f) => f.species === 'koi')!;
    const egg = (dx: number): MutableEgg => ({
      species: 'rouge',
      x: adult.x + dx,
      y: adult.y,
      z: adult.z,
      age: 0,
      surface: 'plante',
    });
    const near = egg(EGG_EAT_RADIUS * 0.5);
    expect(isEggExposed(near)).toBe(true);
    const far = egg(EGG_EAT_RADIUS * 3 + 1);
    const eggs: Egg[] = [near, far];
    // Un seul adulte : les autres sont loin.
    const lone = [adult];
    expect(eatEggsInPlace(eggs, lone)).toBe(1);
    expect(eggs).toEqual([far]);
    // Un œuf de corydora dans une plante reste à l'abri.
    const hidden: Egg = { ...near, species: 'corydora' };
    expect(isEggExposed(hidden)).toBe(false);
    const safe = [hidden];
    expect(eatEggsInPlace(safe, lone)).toBe(0);
  });

  it('les œufs éclosent à `EGG_HATCH_TIME`, sans alevin ; total borné par `MAX_EGGS`', () => {
    const world = fedPond();
    world.tick = SPAWN_TICKS;
    spawnEggsInPlace(world);
    const eggs = goldEggs(world).length;
    expect(eggs).toBeGreaterThan(0);
    const fish = world.entities.length;
    for (const e of world.eggs as MutableEgg[]) {
      e.age = EGG_HATCH_TIME - SIM_DT / 2;
    }
    const before = (world.eggs ?? []).length;
    // Adultes écartés (aucune prédation) pour isoler l'éclosion.
    const saved = world.entities;
    world.entities = [];
    stepEggsInPlace(world, SIM_DT);
    world.entities = saved;
    expect(before).toBe(eggs);
    expect(world.eggs).toBeUndefined();
    expect(world.entities.length).toBe(fish);
    // Plafond du bac : jamais plus de `MAX_EGGS` œufs.
    const full = fedPond();
    full.eggs = Array.from({ length: MAX_EGGS - 2 }, () => cornerEgg(full));
    full.tick = SPAWN_TICKS;
    spawnEggsInPlace(full);
    expect((full.eggs ?? []).length).toBeLessThanOrEqual(MAX_EGGS);
    expect((full.eggs ?? []).length).toBe(MAX_EGGS);
  });

  it('sauvegarde : l’aller-retour conserve le frai ; une sauvegarde sans œufs se charge', () => {
    const world = step(fedPond());
    expect(goldEggs(world).length).toBeGreaterThan(0);
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
    const plain = serializeWorld(createDefaultWorld(42, 'bassin'));
    expect(plain.includes('eggs')).toBe(false);
    expect(parseWorld(plain).ok).toBe(true);
  });

  it('œufs d’exemple (`oeufs=1`) au bassin avec des poissons rouges : frai sous les nénuphars', () => {
    const world = fedPond();
    world.tick = 0;
    world.time = 0;
    const laid = layEggsWorldInPlace(world);
    expect(laid).toBe(Math.min(clutchSize(42, 'rouge', 0), eggRoom(world.entities, [], 'rouge')));
    expect(goldEggs(world).every((egg) => egg.surface === 'plante')).toBe(true);
  });

  it('la fiche cite une source pour le frai', () => {
    const notes = speciesSheet('rouge').notes;
    const frai = notes.find((note) => note.text.startsWith('Reproduction'));
    expect(frai).toBeDefined();
    expect(frai!.status.kind).toBe('source');
    expect(frai!.status.kind === 'source' && frai!.status.reference).toMatch(/fishkeeper/i);
  });
});

/** Un œuf de corydora au coin du bassin, pour remplir le bac sans toucher au plafond du rouge. */
function cornerEgg(target: World): MutableEgg {
  const water = environmentWater(target);
  return {
    species: 'corydora',
    x: water.minX + 0.01,
    y: water.minY + 0.02,
    z: water.minZ + 0.01,
    age: 0,
    surface: 'vitre',
  };
}
