import { environmentById, type EnvironmentId } from './environment';
import { clampTankDimensions, TANK_LIMITS, type DimensionRange, type TankDimensions } from './tank';

/**
 * Bornes des dimensions réglables par environnement (#885) : `TANK_LIMITS`, dont le minimum
 * descend, de pas entiers, jusqu'aux dimensions d'origine de l'environnement quand elles sont
 * plus petites. Le bac d'eau froide (45 cm de haut, sous les 50 cm de `TANK_LIMITS`) garde
 * ainsi sa hauteur d'origine : le curseur l'affiche telle quelle, et régler la longueur ne la
 * porte plus à 50 cm (ADR 0190). Le bac tropical, dans les bornes, n'est pas touché.
 */
export type TankLimits = Readonly<Record<keyof TankDimensions, DimensionRange>>;

/**
 * `range` dont le minimum descend jusqu'à `floor` par pas entiers (même grille de valeurs,
 * arrondie au micron) ; inchangé si `floor` n'est pas en dessous.
 */
function lowered(range: DimensionRange, floor: number): DimensionRange {
  if (floor >= range.min) {
    return range;
  }
  const steps = Math.ceil(Math.round(((range.min - floor) / range.step) * 1e6) / 1e6);
  return { ...range, min: Math.round((range.min - steps * range.step) * 1e6) / 1e6 };
}

/** Bornes des dimensions réglables de l'environnement `id`. */
export function tankLimits(id: EnvironmentId): TankLimits {
  const origin = environmentById(id).dimensions;
  return {
    width: lowered(TANK_LIMITS.width, origin.width),
    height: lowered(TANK_LIMITS.height, origin.height),
    depth: lowered(TANK_LIMITS.depth, origin.depth),
  };
}

/** Dimensions `dims` bornées aux bornes de l'environnement `id` (`clampTankDimensions`). */
export function clampTankDimensionsIn(id: EnvironmentId, dims: TankDimensions): TankDimensions {
  return clampTankDimensions(dims, tankLimits(id));
}
