import { clampIntensity } from './daylight';
import type { SpeciesId } from './species';

/**
 * Rythme du jour (issue #209, ADR 0055) : la nuit, les poissons diurnes ralentissent et se
 * rapprochent du fond ; les espèces actives la nuit (corydoras) nagent comme le jour.
 *
 * Pur, sans hasard ni allocation. Le repos est un poids dans [0, 1] tiré de l'intensité du
 * jour (`DayLight.intensity`, `sim/daylight.ts`) : exactement 0 en plein jour, donc nage
 * d'avant au bit près ; 1 en pleine nuit. Valeurs : **approximations de jeu**.
 */

/**
 * Espèces diurnes (repos la nuit) ; le type impose une entrée pour toute nouvelle espèce.
 * Corydoras : actifs au crépuscule et la nuit. Axolotl, grenouille, triton : marcheurs et
 * amphibies, sans repos dans ce cycle (leur déplacement est propre, `sim/axolotl.ts`,
 * `sim/frog.ts`).
 */
export const DIURNAL: Readonly<Record<SpeciesId, boolean>> = {
  neon: true,
  guppy: true,
  corydora: false,
  koi: true,
  axolotl: false,
  grenouille: false,
  triton: false,
  clown: true,
  chirurgien: true,
  rasbora: true,
  tetra: true,
  // Loche kuhli : active surtout la nuit (approximation de jeu, ADR 0070).
  kuhli: false,
  gourami: true,
};

/** Ralentissement en pleine nuit : le déplacement y garde `1 − NIGHT_SLOWDOWN` de sa longueur. */
export const NIGHT_SLOWDOWN = 0.5;

/**
 * Plafond de nage en pleine nuit, en fraction de la hauteur de la boîte de nage (`hard`) :
 * au-dessus, l'inclinaison visée glisse vers la descente (comme la préférence de profondeur
 * d'une espèce de fond), d'autant plus fort que la nuit est profonde.
 */
export const NIGHT_HEIGHT_RATIO = 0.3;

/**
 * Poids de repos d'une espèce à l'intensité du jour `intensity` : `1 − intensity` (ramenée
 * dans [0, 1], une valeur non finie compte comme le plein jour) pour une espèce diurne, 0
 * sinon (et pour une espèce inconnue).
 */
export function nightRest(species: string, intensity: number): number {
  if (!Object.hasOwn(DIURNAL, species) || !DIURNAL[species as SpeciesId]) {
    return 0;
  }
  return 1 - clampIntensity(intensity);
}

/** Facteur du déplacement d'un pas pour un repos `rest` ∈ [0, 1] : exactement 1 à 0. */
export function nightPace(rest: number): number {
  return 1 - NIGHT_SLOWDOWN * rest;
}
