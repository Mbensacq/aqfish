import type { Vec3 } from './flocking';

/**
 * Obstacles du bac : **données** pures, sérialisables en JSON (ADR 0003, ADR 0012), jamais
 * codées en dur dans la scène.
 *
 * Toute forme d'obstacle se ramène à une **distance signée** à sa surface (négative à
 * l'intérieur) et à une **normale** unitaire sortante (`obstacleDistance`). La sphère est la
 * première forme ; une forme plus fine (branches, racines : idée #34) n'aura qu'à ajouter
 * une variante à `Obstacle` et un cas à `obstacleDistance`.
 */

/** Obstacle sphérique (rocher, en attendant une forme plus fine). Unités : mètres. */
export interface SphereObstacle {
  /** Identifiant unique dans le monde, entier positif ou nul. */
  readonly id: number;
  readonly shape: 'sphere';
  /** Centre. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Rayon, strictement positif. */
  readonly radius: number;
}

/** Obstacle du bac (union discriminée par `shape`). */
export type Obstacle = SphereObstacle;

/**
 * Crée un obstacle sphérique.
 * @throws RangeError si l'identifiant n'est pas un entier positif ou nul, si une coordonnée
 * n'est pas finie, ou si le rayon n'est pas un réel strictement positif.
 */
export function sphereObstacle(
  id: number,
  x: number,
  y: number,
  z: number,
  radius: number,
): SphereObstacle {
  const obstacle: SphereObstacle = { id, shape: 'sphere', x, y, z, radius };
  const problems = validateObstacle(obstacle);
  if (problems.length > 0) {
    throw new RangeError(problems.join(' ; '));
  }
  return obstacle;
}

/** Problèmes de cohérence d'un obstacle (liste vide s'il est valide). */
export function validateObstacle(obstacle: Obstacle): string[] {
  const problems: string[] = [];
  if (!Number.isInteger(obstacle.id) || obstacle.id < 0) {
    problems.push(`id doit être un entier positif ou nul (reçu : ${obstacle.id})`);
  }
  if (obstacle.shape !== 'sphere') {
    problems.push(`forme d’obstacle inconnue : ${String(obstacle.shape)}`);
    return problems;
  }
  for (const key of ['x', 'y', 'z'] as const) {
    if (!Number.isFinite(obstacle[key])) {
      problems.push(`${key} doit être un réel fini (reçu : ${obstacle[key]})`);
    }
  }
  if (!(obstacle.radius > 0) || !Number.isFinite(obstacle.radius)) {
    problems.push(`radius doit être un réel strictement positif (reçu : ${obstacle.radius})`);
  }
  return problems;
}

/**
 * Distance signée du point `(x, y, z)` à la surface de l'obstacle (négative à l'intérieur),
 * en mètres. La normale unitaire sortante au point le plus proche est écrite dans `normal`.
 * Point au centre exact d'une sphère : normale +X par convention (déterministe).
 */
export function obstacleDistance(
  obstacle: Obstacle,
  x: number,
  y: number,
  z: number,
  normal: Vec3,
): number {
  const dx = x - obstacle.x;
  const dy = y - obstacle.y;
  const dz = z - obstacle.z;
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (d === 0) {
    normal.x = 1;
    normal.y = 0;
    normal.z = 0;
  } else {
    normal.x = dx / d;
    normal.y = dy / d;
    normal.z = dz / d;
  }
  return d - obstacle.radius;
}
