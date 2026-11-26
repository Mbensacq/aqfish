import type { Anemone } from './anemones';
import type { DecorItem } from './decor';
import {
  layClutch,
  laysCapsules,
  laysInLeaves,
  laysNearAnemone,
  laysOnVegetation,
  layReefClutch,
  layVegetationClutch,
  type Egg,
  type MutableEgg,
} from './eggs';
import { layLeafClutch, type LeafClutch } from './eggs-leaf';
import { layCapsuleClutch } from './eggs-nerite';
import type { LilyPad } from './lily-pads';
import type { Box3 } from './tank';

/** Surfaces du bac où une ponte peut se coller, lues par `laySpeciesClutch`. */
export interface ClutchSurfaces {
  /** Décor complet du bac (rochers, plantes, bois). */
  readonly decor: readonly DecorItem[] | null | undefined;
  /** Plantes où cacher des œufs (corydoras, poisson rouge). */
  readonly plants: readonly DecorItem[];
  /** Anémones du bac (poisson-clown). */
  readonly anemones: readonly Anemone[] | null | undefined;
  /** Nénuphars du bac (poisson rouge). */
  readonly pads: readonly LilyPad[] | null | undefined;
  /** Œufs déjà pondus (feuilles déjà prises par le triton). */
  readonly laid: readonly Egg[];
}

/**
 * Ponte `clutch` posée selon le mode de ponte de son espèce (`sim/eggs.ts`) : près d'une anémone
 * (`layReefClutch`), sur la végétation (`layVegetationClutch`), dans les feuilles
 * (`layLeafClutch`), en capsules sur les rochers (`layCapsuleClutch`, #678) ou, par défaut, sur
 * la vitre et au pied des plantes (`layClutch`). Au plus `clutch.count` œufs, tous dans `water`.
 */
export function laySpeciesClutch(
  clutch: LeafClutch,
  water: Box3,
  surfaces: ClutchSurfaces,
): MutableEgg[] {
  const { seed, species, spawn, count } = clutch;
  if (laysNearAnemone(species)) {
    return layReefClutch(seed, species, spawn, count, water, surfaces.decor, surfaces.anemones);
  }
  if (laysOnVegetation(species)) {
    return layVegetationClutch(seed, species, spawn, count, water, surfaces.plants, surfaces.pads);
  }
  if (laysInLeaves(species)) {
    return layLeafClutch(clutch, water, surfaces.decor, surfaces.laid);
  }
  if (laysCapsules(species)) {
    return layCapsuleClutch(clutch, water, surfaces.decor);
  }
  return layClutch(seed, species, spawn, count, water, surfaces.plants);
}
