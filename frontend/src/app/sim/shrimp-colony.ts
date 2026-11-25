import { deriveSeed, prngOutput } from '../core/random/prng';
import { environmentWater } from './environment';
import type { Vec3 } from './flocking';
import { FRY_FULL_COVER_M2, fryCover, fryPlants, isFry } from './fry';
import type { SheetField } from './sheet-field';
import { sourced } from './sheet-field';
import type { SpeciesId } from './species';
import { SPECIES_ECOLOGY } from './species-ecology';
import { capacityProfile, speciesNeedLiters } from './tank-capacity';
import { waterLiters } from './water';
import { phOutOfTolerance } from './water-ph';
import { waterQuality } from './water-quality';
import type { Entity, Mutable, MutableWorld } from './world-types';

/**
 * Colonie de crevettes naines (issue #836, tranche 2 de #732, ADR 0180, `docs/ECOSYSTEME.md`
 * § 3.3) : les crevettes cerises se reproduisent, la colonie se limite d'elle-même par la
 * nourriture, la place et la prédation. Fonctions pures du temps simulé et de la graine :
 * le pas fin (`sim/world.ts`) et l'avance à gros pas (`sim/ecosystem-step.ts`) donnent les
 * mêmes éclosions et les mêmes pertes.
 *
 * - **Éclosions** : le temps est découpé en couvées de `CLUTCH_PERIOD_SECONDS` ; à la fin de
 *   chacune, chaque femelle adulte (identifiant impair, comme le platy) en pleine santé,
 *   nourrie (`SHRIMP_FED_HUNGER`), dans une eau bonne au pH toléré, fait éclore `clutchSize`
 *   jeunes, tant que la colonie a sa place (`shrimpPlace` : capacité du bac, #729, pour les
 *   seules crevettes). Un jeune est un animal à `growth` (comme un alevin, `sim/fry.ts`), posé au
 *   fond près de sa mère ; il devient adulte au bout de `FRY_GROWTH_TIME`.
 * - **Néritines** : aucune éclosion en eau douce (`NERITE_HATCHES_IN_FRESHWATER`).
 * - **Prédation** (`docs/ECOSYSTEME.md` § 3.3, listes `prey` de `sim/species-ecology.ts`) : à
 *   chaque fenêtre de `PREDATION_PERIOD_SECONDS`, chaque crevette est mangée avec la
 *   probabilité `1 − exp(−risque × période)`, tirée du hachage (graine, identifiant, fenêtre).
 *   Un adulte n'est mangé que par les mangeurs d'adultes (poisson rouge) ; un jeune par tous
 *   les mangeurs de crevettes, sauf s'il est à l'abri des plantes proches (refuge gradué de
 *   #823 : son risque est multiplié par la part non couverte). Les otocinclus n'en mangent pas.
 *
 * Valeurs : **approximations de jeu** (temps compressé) ; en vrai, une femelle porte ses œufs
 * environ un mois et les jeunes sont mûrs vers trois mois.
 */

/** Aquarium Breeder, néritines (`docs/ECOSYSTEME.md` § 2). */
const AB_NERITE =
  'https://aquariumbreeder.com/nerite-snails-detailed-guide-care-diet-and-breeding/';

/** Espèces dont la colonie se reproduit dans le bac. */
export const COLONY_SPECIES: readonly SpeciesId[] = Object.freeze(['cerise']);

/** Les néritines font-elles éclore leurs œufs en eau douce ? Non : l'eau doit être saumâtre. */
export const NERITE_HATCHES_IN_FRESHWATER: SheetField<boolean> = sourced(
  false,
  `${AB_NERITE} (œufs viables seulement en eau saumâtre, 5 à 15 ‰)`,
);

/** Durée d'une couvée, en secondes simulées : un jour de jeu (approximation de jeu). */
export const CLUTCH_PERIOD_SECONDS = 1200;
/** Jeunes par couvée, bornes comprises (approximation de jeu, une vraie en compte 20 à 30). */
export const MIN_CLUTCH = 2;
export const MAX_CLUTCH = 4;
/**
 * Faim strictement sous laquelle une crevette est « nourrie » (approximation de jeu) : elle a
 * mangé dans les dernières minutes ; sans nourriture ni algues, sa faim atteint 1 en 300 s.
 */
export const SHRIMP_FED_HUNGER = 0.75;
/** Fenêtre des tirages de prédation, en secondes simulées. */
export const PREDATION_PERIOD_SECONDS = 60;
/**
 * Risque d'un adulte par mangeur d'adultes présent, par seconde (approximation de jeu) : un
 * poisson rouge prend une crevette donnée en deux jours de jeu en moyenne, « tôt ou tard »
 * (Practical Fishkeeping).
 */
export const ADULT_SHRIMP_RISK = 1 / 2400;
/** Risque d'un jeune à découvert par mangeur de crevettes présent, par seconde. */
export const YOUNG_SHRIMP_RISK = 1 / 600;

const UINT32_RANGE = 4294967296;
const CLUTCH_SALT = 0xc1e5;
const HUNT_SALT = 0x5a7e;
/** Marge des fenêtres de temps : `n · période` calculé en flottants tombe parfois juste dessous. */
const WINDOW_EPSILON = 1e-9;

/** Vrai si l'espèce vit en colonie qui se reproduit dans le bac. */
export function isColonySpecies(species: SpeciesId): boolean {
  return COLONY_SPECIES.includes(species);
}

/** Vrai si l'animal est d'une espèce en colonie. */
function isColonyAnimal(animal: Pick<Entity, 'species'>): boolean {
  return isColonySpecies(animal.species);
}

/** Vrai si la crevette est une femelle : identifiants impairs (aucun rendu, aucun tirage). */
export function isShrimpFemale(fish: Pick<Entity, 'id'>): boolean {
  return Number.isInteger(fish.id) && fish.id % 2 === 1;
}

/**
 * Nombre de crevettes que tiennent `liters` litres : volume divisé par le besoin d'une
 * crevette adulte au plafond (`speciesNeedLiters`, 3 L pour une crevette de 3 cm) ; 0 pour un
 * volume nul ou invalide.
 */
export function shrimpPlace(liters: number): number {
  const each = speciesNeedLiters(capacityProfile('cerise'), 1);
  if (!(liters > 0) || !Number.isFinite(liters) || !(each > 0)) {
    return 0;
  }
  return Math.floor(liters / each);
}

/** Taille de la couvée `clutch` de la mère `motherId`, dans [`MIN_CLUTCH`, `MAX_CLUTCH`]. */
export function clutchSize(seed: number, motherId: number, clutch: number): number {
  const u = hashUnit(seed, motherId, clutch ^ CLUTCH_SALT);
  return MIN_CLUTCH + Math.floor(u * (MAX_CLUTCH - MIN_CLUTCH + 1));
}

/**
 * Rang de la dernière fenêtre de `period` secondes achevée entre `start` (exclu) et `end`
 * (inclus), ou -1 si aucune ne s'achève. Le nombre de fenêtres achevées est donné par
 * `endedWindowCount`.
 */
export function endedWindow(start: number, end: number, period: number): number {
  const before = Math.floor(start / period + WINDOW_EPSILON);
  const after = Math.floor(end / period + WINDOW_EPSILON);
  return after > before ? after - 1 : -1;
}

/**
 * Nombre de fenêtres de `period` secondes achevées entre `start` (exclu) et `end` (inclus) :
 * 0 ou 1 au pas fin, davantage quand le pas dépasse une fenêtre (`advanceEcosystemInPlace`
 * accepte un `stepSeconds` quelconque, #838).
 */
export function endedWindowCount(start: number, end: number, period: number): number {
  const before = Math.floor(start / period + WINDOW_EPSILON);
  const after = Math.floor(end / period + WINDOW_EPSILON);
  return Math.max(0, after - before);
}

/** Bac lu par la colonie : conditions d'éclosion d'une femelle. */
export interface ClutchConditions {
  readonly goodWater: boolean;
  readonly phOut: boolean;
}

/** Vrai si `fish` peut faire éclore une couvée (voir l'en-tête). */
export function canHatch(fish: Entity, conditions: ClutchConditions): boolean {
  return (
    isColonySpecies(fish.species) &&
    !isFry(fish) &&
    isShrimpFemale(fish) &&
    fish.health >= 1 &&
    fish.hunger < SHRIMP_FED_HUNGER &&
    conditions.goodWater &&
    !conditions.phOut
  );
}

/**
 * Naissance d'un jeune de `species` près de `near`, **en modifiant** le monde, ou `null` si un
 * plafond l'empêche (`birthYoungInPlace` de `sim/world.ts`, passé pour éviter un cycle
 * d'import).
 */
export type BirthYoung = (world: MutableWorld, species: SpeciesId, near: Vec3) => Entity | null;

/**
 * Colonie d'un pas `dt` qui vient de s'achever au temps `world.time`, **en modifiant**
 * `world` : prédation à la fin de chaque fenêtre de `PREDATION_PERIOD_SECONDS`, puis éclosions
 * à la fin de chaque couvée. `liters` : volume d'eau (défaut : celui du bac). Sans crevette ni
 * fin de fenêtre, rien n'est calculé. Renvoie le nombre de naissances moins celui des pertes.
 *
 * Un pas plus long qu'une fenêtre compte toutes celles qu'il achève (#838) : la prédation
 * tire une seule fois la probabilité composée des `n` fenêtres, `1 − exp(−risque × période ×
 * n)`, puis chaque couvée achevée éclôt dans l'ordre. Au pas de `ECOSYSTEM_STEP_SECONDS`
 * (5 s), `n` vaut 0 ou 1 : rien ne change.
 */
export function stepShrimpColonyInPlace(
  world: MutableWorld,
  dt: number,
  birth: BirthYoung,
  liters?: number,
): number {
  const start = world.time - dt;
  const hunt = endedWindow(start, world.time, PREDATION_PERIOD_SECONDS);
  const clutch = endedWindow(start, world.time, CLUTCH_PERIOD_SECONDS);
  if ((hunt < 0 && clutch < 0) || !world.entities.some(isColonyAnimal)) {
    return 0;
  }
  const huntWindows = endedWindowCount(start, world.time, PREDATION_PERIOD_SECONDS);
  const eaten = hunt < 0 ? 0 : huntShrimpInPlace(world, hunt, huntWindows);
  const volume = liters ?? waterLiters(environmentWater(world));
  const clutches = endedWindowCount(start, world.time, CLUTCH_PERIOD_SECONDS);
  let born = 0;
  for (let c = clutch - clutches + 1; clutch >= 0 && c <= clutch; c++) {
    const hatched = hatchClutchInPlace(world, c, birth, volume);
    born += hatched;
    if (hatched === 0) {
      // Mêmes mères, colonie au moins aussi grande : les couvées suivantes n'éclosent pas.
      break;
    }
  }
  return born - eaten;
}

/** Éclosions de la couvée `clutch` ; renvoie le nombre de jeunes nés. */
function hatchClutchInPlace(
  world: MutableWorld,
  clutch: number,
  birth: BirthYoung,
  liters: number,
): number {
  const place = shrimpPlace(liters);
  let count = world.entities.filter(isColonyAnimal).length;
  // Seul `phOutOfTolerance` dépend de l'espèce : la qualité de l'eau est lue une fois (#838).
  const goodWater = waterQuality(world.water, world.environment) === 'bonne';
  const mothers = world.entities.filter((fish) =>
    canHatch(fish, { goodWater, phOut: phOutOfTolerance(world.water.ph, fish.species) }),
  );
  let born = 0;
  for (const mother of mothers) {
    const size = clutchSize(world.seed, mother.id, clutch);
    for (let k = 0; k < size && count < place; k++) {
      const young = birth(world, mother.species, mother) as Mutable<Entity> | null;
      if (young === null) {
        return born;
      }
      // Posé au fond comme sa mère (un marcheur ne naît pas en pleine eau).
      young.y = mother.y;
      count += 1;
      born += 1;
    }
  }
  return born;
}

/** Mangeurs de crevettes présents, adultes seulement : d'adultes et de jeunes seulement. */
interface ShrimpEaters {
  adults: number;
  young: number;
}

function countShrimpEaters(entities: readonly Entity[]): ShrimpEaters {
  const eaters: ShrimpEaters = { adults: 0, young: 0 };
  for (const animal of entities) {
    if (isFry(animal)) {
      continue;
    }
    for (const prey of SPECIES_ECOLOGY[animal.species].prey.value) {
      if (prey.species === 'cerise') {
        eaters[prey.stage === 'adult' ? 'adults' : 'young'] += 1;
      }
    }
  }
  return eaters;
}

/**
 * Prédation des `windows` fenêtres achevées, la dernière de rang `window` (graine des tirages) ;
 * renvoie le nombre de crevettes mangées.
 */
function huntShrimpInPlace(world: MutableWorld, window: number, windows: number): number {
  const eaters = countShrimpEaters(world.entities);
  if (eaters.adults + eaters.young === 0) {
    return 0;
  }
  const entities = world.entities as Entity[];
  const plants = fryPlants(world.decor);
  const surface = environmentWater(world).maxY;
  let eaten = 0;
  for (let i = entities.length - 1; i >= 0; i--) {
    const shrimp = entities[i];
    if (!isColonySpecies(shrimp.species)) {
      continue;
    }
    let risk = eaters.adults * ADULT_SHRIMP_RISK;
    if (isFry(shrimp)) {
      const cover = fryCover(plants, shrimp.x, shrimp.z, world.water.plantGrowth, surface);
      const exposed = 1 - Math.min(1, cover / FRY_FULL_COVER_M2);
      risk = (eaters.adults + eaters.young) * YOUNG_SHRIMP_RISK * exposed;
    }
    const chance = 1 - Math.exp(-risk * PREDATION_PERIOD_SECONDS * windows);
    if (hashUnit(world.seed, shrimp.id, window ^ HUNT_SALT) < chance) {
      entities.splice(i, 1);
      eaten += 1;
    }
  }
  return eaten;
}

/** Réel de [0, 1) tiré du hachage de trois entiers (aucun générateur consommé). */
function hashUnit(seed: number, id: number, salt: number): number {
  return prngOutput(deriveSeed(deriveSeed(seed, id), salt >>> 0)) / UINT32_RANGE;
}
