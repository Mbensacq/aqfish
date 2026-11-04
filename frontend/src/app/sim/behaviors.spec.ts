import {
  activeBehavior,
  behaviorGesture,
  behaviorTarget,
  boutRemaining,
  CHARGE_STOP_LENGTHS,
  DISPLAY_QUIVER,
  FORAGE_BOB,
  FORAGE_TILT,
  hasLandedFood,
  speciesBehavior,
  SPECIES_BEHAVIORS,
  TERRITORY_RADIUS,
  territoryHome,
  type BehaviorContext,
  type BehaviorGesture,
  type BehaviorParams,
} from './behaviors';
import { SIM_DT } from './constants';
import { environmentWater } from './environment';
import { landingAge, type FoodPellet } from './food';
import { FULL_MOTION, REDUCED_MOTION } from '../core/reduced-motion/reduced-motion';
import type { Obstacle } from './obstacles';
import { SPECIES, type SpeciesId } from './species';
import { swimBounds, type Fish, type SwimBounds } from './swimmer';
import { advanceInPlace, createWorld, feedInPlace, type MutableWorld, type World } from './world';
import { MAX_TOTAL_FISH } from './population';
import { sheetRows, SPECIES_BEHAVIOR_TEXT } from './species-sheet';

const FOUILLE = SPECIES_BEHAVIORS.corydora as BehaviorParams;
const BROUTAGE = SPECIES_BEHAVIORS.ancistrus as BehaviorParams;
const TERRITOIRE = SPECIES_BEHAVIORS.gourami as BehaviorParams;
const SEEDS = [0, 1, 42, 777, 4294967295];

function bounds(species: SpeciesId, env: 'tropical' | 'recif' = 'tropical'): SwimBounds {
  return swimBounds(SPECIES[species], environmentWater(env));
}

function fish(species: SpeciesId, id: number, x: number, y: number, z: number, yaw = 0): Fish {
  return {
    id,
    kind: 'fish',
    species,
    x,
    y,
    z,
    yaw,
    pitch: 0,
    speed: SPECIES[species].cruiseSpeed,
    turn: 0,
    pitchTarget: 0,
    phase: 0,
    ascent: 0,
    hunger: 0.5,
    health: 1,
    rng: 1,
    px: x,
    py: y,
    pz: z,
    pyaw: yaw,
    ppitch: 0,
    pphase: 0,
  };
}

function landedPellet(x: number, z: number): FoodPellet {
  const pellet = { id: 0, x, y: 0.01, z, vy: 0, age: 0, floatY: 0.3, floatTime: 2, restY: 0.01 };
  return { ...pellet, age: landingAge(pellet) + 1 };
}

function ctx(partial: Partial<BehaviorContext>): BehaviorContext {
  return { seed: 1, time: 0, landedFood: false, fishes: [], obstacles: [], ...partial };
}

/** Épisodes d'une fenêtre : liste des [début, fin) relevés au pas `SIM_DT`. */
function bouts(params: BehaviorParams, seed: number, id: number, from: number, to: number) {
  const found: [number, number][] = [];
  let start = -1;
  for (let t = from; t < to; t += SIM_DT) {
    const on = boutRemaining(params, seed, id, t) > 0;
    if (on && start < 0) {
      start = t;
    } else if (!on && start >= 0) {
      found.push([start, t]);
      start = -1;
    }
  }
  if (start >= 0) {
    found.push([start, to]);
  }
  return found;
}

/** Premier temps (au pas) où l'épisode du poisson est actif. */
function firstActive(params: BehaviorParams, seed: number, id: number): number {
  for (let t = 0; t < 10 * params.period; t += SIM_DT) {
    if (boutRemaining(params, seed, id, t) > 0) {
      return t;
    }
  }
  throw new Error('aucun épisode');
}

describe('comportements : calendrier (#427)', () => {
  it('espèces concernées, et seulement elles', () => {
    expect(Object.keys(SPECIES_BEHAVIORS).sort()).toEqual(
      ['ancistrus', 'corydora', 'gourami', 'gramma', 'otocinclus'].sort(),
    );
    expect(speciesBehavior('neon')).toBeNull();
    expect(speciesBehavior('corydora')?.kind).toBe('fouille');
    expect(speciesBehavior('otocinclus')?.kind).toBe('broutage');
    expect(speciesBehavior('gramma')?.kind).toBe('territoire');
    for (const p of Object.values(SPECIES_BEHAVIORS)) {
      expect(p.minDuration).toBeGreaterThan(0);
      expect(p.maxDuration).toBeLessThanOrEqual(p.period);
    }
  });

  it('déclenchement et durée : un épisode par fenêtre, durée dans les bornes', () => {
    for (const params of [FOUILLE, BROUTAGE, TERRITOIRE]) {
      for (const seed of SEEDS) {
        for (const id of [0, 3, 59]) {
          for (let k = 0; k < 3; k++) {
            const found = bouts(params, seed, id, k * params.period, (k + 1) * params.period);
            expect(found.length).toBe(1);
            const [a, b] = found[0];
            expect(b - a).toBeGreaterThanOrEqual(params.minDuration - 2 * SIM_DT);
            expect(b - a).toBeLessThanOrEqual(params.maxDuration + 2 * SIM_DT);
          }
        }
      }
    }
  });

  it('temps restant décroissant pendant l’épisode', () => {
    const t = firstActive(BROUTAGE, 42, 1);
    const r0 = boutRemaining(BROUTAGE, 42, 1, t);
    expect(boutRemaining(BROUTAGE, 42, 1, t + 1)).toBeCloseTo(r0 - 1, 9);
  });

  it('déterminisme : même graine, même épisode ; graines ou poissons différents, autres épisodes', () => {
    for (let t = 0; t < 120; t += 0.7) {
      expect(boutRemaining(FOUILLE, 42, 2, t)).toBe(boutRemaining(FOUILLE, 42, 2, t));
    }
    const starts = new Set(SEEDS.map((seed) => firstActive(BROUTAGE, seed, 0).toFixed(3)));
    expect(starts.size).toBeGreaterThan(2);
    const byId = new Set([0, 1, 2, 3, 4].map((id) => firstActive(BROUTAGE, 1, id).toFixed(3)));
    expect(byId.size).toBeGreaterThan(2);
  });

  it('temps négatif ou non fini : aucun épisode', () => {
    for (const t of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(boutRemaining(TERRITOIRE, 1, 0, t)).toBe(0);
    }
  });

  it('activeBehavior : fouille seulement avec un granulé posé', () => {
    const cory = fish('corydora', 0, 0, 0.02, 0);
    const t = firstActive(FOUILLE, 7, 0);
    expect(activeBehavior(cory, 7, t, false)).toBeNull();
    expect(activeBehavior(cory, 7, t, true)).toBe('fouille');
    expect(activeBehavior(fish('neon', 0, 0, 0.1, 0), 7, t, true)).toBeNull();
  });

  it('hasLandedFood : granulé posé seulement', () => {
    expect(hasLandedFood([])).toBe(false);
    const p = landedPellet(0, 0);
    expect(hasLandedFood([p])).toBe(true);
    expect(hasLandedFood([{ ...p, age: 0 }])).toBe(false);
  });
});

describe('comportements : points visés (#427)', () => {
  it('fouille : aucune cible sans granulé posé ; sinon le sable devant le museau', () => {
    const b = bounds('corydora');
    const t = firstActive(FOUILLE, 3, 0);
    const cory = fish('corydora', 0, 0, b.hard.minY + 0.03, 0, 0);
    const out = { x: 0, y: 0, z: 0 };
    expect(behaviorTarget(cory, 0.055, 0.03, b, ctx({ seed: 3, time: t }), out)).toBeNull();
    const p = behaviorTarget(
      cory,
      0.055,
      0.03,
      b,
      ctx({ seed: 3, time: t, landedFood: true }),
      out,
    );
    expect(p).not.toBeNull();
    expect(p!.y).toBe(b.hard.minY);
    expect(p!.x).toBeGreaterThan(cory.x);
    // Hors épisode : aucune cible.
    const off = t + FOUILLE.maxDuration + 0.1;
    if (boutRemaining(FOUILLE, 3, 0, off) === 0) {
      expect(
        behaviorTarget(cory, 0.055, 0.03, b, ctx({ seed: 3, time: off, landedFood: true }), out),
      ).toBeNull();
    }
  });

  it('fouille au bord : point visé gardé dans le bac', () => {
    const b = bounds('corydora');
    const t = firstActive(FOUILLE, 3, 0);
    const cory = fish('corydora', 0, b.hard.maxX, b.hard.minY, 0, 0);
    const p = behaviorTarget(cory, 0.055, 0.03, b, ctx({ seed: 3, time: t, landedFood: true }), {
      x: 0,
      y: 0,
      z: 0,
    });
    expect(p!.x).toBe(b.hard.maxX);
  });

  it('broutage : point sur la vitre la plus proche, dans le bac', () => {
    const b = bounds('ancistrus');
    const t = firstActive(BROUTAGE, 5, 1);
    const near = fish('ancistrus', 1, 0, b.hard.minY, b.hard.maxZ - 0.01);
    const p = behaviorTarget(near, 0.1, 0.055, b, ctx({ seed: 5, time: t }), { x: 0, y: 0, z: 0 });
    expect(p!.z).toBe(b.hard.maxZ);
    // Ancistrus : jamais au-dessus de sa hauteur préférée (bas de la vitre).
    expect(p!.y).toBeGreaterThanOrEqual(b.hard.minY);
    expect(p!.y).toBeLessThanOrEqual(Math.max(b.hard.minY, b.preferredMaxY));
    // Otocinclus : monte sur la vitre, sous sa hauteur préférée.
    const ob = bounds('otocinclus');
    const heights = new Set<number>();
    for (const seed of SEEDS) {
      const t = firstActive(BROUTAGE, seed, 2);
      const oto = fish('otocinclus', 2, 0, ob.hard.minY, ob.hard.maxZ - 0.01);
      const q = behaviorTarget(oto, 0.05, 0.03, ob, ctx({ seed, time: t }), { x: 0, y: 0, z: 0 })!;
      expect(q.y).toBeGreaterThanOrEqual(ob.hard.minY);
      expect(q.y).toBeLessThanOrEqual(ob.preferredMaxY);
      heights.add(q.y);
    }
    expect(heights.size).toBeGreaterThan(1);
    expect(Math.abs(p!.x - near.x)).toBeCloseTo(0.05, 9);
    const side = fish('ancistrus', 1, b.hard.minX + 0.01, b.hard.minY, 0);
    const q = behaviorTarget(side, 0.1, 0.055, b, ctx({ seed: 5, time: t }), { x: 0, y: 0, z: 0 });
    expect(q!.x).toBe(b.hard.minX);
  });

  it('broutage : aucune cible dans un bassin non rectangulaire', () => {
    const b = { ...bounds('ancistrus'), outline: {} as never };
    const t = firstActive(BROUTAGE, 5, 1);
    const f = fish('ancistrus', 1, 0, 0.02, 0);
    expect(
      behaviorTarget(f, 0.1, 0.055, b, ctx({ seed: 5, time: t }), { x: 0, y: 0, z: 0 }),
    ).toBeNull();
  });

  it('territoire : centre tiré de la graine, déterministe, hors des obstacles', () => {
    const b = bounds('gourami');
    const a = territoryHome(9, 2, b, [], 0.04, { x: 0, y: 0, z: 0 })!;
    const again = territoryHome(9, 2, b, [], 0.04, { x: 0, y: 0, z: 0 })!;
    expect(again).toEqual(a);
    expect(a.x).toBeGreaterThanOrEqual(b.spawn.minX);
    expect(a.x).toBeLessThanOrEqual(b.spawn.maxX);
    expect(a.y).toBeGreaterThanOrEqual(b.spawn.minY);
    expect(a.y).toBeLessThanOrEqual(b.spawn.maxY);
    const rock: Obstacle = { id: 0, shape: 'sphere', x: a.x, y: a.y, z: a.z, radius: 0.05 };
    const moved = territoryHome(9, 2, b, [rock], 0.04, { x: 0, y: 0, z: 0 });
    expect(moved).not.toBeNull();
    expect(Math.hypot(moved!.x - a.x, moved!.y - a.y, moved!.z - a.z)).toBeGreaterThan(0.05);
  });

  it('territoire : bac encombré (obstacle partout), aucune cible', () => {
    const b = bounds('gourami');
    const huge: Obstacle = { id: 0, shape: 'sphere', x: 0, y: 0.2, z: 0, radius: 5 };
    expect(territoryHome(9, 2, b, [huge], 0.04, { x: 0, y: 0, z: 0 })).toBeNull();
    const g = fish('gourami', 2, 0, 0.2, 0);
    expect(
      behaviorTarget(g, 0.075, 0.04, b, ctx({ seed: 9, obstacles: [huge] }), { x: 0, y: 0, z: 0 }),
    ).toBeNull();
  });

  it('territoire : retour au centre, charge d’un intrus, aucune cible sans intrus', () => {
    const b = bounds('gourami');
    const home = territoryHome(9, 2, b, [], 0.04, { x: 0, y: 0, z: 0 })!;
    const out = { x: 0, y: 0, z: 0 };
    // Loin du centre : retour, épisode ou non.
    const far = fish('gourami', 2, home.x + 2 * TERRITORY_RADIUS, home.y, home.z);
    const back = behaviorTarget(far, 0.075, 0.04, b, ctx({ seed: 9, time: 0 }), out);
    expect(back).toEqual(home);
    const t = firstActive(TERRITOIRE, 9, 2);
    const owner = fish('gourami', 2, home.x, home.y, home.z);
    // Bac sans autre espèce (ou vide) : aucune cible.
    const mate = fish('gourami', 3, home.x + 0.05, home.y, home.z);
    expect(
      behaviorTarget(owner, 0.075, 0.04, b, ctx({ seed: 9, time: t, fishes: [owner, mate] }), out),
    ).toBeNull();
    expect(
      behaviorTarget(owner, 0.075, 0.04, b, ctx({ seed: 9, time: t, fishes: [] }), out),
    ).toBeNull();
    // Intrus dans le rayon : charge.
    const neon = fish('neon', 4, home.x + 0.13, home.y, home.z);
    const charge = behaviorTarget(
      owner,
      0.075,
      0.04,
      b,
      ctx({ seed: 9, time: t, fishes: [owner, neon] }),
      out,
    );
    expect(charge!.x).toBeCloseTo(neon.x, 9);
    // Intrus trop près : arrêt de la charge (jamais de contact voulu).
    const close = fish('neon', 4, home.x + 0.5 * CHARGE_STOP_LENGTHS * 0.075, home.y, home.z);
    expect(
      behaviorTarget(owner, 0.075, 0.04, b, ctx({ seed: 9, time: t, fishes: [owner, close] }), out),
    ).toBeNull();
    // Intrus hors du rayon : ignoré.
    const outside = fish('neon', 4, home.x + 2 * TERRITORY_RADIUS, home.y, home.z);
    expect(
      behaviorTarget(
        owner,
        0.075,
        0.04,
        b,
        ctx({ seed: 9, time: t, fishes: [owner, outside] }),
        out,
      ),
    ).toBeNull();
  });

  it('espèce sans comportement : aucune cible', () => {
    const b = bounds('neon');
    expect(
      behaviorTarget(fish('neon', 0, 0, 0.1, 0), 0.06, 0.04, b, ctx({ landedFood: true }), {
        x: 0,
        y: 0,
        z: 0,
      }),
    ).toBeNull();
  });
});

function runWorld(world: MutableWorld, steps: number, each: (w: World) => void): void {
  for (let i = 0; i < steps; i++) {
    advanceInPlace(world, 1);
    each(world);
  }
}

describe('comportements dans le monde (#427)', () => {
  it('broutage : collé à la vitre pendant l’épisode, plus loin hors épisode', () => {
    for (const seed of [1, 42, 777]) {
      const world = createWorld(seed, [
        { species: 'ancistrus', count: 2 },
        { species: 'otocinclus', count: 6 },
      ]) as MutableWorld;
      let inSum = 0;
      let inN = 0;
      let outSum = 0;
      let outN = 0;
      runWorld(world, Math.round(120 / SIM_DT), (w) => {
        for (const f of w.entities) {
          const b = bounds(f.species);
          const d = Math.min(
            f.x - b.hard.minX,
            b.hard.maxX - f.x,
            f.z - b.hard.minZ,
            b.hard.maxZ - f.z,
          );
          if (activeBehavior(f, w.seed, w.time, false) !== null) {
            inSum += d;
            inN++;
          } else {
            outSum += d;
            outN++;
          }
        }
      });
      expect(inN).toBeGreaterThan(0);
      expect(inSum / inN).toBeLessThan(0.025);
      expect(outSum / outN).toBeGreaterThan(2 * (inSum / inN));
    }
  });

  it('fouille : au ras du sable quand un granulé est posé', () => {
    for (const seed of [1, 42, 777]) {
      const world = createWorld(seed, [{ species: 'corydora', count: 6 }]) as MutableWorld;
      advanceInPlace(world, 600);
      feedInPlace(world, 0.3, 0.1);
      const floor = bounds('corydora').hard.minY;
      let sum = 0;
      let n = 0;
      runWorld(world, 1800, (w) => {
        if (!hasLandedFood(w.food)) {
          return;
        }
        for (const f of w.entities) {
          if (activeBehavior(f, w.seed, w.time, true) !== null) {
            sum += f.y - floor;
            n++;
          }
        }
      });
      expect(n).toBeGreaterThan(0);
      expect(sum / n).toBeLessThan(0.05);
    }
  });

  it('territoire : le gourami reste près de son centre, sans blesser ses voisins', () => {
    for (const seed of [1, 42, 777]) {
      const world = createWorld(seed, [
        { species: 'gourami', count: 2 },
        { species: 'neon', count: 10 },
      ]) as MutableWorld;
      // Repus au départ : seule une blessure due au comportement pourrait baisser la santé.
      for (const f of world.entities as unknown as { hunger: number }[]) {
        f.hunger = 0;
      }
      let near = 0;
      let n = 0;
      runWorld(world, Math.round(120 / SIM_DT), (w) => {
        for (const f of w.entities) {
          if (f.species !== 'gourami') {
            continue;
          }
          const home = territoryHome(w.seed, f.id, bounds('gourami'), w.obstacles, 0.04, {
            x: 0,
            y: 0,
            z: 0,
          })!;
          n++;
          if (Math.hypot(f.x - home.x, f.y - home.y, f.z - home.z) < 1.2 * TERRITORY_RADIUS) {
            near++;
          }
        }
      });
      expect(near / n).toBeGreaterThan(0.7);
      for (const f of world.entities) {
        expect(f.health).toBe(1);
      }
    }
  });

  it('gramma au récif : territoire tenu malgré les coraux', () => {
    const world = createWorld(
      4,
      [
        { species: 'gramma', count: 2 },
        { species: 'chromis', count: 7 },
      ],
      [],
      [],
      'recif',
    ) as MutableWorld;
    let near = 0;
    let n = 0;
    runWorld(world, Math.round(90 / SIM_DT), (w) => {
      for (const f of w.entities) {
        if (f.species !== 'gramma') {
          continue;
        }
        const home = territoryHome(w.seed, f.id, bounds('gramma', 'recif'), w.obstacles, 0.05, {
          x: 0,
          y: 0,
          z: 0,
        });
        if (home !== null) {
          n++;
          if (Math.hypot(f.x - home.x, f.y - home.y, f.z - home.z) < 1.5 * TERRITORY_RADIUS) {
            near++;
          }
        }
      }
    });
    expect(n).toBeGreaterThan(0);
    expect(near / n).toBeGreaterThan(0.6);
  });

  it('déterminisme : même graine et mêmes actions, même monde', () => {
    const make = () => {
      const w = createWorld(11, [
        { species: 'corydora', count: 6 },
        { species: 'ancistrus', count: 1 },
        { species: 'gourami', count: 2 },
        { species: 'neon', count: 6 },
      ]) as MutableWorld;
      advanceInPlace(w, 300);
      feedInPlace(w, 0, 0);
      advanceInPlace(w, 2400);
      return JSON.stringify(w);
    };
    expect(make()).toBe(make());
  });

  it('bac vide et bac plein : aucun état invalide', () => {
    const empty = createWorld(1, []) as MutableWorld;
    advanceInPlace(empty, 120);
    expect(empty.entities.length).toBe(0);
    const each = Math.floor(MAX_TOTAL_FISH / 5);
    const full = createWorld(2, [
      { species: 'corydora', count: each },
      { species: 'ancistrus', count: each },
      { species: 'otocinclus', count: each },
      { species: 'gourami', count: each },
      { species: 'neon', count: MAX_TOTAL_FISH - 4 * each },
    ]) as MutableWorld;
    feedInPlace(full, 0, 0);
    advanceInPlace(full, 1200);
    const water = environmentWater('tropical');
    for (const f of full.entities) {
      expect(Number.isFinite(f.x + f.y + f.z + f.yaw + f.pitch)).toBe(true);
      expect(f.y).toBeGreaterThanOrEqual(water.minY);
      expect(f.y).toBeLessThanOrEqual(water.maxY);
    }
  });
});

describe('gestes du rendu et « Réduire les mouvements » (#427)', () => {
  const out: BehaviorGesture = { pitch: 0, yaw: 0 };

  it('sans comportement : geste nul', () => {
    expect(behaviorGesture(null, 3, 0, 1, out)).toEqual({ pitch: 0, yaw: 0 });
  });

  it('mouvements normaux : la fouille hoche, la défense frémit', () => {
    const pitches = new Set<number>();
    const yaws = new Set<number>();
    for (let t = 0; t < 1; t += 0.05) {
      pitches.add(behaviorGesture('fouille', t, 1, FULL_MOTION.behaviorGesture, out).pitch);
      expect(out.pitch).toBeLessThanOrEqual(-FORAGE_TILT + FORAGE_BOB);
      yaws.add(behaviorGesture('territoire', t, 1, FULL_MOTION.behaviorGesture, out).yaw);
      expect(Math.abs(out.yaw)).toBeLessThanOrEqual(DISPLAY_QUIVER);
    }
    expect(pitches.size).toBeGreaterThan(5);
    expect(yaws.size).toBeGreaterThan(5);
  });

  it('mouvements réduits : plus aucun geste mobile, la posture reste', () => {
    expect(REDUCED_MOTION.behaviorGesture).toBe(0);
    for (let t = 0; t < 2; t += 0.1) {
      expect(behaviorGesture('fouille', t, 3, REDUCED_MOTION.behaviorGesture, out)).toEqual({
        pitch: -FORAGE_TILT,
        yaw: 0,
      });
      expect(behaviorGesture('broutage', t, 3, REDUCED_MOTION.behaviorGesture, out).yaw).toBe(0);
      expect(behaviorGesture('territoire', t, 3, REDUCED_MOTION.behaviorGesture, out).yaw).toBe(0);
    }
  });

  it('facteur invalide : traité comme coupé', () => {
    expect(behaviorGesture('broutage', 0.1, 0, Number.NaN, out).yaw).toBe(0);
  });
});

describe('fiches : ligne « Comportement » (#427)', () => {
  it('une ligne pour chaque espèce à comportement, marquée approximation de jeu', () => {
    for (const id of Object.keys(SPECIES) as SpeciesId[]) {
      const row = sheetRows(id).find((r) => r.field === 'behavior');
      if (speciesBehavior(id) === null) {
        expect(row, id).toBeUndefined();
        expect(SPECIES_BEHAVIOR_TEXT[id]).toBeUndefined();
      } else {
        expect(row?.label).toBe('Comportement');
        expect(row?.value.trim()).not.toBe('');
        expect(row?.status).toBe('Approximation de jeu');
      }
    }
  });
});
