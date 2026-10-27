import { describe, expect, it } from 'vitest';

import { groundHeight, type WalkerGround } from './axolotl';
import { environmentWater, livesIn, PALUDARIUM, POND, TROPICAL_TANK } from './environment';
import {
  canHop,
  createFrog,
  frogModeOf,
  hopArc,
  hopDrawAt,
  hopSlotAt,
  isOnLand,
  PITCH_RATE,
  restHeight,
  stepFrog,
  wantsWater,
  waterYaw,
  type FrogMode,
} from './frog';
import { SIM_DT } from './constants';
import { populationLimit, setPopulation } from './population';
import { parseWorld, serializeWorld } from './save';
import { AXOLOTL, GRENOUILLE, NEON, validateSpecies, type SpeciesDefinition } from './species';
import type { Fish } from './swimmer';
import { shoreLineX, type TerrainSettings } from './terrain';
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

const PARAMS = GRENOUILLE.amphibian!;
const WATER = environmentWater('paludarium');
const BOUNDS = boundsFor('grenouille', 'paludarium');
const GROUND: WalkerGround = { water: WATER, terrain: PALUDARIUM.terrain };
const SURFACE = WATER.maxY;
const EPS = 1e-9;

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

function frogs(world: World): Fish[] {
  return world.entities.filter((e) => e.species === 'grenouille');
}

/** Monde du paludarium peuplé de `count` grenouilles seulement. */
function frogWorld(seed: number, count = 3): MutableWorld {
  return cloneWorld(
    createWorld(seed, [{ species: 'grenouille', count }], [], [], 'paludarium'),
  ) as MutableWorld;
}

/**
 * Suit chaque individu de `world` pendant `steps` pas et vérifie l'inclinaison à la sortie de
 * l'eau (#233) : de la reprise de la berge (`nage` → `sortie`) jusqu'à la fin du premier saut
 * qui suit la sortie (`posee` → `saut` ou `entree`), la variation par pas reste sous
 * `maxStep`, l'animal arrive à plat sur la berge et le premier saut part à plat. Rend le
 * nombre de sorties suivies jusqu'au bout.
 */
function followExits(world: MutableWorld, steps: number, maxStep: number): number {
  type Stage = 'sortie' | 'posee' | 'saut';
  const stage = new Map<number, Stage>();
  const previous = new Map<number, FrogMode>();
  let completed = 0;
  for (let t = 0; t < steps; t++) {
    advanceInPlace(world, 1);
    for (const f of world.entities) {
      const mode = frogModeOf(f, world.seed, world.time, GROUND);
      const before = previous.get(f.id);
      previous.set(f.id, mode);
      if (before === 'nage' && mode === 'sortie') {
        stage.set(f.id, 'sortie');
      }
      const current = stage.get(f.id);
      if (current === undefined) {
        continue;
      }
      expect(Math.abs(f.pitch - f.ppitch)).toBeLessThanOrEqual(maxStep);
      if (current === 'sortie' && mode === 'posee') {
        // Arrivée sur la berge : à plat, comme pendant toute la nage de sortie.
        expect(f.pitch).toBe(0);
        stage.set(f.id, 'posee');
      } else if (current === 'posee' && (mode === 'saut' || mode === 'entree')) {
        // Premier saut : part à plat, puis s'incline d'au plus `maxStep` par pas.
        expect(f.ppitch).toBe(0);
        stage.set(f.id, 'saut');
      } else if (current === 'saut' && f.ascent === 0) {
        completed += 1;
        stage.delete(f.id);
      } else if (current === 'sortie' && mode === 'nage') {
        // Le milieu voulu a de nouveau basculé vers l'eau avant la berge : sortie abandonnée.
        stage.delete(f.id);
      }
    }
  }
  return completed;
}

/** Grenouille à une position donnée, au repos (hauteur `restHeight`). */
function frogAt(x: number, z: number, patch: Partial<Mutable<Fish>> = {}): Mutable<Fish> {
  const fish = createFrog(42, 0, 'grenouille', BOUNDS, GROUND) as Mutable<Fish>;
  fish.x = x;
  fish.z = z;
  fish.y = restHeight(x, z, PARAMS, GROUND);
  return Object.assign(fish, patch);
}

/** Premier instant (pas de 0,1 s) où la grenouille 0 de la graine 42 veut (ou non) l'eau. */
function timeWhere(water: boolean, from = 0): number {
  for (let t = from; t < 1000; t += 0.1) {
    if (wantsWater(PARAMS, 42, 0, t) === water) {
      return t;
    }
  }
  throw new Error('instant introuvable');
}

describe('grenouille : espèce du paludarium (#131)', () => {
  it('définition valide, solitaire, amphibie, vert de la palette', () => {
    expect(validateSpecies(GRENOUILLE)).toEqual([]);
    expect(GRENOUILLE.schooling).toBeNull();
    expect(GRENOUILLE.amphibian).toBeDefined();
    expect(GRENOUILLE.walker).toBeUndefined();
    expect(GRENOUILLE.silhouette).toBe('grenouille');
    expect(GRENOUILLE.colors.back).toBe('#7bc950');
  });

  it('déclarée en données pour le paludarium seulement, trois par défaut', () => {
    expect(PALUDARIUM.species).toEqual(['axolotl', 'grenouille', 'triton']);
    expect(PALUDARIUM.population).toContainEqual({ species: 'grenouille', count: 3 });
    expect(livesIn('paludarium', 'grenouille')).toBe(true);
    expect(TROPICAL_TANK.species).not.toContain('grenouille');
    expect(POND.species).not.toContain('grenouille');
    const world = createDefaultWorld(42, 'paludarium');
    expect(frogs(world)).toHaveLength(3);
    expect(world.entities.map((e) => e.species)).toEqual([
      'axolotl',
      'axolotl',
      'grenouille',
      'grenouille',
      'grenouille',
      'triton',
      'triton',
    ]);
  });

  it('population réglable de 0 à 4, nées sur la berge', () => {
    const world = createDefaultWorld(9, 'paludarium');
    expect(populationLimit(world, 'grenouille')).toBe(4);
    const more = setPopulation(world, 'grenouille', 10);
    expect(frogs(more)).toHaveLength(4);
    for (const frog of frogs(more)) {
      expect(isOnLand(frog.x, frog.z, GROUND)).toBe(true);
      expect(frog.y).toBeCloseTo(groundHeight(frog.x, frog.z, GROUND) + PARAMS.clearance, 12);
    }
    expect(frogs(setPopulation(world, 'grenouille', 0))).toHaveLength(0);
    expect(frogs(setPopulation(world, 'grenouille', 2))).toHaveLength(2);
  });

  it('réglages refusés : portée, part du temps dans l’eau, exclusivité', () => {
    const broken = (patch: object, extra: Partial<SpeciesDefinition> = {}) =>
      validateSpecies({ ...GRENOUILLE, ...extra, amphibian: { ...PARAMS, ...patch } });
    expect(broken({ hopDuration: 0 })).not.toEqual([]);
    expect(broken({ hopChance: 1.5 })).not.toEqual([]);
    expect(broken({ hopPitch: -0.1 })).not.toEqual([]);
    expect(broken({ hopPitch: 1.5 })).not.toEqual([]);
    expect(broken({ waterShare: 1 })).not.toEqual([]);
    expect(broken({ waterShare: 0 })).not.toEqual([]);
    expect(broken({ hopMinRange: 0.1, hopMaxRange: 0.05 })).not.toEqual([]);
    expect(broken({ hopMaxRange: 1 })).not.toEqual([]);
    expect(broken({ swimSpeed: 1 })).not.toEqual([]);
    expect(broken({}, { walker: AXOLOTL.walker })).not.toEqual([]);
    expect(broken({}, { schooling: NEON.schooling })).not.toEqual([]);
  });

  it('les autres environnements n’ont pas de grenouille', () => {
    for (const env of ['tropical', 'bassin'] as const) {
      expect(frogs(createDefaultWorld(42, env))).toEqual([]);
    }
  });
});

describe('grenouille : milieu voulu et créneaux de saut', () => {
  it('wantsWater : fonction pure, environ waterShare du temps dans l’eau', () => {
    let water = 0;
    const samples = 4000;
    for (let k = 0; k < samples; k++) {
      const t = (k * PARAMS.cycleDuration * 10) / samples;
      expect(wantsWater(PARAMS, 7, 2, t)).toBe(wantsWater(PARAMS, 7, 2, t));
      water += wantsWater(PARAMS, 7, 2, t) ? 1 : 0;
    }
    expect(water / samples).toBeCloseTo(PARAMS.waterShare, 1);
  });

  it('cycles décalés par individu et par graine', () => {
    const pattern = (seed: number, id: number) =>
      Array.from({ length: 80 }, (_, k) => (wantsWater(PARAMS, seed, id, k) ? 1 : 0)).join('');
    expect(pattern(1, 0)).not.toBe(pattern(1, 1));
    expect(pattern(1, 0)).not.toBe(pattern(2, 0));
  });

  it('créneaux de saut : numéro croissant, un changement par hopSlot', () => {
    let changes = 0;
    let previous = hopSlotAt(PARAMS, 3, 1, 0);
    for (let t = 0.05; t <= PARAMS.hopSlot * 10; t += 0.05) {
      const slot = hopSlotAt(PARAMS, 3, 1, t);
      expect(slot).toBeGreaterThanOrEqual(previous);
      changes += slot - previous;
      previous = slot;
    }
    expect(changes).toBeGreaterThanOrEqual(9);
    expect(changes).toBeLessThanOrEqual(11);
  });

  it('tirages d’un créneau dans [0, 1[, reproductibles', () => {
    for (let slot = 0; slot < 50; slot++) {
      const draw = hopDrawAt(5, 2, slot);
      expect(draw).toEqual(hopDrawAt(5, 2, slot));
      for (const v of [draw.chance, draw.direction, draw.range]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
      }
    }
  });

  it('refuse un temps, une graine ou un identifiant invalides', () => {
    for (const time of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => wantsWater(PARAMS, 1, 0, time)).toThrow(RangeError);
      expect(() => hopSlotAt(PARAMS, 1, 0, time)).toThrow(RangeError);
    }
    expect(() => wantsWater(PARAMS, -1, 0, 0)).toThrow(RangeError);
    expect(() => hopDrawAt(-1, 0, 0)).toThrow(RangeError);
    expect(() => hopSlotAt(PARAMS, 1, 1.5, 0)).toThrow(RangeError);
  });
});

describe('grenouille : hauteur au repos et rivage', () => {
  it('restHeight continue au rivage : pas de saut de hauteur entre terre et eau', () => {
    for (const z of [-0.2, -0.05, 0, 0.11, 0.2]) {
      const shore = shoreLineX(z, PALUDARIUM.terrain!);
      const land = restHeight(shore + 1e-6, z, PARAMS, GROUND);
      const water = restHeight(shore - 1e-6 + 2e-6, z, PARAMS, GROUND);
      expect(Math.abs(land - water)).toBeLessThan(1e-4);
      // De part et d'autre du rivage, à 1 mm : écart de hauteur infime.
      expect(
        Math.abs(
          restHeight(shore - 0.001, z, PARAMS, GROUND) -
            restHeight(shore + 0.001, z, PARAMS, GROUND),
        ),
      ).toBeLessThan(0.003);
    }
  });

  it('dans l’eau profonde : sous la surface de floatDepth ; sur la terre : au-dessus du sol', () => {
    expect(restHeight(0.3, 0, PARAMS, GROUND)).toBeCloseTo(SURFACE - PARAMS.floatDepth, 12);
    expect(isOnLand(-0.3, 0, GROUND)).toBe(true);
    expect(restHeight(-0.3, 0, PARAMS, GROUND)).toBeCloseTo(
      groundHeight(-0.3, 0, GROUND) + PARAMS.clearance,
      12,
    );
    // Sans berge : jamais de terre.
    expect(isOnLand(-0.3, 0, { water: WATER, terrain: null })).toBe(false);
  });
});

describe('grenouille : saut en parabole', () => {
  it('hopArc : part de y0, arrive à y1, sommet borné par la hauteur au-dessus de la corde', () => {
    for (const [y0, y1] of [
      [0.3, 0.3],
      [0.3, 0.35],
      [0.4, 0.26],
    ]) {
      expect(hopArc(y0, y1, 0.04, 0)).toBe(y0);
      expect(hopArc(y0, y1, 0.04, 1)).toBeCloseTo(y1, 15);
      expect(hopArc(y0, y1, 0.04, 0.5)).toBeCloseTo((y0 + y1) / 2 + 0.04, 15);
      for (let k = 0; k <= 100; k++) {
        const s = k / 100;
        const chord = y0 + (y1 - y0) * s;
        const y = hopArc(y0, y1, 0.04, s);
        expect(y).toBeGreaterThanOrEqual(chord - EPS);
        expect(y).toBeLessThanOrEqual(chord + 0.04 + EPS);
      }
    }
  });

  it('canHop : refuse de sortir du bac, et une arrivée dans l’eau quand la terre est exigée', () => {
    const x = BOUNDS.hard.minX + 0.01;
    expect(canHop(x, 0, Math.PI, PARAMS.hopMaxRange, 'libre', PARAMS, BOUNDS, GROUND)).toBe(false);
    const shore = shoreLineX(0, PALUDARIUM.terrain!);
    const near = shore - 0.02;
    expect(isOnLand(near, 0, GROUND)).toBe(true);
    expect(canHop(near, 0, 0, PARAMS.hopMaxRange, 'terre', PARAMS, BOUNDS, GROUND)).toBe(false);
    expect(canHop(near, 0, 0, PARAMS.hopMaxRange, 'libre', PARAMS, BOUNDS, GROUND)).toBe(true);
    expect(canHop(near, 0, Math.PI, PARAMS.hopMinRange, 'terre', PARAMS, BOUNDS, GROUND)).toBe(
      true,
    );
  });

  // Délai explicite (#244, docs/PIEGES.md) : ≈ 0,5 s en local, bien plus en CI lente.
  it('en simulation, chaque saut est borné en portée et en hauteur au-dessus de sa corde', () => {
    let jumps = 0;
    for (const seed of [1, 42, 99]) {
      const world = cloneWorld(createDefaultWorld(seed, 'paludarium'));
      const starts = new Map<number, { x: number; y: number; z: number; top: number[] }>();
      for (let t = 0; t < 6000; t++) {
        advanceInPlace(world, 1);
        for (const f of frogs(world)) {
          const jump = starts.get(f.id);
          if (jump === undefined && f.ascent > 0) {
            starts.set(f.id, { x: f.px, y: f.py, z: f.pz, top: [f.x, f.y, f.z] });
          }
          const current = starts.get(f.id);
          if (current !== undefined) {
            current.top.push(f.x, f.y, f.z);
            if (f.ascent === 0) {
              const range = Math.hypot(f.x - current.x, f.z - current.z);
              expect(range).toBeLessThanOrEqual(PARAMS.hopMaxRange + 1e-6);
              expect(range).toBeGreaterThanOrEqual(PARAMS.hopMinRange - 1e-6);
              for (let k = 0; k < current.top.length; k += 3) {
                const d = Math.hypot(current.top[k] - current.x, current.top[k + 2] - current.z);
                const chord = current.y + ((f.y - current.y) * d) / range;
                expect(current.top[k + 1] - chord).toBeLessThanOrEqual(PARAMS.hopHeight + 1e-6);
              }
              starts.delete(f.id);
              jumps += 1;
            }
          }
        }
      }
    }
    expect(jumps).toBeGreaterThan(50);
  }, 15_000);
});

describe('grenouille : machine à états', () => {
  const shore = shoreLineX(0, PALUDARIUM.terrain!);

  it('frogModeOf : posée, saut, entrée, nage, sortie', () => {
    const land = shore - 0.15;
    const tWater = timeWhere(true);
    const tLand = timeWhere(false);
    expect(frogModeOf(frogAt(land, 0), 42, tLand, GROUND)).toBe('posee');
    // En saut : la mi-course reste à terre, ou finit dans l'eau.
    const hop = frogAt(land, 0, { yaw: Math.PI, speed: 0.15, ascent: 0.25 });
    expect(frogModeOf(hop, 42, tLand, GROUND)).toBe('saut');
    const dive = frogAt(shore - 0.01, 0, { yaw: 0, speed: 0.15, ascent: 0.25 });
    expect(frogModeOf(dive, 42, tLand, GROUND)).toBe('entree');
    expect(frogModeOf(frogAt(0.3, 0), 42, tWater, GROUND)).toBe('nage');
    expect(frogModeOf(frogAt(0.3, 0), 42, tLand, GROUND)).toBe('sortie');
  });

  /** Fait avancer la grenouille par pas de SIM_DT jusqu'à ce que `until` soit vrai. */
  function runUntil(
    fish: Mutable<Fish>,
    start: number,
    until: (mode: FrogMode) => boolean,
    maxSteps = 20000,
  ): { time: number; before: FrogMode; after: FrogMode } {
    let time = start;
    let before = frogModeOf(fish, 42, time, GROUND);
    for (let k = 0; k < maxSteps; k++) {
      time += 1 / 60;
      stepFrog(fish, 1 / 60, 42, time, BOUNDS, GROUND);
      const after = frogModeOf(fish, 42, time, GROUND);
      if (until(after)) {
        return { time, before, after };
      }
      before = after;
    }
    throw new Error('transition non atteinte');
  }

  it('posée → saut → posée, à terre', () => {
    const fish = frogAt(shore - 0.25, 0.05);
    const start = timeWhere(false);
    const up = runUntil(fish, start, (m) => m !== 'posee');
    expect(up.before).toBe('posee');
    expect(up.after).toBe('saut');
    expect(wantsWater(PARAMS, 42, 0, up.time)).toBe(false);
    const down = runUntil(fish, up.time, (m) => m !== 'saut');
    expect(down.after).toBe('posee');
    expect(fish.y).toBeCloseTo(restHeight(fish.x, fish.z, PARAMS, GROUND), 12);
  });

  it('posée → entrée → nage → sortie → posée', () => {
    const fish = frogAt(shore - 0.03, 0);
    const start = timeWhere(true, timeWhere(false));
    const enter = runUntil(fish, start, (m) => m === 'entree');
    expect(enter.before === 'posee' || enter.before === 'saut').toBe(true);
    const swim = runUntil(fish, enter.time, (m) => m !== 'entree');
    expect(swim.after).toBe('nage');
    expect(isOnLand(fish.x, fish.z, GROUND)).toBe(false);
    const leave = runUntil(fish, swim.time, (m) => m !== 'nage');
    expect(leave.after).toBe('sortie');
    expect(wantsWater(PARAMS, 42, 0, leave.time)).toBe(false);
    const out = runUntil(fish, leave.time, (m) => m !== 'sortie');
    expect(out.after).toBe('posee');
    expect(isOnLand(fish.x, fish.z, GROUND)).toBe(true);
  });

  it('transitions observées dans un monde : toutes permises, aucune téléportation', () => {
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
    const world = cloneWorld(createDefaultWorld(5, 'paludarium'));
    const previous = new Map<number, FrogMode>();
    for (let t = 0; t < 12000; t++) {
      advanceInPlace(world, 1);
      for (const f of frogs(world)) {
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
      'posee>entree',
      'entree>nage',
      'nage>sortie',
      'sortie>posee',
    ]) {
      expect(seen.has(needed), needed).toBe(true);
    }
  });

  it('refuse un pas de temps invalide et une espèce non amphibie', () => {
    const fish = frogAt(shore - 0.1, 0);
    for (const dt of [0, -1, Number.NaN]) {
      expect(() => stepFrog(fish, dt, 42, 1, BOUNDS, GROUND)).toThrow(RangeError);
    }
    expect(() => createFrog(1, 0, 'neon', BOUNDS, GROUND)).toThrow(RangeError);
  });

  it('sans berge : naît dans l’eau, au centre, et nage', () => {
    const flat: WalkerGround = { water: WATER, terrain: null };
    const fish = createFrog(3, 0, 'grenouille', BOUNDS, flat) as Mutable<Fish>;
    expect(fish.y).toBeCloseTo(SURFACE - PARAMS.floatDepth, 12);
    for (let k = 1; k <= 600; k++) {
      stepFrog(fish, 1 / 60, 3, k / 60, BOUNDS, flat);
      expect(fish.y).toBeCloseTo(SURFACE - PARAMS.floatDepth, 12);
    }
  });
});

describe('grenouille : inclinaison de saut sans bascule (#223)', () => {
  it.each([1, 42])(
    'graine %i : variation bornée à chaque pas, à plat peu après chaque arrivée',
    (seed) => {
      const world: MutableWorld = cloneWorld(createDefaultWorld(seed, 'paludarium'));
      const maxStep = 3 * SIM_DT + EPS;
      const landed = new Map<number, number>();
      const hopping = new Map<number, boolean>();
      let landings = 0;
      for (let t = 0; t < 10000; t++) {
        advanceInPlace(world, 1);
        for (const f of frogs(world)) {
          expect(Math.abs(f.pitch - f.ppitch)).toBeLessThanOrEqual(maxStep);
          const wasHopping = hopping.get(f.id) ?? false;
          hopping.set(f.id, f.ascent > 0);
          if (f.ascent === 0 && wasHopping && isOnLand(f.x, f.z, GROUND)) {
            // Arrivée : l'inclinaison n'est pas remise à plat d'un coup.
            landings += 1;
            landed.set(f.id, 0);
          }
          const since = landed.get(f.id);
          if (since === undefined) {
            continue;
          }
          if (f.ascent > 0 || !isOnLand(f.x, f.z, GROUND)) {
            landed.delete(f.id);
          } else if (since >= 20) {
            expect(f.pitch).toBe(0);
            landed.delete(f.id);
          } else {
            landed.set(f.id, since + 1);
          }
        }
      }
      expect(landings).toBeGreaterThan(20);
    },
    60_000,
  );
});

describe('grenouille : inclinaison à la sortie de l’eau et origine des 39° (#233)', () => {
  /** Variation d'inclinaison maximale par pas de simulation. */
  const MAX_PITCH_STEP = PITCH_RATE * SIM_DT + EPS;

  it.each([1, 42, 2024])(
    'graine %i : nage → sortie → posée → premier saut, variation bornée à chaque pas',
    (seed) => {
      const world = frogWorld(seed);
      const exits = followExits(world, 20000, MAX_PITCH_STEP);
      expect(exits).toBeGreaterThanOrEqual(3);
    },
    60_000,
  );

  it.each([1, 42, 2024])(
    'graine %i : les 39° sont le sommet d’un bond court ; hors saut, l’inclinaison ne fait que revenir à plat',
    (seed) => {
      const world = frogWorld(seed);
      const hops = new Map<number, { y0: number; x0: number; z0: number; maxPitch: number }>();
      let maxHopPitch = 0;
      for (let t = 0; t < 20000; t++) {
        advanceInPlace(world, 1);
        for (const f of world.entities) {
          if (f.ascent === 0 && !hops.has(f.id)) {
            // Posée, nage ou sortie (et pas d'arrivée) : jamais plus inclinée qu'au pas d'avant.
            // Les ~36° relevés posée ou à la nage sont le reste de l'arrivée d'un saut.
            expect(Math.abs(f.pitch)).toBeLessThanOrEqual(Math.abs(f.ppitch));
          }
          if (f.ascent > 0 && !hops.has(f.id)) {
            hops.set(f.id, { x0: f.px, z0: f.pz, y0: f.py, maxPitch: 0 });
          }
          const hop = hops.get(f.id);
          if (hop === undefined) {
            continue;
          }
          hop.maxPitch = Math.max(hop.maxPitch, Math.abs(f.pitch));
          if (f.ascent === 0) {
            // Arrivée (terre ou eau) : au plus `hopPitch` × la pente la plus forte de l'arc.
            hops.delete(f.id);
            const range = Math.hypot(f.x - hop.x0, f.z - hop.z0);
            const chord = Math.abs(f.y - hop.y0) / range;
            expect(hop.maxPitch).toBeLessThanOrEqual(
              PARAMS.hopPitch * Math.atan((4 * PARAMS.hopHeight) / range + chord) + EPS,
            );
            maxHopPitch = Math.max(maxHopPitch, hop.maxPitch);
          }
        }
      }
      // Bond le plus court (`hopMinRange`) : la moitié de atan(4 h / portée) ≈ 38°, plus la
      // corde d'une entrée dans l'eau ; jamais au-delà de 40°, le réglage de l'ADR 0036.
      expect(maxHopPitch).toBeGreaterThan(0.5);
      expect(maxHopPitch).toBeLessThanOrEqual((40 * Math.PI) / 180);
    },
    60_000,
  );
});

describe('grenouille : bornes sur 20 000 pas', () => {
  it.each([1, 42, 2024, 4294967295])(
    'graine %i : dans le bac, jamais sous le sol, terre → eau et eau → terre',
    (seed) => {
      const world: MutableWorld = cloneWorld(createDefaultWorld(seed, 'paludarium'));
      const { hard } = BOUNDS;
      const state = new Map<number, { inWater: boolean; toWater: number; toLand: number }>();
      for (const f of frogs(world)) {
        state.set(f.id, { inWater: !isOnLand(f.x, f.z, GROUND), toWater: 0, toLand: 0 });
      }
      for (let t = 0; t < 20000; t++) {
        advanceInPlace(world, 1);
        for (const f of frogs(world)) {
          expect(f.x).toBeGreaterThanOrEqual(hard.minX);
          expect(f.x).toBeLessThanOrEqual(hard.maxX);
          expect(f.z).toBeGreaterThanOrEqual(hard.minZ);
          expect(f.z).toBeLessThanOrEqual(hard.maxZ);
          expect(f.y).toBeLessThanOrEqual(hard.maxY);
          expect(f.y).toBeGreaterThanOrEqual(
            groundHeight(f.x, f.z, GROUND) + PARAMS.clearance - EPS,
          );
          // Continuité : au plus la vitesse d'un saut (portée et chute) par pas.
          expect(Math.hypot(f.x - f.px, f.y - f.py, f.z - f.pz)).toBeLessThan(0.012);
          expect(Math.abs(f.pitch)).toBeLessThanOrEqual(GRENOUILLE.maxPitch);
          expect(f.speed).toBeGreaterThanOrEqual(GRENOUILLE.minSpeed);
          expect(f.speed).toBeLessThanOrEqual(GRENOUILLE.maxSpeed);
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

describe('grenouille : déterminisme et sauvegarde', () => {
  it('même graine, mêmes trajectoires', () => {
    const a = advance(createDefaultWorld(77, 'paludarium'), 3000);
    const b = advance(createDefaultWorld(77, 'paludarium'), 3000);
    expect(frogs(a)).toEqual(frogs(b));
  });

  it('un monde sauvegardé en plein saut reprend à l’identique', () => {
    let world = createDefaultWorld(11, 'paludarium');
    for (let k = 0; k < 4000 && !frogs(world).some((f) => f.ascent > 0); k++) {
      world = advance(world, 1);
    }
    expect(frogs(world).some((f) => f.ascent > 0)).toBe(true);
    const parsed = parseWorld(serializeWorld(world));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(advance(parsed.world, 600).entities).toEqual(advance(world, 600).entities);
  });
});

describe('grenouille : sens de l’eau porté par le terrain (#142)', () => {
  const SETTINGS = PALUDARIUM.terrain!;
  /** Paludarium retourné : eau vers −X, terre vers +X. */
  const FLIPPED: TerrainSettings = { ...SETTINGS, shoreX: -SETTINGS.shoreX, waterSide: -1 };
  const FLIPPED_GROUND: WalkerGround = { water: WATER, terrain: FLIPPED };

  it('waterYaw : 0 au paludarium et sans terrain, π quand l’eau est vers −X', () => {
    expect(waterYaw(GROUND)).toBe(0);
    expect(waterYaw({ water: WATER, terrain: null })).toBe(0);
    expect(waterYaw(FLIPPED_GROUND)).toBe(Math.PI);
  });

  it('eau vers −X : saute vers −X pour entrer dans l’eau, ressort vers +X sur la terre', () => {
    const shore = shoreLineX(0, FLIPPED);
    const fish = createFrog(42, 0, 'grenouille', BOUNDS, FLIPPED_GROUND) as Mutable<Fish>;
    fish.x = shore + 0.03;
    fish.z = 0;
    fish.y = restHeight(fish.x, fish.z, PARAMS, FLIPPED_GROUND);
    expect(isOnLand(fish.x, fish.z, FLIPPED_GROUND)).toBe(true);

    /** Avance par pas de 1/60 s jusqu'à ce que `until` soit vrai ; renvoie le temps atteint. */
    const run = (start: number, until: (mode: FrogMode) => boolean): number => {
      let time = start;
      for (let k = 0; k < 20000; k++) {
        time += 1 / 60;
        stepFrog(fish, 1 / 60, 42, time, BOUNDS, FLIPPED_GROUND);
        if (until(frogModeOf(fish, 42, time, FLIPPED_GROUND))) {
          return time;
        }
      }
      throw new Error('transition non atteinte');
    };

    const enter = run(timeWhere(true, timeWhere(false)), (m) => m === 'entree');
    // Saut vers l'eau : à ±(WATER_HOP_SPREAD + replis) de π, donc vers −X.
    expect(Math.cos(fish.yaw)).toBeLessThan(0);
    const swim = run(enter, (m) => m !== 'entree');
    expect(isOnLand(fish.x, fish.z, FLIPPED_GROUND)).toBe(false);
    expect(fish.x).toBeLessThan(shoreLineX(fish.z, FLIPPED));
    const leave = run(swim, (m) => m === 'sortie');
    expect(wantsWater(PARAMS, 42, 0, leave)).toBe(false);
    // Sortie : le cap converge vers +X (la berge), puis la grenouille remonte sur la terre.
    let maxCos = -1;
    let time = leave;
    while (!isOnLand(fish.x, fish.z, FLIPPED_GROUND)) {
      time += 1 / 60;
      stepFrog(fish, 1 / 60, 42, time, BOUNDS, FLIPPED_GROUND);
      maxCos = Math.max(maxCos, Math.cos(fish.yaw));
      expect(time - leave).toBeLessThan(120);
    }
    expect(maxCos).toBeGreaterThan(0.99);
    expect(fish.x).toBeGreaterThanOrEqual(shoreLineX(fish.z, FLIPPED));
  });
});
