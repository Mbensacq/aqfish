import { SIM_DT } from './constants';
import type { DecorItem } from './decor';
import {
  BROOD_TICKS,
  broodIndexAt,
  broodSize,
  eatFryInPlace,
  FED_HUNGER,
  FRY_EAT_RADIUS,
  FRY_GROWTH_TIME,
  FRY_HIDE_RADIUS,
  FRY_SAFE_AGE,
  FRY_SCALES,
  FRY_STAGES,
  fryPlants,
  fryScale,
  fryStage,
  fryTarget,
  growFryInPlace,
  hasFry,
  isFemale,
  isFry,
  isFryAge,
  isHidden,
  isPredator,
  MAX_BROOD,
  MIN_BROOD,
  nearestPlant,
} from './fry';
import { MAX_TOTAL_FISH, populationCounts } from './population';
import { parseWorld, serializeWorld } from './save';
import { parseSharedText } from './share-link';
import { sampleWater } from './water-quality';
import type { Fish } from './swimmer';
import { SPECIES } from './species';
import { speciesSheet } from './species-sheet';
import {
  advance,
  birthFryInPlace,
  boundsFor,
  broodWorldInPlace,
  cloneWorld,
  createDefaultWorld,
  createWorld,
  step,
  stepBroodInPlace,
  type MutableWorld,
  type World,
} from './world';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

const PLANT: DecorItem = {
  kind: 'plant',
  form: 'tall',
  x: 0,
  z: 0,
  rotation: 0,
  scale: 1,
  seed: 6,
};

/** Bac de guppys nourris, en pleine santé, au pas qui précède la fin de la première portée. */
function fedGuppies(seed: number, count = 4, decor: readonly DecorItem[] = []): MutableWorld {
  const world = cloneWorld(createWorld(seed, [{ species: 'guppy', count }], [], decor));
  for (const fish of world.entities as Mutable<Fish>[]) {
    fish.hunger = 0.1;
    fish.health = 1;
  }
  world.tick = BROOD_TICKS - 1;
  world.time = world.tick * SIM_DT;
  return world;
}

function fryOf(world: World): Fish[] {
  return world.entities.filter(isFry);
}

function females(world: World): Fish[] {
  return world.entities.filter((f) => !isFry(f) && isFemale(f, world.seed));
}

describe('alevins : naissance (sim/fry.ts, #459)', () => {
  it('le guppy est vivipare, une femelle sur deux (apparence « femelle »)', () => {
    expect(hasFry('guppy')).toBe(true);
    expect(hasFry('neon')).toBe(false);
    expect(isFemale({ id: 0, species: 'guppy' })).toBe(false);
    expect(isFemale({ id: 1, species: 'guppy' })).toBe(true);
    // Espèce sans apparences : jamais « femelle ».
    expect(isFemale({ id: 1, species: 'neon' })).toBe(false);
  });

  it('une portée compte de 2 à 6 alevins, même tirage pour la même graine', () => {
    const seen = new Set<number>();
    for (let mother = 0; mother < 40; mother++) {
      for (let brood = 0; brood < 10; brood++) {
        const n = broodSize(42, mother, brood);
        expect(n).toBeGreaterThanOrEqual(MIN_BROOD);
        expect(n).toBeLessThanOrEqual(MAX_BROOD);
        expect(broodSize(42, mother, brood)).toBe(n);
        seen.add(n);
      }
    }
    // Toutes les tailles possibles finissent par sortir.
    expect([...seen].sort()).toEqual([2, 3, 4, 5, 6]);
    expect([0, 1, 2, 3].map((b) => broodSize(1, 1, b))).not.toEqual(
      [0, 1, 2, 3].map((b) => broodSize(2, 1, b)),
    );
  });

  it('portées : seul le dernier pas de chaque période en achève une', () => {
    expect(broodIndexAt(0)).toBe(-1);
    expect(broodIndexAt(1)).toBe(-1);
    expect(broodIndexAt(BROOD_TICKS - 1)).toBe(-1);
    expect(broodIndexAt(BROOD_TICKS)).toBe(0);
    expect(broodIndexAt(3 * BROOD_TICKS)).toBe(2);
    expect(broodIndexAt(1.5)).toBe(-1);
    expect(broodIndexAt(-BROOD_TICKS)).toBe(-1);
  });

  it('une femelle nourrie, en bonne santé, dans une eau saine met bas en fin de portée', () => {
    const world = fedGuppies(42);
    const mothers = females(world);
    expect(mothers.length).toBe(2);
    const expected = mothers.reduce((n, m) => n + broodSize(42, m.id, 0), 0);
    const next = step(world);
    const fry = fryOf(next);
    expect(fry.length).toBe(expected);
    expect(next.nextFishId).toBe(4 + expected);
    // Identifiants neufs, à la suite, âge 0, près de la mère.
    fry.forEach((f, i) => {
      expect(f.id).toBe(4 + i);
      expect(f.growth).toBe(0);
      expect(f.species).toBe('guppy');
    });
    expect(Math.abs(fry[0].x - mothers[0].x)).toBeLessThan(0.1);
  });

  it('même graine, mêmes naissances ; autre graine, autres naissances', () => {
    const a = serializeWorld(step(fedGuppies(7)));
    expect(serializeWorld(step(fedGuppies(7)))).toBe(a);
    expect(serializeWorld(step(fedGuppies(8)))).not.toBe(a);
  });

  it('aucune naissance hors fin de portée, ni sans nourriture, santé, eau saine ou pH toléré', () => {
    const notYet = fedGuppies(42);
    notYet.tick = BROOD_TICKS - 2;
    expect(fryOf(step(notYet))).toHaveLength(0);

    const hungry = fedGuppies(42);
    hungry.entities.forEach((f) => ((f as Mutable<Fish>).hunger = FED_HUNGER));
    expect(fryOf(step(hungry))).toHaveLength(0);

    const weak = fedGuppies(42);
    weak.entities.forEach((f) => ((f as Mutable<Fish>).health = 0.5));
    expect(fryOf(step(weak))).toHaveLength(0);

    const sick = fedGuppies(42);
    sick.entities.forEach((f) => ((f as Mutable<Fish>).ich = 10));
    expect(fryOf(step(sick))).toHaveLength(0);

    const dirty = fedGuppies(42);
    dirty.water = sampleWater(dirty.environment, 'a-surveiller');
    expect(fryOf(step(dirty))).toHaveLength(0);

    const acid = fedGuppies(42);
    acid.water = { ...acid.water, ph: 4 };
    expect(fryOf(step(acid))).toHaveLength(0);

    const decor = fedGuppies(42);
    decor.careMode = 'decor';
    expect(fryOf(step(decor))).toHaveLength(0);

    // Mâle seul (identifiant 0) : pas de mère.
    expect(fryOf(step(fedGuppies(42, 1)))).toHaveLength(0);
  });

  it('un bac par défaut jamais nourri n’a pas d’alevin (faim de départ)', () => {
    const world = cloneWorld(createDefaultWorld(42));
    world.tick = BROOD_TICKS - 1;
    const next = step(world);
    expect(next.entities.length).toBe(world.entities.length);
    expect(fryOf(next)).toHaveLength(0);
    // Le calcul de la portée sans espèce vivipare ne fait rien.
    const neons = cloneWorld(createWorld(1, [{ species: 'neon', count: 3 }]));
    neons.tick = BROOD_TICKS;
    expect(stepBroodInPlace(neons)).toBe(0);
  });

  it('aucune naissance au-delà du plafond de l’espèce ni de celui du bac', () => {
    const full = fedGuppies(42, SPECIES.guppy.maxPopulation);
    const next = step(full);
    expect(next.entities.length).toBe(SPECIES.guppy.maxPopulation);
    expect(fryOf(next)).toHaveLength(0);

    // Presque plein : les naissances s'arrêtent au plafond de l'espèce.
    const almost = fedGuppies(42, SPECIES.guppy.maxPopulation - 1);
    expect(populationCounts(step(almost)).guppy).toBe(SPECIES.guppy.maxPopulation);

    // Bac plein toutes espèces confondues.
    const crowded = cloneWorld(
      createWorld(3, [
        { species: 'guppy', count: 4 },
        { species: 'neon', count: SPECIES.neon.maxPopulation },
        { species: 'corydora', count: MAX_TOTAL_FISH - 4 - SPECIES.neon.maxPopulation },
      ]),
    );
    expect(crowded.entities.length).toBe(MAX_TOTAL_FISH);
    const mother = females(crowded)[0];
    expect(birthFryInPlace(crowded, mother)).toBeNull();
    expect(crowded.entities.length).toBe(MAX_TOTAL_FISH);
  });
});

describe('alevins : croissance', () => {
  it('quatre jalons, puis adulte', () => {
    const quarter = FRY_GROWTH_TIME / FRY_STAGES;
    expect(fryStage(0)).toBe(0);
    expect(fryStage(-1)).toBe(0);
    expect(fryStage(quarter - 1e-9)).toBe(0);
    expect(fryStage(quarter)).toBe(1);
    expect(fryStage(2 * quarter)).toBe(2);
    expect(fryStage(3 * quarter)).toBe(3);
    expect(fryStage(FRY_GROWTH_TIME)).toBe(FRY_STAGES);
    expect(fryStage(undefined)).toBe(FRY_STAGES);
    expect(fryStage(Number.NaN)).toBe(FRY_STAGES);
    expect([0, 1, 2, 3].map((s) => fryScale(s * quarter))).toEqual(FRY_SCALES);
    expect(fryScale(undefined)).toBe(1);
    // Taille croissante, toujours plus petite que l'adulte.
    for (let s = 1; s < FRY_STAGES; s++) {
      expect(FRY_SCALES[s]).toBeGreaterThan(FRY_SCALES[s - 1]);
    }
    expect(FRY_SCALES.at(-1)).toBeLessThan(1);
  });

  it('âge valide : réel dans [0, FRY_GROWTH_TIME[', () => {
    expect(isFryAge(0)).toBe(true);
    expect(isFryAge(FRY_GROWTH_TIME - 1)).toBe(true);
    expect(isFryAge(FRY_GROWTH_TIME)).toBe(false);
    expect(isFryAge(-1)).toBe(false);
    expect(isFryAge(Number.NaN)).toBe(false);
    expect(isFryAge('3')).toBe(false);
  });

  it('un alevin grandit avec le temps et devient un adulte de l’espèce', () => {
    const fishes = [{ growth: 0 }, { growth: FRY_GROWTH_TIME - 0.5 }, {}] as Mutable<Fish>[];
    expect(growFryInPlace(fishes, 1)).toBe(1);
    expect(fishes[0].growth).toBe(1);
    expect('growth' in fishes[1]).toBe(false);
    expect(fishes[2].growth).toBeUndefined();

    const world = fedGuppies(5);
    const born = step(world);
    const almostAdult = cloneWorld(born);
    const fry = almostAdult.entities.find(isFry) as Mutable<Fish>;
    fry.growth = FRY_GROWTH_TIME - SIM_DT / 2;
    const after = step(almostAdult);
    const grown = after.entities.find((f) => f.id === fry.id)!;
    expect(grown.growth).toBeUndefined();
    expect(isFry(grown)).toBe(false);
    // Les autres alevins ont vieilli d'un pas.
    const other = after.entities.find((f) => isFry(f))!;
    expect(other.growth).toBeCloseTo(SIM_DT, 12);
  });

  it('croissance déterministe : même monde, même avenir', () => {
    const a = step(fedGuppies(11, 4, [PLANT]));
    let x: World = a;
    let y: World = cloneWorld(a);
    for (let i = 0; i < 120; i++) {
      x = step(x);
      y = step(y);
    }
    expect(serializeWorld(x)).toBe(serializeWorld(y));
  });
});

describe('alevins : cachettes et prédation', () => {
  function animal(id: number, species: Fish['species'], x: number, growth?: number): Fish {
    return {
      id,
      kind: 'fish',
      species,
      x,
      y: 0.1,
      z: 0,
      ...(growth === undefined ? {} : { growth }),
    } as Fish;
  }

  it('un adulte mange un alevin hors des plantes', () => {
    const fishes = [
      animal(0, 'neon', 0.5),
      animal(1, 'guppy', 0.5 + FRY_EAT_RADIUS / 2, FRY_SAFE_AGE),
    ];
    expect(eatFryInPlace(fishes, [])).toBe(1);
    expect(fishes.map((f) => f.id)).toEqual([0]);
  });

  it('un nouveau-né n’est pas encore mangé (le temps de gagner les plantes)', () => {
    const fishes = [animal(0, 'neon', 0.5), animal(1, 'guppy', 0.5, FRY_SAFE_AGE - 0.01)];
    expect(eatFryInPlace(fishes, [])).toBe(0);
    expect(fishes).toHaveLength(2);
  });

  it('une plante dans le rayon protège l’alevin', () => {
    const fishes = [
      animal(0, 'neon', 0.5),
      animal(1, 'guppy', 0.5 + FRY_EAT_RADIUS / 2, FRY_SAFE_AGE),
    ];
    const plant = { ...PLANT, x: 0.5 + FRY_HIDE_RADIUS / 2 };
    expect(eatFryInPlace(fishes, [plant])).toBe(0);
    expect(fishes).toHaveLength(2);
    // Plante trop loin : plus de cachette.
    const far = { ...PLANT, x: 0.5 + 3 * FRY_HIDE_RADIUS };
    expect(eatFryInPlace(fishes, [far])).toBe(1);
  });

  it('ni un autre alevin, ni un marcheur ou un amphibien, ni un adulte trop loin ne le mangent', () => {
    const fishes = [
      animal(0, 'guppy', 0.5, 10),
      animal(1, 'axolotl', 0.5),
      animal(2, 'neon', 0.5 + 2 * FRY_EAT_RADIUS),
      animal(3, 'guppy', 0.5, FRY_SAFE_AGE),
    ];
    expect(isPredator(fishes[1])).toBe(false);
    expect(isPredator(fishes[0])).toBe(false);
    expect(isPredator(fishes[2])).toBe(true);
    expect(eatFryInPlace(fishes, [])).toBe(0);
    // Sans alevin, rien à faire.
    expect(eatFryInPlace([animal(0, 'neon', 0), animal(1, 'neon', 0)], [])).toBe(0);
  });

  it('dans le monde : sans plante l’alevin collé à un adulte est mangé, avec une plante il reste', () => {
    for (const [decor, survives] of [
      [[], false],
      [[PLANT], true],
    ] as const) {
      const world = cloneWorld(createWorld(9, [{ species: 'neon', count: 1 }], [], decor));
      const neon = world.entities[0];
      const fry = birthFryInPlace(world, { ...neon, species: 'guppy' })! as Mutable<Fish>;
      fry.x = PLANT.x;
      fry.z = PLANT.z;
      (neon as Mutable<Fish>).x = PLANT.x;
      (neon as Mutable<Fish>).z = PLANT.z;
      fry.y = neon.y;
      fry.growth = FRY_SAFE_AGE;
      const next = step(world);
      expect(next.entities.some(isFry)).toBe(survives);
    }
  });

  it('cachette : plante la plus proche et rayon horizontal', () => {
    const a = { ...PLANT, x: -0.3 };
    const b = { ...PLANT, x: 0.3 };
    expect(nearestPlant([a, b], 0.2, 0)).toBe(b);
    expect(nearestPlant([], 0, 0)).toBeNull();
    expect(isHidden([a], -0.3, FRY_HIDE_RADIUS)).toBe(true);
    expect(isHidden([a], -0.3, FRY_HIDE_RADIUS * 1.01)).toBe(false);
    const rock = { kind: 'rock', x: 0, z: 0, rotation: 0, scale: 1, seed: 1 } as DecorItem;
    expect(fryPlants([rock, a, b])).toEqual([a, b]);
  });

  it('plantes du décor : un seul tableau figé par décor, réutilisé d’un pas à l’autre (#470)', () => {
    const a = { ...PLANT, x: -0.3 };
    const rock = { kind: 'rock', x: 0, z: 0, rotation: 0, scale: 1, seed: 1 } as DecorItem;
    const decor = Object.freeze([rock, a]);
    const plants = fryPlants(decor);
    expect(plants).toEqual([a]);
    expect(Object.isFrozen(plants)).toBe(true);
    expect(fryPlants(decor)).toBe(plants);
    // Un autre tableau de décor (décor modifié) : nouvelles plantes, sans toucher au premier.
    const edited = Object.freeze([a, { ...PLANT, x: 0.3 }]);
    expect(fryPlants(edited)).toHaveLength(2);
    expect(fryPlants(decor)).toBe(plants);
    // Pas en place avec des alevins : le décor du monde garde le même tableau de plantes.
    const world = cloneWorld(createDefaultWorld(42));
    expect(broodWorldInPlace(world)).toBeGreaterThan(0);
    const before = fryPlants(world.decor);
    const next = advance(world, 120);
    const cached = fryPlants(next.decor);
    expect(fryPlants(next.decor)).toBe(cached);
    expect(cached).toEqual(before);
  });

  it('un alevin vise un point près de la plante la plus proche, bas dans l’eau', () => {
    const world = step(fedGuppies(42, 4, [PLANT]));
    const fry = fryOf(world)[0];
    const bounds = boundsFor('guppy', world);
    const out = { x: 0, y: 0, z: 0 };
    const target = fryTarget(fry, [PLANT], 3, bounds, out)!;
    expect(target).toBe(out);
    expect(Math.hypot(target.x - PLANT.x, target.z - PLANT.z)).toBeLessThan(FRY_HIDE_RADIUS);
    expect(target.y).toBeLessThan((bounds.hard.minY + bounds.hard.maxY) / 2);
    expect(fryTarget(fry, [], 3, bounds, out)).toBeNull();
  });

  it('les alevins nagent près des plantes', () => {
    let world: World = step(fedGuppies(42, 4, [PLANT]));
    for (let i = 0; i < 60 * 40; i++) {
      world = step(world);
    }
    const fry = fryOf(world);
    expect(fry.length).toBeGreaterThan(0);
    const near = fry.filter((f) => isHidden([PLANT], f.x, f.z)).length;
    expect(near / fry.length).toBeGreaterThan(0.5);
  }, 30_000);
});

describe('alevins : sauvegarde, export et partage', () => {
  it('l’aller-retour conserve les alevins et leur avenir', () => {
    const world = step(fedGuppies(42, 4, [PLANT]));
    expect(fryOf(world).length).toBeGreaterThan(0);
    const text = serializeWorld(world);
    const read = parseWorld(text);
    expect(read.ok).toBe(true);
    if (!read.ok) {
      return;
    }
    expect(fryOf(read.world).map((f) => [f.id, f.growth])).toEqual(
      fryOf(world).map((f) => [f.id, f.growth]),
    );
    expect(serializeWorld(read.world)).toBe(text);
    expect(serializeWorld(step(read.world))).toBe(serializeWorld(step(world)));

    const shared = parseSharedText(text);
    expect(shared.ok).toBe(true);
    expect(shared.ok && fryOf(shared.world).length).toBe(fryOf(world).length);
  });

  it('une sauvegarde antérieure (sans `growth`) se relit sans alevin', () => {
    const world = createWorld(42, [{ species: 'guppy', count: 4 }]);
    const text = serializeWorld(world);
    expect(text.includes('growth')).toBe(false);
    const read = parseWorld(text);
    expect(read.ok && fryOf(read.world)).toEqual([]);
  });

  it('refuse un âge invalide ou un alevin d’une espèce non vivipare', () => {
    const world = step(fedGuppies(42));
    const data = JSON.parse(serializeWorld(world));
    const fryIndex = data.fish.findIndex((f: { growth?: number }) => f.growth !== undefined);
    data.fish[fryIndex].growth = FRY_GROWTH_TIME;
    expect(parseWorld(JSON.stringify(data)).ok).toBe(false);
    data.fish[fryIndex].growth = 'a';
    expect(parseWorld(JSON.stringify(data)).ok).toBe(false);

    const neons = JSON.parse(serializeWorld(createWorld(1, [{ species: 'neon', count: 1 }])));
    neons.fish[0].growth = 0;
    const refused = parseWorld(JSON.stringify(neons));
    expect(refused.ok).toBe(false);
  });
});

describe('alevins d’exemple (`alevins=1`)', () => {
  it('chaque femelle de guppy met bas, alevins répartis sur les quatre jalons', () => {
    const world = cloneWorld(createDefaultWorld(42));
    const before = world.entities.length;
    const mothers = females(world).filter((f) => f.species === 'guppy');
    const born = broodWorldInPlace(world);
    expect(born).toBe(mothers.reduce((n, m) => n + broodSize(42, m.id, 0), 0));
    expect(world.entities.length).toBe(before + born);
    const stages = new Set(fryOf(world).map((f) => fryStage(f.growth)));
    expect([...stages].sort()).toEqual([0, 1, 2, 3]);
    // Même graine, mêmes alevins.
    const again = cloneWorld(createDefaultWorld(42));
    broodWorldInPlace(again);
    expect(serializeWorld(again)).toBe(serializeWorld(world));
  });

  it('nés à couvert, la plupart sont encore là et cachés après 30 s', () => {
    const world = cloneWorld(createDefaultWorld(42));
    const born = broodWorldInPlace(world);
    let next: World = world;
    for (let i = 0; i < 30 * 60; i++) {
      next = step(next);
    }
    const fry = fryOf(next);
    expect(fry.length).toBeGreaterThanOrEqual(born / 2);
    const plants = fryPlants(next.decor);
    expect(fry.filter((f) => isHidden(plants, f.x, f.z)).length).toBeGreaterThanOrEqual(
      fry.length / 2,
    );
  }, 30_000);

  it('s’arrête au plafond', () => {
    const world = cloneWorld(
      createWorld(42, [{ species: 'guppy', count: SPECIES.guppy.maxPopulation }]),
    );
    expect(broodWorldInPlace(world)).toBe(0);
  });
});

describe('fiche du guppy', () => {
  it('explique la reproduction (approximation de jeu)', () => {
    const notes = speciesSheet('guppy').notes;
    const line = notes.find((n) => n.text.startsWith('Reproduction'));
    expect(line).toBeDefined();
    expect(line!.status.kind).toBe('approximation');
    expect(line!.text).toContain('alevins');
  });
});
