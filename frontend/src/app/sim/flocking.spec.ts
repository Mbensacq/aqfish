import { SIM_DT } from './constants';
import {
  alignment,
  cohesion,
  computeSchoolSteering,
  enforceMinDistance,
  heading,
  schoolSteering,
  separation,
  speciesSchooling,
  type SchoolingLookup,
  type Vec3,
} from './flocking';
import { NEON, type SchoolingParams, type SpeciesId } from './species';
import { createFish, stepFish, swimBounds, type Fish } from './swimmer';
import { waterVolume } from './tank';
import { advance, advanceInPlace, createWorld, type MutableWorld } from './world';

type MutableFish = { -readonly [K in keyof Fish]: Fish[K] };

const BOUNDS = swimBounds(NEON, waterVolume());
const SCHOOLING = NEON.schooling as SchoolingParams;

/** Poisson de test : position et orientation données, le reste neutre. */
function fish(id: number, x: number, y: number, z: number, yaw = 0, pitch = 0): MutableFish {
  return {
    ...createFish(1, id, 'neon', BOUNDS),
    x,
    y,
    z,
    yaw,
    pitch,
  } as MutableFish;
}

function vec(): Vec3 {
  return { x: Number.NaN, y: Number.NaN, z: Number.NaN };
}

function expectVec(v: Vec3, x: number, y: number, z: number): void {
  expect(v.x).toBeCloseTo(x, 12);
  expect(v.y).toBeCloseTo(y, 12);
  expect(v.z).toBeCloseTo(z, 12);
}

function distance(a: Fish, b: Fish): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

describe('heading', () => {
  it('suit la convention de sim/swimmer.ts', () => {
    expectVec(heading(fish(0, 0, 0, 0, 0, 0), vec()), 1, 0, 0);
    expectVec(heading(fish(0, 0, 0, 0, Math.PI / 2, 0), vec()), 0, 0, 1);
    const p = 0.3;
    expectVec(heading(fish(0, 0, 0, 0, Math.PI, p), vec()), -Math.cos(p), Math.sin(p), 0);
  });
});

describe('separation', () => {
  it('valeurs exactes : poids radius / d - 1, vecteur qui s’éloigne', () => {
    const self = fish(0, 0, 0, 0);
    const others = [self, fish(1, 0.03, 0, 0), fish(2, 0, 0.02, 0)];
    // d = 0,03 → 0,06 / 0,03 - 1 = 1 vers −X ; d = 0,02 → 2 vers −Y.
    expectVec(separation(self, others, 0.06, vec()), -1, -2, 0);
  });

  it('ignore le poisson lui-même, les voisins au bord du rayon ou au-delà, les autres espèces', () => {
    const self = fish(0, 0, 0, 0);
    const other = { ...fish(1, 0.01, 0, 0), species: 'autre' as SpeciesId };
    const out = separation(
      self,
      [self, fish(2, 0.06, 0, 0), fish(3, 0, 0, -0.5), other],
      0.06,
      vec(),
    );
    expectVec(out, 0, 0, 0);
  });

  it('sans voisin : vecteur nul, écrit dans out et renvoyé', () => {
    const out = vec();
    expect(separation(fish(0, 0, 0, 0), [], 0.05, out)).toBe(out);
    expectVec(out, 0, 0, 0);
  });

  it('deux poissons confondus s’écartent selon X, en sens opposés', () => {
    const a = fish(3, 0.1, 0.2, 0.1);
    const b = fish(7, 0.1, 0.2, 0.1);
    expectVec(separation(a, [a, b], 0.05, vec()), -1, 0, 0);
    expectVec(separation(b, [a, b], 0.05, vec()), 1, 0, 0);
  });
});

describe('alignment', () => {
  it('valeurs exactes : cap moyen des voisins moins le cap propre', () => {
    const self = fish(0, 0, 0, 0, 0, 0);
    const others = [self, fish(1, 0.1, 0, 0, Math.PI / 2), fish(2, 0, 0.1, 0, Math.PI / 2)];
    expectVec(alignment(self, others, 0.3, vec()), -1, 0, 1);
  });

  it('moyenne de caps différents, inclinaison comprise', () => {
    const self = fish(0, 0, 0, 0, 0, 0);
    const p = 0.2;
    const others = [fish(1, 0.1, 0, 0, 0, p), fish(2, -0.1, 0, 0, Math.PI, 0)];
    // ((cos p, sin p, 0) + (−1, 0, 0)) / 2 − (1, 0, 0)
    expectVec(alignment(self, others, 0.3, vec()), (Math.cos(p) - 1) / 2 - 1, Math.sin(p) / 2, 0);
  });

  it('voisins tous alignés, ou aucun voisin : vecteur nul', () => {
    const self = fish(0, 0, 0, 0, 0.7, 0.1);
    expectVec(alignment(self, [self, fish(1, 0.1, 0, 0, 0.7, 0.1)], 0.3, vec()), 0, 0, 0);
    expectVec(alignment(self, [self, fish(1, 0.3, 0, 0, 2)], 0.3, vec()), 0, 0, 0);
  });
});

describe('cohesion', () => {
  it('valeurs exactes : vers le barycentre des voisins, divisé par le rayon', () => {
    const self = fish(0, 0, 0, 0);
    const others = [self, fish(1, 0.1, 0, 0), fish(2, 0.1, 0.2, 0), fish(3, 0.5, 0, 0)];
    // Barycentre de (0,1 ; 0 ; 0) et (0,1 ; 0,2 ; 0), le troisième est hors rayon.
    expectVec(cohesion(self, others, 0.3, vec()), 1 / 3, 1 / 3, 0);
  });

  it('aucun voisin : vecteur nul', () => {
    const self = fish(0, 0.2, 0.2, 0);
    expectVec(cohesion(self, [self], 0.3, vec()), 0, 0, 0);
  });
});

describe('schoolSteering', () => {
  it('somme pondérée exacte des trois règles', () => {
    const params: SchoolingParams = {
      ...SCHOOLING,
      neighborRadius: 0.3,
      separationRadius: 0.06,
      separationWeight: 2,
      alignmentWeight: 3,
      cohesionWeight: 5,
    };
    const self = fish(0, 0, 0, 0, 0, 0);
    // Un seul voisin, à 0,03 sur X, de cap +Z : séparation (−1, 0, 0), alignement
    // (−1, 0, 1), cohésion (0,1, 0, 0).
    const others = [self, fish(1, 0.03, 0, 0, Math.PI / 2)];
    const out = schoolSteering(self, others, params, vec());
    expectVec(out, -2 - 3 + 0.5, 0, 3);
  });
});

describe('computeSchoolSteering', () => {
  it('écrit le pilotage de chaque poisson à l’indice 3·i', () => {
    const fishes = [fish(0, 0, 0.2, 0), fish(1, 0.1, 0.2, 0), fish(2, 1, 0.2, 0)];
    const out = new Float64Array(9).fill(Number.NaN);
    computeSchoolSteering(fishes, out);
    const expected = schoolSteering(fishes[1], fishes, SCHOOLING, vec());
    expect([out[3], out[4], out[5]]).toEqual([expected.x, expected.y, expected.z]);
    // Le poisson isolé (à 1 m) n'a aucun voisin.
    expect([out[6], out[7], out[8]]).toEqual([0, 0, 0]);
  });

  it('espèce solitaire : pilotage nul', () => {
    const fishes = [fish(0, 0, 0.2, 0), fish(1, 0.01, 0.2, 0)];
    const out = new Float64Array(6).fill(Number.NaN);
    computeSchoolSteering(fishes, out, () => null);
    expect(Array.from(out)).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('ne dépend pas de l’ordre du tableau (au pilotage près de chaque poisson)', () => {
    const fishes = [fish(0, 0, 0.2, 0, 0.3), fish(1, 0.04, 0.22, 0.01, 1), fish(2, 0.1, 0.2, 0, 2)];
    const reversed = [...fishes].reverse();
    const a = new Float64Array(9);
    const b = new Float64Array(9);
    computeSchoolSteering(fishes, a);
    computeSchoolSteering(reversed, b);
    for (let i = 0; i < 3; i++) {
      for (let k = 0; k < 3; k++) {
        expect(b[3 * (2 - i) + k]).toBeCloseTo(a[3 * i + k], 12);
      }
    }
  });

  it('refuse un tampon trop court ; tableau vide accepté', () => {
    expect(() => computeSchoolSteering([fish(0, 0, 0, 0)], new Float64Array(2))).toThrow(
      RangeError,
    );
    expect(() => computeSchoolSteering([], new Float64Array(0))).not.toThrow();
  });

  it('lit les paramètres de la définition d’espèce par défaut', () => {
    expect(speciesSchooling(fish(0, 0, 0, 0))).toBe(NEON.schooling);
  });
});

describe('enforceMinDistance', () => {
  const min = SCHOOLING.minDistance;
  const boundsOf = (): typeof BOUNDS => BOUNDS;

  it('écarte symétriquement une paire trop proche, exactement à la distance minimale', () => {
    const a = fish(0, 0, 0.2, 0);
    const b = fish(1, 0.005, 0.2, 0);
    enforceMinDistance([a, b], boundsOf);
    expect(distance(a, b)).toBeCloseTo(min, 12);
    expect((a.x + b.x) / 2).toBeCloseTo(0.0025, 12);
    expect(a.y).toBe(0.2);
    expect(b.z).toBe(0);
  });

  it('centres confondus : écart selon X, le plus petit identifiant vers −X', () => {
    const a = fish(4, 0.1, 0.2, 0.05);
    const b = fish(2, 0.1, 0.2, 0.05);
    enforceMinDistance([a, b], boundsOf);
    expect(b.x).toBeCloseTo(0.1 - min / 2, 12);
    expect(a.x).toBeCloseTo(0.1 + min / 2, 12);
  });

  it('ne touche ni une paire assez espacée, ni une espèce solitaire', () => {
    const a = fish(0, 0, 0.2, 0);
    const b = fish(1, min, 0.2, 0);
    enforceMinDistance([a, b], boundsOf);
    expect([a.x, b.x]).toEqual([0, min]);
    const c = fish(2, 0, 0.2, 0);
    const d = fish(3, 0.001, 0.2, 0);
    enforceMinDistance([c, d], boundsOf, () => null);
    expect([c.x, d.x]).toEqual([0, 0.001]);
  });

  it('ne touche pas une paire d’espèces différentes', () => {
    const a = fish(0, 0, 0.2, 0);
    const b = { ...fish(1, 0.001, 0.2, 0), species: 'autre' as SpeciesId };
    enforceMinDistance([a, b], boundsOf, () => SCHOOLING);
    expect([a.x, b.x]).toEqual([0, 0.001]);
  });

  it('ne sort jamais un poisson de ses bornes', () => {
    const { hard } = BOUNDS;
    const a = fish(0, hard.minX, 0.2, 0);
    const b = fish(1, hard.minX, 0.2, 0);
    enforceMinDistance([a, b], boundsOf);
    expect(a.x).toBe(hard.minX);
    expect(b.x).toBeCloseTo(hard.minX + min / 2, 12);
  });
});

/**
 * Banc simulé hors du monde, avec des paramètres de banc au choix : même boucle que
 * `stepInPlace` (`sim/world.ts`), vérifiée par le premier test ci-dessous.
 */
function simulateSchool(
  seed: number,
  count: number,
  steps: number,
  lookup: SchoolingLookup,
): MutableFish[] {
  const fishes: MutableFish[] = [];
  for (let id = 0; id < count; id++) {
    fishes.push(createFish(seed, id, 'neon', BOUNDS) as MutableFish);
  }
  const steering = new Float64Array(count * 3);
  for (let s = 0; s < steps; s++) {
    computeSchoolSteering(fishes, steering, lookup);
    for (let i = 0; i < count; i++) {
      stepFish(
        fishes[i],
        SIM_DT,
        BOUNDS,
        steering[3 * i],
        steering[3 * i + 1],
        steering[3 * i + 2],
      );
    }
    enforceMinDistance(fishes, () => BOUNDS, lookup);
  }
  return fishes;
}

function meanNearestNeighbor(fishes: readonly Fish[]): number {
  let sum = 0;
  for (const a of fishes) {
    let nearest = Number.POSITIVE_INFINITY;
    for (const b of fishes) {
      if (a !== b) {
        nearest = Math.min(nearest, distance(a, b));
      }
    }
    sum += nearest;
  }
  return sum / fishes.length;
}

describe('banc de néons (monde complet)', () => {
  const TWENTY_SECONDS = Math.round(20 / SIM_DT);
  const SEEDS = [1, 2, 3, 7, 42, 99, 1234, 2026];

  it('la boucle de test reproduit exactement celle du monde', () => {
    const world = advance(createWorld(11, [{ species: 'neon', count: 12 }]), 300);
    expect(simulateSchool(11, 12, 300, speciesSchooling)).toEqual(world.entities);
  });

  it('même graine et même nombre de pas ⇒ états identiques', () => {
    const a = advance(createWorld(77, [{ species: 'neon', count: 12 }]), 1200);
    const b = advance(createWorld(77, [{ species: 'neon', count: 12 }]), 1200);
    expect(b).toEqual(a);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it.each(SEEDS)(
    'graine %i : après 20 s, plus groupé que sans cohésion, et aucune paire ne se recouvre',
    (seed) => {
      const school = simulateSchool(seed, 12, TWENTY_SECONDS, speciesSchooling);
      const noCohesion: SchoolingParams = { ...SCHOOLING, cohesionWeight: 0 };
      const loose = simulateSchool(seed, 12, TWENTY_SECONDS, () => noCohesion);
      expect(meanNearestNeighbor(school)).toBeLessThan(meanNearestNeighbor(loose));
      for (let i = 0; i < school.length; i++) {
        for (let j = i + 1; j < school.length; j++) {
          expect(distance(school[i], school[j])).toBeGreaterThanOrEqual(
            SCHOOLING.minDistance - 1e-12,
          );
        }
      }
    },
  );

  it('en moyenne sur les graines, le banc resserre nettement les voisins (au moins 25 %)', () => {
    let school = 0;
    let loose = 0;
    const noCohesion: SchoolingParams = { ...SCHOOLING, cohesionWeight: 0 };
    for (const seed of SEEDS) {
      school += meanNearestNeighbor(simulateSchool(seed, 12, TWENTY_SECONDS, speciesSchooling));
      loose += meanNearestNeighbor(simulateSchool(seed, 12, TWENTY_SECONDS, () => noCohesion));
    }
    expect(school).toBeLessThan(loose * 0.75);
  });

  it('60 poissons : une minute simulée en place, mêmes objets, tick exact', () => {
    const world = createWorld(5, [{ species: 'neon', count: 60 }]) as MutableWorld;
    const entities = world.entities;
    const first = entities[0];
    advanceInPlace(world, 3600);
    expect(world.entities).toBe(entities);
    expect(world.entities[0]).toBe(first);
    expect(world.tick).toBe(3600);
  });

  // Mesure relative plutôt qu'une borne en millisecondes (#54, action 3 de la rétro #53) :
  // une borne absolue dépendait de la charge du runner et des fichiers exécutés en parallèle
  // (5,16 s > 5 s en CI). Les deux tailles de banc sont mesurées dans le même test, en
  // alternance, et l'on garde le minimum de plusieurs essais : une charge extérieure touche
  // les deux mesures de la même façon. Quadrupler le banc coûte au plus 16× en O(n²)
  // (≈ 11× mesuré en local, les parties linéaires comptant aussi) ; une complexité O(n³)
  // donnerait au moins 64×. La borne 40 sépare nettement les deux régimes.
  it('le coût par pas reste au plus quadratique en nombre de poissons', () => {
    const steps = 600;
    const runs = 5;
    const small = createWorld(5, [{ species: 'neon', count: 15 }]) as MutableWorld;
    const large = createWorld(5, [{ species: 'neon', count: 60 }]) as MutableWorld;
    advanceInPlace(small, 60); // échauffement (tampons et JIT)
    advanceInPlace(large, 60);
    let smallBest = Infinity;
    let largeBest = Infinity;
    for (let run = 0; run < runs; run++) {
      let start = performance.now();
      advanceInPlace(small, steps);
      smallBest = Math.min(smallBest, performance.now() - start);
      start = performance.now();
      advanceInPlace(large, steps);
      largeBest = Math.min(largeBest, performance.now() - start);
    }
    expect(smallBest).toBeGreaterThan(0);
    expect(largeBest / smallBest).toBeLessThan(40);
  }, 30_000);
});
