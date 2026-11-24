import { approx, sourced, type SheetField } from './sheet-field';
import type { SpeciesId } from './species';

/**
 * Données propres au verdict de compatibilité par paire (issue #816, tranche 1 de #730,
 * ADR 0174) : ce que ni la fiche (`sim/species-sheet.ts`) ni les données d'écologie
 * (`sim/species-ecology.ts`) ne portent encore. Même règle de sourçage (`sim/sheet-field.ts`).
 */

/** Référence des fiches du projet (recherche documentaire, #262). */
const ESPECES = 'docs/ESPECES.md';

/**
 * Fraction de la taille adulte d'un prédateur sous laquelle une proie adulte est mangée, quand
 * aucune liste nominative ne tranche (`docs/ECOSYSTEME.md` § 3.2) : **approximation de jeu**,
 * « ce qui tient dans sa bouche », aucune source lue ne la chiffre. Ne s'applique qu'aux
 * prédateurs du jeu (`TEMPERAMENTS`, `sim/compatibility.ts`).
 */
export const PREDATION_SIZE_FRACTION = 1 / 3;

const NO: SheetField<boolean> = approx(false);

/**
 * Espèces à longues nageoires, cibles des mangeurs de nageoires. Guppy : mâles à longue caudale,
 * **approximation de jeu** (aucune source lue ne le cite face à un mangeur de nageoires).
 */
export const LONG_FINS: Readonly<Partial<Record<SpeciesId, SheetField<boolean>>>> = Object.freeze({
  guppy: approx(true),
});

/**
 * Nageurs lents, gênés par les nageurs rapides (poissons rouges fantaisie face aux comètes,
 * `docs/ECOSYSTEME.md` § 3.2) : aucune espèce du jeu pour l'instant (le poisson rouge du jeu
 * est la forme commune, et la comète n'existe pas).
 */
export const SLOW_SWIMMERS: Readonly<Partial<Record<SpeciesId, SheetField<boolean>>>> =
  Object.freeze({});

/**
 * Espèces qui vivent sans poissons ni crevettes : toute espèce qui n'est pas un amphibien leur
 * est incompatible (`docs/ESPECES.md`, matrice de compatibilité : « sans poissons »).
 */
export const LIVES_WITHOUT_FISH: Readonly<Partial<Record<SpeciesId, SheetField<boolean>>>> =
  Object.freeze({
    axolotl: sourced(true, `${ESPECES} (FishKeeper, secondaire : ne se mélange pas aux poissons)`),
    triton: sourced(true, `${ESPECES} (Caudata Culture : sans poissons)`),
  });

/** Valeur de `table` pour `id`, ou « non » en approximation de jeu. */
export function flagOf(
  table: Readonly<Partial<Record<SpeciesId, SheetField<boolean>>>>,
  id: SpeciesId,
): SheetField<boolean> {
  return table[id] ?? NO;
}
