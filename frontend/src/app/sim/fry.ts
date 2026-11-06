import { deriveSeed, prngOutput } from '../core/random/prng';
import { SIM_DT } from './constants';
import type { DecorItem } from './decor';
import type { Vec3 } from './flocking';
import { SPECIES, speciesVariantIndex, type SpeciesId } from './species';
import type { Fish, SwimBounds } from './swimmer';

/**
 * Alevins (issue #459, ADR 0107) : naissance, croissance et cachettes.
 *
 * - **Naissance** : calendrier sans état. Le temps simulé est découpé en portées de
 *   `BROOD_PERIOD` secondes ; au dernier pas de chaque portée, chaque femelle adulte d'une
 *   espèce vivipare (`FRY_SPECIES`, le guppy seul) en bonne santé, nourrie et dans une eau
 *   conforme (`BroodConditions`) met bas de `MIN_BROOD` à `MAX_BROOD` alevins, nombre tiré du
 *   hachage (graine du monde, identifiant de la mère, rang de la portée) : aucun tirage pris
 *   aux générateurs des poissons, rien ajouté à l'état du monde hors des alevins eux-mêmes.
 *   Un bac jamais nourri (faim de départ `HUNGER_START`) n'a donc jamais d'alevin.
 * - **Alevin** : un poisson de l'espèce, avec un âge `Fish.growth` (secondes depuis la
 *   naissance). Il grandit en `FRY_STAGES` jalons (`fryStage`, rendu à l'échelle `fryScale`)
 *   et devient adulte au bout de `FRY_GROWTH_TIME` : le champ disparaît. Il nage près des
 *   plantes (`fryTarget`).
 * - **Prédation** : un adulte nageur à moins de `FRY_EAT_RADIUS` d'un alevin d'au moins
 *   `FRY_SAFE_AGE` qui n'est à moins de `FRY_HIDE_RADIUS` d'aucune plante (à l'horizontale)
 *   le mange.
 *
 * Toutes les valeurs sont des **approximations de jeu** : la gestation réelle du guppy dure
 * environ quatre semaines, la croissance plusieurs mois.
 */

/** Espèces vivipares qui mettent bas des alevins dans la simulation. */
export const FRY_SPECIES: readonly SpeciesId[] = Object.freeze(['guppy']);

/** Durée d'une portée (gestation de jeu), en secondes simulées. */
export const BROOD_PERIOD = 300;
/** Durée d'une portée en pas de `SIM_DT`. */
export const BROOD_TICKS = Math.round(BROOD_PERIOD / SIM_DT);
/** Nombre d'alevins d'une portée, bornes comprises. */
export const MIN_BROOD = 2;
export const MAX_BROOD = 6;
/** Faim strictement sous laquelle une femelle est « nourrie » (départ : 0,5). */
export const FED_HUNGER = 0.5;

/** Temps de croissance d'un alevin jusqu'à l'âge adulte, en secondes simulées. */
export const FRY_GROWTH_TIME = 1200;
/** Nombre de jalons de croissance. */
export const FRY_STAGES = 4;
/** Échelle du modèle à chaque jalon (l'adulte est à 1). */
export const FRY_SCALES: readonly number[] = Object.freeze([0.5, 0.65, 0.8, 0.9]);

/** Distance horizontale à une plante sous laquelle un alevin est caché, en mètres. */
export const FRY_HIDE_RADIUS = 0.12;
/**
 * Âge sous lequel un alevin n'est pas encore mangé, en secondes : le temps de gagner les
 * plantes après sa naissance près de sa mère (approximation de jeu).
 */
export const FRY_SAFE_AGE = 30;
/** Distance entre centres sous laquelle un adulte mange un alevin non caché, en mètres. */
export const FRY_EAT_RADIUS = 0.04;
/** Rayon du cercle décrit par un alevin autour de sa plante, en mètres. */
export const FRY_CIRCLE_RADIUS = 0.07;
/** Vitesse angulaire de ce cercle, en rad/s. */
const FRY_CIRCLE_RATE = 0.15;
/** Hauteur visée, en fraction de la hauteur de nage au-dessus du fond. */
const FRY_HEIGHT_RATIO = 0.45;

const UINT32_RANGE = 4294967296;
const BROOD_SALT = 0xa1e7;

/** Vrai si l'animal est un alevin. */
export function isFry(fish: Pick<Fish, 'growth'>): boolean {
  return fish.growth !== undefined;
}

/** Vrai si `growth` est un âge d'alevin valide : réel dans [0, `FRY_GROWTH_TIME`). */
export function isFryAge(growth: unknown): growth is number {
  return (
    typeof growth === 'number' && Number.isFinite(growth) && growth >= 0 && growth < FRY_GROWTH_TIME
  );
}

/** Vrai si l'espèce met bas des alevins. */
export function hasFry(species: SpeciesId): boolean {
  return FRY_SPECIES.includes(species);
}

/** Vrai si l'animal est une femelle (apparence `femelle` de l'espèce). */
export function isFemale(fish: Pick<Fish, 'id' | 'species'>, seed = 0): boolean {
  const def = SPECIES[fish.species];
  const variants = def.variants;
  if (variants === undefined || variants.length === 0) {
    return false;
  }
  return variants[speciesVariantIndex(def, fish.id, seed)]?.id === 'femelle';
}

/** Jalon de croissance d'un âge, de 0 à `FRY_STAGES - 1` ; `FRY_STAGES` pour un adulte. */
export function fryStage(growth: number | undefined): number {
  if (growth === undefined || !Number.isFinite(growth)) {
    return FRY_STAGES;
  }
  if (growth <= 0) {
    return 0;
  }
  return Math.min(FRY_STAGES, Math.floor((growth / FRY_GROWTH_TIME) * FRY_STAGES));
}

/** Échelle du modèle rendu pour un âge (1 pour un adulte). */
export function fryScale(growth: number | undefined): number {
  const stage = fryStage(growth);
  return stage >= FRY_STAGES ? 1 : FRY_SCALES[stage];
}

/** Rang de la portée qui s'achève au pas `tick`, ou -1 si `tick` n'achève aucune portée. */
export function broodIndexAt(tick: number): number {
  if (!Number.isInteger(tick) || tick <= 0 || tick % BROOD_TICKS !== 0) {
    return -1;
  }
  return tick / BROOD_TICKS - 1;
}

/**
 * Nombre d'alevins de la portée `brood` de la mère `motherId`, dans [`MIN_BROOD`,
 * `MAX_BROOD`] : fonction pure du hachage, sans générateur.
 */
export function broodSize(seed: number, motherId: number, brood: number): number {
  const state = deriveSeed(deriveSeed(seed, motherId), (brood ^ BROOD_SALT) >>> 0);
  const u = prngOutput(state) / UINT32_RANGE;
  return MIN_BROOD + Math.floor(u * (MAX_BROOD - MIN_BROOD + 1));
}

/** État du bac lu par la mise bas. */
export interface BroodConditions {
  /** Eau « bonne » (`waterQuality`), ni à surveiller ni mauvaise. */
  readonly goodWater: boolean;
  /** Vrai si le pH de l'eau sort de la plage tolérée de l'espèce. */
  readonly phOut: (species: SpeciesId) => boolean;
}

/**
 * Vrai si `fish` peut mettre bas : femelle adulte d'une espèce vivipare, santé pleine, sans
 * points blancs, nourrie (`FED_HUNGER`), dans une eau bonne au pH toléré.
 */
export function canBreed(fish: Fish, seed: number, conditions: BroodConditions): boolean {
  return (
    hasFry(fish.species) &&
    !isFry(fish) &&
    fish.health >= 1 &&
    fish.ich === undefined &&
    fish.hunger < FED_HUNGER &&
    conditions.goodWater &&
    !conditions.phOut(fish.species) &&
    isFemale(fish, seed)
  );
}

/**
 * Bornes de nage d'un alevin qui naît près de sa mère : zone de naissance réduite au cube de
 * demi-côté `FRY_CIRCLE_RADIUS / 2` autour d'elle, ramené dans `bounds.hard`.
 */
export function birthBounds(bounds: SwimBounds, mother: Vec3): SwimBounds {
  const { hard } = bounds;
  const r = FRY_CIRCLE_RADIUS / 2;
  const axis = (c: number, lo: number, hi: number): [number, number] => [
    Math.min(hi, Math.max(lo, c - r)),
    Math.min(hi, Math.max(lo, c + r)),
  ];
  const [minX, maxX] = axis(mother.x, hard.minX, hard.maxX);
  const [minY, maxY] = axis(mother.y, hard.minY, hard.maxY);
  const [minZ, maxZ] = axis(mother.z, hard.minZ, hard.maxZ);
  return { ...bounds, spawn: { minX, maxX, minY, maxY, minZ, maxZ } };
}

/** Plantes de chaque tableau de décor déjà vu (les tableaux de décor ne sont jamais modifiés). */
const PLANTS_CACHE = new WeakMap<readonly DecorItem[], readonly DecorItem[]>();

/**
 * Plantes du décor (cachettes des alevins), dans l'ordre du décor, figées et mises en cache
 * par tableau de décor : le pas réutilise le même tableau tant que le décor ne change pas
 * (aucune allocation par pas, issue #470).
 */
export function fryPlants(decor: readonly DecorItem[]): readonly DecorItem[] {
  const hit = PLANTS_CACHE.get(decor);
  if (hit !== undefined) {
    return hit;
  }
  const plants = Object.freeze(decor.filter((item) => item.kind === 'plant'));
  PLANTS_CACHE.set(decor, plants);
  return plants;
}

/** Plante la plus proche de `(x, z)` à l'horizontale (la première à égalité), ou `null`. */
export function nearestPlant(plants: readonly DecorItem[], x: number, z: number): DecorItem | null {
  let best: DecorItem | null = null;
  let bestD = Infinity;
  for (const plant of plants) {
    const d = (plant.x - x) ** 2 + (plant.z - z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = plant;
    }
  }
  return best;
}

/** Vrai si un animal en `(x, z)` est à moins de `FRY_HIDE_RADIUS` d'une plante. */
export function isHidden(plants: readonly DecorItem[], x: number, z: number): boolean {
  const r2 = FRY_HIDE_RADIUS * FRY_HIDE_RADIUS;
  for (const plant of plants) {
    if ((plant.x - x) ** 2 + (plant.z - z) ** 2 <= r2) {
      return true;
    }
  }
  return false;
}

/**
 * Point visé par un alevin : un cercle lent de rayon `FRY_CIRCLE_RADIUS` autour de la plante
 * la plus proche, bas dans l'eau, ramené dans `bounds.hard` ; écrit dans `out`. `null` sans
 * plante (l'alevin nage alors comme un adulte).
 */
export function fryTarget(
  fry: Fish,
  plants: readonly DecorItem[],
  time: number,
  bounds: SwimBounds,
  out: Vec3,
): Vec3 | null {
  const plant = nearestPlant(plants, fry.x, fry.z);
  if (plant === null) {
    return null;
  }
  const { hard } = bounds;
  const angle = fry.id * 2.399963 + time * FRY_CIRCLE_RATE;
  out.x = Math.min(hard.maxX, Math.max(hard.minX, plant.x + FRY_CIRCLE_RADIUS * Math.cos(angle)));
  out.z = Math.min(hard.maxZ, Math.max(hard.minZ, plant.z + FRY_CIRCLE_RADIUS * Math.sin(angle)));
  out.y = hard.minY + FRY_HEIGHT_RATIO * (hard.maxY - hard.minY);
  return out;
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/**
 * Fait grandir les alevins de `dt` secondes, **en place** ; un alevin qui atteint
 * `FRY_GROWTH_TIME` devient adulte (champ `growth` retiré). Renvoie le nombre de passages à
 * l'âge adulte.
 */
export function growFryInPlace(fishes: readonly Mutable<Fish>[], dt: number): number {
  let grown = 0;
  for (const fish of fishes) {
    if (fish.growth === undefined) {
      continue;
    }
    const age = fish.growth + dt;
    if (age >= FRY_GROWTH_TIME) {
      delete fish.growth;
      grown += 1;
    } else {
      fish.growth = age;
    }
  }
  return grown;
}

/** Vrai si l'animal peut manger un alevin : adulte nageur (ni marcheur ni amphibie). */
export function isPredator(fish: Fish): boolean {
  const def = SPECIES[fish.species];
  return !isFry(fish) && def.walker === undefined && def.amphibian === undefined;
}

/** Vrai si un adulte nageur de `fishes` est à une distance au carré sous `r2` de `fry`. */
function isCaught(fishes: readonly Fish[], fry: Fish, r2: number): boolean {
  for (let j = 0; j < fishes.length; j++) {
    const other = fishes[j];
    if (
      isPredator(other) &&
      (other.x - fry.x) ** 2 + (other.y - fry.y) ** 2 + (other.z - fry.z) ** 2 < r2
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Prédation, **en place** : retire de `fishes` chaque alevin d'au moins `FRY_SAFE_AGE`, non
 * caché (`isHidden`), à moins de
 * `FRY_EAT_RADIUS` d'un adulte nageur (`isPredator`), dans l'ordre du tableau. Renvoie le
 * nombre d'alevins mangés. Sans alevin, ne parcourt le tableau qu'une fois.
 *
 * Coût en O(alevins × animaux), borné par `MAX_TOTAL_FISH` (ADR 0107) ; aucune allocation.
 */
export function eatFryInPlace(fishes: Fish[], plants: readonly DecorItem[]): number {
  if (!fishes.some(isFry)) {
    return 0;
  }
  const r2 = FRY_EAT_RADIUS * FRY_EAT_RADIUS;
  let eaten = 0;
  for (let i = fishes.length - 1; i >= 0; i--) {
    const fry = fishes[i];
    if (fry.growth === undefined || fry.growth < FRY_SAFE_AGE || isHidden(plants, fry.x, fry.z)) {
      continue;
    }
    if (isCaught(fishes, fry, r2)) {
      fishes.splice(i, 1);
      eaten += 1;
    }
  }
  return eaten;
}
