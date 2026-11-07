import { SIM_DT } from './constants';
import type { DecorItem } from './decor';
import {
  ageEggsInPlace,
  clutchSize,
  EGG_EAT_RADIUS,
  EGG_GLASS_REACH,
  eggReachDistance2,
  EGG_HATCH_TIME,
  EGG_MAX_HEIGHT,
  EGG_MIN_HEIGHT,
  eatEggsInPlace,
  eggRoom,
  isEggAge,
  layClutch,
  laysEggs,
  MAX_CLUTCH,
  MAX_EGGS,
  MIN_CLUTCH,
  SPAWN_TEMPERATURE,
  SPAWN_TICKS,
  spawnIndexAt,
  type Egg,
  type MutableEgg,
} from './eggs';
import { environmentWater } from './environment';
import { isFry } from './fry';
import { MAX_TOTAL_FISH, populationCounts } from './population';
import { parseWorld, serializeWorld } from './save';
import { parseSharedText } from './share-link';
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
  type MutableWorld,
  type World,
} from './world';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

const PLANT: DecorItem = {
  kind: 'plant',
  form: 'tall',
  x: 0.1,
  z: 0,
  rotation: 0,
  scale: 1,
  seed: 6,
};

function feedAll(world: MutableWorld): void {
  for (const fish of world.entities as Mutable<Fish>[]) {
    fish.hunger = 0.1;
    fish.health = 1;
  }
}

/** Bac de corydoras nourris, au pas qui précède la fin de la première période de ponte. */
function fedCorydoras(
  seed: number,
  count = 6,
  decor: readonly DecorItem[] = [PLANT],
): MutableWorld {
  const world = cloneWorld(createWorld(seed, [{ species: 'corydora', count }], [], decor));
  feedAll(world);
  world.tick = SPAWN_TICKS - 1;
  world.time = world.tick * SIM_DT;
  return world;
}

function eggsOf(world: World): readonly Egg[] {
  return world.eggs ?? [];
}

describe('œufs : ponte (sim/eggs.ts, #478)', () => {
  it('le corydoras pond, pas le guppy ni le néon', () => {
    expect(laysEggs('corydora')).toBe(true);
    expect(laysEggs('guppy')).toBe(false);
    expect(laysEggs('neon')).toBe(false);
  });

  it('périodes : seul le dernier pas de chaque période en achève une', () => {
    expect(spawnIndexAt(0)).toBe(-1);
    expect(spawnIndexAt(SPAWN_TICKS - 1)).toBe(-1);
    expect(spawnIndexAt(SPAWN_TICKS)).toBe(0);
    expect(spawnIndexAt(3 * SPAWN_TICKS)).toBe(2);
    expect(spawnIndexAt(1.5)).toBe(-1);
    expect(spawnIndexAt(-SPAWN_TICKS)).toBe(-1);
  });

  it('une ponte compte de MIN_CLUTCH à MAX_CLUTCH œufs, même tirage pour la même graine', () => {
    const sizes = new Set<number>();
    for (let spawn = 0; spawn < 200; spawn++) {
      const n = clutchSize(42, 'corydora', spawn);
      expect(n).toBeGreaterThanOrEqual(MIN_CLUTCH);
      expect(n).toBeLessThanOrEqual(MAX_CLUTCH);
      expect(clutchSize(42, 'corydora', spawn)).toBe(n);
      sizes.add(n);
    }
    expect(sizes.size).toBe(MAX_CLUTCH - MIN_CLUTCH + 1);
  });

  it('des corydoras nourris dans une eau saine pondent en fin de période', () => {
    const world = fedCorydoras(42);
    const next = step(world);
    const eggs = eggsOf(next);
    expect(eggs.length).toBe(clutchSize(42, 'corydora', 0));
    // Les œufs ne sont pas des animaux.
    expect(next.entities.length).toBe(6);
    expect(next.nextFishId).toBe(world.nextFishId);
    const water = environmentWater(next);
    for (const egg of eggs) {
      expect(egg.species).toBe('corydora');
      expect(egg.age).toBe(0);
      expect(egg.x).toBeGreaterThanOrEqual(water.minX);
      expect(egg.x).toBeLessThanOrEqual(water.maxX);
      expect(egg.z).toBeGreaterThanOrEqual(water.minZ);
      expect(egg.z).toBeLessThanOrEqual(water.maxZ);
      expect(egg.y).toBeGreaterThanOrEqual(water.minY + EGG_MIN_HEIGHT - 1e-9);
      expect(egg.y).toBeLessThanOrEqual(water.minY + EGG_MAX_HEIGHT + 1e-9);
    }
  });

  it('surfaces valides : vitre de devant ou de derrière, ou près d’une plante', () => {
    const water = environmentWater('tropical');
    let glass = 0;
    let plant = 0;
    for (let spawn = 0; spawn < 40; spawn++) {
      for (const egg of layClutch(42, 'corydora', spawn, MAX_CLUTCH, water, [PLANT])) {
        if (egg.surface === 'vitre') {
          glass += 1;
          const toGlass = Math.min(egg.z - water.minZ, water.maxZ - egg.z);
          expect(toGlass).toBeLessThan(0.01);
        } else {
          plant += 1;
          expect(Math.hypot(egg.x - PLANT.x, egg.z - PLANT.z)).toBeLessThanOrEqual(0.0251);
        }
      }
    }
    expect(glass).toBeGreaterThan(0);
    expect(plant).toBeGreaterThan(0);
  });

  it('bac sans plante : tous les œufs sur la vitre', () => {
    const next = step(fedCorydoras(42, 6, []));
    expect(eggsOf(next).length).toBeGreaterThan(0);
    expect(eggsOf(next).every((egg) => egg.surface === 'vitre')).toBe(true);
  });

  it('un bac très petit garde les œufs dans l’eau', () => {
    const tiny = { minX: -0.01, maxX: 0.01, minY: 0, maxY: 0.01, minZ: -0.01, maxZ: 0.01 };
    for (const egg of layClutch(3, 'corydora', 0, MAX_CLUTCH, tiny, [])) {
      expect(egg.x).toBeGreaterThanOrEqual(tiny.minX);
      expect(egg.x).toBeLessThanOrEqual(tiny.maxX);
      expect(egg.y).toBeGreaterThanOrEqual(tiny.minY);
      expect(egg.y).toBeLessThanOrEqual(tiny.maxY);
    }
    expect(layClutch(3, 'corydora', 0, 0, tiny, [])).toEqual([]);
  });

  it('même graine, même ponte ; autre graine, autre ponte', () => {
    const a = serializeWorld(step(fedCorydoras(7)));
    expect(serializeWorld(step(fedCorydoras(7)))).toBe(a);
    expect(serializeWorld(step(fedCorydoras(8)))).not.toBe(a);
  });

  it('aucune ponte hors fin de période, ni sans nourriture, santé, eau saine, pH ou température', () => {
    const notYet = fedCorydoras(42);
    notYet.tick = SPAWN_TICKS - 2;
    expect(step(notYet).eggs).toBeUndefined();

    const hungry = fedCorydoras(42);
    hungry.entities.forEach((f) => ((f as Mutable<Fish>).hunger = 0.5));
    expect(step(hungry).eggs).toBeUndefined();

    const weak = fedCorydoras(42);
    weak.entities.forEach((f) => ((f as Mutable<Fish>).health = 0.5));
    expect(step(weak).eggs).toBeUndefined();

    const sick = fedCorydoras(42);
    sick.entities.forEach((f) => ((f as Mutable<Fish>).ich = 10));
    expect(step(sick).eggs).toBeUndefined();

    const dirty = fedCorydoras(42);
    dirty.water = sampleWater(dirty.environment, 'a-surveiller');
    expect(step(dirty).eggs).toBeUndefined();

    const acid = fedCorydoras(42);
    acid.water = { ...acid.water, ph: 4 };
    expect(step(acid).eggs).toBeUndefined();

    const cold = fedCorydoras(42);
    cold.water = { ...cold.water, temperature: SPAWN_TEMPERATURE[0] - 0.5 };
    cold.tick = SPAWN_TICKS;
    expect(spawnEggsInPlace(cold)).toBe(0);
    const warm = fedCorydoras(42);
    warm.water = { ...warm.water, temperature: SPAWN_TEMPERATURE[1] + 0.5 };
    warm.tick = SPAWN_TICKS;
    expect(spawnEggsInPlace(warm)).toBe(0);

    const decor = fedCorydoras(42);
    decor.careMode = 'decor';
    expect(step(decor).eggs).toBeUndefined();

    // Un corydoras seul : pas de couple.
    expect(step(fedCorydoras(42, 1)).eggs).toBeUndefined();
  });

  it('un bac par défaut jamais nourri ne pond pas (faim de départ)', () => {
    const world = cloneWorld(createDefaultWorld(42));
    world.tick = SPAWN_TICKS - 1;
    expect(step(world).eggs).toBeUndefined();
    expect(createDefaultWorld(42).eggs).toBeUndefined();
  });

  it('bac plein : œufs et animaux ne dépassent ni le plafond de l’espèce ni celui du bac', () => {
    const max = SPECIES.corydora.maxPopulation;
    expect(step(fedCorydoras(42, max)).eggs).toBeUndefined();

    // Presque plein : la ponte s'arrête au plafond de l'espèce.
    const almost = step(fedCorydoras(42, max - 2));
    expect(eggsOf(almost).length).toBe(2);

    // Bac plein toutes espèces confondues.
    const crowded = cloneWorld(
      createWorld(3, [
        { species: 'corydora', count: 4 },
        { species: 'neon', count: MAX_TOTAL_FISH - 4 },
      ]),
    );
    feedAll(crowded);
    crowded.tick = SPAWN_TICKS;
    expect(spawnEggsInPlace(crowded)).toBe(0);
    expect(eggRoom(crowded.entities, [], 'corydora')).toBe(0);

    // Au plus MAX_EGGS œufs dans le bac.
    const many: Egg[] = Array.from({ length: MAX_EGGS }, () => ({
      species: 'corydora',
      x: 0,
      y: 0.05,
      z: 0,
      age: 0,
      surface: 'plante',
    }));
    expect(eggRoom([], many, 'corydora')).toBe(0);
  });
});

describe('œufs : éclosion et prédation', () => {
  const egg = (over: Partial<Egg> = {}): MutableEgg => ({
    species: 'corydora',
    x: 0,
    y: 0.05,
    z: 0.1,
    age: 0,
    surface: 'vitre',
    ...over,
  });

  it('âge valide : réel dans [0, EGG_HATCH_TIME[', () => {
    expect(isEggAge(0)).toBe(true);
    expect(isEggAge(EGG_HATCH_TIME - 0.01)).toBe(true);
    expect(isEggAge(EGG_HATCH_TIME)).toBe(false);
    expect(isEggAge(-1)).toBe(false);
    expect(isEggAge(Number.NaN)).toBe(false);
    expect(isEggAge('1')).toBe(false);
  });

  it('un œuf éclôt au bout de EGG_HATCH_TIME, pas avant', () => {
    const eggs = [egg({ age: EGG_HATCH_TIME - 2 * SIM_DT }), egg({ age: 1 })];
    const hatched: Egg[] = [];
    expect(ageEggsInPlace(eggs, SIM_DT, hatched, (list, e) => list.push(e))).toBe(0);
    expect(ageEggsInPlace(eggs, SIM_DT, hatched, (list, e) => list.push(e))).toBe(1);
    expect(hatched).toHaveLength(1);
    expect(eggs).toHaveLength(1);
    expect(eggs[0].age).toBeCloseTo(1 + 2 * SIM_DT, 9);
  });

  it('dans le monde, l’œuf éclos devient un alevin de corydoras près de l’œuf', () => {
    const world = cloneWorld(createWorld(5, [{ species: 'corydora', count: 2 }], [], [PLANT]));
    const water = environmentWater(world);
    world.eggs = [
      egg({
        x: PLANT.x,
        z: 0,
        y: water.minY + 0.05,
        age: EGG_HATCH_TIME - SIM_DT / 2,
        surface: 'plante',
      }),
    ];
    stepEggsInPlace(world, SIM_DT);
    expect(world.eggs).toBeUndefined();
    const fry = world.entities.filter(isFry);
    expect(fry).toHaveLength(1);
    expect(fry[0].species).toBe('corydora');
    expect(fry[0].growth).toBe(0);
    expect(fry[0].id).toBe(2);
    expect(world.nextFishId).toBe(3);
    expect(Math.hypot(fry[0].x - PLANT.x, fry[0].z)).toBeLessThan(0.1);
  });

  it('bac plein : l’œuf qui éclôt disparaît sans alevin', () => {
    const max = SPECIES.corydora.maxPopulation;
    const world = cloneWorld(createWorld(5, [{ species: 'corydora', count: max }]));
    world.eggs = [egg({ age: EGG_HATCH_TIME - SIM_DT / 2, surface: 'plante' })];
    stepEggsInPlace(world, SIM_DT);
    expect(world.eggs).toBeUndefined();
    expect(world.entities.length).toBe(max);
  });

  it('un adulte nageur mange un œuf de la vitre à sa portée, pas celui d’une plante', () => {
    const adult = { ...createWorld(1, [{ species: 'neon', count: 1 }]).entities[0] };
    const near = { ...adult, x: 0, y: 0.05, z: 0.1 + EGG_GLASS_REACH + EGG_EAT_RADIUS * 0.9 };
    const eggs: Egg[] = [egg(), egg({ surface: 'plante' })];
    expect(eatEggsInPlace(eggs, [near])).toBe(1);
    expect(eggs.map((e) => e.surface)).toEqual(['plante']);
    // Trop loin, ou alevin : rien.
    const far = { ...adult, x: 0, y: 0.05, z: 0.1 + EGG_GLASS_REACH + EGG_EAT_RADIUS * 1.1 };
    const aside = { ...adult, x: EGG_EAT_RADIUS * 1.1, y: 0.05, z: 0.1 };
    const young = { ...near, growth: 100 };
    const again: Egg[] = [egg()];
    expect(eatEggsInPlace(again, [far, aside, young])).toBe(0);
    expect(again).toHaveLength(1);
  });

  it('portée vers la vitre : l’écart en profondeur est diminué de EGG_GLASS_REACH', () => {
    const e = egg();
    expect(eggReachDistance2({ x: 0, y: 0.05, z: 0.1 }, e)).toBe(0);
    expect(eggReachDistance2({ x: 0, y: 0.05, z: 0.1 - EGG_GLASS_REACH }, e)).toBeCloseTo(0, 12);
    expect(eggReachDistance2({ x: 0, y: 0.05, z: 0.1 - EGG_GLASS_REACH - 0.01 }, e)).toBeCloseTo(
      0.0001,
      12,
    );
    expect(eggReachDistance2({ x: 0.03, y: 0.09, z: 0.1 }, e)).toBeCloseTo(0.0025, 12);
  });

  it('20 000 pas d’un bac par défaut nourri : œufs mangés en partie, éclosions, population tenue', () => {
    const world = cloneWorld(createDefaultWorld(42));
    world.tick = SPAWN_TICKS - 1;
    world.time = world.tick * SIM_DT;
    const adults = world.entities.length;
    const startCorydoras = populationCounts(world).corydora;
    let laid = 0;
    let maxEggs = 0;
    let previous = 0;
    let lost = 0;
    for (let n = 0; n < 20_000; n += 100) {
      feedAll(world);
      for (let k = 0; k < 100; k++) {
        const before = eggsOf(world).length;
        const fryBefore = world.entities.filter(isFry).length;
        advanceInPlace(world, 1);
        const after = eggsOf(world).length;
        const hatchedNow = world.entities.filter(isFry).length - fryBefore;
        if (after > before && world.tick % SPAWN_TICKS === 0) {
          laid += after - before;
        } else if (after < before) {
          lost += before - after - Math.max(0, hatchedNow);
        }
        maxEggs = Math.max(maxEggs, after);
      }
      previous = eggsOf(world).length;
    }
    expect(previous).toBe(0);
    expect(laid).toBeGreaterThan(0);
    expect(maxEggs).toBeLessThanOrEqual(MAX_EGGS);
    const fry = world.entities.filter((f) => isFry(f) && f.species === 'corydora');
    // Une part mangée, une part éclose.
    expect(lost).toBeGreaterThan(0);
    expect(fry.length).toBeGreaterThan(0);
    expect(lost + fry.length).toBeLessThanOrEqual(laid);
    // Aucun adulte perdu, plafonds tenus.
    expect(world.entities.filter((f) => !isFry(f)).length).toBe(adults);
    expect(populationCounts(world).corydora).toBeGreaterThanOrEqual(startCorydoras);
    expect(populationCounts(world).corydora).toBeLessThanOrEqual(SPECIES.corydora.maxPopulation);
    expect(world.entities.length).toBeLessThanOrEqual(MAX_TOTAL_FISH);
  }, 60_000);
});

describe('œufs : sauvegarde, export et partage', () => {
  it('l’aller-retour conserve les œufs et leur avenir', () => {
    const world = step(fedCorydoras(42));
    expect(eggsOf(world).length).toBeGreaterThan(0);
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
      advanceInPlace(copy, 600);
      return serializeWorld(copy);
    };
    expect(later(read.world)).toBe(later(world));

    const shared = parseSharedText(text);
    expect(shared.ok).toBe(true);
    expect(shared.ok && eggsOf(shared.world).length).toBe(eggsOf(world).length);
  });

  it('un alevin de corydoras éclos se relit', () => {
    const world = cloneWorld(createWorld(5, [{ species: 'corydora', count: 2 }]));
    world.eggs = [
      {
        species: 'corydora',
        x: 0,
        y: 0.05,
        z: 0,
        age: EGG_HATCH_TIME - SIM_DT / 2,
        surface: 'plante',
      },
    ];
    stepEggsInPlace(world, SIM_DT);
    const read = parseWorld(serializeWorld(world));
    expect(read.ok && read.world.entities.filter(isFry).length).toBe(1);
  });

  it('une sauvegarde sans œuf n’écrit pas le champ et se relit sans œuf', () => {
    const text = serializeWorld(createWorld(42, [{ species: 'corydora', count: 4 }]));
    expect(text.includes('eggs')).toBe(false);
    const read = parseWorld(text);
    expect(read.ok && read.world.eggs).toBeUndefined();
  });

  it('refuse un œuf invalide', () => {
    const data = JSON.parse(serializeWorld(step(fedCorydoras(42))));
    const bad = (mutate: (egg: Record<string, unknown>) => void): boolean => {
      const copy = structuredClone(data);
      mutate(copy.eggs[0]);
      return parseWorld(JSON.stringify(copy)).ok;
    };
    expect(bad(() => undefined)).toBe(true);
    expect(bad((e) => (e['age'] = EGG_HATCH_TIME))).toBe(false);
    expect(bad((e) => (e['age'] = 'a'))).toBe(false);
    expect(bad((e) => (e['species'] = 'neon'))).toBe(false);
    expect(bad((e) => (e['species'] = 'toString'))).toBe(false);
    expect(bad((e) => (e['surface'] = 'sable'))).toBe(false);
    expect(bad((e) => (e['y'] = 99))).toBe(false);
    expect(bad((e) => (e['x'] = 'a'))).toBe(false);
    const notList = structuredClone(data);
    notList.eggs = {};
    expect(parseWorld(JSON.stringify(notList)).ok).toBe(false);
    const tooMany = structuredClone(data);
    tooMany.eggs = Array.from({ length: MAX_EGGS + 1 }, () => data.eggs[0]);
    expect(parseWorld(JSON.stringify(tooMany)).ok).toBe(false);
    const notRecord = structuredClone(data);
    notRecord.eggs = [1];
    expect(parseWorld(JSON.stringify(notRecord)).ok).toBe(false);
  });
});

describe('œufs d’exemple (`oeufs=1`)', () => {
  it('les corydoras du bac par défaut pondent à t = 0, âges étalés', () => {
    const world = cloneWorld(createDefaultWorld(42));
    const laid = layEggsWorldInPlace(world);
    expect(laid).toBe(clutchSize(42, 'corydora', 0));
    const ages = eggsOf(world).map((e) => e.age);
    expect(new Set(ages).size).toBe(ages.length);
    expect(Math.max(...ages)).toBeLessThan(EGG_HATCH_TIME);
    const again = cloneWorld(createDefaultWorld(42));
    layEggsWorldInPlace(again);
    expect(again.eggs).toEqual(world.eggs);
  });

  it('sans corydoras, aucun œuf', () => {
    const world = cloneWorld(createWorld(1, [{ species: 'neon', count: 3 }]));
    expect(layEggsWorldInPlace(world)).toBe(0);
    expect(world.eggs).toBeUndefined();
  });
});

describe('fiche du corydoras', () => {
  it('explique la ponte (approximation de jeu)', () => {
    const notes = speciesSheet('corydora').notes;
    const line = notes.find((n) => n.text.startsWith('Reproduction'));
    expect(line).toBeDefined();
    expect(line!.status.kind).toBe('approximation');
    expect(line!.text).toContain('œufs');
  });
});
