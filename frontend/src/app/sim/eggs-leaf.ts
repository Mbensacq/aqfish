import { decorElevation, decorToTank, isFloatingPlant, plantBaseY, type DecorItem } from './decor';
import { EGG_GLASS_INSET, spawnDraw, type Egg, type MutableEgg } from './eggs';
import { plantModel, type PlantForm } from './plant';
import type { SpeciesId } from './species';
import type { Box3 } from './tank';

/**
 * Ponte du triton dans les feuilles (issue #676, ADR 0182).
 *
 * Caudata Culture (fiche de _Cynops orientalis_) : les œufs sont « pondus un à un sur la
 * végétation aquatique » et la femelle « replie les feuilles des plantes aquatiques sur l'œuf ».
 * Chaque œuf est donc posé, isolé, au centre d'un voxel de feuille (`part: 'leaf'` de
 * `sim/plant.ts`) d'une plante enracinée du décor, sous l'eau ; deux œufs d'une même ponte ne
 * partagent jamais une feuille. Les plantes flottantes (salvinia, à la surface) sont exclues :
 * leurs frondes ne se replient pas sous l'eau.
 */

/** Feuille immergée d'une plante : centre d'un voxel de feuille, dans le repère du bac. */
export interface LeafSpot {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * Feuilles immergées de `plant` (centres de ses voxels de feuille dans `water`, sous la surface
 * de `EGG_GLASS_INSET` au moins), dans l'ordre des voxels du modèle. Vide pour une plante
 * flottante ou un autre élément de décor.
 */
export function leafSpots(plant: DecorItem, water: Box3): LeafSpot[] {
  if (plant.kind !== 'plant' || isFloatingPlant(plant)) {
    return [];
  }
  const model = plantModel(plant.seed, plant.scale, plant.form as PlantForm);
  const v = model.voxelSize;
  const baseY = plantBaseY(v) + decorElevation(plant);
  const spots: LeafSpot[] = [];
  const p = { x: 0, y: 0, z: 0 };
  for (const cell of model.cells) {
    if (cell.part !== 'leaf') {
      continue;
    }
    decorToTank(plant, baseY, (cell.i + 0.5) * v, (cell.j + 0.5) * v, (cell.k + 0.5) * v, p);
    if (isInWater(p, water)) {
      spots.push({ x: p.x, y: p.y, z: p.z });
    }
  }
  return spots;
}

function isInWater(p: LeafSpot, water: Box3): boolean {
  return (
    p.y > water.minY &&
    p.y < water.maxY - EGG_GLASS_INSET &&
    p.x > water.minX &&
    p.x < water.maxX &&
    p.z > water.minZ &&
    p.z < water.maxZ
  );
}

/** Ponte à placer : graine du monde, espèce, rang de la période et nombre d'œufs voulu. */
export interface LeafClutch {
  readonly seed: number;
  readonly species: SpeciesId;
  readonly spawn: number;
  readonly count: number;
}

/**
 * Ponte `spawn` de `species` dans les feuilles (issue #676), au plus `count` œufs : chaque œuf
 * tire une feuille immergée parmi toutes celles des plantes enracinées (`leafSpots`) ; une feuille
 * déjà prise (par un œuf de la ponte ou par un œuf de `laid` posé au même point) passe à la
 * suivante libre. Au plus un œuf par feuille : moins de feuilles libres que `count`, moins d'œufs. Sans plante (liste vide, `null`, `undefined`) ou sans feuille sous
 * l'eau, aucun œuf. Tous dans `water`, âge 0, surface `'plante'`.
 */
export function layLeafClutch(
  { seed, species, spawn, count }: LeafClutch,
  water: Box3,
  plants: readonly DecorItem[] | null | undefined,
  laid: readonly Egg[] = [],
): MutableEgg[] {
  const eggs: MutableEgg[] = [];
  if (count <= 0 || plants === null || plants === undefined) {
    return eggs;
  }
  const spots = plants.flatMap((plant) => leafSpots(plant, water));
  const taken = new Set<number>();
  spots.forEach((spot, index) => {
    if (laid.some((egg) => isOnSpot(egg, spot, water))) {
      taken.add(index);
    }
  });
  const free = spots.length - taken.size;
  for (let k = 0; k < Math.min(count, free); k++) {
    let index = Math.min(
      spots.length - 1,
      Math.floor(spawnDraw(seed, species, spawn, 8 + k) * spots.length),
    );
    while (taken.has(index)) {
      index = (index + 1) % spots.length;
    }
    taken.add(index);
    const spot = spots[index];
    eggs.push({ species, ...eggPoint(spot, water), age: 0, surface: 'plante' });
  }
  return eggs;
}

/** Point de l'œuf posé sur la feuille `spot`, ramené dans `water`. */
function eggPoint(spot: LeafSpot, water: Box3): LeafSpot {
  return {
    x: clamp(spot.x, water.minX + EGG_GLASS_INSET, water.maxX - EGG_GLASS_INSET),
    y: spot.y,
    z: clamp(spot.z, water.minZ + EGG_GLASS_INSET, water.maxZ - EGG_GLASS_INSET),
  };
}

/** Vrai si `egg` est posé sur la feuille `spot` (même point, à 1 mm près). */
function isOnSpot(egg: Egg, spot: LeafSpot, water: Box3): boolean {
  const p = eggPoint(spot, water);
  return Math.abs(egg.x - p.x) + Math.abs(egg.y - p.y) + Math.abs(egg.z - p.z) < 1e-3;
}
