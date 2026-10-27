import { describe, expect, it } from 'vitest';

import { SIM_DT } from './constants';
import {
  createWalker,
  groundHeight,
  stepWalker,
  WADE_ROOM,
  walkerCanStand,
  walkerPhaseAt,
  walkerSpeedGoal,
  WALKER_MODES,
  type WalkerGround,
  type WalkerMode,
} from './axolotl';
import { environmentWater, livesIn, PALUDARIUM, POND, TROPICAL_TANK } from './environment';
import { populationLimit, setPopulation } from './population';
import { parseWorld, serializeWorld } from './save';
import { AXOLOTL, validateSpecies, type SpeciesDefinition } from './species';
import type { Fish } from './swimmer';
import { terrainAt, terrainHeightAt } from './terrain';
import {
  advance,
  advanceInPlace,
  boundsFor,
  cloneWorld,
  createDefaultWorld,
  createWorld,
  type World,
} from './world';

const WALKER = AXOLOTL.walker!;
const WATER = environmentWater('paludarium');
const BOUNDS = boundsFor('axolotl', 'paludarium');
const GROUND: WalkerGround = { water: WATER, terrain: PALUDARIUM.terrain };
const SURFACE = WATER.maxY;

function axolotls(world: World): Fish[] {
  return world.entities.filter((e) => e.species === 'axolotl');
}

/**
 * Paludarium peuplé d'axolotls seulement (identifiants 0 à count − 1) : le monde que ces
 * tests observaient avant l'arrivée des grenouilles (#131), qui ne les influencent pas.
 */
function axolotlWorld(seed: number, count: number): World {
  return createWorld(seed, [{ species: 'axolotl', count }], [], [], 'paludarium');
}

describe('axolotl : espèce du paludarium (#130)', () => {
  it('définition valide, solitaire, qui marche sur le fond', () => {
    expect(validateSpecies(AXOLOTL)).toEqual([]);
    expect(AXOLOTL.schooling).toBeNull();
    expect(AXOLOTL.walker).toBeDefined();
    expect(AXOLOTL.silhouette).toBe('axolotl');
    expect(AXOLOTL.colors.stripe).toBe('#f7b2bd');
  });

  it('déclaré en données pour le paludarium seulement, deux par défaut', () => {
    expect(PALUDARIUM.species).toContain('axolotl');
    expect(PALUDARIUM.population).toContainEqual({ species: 'axolotl', count: 2 });
    expect(livesIn('paludarium', 'axolotl')).toBe(true);
    expect(livesIn('tropical', 'axolotl')).toBe(false);
    expect(livesIn('bassin', 'axolotl')).toBe(false);
    expect(TROPICAL_TANK.species).not.toContain('axolotl');
    expect(POND.species).not.toContain('axolotl');
    const world = createDefaultWorld(42, 'paludarium');
    expect(axolotls(world).map((e) => e.id)).toEqual([0, 1]);
  });

  it('population réglable de 0 à 4 dans le paludarium, nouveaux venus posés dans l’eau', () => {
    const world = createDefaultWorld(42, 'paludarium');
    expect(populationLimit(world, 'axolotl')).toBe(4);
    const four = setPopulation(world, 'axolotl', 9);
    expect(axolotls(four)).toHaveLength(4);
    // Les deux premiers sont inchangés ; les nouveaux ont les identifiants suivants (après
    // ceux des grenouilles, #131).
    expect(axolotls(four).slice(0, 2)).toEqual(axolotls(world));
    expect(axolotls(four).map((e) => e.id)).toEqual([0, 1, world.nextFishId, world.nextFishId + 1]);
    for (const fish of axolotls(four)) {
      expect(walkerCanStand(fish.x, fish.z, AXOLOTL, BOUNDS, GROUND)).toBe(true);
      expect(fish.y).toBeCloseTo(groundHeight(fish.x, fish.z, GROUND) + WALKER.clearance, 12);
    }
    expect(axolotls(setPopulation(four, 'axolotl', 0))).toHaveLength(0);
  });

  it('naissance : même graine, même individu ; graines différentes, positions différentes', () => {
    const a = createWalker(42, 0, 'axolotl', BOUNDS, GROUND);
    expect(createWalker(42, 0, 'axolotl', BOUNDS, GROUND)).toEqual(a);
    const b = createWalker(43, 0, 'axolotl', BOUNDS, GROUND);
    expect([b.x, b.z]).not.toEqual([a.x, a.z]);
    expect(a.speed).toBe(WALKER.walkSpeed);
    expect([a.px, a.py, a.pz]).toEqual([a.x, a.y, a.z]);
  });

  it('naissance sans eau assez profonde : repli sur le point le plus profond, sans lever', () => {
    // Un fond imaginaire trop haut partout : aucun tirage ne convient.
    const shallow: WalkerGround = {
      water: { ...WATER, minY: SURFACE - WALKER.clearance },
      terrain: null,
    };
    const fish = createWalker(7, 0, 'axolotl', BOUNDS, shallow);
    expect(Number.isFinite(fish.x) && Number.isFinite(fish.y) && Number.isFinite(fish.z)).toBe(
      true,
    );
    expect(fish.y).toBeLessThanOrEqual(BOUNDS.hard.maxY);
  });

  it('createWalker refuse une espèce qui nage', () => {
    expect(() => createWalker(1, 0, 'neon', BOUNDS, GROUND)).toThrow(RangeError);
  });

  it('terrainHeightAt donne exactement la hauteur de terrainAt', () => {
    const settings = PALUDARIUM.terrain!;
    for (let i = 0; i <= 40; i++) {
      for (let j = 0; j <= 20; j++) {
        const x = -0.6 + (1.2 * i) / 40;
        const z = -0.3 + (0.6 * j) / 20;
        expect(terrainHeightAt(x, z, settings, WATER)).toBe(
          terrainAt(x, z, settings, WATER).height,
        );
      }
    }
  });
});

describe('axolotl : machine à états (#130)', () => {
  it('fonction pure de la graine, de l’identifiant et du temps', () => {
    for (const time of [0, 5.5, 12, 123.4, 3600]) {
      expect(walkerPhaseAt(WALKER, 42, 1, time)).toEqual(walkerPhaseAt(WALKER, 42, 1, time));
    }
  });

  it('les trois états apparaissent, en proportion des poids, sur de longues durées', () => {
    const counts: Record<WalkerMode, number> = { marche: 0, nage: 0, remontee: 0 };
    const slots = 6000;
    for (let k = 0; k < slots; k++) {
      counts[walkerPhaseAt(WALKER, 42, 0, (k + 0.5) * WALKER.slotDuration).mode] += 1;
    }
    const total = WALKER.weights.marche + WALKER.weights.nage + WALKER.weights.remontee;
    for (const mode of WALKER_MODES) {
      expect(counts[mode] / slots).toBeGreaterThan(WALKER.weights[mode] / total - 0.03);
      expect(counts[mode] / slots).toBeLessThan(WALKER.weights[mode] / total + 0.03);
    }
  });

  // Délai explicite (#244, docs/PIEGES.md) : ≈ 0,4 s en local, bien plus en CI lente.
  it('un état tient tout un créneau, avancement dans [0, 1[ croissant', () => {
    let previous = walkerPhaseAt(WALKER, 9, 3, 0);
    for (let tick = 1; tick <= 6000; tick++) {
      const phase = walkerPhaseAt(WALKER, 9, 3, tick * SIM_DT);
      expect(phase.progress).toBeGreaterThanOrEqual(0);
      expect(phase.progress).toBeLessThan(1);
      expect(phase.height).toBeGreaterThanOrEqual(0.2);
      expect(phase.height).toBeLessThan(0.8);
      if (phase.slot === previous.slot) {
        expect(phase.mode).toBe(previous.mode);
        expect(phase.height).toBe(previous.height);
        expect(phase.progress).toBeGreaterThan(previous.progress);
      } else {
        expect(phase.slot).toBe(previous.slot + 1);
      }
      previous = phase;
    }
  }, 15_000);

  it('individus et graines désynchronisés', () => {
    const sequence = (seed: number, id: number) =>
      Array.from({ length: 40 }, (_, k) => walkerPhaseAt(WALKER, seed, id, k * 7).mode).join();
    expect(sequence(42, 0)).not.toBe(sequence(42, 1));
    expect(sequence(42, 0)).not.toBe(sequence(43, 0));
    expect(sequence(0, 0)).not.toBe(sequence(0xffffffff, 0));
  });

  it('refuse un temps négatif ou non fini, une graine ou un identifiant invalides', () => {
    for (const time of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => walkerPhaseAt(WALKER, 1, 0, time)).toThrow(RangeError);
    }
    expect(() => walkerPhaseAt(WALKER, -1, 0, 0)).toThrow(RangeError);
    expect(() => walkerPhaseAt(WALKER, 1, 1.5, 0)).toThrow(RangeError);
  });

  it('vitesse visée : marche lente, nage par à-coups, remontée lente puis marche', () => {
    const phase = (mode: WalkerMode, progress = 0.5) => ({ mode, slot: 0, progress, height: 0.5 });
    expect(walkerSpeedGoal(AXOLOTL, phase('marche'), 0)).toBe(WALKER.walkSpeed);
    expect(walkerSpeedGoal(AXOLOTL, phase('nage'), 0.1)).toBe(AXOLOTL.maxSpeed);
    expect(walkerSpeedGoal(AXOLOTL, phase('nage'), 0.8)).toBe(AXOLOTL.minSpeed);
    expect(walkerSpeedGoal(AXOLOTL, phase('remontee', 0.1), 0)).toBe(AXOLOTL.minSpeed);
    expect(walkerSpeedGoal(AXOLOTL, phase('remontee', 0.9), 0)).toBe(WALKER.walkSpeed);
  });

  it('chaque état se voit dans la trajectoire : fond, pleine eau, surface', () => {
    const world = cloneWorld(axolotlWorld(42, 4));
    const gap: Record<WalkerMode, number[]> = { marche: [], nage: [], remontee: [] };
    let nearSurface = 0;
    let burstMin = Number.POSITIVE_INFINITY;
    let burstMax = 0;
    for (let tick = 0; tick < 36_000; tick++) {
      advanceInPlace(world, 1);
      for (const fish of axolotls(world)) {
        const phase = walkerPhaseAt(WALKER, world.seed, fish.id, world.time);
        const floor = groundHeight(fish.x, fish.z, GROUND) + WALKER.clearance;
        // Après 4 s dans le créneau : l'animal a rejoint la hauteur de l'état.
        if (phase.progress * WALKER.slotDuration < 4) {
          continue;
        }
        if (phase.mode === 'remontee') {
          if (phase.progress < 0.45 && fish.y > BOUNDS.hard.maxY - 0.01) {
            nearSurface++;
          }
          continue;
        }
        gap[phase.mode].push(fish.y - floor);
        if (phase.mode === 'nage') {
          burstMin = Math.min(burstMin, fish.speed);
          burstMax = Math.max(burstMax, fish.speed);
        }
      }
    }
    const median = (values: number[]) => values.sort((a, b) => a - b)[values.length >> 1];
    expect(gap.marche.length).toBeGreaterThan(1000);
    // Posé sur le fond (à quelques millimètres près sur la pente : museau et queue y portent).
    expect(median(gap.marche)).toBeLessThan(0.005);
    expect(median(gap.nage)).toBeGreaterThan(0.02); // décollé du fond
    expect(nearSurface).toBeGreaterThan(100); // remontées jusque sous la surface
    expect(burstMax).toBeGreaterThan(0.8 * AXOLOTL.maxSpeed); // à-coups
    expect(burstMin).toBeLessThan(0.3 * AXOLOTL.maxSpeed); // puis glissades
  }, 30_000);
});

/**
 * Propriété : pour une graine, sur 10 000 pas, chaque axolotl reste dans l'eau, au-dessus du
 * sol (centre, et milieu de chaque pas : pas de tunnel), dans les vitres ; vitesse, cap et
 * inclinaison bornés.
 */
function checkInvariants(seed: number, count: number): void {
  const world = cloneWorld(axolotlWorld(seed, count));
  const { hard } = BOUNDS;
  const eps = 1e-9;
  const settings = PALUDARIUM.terrain!;
  for (let tick = 0; tick < 10_000; tick++) {
    advanceInPlace(world, 1);
    for (const fish of axolotls(world)) {
      const sample = terrainAt(fish.x, fish.z, settings, WATER);
      const midX = (fish.x + fish.px) / 2;
      const midZ = (fish.z + fish.pz) / 2;
      const midY = (fish.y + fish.py) / 2;
      const ok =
        sample.submerged &&
        fish.y >= sample.height + WALKER.clearance - eps &&
        fish.y <= SURFACE - WALKER.surfaceMargin + eps &&
        midY >= terrainAt(midX, midZ, settings, WATER).height + WALKER.clearance - 0.002 &&
        fish.x >= hard.minX &&
        fish.x <= hard.maxX &&
        fish.z >= hard.minZ &&
        fish.z <= hard.maxZ &&
        Math.hypot(fish.x - fish.px, fish.z - fish.pz) <= AXOLOTL.maxSpeed * SIM_DT + eps &&
        fish.speed >= AXOLOTL.minSpeed &&
        fish.speed <= AXOLOTL.maxSpeed &&
        Math.abs(fish.pitch) <= AXOLOTL.maxPitch &&
        // Museau et queue sous la surface, quelle que soit l'inclinaison.
        fish.y + (AXOLOTL.bodyLength / 2) * Math.sin(Math.abs(fish.pitch)) <=
          SURFACE - WALKER.surfaceMargin + eps;
      if (!ok) {
        throw new Error(
          `graine ${seed}, pas ${tick + 1}, axolotl ${fish.id} : ${JSON.stringify(fish)}`,
        );
      }
    }
  }
}

describe('axolotl : bornes, propriété sur 10 000 pas (#130)', () => {
  it.each([0, 42, 7, 0xffffffff])(
    'graine %i : dans l’eau, au-dessus du sol, sans tunnel ni sortie',
    (seed) => {
      expect(() => checkInvariants(seed, 4)).not.toThrow();
    },
    30_000,
  );

  it('n’entre jamais là où l’eau est trop basse (pente de la berge)', () => {
    const world = cloneWorld(axolotlWorld(5, 4));
    for (let tick = 0; tick < 10_000; tick++) {
      advanceInPlace(world, 1);
      for (const fish of axolotls(world)) {
        const depth = SURFACE - WALKER.surfaceMargin - groundHeight(fish.x, fish.z, GROUND);
        expect(depth).toBeGreaterThanOrEqual(WALKER.clearance + WADE_ROOM - 1e-9);
      }
    }
  }, 30_000);

  it('dans un environnement sans berge (fond plat) : posé sur le fond, dans l’eau', () => {
    const tropical = boundsFor('axolotl', 'tropical');
    const flat: WalkerGround = { water: environmentWater('tropical'), terrain: null };
    let world = createWorld(3, [{ species: 'axolotl', count: 2 }]);
    for (const fish of world.entities) {
      expect(fish.y).toBeCloseTo(flat.water.minY + WALKER.clearance, 12);
    }
    world = advance(world, 3000);
    for (const fish of world.entities) {
      expect(fish.y).toBeGreaterThanOrEqual(tropical.hard.minY);
      expect(fish.y).toBeLessThanOrEqual(tropical.hard.maxY);
    }
  });

  it('un tirage du sous-générateur par pas, et rien d’autre ne change le pas', () => {
    const fish = { ...createWalker(42, 0, 'axolotl', BOUNDS, GROUND) };
    const copy = { ...fish };
    stepWalker(fish, SIM_DT, 42, SIM_DT, BOUNDS, GROUND);
    stepWalker(copy, SIM_DT, 42, SIM_DT, BOUNDS, GROUND);
    expect(copy).toEqual(fish);
    const before = createWalker(42, 0, 'axolotl', BOUNDS, GROUND);
    expect(fish.rng).toBe((before.rng + 0x6d2b79f5) >>> 0);
  });
});

describe('axolotl : sauvegarde et autres environnements (#130)', () => {
  it('un paludarium avec axolotls se recharge à l’identique, au bit près', () => {
    const world = advance(createDefaultWorld(42, 'paludarium'), 1234);
    const parsed = parseWorld(serializeWorld(world));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(advance(parsed.world, 2000)).toEqual(advance(world, 2000));
  });

  it('un monde sans axolotl se recharge à l’identique', () => {
    for (const env of ['tropical', 'bassin'] as const) {
      const world = advance(createDefaultWorld(42, env), 600);
      expect(axolotls(world)).toEqual([]);
      const parsed = parseWorld(serializeWorld(world));
      expect(parsed.ok && advance(parsed.world, 300)).toEqual(advance(world, 300));
    }
  });

  it('les poissons ignorent les axolotls : un néon nage de même avec ou sans eux', () => {
    const neons = createWorld(42, [{ species: 'neon', count: 4 }]);
    const mixed = createWorld(42, [
      { species: 'neon', count: 4 },
      { species: 'axolotl', count: 2 },
    ]);
    const a = advance(neons, 1200).entities;
    const b = advance(mixed, 1200).entities.slice(0, 4);
    expect(b).toEqual(a);
  });

  it('validateSpecies signale des réglages de marche incohérents', () => {
    const broken: SpeciesDefinition = {
      ...AXOLOTL,
      walker: {
        ...WALKER,
        clearance: 0,
        walkSpeed: 1,
        weights: { marche: 0, nage: 0, remontee: 0 },
      },
    };
    const problems = validateSpecies(broken);
    expect(problems.some((p) => p.includes('walker.clearance'))).toBe(true);
    expect(problems.some((p) => p.includes('walkSpeed'))).toBe(true);
    expect(problems.some((p) => p.includes('somme'))).toBe(true);
    expect(validateSpecies({ ...AXOLOTL, schooling: { ...NEON_SCHOOLING } })).toContain(
      'une espèce qui marche sur le fond est solitaire (schooling: null)',
    );
    expect(
      validateSpecies({
        ...AXOLOTL,
        depth: { maxHeightRatio: 0.1, floorZone: 0.01, ascentRate: 0, ascentDuration: 1 },
      }),
    ).toContain('walker et depth sont exclusifs');
    expect(
      validateSpecies({
        ...AXOLOTL,
        walker: { ...WALKER, weights: { marche: -1, nage: 1, remontee: 1 } },
      }).some((p) => p.includes('positifs ou nuls')),
    ).toBe(true);
  });
});

const NEON_SCHOOLING = {
  neighborRadius: 0.3,
  separationRadius: 0.05,
  separationWeight: 1,
  alignmentWeight: 1,
  cohesionWeight: 1,
  turnRate: 1.5,
  minDistance: 0.02,
};
