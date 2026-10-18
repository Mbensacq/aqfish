import type { SpeciesId } from './species';
import type { Box3 } from './tank';
import { advanceInPlace, type MutableWorld, type World } from './world';

/**
 * Relevé de trajectoires (issue #43) : outil de mesure et de preuve visuelle d'un
 * comportement de nage, sans effet sur la simulation. Fonctions pures : le monde donné
 * n'est jamais modifié (copie JSON, ADR 0003).
 */

/** Point d'une trajectoire vue de dessus : position horizontale, en mètres. */
export interface TracePoint {
  readonly x: number;
  readonly z: number;
}

/** Trajectoire d'un poisson. */
export interface Trajectory {
  readonly id: number;
  readonly species: SpeciesId;
  readonly points: readonly TracePoint[];
}

/**
 * Avance une copie de `world` de `steps` pas fixes et relève, pour chaque poisson, sa
 * position horizontale au départ puis tous les `every` pas (et au dernier pas).
 * @throws RangeError si `steps` n'est pas un entier ≥ 0 ou `every` un entier ≥ 1.
 */
export function recordTrajectories(world: World, steps: number, every = 1): Trajectory[] {
  if (!Number.isInteger(steps) || steps < 0) {
    throw new RangeError(`steps doit être un entier positif ou nul (reçu : ${steps})`);
  }
  if (!Number.isInteger(every) || every < 1) {
    throw new RangeError(`every doit être un entier ≥ 1 (reçu : ${every})`);
  }
  const copy = JSON.parse(JSON.stringify(world)) as MutableWorld;
  const points: TracePoint[][] = copy.entities.map((f) => [{ x: f.x, z: f.z }]);
  for (let done = 0; done < steps;) {
    const n = Math.min(every, steps - done);
    advanceInPlace(copy, n);
    done += n;
    copy.entities.forEach((f, i) => points[i].push({ x: f.x, z: f.z }));
  }
  return copy.entities.map((f, i) => ({ id: f.id, species: f.species, points: points[i] }));
}

/**
 * Distance horizontale d'un point aux vitres (les quatre faces verticales de `water`), en
 * mètres : négative hors du volume.
 */
export function glassClearance(x: number, z: number, water: Box3): number {
  return Math.min(x - water.minX, water.maxX - x, z - water.minZ, water.maxZ - z);
}

/** Médiane d'une liste de nombres (moyenne des deux valeurs centrales si paire). */
export function median(values: readonly number[]): number {
  if (values.length === 0) {
    throw new RangeError('median : liste vide');
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Statistiques de distance aux vitres d'un ensemble de trajectoires. */
export interface GlassStats {
  /** Distance minimale aux vitres de chaque trajectoire, dans l'ordre des trajectoires. */
  readonly minimums: readonly number[];
  /** Médiane des distances minimales. */
  readonly medianMinimum: number;
  /** Plus petite distance relevée. */
  readonly overallMinimum: number;
  /** Fraction des points relevés à moins de `near` mètres d'une vitre, dans [0, 1]. */
  readonly nearFraction: number;
}

/**
 * Distances aux vitres de `trajectories` dans le volume `water`. `near` : seuil de
 * proximité, en mètres, pour `nearFraction`.
 * @throws RangeError si aucune trajectoire n'a de point.
 */
export function glassStats(
  trajectories: readonly Trajectory[],
  water: Box3,
  near: number,
): GlassStats {
  const minimums: number[] = [];
  let count = 0;
  let nearCount = 0;
  for (const { points } of trajectories) {
    if (points.length === 0) {
      continue;
    }
    let min = Infinity;
    for (const { x, z } of points) {
      const d = glassClearance(x, z, water);
      min = Math.min(min, d);
      count++;
      if (d < near) {
        nearCount++;
      }
    }
    minimums.push(min);
  }
  if (count === 0) {
    throw new RangeError('glassStats : aucune position relevée');
  }
  return {
    minimums,
    medianMinimum: median(minimums),
    overallMinimum: Math.min(...minimums),
    nearFraction: nearCount / count,
  };
}
