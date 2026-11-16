import { SIM_DT } from './constants';
import {
  clutchSize,
  eatEggsInPlace,
  EGG_HATCH_TIME,
  EGG_MAX_HEIGHT,
  eggRoom,
  hatchesToFry,
  layReefClutch,
  laysEggs,
  laysNearAnemone,
  MAX_EGGS,
  nearestRock,
  REEF_ROCK_REACH,
  REEF_SAND_DISTANCE,
  REEF_SPAWN_TEMPERATURE,
  SPAWN_TICKS,
  type Egg,
  type MutableEgg,
} from './eggs';
import { environmentById, environmentWater } from './environment';
import { isFry } from './fry';
import { parseWorld, serializeWorld } from './save';
import { SPECIES } from './species';
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
  worldFeatures,
  type MutableWorld,
  type World,
} from './world';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

function feedAll(world: MutableWorld): void {
  for (const fish of world.entities as Mutable<Fish>[]) {
    fish.hunger = 0.1;
    fish.health = 1;
  }
}

/** Récif par défaut (clowns et chirurgiens) nourri, au pas qui précède la fin de la période. */
function fedReef(seed = 42): MutableWorld {
  const world = cloneWorld(createDefaultWorld(seed, 'recif'));
  feedAll(world);
  world.tick = SPAWN_TICKS - 1;
  world.time = world.tick * SIM_DT;
  return world;
}

const clownEggs = (world: World): readonly Egg[] =>
  (world.eggs ?? []).filter((egg) => egg.species === 'clown');

describe('œufs du poisson-clown (#653)', () => {
  it('le clown pond près d’une anémone, ses œufs n’éclosent pas en alevins', () => {
    expect(laysEggs('clown')).toBe(true);
    expect(laysNearAnemone('clown')).toBe(true);
    expect(hatchesToFry('clown')).toBe(false);
    expect(laysNearAnemone('corydora')).toBe(false);
    expect(hatchesToFry('corydora')).toBe(true);
    expect(laysEggs('chirurgien')).toBe(false);
  });

  it('un couple de clowns nourris dans le récif pond une ponte en fin de période', () => {
    const world = fedReef();
    const next = step(world);
    const eggs = clownEggs(next);
    // Plafond de l'espèce : œufs compris (`eggRoom`).
    const room = eggRoom(world.entities, [], 'clown');
    expect(room).toBeGreaterThan(0);
    expect(eggs.length).toBe(Math.min(clutchSize(42, 'clown', 0), room));
    expect(next.entities.length).toBe(world.entities.length);
    const water = environmentWater(next);
    for (const egg of eggs) {
      expect(egg.age).toBe(0);
      expect(['rocher', 'sol']).toContain(egg.surface);
      expect(egg.x).toBeGreaterThanOrEqual(water.minX);
      expect(egg.x).toBeLessThanOrEqual(water.maxX);
      expect(egg.z).toBeGreaterThanOrEqual(water.minZ);
      expect(egg.z).toBeLessThanOrEqual(water.maxZ);
      expect(egg.y).toBeGreaterThanOrEqual(water.minY);
      expect(egg.y).toBeLessThanOrEqual(water.minY + EGG_MAX_HEIGHT + 1e-9);
    }
    // Près d'une anémone.
    const { anemones } = worldFeatures(next);
    for (const egg of eggs) {
      const d = Math.min(...anemones.map((a) => Math.hypot(egg.x - a.x, egg.z - a.z)));
      expect(d).toBeLessThan(REEF_ROCK_REACH + 0.1);
    }
  });

  it('une ponte au plus par période : rien au pas suivant ni avant la fin de la suivante', () => {
    const world = fedReef();
    world.tick = SPAWN_TICKS;
    stepEggsInPlace(world, SIM_DT);
    world.tick += 1;
    const first = clownEggs(world).length;
    expect(first).toBeGreaterThan(0);
    for (let k = 0; k < 20; k++) {
      expect(spawnEggsInPlace(world)).toBe(0);
      world.tick += 1;
    }
    world.tick = 2 * SPAWN_TICKS - 1;
    expect(spawnEggsInPlace(world)).toBe(0);
    expect(clownEggs(world).length).toBe(first);
  });

  it('sans couple d’adultes sains ou hors plage d’eau, aucune ponte', () => {
    const none = (mutate: (w: MutableWorld) => void): void => {
      const world = fedReef();
      mutate(world);
      world.tick = SPAWN_TICKS;
      spawnEggsInPlace(world);
      expect(clownEggs(world).length).toBe(0);
    };
    const clowns = (w: MutableWorld): Mutable<Fish>[] =>
      w.entities.filter((f) => f.species === 'clown') as Mutable<Fish>[];
    none((w) => clowns(w).forEach((f) => (f.hunger = 0.6)));
    none((w) => clowns(w).forEach((f) => (f.health = 0.5)));
    none((w) => clowns(w).forEach((f) => (f.ich = 10)));
    // Un seul clown en forme : pas de couple.
    none((w) =>
      clowns(w)
        .slice(1)
        .forEach((f) => (f.health = 0.5)),
    );
    none((w) => (w.water = sampleWater(w.environment, 'a-surveiller')));
    none((w) => (w.water = { ...w.water, ph: 6 }));
    none((w) => (w.water = { ...w.water, temperature: REEF_SPAWN_TEMPERATURE[0] - 0.5 }));
    none((w) => (w.water = { ...w.water, temperature: REEF_SPAWN_TEMPERATURE[1] + 0.5 }));
    // Récif par défaut jamais nourri (faim de départ).
    const raw = cloneWorld(createDefaultWorld(42, 'recif'));
    raw.tick = SPAWN_TICKS - 1;
    expect(clownEggs(step(raw)).length).toBe(0);
  });

  it('absences explicites : décor et anémones nuls, vides ou absents, sans exception', () => {
    const water = environmentWater('recif');
    const anemone = { id: 0, x: 0, z: 0, scale: 1, seed: 1 };
    expect(layReefClutch(42, 'clown', 0, 6, water, [], undefined)).toEqual([]);
    expect(layReefClutch(42, 'clown', 0, 6, water, [], null)).toEqual([]);
    expect(layReefClutch(42, 'clown', 0, 6, water, null, [])).toEqual([]);
    expect(layReefClutch(42, 'clown', 0, 0, water, [], [anemone])).toEqual([]);
    expect(layReefClutch(42, 'clown', 0, -3, water, [], [anemone])).toEqual([]);
    expect(nearestRock(undefined, 0, 0)).toBeNull();
    expect(nearestRock(null, 0, 0)).toBeNull();
    // Zéro rocher : la ponte va sur le sable, au pied de l'anémone.
    for (const decor of [undefined, null, []]) {
      const eggs = layReefClutch(42, 'clown', 0, 6, water, decor, [anemone]);
      expect(eggs.length).toBe(6);
      for (const egg of eggs) {
        expect(egg.surface).toBe('sol');
        expect(Math.hypot(egg.x, egg.z)).toBeLessThan(REEF_SAND_DISTANCE + 0.03);
        expect(egg.y).toBeGreaterThan(water.minY);
      }
    }
    // Zéro anémone dans le monde : aucune ponte, même nourris.
    const world = cloneWorld(createWorld(42, [{ species: 'clown', count: 3 }], [], [], 'tropical'));
    feedAll(world);
    world.tick = SPAWN_TICKS;
    expect(() => spawnEggsInPlace(world)).not.toThrow();
    expect(world.eggs).toBeUndefined();
  });

  it('rocher à portée : ponte collée sur son flanc, dans l’eau', () => {
    const water = environmentWater('recif');
    const rock = environmentById('recif').decor.find((item) => item.kind === 'rock')!;
    const anemone = { id: 0, x: rock.x + 0.15, z: rock.z, scale: 1, seed: 1 };
    expect(nearestRock([rock], anemone.x, anemone.z)).toBe(rock);
    expect(nearestRock([rock], rock.x + REEF_ROCK_REACH + 0.01, rock.z)).toBeNull();
    const eggs = layReefClutch(7, 'clown', 3, 8, water, [rock], [anemone]);
    expect(eggs.length).toBe(8);
    for (const egg of eggs) {
      expect(egg.surface).toBe('rocher');
      expect(egg.y).toBeGreaterThanOrEqual(water.minY);
      expect(egg.y).toBeLessThanOrEqual(water.maxY);
      // Entre le rocher et l'anémone, plus près du rocher.
      expect(Math.hypot(egg.x - rock.x, egg.z - rock.z)).toBeLessThan(0.15);
    }
    // Même graine, même ponte ; autre graine, autre ponte.
    expect(layReefClutch(7, 'clown', 3, 8, water, [rock], [anemone])).toEqual(eggs);
    expect(layReefClutch(8, 'clown', 3, 8, water, [rock], [anemone])).not.toEqual(eggs);
  });

  it('les œufs éclosent à EGG_HATCH_TIME en larves qui quittent le bac (aucun alevin)', () => {
    const world = fedReef();
    const before = world.entities.length;
    world.eggs = [
      { species: 'clown', x: 0, y: 0.03, z: 0, age: EGG_HATCH_TIME - 1.5 * SIM_DT, surface: 'sol' },
    ];
    world.tick = 1;
    stepEggsInPlace(world, SIM_DT);
    expect(clownEggs(world).length).toBe(1);
    stepEggsInPlace(world, SIM_DT);
    expect(world.eggs).toBeUndefined();
    expect(world.entities.length).toBe(before);
    expect(world.entities.some(isFry)).toBe(false);
  });

  it('gardés par le couple : les nageurs ne mangent pas les œufs du rocher ni du sol', () => {
    const fish = cloneWorld(createWorld(1, [{ species: 'clown', count: 1 }], [], [], 'recif'))
      .entities[0];
    const eggs: MutableEgg[] = (['rocher', 'sol'] as const).map((surface) => ({
      species: 'clown',
      x: fish.x,
      y: fish.y,
      z: fish.z,
      age: 0,
      surface,
    }));
    expect(eatEggsInPlace(eggs, [fish])).toBe(0);
    expect(eggs.length).toBe(2);
  });

  it('total borné : plafond de l’espèce et MAX_EGGS sur un long récif nourri', () => {
    const world = fedReef(5);
    let max = 0;
    for (let period = 0; period < 6; period++) {
      for (let k = 0; k < SPAWN_TICKS; k++) {
        if (k % 600 === 0) {
          feedAll(world);
        }
        stepEggsInPlace(world, SIM_DT);
        world.tick += 1;
        const clowns =
          world.entities.filter((f) => f.species === 'clown').length + clownEggs(world).length;
        expect(clowns).toBeLessThanOrEqual(SPECIES.clown.maxPopulation);
        expect((world.eggs ?? []).length).toBeLessThanOrEqual(MAX_EGGS);
        max = Math.max(max, clownEggs(world).length);
      }
    }
    expect(max).toBeGreaterThan(0);
  });

  it('sauvegarde : l’aller-retour conserve les œufs ; un clown ne peut pas être un alevin', () => {
    const world = step(fedReef());
    expect(clownEggs(world).length).toBeGreaterThan(0);
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
      advanceInPlace(copy, 300);
      return serializeWorld(copy);
    };
    expect(later(read.world)).toBe(later(world));
    // Sauvegarde du récif sans œuf : toujours lisible.
    const plain = serializeWorld(createDefaultWorld(42, 'recif'));
    expect(plain.includes('eggs')).toBe(false);
    expect(parseWorld(plain).ok).toBe(true);
    // Surface inconnue refusée ; clown « alevin » refusé.
    const data = JSON.parse(text);
    data.eggs[0].surface = 'corail';
    expect(parseWorld(JSON.stringify(data)).ok).toBe(false);
    const fry = JSON.parse(plain);
    const clown = fry.fish.find((f: { species: string }) => f.species === 'clown');
    clown.growth = 10;
    expect(parseWorld(JSON.stringify(fry)).ok).toBe(false);
  });

  it('œufs d’exemple (`oeufs=1`) au récif : les clowns pondent près d’une anémone', () => {
    const world = cloneWorld(createDefaultWorld(42, 'recif'));
    const room = eggRoom(world.entities, [], 'clown');
    expect(layEggsWorldInPlace(world)).toBe(Math.min(clutchSize(42, 'clown', 0), room));
    expect(clownEggs(world).every((e) => e.surface === 'rocher' || e.surface === 'sol')).toBe(true);
  });

  it('fiche du clown : la ponte est citée avec sa source et sa part d’approximation', () => {
    const notes = speciesSheet('clown').notes.filter((n) => n.text.startsWith('Reproduction'));
    expect(notes.length).toBe(1);
    expect(notes[0].text).toContain('œufs');
    expect(notes[0].text).toContain('approximation de jeu');
    expect(notes[0].status.kind).toBe('source');
  });
});
