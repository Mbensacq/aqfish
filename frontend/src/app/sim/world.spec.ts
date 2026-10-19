import { MAX_CAPTURE_TIME_SECONDS } from '../core/capture/capture-params';
import { MAX_SEED } from '../core/random/prng';
import { SIM_DT } from './constants';
import type { Vec3 } from './flocking';
import { obstacleDistance, sphereObstacle, type Obstacle } from './obstacles';
import { CORYDORA, GUPPY, NEON, SPECIES, type SpeciesId } from './species';
import { swimBounds } from './swimmer';
import { waterVolume } from './tank';
import {
  advance,
  advanceInPlace,
  advanceTo,
  createDefaultWorld,
  createWorld,
  step,
  ticksFor,
  type MutableWorld,
  type World,
} from './world';

describe('createWorld', () => {
  it('crée un monde vide à t = 0 avec la graine donnée', () => {
    expect(createWorld(42)).toEqual({ seed: 42, tick: 0, time: 0, entities: [], obstacles: [] });
  });

  it.each([0, MAX_SEED])('accepte la graine limite %s', (seed) => {
    expect(createWorld(seed).seed).toBe(seed);
  });

  it.each([-1, 0.5, MAX_SEED + 1, Number.NaN])('refuse la graine %s', (seed) => {
    expect(() => createWorld(seed)).toThrow(RangeError);
  });
});

describe('sérialisation', () => {
  it('aller-retour JSON identique, avant et après des pas', () => {
    for (const world of [createWorld(42), advance(createWorld(7), 123)]) {
      const copy = JSON.parse(JSON.stringify(world)) as World;
      expect(copy).toEqual(world);
      expect(JSON.stringify(copy)).toBe(JSON.stringify(world));
    }
  });
});

describe('step', () => {
  it('avance le temps de dt et le compteur de pas de 1', () => {
    const next = step(createWorld(42), SIM_DT);
    expect(next.tick).toBe(1);
    expect(next.time).toBe(SIM_DT);
    expect(next.seed).toBe(42);
    expect(next.entities).toEqual([]);
  });

  it('utilise SIM_DT par défaut', () => {
    expect(step(createWorld(1))).toEqual(step(createWorld(1), SIM_DT));
  });

  it('ne modifie jamais son entrée', () => {
    const world = Object.freeze({ ...createWorld(42), entities: Object.freeze([]) });
    const snapshot = JSON.stringify(world);
    const next = step(world); // lèverait une TypeError en mode strict si world était muté
    expect(JSON.stringify(world)).toBe(snapshot);
    expect(next).not.toBe(world);
    expect(next.entities).not.toBe(world.entities);
  });

  it('est déterministe', () => {
    let a = createWorld(42);
    let b = createWorld(42);
    for (let i = 0; i < 100; i++) {
      a = step(a);
      b = step(b);
    }
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it.each([0, -SIM_DT, Number.NaN, Number.POSITIVE_INFINITY])('refuse dt = %s', (dt) => {
    expect(() => step(createWorld(42), dt)).toThrow(RangeError);
  });
});

describe('advance', () => {
  it('équivaut à n appels de step', () => {
    let stepped = createWorld(3);
    for (let i = 0; i < 37; i++) {
      stepped = step(stepped);
    }
    expect(advance(createWorld(3), 37)).toEqual(stepped);
  });

  it('0 pas : renvoie le monde tel quel', () => {
    const world = createWorld(42);
    expect(advance(world, 0)).toBe(world);
  });

  it('ne modifie pas son entrée', () => {
    const world = createWorld(42);
    advance(world, 10);
    expect(world).toEqual(createWorld(42));
  });

  it.each([-1, 1.5, Number.NaN])('refuse %s pas', (steps) => {
    expect(() => advance(createWorld(42), steps)).toThrow(RangeError);
  });
});

describe('ticksFor / advanceTo (mode capture)', () => {
  it.each([
    [0, 0],
    [SIM_DT, 1],
    [1, 60],
    [30, 1800],
    [0.5 * SIM_DT, 1], // arrondi au plus proche
    [0.49 * SIM_DT, 0],
    [MAX_CAPTURE_TIME_SECONDS, MAX_CAPTURE_TIME_SECONDS * 60],
  ])('temps %s s ⇒ %s pas', (time, ticks) => {
    expect(ticksFor(time)).toBe(ticks);
    expect(advanceTo(createWorld(42), time).tick).toBe(ticks);
  });

  it('atteint le temps demandé à un pas près', () => {
    const world = advanceTo(createWorld(42), 30);
    expect(world.time).toBeCloseTo(30, 9);
  });

  it('ne fait que les pas manquants depuis un monde déjà avancé', () => {
    const halfway = advance(createWorld(42), 30);
    expect(advanceTo(halfway, 1)).toEqual(advanceTo(createWorld(42), 1));
  });

  it('ne revient pas en arrière', () => {
    const world = advance(createWorld(42), 120);
    expect(advanceTo(world, 1)).toBe(world);
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])('refuse le temps %s', (time) => {
    expect(() => ticksFor(time)).toThrow(RangeError);
    expect(() => advanceTo(createWorld(42), time)).toThrow(RangeError);
  });
});

describe('monde peuplé', () => {
  it('createWorld peuple dans l’ordre demandé, identifiants consécutifs', () => {
    const world = createWorld(42, [{ species: 'neon', count: 3 }]);
    expect(world.entities.map((e) => [e.id, e.species])).toEqual([
      [0, 'neon'],
      [1, 'neon'],
      [2, 'neon'],
    ]);
  });

  it('createDefaultWorld : population par défaut de chaque espèce, dans l’ordre de SPECIES', () => {
    const species = createDefaultWorld(42).entities.map((e) => e.species);
    expect(species).toEqual([
      ...Array<string>(NEON.defaultPopulation).fill('neon'),
      ...Array<string>(GUPPY.defaultPopulation).fill('guppy'),
      ...Array<string>(CORYDORA.defaultPopulation).fill('corydora'),
    ]);
  });

  it('les guppys ne changent pas la trajectoire des néons (banc entre congénères seulement)', () => {
    const alone = advance(
      createWorld(42, [{ species: 'neon', count: NEON.defaultPopulation }]),
      600,
    );
    const mixed = advance(createDefaultWorld(42), 600);
    expect(mixed.entities.filter((e) => e.species === 'neon')).toEqual(alone.entities);
  });

  it('guppys : restent dans le volume d’eau et ne se recouvrent pas après 300 s', () => {
    const world = advance(createWorld(5, [{ species: 'guppy', count: 20 }]), 18_000);
    const minDistance = GUPPY.schooling!.minDistance;
    const water = waterVolume();
    for (const a of world.entities) {
      expect(a.x).toBeGreaterThanOrEqual(water.minX);
      expect(a.x).toBeLessThanOrEqual(water.maxX);
      expect(a.y).toBeGreaterThanOrEqual(water.minY);
      expect(a.y).toBeLessThanOrEqual(water.maxY);
      expect(a.z).toBeGreaterThanOrEqual(water.minZ);
      expect(a.z).toBeLessThanOrEqual(water.maxZ);
      for (const b of world.entities) {
        if (a.id < b.id) {
          const d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
          expect(d).toBeGreaterThanOrEqual(minDistance - 1e-9);
        }
      }
    }
  });

  it('effectif nul : monde vide', () => {
    expect(createWorld(42, [{ species: 'neon', count: 0 }]).entities).toEqual([]);
  });

  it.each([-1, 1.5, Number.NaN])('refuse l’effectif %s', (count) => {
    expect(() => createWorld(42, [{ species: 'neon', count }])).toThrow(RangeError);
  });

  it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])(
    'refuse l’espèce « %s » (clé héritée du prototype)',
    (species) => {
      expect(() => createWorld(42, [{ species: species as SpeciesId, count: 1 }])).toThrow(
        RangeError,
      );
    },
  );

  it('refuse une espèce inconnue', () => {
    expect(() => createWorld(42, [{ species: 'requin' as SpeciesId, count: 1 }])).toThrow(
      RangeError,
    );
  });

  it('même graine et même temps ⇒ même monde (positions comprises)', () => {
    const a = advanceTo(createDefaultWorld(42), 20);
    const b = advanceTo(createDefaultWorld(42), 20);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    expect(a.entities[0].x).not.toBe(createDefaultWorld(42).entities[0].x);
  });

  it('advance(n) équivaut à n appels de step', () => {
    let stepped = createDefaultWorld(9);
    for (let i = 0; i < 50; i++) {
      stepped = step(stepped);
    }
    expect(advance(createDefaultWorld(9), 50)).toEqual(stepped);
  });

  it('ajouter un poisson ne change pas l’état initial ni le hasard des autres', () => {
    // Depuis le comportement de banc (#27), les poissons d'une espèce grégaire s'influencent :
    // la trajectoire des autres change donc, par conception. L'indépendance qui reste
    // garantie est celle du hasard (sous-générateur par entité, ADR 0003).
    const few = createWorld(5, [{ species: 'neon', count: 2 }]);
    const many = createWorld(5, [{ species: 'neon', count: 5 }]);
    expect(many.entities.slice(0, 2)).toEqual(few.entities);
  });

  it('les poissons d’un banc s’influencent : en ajouter change la trajectoire des autres', () => {
    const few = advance(createWorld(5, [{ species: 'neon', count: 2 }]), 300);
    const many = advance(createWorld(5, [{ species: 'neon', count: 5 }]), 300);
    expect(many.entities.slice(0, 2)).not.toEqual(few.entities);
  });

  it('step ne modifie pas les poissons de son entrée', () => {
    const world = createDefaultWorld(42);
    const snapshot = JSON.stringify(world);
    step(world);
    expect(JSON.stringify(world)).toBe(snapshot);
  });

  it('10 000 pas : tous les poissons restent dans le volume d’eau, avec la marge', () => {
    const world = advance(createDefaultWorld(1234), 10_000);
    for (const f of world.entities) {
      // Marge de l'espèce du poisson (le corydora, #31, a une marge plus faible que le néon).
      const hard = swimBounds(SPECIES[f.species], waterVolume()).hard;
      expect(f.x).toBeGreaterThanOrEqual(hard.minX);
      expect(f.x).toBeLessThanOrEqual(hard.maxX);
      expect(f.y).toBeGreaterThanOrEqual(hard.minY);
      expect(f.y).toBeLessThanOrEqual(hard.maxY);
      expect(f.z).toBeGreaterThanOrEqual(hard.minZ);
      expect(f.z).toBeLessThanOrEqual(hard.maxZ);
    }
  });

  it('aller-retour JSON identique après des pas', () => {
    const world = advance(createDefaultWorld(3), 777);
    expect(JSON.parse(JSON.stringify(world))).toEqual(world);
  });
});

describe('obstacles', () => {
  const rocks = [sphereObstacle(1, 0.35, 0.15, 0.1, 0.06), sphereObstacle(0, 0, 0.2, 0, 0.08)];

  it('copiés et triés par identifiant, sérialisables en JSON', () => {
    const input = rocks.map((r) => ({ ...r }));
    const world = createWorld(42, [], input);
    expect(world.obstacles.map((o) => o.id)).toEqual([0, 1]);
    expect(world.obstacles[0]).not.toBe(input[1]);
    input[1].x = 99 as never;
    expect(world.obstacles[0].x).toBe(0);
    expect(JSON.parse(JSON.stringify(world))).toEqual(world);
  });

  it('refuse un obstacle invalide ou un identifiant en double', () => {
    const bad = { ...rocks[0], radius: 0 } as Obstacle;
    expect(() => createWorld(42, [], [bad])).toThrow(RangeError);
    const twin = { ...rocks[1], x: -0.3 } as Obstacle;
    expect(() => createWorld(42, [], [rocks[1], twin])).toThrow(/double/);
  });

  it('sans obstacle : monde identique à celui d’avant (liste vide par défaut)', () => {
    expect(createWorld(5, [{ species: 'neon', count: 4 }], [])).toEqual(
      createWorld(5, [{ species: 'neon', count: 4 }]),
    );
  });

  it('step ne modifie pas les obstacles de son entrée', () => {
    const world = createWorld(42, [{ species: 'neon', count: 3 }], rocks);
    const snapshot = JSON.stringify(world.obstacles);
    const next = step(world);
    expect(JSON.stringify(world.obstacles)).toBe(snapshot);
    expect(next.obstacles).toEqual(world.obstacles);
  });

  // Critères de l'issue #28 : 20 poissons, 10 000 pas, bac par défaut avec deux rochers.
  it.each([1, 42, 0xffffffff])(
    'graine %s : 20 poissons sur 10 000 pas, jamais hors du bac, ni contre une paroi, ni dans un rocher, sans demi-tour brusque',
    (seed) => {
      const water = waterVolume();
      const hard = swimBounds(NEON, water).hard;
      const world = createWorld(seed, [{ species: 'neon', count: 20 }], rocks) as MutableWorld;
      const n: Vec3 = { x: 0, y: 0, z: 0 };
      let outside = 0;
      let wallContacts = 0;
      let rockContacts = 0;
      let sharpTurns = 0;
      for (let i = 0; i < 10_000; i++) {
        advanceInPlace(world, 1);
        for (const f of world.entities) {
          if (
            f.x < water.minX ||
            f.x > water.maxX ||
            f.y < water.minY ||
            f.y > water.maxY ||
            f.z < water.minZ ||
            f.z > water.maxZ
          ) {
            outside++;
          }
          // Contact : centre plaqué sur la limite de nage (filet de sécurité sollicité).
          if (
            f.x <= hard.minX ||
            f.x >= hard.maxX ||
            f.y <= hard.minY ||
            f.y >= hard.maxY ||
            f.z <= hard.minZ ||
            f.z >= hard.maxZ
          ) {
            wallContacts++;
          }
          for (const rock of world.obstacles) {
            if (obstacleDistance(rock, f.x, f.y, f.z, n) < NEON.bodyLength / 2) {
              rockContacts++;
            }
          }
          // Demi-tour brusque : caps successifs à plus de 90° (produit scalaire négatif).
          const dot =
            Math.cos(f.pitch) * Math.cos(f.ppitch) * Math.cos(f.yaw - f.pyaw) +
            Math.sin(f.pitch) * Math.sin(f.ppitch);
          if (dot < 0) {
            sharpTurns++;
          }
        }
      }
      expect({ outside, wallContacts, rockContacts, sharpTurns }).toEqual({
        outside: 0,
        wallContacts: 0,
        rockContacts: 0,
        sharpTurns: 0,
      });
    },
  );
});

describe('temps simulé (sans dérive)', () => {
  it('time === tick * SIM_DT exactement après 216 000 pas (1 h)', () => {
    const world = advance(createWorld(42), 216_000);
    expect(world.tick).toBe(216_000);
    expect(world.time).toBe(world.tick * SIM_DT);
    expect(world.time).toBe(3600);
  });

  it('reste exact pas à pas, quel que soit le découpage', () => {
    let world = createWorld(1);
    for (const n of [1, 59, 7, 1000, 3]) {
      world = advance(world, n);
      expect(world.time).toBe(world.tick * SIM_DT);
    }
    expect(step(world).time).toBe((world.tick + 1) * SIM_DT);
  });

  it('un pas libre (dt ≠ SIM_DT) cumule dt', () => {
    expect(step(createWorld(42), 0.5).time).toBe(0.5);
    expect(step(step(createWorld(42), 0.25), 0.5).time).toBe(0.75);
  });
});

describe('advanceInPlace (boucle d’affichage)', () => {
  it('modifie le monde donné, sans le remplacer, comme advance', () => {
    const world = createDefaultWorld(42);
    const entities = world.entities;
    const firstFish = world.entities[0];
    advanceInPlace(world, 37);
    expect(world).toEqual(advance(createDefaultWorld(42), 37));
    // Mêmes objets : aucune copie de l'état.
    expect(world.entities).toBe(entities);
    expect(world.entities[0]).toBe(firstFish);
  });

  it('0 pas : monde inchangé', () => {
    const world = createDefaultWorld(3);
    advanceInPlace(world, 0);
    expect(world).toEqual(createDefaultWorld(3));
  });

  it('enchaîner les appels équivaut à un seul advance', () => {
    const world = createDefaultWorld(9);
    let total = 0;
    for (let i = 0; i < 20; i++) {
      advanceInPlace(world, i % 6);
      total += i % 6;
    }
    expect(world).toEqual(advance(createDefaultWorld(9), total));
  });

  it.each([-1, 1.5, Number.NaN])('refuse %s pas sans toucher au monde', (steps) => {
    const world = createWorld(42);
    expect(() => advanceInPlace(world, steps)).toThrow(RangeError);
    expect(world).toEqual(createWorld(42));
  });
});
