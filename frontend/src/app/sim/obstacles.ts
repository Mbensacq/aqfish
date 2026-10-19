import type { Vec3 } from './flocking';

/**
 * Obstacles du bac : **données** pures, sérialisables en JSON (ADR 0003, ADR 0012), jamais
 * codées en dur dans la scène.
 *
 * Toute forme d'obstacle se ramène à une **distance signée** à sa surface (négative à
 * l'intérieur) et à une **normale** unitaire sortante (`obstacleDistance`). Formes : la
 * sphère, et l'union de sphères (`spheres`), forme de collision fine des éléments de décor
 * (rochers, `sim/decor.ts`, ADR 0015). Une nouvelle forme n'ajoute qu'une variante à
 * `Obstacle` et un cas à `obstacleDistance`.
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

/** Sphère élémentaire d'une union (centre et rayon, en mètres). */
export interface Sphere {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Rayon, strictement positif. */
  readonly radius: number;
}

/**
 * Obstacle en union de sphères (rocher aux formes irrégulières) : un point est dans
 * l'obstacle s'il est dans l'une des sphères. Un passage entre deux unions reste ouvert
 * là où une enveloppe unique le fermerait.
 */
export interface SpheresObstacle {
  readonly id: number;
  readonly shape: 'spheres';
  /** Au moins une sphère. */
  readonly spheres: readonly Sphere[];
}

/** Obstacle du bac (union discriminée par `shape`). */
export type Obstacle = SphereObstacle | SpheresObstacle;

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
  if (obstacle.shape === 'sphere') {
    problems.push(...validateSphere(obstacle, ''));
    return problems;
  }
  if (obstacle.shape === 'spheres') {
    const spheres: unknown = obstacle.spheres;
    if (!Array.isArray(spheres) || spheres.length === 0) {
      problems.push('spheres doit être une liste non vide');
      return problems;
    }
    obstacle.spheres.forEach((sphere, i) =>
      problems.push(...validateSphere(sphere, `spheres[${i}].`)),
    );
    return problems;
  }
  problems.push(`forme d’obstacle inconnue : ${String((obstacle as { shape: unknown }).shape)}`);
  return problems;
}

function validateSphere(sphere: Sphere, prefix: string): string[] {
  const problems: string[] = [];
  for (const key of ['x', 'y', 'z'] as const) {
    if (!Number.isFinite(sphere[key])) {
      problems.push(`${prefix}${key} doit être un réel fini (reçu : ${sphere[key]})`);
    }
  }
  if (!(sphere.radius > 0) || !Number.isFinite(sphere.radius)) {
    problems.push(
      `${prefix}radius doit être un réel strictement positif (reçu : ${sphere.radius})`,
    );
  }
  return problems;
}

/**
 * Distance signée du point `(x, y, z)` à la surface de l'obstacle (négative à l'intérieur),
 * en mètres. La normale unitaire sortante au point le plus proche est écrite dans `normal`.
 * Point au centre exact d'une sphère : normale +X par convention (déterministe).
 *
 * Union de sphères : minimum des distances signées des sphères (distance exacte à l'union
 * hors de l'obstacle), normale de la sphère retenue ; à égalité, la première de la liste.
 * Aucune allocation.
 */
export function obstacleDistance(
  obstacle: Obstacle,
  x: number,
  y: number,
  z: number,
  normal: Vec3,
): number {
  if (obstacle.shape === 'sphere') {
    return sphereDistance(obstacle, x, y, z, normal);
  }
  const spheres = obstacle.spheres;
  let best = sphereDistance(spheres[0], x, y, z, normal);
  let bestIndex = 0;
  for (let i = 1; i < spheres.length; i++) {
    const s = spheres[i];
    const dx = x - s.x;
    const dy = y - s.y;
    const dz = z - s.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    // Rejet sans racine : la sphère ne peut pas faire mieux que `best`.
    const reach = best + s.radius;
    if (reach >= 0 && d2 >= reach * reach) {
      continue;
    }
    const d = Math.sqrt(d2) - s.radius;
    if (d < best) {
      best = d;
      bestIndex = i;
    }
  }
  if (bestIndex !== 0) {
    sphereDistance(spheres[bestIndex], x, y, z, normal);
  }
  return best;
}

const BOUNDS = new WeakMap<SpheresObstacle, Sphere>();

/**
 * Sphère englobante d'un obstacle (centre moyen des sphères, rayon couvrant chacune), mise
 * en cache par objet : les obstacles sont des données immuables. Pour tout point `p`,
 * `obstacleDistance(o, p) ≥ |p − centre| − rayon`, minorant qui permet d'écarter un
 * obstacle lointain sans parcourir ses sphères (`obstacleAvoidance`).
 */
export function obstacleBound(obstacle: Obstacle): Sphere {
  if (obstacle.shape === 'sphere') {
    return obstacle;
  }
  let bound = BOUNDS.get(obstacle);
  if (!bound) {
    const spheres = obstacle.spheres;
    let x = 0;
    let y = 0;
    let z = 0;
    for (const s of spheres) {
      x += s.x / spheres.length;
      y += s.y / spheres.length;
      z += s.z / spheres.length;
    }
    let radius = 0;
    for (const s of spheres) {
      radius = Math.max(radius, Math.hypot(s.x - x, s.y - y, s.z - z) + s.radius);
    }
    bound = { x, y, z, radius };
    BOUNDS.set(obstacle, bound);
  }
  return bound;
}

function sphereDistance(obstacle: Sphere, x: number, y: number, z: number, normal: Vec3): number {
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
