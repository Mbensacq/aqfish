import { environmentWater, isPondShapeable } from './environment';
import {
  DEFAULT_POND_SHAPE,
  isPondShape,
  keepInShape,
  shapeOutline,
  type PondShape,
} from './pond-shape';
import type { Fish } from './swimmer';
import { boundsFor, type MutableWorld, type World } from './world';

/**
 * Forme réglable du bassin (issue #190, ADR 0080) : passer un bassin de rectangle à ovale ou
 * haricot (ou l'inverse) en gardant ce qu'il contient.
 *
 * - Les poissons (position courante et précédente) sont ramenés dans leur zone de nage, à
 *   `wallMargin` du bord de la nouvelle forme ; les granulés, dans l'eau de la forme.
 * - Décor, obstacles, population, identifiants, temps et générateurs sont inchangés (la forme
 *   ne change ni la boîte d'eau ni les obstacles).
 */

/**
 * Règle la forme du bassin de `world` (modifié en place) et renvoie la forme appliquée, ou
 * `null` (monde inchangé) si la forme est inconnue ou si l'environnement n'a pas de forme
 * réglable (`isPondShapeable`).
 */
export function setPondShapeInPlace(world: MutableWorld, shape: PondShape): PondShape | null {
  if (!isPondShape(shape) || !isPondShapeable(world.environment)) {
    return null;
  }
  const current = world.shape ?? DEFAULT_POND_SHAPE;
  if (current === shape) {
    return shape;
  }
  if (shape === DEFAULT_POND_SHAPE) {
    delete world.shape;
    // Le rectangle contient toute autre forme : rien à ramener.
    return shape;
  }
  world.shape = shape;
  world.entities = world.entities.map((fish) => fitFish(fish, world));
  const outline = shapeOutline(shape, environmentWater(world));
  world.food = world.food.map((pellet) => {
    const p = { x: pellet.x, z: pellet.z };
    keepInShape(p, outline, 0);
    return p.x === pellet.x && p.z === pellet.z ? pellet : { ...pellet, x: p.x, z: p.z };
  });
  return shape;
}

/** Copie de `world` de forme `shape` (`setPondShapeInPlace`) ; `world` n'est pas modifié. */
export function withPondShape(world: World, shape: PondShape): World | null {
  const copy = structuredClone(world) as MutableWorld;
  return setPondShapeInPlace(copy, shape) === null ? null : copy;
}

/** Poisson ramené dans le contour de ses bornes de nage dans `world` (copie si déplacé). */
function fitFish(fish: Fish, world: World): Fish {
  const bounds = boundsFor(fish.species, world);
  if (bounds.outline === undefined) {
    return fish;
  }
  const margin = bounds.outlineMargin ?? 0;
  const now = { x: fish.x, z: fish.z };
  const before = { x: fish.px, z: fish.pz };
  keepInShape(now, bounds.outline, margin);
  keepInShape(before, bounds.outline, margin);
  if (now.x === fish.x && now.z === fish.z && before.x === fish.px && before.z === fish.pz) {
    return fish;
  }
  return { ...fish, x: now.x, z: now.z, px: before.x, pz: before.z };
}
