import { isHungry, satiate } from './feeding';
import { landingAge, pelletMass, type FoodPellet } from './food';
import type { SheetField } from './sheet-field';
import { approx, sourced } from './sheet-field';
import type { SpeciesId } from './species';

/**
 * Charognards (issue #836, tranche 2 de #732, ADR 0180, `docs/ECOSYSTEME.md` § 3.3) : les
 * marcheurs du fond qui ne cherchent pas les granulés en nageant (crevettes cerises,
 * néritines) mangent la nourriture **tombée au fond** avant qu'elle ne se décompose. Ce qui
 * est mangé produit l'ammoniaque de la nourriture mangée (#798), deux fois moins que celle
 * d'un granulé qui pourrit (`sim/food-decay.ts`).
 *
 * Règle (approximation de jeu) : à chaque pas, chaque charognard qui a faim (`isHungry`), dans
 * l'ordre du tableau, mange le premier granulé posé au fond (le plus tôt lâché) (`landingAge` atteint), où
 * qu'il soit : une colonie fouille tout le sol. Corydoras et ancistrus, nageurs du fond, mangent
 * déjà les granulés tombés en nageant vers eux (`sim/feeding.ts`) : ils n'ont pas besoin de
 * cette règle. Pur et déterministe, sans tirage ni allocation.
 */

/** Garnelio, crevettes et escargots nettoyeurs (`docs/ECOSYSTEME.md` § 2). */
const GARNELIO =
  'https://www.garnelio.de/en/blog/invertebrates/the-invertebrate-algae-police-shrimp-and-snails-as-a-cleanup-crew';

/** Espèces charognardes, avec la source de leur rôle. */
export const SCAVENGERS: Readonly<Partial<Record<SpeciesId, SheetField<boolean>>>> = Object.freeze({
  cerise: sourced(true, `${GARNELIO} (restes de nourriture)`),
  // Les néritines mangent les pastilles d'appoint posées au fond (`sim/grazing.ts`).
  neritine: approx(true),
});

/** Vrai si l'espèce mange la nourriture tombée au fond sans la chercher en nageant. */
export function isScavenger(species: SpeciesId): boolean {
  return SCAVENGERS[species]?.value === true;
}

/** Animal vu par les charognards. */
export interface ScavengingAnimal {
  readonly species: SpeciesId;
  hunger: number;
}

/**
 * Repas des charognards d'un pas, **en modifiant** `food` (granulés mangés retirés, ordre des
 * autres conservé) et la faim des `animals` : voir la règle du module. Renvoie la masse mangée
 * (somme des `pelletMass`, 0 sans charognard affamé ni granulé posé).
 */
export function scavengeFoodInPlace(
  animals: readonly ScavengingAnimal[],
  food: FoodPellet[],
): number {
  if (food.length === 0) {
    return 0;
  }
  let mass = 0;
  for (const animal of animals) {
    if (!isScavenger(animal.species) || !isHungry(animal.hunger)) {
      continue;
    }
    const index = firstLandedIndex(food);
    if (index < 0) {
      return mass;
    }
    mass += pelletMass(food[index]);
    food.splice(index, 1);
    animal.hunger = satiate(animal.hunger);
  }
  return mass;
}

/** Indice du premier granulé posé au fond, ou -1. */
function firstLandedIndex(food: readonly FoodPellet[]): number {
  for (let i = 0; i < food.length; i++) {
    if (food[i].age >= landingAge(food[i])) {
      return i;
    }
  }
  return -1;
}
