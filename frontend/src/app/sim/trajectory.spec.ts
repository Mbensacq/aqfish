import { SIM_DT } from './constants';
import { CORYDORA, NEON } from './species';
import { waterVolume, type Box3 } from './tank';
import {
  glassClearance,
  glassStats,
  median,
  recordTrajectories,
  type Trajectory,
} from './trajectory';
import { advance, createDefaultWorld, createWorld } from './world';

const BOX: Box3 = { minX: -1, maxX: 1, minY: 0, maxY: 1, minZ: -0.5, maxZ: 0.5 };

describe('recordTrajectories', () => {
  it('un point au départ, puis un tous les `every` pas, et au dernier pas', () => {
    const world = createWorld(42, [{ species: 'neon', count: 3 }]);
    const traces = recordTrajectories(world, 10, 4);
    expect(traces.map((t) => t.id)).toEqual(world.entities.map((f) => f.id));
    expect(traces.every((t) => t.species === 'neon')).toBe(true);
    // Départ, pas 4, pas 8, pas 10.
    expect(traces[0].points).toHaveLength(4);
    const end = advance(world, 10);
    expect(traces[1].points[0]).toEqual({ x: world.entities[1].x, z: world.entities[1].z });
    expect(traces[1].points[3]).toEqual({ x: end.entities[1].x, z: end.entities[1].z });
    expect(traces[1].points[1]).toEqual({
      x: advance(world, 4).entities[1].x,
      z: advance(world, 4).entities[1].z,
    });
  });

  it('ne modifie pas le monde donné', () => {
    const world = createDefaultWorld(7);
    const snapshot = JSON.stringify(world);
    recordTrajectories(world, 30, 5);
    expect(JSON.stringify(world)).toBe(snapshot);
  });

  it('0 pas : seulement les positions de départ ; monde vide : aucune trajectoire', () => {
    const world = createWorld(1, [{ species: 'guppy', count: 2 }]);
    const traces = recordTrajectories(world, 0);
    expect(traces.map((t) => t.points.length)).toEqual([1, 1]);
    expect(recordTrajectories(createWorld(1, []), 20)).toEqual([]);
  });

  it('refuse un nombre de pas ou un intervalle invalide', () => {
    const world = createWorld(1, [{ species: 'neon', count: 1 }]);
    for (const steps of [-1, 1.5, Number.NaN]) {
      expect(() => recordTrajectories(world, steps)).toThrow(RangeError);
    }
    for (const every of [0, -2, 0.5, Number.POSITIVE_INFINITY]) {
      expect(() => recordTrajectories(world, 10, every)).toThrow(RangeError);
    }
  });
});

describe('glassClearance', () => {
  it('distance à la vitre la plus proche, dans le plan horizontal', () => {
    expect(glassClearance(0, 0, BOX)).toBeCloseTo(0.5);
    expect(glassClearance(0.9, 0, BOX)).toBeCloseTo(0.1);
    expect(glassClearance(-0.95, 0.45, BOX)).toBeCloseTo(0.05);
    expect(glassClearance(0, -0.5, BOX)).toBe(0);
  });

  it('négative hors du volume', () => {
    expect(glassClearance(1.2, 0, BOX)).toBeCloseTo(-0.2);
    expect(glassClearance(0, -0.6, BOX)).toBeCloseTo(-0.1);
  });
});

describe('median', () => {
  it('impair, pair, non trié, un seul élément', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([5])).toBe(5);
  });

  it('ne trie pas la liste donnée ; liste vide refusée', () => {
    const values = [3, 1, 2];
    median(values);
    expect(values).toEqual([3, 1, 2]);
    expect(() => median([])).toThrow(RangeError);
  });
});

describe('glassStats', () => {
  const trace = (points: [number, number][]): Trajectory => ({
    id: 0,
    species: 'neon',
    points: points.map(([x, z]) => ({ x, z })),
  });

  it('minimum par trajectoire, médiane, minimum global, fraction proche', () => {
    const stats = glassStats(
      [
        trace([
          [0, 0],
          [0.95, 0],
        ]),
        trace([[0, 0.3]]),
        trace([
          [0, 0.45],
          [0, 0],
        ]),
      ],
      BOX,
      0.1,
    );
    expect(stats.minimums.map((m) => Number(m.toFixed(6)))).toEqual([0.05, 0.2, 0.05]);
    expect(stats.medianMinimum).toBeCloseTo(0.05);
    expect(stats.overallMinimum).toBeCloseTo(0.05);
    expect(stats.nearFraction).toBeCloseTo(2 / 5);
  });

  it('ignore les trajectoires vides ; aucune position : refusé', () => {
    expect(glassStats([trace([]), trace([[0, 0]])], BOX, 0.1).minimums).toHaveLength(1);
    expect(() => glassStats([], BOX, 0.1)).toThrow(RangeError);
    expect(() => glassStats([trace([])], BOX, 0.1)).toThrow(RangeError);
  });
});

/**
 * Issue #43 : les poissons nageaient trop loin des vitres (distance minimale ≥ 10 cm relevée
 * par la QA au cycle 9). Relevé sur 60 s (un point tous les 4 pas), graines 1, 42 et
 * 2³² − 1 : avant réglage (`main`, cycle 12), médiane des distances minimales aux vitres
 * 10,5 / 10,8 / 10,6 cm et 0,1 à 0,2 % des positions à moins de 10 cm d'une vitre ; après
 * (`wallMargin` 4 cm, `AVOID_ZONE` 7 cm, naissance inchangée), 9,0 / 8,8 / 9,0 cm et 9 à
 * 15 %. La distance minimale reste supérieure à `wallMargin` (centre jamais plaqué sur la
 * limite de nage) ; l'absence de demi-tour brusque est gardée par `world.spec.ts`.
 * Durée simulée limitée à 60 s : un test plus long charge le processeur pendant que le test
 * de durée de `flocking.spec.ts` s'exécute en parallèle (CI rouge à 300 puis 120 s, PR #54).
 */
describe('distance aux vitres du monde par défaut (#43)', () => {
  const water = waterVolume();
  const steps = Math.round(60 / SIM_DT);

  it.each([1, 42, 0xffffffff])(
    'graine %s, 60 s : longe les vitres de plus près, sans les toucher',
    (seed) => {
      const traces = recordTrajectories(createDefaultWorld(seed), steps, 4);
      // Mesure de #43 sur les mêmes poissons qu'au cycle 13 (néons et guppys) : les corydoras
      // (#31), ajoutés en fin de peuplement, ne changent ni leurs identifiants ni leurs
      // trajectoires (banc entre congénères) ; ils sont vérifiés à part, avec leur marge.
      const stats = glassStats(
        traces.filter((t) => t.species !== 'corydora'),
        water,
        0.1,
      );
      expect(stats.medianMinimum).toBeLessThan(0.095);
      expect(stats.nearFraction).toBeGreaterThan(0.04);
      expect(stats.overallMinimum).toBeGreaterThan(NEON.wallMargin);
      const corydoras = glassStats(
        traces.filter((t) => t.species === 'corydora'),
        water,
        0.1,
      );
      expect(corydoras.overallMinimum).toBeGreaterThan(CORYDORA.wallMargin);
    },
    30_000,
  );
});
