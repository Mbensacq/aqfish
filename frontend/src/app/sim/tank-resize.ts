import type { DecorItem } from './decor';
import { clampDecorPosition } from './decor-edit';
import { environmentWater, isTankResizable } from './environment';
import type { FoodPellet } from './food';
import type { Fish } from './swimmer';
import { clampTankDimensions, sameDimensions, type Box3, type TankDimensions } from './tank';
import {
  boundsFor,
  createWorld,
  seededObstacleCount,
  type MutableWorld,
  type World,
} from './world';

/**
 * Dimensions réglables du bac (issue #171, ADR 0047) : changer la longueur, la hauteur ou la
 * profondeur du bac d'un monde, en gardant ce qu'il contient.
 *
 * - Les dimensions demandées sont bornées à `TANK_LIMITS`, au pas (`clampTankDimensions`).
 * - Chaque élément du décor est ramené dans le bac compte tenu de son emprise
 *   (`clampDecorPosition`) ; sa graine, son genre, sa forme, sa rotation et son échelle ne
 *   changent pas. Une élévation (élément posé sur un autre) est bornée à la hauteur du bac.
 * - Les obstacles sont recalculés comme à la création (`createWorld`).
 * - Chaque poisson (position courante et précédente) est ramené dans sa zone de nage dure ;
 *   chaque granulé, dans l'eau. Le pas suivant ne voit donc rien hors du bac.
 * - Population, identifiants, temps et générateurs sont inchangés.
 */

/**
 * Règle les dimensions du bac de `world` (modifié en place) et renvoie les dimensions
 * appliquées (bornées), ou `null` (monde inchangé) si l'environnement n'a pas de dimensions
 * réglables (`isTankResizable`) ou si le monde a des obstacles explicites, qui seraient perdus.
 */
export function setTankDimensionsInPlace(
  world: MutableWorld,
  dims: TankDimensions,
): TankDimensions | null {
  if (
    !isTankResizable(world.environment) ||
    world.obstacles.length !== world.decor.length + seededObstacleCount(world)
  ) {
    return null;
  }
  const dimensions = clampTankDimensions(dims);
  if (world.dimensions !== undefined && sameDimensions(world.dimensions, dimensions)) {
    return world.dimensions;
  }
  const place = { environment: world.environment, dimensions };
  const decor = world.decor.map((item) => fitDecorItem(item, place));
  const rebuilt = createWorld(world.seed, [], [], decor, place);
  world.dimensions = dimensions;
  world.decor = rebuilt.decor;
  world.obstacles = rebuilt.obstacles;
  world.entities = world.entities.map((fish) => fitFish(fish, boundsFor(fish.species, place).hard));
  const water = environmentWater(place);
  world.food = world.food.map((pellet) => fitPellet(pellet, water));
  return dimensions;
}

/** Copie de `world` aux dimensions `dims` (`setTankDimensionsInPlace`) ; `world` n'est pas modifié. */
export function withTankDimensions(world: World, dims: TankDimensions): World | null {
  const copy = structuredClone(world) as MutableWorld;
  return setTankDimensionsInPlace(copy, dims) === null ? null : copy;
}

/** Élément `item` ramené dans le bac `place` ; l'objet d'origine s'il y tient déjà. */
function fitDecorItem(
  item: DecorItem,
  place: { environment: World['environment']; dimensions: TankDimensions },
): DecorItem {
  const p = clampDecorPosition(item, item.x, item.z, place);
  const elevation =
    item.elevation === undefined ? undefined : Math.min(item.elevation, place.dimensions.height);
  if (p === null || (p.x === item.x && p.z === item.z && elevation === item.elevation)) {
    return item;
  }
  return elevation === undefined
    ? { ...item, x: p.x, z: p.z }
    : { ...item, x: p.x, z: p.z, elevation };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Poisson `fish` (position courante et précédente) ramené dans la boîte `hard` (copie). */
function fitFish(fish: Fish, hard: Box3): Fish {
  return {
    ...fish,
    x: clamp(fish.x, hard.minX, hard.maxX),
    y: clamp(fish.y, hard.minY, hard.maxY),
    z: clamp(fish.z, hard.minZ, hard.maxZ),
    px: clamp(fish.px, hard.minX, hard.maxX),
    py: clamp(fish.py, hard.minY, hard.maxY),
    pz: clamp(fish.pz, hard.minZ, hard.maxZ),
  };
}

/** Granulé `pellet` ramené dans l'eau `water` (copie) : `restY` ≤ `y` ≤ `floatY`. */
function fitPellet(pellet: FoodPellet, water: Box3): FoodPellet {
  const floatY = clamp(pellet.floatY, water.minY, water.maxY);
  const restY = clamp(pellet.restY, water.minY, floatY);
  return {
    ...pellet,
    x: clamp(pellet.x, water.minX, water.maxX),
    z: clamp(pellet.z, water.minZ, water.maxZ),
    floatY,
    restY,
    y: clamp(pellet.y, restY, floatY),
  };
}
