import { MAX_CONCENTRATIONS, type MutableWaterState } from './water';

/**
 * Décomposition de la nourriture non mangée (issue #638, ADR 0145) : un granulé que personne
 * ne mange reste posé `FOOD_GROUND_SECONDS` (`sim/food.ts`), puis disparaît de `World.food` en
 * se décomposant. Sa masse passe alors dans l'eau sous forme d'ammoniaque, qui suit ensuite le
 * cycle de l'azote existant (`sim/water.ts` : nitrites, puis nitrates).
 *
 * Pur et déterministe : aucun hasard, aucune horloge. La masse d'un granulé vient de son aspect
 * (`pelletMass`, tirée de `foodLook`, hachage de son seul identifiant) : la même ration donne toujours la même
 * quantité d'ammoniaque. Un granulé mangé ou siphonné ne se décompose pas.
 *
 * Valeur de jeu (approximation, pas une mesure) : une pleine surcharge (`MAX_FOOD` granulés,
 * douze clics) laissée à pourrir ajoute environ 0,5 mg/L d'ammoniaque dans les 288 L du bac
 * tropical ; répétée à chaque minute, elle fait passer l'ammoniaque au-dessus du seuil de
 * vigilance du tableau de bord.
 */

/**
 * Ammoniaque apportée par un granulé de masse 1 qui se décompose, en mg (mg/L × litres).
 * Approximation de jeu : ancienne valeur 5 convertie (`sim/water-units.ts`, issue #793).
 */
export const FOOD_DECAY_AMMONIA = 2.5;

/**
 * Ajoute à `water`, **en le modifiant**, l'ammoniaque de `mass` unités de nourriture
 * décomposée dans `liters` litres, et renvoie la quantité ajoutée (mg/L). Une masse
 * nulle ne change rien ; l'ammoniaque reste plafonnée à `MAX_CONCENTRATIONS.ammonia`.
 * @throws RangeError si `mass` n'est pas un réel positif ou nul, ou si `liters` n'est pas un
 * réel strictement positif (eau inchangée).
 */
export function addDecayedFoodInPlace(
  water: MutableWaterState,
  mass: number,
  liters: number,
): number {
  if (!(mass >= 0) || !Number.isFinite(mass)) {
    throw new RangeError(`mass doit être un réel positif ou nul (reçu : ${mass})`);
  }
  if (!(liters > 0) || !Number.isFinite(liters)) {
    throw new RangeError(`liters doit être un réel strictement positif (reçu : ${liters})`);
  }
  if (mass === 0) {
    return 0;
  }
  const before = water.ammonia;
  water.ammonia = Math.min(
    MAX_CONCENTRATIONS.ammonia,
    before + (FOOD_DECAY_AMMONIA * mass) / liters,
  );
  return water.ammonia - before;
}
