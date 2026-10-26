import { describe, expect, it } from 'vitest';

import { groundHeight, type WalkerGround } from './axolotl';
import { environmentWater, livesIn, PALUDARIUM, POND, TROPICAL_TANK } from './environment';
import { frogModeOf, isOnLand, restHeight, stepFrog, wantsWater, type FrogMode } from './frog';
import { populationLimit, setPopulation } from './population';
import { parseWorld, serializeWorld } from './save';
import { GRENOUILLE, TRITON, validateSpecies } from './species';
import type { Fish } from './swimmer';
import { SIM_DT } from './constants';
import { shoreLineX } from './terrain';
import {
  advance,
  advanceInPlace,
  boundsFor,
  cloneWorld,
  createDefaultWorld,
  createWorld,
  type MutableWorld,
  type World,
} from './world';

/**
 * Tritons du paludarium (#133) : même machine à états que la grenouille (`sim/frog.ts`,
 * ADR 0036), réglée pour une espèce plus aquatique (ADR 0037).
 */

const PARAMS = TRITON.amphibian!;
const FROG = GRENOUILLE.amphibian!;
const WATER = environmentWater('paludarium');
const BOUNDS = boundsFor('triton', 'paludarium');
const GROUND: WalkerGround = { water: WATER, terrain: PALUDARIUM.terrain };
const SURFACE = WATER.maxY;
const EPS = 1e-9;

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

function newts(world: World): Fish[] {
  return world.entities.filter((e) => e.species === 'triton');
}

/** Monde du paludarium peuplé de `count` tritons seulement. */
function newtWorld(seed: number, count = 3): MutableWorld {
  return cloneWorld(
    createWorld(seed, [{ species: 'triton', count }], [], [], 'paludarium'),
  ) as MutableWorld;
}

/** Part du temps passé hors de la terre émergée (hors sauts), sur `steps` pas. */
function waterTimeShare(species: 'triton' | 'grenouille', seeds: readonly number[]): number {
  let water = 0;
  let total = 0;
  for (const seed of seeds) {
    const world = cloneWorld(
      createWorld(seed, [{ species, count: 3 }], [], [], 'paludarium'),
    ) as MutableWorld;
    for (let t = 0; t < 12000; t++) {
      advanceInPlace(world, 1);
      for (const f of world.entities) {
        total += 1;
        water += isOnLand(f.x, f.z, GROUND) ? 0 : 1;
      }
    }
  }
  return water / total;
}

describe('triton : espèce du paludarium (#133)', () => {
  it('définition valide, solitaire, amphibie, orange de la palette', () => {
    expect(validateSpecies(TRITON)).toEqual([]);
    expect(TRITON.schooling).toBeNull();
    expect(TRITON.amphibian).toBeDefined();
    expect(TRITON.walker).toBeUndefined();
    expect(TRITON.depth).toBeUndefined();
    expect(TRITON.silhouette).toBe('triton');
    expect(TRITON.colors.back).toBe('#e07a2f');
    expect(TRITON.colors.stripe).toBe('#e07a2f');
  });

  it('déclaré en données pour le paludarium seulement, deux par défaut', () => {
    expect(PALUDARIUM.species).toEqual(['axolotl', 'grenouille', 'triton']);
    expect(PALUDARIUM.population).toContainEqual({ species: 'triton', count: 2 });
    expect(livesIn('paludarium', 'triton')).toBe(true);
    expect(TROPICAL_TANK.species).not.toContain('triton');
    expect(POND.species).not.toContain('triton');
    const world = createDefaultWorld(42, 'paludarium');
    expect(newts(world)).toHaveLength(2);
    // Après les grenouilles : identifiants des axolotls et des grenouilles inchangés.
    expect(world.entities.map((e) => `${e.species}:${e.id}`)).toEqual([
      'axolotl:0',
      'axolotl:1',
      'grenouille:2',
      'grenouille:3',
      'grenouille:4',
      'triton:5',
      'triton:6',
    ]);
    for (const env of ['tropical', 'bassin'] as const) {
      expect(newts(createDefaultWorld(42, env))).toEqual([]);
    }
  });

  it('population réglable de 0 à 3, nés sur la berge', () => {
    const world = createDefaultWorld(9, 'paludarium');
    expect(populationLimit(world, 'triton')).toBe(3);
    const more = setPopulation(world, 'triton', 10);
    expect(newts(more)).toHaveLength(3);
    for (const newt of newts(more)) {
      expect(isOnLand(newt.x, newt.z, GROUND)).toBe(true);
      expect(newt.y).toBeCloseTo(groundHeight(newt.x, newt.z, GROUND) + PARAMS.clearance, 12);
    }
    expect(newts(setPopulation(world, 'triton', 0))).toHaveLength(0);
    expect(newts(setPopulation(world, 'triton', 1))).toHaveLength(1);
    // Le réglage des tritons ne touche pas aux grenouilles.
    const frogsBefore = world.entities.filter((e) => e.species === 'grenouille');
    expect(
      setPopulation(world, 'triton', 0).entities.filter((e) => e.species === 'grenouille'),
    ).toEqual(frogsBefore);
  });
});

describe('triton : la machine à états de la grenouille, avec ses propres durées', () => {
  it('réglages distincts : plus aquatique, pas rampants, nage plus profonde et plus lente', () => {
    expect(PARAMS.waterShare).toBeGreaterThan(FROG.waterShare);
    expect(PARAMS.waterShare).toBeGreaterThanOrEqual(0.6);
    expect(PARAMS.cycleDuration).not.toBe(FROG.cycleDuration);
    expect(PARAMS.hopDuration).toBeGreaterThan(FROG.hopDuration);
    expect(PARAMS.hopMaxRange).toBeLessThanOrEqual(FROG.hopMinRange);
    expect(PARAMS.hopHeight).toBeLessThan(FROG.hopHeight / 4);
    expect(PARAMS.floatDepth).toBeGreaterThan(FROG.floatDepth);
    expect(PARAMS.swimSpeed).toBeLessThan(FROG.swimSpeed);
  });

  it('wantsWater suit le cycle du triton : environ 70 % du temps', () => {
    let water = 0;
    const samples = 6000;
    for (let k = 0; k < samples; k++) {
      water += wantsWater(PARAMS, 7, 5, (k * PARAMS.cycleDuration * 10) / samples) ? 1 : 0;
    }
    expect(water / samples).toBeCloseTo(PARAMS.waterShare, 1);
  });

  it('dans l’eau profonde, nage à floatDepth sous la surface ; posé, à ras du sol', () => {
    expect(restHeight(0.3, 0, PARAMS, GROUND)).toBeCloseTo(SURFACE - PARAMS.floatDepth, 12);
    expect(restHeight(-0.3, 0, PARAMS, GROUND)).toBeCloseTo(
      groundHeight(-0.3, 0, GROUND) + PARAMS.clearance,
      12,
    );
  });

  it('dans un monde, toutes les transitions sont celles de la grenouille', () => {
    const allowed = new Set([
      'posee>saut',
      'posee>entree',
      'saut>posee',
      'saut>entree',
      'entree>nage',
      'entree>sortie',
      'nage>sortie',
      'sortie>nage',
      'sortie>posee',
    ]);
    const seen = new Set<string>();
    const world = newtWorld(5);
    const previous = new Map<number, FrogMode>();
    for (let t = 0; t < 20000; t++) {
      advanceInPlace(world, 1);
      for (const f of world.entities) {
        const mode = frogModeOf(f, world.seed, world.time, GROUND);
        const before = previous.get(f.id);
        if (before !== undefined && before !== mode) {
          seen.add(`${before}>${mode}`);
        }
        previous.set(f.id, mode);
      }
    }
    for (const transition of seen) {
      expect(allowed.has(transition), transition).toBe(true);
    }
    for (const needed of [
      'posee>saut',
      'saut>posee',
      'entree>nage',
      'nage>sortie',
      'sortie>posee',
    ]) {
      expect(seen.has(needed), needed).toBe(true);
    }
  });

  it('pas rampants : chaque déplacement à terre est court et à ras du sol', () => {
    let crawls = 0;
    for (const seed of [1, 42]) {
      const world = newtWorld(seed);
      const starts = new Map<number, { x: number; z: number; maxLift: number }>();
      for (let t = 0; t < 8000; t++) {
        advanceInPlace(world, 1);
        for (const f of world.entities) {
          if (!starts.has(f.id) && f.ascent > 0) {
            starts.set(f.id, { x: f.px, z: f.pz, maxLift: 0 });
          }
          const current = starts.get(f.id);
          if (current === undefined) {
            continue;
          }
          const lift = f.y - restHeight(f.x, f.z, PARAMS, GROUND);
          current.maxLift = Math.max(current.maxLift, lift);
          if (f.ascent === 0) {
            const range = Math.hypot(f.x - current.x, f.z - current.z);
            expect(range).toBeLessThanOrEqual(PARAMS.hopMaxRange + 1e-6);
            expect(range).toBeGreaterThanOrEqual(PARAMS.hopMinRange - 1e-6);
            // Au-dessus de la hauteur de repos locale : au plus l'arc et la pente du sol.
            expect(current.maxLift).toBeLessThan(PARAMS.hopHeight + 0.02);
            starts.delete(f.id);
            crawls += 1;
          }
        }
      }
    }
    expect(crawls).toBeGreaterThan(50);
  });

  it('passe nettement plus de temps dans l’eau que la grenouille', () => {
    const newt = waterTimeShare('triton', [1, 42]);
    const frog = waterTimeShare('grenouille', [1, 42]);
    expect(newt).toBeGreaterThan(0.5);
    expect(newt).toBeGreaterThan(frog + 0.2);
  }, 30_000);

  it('nage près de la surface : dans l’eau profonde, à floatDepth sous la surface', () => {
    const world = newtWorld(42);
    let deep = 0;
    for (let t = 0; t < 12000; t++) {
      advanceInPlace(world, 1);
      for (const f of world.entities) {
        const floor = groundHeight(f.x, f.z, GROUND) + PARAMS.clearance;
        if (f.ascent === 0 && !isOnLand(f.x, f.z, GROUND) && floor < SURFACE - PARAMS.floatDepth) {
          expect(f.y).toBeCloseTo(SURFACE - PARAMS.floatDepth, 9);
          deep += 1;
        }
      }
    }
    expect(deep).toBeGreaterThan(1000);
  });

  it('stepFrog accepte le triton : posé sur la berge, il reste au-dessus du sol', () => {
    const shore = shoreLineX(0, PALUDARIUM.terrain!);
    const world = newtWorld(3, 1);
    const fish = world.entities[0] as Mutable<Fish>;
    fish.x = shore - 0.1;
    fish.y = restHeight(fish.x, fish.z, PARAMS, GROUND);
    for (let k = 1; k <= 600; k++) {
      stepFrog(fish, 1 / 60, 3, k / 60, BOUNDS, GROUND);
      expect(fish.y).toBeGreaterThanOrEqual(
        groundHeight(fish.x, fish.z, GROUND) + PARAMS.clearance - EPS,
      );
    }
  });
});

describe('triton : bornes sur 20 000 pas', () => {
  it.each([1, 42, 2024, 4294967295])(
    'graine %i : dans le bac, jamais sous le sol, terre → eau et eau → terre',
    (seed) => {
      const world: MutableWorld = cloneWorld(createDefaultWorld(seed, 'paludarium'));
      const { hard } = BOUNDS;
      const state = new Map<number, { inWater: boolean; toWater: number; toLand: number }>();
      for (const f of newts(world)) {
        state.set(f.id, { inWater: !isOnLand(f.x, f.z, GROUND), toWater: 0, toLand: 0 });
      }
      expect(state.size).toBe(2);
      for (let t = 0; t < 20000; t++) {
        advanceInPlace(world, 1);
        for (const f of newts(world)) {
          expect(f.x).toBeGreaterThanOrEqual(hard.minX);
          expect(f.x).toBeLessThanOrEqual(hard.maxX);
          expect(f.z).toBeGreaterThanOrEqual(hard.minZ);
          expect(f.z).toBeLessThanOrEqual(hard.maxZ);
          expect(f.y).toBeLessThanOrEqual(hard.maxY);
          expect(f.y).toBeGreaterThanOrEqual(
            groundHeight(f.x, f.z, GROUND) + PARAMS.clearance - EPS,
          );
          // Continuité : déplacement par pas borné (pas rampant ou nage lente).
          expect(Math.hypot(f.x - f.px, f.y - f.py, f.z - f.pz)).toBeLessThan(0.004);
          expect(Math.abs(f.pitch)).toBeLessThanOrEqual(TRITON.maxPitch);
          expect(f.speed).toBeGreaterThanOrEqual(TRITON.minSpeed);
          expect(f.speed).toBeLessThanOrEqual(TRITON.maxSpeed);
          if (f.ascent === 0) {
            const s = state.get(f.id)!;
            const inWater = !isOnLand(f.x, f.z, GROUND);
            if (inWater && !s.inWater) {
              s.toWater += 1;
            } else if (!inWater && s.inWater) {
              s.toLand += 1;
            }
            s.inWater = inWater;
          }
        }
      }
      for (const s of state.values()) {
        expect(s.toWater).toBeGreaterThanOrEqual(1);
        expect(s.toLand).toBeGreaterThanOrEqual(1);
      }
    },
    60_000,
  );
});

describe('triton : inclinaison des pas rampants (#223)', () => {
  /** Variation d'inclinaison maximale par pas : 3 rad/s (`PITCH_RATE` de `sim/frog.ts`). */
  const MAX_PITCH_STEP = 3 * SIM_DT + EPS;
  /** Sur un sol à peu près plat : au plus ~5° (`hopPitch` × pente de l'arc). */
  const FLAT_PITCH = 0.092;
  /** Partout (pentes de la berge comprises) : au plus ~7,5°, loin des 34° d'avant. */
  const ANY_PITCH = 0.13;

  it.each([1, 42, 2024])(
    'graine %i : presque à plat, sans bascule d’un pas à l’autre, à plat peu après l’arrivée',
    (seed) => {
      const world = newtWorld(seed);
      const hops = new Map<number, { y0: number; x0: number; z0: number; maxPitch: number }>();
      const landed = new Map<number, number>();
      let flatHops = 0;
      for (let t = 0; t < 10000; t++) {
        advanceInPlace(world, 1);
        for (const f of world.entities) {
          expect(Math.abs(f.pitch)).toBeLessThanOrEqual(ANY_PITCH);
          expect(Math.abs(f.pitch - f.ppitch)).toBeLessThanOrEqual(MAX_PITCH_STEP);
          if (f.ascent > 0 && !hops.has(f.id) && isOnLand(f.px, f.pz, GROUND)) {
            hops.set(f.id, { x0: f.px, z0: f.pz, y0: f.py, maxPitch: 0 });
          }
          const hop = hops.get(f.id);
          if (hop !== undefined) {
            hop.maxPitch = Math.max(hop.maxPitch, Math.abs(f.pitch));
            if (f.ascent === 0) {
              hops.delete(f.id);
              const range = Math.hypot(f.x - hop.x0, f.z - hop.z0);
              const chord = Math.abs(f.y - hop.y0) / range;
              // Au plus `hopPitch` × la pente la plus forte de l'arc (à l'envol ou à l'arrivée).
              expect(hop.maxPitch).toBeLessThanOrEqual(
                PARAMS.hopPitch * Math.atan((4 * PARAMS.hopHeight) / range + chord) + EPS,
              );
              if (isOnLand(f.x, f.z, GROUND) && chord < 0.1) {
                expect(hop.maxPitch).toBeLessThanOrEqual(FLAT_PITCH);
                flatHops += 1;
              }
              landed.set(f.id, 0);
            }
          }
          const since = landed.get(f.id);
          if (since !== undefined) {
            if (f.ascent > 0 || !isOnLand(f.x, f.z, GROUND)) {
              landed.delete(f.id);
            } else if (since >= 10) {
              // Posé depuis 10 pas : revenu à plat (progressivement, voir la borne par pas).
              expect(f.pitch).toBe(0);
              landed.delete(f.id);
            } else {
              landed.set(f.id, since + 1);
            }
          }
        }
      }
      expect(flatHops).toBeGreaterThan(0);
    },
    60_000,
  );

  it('réglage hopPitch : faible pour le triton, borné à [0, 1]', () => {
    expect(PARAMS.hopPitch).toBeLessThan(FROG.hopPitch);
    const broken = (hopPitch: number) =>
      validateSpecies({ ...TRITON, amphibian: { ...PARAMS, hopPitch } });
    expect(broken(0)).toEqual([]);
    expect(broken(1)).toEqual([]);
    expect(broken(-0.1)).not.toEqual([]);
    expect(broken(1.5)).not.toEqual([]);
    expect(broken(Number.NaN)).not.toEqual([]);
  });
});

describe('triton : déterminisme et sauvegarde', () => {
  it('même graine, mêmes trajectoires ; graines différentes, trajectoires différentes', () => {
    const a = advance(createDefaultWorld(77, 'paludarium'), 3000);
    const b = advance(createDefaultWorld(77, 'paludarium'), 3000);
    const c = advance(createDefaultWorld(78, 'paludarium'), 3000);
    expect(newts(a)).toEqual(newts(b));
    expect(newts(a)).not.toEqual(newts(c));
  });

  it('un monde sauvegardé en plein pas rampant reprend à l’identique', () => {
    let world: World = createDefaultWorld(11, 'paludarium');
    for (let k = 0; k < 4000 && !newts(world).some((f) => f.ascent > 0); k++) {
      world = advance(world, 1);
    }
    expect(newts(world).some((f) => f.ascent > 0)).toBe(true);
    const parsed = parseWorld(serializeWorld(world));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(advance(parsed.world, 600).entities).toEqual(advance(world, 600).entities);
  });
});
