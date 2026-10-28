import type { SpeciesDefinition } from './species';
import { likesAcidWater, phOutOfTolerance } from './water-ph';

/**
 * Bien-être des animaux, première partie : santé (issue #208, ADR 0054).
 *
 * La faim existe déjà (`Fish.hunger`, `sim/feeding.ts`, ADR 0023) : elle monte avec le temps
 * simulé et baisse à chaque granulé mangé. La santé `health` ∈ [`HEALTH_FLOOR`, 1] en découle :
 * elle baisse tant que l'animal est affamé au maximum (`hunger` = 1) ou que l'eau est
 * « mauvaise » (`waterQuality`, `sim/water-quality.ts`, lu tel quel), d'autant plus vite que
 * les deux causes se cumulent ; sinon elle remonte, plus lentement. Elle ne descend jamais
 * sous le plancher : aucune mort dans ce sprint.
 *
 * Un pH hors de la plage tolérée de l'espèce (`sim/water-ph.ts`, issue #236, ADR 0057) est
 * une cause de plus, de poids `PH_STRESS` : la santé baisse deux fois moins vite que pour
 * la faim ou l'eau mauvaise.
 *
 * Effets : nage plus lente (`vigor`, facteur du déplacement) et couleurs ternies au rendu
 * (`dullness`). À santé 1, `vigor` vaut exactement 1 et `dullness` exactement 0 : un animal
 * en bonne santé nage et s'affiche comme avant l'issue #208, au bit près.
 *
 * Aucun tirage aléatoire, aucune allocation. Exprimé en temps simulé (`dt`), donc
 * indépendant de la vitesse de simulation (`sim/sim-speed.ts`), qui ne change que le nombre
 * de pas par image.
 *
 * Valeurs de jeu (approximations, pas des mesures).
 */

/** Santé minimale : un animal malade ne meurt pas dans ce sprint. */
export const HEALTH_FLOOR = 0.2;
/** Santé d'un animal neuf (et d'une sauvegarde antérieure à l'issue #208). */
export const HEALTH_START = 1;
/**
 * Perte de santé par seconde et par cause (faim maximale, eau mauvaise) : de 1 au plancher
 * en 8 minutes simulées pour une cause, 4 pour deux.
 */
export const HEALTH_DECAY_RATE = (1 - HEALTH_FLOOR) / 480;
/** Regain de santé par seconde sans aucune cause : du plancher à 1 en 16 minutes simulées. */
export const HEALTH_RECOVERY_RATE = (1 - HEALTH_FLOOR) / 960;
/** Faim à partir de laquelle l'animal souffre : la faim maximale. */
export const STARVING_HUNGER = 1;
/**
 * Poids d'un pH hors de la plage tolérée (issue #236) : demi-cause, de 1 au plancher en
 * 16 minutes simulées s'il est la seule cause.
 */
export const PH_STRESS = 0.5;
/**
 * Santé plancher des espèces d'eau acide (`likesAcidWater`) tant qu'une feuille de catappa
 * agit (issue #239, ADR 0071) : « légèrement relevée », **valeur de jeu**. La santé n'y est
 * pas portée d'un coup : elle cesse seulement de baisser en dessous (`stepHealth`).
 */
export const CATAPPA_HEALTH_FLOOR = HEALTH_FLOOR + 0.1;
/** Ralentissement au plancher : la nage y garde `1 − HEALTH_SLOWDOWN` de sa vitesse. */
export const HEALTH_SLOWDOWN = 0.4;

/**
 * Vrai si l'espèce cherche et mange les granulés (`sim/feeding.ts`). Les espèces qui marchent
 * sur le fond (axolotl) ou amphibies (grenouille, triton) n'ont pas encore de recherche de
 * nourriture : leur faim monte sans qu'on puisse les nourrir, elle ne compte donc pas dans
 * leur santé (seule l'eau compte).
 */
export function feedsOnPellets(def: SpeciesDefinition): boolean {
  return def.walker === undefined && def.amphibian === undefined;
}

/**
 * Poids des causes de souffrance, de 0 à 2,5 : faim maximale (1, seulement pour une espèce
 * qui mange les granulés, `feedsOnPellets`), eau mauvaise (1) et pH hors de la plage tolérée
 * (`PH_STRESS`, issue #236). Une faim non finie ne compte pas.
 */
export function healthStress(
  hunger: number,
  def: SpeciesDefinition,
  badWater: boolean,
  phOut = false,
): number {
  const starving = feedsOnPellets(def) && hunger >= STARVING_HUNGER ? 1 : 0;
  return starving + (badWater ? 1 : 0) + (phOut ? PH_STRESS : 0);
}

/**
 * Santé après `dt` secondes avec `stress` causes (`healthStress`) : baisse de
 * `stress · HEALTH_DECAY_RATE · dt`, ou regain de `HEALTH_RECOVERY_RATE · dt` sans cause,
 * bornée à [`HEALTH_FLOOR`, 1]. Une valeur non finie (état corrompu) repart de
 * `HEALTH_START`. Avec un plancher relevé `floor` (catappa, issue #239), la baisse s'arrête à
 * `floor`, ou à la santé de départ si elle est déjà en dessous : jamais de saut vers le haut.
 */
export function stepHealth(
  health: number,
  stress: number,
  dt: number,
  floor = HEALTH_FLOOR,
): number {
  const base = Number.isFinite(health) ? health : HEALTH_START;
  if (stress > 0) {
    const lowest = Math.max(HEALTH_FLOOR, Math.min(base, floor));
    return clamp(base - stress * HEALTH_DECAY_RATE * dt, lowest, 1);
  }
  return clamp(base + HEALTH_RECOVERY_RATE * dt, HEALTH_FLOOR, 1);
}

/**
 * Facteur de vitesse de nage pour une santé : exactement 1 à santé 1, `1 − HEALTH_SLOWDOWN`
 * au plancher, linéaire entre les deux. Santé hors bornes ramenée dans [plancher, 1] ; non
 * finie, comptée comme pleine.
 */
export function vigor(health: number): number {
  return 1 - HEALTH_SLOWDOWN * dullness(health);
}

/**
 * Ternissement des couleurs pour une santé, dans [0, 1] : exactement 0 à santé 1, 1 au
 * plancher, linéaire entre les deux. Santé hors bornes ramenée dans [plancher, 1] ; non
 * finie, comptée comme pleine.
 */
export function dullness(health: number): number {
  if (!Number.isFinite(health) || health >= 1) {
    return 0;
  }
  const h = health < HEALTH_FLOOR ? HEALTH_FLOOR : health;
  return (1 - h) / (1 - HEALTH_FLOOR);
}

/** Animal vu par le bien-être. */
export interface WellbeingSubject {
  readonly species: SpeciesDefinition['id'];
  hunger: number;
  health: number;
}

/**
 * Santé d'un pas pour tous les animaux, **en place** (aucune allocation), sur leur faim de
 * fin de pas (après les repas). `speciesOf` donne la définition d'une espèce ; `badWater` :
 * eau « mauvaise » pendant le pas ; `ph` : pH de l'eau (issue #236), comparé à la plage
 * tolérée de chaque espèce (absent : le pH ne compte pas) ; `catappa` : une feuille de catappa
 * agit (issue #239), la santé des espèces d'eau acide ne baisse plus sous
 * `CATAPPA_HEALTH_FLOOR`.
 */
export function stepWellbeingInPlace<S extends WellbeingSubject>(
  animals: readonly S[],
  dt: number,
  badWater: boolean,
  speciesOf: (species: S['species']) => SpeciesDefinition,
  ph?: number,
  catappa = false,
): void {
  for (const animal of animals) {
    const phOut = ph !== undefined && phOutOfTolerance(ph, animal.species);
    const stress = healthStress(animal.hunger, speciesOf(animal.species), badWater, phOut);
    const floor = catappa && likesAcidWater(animal.species) ? CATAPPA_HEALTH_FLOOR : HEALTH_FLOOR;
    animal.health = stepHealth(animal.health, stress, dt, floor);
  }
}

/**
 * Animaux affamés de longue date, **en place** : faim maximale et santé au plancher (paramètre
 * de capture `affames=1`, issue #208).
 */
export function starveInPlace(animals: readonly WellbeingSubject[]): void {
  for (const animal of animals) {
    animal.hunger = STARVING_HUNGER;
    animal.health = HEALTH_FLOOR;
  }
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
