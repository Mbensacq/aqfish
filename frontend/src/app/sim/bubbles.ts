import { assertSeed, deriveSeed, MAX_SEED, prngNextState, prngOutput } from '../core/random/prng';
import { SAND_THICKNESS, waterVolume, type Box3 } from './tank';

/**
 * Bulles d'un diffuseur posé sur le sable (issue #50, ADR 0017).
 *
 * Système **sans état** : la bulle n° k naît au temps `k · BUBBLE_EMIT_PERIOD` (cadence
 * fixe) et sa position à un instant donné est une fonction fermée de la graine du monde,
 * de k et du temps **simulé**. Il n'y a donc rien à faire avancer pas à pas ni à
 * sérialiser : même graine et même temps donnent les mêmes bulles, quel que soit le
 * chemin suivi pour arriver à ce temps (contrat de capture), et aucune bulle ne consomme
 * le générateur d'un poisson (flux de hasard séparé, `BUBBLE_STREAM`).
 *
 * Chaque bulle monte à vitesse constante, en léger zigzag (sinusoïde latérale) et avec une
 * petite dérive, puis disparaît (éclate) en atteignant la surface. Le nombre de bulles
 * vivantes est borné par `MAX_BUBBLES`, constante calculée sur la bulle la plus lente.
 */

/** Intervalle entre deux émissions, en secondes (4 bulles par seconde). */
export const BUBBLE_EMIT_PERIOD = 0.25;
/** Vitesse de montée, en m/s : tirée uniformément dans [min, max) pour chaque bulle. */
export const BUBBLE_MIN_SPEED = 0.1;
export const BUBBLE_MAX_SPEED = 0.16;
/** Amplitude du zigzag latéral, en mètres, dans [min, max). */
export const BUBBLE_MIN_WOBBLE = 0.003;
export const BUBBLE_MAX_WOBBLE = 0.008;
/** Fréquence angulaire du zigzag, en rad/s, dans [min, max). */
export const BUBBLE_MIN_WOBBLE_RATE = 5;
export const BUBBLE_MAX_WOBBLE_RATE = 9;
/** Dérive latérale maximale (selon X et Z), en m/s. */
export const BUBBLE_MAX_DRIFT = 0.006;
/** Écart maximal du point d'émission au centre du diffuseur (selon X et Z), en mètres. */
export const BUBBLE_MAX_JITTER = 0.004;
/** Part des bulles de 2 pixels de scène (les autres font 1 pixel). */
export const BUBBLE_LARGE_RATIO = 0.3;
/** Hauteur du diffuseur au-dessus du sable : les bulles naissent sur son dessus. */
export const DIFFUSER_HEIGHT = 0.012;
/** Identifiant du flux de hasard des bulles, dérivé de la graine du monde (`deriveSeed`). */
export const BUBBLE_STREAM = 0xb0bb1e5;

/** Position du diffuseur sur le sable, dans le repère du bac (mètres). */
export interface BubbleSource {
  readonly x: number;
  readonly z: number;
}

/** Diffuseur par défaut : au fond à gauche, entre deux rochers du décor par défaut. */
export const DEFAULT_BUBBLE_SOURCE: BubbleSource = { x: -0.24, z: -0.2 };

/** Hauteur de naissance des bulles : dessus du diffuseur. */
export const BUBBLE_START_Y = SAND_THICKNESS + DIFFUSER_HEIGHT;

/** Durée de vie la plus longue dans le bac par défaut (bulle la plus lente), en secondes. */
export const BUBBLE_MAX_LIFETIME = (waterVolume().maxY - BUBBLE_START_Y) / BUBBLE_MIN_SPEED;

/**
 * Plafond du nombre de bulles vivantes à un instant : bulles nées dans la dernière durée
 * de vie maximale, bornes comprises.
 */
export const MAX_BUBBLES = Math.floor(BUBBLE_MAX_LIFETIME / BUBBLE_EMIT_PERIOD) + 1;

/** Paramètres tirés d'une bulle (fonction pure de la graine et de son numéro). */
export interface BubbleTraits {
  /** Vitesse de montée, m/s. */
  speed: number;
  /** Amplitude du zigzag selon X, en mètres (signée : sens du premier écart). */
  wobble: number;
  /** Fréquence angulaire du zigzag, rad/s. */
  wobbleRate: number;
  /** Dérive selon X et Z, m/s. */
  driftX: number;
  driftZ: number;
  /** Décalage du point d'émission selon X et Z, en mètres. */
  jitterX: number;
  jitterZ: number;
  /** Taille en pixels de scène : 1 ou 2. */
  size: 1 | 2;
}

/** Bulles vivantes, écrites en place (aucune allocation par image). */
export interface BubbleBuffer {
  /** x, y, z de chaque bulle, de la plus ancienne à la plus récente. */
  readonly positions: Float64Array;
  /** Taille (1 ou 2) de chaque bulle. */
  readonly sizes: Uint8Array;
  /** Nombre de bulles valides dans les tableaux. */
  count: number;
}

/** Tampon de `MAX_BUBBLES` bulles, à allouer une fois par propriétaire. */
export function createBubbleBuffer(capacity: number = MAX_BUBBLES): BubbleBuffer {
  if (!Number.isInteger(capacity) || capacity < 0) {
    throw new RangeError(`capacity doit être un entier positif ou nul (reçu : ${capacity})`);
  }
  return { positions: new Float64Array(capacity * 3), sizes: new Uint8Array(capacity), count: 0 };
}

/**
 * Écrit dans `out` les paramètres de la bulle n° `index` du monde de graine `seed`.
 * @throws RangeError si la graine ou le numéro n'est pas un entier 32 bits non signé.
 */
export function bubbleTraits(seed: number, index: number, out: BubbleTraits): BubbleTraits {
  rngState = deriveSeed(deriveSeed(seed, BUBBLE_STREAM), index);
  out.speed = lerp(BUBBLE_MIN_SPEED, BUBBLE_MAX_SPEED, nextRandom());
  const wobble = lerp(BUBBLE_MIN_WOBBLE, BUBBLE_MAX_WOBBLE, nextRandom());
  out.wobble = nextRandom() < 0.5 ? -wobble : wobble;
  out.wobbleRate = lerp(BUBBLE_MIN_WOBBLE_RATE, BUBBLE_MAX_WOBBLE_RATE, nextRandom());
  out.driftX = lerp(-BUBBLE_MAX_DRIFT, BUBBLE_MAX_DRIFT, nextRandom());
  out.driftZ = lerp(-BUBBLE_MAX_DRIFT, BUBBLE_MAX_DRIFT, nextRandom());
  out.jitterX = lerp(-BUBBLE_MAX_JITTER, BUBBLE_MAX_JITTER, nextRandom());
  out.jitterZ = lerp(-BUBBLE_MAX_JITTER, BUBBLE_MAX_JITTER, nextRandom());
  out.size = nextRandom() < BUBBLE_LARGE_RATIO ? 2 : 1;
  return out;
}

/** Position d'une bulle. */
export interface BubblePoint {
  x: number;
  y: number;
  z: number;
}

/**
 * Position de la bulle de paramètres `traits` à l'âge `age` (secondes depuis sa naissance),
 * émise depuis `source`. Le zigzag part de zéro : à la naissance, la bulle est sur le point
 * d'émission. Selon Z, l'écart suit la même onde, deux fois moins ample et en quadrature.
 */
export function bubblePosition(
  traits: BubbleTraits,
  age: number,
  source: BubbleSource,
  out: BubblePoint,
): BubblePoint {
  const phase = traits.wobbleRate * age;
  out.x = source.x + traits.jitterX + traits.driftX * age + traits.wobble * Math.sin(phase);
  out.y = BUBBLE_START_Y + traits.speed * age;
  out.z =
    source.z + traits.jitterZ + traits.driftZ * age + 0.5 * traits.wobble * (1 - Math.cos(phase));
  return out;
}

const scratchTraits: BubbleTraits = {
  speed: 0,
  wobble: 0,
  wobbleRate: 0,
  driftX: 0,
  driftZ: 0,
  jitterX: 0,
  jitterZ: 0,
  size: 1,
};
const scratchPoint: BubblePoint = { x: 0, y: 0, z: 0 };

/**
 * Écrit dans `out` les bulles vivantes au temps simulé `time` (secondes), de la plus
 * ancienne à la plus récente, et renvoie leur nombre. Une bulle est vivante de sa naissance
 * (comprise) jusqu'à ce qu'elle atteigne la surface `water.maxY` (exclue). Au-delà de la
 * capacité de `out`, les bulles les plus récentes sont ignorées (jamais le cas avec
 * `MAX_BUBBLES` dans le bac par défaut).
 * @throws RangeError si la graine est invalide, si `time` n'est pas un réel positif ou nul,
 * ou si `time` dépasse le dernier numéro de bulle représentable.
 */
export function fillBubbles(
  seed: number,
  time: number,
  out: BubbleBuffer,
  source: BubbleSource = DEFAULT_BUBBLE_SOURCE,
  water: Box3 = DEFAULT_WATER,
): number {
  assertSeed(seed);
  if (!Number.isFinite(time) || time < 0) {
    throw new RangeError(`time doit être un réel positif ou nul (reçu : ${time})`);
  }
  const last = Math.floor(time / BUBBLE_EMIT_PERIOD + 1e-9);
  if (last > MAX_SEED) {
    throw new RangeError(`time trop grand pour numéroter les bulles (reçu : ${time})`);
  }
  const maxLifetime = Math.max(0, water.maxY - BUBBLE_START_Y) / BUBBLE_MIN_SPEED;
  const first = Math.max(0, Math.ceil((time - maxLifetime) / BUBBLE_EMIT_PERIOD - 1e-9));
  const capacity = out.sizes.length;
  let count = 0;
  for (let k = first; k <= last && count < capacity; k++) {
    const traits = bubbleTraits(seed, k, scratchTraits);
    const age = Math.max(0, time - k * BUBBLE_EMIT_PERIOD);
    const p = bubblePosition(traits, age, source, scratchPoint);
    if (p.y >= water.maxY) {
      continue;
    }
    out.positions[3 * count] = p.x;
    out.positions[3 * count + 1] = p.y;
    out.positions[3 * count + 2] = p.z;
    out.sizes[count] = traits.size;
    count++;
  }
  out.count = count;
  return count;
}

/**
 * Écart latéral maximal d'une bulle à la verticale du diffuseur, selon X ou Z, sur toute
 * sa vie dans le bac par défaut : émission + dérive + zigzag.
 */
export const BUBBLE_MAX_SPREAD =
  BUBBLE_MAX_JITTER + BUBBLE_MAX_DRIFT * BUBBLE_MAX_LIFETIME + BUBBLE_MAX_WOBBLE;

const DEFAULT_WATER = waterVolume();

/** État du tirage en cours (`bubbleTraits`) : module, pour ne créer aucune fermeture. */
let rngState = 0;

function nextRandom(): number {
  rngState = prngNextState(rngState);
  return prngOutput(rngState) / 4294967296;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
