import type { FoodShape } from '../sim/food';

/**
 * Taille des granulés à l'écran selon le zoom (issue #117) : fonctions pures, sans three.js.
 *
 * Un granulé a une taille dans le monde (`FOOD_PELLET_DIAMETER`) : sa taille à l'écran suit
 * donc la distance de la caméra, avec un plancher d'un pixel de scène pour qu'il ne
 * disparaisse jamais. Le liseré sombre (issue #83) n'est complet qu'au-dessus d'un seuil
 * (`FOOD_OUTLINE_MIN_CORE`) : en dessous, il est réduit à un pixel, sur un seul côté de
 * chaque axe, pour qu'un granulé lointain reste discret.
 */

/**
 * Diamètre d'un granulé dans le monde, en mètres (cœur, sans le liseré). Approximation de
 * jeu, plus gros qu'un vrai granulé : 2 pixels de scène dans la vue trois-quarts du bac
 * tropical en 1280 × 720 (~148 pixels par mètre, comme avant #117), 1 pixel sur téléphone en
 * portrait (~85 pixels par mètre).
 */
export const FOOD_PELLET_DIAMETER = 0.012;
/** Plus petite taille d'un granulé à l'écran, en pixels de scène. */
export const FOOD_MIN_SCENE_PIXELS = 1;
/**
 * Taille du cœur, en pixels de scène, à partir de laquelle le liseré est complet (un pixel de
 * chaque côté). En dessous, il est réduit à un pixel en tout (`foodOutlineExtra`).
 */
export const FOOD_OUTLINE_MIN_CORE = 2;

/**
 * Pixels de scène par mètre, à la distance `distance` (mètres) d'une caméra perspective de
 * champ vertical `fovDeg` (degrés) rendant une image de `targetHeight` pixels de haut.
 * Renvoie 0 pour une entrée non finie ou non positive (taille inconnue : le plancher
 * s'applique).
 */
export function scenePixelsPerMeter(
  distance: number,
  fovDeg: number,
  targetHeight: number,
): number {
  if (
    !(distance > 0) ||
    !(fovDeg > 0 && fovDeg < 180) ||
    !(targetHeight > 0) ||
    !Number.isFinite(distance) ||
    !Number.isFinite(targetHeight)
  ) {
    return 0;
  }
  const visibleHeight = 2 * distance * Math.tan((fovDeg * Math.PI) / 360);
  return targetHeight / visibleHeight;
}

/**
 * Côté du cœur d'un granulé en points, en pixels de scène entiers : le diamètre projeté,
 * arrondi, jamais moins de `FOOD_MIN_SCENE_PIXELS`.
 */
export function foodCoreSize(pixelsPerMeter: number): number {
  if (!(pixelsPerMeter > 0) || !Number.isFinite(pixelsPerMeter)) {
    return FOOD_MIN_SCENE_PIXELS;
  }
  return Math.max(FOOD_MIN_SCENE_PIXELS, Math.round(FOOD_PELLET_DIAMETER * pixelsPerMeter));
}

/**
 * Pixels de scène ajoutés au cœur par le liseré (sur le côté total) : 2 (un de chaque côté)
 * à partir de `FOOD_OUTLINE_MIN_CORE`, 1 en dessous (liseré réduit).
 */
export function foodOutlineExtra(coreSize: number): number {
  return coreSize >= FOOD_OUTLINE_MIN_CORE ? 2 : 1;
}

/**
 * Côté d'un granulé en voxel, en mètres : le diamètre du granulé, mais au moins un pixel de
 * scène à cette distance (plancher en dézoomé).
 */
export function foodVoxelSide(pixelsPerMeter: number): number {
  if (!(pixelsPerMeter > 0) || !Number.isFinite(pixelsPerMeter)) {
    return FOOD_PELLET_DIAMETER;
  }
  return Math.max(FOOD_PELLET_DIAMETER, FOOD_MIN_SCENE_PIXELS / pixelsPerMeter);
}

/**
 * Proportions des formes de granulé en voxels (issue #226), en multiples du côté du grain
 * (`foodVoxelSide`) : largeur (x), épaisseur (y), profondeur (z). Le grain est un cube ; le
 * flocon une plaquette fine et large ; la paillette un éclat fin, plus petit que le grain.
 */
export const FOOD_SHAPE_PROPORTIONS: Readonly<
  Record<FoodShape, readonly [number, number, number]>
> = {
  grain: [1, 1, 1],
  flocon: [1.5, 0.4, 1.25],
  paillette: [1, 0.3, 0.6],
};

/**
 * Dimensions d'un granulé en voxels (x, y, z), en mètres, pour sa forme `shape` et son
 * facteur de taille `sizeFactor` : les proportions de la forme appliquées au côté du grain,
 * chaque dimension ramenée à au moins un pixel de scène (plancher de `foodVoxelSide`) pour
 * qu'aucune face ne disparaisse en dézoomé. Un facteur non fini ou non positif vaut 1.
 */
export function foodVoxelDimensions(
  shape: FoodShape,
  sizeFactor: number,
  pixelsPerMeter: number,
): [number, number, number] {
  const factor = Number.isFinite(sizeFactor) && sizeFactor > 0 ? sizeFactor : 1;
  const base = FOOD_PELLET_DIAMETER * factor;
  const floor =
    pixelsPerMeter > 0 && Number.isFinite(pixelsPerMeter)
      ? FOOD_MIN_SCENE_PIXELS / pixelsPerMeter
      : 0;
  const [x, y, z] = FOOD_SHAPE_PROPORTIONS[shape];
  return [Math.max(floor, base * x), Math.max(floor, base * y), Math.max(floor, base * z)];
}
