import type { SheetField } from './sheet-field';
import { approx, sourced } from './sheet-field';
import type { SpeciesId } from './species';
import { assertTimeStep } from './time-step';

/**
 * Brouteurs d'algues (issue #833, tranche 1 de #732, ADR 0179, `docs/ECOSYSTEME.md` § 3.3) :
 * néritines, otocinclus, ancistrus et crevettes cerises mangent les plaques d'algues du bac
 * (`sim/algae.ts`) quand ils ont faim, et chaque bouchée calme leur faim. Fonctions pures et
 * déterministes, sans tirage ni allocation par pas.
 *
 * Règles :
 * - un brouteur mange tant que sa faim est positive, au plus `rate · dt` de couverture par pas,
 *   et jamais plus que ce qui calme sa faim (`GRAZE_SATIATION_PER_COVER`) ;
 * - la bouchée se répartit sur les plaques qu'il peut manger, en proportion de leur couverture
 *   (les plus grosses reculent le plus) ; les animaux mangent dans l'ordre du tableau ;
 * - **algues dures** : les plaques `HARD_ALGAE_PATCHES` (algues en points durs sur la vitre)
 *   ne sont mangées que par les espèces qui en viennent à bout (`hardAlgae`) : jamais par les
 *   crevettes (Garnelio) ;
 * - **faim** : une néritine n'a pas d'autre nourriture que les algues et les pastilles : sans
 *   elles, sa faim compte dans sa santé et sa mortalité (`starvesWithoutFood`, Aquarium
 *   Breeder). Les crevettes vivent aussi du biofilm, non simulé : leur faim reste sans effet
 *   (charognards et colonie : tranche 2 de #732).
 *
 * Le biofilm n'existe pas encore dans le jeu : aucun brouteur ne le mange.
 */

/** Ce qu'un brouteur mange et à quelle vitesse. */
export interface Grazer {
  /** Couverture d'algues mangée au plus par seconde, toutes plaques confondues. */
  readonly rate: SheetField<number>;
  /** Vient à bout des algues dures (`HARD_ALGAE_PATCHES`). */
  readonly hardAlgae: SheetField<boolean>;
  /** Sa faim compte dans sa santé quand il n'a rien à manger (sinon : biofilm implicite). */
  readonly starves: SheetField<boolean>;
}

/** Garnelio, crevettes et escargots nettoyeurs (`docs/ECOSYSTEME.md` § 2). */
const GARNELIO =
  'https://www.garnelio.de/en/blog/invertebrates/the-invertebrate-algae-police-shrimp-and-snails-as-a-cleanup-crew';
/** Aquarium Breeder, néritines (`docs/ECOSYSTEME.md` § 2). */
const AB_NERITE =
  'https://aquariumbreeder.com/nerite-snails-detailed-guide-care-diet-and-breeding/';

/**
 * Brouteurs du jeu. Les vitesses sont des **approximations de jeu** (temps compressé comme la
 * faim) : un escargot ou un ancistrus râpe plus vite qu'une crevette.
 */
export const GRAZERS: Readonly<Partial<Record<SpeciesId, Grazer>>> = Object.freeze({
  neritine: {
    rate: approx(1 / 200),
    hardAlgae: approx(true),
    starves: sourced(true, `${AB_NERITE} (meurent de faim sans algues ni nourriture d’appoint)`),
  },
  otocinclus: {
    rate: approx(1 / 300),
    hardAlgae: approx(false),
    // Nourri aussi aux granulés : sa faim compte déjà (`feedsOnPellets`).
    starves: approx(false),
  },
  ancistrus: {
    rate: approx(1 / 150),
    hardAlgae: approx(true),
    starves: approx(false),
  },
  cerise: {
    rate: approx(1 / 600),
    hardAlgae: sourced(false, `${GARNELIO} (ne viennent pas à bout des algues dures)`),
    starves: approx(false),
  },
});

/**
 * Faim calmée par une couverture pleine d'une plaque mangée : une plaque entière est un repas
 * complet (approximation de jeu).
 */
export const GRAZE_SATIATION_PER_COVER = 1;

/**
 * Plaques d'algues dures, par indice dans `ALGAE_WALLS` (`sim/algae.ts`) : une sur le fond et
 * une sur le côté droit (approximation de jeu ; les autres sont des algues vertes tendres).
 */
export const HARD_ALGAE_PATCHES: readonly number[] = Object.freeze([3, 6]);

/** Brouteur de l'espèce `species`, ou `undefined`. */
export function grazerOf(species: SpeciesId): Grazer | undefined {
  return GRAZERS[species];
}

/** Vrai si la faim de l'espèce compte quand elle n'a rien à manger (néritine). */
export function starvesWithoutFood(species: SpeciesId): boolean {
  return GRAZERS[species]?.starves.value === true;
}

/** Vrai si la plaque `index` est une plaque d'algues dures. */
export function isHardAlgae(index: number): boolean {
  return HARD_ALGAE_PATCHES.includes(index);
}

/** Animal vu par le broutage. */
export interface GrazingAnimal {
  readonly species: SpeciesId;
  hunger: number;
}

/** Eau vue par le broutage. */
export interface GrazedWater {
  algae?: readonly number[];
}

/**
 * Broutage d'un pas `dt`, **en modifiant** `water` et la faim des `animals` (dans l'ordre du
 * tableau) : voir les règles du module. S'il ne reste aucune algue, le champ `algae` est
 * retiré (comme après la raclette). Renvoie la couverture mangée (0 sans algues ni brouteur).
 * @throws RangeError si `dt` n'est pas un pas valide.
 */
export function grazeAlgaeInPlace(
  water: GrazedWater,
  animals: readonly GrazingAnimal[],
  dt: number,
): number {
  assertTimeStep(dt);
  // Le tableau des couvertures appartient à l'eau du monde (comme dans `stepAlgaeInPlace`).
  const cover = water.algae as number[] | undefined;
  if (cover === undefined) {
    return 0;
  }
  let eaten = 0;
  for (const animal of animals) {
    const grazer = GRAZERS[animal.species];
    if (grazer !== undefined && animal.hunger > 0) {
      eaten += biteInPlace(cover, animal, grazer, dt);
    }
  }
  if (eaten > 0 && isEmptyCover(cover)) {
    delete water.algae;
  }
  return eaten;
}

/** Vrai si toutes les plaques sont nues ; boucle simple, sans fermeture par pas (#835). */
function isEmptyCover(cover: readonly number[]): boolean {
  for (const c of cover) {
    if (c !== 0) {
      return false;
    }
  }
  return true;
}

/** Une bouchée d'un brouteur, répartie sur les plaques qu'il mange ; renvoie sa taille. */
function biteInPlace(cover: number[], animal: GrazingAnimal, grazer: Grazer, dt: number): number {
  const hard = grazer.hardAlgae.value;
  let edible = 0;
  for (let i = 0; i < cover.length; i++) {
    if (hard || !isHardAlgae(i)) {
      edible += cover[i];
    }
  }
  const bite = Math.min(grazer.rate.value * dt, animal.hunger / GRAZE_SATIATION_PER_COVER, edible);
  if (!(bite > 0)) {
    return 0;
  }
  const keep = 1 - bite / edible;
  for (let i = 0; i < cover.length; i++) {
    if (hard || !isHardAlgae(i)) {
      cover[i] = keep > 0 ? cover[i] * keep : 0;
    }
  }
  animal.hunger = Math.max(0, animal.hunger - bite * GRAZE_SATIATION_PER_COVER);
  return bite;
}
