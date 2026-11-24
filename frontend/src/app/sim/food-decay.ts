import { MAX_CONCENTRATIONS, type MutableWaterState } from './water';
import { NITROGEN_DAY_SCALE } from './water-units';

/**
 * Ammoniaque venue de la nourriture (issues #638 et #798, ADR 0145 et 0168).
 *
 * - **Nourriture mangée** (#798) : un granulé mangé rend à l'eau, par les déchets du poisson,
 *   `EATEN_FOOD_AMMONIA` mg d'ammoniaque par unité de masse, au pas du repas. En aquaculture,
 *   l'ammoniaque totale produite vaut 3 à 5 % du poids de nourriture (Global Seafood Alliance,
 *   `docs/SOINS.md` § 12) : le jeu prend 4 %.
 * - **Nourriture non mangée** (#638) : un granulé que personne ne mange reste posé
 *   `FOOD_GROUND_SECONDS` (`sim/food.ts`), puis disparaît de `World.food` en se décomposant.
 *   Tout son azote passe alors dans l'eau (`FOOD_DECAY_AMMONIA`, deux fois la part d'un
 *   granulé mangé : le poisson en retient la moitié). Un granulé siphonné ne pollue pas.
 *
 * Les deux parts suivent ensuite le cycle de l'azote existant (`sim/water.ts` : nitrites, puis
 * nitrates). Pur et déterministe : aucun hasard, aucune horloge. La masse d'un granulé vient de
 * son aspect (`pelletMass`, tirée de `foodLook`, hachage de son seul identifiant) : la même
 * ration donne toujours la même quantité d'ammoniaque.
 *
 * Valeur de jeu (approximation, pas une mesure) : une pleine surcharge (`MAX_FOOD` granulés,
 * douze clics) laissée à pourrir ajoute environ 0,06 mg/L d'ammoniaque dans les 288 L du bac
 * tropical (0,5 avant le recalage sur le jour de jeu, #805) ; répétée à chaque minute, elle
 * finit par faire passer l'ammoniaque au-dessus du seuil de vigilance du tableau de bord.
 */

/**
 * Poids de nourriture d'un granulé de masse 1, en mg. **Approximation de jeu** (temps et
 * quantités compressés comme le reste de la simulation) : choisi pour que la part mangée
 * (4 %) et la part pourrie (8 %) retombent sur les valeurs de jeu d'avant #798, puis recalé
 * sur le jour de jeu (`NITROGEN_DAY_SCALE`, #805) : les repas suivent la faim, comptée en
 * secondes, et un granulé d'environ 4 mg est plus proche d'un vrai.
 */
export const PELLET_FOOD_MG = 31.25 * NITROGEN_DAY_SCALE;

/**
 * Part du poids de nourriture mangée rendue en ammoniaque : 4 %, milieu de la fourchette de
 * 3 à 5 % (Global Seafood Alliance, « Flow rate estimation for RAS », `docs/SOINS.md` § 12).
 */
export const EATEN_FOOD_AMMONIA_SHARE = 0.04;

/** Ammoniaque rendue par un granulé de masse 1 mangé, en mg (4 % de `PELLET_FOOD_MG`). */
export const EATEN_FOOD_AMMONIA = 1.25 * NITROGEN_DAY_SCALE;

/**
 * Ammoniaque apportée par un granulé de masse 1 qui se décompose, en mg (mg/L × litres) :
 * 8 % de `PELLET_FOOD_MG`, tout l'azote d'une nourriture à 50 % de protéines (16 % d'azote).
 * Approximation de jeu : ancienne valeur 5 convertie (`sim/water-units.ts`, issue #793), puis
 * recalée sur le jour de jeu (#805).
 */
export const FOOD_DECAY_AMMONIA = 2.5 * NITROGEN_DAY_SCALE;

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
  return addFoodAmmoniaInPlace(water, FOOD_DECAY_AMMONIA, mass, liters);
}

/**
 * Ajoute à `water`, **en le modifiant**, l'ammoniaque des déchets de `mass` unités de
 * nourriture mangée dans `liters` litres (issue #798), et renvoie la quantité ajoutée (mg/L).
 * Proportionnelle à la masse mangée ; plafonnée comme `addDecayedFoodInPlace`.
 * @throws RangeError mêmes cas que `addDecayedFoodInPlace` (eau inchangée).
 */
export function addEatenFoodInPlace(
  water: MutableWaterState,
  mass: number,
  liters: number,
): number {
  return addFoodAmmoniaInPlace(water, EATEN_FOOD_AMMONIA, mass, liters);
}

function addFoodAmmoniaInPlace(
  water: MutableWaterState,
  ammoniaPerMass: number,
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
  water.ammonia = Math.min(MAX_CONCENTRATIONS.ammonia, before + (ammoniaPerMass * mass) / liters);
  return water.ammonia - before;
}
