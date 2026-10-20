import type { Vec3 } from './flocking';
import type { FoodPellet } from './food';
import { obstacleBound, obstacleDistance, type Obstacle } from './obstacles';
import type { FeedingParams, SpeciesDefinition } from './species';
import type { Box3 } from './tank';

/**
 * Faim des poissons et attraction vers la nourriture (issue #68, ADR 0023).
 *
 * Chaque poisson porte une faim `hunger` ∈ [0, 1], qui monte à la vitesse de son espèce
 * (`FeedingParams.hungerRate`). Affamé (`hunger ≥ HUNGRY_THRESHOLD`), il remarque le granulé
 * le plus proche dans sa tranche d'eau, à portée de perception et en vue (aucun obstacle sur
 * le segment qui l'en sépare, `hasLineOfSight`), et nage vers lui : c'est un
 * terme du pilotage de `stepFish`, qui garde la priorité à l'évitement. Un granulé touché
 * (`EAT_DISTANCE`) disparaît et rassasie le poisson de `PELLET_SATIATION`.
 *
 * Aucun tirage aléatoire : la faim et les repas ne consomment aucun générateur. Sans
 * nourriture, les trajectoires sont exactement celles d'avant l'issue #68.
 *
 * Valeurs de jeu (approximations, pas des mesures).
 */

/** Faim à la naissance : assez pour qu'un premier nourrissage attire tout le bac. */
export const HUNGER_START = 0.5;
/** Seuil au-delà duquel un poisson s'intéresse à la nourriture (et la mange). */
export const HUNGRY_THRESHOLD = 0.3;
/** Faim retirée par granulé mangé (remise à zéro partielle). */
export const PELLET_SATIATION = 0.25;
/**
 * Distance de prise, en mètres : un granulé est mangé quand le centre du poisson est à moins
 * de cette distance du point visé (le granulé ramené dans les bornes de nage).
 */
export const EAT_DISTANCE = 0.02;
/**
 * Visibilité : un granulé est caché si le segment poisson → point visé passe à moins de
 * `SIGHT_CLEARANCE_RATIO × wallMargin` d'un obstacle (le poisson n'y arriverait pas en ligne
 * droite ; il le verra en contournant l'obstacle au gré de sa nage).
 */
export const SIGHT_CLEARANCE_RATIO = 0.5;
/** Pas d'échantillonnage du segment de visibilité, en mètres. */
export const SIGHT_STEP = 0.01;

/** Tranche d'eau où une espèce remarque et mange la nourriture (altitudes en mètres). */
export interface FeedingBand {
  readonly minY: number;
  readonly maxY: number;
}

/** Tranche d'eau de `feeding` dans le volume d'eau `water`. */
export function feedingBand(feeding: FeedingParams, water: Box3): FeedingBand {
  const height = water.maxY - water.minY;
  return {
    minY: water.minY + feeding.minHeightRatio * height,
    maxY: water.minY + feeding.maxHeightRatio * height,
  };
}

/**
 * Faim après `dt` secondes : `hunger + hungerRate · dt`, bornée à [0, 1]. Une valeur non
 * finie (état corrompu) repart de 0.
 */
export function growHunger(hunger: number, def: SpeciesDefinition, dt: number): number {
  const base = Number.isFinite(hunger) ? hunger : 0;
  return clamp(base + def.feeding.hungerRate * dt, 0, 1);
}

/** Faim après un granulé mangé : `hunger − PELLET_SATIATION`, jamais négative. */
export function satiate(hunger: number): number {
  return Math.max(0, hunger - PELLET_SATIATION);
}

/** Vrai si le poisson s'intéresse à la nourriture. */
export function isHungry(hunger: number): boolean {
  return hunger >= HUNGRY_THRESHOLD;
}

/** Poisson vu par l'alimentation : position et faim. */
export interface Feeder {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly hunger: number;
}

/**
 * Vrai si le segment `a → b` reste à au moins `clearance` mètres de chaque obstacle
 * (échantillonné tous les `SIGHT_STEP` mètres au plus, extrémités comprises). Les obstacles
 * dont la sphère englobante est hors de portée du segment sont écartés sans échantillonnage.
 */
export function hasLineOfSight(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  obstacles: readonly Obstacle[],
  clearance: number,
): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const lengthSq = dx * dx + dy * dy + dz * dz;
  const samples = Math.max(1, Math.ceil(Math.sqrt(lengthSq) / SIGHT_STEP));
  for (const o of obstacles) {
    const b = obstacleBound(o);
    // Point du segment le plus proche du centre de la sphère englobante.
    const t =
      lengthSq > 0
        ? clamp(((b.x - ax) * dx + (b.y - ay) * dy + (b.z - az) * dz) / lengthSq, 0, 1)
        : 0;
    const cx = ax + dx * t - b.x;
    const cy = ay + dy * t - b.y;
    const cz = az + dz * t - b.z;
    const reach = b.radius + clearance;
    if (cx * cx + cy * cy + cz * cz >= reach * reach) {
      continue;
    }
    for (let i = 0; i <= samples; i++) {
      const u = i / samples;
      if (obstacleDistance(o, ax + dx * u, ay + dy * u, az + dz * u, SCRATCH) < clearance) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Indice du granulé le plus proche de `fish` dans la tranche `band`, à moins de `radius`
 * mètres du point visé (granulé ramené dans `hard`), en ignorant les indices marqués dans
 * `taken` et, si `obstacles` est donné, les granulés cachés (`hasLineOfSight` à
 * `clearance`) ; -1 si aucun. Égalité : le premier dans l'ordre de `food` (déterministe).
 *
 * Coût (issue #85) : les candidats sont examinés par ordre croissant de (distance, indice),
 * un passage linéaire par candidat, sans tri ni allocation ; la visibilité n'est testée que
 * pour le candidat courant et la recherche s'arrête au premier visible. Le nombre de tests de
 * visibilité vaut donc 1 + le nombre de granulés cachés plus proches que le granulé retenu.
 */
export function nearestPellet(
  fish: Feeder,
  food: readonly FoodPellet[],
  band: FeedingBand,
  hard: Box3,
  radius: number,
  taken: Uint8Array | null = null,
  obstacles: readonly Obstacle[] = NO_OBSTACLES,
  clearance = 0,
): number {
  const radiusSq = radius * radius;
  // Dernier candidat écarté (caché) : les suivants sont strictement après lui dans l'ordre
  // (distance, indice), ce qui exclut tous les candidats déjà examinés.
  let afterSq = -1;
  let afterIndex = -1;
  for (;;) {
    let best = -1;
    let bestSq = radiusSq;
    for (let i = 0; i < food.length; i++) {
      const p = food[i];
      if (p.y < band.minY || p.y > band.maxY || (taken !== null && taken[i] === 1)) {
        continue;
      }
      const sq = pelletDistanceSq(fish, p, hard);
      // Plus proche que le meilleur courant (égalité : le premier dans l'ordre l'emporte),
      // et pas encore examiné.
      if (sq < bestSq && (sq > afterSq || (sq === afterSq && i > afterIndex))) {
        bestSq = sq;
        best = i;
      }
    }
    if (best < 0 || obstacles.length === 0) {
      return best;
    }
    const p = food[best];
    if (
      hasLineOfSight(
        fish.x,
        fish.y,
        fish.z,
        clamp(p.x, hard.minX, hard.maxX),
        clamp(p.y, hard.minY, hard.maxY),
        clamp(p.z, hard.minZ, hard.maxZ),
        obstacles,
        clearance,
      )
    ) {
      return best;
    }
    afterSq = bestSq;
    afterIndex = best;
  }
}

/** Carré de la distance de `fish` au granulé `p` ramené dans les bornes de nage `hard`. */
function pelletDistanceSq(fish: Feeder, p: FoodPellet, hard: Box3): number {
  const dx = clamp(p.x, hard.minX, hard.maxX) - fish.x;
  const dy = clamp(p.y, hard.minY, hard.maxY) - fish.y;
  const dz = clamp(p.z, hard.minZ, hard.maxZ) - fish.z;
  return dx * dx + dy * dy + dz * dz;
}

/**
 * Point visé par un poisson affamé : le granulé le plus proche à portée de perception, dans
 * sa tranche d'eau et en vue (aucun des `obstacles` sur le chemin, `SIGHT_CLEARANCE_RATIO`),
 * ramené dans les bornes de nage `hard` (un granulé flottant ou posé est hors d'atteinte du
 * centre). Écrit dans `out` et le renvoie ; `null` si le poisson n'a pas faim ou ne voit
 * aucun granulé.
 */
export function foodTarget(
  fish: Feeder,
  def: SpeciesDefinition,
  food: readonly FoodPellet[],
  band: FeedingBand,
  hard: Box3,
  out: Vec3,
  obstacles: readonly Obstacle[] = NO_OBSTACLES,
): Vec3 | null {
  if (food.length === 0 || !isHungry(fish.hunger)) {
    return null;
  }
  const index = nearestPellet(
    fish,
    food,
    band,
    hard,
    def.feeding.perceptionRadius,
    null,
    obstacles,
    SIGHT_CLEARANCE_RATIO * def.wallMargin,
  );
  if (index < 0) {
    return null;
  }
  const p = food[index];
  out.x = clamp(p.x, hard.minX, hard.maxX);
  out.y = clamp(p.y, hard.minY, hard.maxY);
  out.z = clamp(p.z, hard.minZ, hard.maxZ);
  return out;
}

/** Poisson modifiable par les repas. */
export interface MutableFeeder extends Feeder {
  hunger: number;
}

/**
 * Repas d'un pas, **en place** : dans l'ordre de `fishes` (identifiants), chaque poisson
 * affamé mange le granulé le plus proche à moins de `EAT_DISTANCE` (dans sa tranche d'eau),
 * qui disparaît : deux poissons ne mangent jamais le même granulé. Renvoie le nombre de
 * granulés mangés ; l'ordre des granulés restants est conservé.
 */
export function eatInPlace<F extends MutableFeeder>(
  fishes: readonly F[],
  food: FoodPellet[],
  bandOf: (fish: F) => FeedingBand,
  hardOf: (fish: F) => Box3,
): number {
  if (food.length === 0) {
    return 0;
  }
  const taken = takenBuffer(food.length);
  let eaten = 0;
  for (const fish of fishes) {
    if (!isHungry(fish.hunger)) {
      continue;
    }
    const index = nearestPellet(fish, food, bandOf(fish), hardOf(fish), EAT_DISTANCE, taken);
    if (index >= 0) {
      taken[index] = 1;
      fish.hunger = satiate(fish.hunger);
      eaten++;
    }
  }
  if (eaten > 0) {
    let kept = 0;
    for (let i = 0; i < food.length; i++) {
      if (taken[i] === 0) {
        food[kept++] = food[i];
      }
    }
    food.length = kept;
  }
  return eaten;
}

const NO_OBSTACLES: readonly Obstacle[] = Object.freeze([]);
const SCRATCH: Vec3 = { x: 0, y: 0, z: 0 };

/** Marques des granulés mangés, réutilisées d'un pas à l'autre (remises à zéro). */
let takenScratch = new Uint8Array(0);

function takenBuffer(count: number): Uint8Array {
  if (takenScratch.length < count) {
    takenScratch = new Uint8Array(count);
  }
  takenScratch.fill(0, 0, count);
  return takenScratch;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
