import { deriveSeed, prngNextState, prngOutput } from '../core/random/prng';
import { rockBaseY, rockModel, type DecorItem, type RockModel } from './decor';
import { SAND_THICKNESS, waterVolume, type Box3 } from './tank';

/**
 * Nourriture déposée au clic (issue #67, ADR 0022) : des granulés qui flottent un instant à
 * la surface, coulent à vitesse lente et constante, se posent sur le sable ou sur le dessus
 * d'un rocher, puis disparaissent après un délai.
 *
 * Les granulés font partie de l'**état sérialisable** du monde (`World.food`) : contrairement
 * aux bulles, ils dépendent des actions de l'utilisateur et non du seul temps. Leur hasard
 * (dispersion autour du point visé, durée de flottaison) est tiré **une fois, au dépôt**, d'un
 * flux séparé dérivé de la graine du monde et de l'identifiant du granulé (`FOOD_STREAM`) :
 * le nourrissage ne consomme jamais le générateur d'un poisson, ni rien à chaque pas. Même
 * graine et mêmes dépôts au même temps simulé donnent donc le même état.
 *
 * Valeurs de jeu (approximations, pas des mesures) : les granulés réels coulent de quelques
 * centimètres par seconde selon leur taille et leur densité.
 */

/** Granulés déposés par un clic (ou une touche). */
export const FOOD_PER_DROP = 5;
/** Nombre maximal de granulés dans le bac ; au-delà, les nouveaux dépôts sont tronqués. */
export const MAX_FOOD = 60;
/** Rayon du disque de dispersion autour du point visé, en mètres. */
export const FOOD_DROP_RADIUS = 0.02;
/** Demi-taille d'un granulé, en mètres : il flotte et se pose à cette hauteur de son centre. */
export const FOOD_RADIUS = 0.002;
/** Durée de flottaison à la surface, tirée dans [min, max) pour chaque granulé, en secondes. */
export const FOOD_MIN_FLOAT_SECONDS = 1.5;
export const FOOD_MAX_FLOAT_SECONDS = 3;
/** Vitesse de chute, constante, en m/s (approximation de jeu). */
export const FOOD_SINK_SPEED = 0.025;
/** Délai avant disparition, une fois posé, en secondes. */
export const FOOD_GROUND_SECONDS = 30;
/** Identifiant du flux de hasard de la nourriture, dérivé de la graine du monde. */
export const FOOD_STREAM = 0xf00d;

/**
 * Granulé : données pures, sérialisables en JSON. Position du centre en mètres (repère du
 * bac), vitesse verticale en m/s (0 en flottaison et une fois posé), âge en secondes depuis
 * le dépôt.
 */
export interface FoodPellet {
  /** Identifiant unique dans le monde (ordre des dépôts). */
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Vitesse verticale : `-FOOD_SINK_SPEED` pendant la chute, 0 sinon. */
  readonly vy: number;
  readonly age: number;
  /** Altitude de flottaison (surface de l'eau moins `FOOD_RADIUS`). */
  readonly floatY: number;
  /** Durée de flottaison, en secondes. */
  readonly floatTime: number;
  /** Altitude où le granulé se pose : sable ou dessus d'un rocher, plus `FOOD_RADIUS`. */
  readonly restY: number;
}

type MutablePellet = { -readonly [K in keyof FoodPellet]: FoodPellet[K] };

/** Âge auquel le granulé se pose : flottaison puis chute de `floatY` à `restY`. */
export function landingAge(pellet: FoodPellet): number {
  return pellet.floatTime + Math.max(0, pellet.floatY - pellet.restY) / FOOD_SINK_SPEED;
}

/** Âge auquel le granulé disparaît. */
export function expiryAge(pellet: FoodPellet): number {
  return landingAge(pellet) + FOOD_GROUND_SECONDS;
}

/** Vrai si le granulé est posé (sable ou rocher). */
export function isLanded(pellet: FoodPellet): boolean {
  return pellet.age >= landingAge(pellet);
}

/**
 * Altitude du dessus d'un rocher à la verticale de (x, z), en mètres (repère du bac), ou
 * `null` si aucun voxel du rocher n'est sous ce point. Calculée sur les voxels affichés
 * (`rockModel`), pas sur la forme de collision, plus large.
 */
export function rockTopAt(
  item: DecorItem,
  x: number,
  z: number,
  model: RockModel = rockModel(item.seed, item.scale),
): number | null {
  const v = model.voxelSize;
  // Inverse de `decorToTank` : translation puis rotation de -rotation autour de Y.
  const c = Math.cos(item.rotation);
  const s = Math.sin(item.rotation);
  const dx = x - item.x;
  const dz = z - item.z;
  const i = Math.floor((c * dx - s * dz) / v);
  const k = Math.floor((s * dx + c * dz) / v);
  let top = -1;
  for (const cell of model.cells) {
    if (cell.i === i && cell.k === k && cell.j > top) {
      top = cell.j;
    }
  }
  return top < 0 ? null : rockBaseY(v) + (top + 1) * v;
}

/**
 * Altitude où se pose un granulé tombé à la verticale de (x, z) : le plus haut du sable et
 * des rochers du décor, plus `FOOD_RADIUS`. Les plantes sont traversées.
 */
export function restHeightAt(decor: readonly DecorItem[], x: number, z: number): number {
  let ground = SAND_THICKNESS;
  for (const item of decor) {
    if (item.kind !== 'rock') {
      continue;
    }
    const top = rockTopAt(item, x, z);
    if (top !== null && top > ground) {
      ground = top;
    }
  }
  return ground + FOOD_RADIUS;
}

/** Vrai si (x, z) est à l'intérieur du bac (vitres comprises), dans le volume d'eau `water`. */
export function isInsideTank(x: number, z: number, water: Box3 = DEFAULT_WATER): boolean {
  return x >= water.minX && x <= water.maxX && z >= water.minZ && z <= water.maxZ;
}

/** État du monde utile au dépôt : de quoi tirer le hasard, poser les granulés et les ranger. */
export interface FoodState {
  readonly seed: number;
  readonly decor: readonly DecorItem[];
  food: FoodPellet[];
  nextFoodId: number;
}

/**
 * Dépose jusqu'à `FOOD_PER_DROP` granulés autour de (x, z), à la surface, **en modifiant**
 * `state` (`food` et `nextFoodId`), et renvoie le nombre de granulés ajoutés. Un point hors
 * du bac est ignoré (0) ; bac plein : seuls les granulés qui tiennent sous `MAX_FOOD` sont
 * ajoutés. Les granulés restent dans l'eau (dispersion ramenée à l'intérieur des vitres).
 * @throws RangeError si `x` ou `z` n'est pas un réel fini.
 */
export function dropFoodInPlace(
  state: FoodState,
  x: number,
  z: number,
  water: Box3 = DEFAULT_WATER,
): number {
  if (!Number.isFinite(x) || !Number.isFinite(z)) {
    throw new RangeError(`point de dépôt invalide (reçu : ${x}, ${z})`);
  }
  if (!isInsideTank(x, z, water)) {
    return 0;
  }
  const count = Math.max(0, Math.min(FOOD_PER_DROP, MAX_FOOD - state.food.length));
  const floatY = water.maxY - FOOD_RADIUS;
  const stream = deriveSeed(state.seed, FOOD_STREAM);
  for (let n = 0; n < count; n++) {
    const id = state.nextFoodId;
    state.nextFoodId = id + 1;
    // Identifiant ramené sur 32 bits pour la dérivation (au-delà de 2³² dépôts, le hasard
    // reboucle sans conséquence).
    rngState = deriveSeed(stream, id >>> 0);
    const radius = FOOD_DROP_RADIUS * Math.sqrt(nextRandom());
    const angle = 2 * Math.PI * nextRandom();
    const px = clamp(
      x + radius * Math.cos(angle),
      water.minX + FOOD_RADIUS,
      water.maxX - FOOD_RADIUS,
    );
    const pz = clamp(
      z + radius * Math.sin(angle),
      water.minZ + FOOD_RADIUS,
      water.maxZ - FOOD_RADIUS,
    );
    const floatTime =
      FOOD_MIN_FLOAT_SECONDS + (FOOD_MAX_FLOAT_SECONDS - FOOD_MIN_FLOAT_SECONDS) * nextRandom();
    state.food.push({
      id,
      x: px,
      y: floatY,
      z: pz,
      vy: 0,
      age: 0,
      floatY,
      floatTime,
      restY: Math.min(floatY, restHeightAt(state.decor, px, pz)),
    });
  }
  return count;
}

/**
 * Fait vieillir les granulés de `dt` secondes, **en place** et sans allocation : flottaison,
 * chute à vitesse constante, arrêt à `restY`, puis retrait après `FOOD_GROUND_SECONDS`.
 * L'altitude est une fonction fermée de l'âge (aucun cumul d'erreur sur la position).
 * L'ordre des granulés restants est conservé.
 */
export function stepFoodInPlace(food: FoodPellet[], dt: number): void {
  let kept = 0;
  // Compactage en place : `kept` ne dépasse jamais l'indice lu.
  for (const item of food) {
    const pellet = item as MutablePellet;
    pellet.age += dt;
    if (pellet.age >= expiryAge(pellet)) {
      continue;
    }
    const fall = FOOD_SINK_SPEED * Math.max(0, pellet.age - pellet.floatTime);
    const sinking = pellet.age > pellet.floatTime && pellet.floatY - fall > pellet.restY;
    pellet.y = Math.max(pellet.restY, pellet.floatY - fall);
    pellet.vy = sinking ? -FOOD_SINK_SPEED : 0;
    food[kept++] = pellet;
  }
  food.length = kept;
}

const DEFAULT_WATER = waterVolume();

/** État du tirage en cours (`dropFoodInPlace`) : module, pour ne créer aucune fermeture. */
let rngState = 0;

function nextRandom(): number {
  rngState = prngNextState(rngState);
  return prngOutput(rngState) / 4294967296;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
