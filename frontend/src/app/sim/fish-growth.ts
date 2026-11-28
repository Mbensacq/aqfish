import { DEFAULT_DAY_LENGTH_SECONDS } from './daylight';
import { FRY_GROWTH_TIME, FRY_SCALES, fryScale } from './fry';
import { SPECIES, type SpeciesId } from './species';
import type { Fish } from './swimmer';

/**
 * Croissance des jeunes selon l'âge (issue #876, ADR 0191) : un poisson né au bac est rendu
 * plus petit qu'un adulte de son espèce et grandit avec l'âge (`sim/aging.ts`, ADR 0187)
 * jusqu'à la taille adulte, atteinte à `GROWTH_SECONDS`.
 *
 * - **Alevin** (âge < `FRY_GROWTH_TIME`) : les trois jalons de `fryScale` (ADR 0107, #566),
 *   de `GROWTH_MIN_SCALE` à la naissance au subadulte.
 * - **Jeune** (de `FRY_GROWTH_TIME` à `GROWTH_SECONDS`) : de la taille du subadulte à 1, en
 *   ligne droite ; il ne saute plus d'un coup à la taille adulte quand il cesse d'être alevin.
 * - **Adulte** : 1.
 *
 * Seule l'**échelle de rendu** change : la simulation (positions, rayons de prédation,
 * hitboxes) n'en lit rien, si bien que le monde reste identique au bit près. Les animaux du
 * monde neuf ou ajoutés en cours de partie (âge adulte tiré de la graine, au moins
 * `ADULT_MIN_SHARE` de la durée de vie) sont toujours à 1.
 *
 * Approximation de jeu : un platy ou un guppy atteint sa taille adulte en trois à quatre mois
 * environ ; le jeu ramène cette durée à trois semaines de jeu, comme il ramène la maturité à
 * un jour (`FRY_GROWTH_TIME`).
 */

/** Fraction de la taille adulte à la naissance (premier jalon d'alevin). */
export const GROWTH_MIN_SCALE = FRY_SCALES[0];
/** Taille d'un poisson qui cesse d'être alevin (dernier jalon). */
export const JUVENILE_START_SCALE = FRY_SCALES[FRY_SCALES.length - 1];
/** Jours de jeu pour atteindre la taille adulte. */
export const GROWTH_DAYS = 21;
/** Âge de la taille adulte, en secondes simulées. */
export const GROWTH_SECONDS = GROWTH_DAYS * DEFAULT_DAY_LENGTH_SECONDS;

/**
 * Vrai si l'espèce grandit avec l'âge : un nageur connu (ni marcheur ni amphibien, hors du
 * périmètre de l'issue #876).
 */
export function growsWithAge(species: SpeciesId): boolean {
  // Identifiant relu d'une sauvegarde ou d'une URL : l'espèce peut manquer au catalogue.
  const def = SPECIES[species] as (typeof SPECIES)[SpeciesId] | undefined;
  return def !== undefined && def.walker === undefined && def.amphibian === undefined;
}

/**
 * Échelle de rendu d'un animal de `species` à l'âge `age` (secondes simulées), dans
 * [`GROWTH_MIN_SCALE`, 1], croissante avec l'âge. Âge négatif : comme à la naissance ; âge
 * non fini (état corrompu) ou espèce qui ne grandit pas (`growsWithAge`) : 1.
 */
export function growthScale(age: number, species: SpeciesId): number {
  if (!Number.isFinite(age) || !growsWithAge(species) || age >= GROWTH_SECONDS) {
    return 1;
  }
  if (age < FRY_GROWTH_TIME) {
    return fryScale(Math.max(0, age));
  }
  const share = (age - FRY_GROWTH_TIME) / (GROWTH_SECONDS - FRY_GROWTH_TIME);
  return JUVENILE_START_SCALE + (1 - JUVENILE_START_SCALE) * share;
}

/**
 * Échelle du modèle rendu de `fish` au temps `time` : `fryScale` pour un alevin (âge
 * `growth`), pour un animal sans naissance connue (`bornAt` absent : adulte tiré de la graine)
 * ou sans temps ; sinon `growthScale` de son âge. Aucun hachage ni allocation.
 */
export function bodyScale(
  fish: Pick<Fish, 'species' | 'growth' | 'bornAt'>,
  time: number | undefined,
): number {
  if (fish.growth !== undefined || fish.bornAt === undefined || time === undefined) {
    return fryScale(fish.growth);
  }
  return growthScale(time - fish.bornAt, fish.species);
}
