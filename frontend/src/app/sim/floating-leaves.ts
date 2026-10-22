import { assertSeed, deriveSeed, MAX_SEED, prngNextState, prngOutput } from '../core/random/prng';
import type { Box3 } from './tank';

/**
 * Feuilles mortes qui flottent sur le bassin (issue #107, ADR 0033) : quelques petites
 * feuilles, brunes ou ocre, se posent sur l'eau, dérivent lentement en tournant sur
 * elles-mêmes, puis coulent.
 *
 * Système **sans état**, comme la pluie (ADR 0032) : le temps est découpé en créneaux de
 * `LEAF_SLOT_PERIOD` ; le créneau n° k peut donner une feuille, née dans la première moitié
 * du créneau et vivant `LEAF_LIFETIME`. Les créneaux sont groupés en **vagues** de
 * `LEAF_WAVE_SLOTS` : chaque vague tire une intensité (souvent faible, parfois nulle) et une
 * direction de brise commune à ses feuilles. Tout se déduit de la graine du monde, de k et du
 * temps simulé, par deux flux de hasard propres (`FLOATING_LEAF_STREAM`,
 * `FLOATING_LEAF_WAVE_STREAM`) : aucun autre tirage n'est consommé, rien n'est sauvegardé.
 *
 * Bornes : au plus `MAX_FLOATING_LEAVES` feuilles à la fois (valeur déduite de la cadence).
 * Chaque feuille part d'un point de la surface rétrécie de `floatingLeafInset()` et avance en
 * ligne droite jusqu'à, au plus, le bord de cette surface, où elle s'arrête (feuilles qui
 * s'amassent contre la margelle) ; son balancement latéral et sa demi-longueur tiennent dans
 * la marge : une feuille ne passe jamais sur la bordure.
 */

/** Flux de hasard des feuilles (une graine par créneau), dérivé de la graine du monde. */
export const FLOATING_LEAF_STREAM = 0x1eaf;
/** Flux de hasard des vagues (une graine par vague), dérivé de la graine du monde. */
export const FLOATING_LEAF_WAVE_STREAM = 0x1eaf6c;

/** Durée d'un créneau, en secondes : au plus une feuille naît par créneau. */
export const LEAF_SLOT_PERIOD = 7;
/** Part du créneau où la feuille peut naître (de son début), dans [0, 1[. */
export const LEAF_BIRTH_JITTER = 0.5;
/** Créneaux par vague (une vague dure 42 s). */
export const LEAF_WAVE_SLOTS = 6;
/**
 * Probabilité qu'un créneau donne une feuille à intensité de vague maximale. L'intensité
 * d'une vague est le carré d'un tirage uniforme : vagues le plus souvent faibles.
 */
export const LEAF_SPAWN_CHANCE = 0.75;
/**
 * Durée de vie d'une feuille, de sa pose à sa disparition, en secondes (pas un multiple du
 * créneau : aucun cas limite d'arrondi aux bornes).
 */
export const LEAF_LIFETIME = 52;
/** Durée de la pose (taille de 0 à 1) puis de la descente sous l'eau (de 1 à 0), en secondes. */
export const LEAF_SETTLE_TIME = 1.5;
export const LEAF_SINK_TIME = 4;

/** Nombre maximal de feuilles à un instant (bornes comprises). */
export const MAX_FLOATING_LEAVES =
  Math.floor(LEAF_LIFETIME / LEAF_SLOT_PERIOD + LEAF_BIRTH_JITTER) + 1;

/** Longueur d'une feuille, en mètres, tirée par feuille. */
export const LEAF_LENGTH = { min: 0.09, max: 0.13 } as const;
/** Vitesse de dérive, en m/s (lente : quelques dizaines de centimètres sur une vie). */
export const LEAF_DRIFT_SPEED = { min: 0.004, max: 0.011 } as const;
/** Écart maximal du cap d'une feuille autour de la brise de sa vague, en radians. */
export const LEAF_HEADING_SPREAD = 0.7;
/** Balancement latéral (perpendiculaire à la dérive) : amplitude en mètres, période en s. */
export const LEAF_WOBBLE = 0.01;
export const LEAF_WOBBLE_PERIOD = 9;
/** Vitesse de rotation maximale sur elle-même, en radians par seconde (de part et d'autre). */
export const LEAF_SPIN = 0.12;
/** Jeu minimal entre une feuille et la bordure du bassin, en mètres. */
export const LEAF_EDGE_MARGIN = 0.03;
/** Nombre de formes de feuilles (`render/floating-leaf-model.ts`). */
export const LEAF_SHAPE_COUNT = 6;
/** Teintes : 0 brune, 1 ocre. */
export const LEAF_TINT_COUNT = 2;

/** Champs par feuille dans `FloatingLeafBuffer.leaves`. */
export const LEAF_STRIDE = 6;

/**
 * Feuilles vivantes, écrites en place (aucune allocation par image) : pour chacune, de la
 * plus ancienne à la plus récente, x, z (centre, mètres), rotation (radians, autour de Y),
 * longueur affichée (mètres : longueur de la feuille multipliée par l'enveloppe de pose et de
 * descente), forme (entier dans [0, `LEAF_SHAPE_COUNT`[) et teinte (0 brune, 1 ocre).
 */
export interface FloatingLeafBuffer {
  readonly leaves: Float64Array;
  count: number;
}

/** Tampon de feuilles, à allouer une fois par propriétaire. */
export function createFloatingLeafBuffer(
  capacity: number = MAX_FLOATING_LEAVES,
): FloatingLeafBuffer {
  if (!Number.isInteger(capacity) || capacity < 0) {
    throw new RangeError(`capacité invalide : ${capacity}`);
  }
  return { leaves: new Float64Array(capacity * LEAF_STRIDE), count: 0 };
}

/** Marge de la surface où se tiennent les centres des feuilles, en mètres. */
export function floatingLeafInset(): number {
  return LEAF_EDGE_MARGIN + LEAF_LENGTH.max / 2 + LEAF_WOBBLE;
}

/** État du générateur courant (sans fermeture : aucune allocation par image). */
let rngState = 0;

/** Tirage uniforme dans [0, 1[ du générateur courant. */
function next(): number {
  rngState = prngNextState(rngState);
  return prngOutput(rngState) / 4294967296;
}

/** Vague d'apparition : intensité dans [0, 1[ et cap de la brise (radians). */
export interface LeafWave {
  intensity: number;
  breeze: number;
}

/**
 * Écrit dans `out` la vague n° `wave` de la graine `seed` : intensité (carré d'un tirage
 * uniforme) et cap de la brise commune à ses feuilles.
 */
export function leafWave(
  seed: number,
  wave: number,
  out: LeafWave = { intensity: 0, breeze: 0 },
): LeafWave {
  rngState = deriveSeed(deriveSeed(seed, FLOATING_LEAF_WAVE_STREAM), wave);
  const u = next();
  out.intensity = u * u;
  out.breeze = next() * 2 * Math.PI;
  return out;
}

const scratchWave: LeafWave = { intensity: 0, breeze: 0 };

const scratch = new Float64Array(LEAF_STRIDE);

/**
 * Écrit dans `out` (`LEAF_STRIDE` valeurs) la feuille du créneau `slot` au temps `time`, et
 * renvoie vrai si elle existe et vit à cet instant (née, pas encore disparue).
 */
function leafAt(seed: number, slot: number, time: number, water: Box3, out: Float64Array): boolean {
  if (time < slot * LEAF_SLOT_PERIOD) {
    return false;
  }
  const wave = leafWave(seed, Math.floor(slot / LEAF_WAVE_SLOTS), scratchWave);
  rngState = deriveSeed(deriveSeed(seed, FLOATING_LEAF_STREAM), slot);
  if (next() >= LEAF_SPAWN_CHANCE * wave.intensity) {
    return false;
  }
  const age = time - (slot + LEAF_BIRTH_JITTER * next()) * LEAF_SLOT_PERIOD;
  if (age < 0 || age >= LEAF_LIFETIME) {
    return false;
  }
  const length = LEAF_LENGTH.min + (LEAF_LENGTH.max - LEAF_LENGTH.min) * next();
  const shape = Math.floor(next() * LEAF_SHAPE_COUNT);
  const tint = Math.floor(next() * LEAF_TINT_COUNT);
  const inset = floatingLeafInset();
  const minX = water.minX + inset;
  const maxX = water.maxX - inset;
  const minZ = water.minZ + inset;
  const maxZ = water.maxZ - inset;
  const x0 = minX <= maxX ? minX + (maxX - minX) * next() : (water.minX + water.maxX) / 2;
  const z0 = minZ <= maxZ ? minZ + (maxZ - minZ) * next() : (water.minZ + water.maxZ) / 2;
  const heading = wave.breeze + LEAF_HEADING_SPREAD * (2 * next() - 1);
  const speed = LEAF_DRIFT_SPEED.min + (LEAF_DRIFT_SPEED.max - LEAF_DRIFT_SPEED.min) * next();
  const wobblePhase = next() * 2 * Math.PI;
  const rotation0 = next() * 2 * Math.PI;
  const spin = LEAF_SPIN * (2 * next() - 1);

  const dx = Math.cos(heading);
  const dz = Math.sin(heading);
  // La feuille avance jusqu'au bord de la surface rétrécie, puis s'y arrête.
  const travel = Math.min(
    speed * age,
    rayToEdge(x0, dx, minX, maxX),
    rayToEdge(z0, dz, minZ, maxZ),
  );
  const wobble = LEAF_WOBBLE * Math.sin((2 * Math.PI * age) / LEAF_WOBBLE_PERIOD + wobblePhase);
  const envelope = Math.min(1, age / LEAF_SETTLE_TIME, (LEAF_LIFETIME - age) / LEAF_SINK_TIME);
  out[0] = clamp(x0 + dx * travel - dz * wobble, water.minX, water.maxX);
  out[1] = clamp(z0 + dz * travel + dx * wobble, water.minZ, water.maxZ);
  out[2] = rotation0 + spin * age;
  out[3] = length * envelope;
  out[4] = shape;
  out[5] = tint;
  return true;
}

/**
 * Écrit dans `out` les feuilles vivantes au temps simulé `time` (secondes) sur la surface
 * `water` (bornes en X et Z), de la plus ancienne à la plus récente, et renvoie leur nombre.
 * Au-delà de la capacité de `out`, les plus récentes sont ignorées (jamais le cas avec la
 * capacité par défaut).
 * @throws RangeError si la graine est invalide, si `time` n'est pas un réel positif ou nul,
 * ou si `time` dépasse le dernier numéro de créneau représentable.
 */
export function fillFloatingLeaves(
  seed: number,
  time: number,
  water: Box3,
  out: FloatingLeafBuffer,
): number {
  assertSeed(seed);
  if (!Number.isFinite(time) || time < 0) {
    throw new RangeError(`time doit être un réel positif ou nul (reçu : ${time})`);
  }
  const last = Math.floor(time / LEAF_SLOT_PERIOD);
  if (last > MAX_SEED) {
    throw new RangeError(`time trop grand pour numéroter les créneaux (reçu : ${time})`);
  }
  const first = Math.max(0, Math.floor((time - LEAF_LIFETIME) / LEAF_SLOT_PERIOD) - 1);
  const capacity = Math.floor(out.leaves.length / LEAF_STRIDE);
  let count = 0;
  for (let slot = first; slot <= last && count < capacity; slot++) {
    if (leafAt(seed, slot, time, water, scratch)) {
      out.leaves.set(scratch, count * LEAF_STRIDE);
      count++;
    }
  }
  out.count = count;
  return count;
}

/** Distance (≥ 0) le long de `d` depuis `p` jusqu'à sortir de [min, max]. */
function rayToEdge(p: number, d: number, min: number, max: number): number {
  if (d > 1e-12) {
    return Math.max(0, (max - p) / d);
  }
  if (d < -1e-12) {
    return Math.max(0, (min - p) / d);
  }
  return Infinity;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
