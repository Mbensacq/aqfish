import { deriveSeed, prngOutput } from '../core/random/prng';
import { MAX_TOTAL_FISH, SIM_DT } from './constants';
import type { DecorItem } from './decor';
import { FED_HUNGER, isFry, isPredator } from './fry';
import { SPECIES, type SpeciesId } from './species';
import type { Fish } from './swimmer';
import type { Box3 } from './tank';

/**
 * Ponte et œufs des corydoras (issue #478, ADR 0111).
 *
 * - **Ponte** : calendrier sans état, comme la mise bas des guppys (`sim/fry.ts`). Le temps
 *   simulé est découpé en périodes de `SPAWN_PERIOD` secondes ; au dernier pas de chaque
 *   période, une espèce ovipare (`EGG_SPECIES`) qui compte au moins `SPAWN_MIN_ADULTS` adultes
 *   en bonne santé et nourris, dans une eau bonne au pH toléré et à une température dans
 *   `SPAWN_TEMPERATURE`, pond une ponte de `MIN_CLUTCH` à `MAX_CLUTCH` œufs. Nombre, surfaces
 *   et positions sont tirés du hachage (graine du monde, espèce, rang de la période) : aucun
 *   tirage pris aux générateurs des poissons.
 * - **Surfaces** : la vitre de devant ou de derrière (œuf exposé) et, s'il y en a, les plantes
 *   du décor (œuf caché dans le feuillage), bas dans l'eau.
 * - **Prédation** : un adulte nageur (`isPredator`) à portée d'un œuf de la vitre
 *   (`EGG_EAT_RADIUS`, plus `EGG_GLASS_REACH` vers la vitre) le mange ; les œufs des plantes sont à l'abri. Aucun adulte n'en meurt.
 * - **Éclosion** : à `EGG_HATCH_TIME` secondes, l'œuf devient un alevin (`Fish.growth`, même
 *   croissance et mêmes cachettes que les alevins de guppy), dans la limite des plafonds.
 * - **Plafonds** : œufs et animaux de l'espèce ne dépassent pas `maxPopulation`, œufs et
 *   animaux du bac `MAX_TOTAL_FISH`, et le bac garde au plus `MAX_EGGS` œufs.
 *
 * Toutes les valeurs sont des **approximations de jeu** : dans la nature, l'éclosion prend
 * plusieurs jours et une ponte compte souvent plusieurs dizaines d'œufs.
 */

/** Espèces ovipares qui pondent des œufs dans la simulation. */
export const EGG_SPECIES: readonly SpeciesId[] = Object.freeze(['corydora']);

/** Période de ponte, en secondes simulées. */
export const SPAWN_PERIOD = 600;
/** Période de ponte en pas de `SIM_DT`. */
export const SPAWN_TICKS = Math.round(SPAWN_PERIOD / SIM_DT);
/** Nombre minimal d'adultes en forme de l'espèce pour une ponte (un couple). */
export const SPAWN_MIN_ADULTS = 2;
/** Température de l'eau permettant la ponte, en °C, bornes comprises. */
export const SPAWN_TEMPERATURE: readonly [number, number] = Object.freeze([22, 26]) as readonly [
  number,
  number,
];
/** Nombre d'œufs d'une ponte, bornes comprises (avant plafonds). */
export const MIN_CLUTCH = 4;
export const MAX_CLUTCH = 10;
/** Nombre maximal d'œufs dans un bac. */
export const MAX_EGGS = 30;
/** Durée d'incubation, en secondes simulées. */
export const EGG_HATCH_TIME = 180;
/** Distance sous laquelle un adulte mange un œuf exposé, en mètres (`eggReachDistance2`). */
export const EGG_EAT_RADIUS = 0.04;
/**
 * Portée vers la vitre, en mètres : les nageurs restent à quelques centimètres des vitres
 * (bornes de nage et marge aux parois), un œuf de la vitre est atteint par un adulte qui passe
 * devant lui à moins de cette distance de plus (approximation de jeu).
 */
export const EGG_GLASS_REACH = 0.04;
/** Retrait d'un œuf de la vitre vers l'intérieur de l'eau, en mètres. */
export const EGG_GLASS_INSET = 0.004;
/** Hauteur de ponte au-dessus du fond, en mètres : de `EGG_MIN_HEIGHT` à `EGG_MAX_HEIGHT`. */
export const EGG_MIN_HEIGHT = 0.02;
export const EGG_MAX_HEIGHT = 0.1;
/** Écart horizontal d'un œuf au pied de sa plante, en mètres (au plus). */
export const EGG_PLANT_SPREAD = 0.025;
/** Écart horizontal entre deux œufs d'une même grappe sur la vitre, en mètres (au plus). */
export const EGG_CLUSTER_SPREAD = 0.03;

/** Surface où un œuf est collé. */
export type EggSurface = 'vitre' | 'plante';
export const EGG_SURFACES: readonly EggSurface[] = Object.freeze(['vitre', 'plante']);

/** Œuf collé : objet de données pur, sérialisable en JSON. */
export interface Egg {
  readonly species: SpeciesId;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Âge, en secondes simulées, dans [0, `EGG_HATCH_TIME`). */
  readonly age: number;
  readonly surface: EggSurface;
}

export type MutableEgg = { -readonly [K in keyof Egg]: Egg[K] };

const UINT32_RANGE = 4294967296;
const SPAWN_SALT = 0x0e66;

/** Vrai si l'espèce pond des œufs. */
export function laysEggs(species: SpeciesId): boolean {
  return EGG_SPECIES.includes(species);
}

/** Vrai si `age` est un âge d'œuf valide : réel dans [0, `EGG_HATCH_TIME`). */
export function isEggAge(age: unknown): age is number {
  return typeof age === 'number' && Number.isFinite(age) && age >= 0 && age < EGG_HATCH_TIME;
}

/** Rang de la période qui s'achève au pas `tick`, ou -1 si `tick` n'achève aucune période. */
export function spawnIndexAt(tick: number): number {
  if (!Number.isInteger(tick) || tick <= 0 || tick % SPAWN_TICKS !== 0) {
    return -1;
  }
  return tick / SPAWN_TICKS - 1;
}

/** Tirage uniforme dans [0, 1) du hachage (graine, espèce, période, rang), sans générateur. */
export function spawnDraw(seed: number, species: SpeciesId, spawn: number, k: number): number {
  const salt = EGG_SPECIES.indexOf(species) + 1;
  const state = deriveSeed(deriveSeed(deriveSeed(seed, salt), (spawn ^ SPAWN_SALT) >>> 0), k >>> 0);
  return prngOutput(state) / UINT32_RANGE;
}

/** Nombre d'œufs d'une ponte, dans [`MIN_CLUTCH`, `MAX_CLUTCH`]. */
export function clutchSize(seed: number, species: SpeciesId, spawn: number): number {
  const u = spawnDraw(seed, species, spawn, 0);
  return MIN_CLUTCH + Math.floor(u * (MAX_CLUTCH - MIN_CLUTCH + 1));
}

/** État du bac lu par la ponte. */
export interface SpawnConditions {
  /** Eau « bonne » (`waterQuality`). */
  readonly goodWater: boolean;
  /** Température de l'eau, en °C. */
  readonly temperature: number;
  /** Vrai si le pH de l'eau sort de la plage tolérée de l'espèce. */
  readonly phOut: (species: SpeciesId) => boolean;
}

/** Vrai si `fish` est un adulte en forme : ni alevin, santé pleine, sans points blancs, nourri. */
export function isFitSpawner(fish: Fish): boolean {
  return !isFry(fish) && fish.health >= 1 && fish.ich === undefined && fish.hunger < FED_HUNGER;
}

/** Vrai si l'eau permet à `species` de pondre (qualité, pH, température). */
export function waterAllowsSpawn(species: SpeciesId, conditions: SpawnConditions): boolean {
  const t = conditions.temperature;
  return (
    conditions.goodWater &&
    !conditions.phOut(species) &&
    t >= SPAWN_TEMPERATURE[0] &&
    t <= SPAWN_TEMPERATURE[1]
  );
}

/** Nombre d'adultes en forme de `species` dans `fishes`. */
export function fitSpawners(fishes: readonly Fish[], species: SpeciesId): number {
  let count = 0;
  for (const fish of fishes) {
    if (fish.species === species && isFitSpawner(fish)) {
      count += 1;
    }
  }
  return count;
}

/**
 * Place restante pour des œufs de `species` : le plus petit des écarts aux plafonds
 * (`maxPopulation` de l'espèce, œufs compris ; `MAX_TOTAL_FISH`, œufs compris ; `MAX_EGGS`),
 * jamais négatif.
 */
export function eggRoom(fishes: readonly Fish[], eggs: readonly Egg[], species: SpeciesId): number {
  let same = 0;
  for (const fish of fishes) {
    if (fish.species === species) {
      same += 1;
    }
  }
  for (const egg of eggs) {
    if (egg.species === species) {
      same += 1;
    }
  }
  return Math.max(
    0,
    Math.min(
      SPECIES[species].maxPopulation - same,
      MAX_TOTAL_FISH - fishes.length - eggs.length,
      MAX_EGGS - eggs.length,
    ),
  );
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * Œufs de la ponte `spawn` de `species` (au plus `count`), collés sur les surfaces du bac :
 * une grappe sur la vitre (devant ou derrière, tirée de la ponte) et, s'il y a des plantes,
 * environ un œuf sur deux au pied d'une plante tirée. Tous dans `water`, entre
 * `EGG_MIN_HEIGHT` et `EGG_MAX_HEIGHT` au-dessus du fond. Âge 0.
 */
export function layClutch(
  seed: number,
  species: SpeciesId,
  spawn: number,
  count: number,
  water: Box3,
  plants: readonly DecorItem[],
): MutableEgg[] {
  const eggs: MutableEgg[] = [];
  if (count <= 0) {
    return eggs;
  }
  const draw = (k: number): number => spawnDraw(seed, species, spawn, k);
  const top = Math.min(water.maxY, water.minY + EGG_MAX_HEIGHT);
  const bottom = Math.min(top, water.minY + EGG_MIN_HEIGHT);
  const height = (u: number): number => bottom + u * (top - bottom);
  const margin = EGG_CLUSTER_SPREAD + EGG_GLASS_INSET;
  const front = draw(1) < 0.5;
  const glassZ = front ? water.maxZ - EGG_GLASS_INSET : water.minZ + EGG_GLASS_INSET;
  const centerX = clamp(
    water.minX + margin + draw(2) * (water.maxX - water.minX - 2 * margin),
    water.minX + EGG_GLASS_INSET,
    water.maxX - EGG_GLASS_INSET,
  );
  for (let k = 0; k < count; k++) {
    const base = 8 + 5 * k;
    const onPlant = plants.length > 0 && draw(base) < 0.5;
    const y = height(draw(base + 1));
    if (onPlant) {
      const plant = plants[Math.min(plants.length - 1, Math.floor(draw(base + 2) * plants.length))];
      const angle = draw(base + 3) * 2 * Math.PI;
      const r = EGG_PLANT_SPREAD * Math.sqrt(draw(base + 4));
      eggs.push({
        species,
        x: clamp(
          plant.x + r * Math.cos(angle),
          water.minX + EGG_GLASS_INSET,
          water.maxX - EGG_GLASS_INSET,
        ),
        y,
        z: clamp(
          plant.z + r * Math.sin(angle),
          water.minZ + EGG_GLASS_INSET,
          water.maxZ - EGG_GLASS_INSET,
        ),
        age: 0,
        surface: 'plante',
      });
    } else {
      const dx = (draw(base + 2) * 2 - 1) * EGG_CLUSTER_SPREAD;
      eggs.push({
        species,
        x: clamp(centerX + dx, water.minX + EGG_GLASS_INSET, water.maxX - EGG_GLASS_INSET),
        y,
        z: glassZ,
        age: 0,
        surface: 'vitre',
      });
    }
  }
  return eggs;
}

/**
 * Carré de la distance de `fish` à l'œuf de la vitre `egg`, l'écart en profondeur (axe des
 * vitres) diminué de `EGG_GLASS_REACH`.
 */
export function eggReachDistance2(fish: Pick<Fish, 'x' | 'y' | 'z'>, egg: Egg): number {
  const dz = Math.max(0, Math.abs(fish.z - egg.z) - EGG_GLASS_REACH);
  return (fish.x - egg.x) ** 2 + (fish.y - egg.y) ** 2 + dz * dz;
}

/** Vrai si un adulte nageur de `fishes` est à portée (`EGG_EAT_RADIUS`) de `egg`. */
function isEggCaught(fishes: readonly Fish[], egg: Egg): boolean {
  const r2 = EGG_EAT_RADIUS * EGG_EAT_RADIUS;
  for (const fish of fishes) {
    if (isPredator(fish) && eggReachDistance2(fish, egg) < r2) {
      return true;
    }
  }
  return false;
}

/**
 * Prédation des œufs, **en place** : retire de `eggs` chaque œuf de la vitre à moins de
 * `EGG_EAT_RADIUS` d'un adulte nageur ; les œufs des plantes sont à l'abri. Renvoie le nombre
 * d'œufs mangés. Coût en O(œufs × animaux), borné par `MAX_EGGS` et `MAX_TOTAL_FISH`.
 */
export function eatEggsInPlace(eggs: Egg[], fishes: readonly Fish[]): number {
  let eaten = 0;
  for (let i = eggs.length - 1; i >= 0; i--) {
    const egg = eggs[i];
    if (egg.surface === 'vitre' && isEggCaught(fishes, egg)) {
      eggs.splice(i, 1);
      eaten += 1;
    }
  }
  return eaten;
}

/**
 * Fait vieillir les œufs de `dt` secondes, **en place**, et retire ceux qui éclosent ; chaque
 * œuf éclos est passé à `hatch`, dans l'ordre du tableau. Renvoie le nombre d'éclosions.
 */
export function ageEggsInPlace(eggs: MutableEgg[], dt: number, hatch: (egg: Egg) => void): number {
  let hatched = 0;
  let write = 0;
  // Réécriture en place derrière la lecture (`write` ≤ rang lu) : sans effet sur le parcours.
  for (const egg of eggs) {
    egg.age += dt;
    if (egg.age >= EGG_HATCH_TIME) {
      hatch(egg);
      hatched += 1;
    } else {
      eggs[write++] = egg;
    }
  }
  eggs.length = write;
  return hatched;
}
