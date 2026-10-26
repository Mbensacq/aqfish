import { SIM_DT } from './constants';
import { eatInPlace, HUNGER_START, PELLET_SATIATION, type FeedingBand } from './feeding';
import type { FoodPellet } from './food';
import { parseWorld, serializeWorld } from './save';
import { AXOLOTL, NEON, SPECIES } from './species';
import { stepFish, swimBounds, type Fish } from './swimmer';
import { waterVolume, type Box3 } from './tank';
import { freshWater } from './water';
import { FRESH_PH } from './water-ph';
import { sampleWater } from './water-quality';
import {
  dullness,
  feedsOnPellets,
  HEALTH_DECAY_RATE,
  HEALTH_FLOOR,
  HEALTH_RECOVERY_RATE,
  HEALTH_SLOWDOWN,
  HEALTH_START,
  healthStress,
  PH_STRESS,
  STARVING_HUNGER,
  stepHealth,
  stepWellbeingInPlace,
  vigor,
} from './wellbeing';
import {
  advance,
  advanceInPlace,
  cloneWorld,
  createDefaultWorld,
  createWorld,
  starveWorld,
  starveWorldInPlace,
  type MutableWorld,
  type World,
} from './world';

type MutableFish = { -readonly [K in keyof Fish]: Fish[K] };

const OPEN_BAND: FeedingBand = { minY: -Infinity, maxY: Infinity };
const OPEN_BOX: Box3 = {
  minX: -Infinity,
  maxX: Infinity,
  minY: -Infinity,
  maxY: Infinity,
  minZ: -Infinity,
  maxZ: Infinity,
};

function steps(seconds: number): number {
  return Math.round(seconds / SIM_DT);
}

function neons(count: number, seed = 42): World {
  return createWorld(seed, [{ species: 'neon', count }]);
}

function healths(world: World): number[] {
  return world.entities.map((fish) => fish.health);
}

describe('stepHealth', () => {
  it('sans cause : remonte de HEALTH_RECOVERY_RATE · dt, jamais au-delà de 1', () => {
    expect(stepHealth(0.5, 0, 10)).toBeCloseTo(0.5 + 10 * HEALTH_RECOVERY_RATE, 12);
    expect(stepHealth(1, 0, 10)).toBe(1);
    expect(stepHealth(0.999, 0, 1e6)).toBe(1);
  });

  it('avec une ou deux causes : baisse proportionnelle, jamais sous le plancher', () => {
    expect(stepHealth(1, 1, 10)).toBeCloseTo(1 - 10 * HEALTH_DECAY_RATE, 12);
    expect(stepHealth(1, 2, 10)).toBeCloseTo(1 - 20 * HEALTH_DECAY_RATE, 12);
    expect(stepHealth(1, 2, 1e9)).toBe(HEALTH_FLOOR);
    expect(stepHealth(HEALTH_FLOOR, 1, SIM_DT)).toBe(HEALTH_FLOOR);
  });

  it('dt nul : santé inchangée (bornée)', () => {
    expect(stepHealth(0.7, 0, 0)).toBe(0.7);
    expect(stepHealth(0.7, 2, 0)).toBe(0.7);
    expect(stepHealth(0, 0, 0)).toBe(HEALTH_FLOOR);
    expect(stepHealth(3, 1, 0)).toBe(1);
  });

  it('valeur non finie : repart de la santé de départ, jamais NaN', () => {
    for (const bad of [Number.NaN, Infinity, -Infinity]) {
      const next = stepHealth(bad, 1, SIM_DT);
      expect(Number.isNaN(next)).toBe(false);
      expect(next).toBeCloseTo(HEALTH_START - SIM_DT * HEALTH_DECAY_RATE, 12);
    }
  });

  it('le regain est plus lent que la perte', () => {
    expect(HEALTH_RECOVERY_RATE).toBeLessThan(HEALTH_DECAY_RATE);
  });
});

describe('healthStress', () => {
  it('faim maximale : une cause ; faim juste en dessous : aucune', () => {
    expect(healthStress(STARVING_HUNGER, NEON, false)).toBe(1);
    expect(healthStress(0.999999, NEON, false)).toBe(0);
    expect(healthStress(0, NEON, false)).toBe(0);
  });

  it('eau mauvaise : une cause de plus, cumulée à la faim', () => {
    expect(healthStress(0, NEON, true)).toBe(1);
    expect(healthStress(1, NEON, true)).toBe(2);
  });

  it('faim non finie : ne compte pas', () => {
    expect(healthStress(Number.NaN, NEON, false)).toBe(0);
  });

  it('espèces qui ne mangent pas les granulés : seule l’eau compte', () => {
    expect(feedsOnPellets(NEON)).toBe(true);
    expect(feedsOnPellets(AXOLOTL)).toBe(false);
    expect(healthStress(1, AXOLOTL, false)).toBe(0);
    expect(healthStress(1, AXOLOTL, true)).toBe(1);
    for (const def of Object.values(SPECIES)) {
      if (def.amphibian !== undefined) {
        expect(healthStress(1, def, false)).toBe(0);
      }
    }
  });
});

describe('vigor et dullness', () => {
  it('à santé pleine : exactement 1 et 0 (nage et couleurs d’avant)', () => {
    expect(vigor(1)).toBe(1);
    expect(dullness(1)).toBe(0);
    expect(Object.is(dullness(1), 0)).toBe(true);
  });

  it('au plancher : ralentissement maximal et ternissement complet', () => {
    expect(vigor(HEALTH_FLOOR)).toBeCloseTo(1 - HEALTH_SLOWDOWN, 12);
    expect(dullness(HEALTH_FLOOR)).toBe(1);
  });

  it('hors bornes : ramené à [plancher, 1] ; non fini : santé pleine', () => {
    expect(dullness(0)).toBe(1);
    expect(dullness(-5)).toBe(1);
    expect(dullness(2)).toBe(0);
    expect(dullness(Number.NaN)).toBe(0);
    expect(vigor(Number.NaN)).toBe(1);
    expect(vigor(-Infinity)).toBe(1);
  });

  it('monotones entre le plancher et 1', () => {
    let previousVigor = 0;
    let previousDull = 2;
    for (let h = HEALTH_FLOOR; h <= 1; h += 0.05) {
      expect(vigor(h)).toBeGreaterThanOrEqual(previousVigor);
      expect(dullness(h)).toBeLessThanOrEqual(previousDull);
      previousVigor = vigor(h);
      previousDull = dullness(h);
    }
  });
});

describe('pH hors plage et santé (#236)', () => {
  it('healthStress : un pH hors de la plage tolérée compte pour une demi-cause', () => {
    expect(healthStress(0.2, NEON, false, true)).toBe(PH_STRESS);
    expect(healthStress(1, NEON, true, true)).toBe(2 + PH_STRESS);
    expect(healthStress(1, AXOLOTL, false, true)).toBe(PH_STRESS);
    expect(healthStress(0.2, NEON, false, false)).toBe(0);
  });

  it('progression lente : seule cause, du plein au plancher en 16 min simulées', () => {
    expect(stepHealth(1, PH_STRESS, 480)).toBeCloseTo(1 - (1 - HEALTH_FLOOR) / 2, 9);
    expect(stepHealth(1, PH_STRESS, 960)).toBeCloseTo(HEALTH_FLOOR, 9);
  });

  it('stepWellbeingInPlace : chaque espèce comparée à sa propre plage', () => {
    const animals = [
      { species: 'neon' as const, hunger: 0.2, health: 1 },
      { species: 'guppy' as const, hunger: 0.2, health: 1 },
    ];
    // pH 6,0 : toléré par le néon (5 à 7,8), pas par le guppy (6,5 à 8,5).
    stepWellbeingInPlace(animals, 10, false, (id) => SPECIES[id], 6);
    expect(animals[0].health).toBe(1);
    expect(animals[1].health).toBeCloseTo(1 - PH_STRESS * HEALTH_DECAY_RATE * 10, 12);
  });

  it('monde : un poisson hors plage perd de la santé, un poisson dans la plage n’en perd pas', () => {
    const base = createWorld(9, [
      { species: 'neon', count: 2 },
      { species: 'guppy', count: 2 },
    ]);
    const acid: World = { ...cloneWorld(base), water: { ...freshWater('tropical'), ph: 6 } };
    const after = advance(acid, steps(30));
    for (const fish of after.entities) {
      expect(fish.hunger).toBeLessThan(1);
      if (fish.species === 'guppy') {
        expect(fish.health).toBeCloseTo(1 - 30 * PH_STRESS * HEALTH_DECAY_RATE, 6);
      } else {
        expect(fish.health).toBe(1);
      }
    }
    expect(healths(advance(base, steps(30)))).toEqual([1, 1, 1, 1]);
  });

  it('bac sans poisson : pH très acide sans effet ni erreur', () => {
    const empty: World = { ...createWorld(3), water: { ...freshWater('tropical'), ph: 4 } };
    const after = advance(empty, steps(10));
    expect(after.entities).toEqual([]);
    expect(after.water.ph).toBe(4);
  });

  it('bacs par défaut : pH de l’eau neuve, santé pleine dans chaque environnement', () => {
    for (const id of ['tropical', 'bassin', 'paludarium', 'recif'] as const) {
      const world = createDefaultWorld(42, id);
      expect(world.water.ph).toBe(FRESH_PH[id]);
      const after = advance(world, steps(60));
      for (const fish of after.entities) {
        if (fish.hunger < 1) {
          expect(fish.health).toBe(1);
        }
      }
    }
  });
});

describe('stepWellbeingInPlace', () => {
  it('met à jour chaque animal sur place, selon son espèce', () => {
    const animals = [
      { species: 'neon' as const, hunger: 1, health: 1 },
      { species: 'neon' as const, hunger: 0.2, health: 0.5 },
      { species: 'axolotl' as const, hunger: 1, health: 1 },
    ];
    const first = animals[0];
    stepWellbeingInPlace(animals, 1, false, (id) => SPECIES[id]);
    expect(animals[0]).toBe(first);
    expect(animals[0].health).toBeCloseTo(1 - HEALTH_DECAY_RATE, 12);
    expect(animals[1].health).toBeCloseTo(0.5 + HEALTH_RECOVERY_RATE, 12);
    expect(animals[2].health).toBe(1);
  });
});

describe('faim et santé dans le monde', () => {
  it('un animal neuf est en pleine santé', () => {
    for (const fish of createDefaultWorld(42).entities) {
      expect(fish.health).toBe(HEALTH_START);
      expect(fish.hunger).toBe(HUNGER_START);
    }
  });

  it('graine 42, 600 pas : animaux nourris en pleine santé, déterministe, sans NaN', () => {
    const a = advance(createDefaultWorld(42), 600);
    const b = advance(createDefaultWorld(42), 600);
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    for (const fish of a.entities) {
      expect(fish.health).toBe(1);
      expect(Number.isNaN(fish.hunger)).toBe(false);
    }
  });

  it('graine 42, 600 pas, affamés : santé au plancher, déterministe, sans NaN', () => {
    const a = advance(starveWorld(createDefaultWorld(42)), 600);
    const b = advance(starveWorld(createDefaultWorld(42)), 600);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    for (const fish of a.entities) {
      expect(Number.isFinite(fish.health)).toBe(true);
      expect(fish.health).toBeGreaterThanOrEqual(HEALTH_FLOOR);
      expect(fish.health).toBeLessThanOrEqual(1);
    }
    expect(healths(a).every((h) => h === HEALTH_FLOOR)).toBe(true);
  });

  it('advanceInPlace : faim et santé mises à jour sur les mêmes objets (aucune allocation)', () => {
    const world = cloneWorld(starveWorld(neons(4)));
    const entities = world.entities;
    const fish = entities[0] as MutableFish;
    fish.hunger = 0;
    advanceInPlace(world, 600);
    expect(world.entities).toBe(entities);
    expect(world.entities[0]).toBe(fish);
    expect(fish.health).toBeGreaterThan(HEALTH_FLOOR);
  });

  it('sans repas, la faim atteint son maximum puis la santé baisse', () => {
    const start = neons(2);
    // Faim de départ 0,5, à 1/180 par seconde : maximale à 90 s.
    const at80 = advance(start, steps(80));
    expect(at80.entities[0].hunger).toBeGreaterThan(HUNGER_START);
    expect(healths(at80)).toEqual([1, 1]);
    const at150 = advance(at80, steps(70));
    for (const fish of at150.entities) {
      expect(fish.hunger).toBe(1);
      expect(fish.health).toBeLessThan(1);
      expect(fish.health).toBeCloseTo(1 - 60 * HEALTH_DECAY_RATE, 2);
    }
    // 8 minutes de plus : la durée d'une descente complète de 1 au plancher (une cause),
    // assez pour l'atteindre d'ici, sans simuler une heure (test trop lent sous couverture).
    const later = advance(at150, steps(480));
    expect(healths(later)).toEqual([HEALTH_FLOOR, HEALTH_FLOOR]);
  });

  it('la faim monte puis redescend après un repas, et la santé remonte ensuite', () => {
    const world: MutableWorld = cloneWorld(starveWorld(neons(1)));
    const fish = world.entities[0] as MutableFish;
    fish.hunger = 0.6;
    const bounds = swimBounds(NEON, waterVolume());
    for (let i = 0; i < steps(10); i++) {
      stepFish(fish, SIM_DT, bounds);
    }
    const hungry = fish.hunger;
    expect(hungry).toBeGreaterThan(0.6);
    const food: FoodPellet[] = [
      {
        id: 0,
        x: fish.x,
        y: fish.y,
        z: fish.z,
        vy: 0,
        age: 0,
        floatY: 0,
        floatTime: 1e9,
        restY: 0,
      },
    ];
    expect(
      eatInPlace(
        [fish],
        food,
        () => OPEN_BAND,
        () => OPEN_BOX,
      ),
    ).toBe(1);
    expect(fish.hunger).toBeCloseTo(hungry - PELLET_SATIATION, 12);
    const healed = advance(world, steps(60));
    expect(healed.entities[0].health).toBeCloseTo(HEALTH_FLOOR + 60 * HEALTH_RECOVERY_RATE, 6);
  });

  it('eau mauvaise : la santé baisse même nourri ; eau saine : elle reste pleine', () => {
    const base = neons(3);
    const dirty: World = { ...cloneWorld(base), water: sampleWater('tropical', 'mauvaise') };
    const after = advance(dirty, steps(30));
    for (const fish of after.entities) {
      expect(fish.hunger).toBeLessThan(1);
      expect(fish.health).toBeCloseTo(1 - 30 * HEALTH_DECAY_RATE, 6);
    }
    expect(healths(advance(base, steps(30)))).toEqual([1, 1, 1]);
  });

  it('santé basse : nage ralentie de vigor, même suite de tirages', () => {
    const healthy = createWorld(5, [{ species: 'neon', count: 1 }]);
    const sick = starveWorld(healthy);
    const a = advance(healthy, 1).entities[0];
    const b = advance(sick, 1).entities[0];
    const moved = (f: Fish) => Math.hypot(f.x - f.px, f.y - f.py, f.z - f.pz);
    expect(moved(b) / moved(a)).toBeCloseTo(vigor(HEALTH_FLOOR), 6);
    expect(b.rng).toBe(a.rng);
    expect(b.speed).toBe(a.speed);
  });

  it('starveWorld ne modifie pas le monde ; en place : mêmes objets', () => {
    const world = neons(2);
    const starved = starveWorld(world);
    expect(healths(world)).toEqual([1, 1]);
    expect(healths(starved)).toEqual([HEALTH_FLOOR, HEALTH_FLOOR]);
    expect(starved.entities.every((f) => f.hunger === STARVING_HUNGER)).toBe(true);
    const owned = cloneWorld(world);
    const first = owned.entities[0];
    starveWorldInPlace(owned);
    expect(owned.entities[0]).toBe(first);
    expect(owned).toEqual(starved);
  });

  it('paludarium : axolotls affamés mais eau saine, santé qui remonte', () => {
    const world = starveWorld(createDefaultWorld(42, 'paludarium'));
    const after = advance(world, steps(60));
    for (const fish of after.entities) {
      if (!feedsOnPellets(SPECIES[fish.species])) {
        expect(fish.health).toBeGreaterThan(HEALTH_FLOOR);
      }
    }
  });
});

describe('sauvegarde de la santé', () => {
  it('écrite et relue au bit près', () => {
    const world = advance(starveWorld(neons(2)), 30);
    const parsed = parseWorld(serializeWorld(world));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(healths(parsed.world)).toEqual(healths(world));
      expect(advance(parsed.world, 120)).toEqual(advance(world, 120));
    }
  });

  it('ancienne sauvegarde sans santé : acceptée, animaux en pleine santé', () => {
    const data = JSON.parse(serializeWorld(advance(neons(2), 30))) as {
      fish: Record<string, unknown>[];
    };
    for (const fish of data.fish) {
      delete fish['health'];
    }
    const parsed = parseWorld(JSON.stringify(data));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(healths(parsed.world)).toEqual([HEALTH_START, HEALTH_START]);
    }
  });

  it.each([
    ['sous le plancher', HEALTH_FLOOR - 0.01],
    ['au-dessus de 1', 1.01],
    ['texte', '1'],
    ['nul', null],
  ])('santé invalide (%s) : refusée', (_, value) => {
    const data = JSON.parse(serializeWorld(neons(1))) as { fish: Record<string, unknown>[] };
    data.fish[0]['health'] = value;
    const parsed = parseWorld(JSON.stringify(data));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error).toContain('health');
    }
  });
});
