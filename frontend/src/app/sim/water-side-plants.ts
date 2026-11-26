import { floatingPlantElevation, isFloatingPlant, parseDecorItems, type DecorItem } from './decor';
import type { PlantForm } from './plant';
import { SAND_THICKNESS, type Box3, type TankDimensions } from './tank';
import { terrainAt, type TerrainSettings } from './terrain';

/**
 * Plantes côté eau d'un environnement à berge (issue #847, ADR 0185) : le décor par défaut du
 * paludarium. Une plante enracinée posée sur le fond en pente suit le sol (son élévation est
 * la hauteur du sol au-dessus du sable) ; une plante flottante affleure la surface. Module pur
 * et déterministe : mêmes emplacements, même décor.
 */

/** Emplacement d'une plante côté eau, dans le repère du bac (mètres, radians). */
export interface WaterSidePlantSpot {
  readonly form: PlantForm;
  readonly x: number;
  readonly z: number;
  readonly rotation: number;
  readonly scale: number;
  readonly seed: number;
}

/** Arrondi au millionième de mètre, comme les élévations de l'éditeur (ADR 0046). */
const round6 = (value: number): number => Math.round(value * 1e6) / 1e6;

/**
 * Plante de décor posée à l'emplacement `spot`, au sol `terrain` du volume d'eau `water`.
 * @throws RangeError si l'emplacement n'est pas sous l'eau (côté terre du rivage).
 */
function waterSidePlant(
  spot: WaterSidePlantSpot,
  terrain: TerrainSettings,
  water: Box3,
): DecorItem {
  const ground = terrainAt(spot.x, spot.z, terrain, water);
  if (!ground.submerged) {
    throw new RangeError(
      `plante côté eau : (${spot.x}, ${spot.z}) n'est pas sous l'eau (sol à ${ground.height} m)`,
    );
  }
  const { form, x, z, rotation, scale, seed } = spot;
  const plant: DecorItem = { kind: 'plant', form, x, z, rotation, scale, seed };
  const elevation = isFloatingPlant(plant)
    ? floatingPlantElevation(plant, water.maxY)
    : round6(Math.max(0, ground.height - SAND_THICKNESS));
  return elevation > 0 ? { ...plant, elevation } : plant;
}

/**
 * Décor de plantes côté eau : une plante par emplacement de `spots`, dans cet ordre, validée
 * comme un décor chargé (`parseDecorItems`, dimensions `dims`).
 * @throws RangeError si un emplacement est côté terre ou si une plante est invalide.
 */
export function waterSidePlants(
  spots: readonly WaterSidePlantSpot[],
  terrain: TerrainSettings,
  water: Box3,
  dims: TankDimensions,
): DecorItem[] {
  return parseDecorItems(
    spots.map((spot) => waterSidePlant(spot, terrain, water)),
    dims,
  );
}
