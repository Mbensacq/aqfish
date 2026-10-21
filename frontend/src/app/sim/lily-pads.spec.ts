import { MAX_SEED } from '../core/random/prng';
import { SIM_DT } from './constants';
import { environmentWater, POND, TROPICAL_TANK } from './environment';
import {
  assertLilyPadSettings,
  LILY_PAD_DRIFT,
  LILY_PAD_EDGE_MARGIN,
  LILY_PAD_GAP,
  LILY_PAD_SWAY_ANGLE,
  lilyPadLayout,
  lilyPadPose,
  lilyPadReach,
  type LilyPad,
  type LilyPadPose,
  type LilyPadSettings,
} from './lily-pads';
import { saveData, serializeWorld, parseWorld, SAVE_SCHEMA } from './save';
import { createWorld } from './world';
import type { Box3 } from './tank';

const POND_WATER = environmentWater('bassin');
const SEEDS = [0, 1, 7, 42, 1234, 99999, MAX_SEED];

function pondLayout(seed: number): LilyPad[] {
  return lilyPadLayout(seed, POND_WATER, POND.lilyPads);
}

/** Distance du disque (centre `x`, `z`, rayon `r`) à la bordure de `water` (négative : dehors). */
function edgeClearance(x: number, z: number, r: number, water: Box3): number {
  return Math.min(x - water.minX, water.maxX - x, z - water.minZ, water.maxZ - z) - r;
}

describe('nénuphars : disposition', () => {
  it('le bassin en a, le bac tropical non', () => {
    expect(POND.lilyPads).not.toBeNull();
    expect(TROPICAL_TANK.lilyPads).toBeNull();
    expect(lilyPadLayout(42, environmentWater('tropical'), TROPICAL_TANK.lilyPads)).toEqual([]);
  });

  it.each(SEEDS)('même graine ⇒ même disposition (graine %s)', (seed) => {
    expect(pondLayout(seed)).toEqual(pondLayout(seed));
  });

  it('graines différentes ⇒ dispositions différentes', () => {
    const layouts = SEEDS.map((seed) => JSON.stringify(pondLayout(seed)));
    expect(new Set(layouts).size).toBe(SEEDS.length);
  });

  it('le nombre de feuilles est tiré de la graine, dans les bornes du réglage', () => {
    const { min, max } = POND.lilyPads!.count;
    const counts = new Set<number>();
    for (let seed = 0; seed < 200; seed++) {
      const n = pondLayout(seed).length;
      expect(n).toBeGreaterThanOrEqual(min);
      expect(n).toBeLessThanOrEqual(max);
      counts.add(n);
    }
    // Toutes les valeurs possibles apparaissent : le nombre dépend bien de la graine.
    expect(counts.size).toBe(max - min + 1);
  });

  it.each(SEEDS)('tailles, encoches et dérives restent dans leurs bornes (graine %s)', (seed) => {
    const { radius } = POND.lilyPads!;
    pondLayout(seed).forEach((pad, index) => {
      expect(pad.id).toBe(index);
      expect(pad.radius).toBeGreaterThanOrEqual(radius.min);
      expect(pad.radius).toBeLessThanOrEqual(radius.max);
      expect(pad.drift).toBeGreaterThanOrEqual(LILY_PAD_DRIFT.min);
      expect(pad.drift).toBeLessThanOrEqual(LILY_PAD_DRIFT.max);
      expect(pad.notch).toBeGreaterThan(0);
      expect(pad.notch).toBeLessThan(Math.PI / 4);
    });
  });

  it.each(SEEDS)(
    'aucun recouvrement ni débordement de la margelle, dérive comprise (graine %s)',
    (seed) => {
      const pads = pondLayout(seed);
      for (const pad of pads) {
        expect(edgeClearance(pad.x, pad.z, lilyPadReach(pad), POND_WATER)).toBeGreaterThanOrEqual(
          LILY_PAD_EDGE_MARGIN - 1e-12,
        );
      }
      for (let i = 0; i < pads.length; i++) {
        for (let j = i + 1; j < pads.length; j++) {
          const a = pads[i];
          const b = pads[j];
          expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(
            lilyPadReach(a) + lilyPadReach(b) + LILY_PAD_GAP - 1e-12,
          );
        }
      }
    },
  );

  it('une surface trop petite ne reçoit aucune feuille (sans boucle infinie)', () => {
    const tiny: Box3 = { minX: -0.1, maxX: 0.1, minY: 0, maxY: 0.1, minZ: -0.1, maxZ: 0.1 };
    expect(lilyPadLayout(42, tiny, POND.lilyPads)).toEqual([]);
  });

  it('une surface étroite reçoit moins de feuilles que visé, toutes valides', () => {
    const strip: Box3 = { minX: -0.5, maxX: 0.5, minY: 0, maxY: 0.3, minZ: -0.2, maxZ: 0.2 };
    const settings: LilyPadSettings = {
      count: { min: 12, max: 12 },
      radius: { min: 0.08, max: 0.08 },
    };
    const pads = lilyPadLayout(3, strip, settings);
    expect(pads.length).toBeGreaterThan(0);
    expect(pads.length).toBeLessThan(12);
    for (const pad of pads) {
      expect(edgeClearance(pad.x, pad.z, lilyPadReach(pad), strip)).toBeGreaterThanOrEqual(
        LILY_PAD_EDGE_MARGIN - 1e-12,
      );
    }
  });

  it('un effectif nul ne donne aucune feuille', () => {
    const none: LilyPadSettings = { count: { min: 0, max: 0 }, radius: { min: 0.1, max: 0.1 } };
    expect(lilyPadLayout(42, POND_WATER, none)).toEqual([]);
  });

  it('ne consomme pas le hasard des poissons : un monde du bassin est le même avec ou sans nénuphars', () => {
    const population = [{ species: 'koi' as const, count: 6 }];
    const a = createWorld(42, population, [], POND.decor, 'bassin');
    pondLayout(42);
    const b = createWorld(42, population, [], POND.decor, 'bassin');
    expect(b).toEqual(a);
  });

  it.each([
    [{ count: { min: -1, max: 2 }, radius: { min: 0.1, max: 0.1 } }],
    [{ count: { min: 3, max: 2 }, radius: { min: 0.1, max: 0.1 } }],
    [{ count: { min: 1.5, max: 2 }, radius: { min: 0.1, max: 0.1 } }],
    [{ count: { min: 1, max: 2 }, radius: { min: 0, max: 0.1 } }],
    [{ count: { min: 1, max: 2 }, radius: { min: 0.2, max: 0.1 } }],
    [{ count: { min: 1, max: 2 }, radius: { min: 0.1, max: Number.POSITIVE_INFINITY } }],
    [{ count: { min: 1, max: 2 }, radius: { min: Number.NaN, max: 0.1 } }],
  ] as [LilyPadSettings][])('refuse le réglage invalide %j', (settings) => {
    expect(() => assertLilyPadSettings(settings)).toThrow(RangeError);
    expect(() => lilyPadLayout(42, POND_WATER, settings)).toThrow(RangeError);
  });

  it.each([-1, 1.5, MAX_SEED + 1, Number.NaN])('refuse la graine invalide %s', (seed) => {
    expect(() => pondLayout(seed)).toThrow(RangeError);
  });
});

describe('nénuphars : dérive', () => {
  it('pose déterministe, égale à l’ancre au repos des sinus', () => {
    const pad = pondLayout(42)[0];
    const a = lilyPadPose(pad, 12.5, { x: 0, z: 0, rotation: 0 });
    const b = lilyPadPose(pad, 12.5, { x: 9, z: 9, rotation: 9 });
    expect(b).toEqual(a);
  });

  it('dérive très lente : moins de 1 cm/s et 0,05 rad/s', () => {
    for (const seed of SEEDS) {
      for (const pad of pondLayout(seed)) {
        const p0 = lilyPadPose(pad, 100, { x: 0, z: 0, rotation: 0 });
        const p1 = lilyPadPose(pad, 101, { x: 0, z: 0, rotation: 0 });
        expect(Math.hypot(p1.x - p0.x, p1.z - p0.z)).toBeLessThan(0.01);
        expect(Math.abs(p1.rotation - p0.rotation)).toBeLessThan(0.05);
      }
    }
  });

  it('les feuilles bougent bien avec le temps', () => {
    const pad = pondLayout(42)[0];
    const p0 = lilyPadPose(pad, 0, { x: 0, z: 0, rotation: 0 });
    const p1 = lilyPadPose(pad, 15, { x: 0, z: 0, rotation: 0 });
    expect(Math.hypot(p1.x - p0.x, p1.z - p0.z)).toBeGreaterThan(0.002);
  });

  it.each([0, 42, MAX_SEED])(
    'sur une heure simulée, aucune feuille ne touche la bordure ni une autre (graine %s)',
    (seed) => {
      const pads = pondLayout(seed);
      const poses: LilyPadPose[] = pads.map(() => ({ x: 0, z: 0, rotation: 0 }));
      // Pires valeurs relevées sur la durée, vérifiées une fois à la fin (un `expect` par pas
      // rendrait le test trop lent). Pas de 0,25 s : bien plus fin qu'un mouvement de période
      // ≥ 14 s.
      let worstDrift = -Infinity;
      let worstEdge = Infinity;
      let worstSway = -Infinity;
      let worstGap = Infinity;
      const step = Math.round(0.25 / SIM_DT) * SIM_DT;
      for (let t = 0; t <= 3600; t += step) {
        for (let i = 0; i < pads.length; i++) {
          const pad = pads[i];
          const p = lilyPadPose(pad, t, poses[i]);
          worstDrift = Math.max(worstDrift, Math.hypot(p.x - pad.x, p.z - pad.z) - pad.drift);
          worstEdge = Math.min(worstEdge, edgeClearance(p.x, p.z, pad.radius, POND_WATER));
          worstSway = Math.max(worstSway, Math.abs(p.rotation - pad.rotation));
        }
        for (let i = 0; i < pads.length; i++) {
          for (let j = i + 1; j < pads.length; j++) {
            const p = poses[i];
            const q = poses[j];
            worstGap = Math.min(
              worstGap,
              Math.hypot(p.x - q.x, p.z - q.z) - pads[i].radius - pads[j].radius,
            );
          }
        }
      }
      expect(worstDrift).toBeLessThanOrEqual(1e-12);
      expect(worstEdge).toBeGreaterThan(LILY_PAD_EDGE_MARGIN);
      expect(worstSway).toBeLessThanOrEqual(LILY_PAD_SWAY_ANGLE);
      expect(worstGap).toBeGreaterThan(LILY_PAD_GAP);
    },
    15_000,
  );

  it.each([Number.NaN, Number.POSITIVE_INFINITY])('refuse le temps invalide %s', (time) => {
    const pad = pondLayout(42)[0];
    expect(() => lilyPadPose(pad, time, { x: 0, z: 0, rotation: 0 })).toThrow(RangeError);
  });
});

describe('nénuphars : sauvegarde (ADR 0028)', () => {
  it('aucun champ nouveau : même schéma, et la disposition se retrouve après rechargement', () => {
    const world = createWorld(42, [{ species: 'koi', count: 4 }], [], POND.decor, 'bassin');
    const data = saveData(world);
    expect(data.schema).toBe(SAVE_SCHEMA);
    expect(SAVE_SCHEMA).toBe(1);
    expect(JSON.stringify(data)).not.toMatch(/lily|nenuphar|nénuphar/i);
    const parsed = parseWorld(serializeWorld(world));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      const reloaded = parsed.world;
      expect(
        lilyPadLayout(reloaded.seed, environmentWater(reloaded.environment), POND.lilyPads),
      ).toEqual(pondLayout(42));
    }
  });
});
