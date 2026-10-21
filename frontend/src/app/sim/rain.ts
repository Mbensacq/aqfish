import { assertSeed, deriveSeed, MAX_SEED, prngNextState, prngOutput } from '../core/random/prng';
import type { Box3 } from './tank';

/**
 * Pluie sur le bassin (issue #106, ADR 0032) : gouttes qui tombent, puis ronds concentriques
 * qui s'élargissent à la surface au point d'impact.
 *
 * Système **sans état**, sur le modèle des bulles (ADR 0017) et des nénuphars (ADR 0029) :
 * la goutte n° k naît au temps `k · RAIN_DROP_PERIOD` (cadence fixe), à
 * `RAIN_START_HEIGHT` au-dessus de la surface, tombe à vitesse constante et touche l'eau au
 * bout de `RAIN_FALL_TIME` ; son rond vit ensuite `RIPPLE_DURATION`. Position et instants
 * sont une fonction fermée de la graine du monde, de k et du temps **simulé** : rien à
 * faire avancer ni à sauvegarder (l'état de la pluie, allumée ou non, n'est pas non plus
 * sauvegardé), et le flux de hasard (`RAIN_STREAM`) est séparé de celui des poissons, des
 * bulles, de la nourriture et des nénuphars.
 *
 * Bornes : au plus `MAX_RAIN_DROPS` gouttes en l'air et `MAX_RIPPLES` ronds à un instant
 * (constantes calculées sur la cadence) ; un rond a toujours un âge dans
 * [0, `RIPPLE_DURATION`[ et un rayon au plus `RIPPLE_MAX_RADIUS`. Les impacts sont tirés
 * dans la surface rétrécie de `RIPPLE_MAX_RADIUS` : aucun rond ne passe sur la bordure.
 */

/** Flux de hasard de la pluie, dérivé de la graine du monde (`deriveSeed`). */
export const RAIN_STREAM = 0x4a1e;

/** Gouttes par seconde sur tout le bassin. */
export const RAIN_DROP_RATE = 30;
/** Intervalle entre deux gouttes, en secondes. */
export const RAIN_DROP_PERIOD = 1 / RAIN_DROP_RATE;
/** Hauteur de naissance d'une goutte au-dessus de la surface (bas du trait), en mètres. */
export const RAIN_START_HEIGHT = 0.9;
/**
 * Vitesse de chute, en m/s. Approximation de jeu, plus lente qu'une vraie goutte (plusieurs
 * m/s) : une goutte reste visible une dizaine d'images. La durée de chute n'est pas un
 * multiple de la période : aucun cas limite d'arrondi sur les bornes.
 */
export const RAIN_FALL_SPEED = 3.2;
/** Durée de chute d'une goutte, de sa naissance à l'impact, en secondes. */
export const RAIN_FALL_TIME = RAIN_START_HEIGHT / RAIN_FALL_SPEED;
/** Longueur du trait d'une goutte, en mètres (de son bas vers le haut). */
export const RAIN_STREAK_LENGTH = 0.07;

/**
 * Durée de vie d'un rond, de l'impact à sa disparition, en secondes (pas un multiple de la
 * période, comme la durée de chute).
 */
export const RIPPLE_DURATION = 0.77;
/** Rayon maximal du rond extérieur, en mètres (atteint à la fin de sa vie). */
export const RIPPLE_MAX_RADIUS = 0.06;
/**
 * Écart entre le rond extérieur et le rond intérieur, en mètres : le rond intérieur n'est
 * dessiné que lorsque le rayon extérieur le dépasse.
 */
export const RIPPLE_RING_GAP = 0.025;

/** Nombre maximal de gouttes en l'air à un instant (bornes comprises). */
export const MAX_RAIN_DROPS = Math.floor(RAIN_FALL_TIME / RAIN_DROP_PERIOD) + 1;
/** Nombre maximal de ronds actifs à un instant (bornes comprises). */
export const MAX_RIPPLES = Math.floor(RIPPLE_DURATION / RAIN_DROP_PERIOD) + 1;

/**
 * Frémissement des nénuphars sous la pluie : rotation supplémentaire au plus
 * `RAIN_PAD_SHIVER_ANGLE` radians (à peine visible), de période `RAIN_PAD_SHIVER_PERIOD`
 * secondes. Une rotation seule ne change pas l'encombrement d'une feuille (ADR 0029).
 */
export const RAIN_PAD_SHIVER_ANGLE = 0.02;
export const RAIN_PAD_SHIVER_PERIOD = 0.7;

/** Gouttes et ronds vivants, écrits en place (aucune allocation par image). */
export interface RainBuffer {
  /** x, y, z du bas de chaque goutte en l'air, de la plus ancienne à la plus récente. */
  readonly drops: Float64Array;
  /** Nombre de gouttes valides dans `drops`. */
  dropCount: number;
  /** x, z et âge (secondes depuis l'impact) de chaque rond, du plus ancien au plus récent. */
  readonly ripples: Float64Array;
  /** Nombre de ronds valides dans `ripples`. */
  rippleCount: number;
}

/** Tampon de pluie, à allouer une fois par propriétaire. */
export function createRainBuffer(
  dropCapacity: number = MAX_RAIN_DROPS,
  rippleCapacity: number = MAX_RIPPLES,
): RainBuffer {
  for (const capacity of [dropCapacity, rippleCapacity]) {
    if (!Number.isInteger(capacity) || capacity < 0) {
      throw new RangeError(`capacité invalide : ${capacity}`);
    }
  }
  return {
    drops: new Float64Array(dropCapacity * 3),
    dropCount: 0,
    ripples: new Float64Array(rippleCapacity * 3),
    rippleCount: 0,
  };
}

/** Point d'impact d'une goutte, à la surface. */
export interface RainImpact {
  x: number;
  z: number;
}

/**
 * Écrit dans `out` le point d'impact de la goutte n° `index` du monde de graine `seed`, tiré
 * dans la surface de `water` rétrécie de `RIPPLE_MAX_RADIUS` (au centre si la surface est
 * trop petite).
 * @throws RangeError si la graine ou le numéro n'est pas un entier 32 bits non signé.
 */
export function rainImpact(seed: number, index: number, water: Box3, out: RainImpact): RainImpact {
  let state = deriveSeed(deriveSeed(seed, RAIN_STREAM), index);
  state = prngNextState(state);
  const u = prngOutput(state) / 4294967296;
  state = prngNextState(state);
  const v = prngOutput(state) / 4294967296;
  out.x = within(water.minX, water.maxX, u);
  out.z = within(water.minZ, water.maxZ, v);
  return out;
}

/** Instant d'impact de la goutte n° `index`, en secondes de temps simulé. */
export function rainImpactTime(index: number): number {
  return index * RAIN_DROP_PERIOD + RAIN_FALL_TIME;
}

/**
 * Rayon du rond extérieur à l'âge `age` (secondes depuis l'impact) : 0 à l'impact,
 * `RIPPLE_MAX_RADIUS` à `RIPPLE_DURATION`, croissance rapide puis ralentie
 * (`1 − (1 − a)²`). Âge ramené dans [0, `RIPPLE_DURATION`].
 */
export function rippleRadius(age: number): number {
  const a = Math.min(1, Math.max(0, age / RIPPLE_DURATION));
  return RIPPLE_MAX_RADIUS * (1 - (1 - a) * (1 - a));
}

const scratchImpact: RainImpact = { x: 0, z: 0 };

/**
 * Écrit dans `out` les gouttes en l'air et les ronds actifs au temps simulé `time`
 * (secondes) pour la surface `water` (`water.maxY` : hauteur de la surface), du plus ancien
 * au plus récent, et renvoie le nombre de ronds.
 *
 * - Goutte n° k en l'air de sa naissance `k · RAIN_DROP_PERIOD` (comprise) à son impact
 *   (exclu) ; bas du trait à `RAIN_START_HEIGHT` au-dessus de la surface à la naissance.
 * - Rond n° k actif de l'impact (compris) à l'impact + `RIPPLE_DURATION` (exclu), centré
 *   sur le point d'impact de la goutte n° k.
 *
 * Au-delà de la capacité de `out`, les plus récents sont ignorés (jamais le cas avec les
 * capacités par défaut).
 * @throws RangeError si la graine est invalide, si `time` n'est pas un réel positif ou nul,
 * ou si `time` dépasse le dernier numéro de goutte représentable.
 */
export function fillRain(seed: number, time: number, water: Box3, out: RainBuffer): number {
  assertSeed(seed);
  if (!Number.isFinite(time) || time < 0) {
    throw new RangeError(`time doit être un réel positif ou nul (reçu : ${time})`);
  }
  // Petite tolérance : un instant pile sur une naissance compte la goutte née (comme les bulles).
  const last = Math.floor(time / RAIN_DROP_PERIOD + 1e-9);
  if (last > MAX_SEED) {
    throw new RangeError(`time trop grand pour numéroter les gouttes (reçu : ${time})`);
  }
  const first = Math.max(
    0,
    Math.ceil((time - RAIN_FALL_TIME - RIPPLE_DURATION) / RAIN_DROP_PERIOD - 1e-9),
  );
  const dropCapacity = out.drops.length / 3;
  const rippleCapacity = out.ripples.length / 3;
  let drops = 0;
  let ripples = 0;
  for (let k = first; k <= last; k++) {
    const born = k * RAIN_DROP_PERIOD;
    const impact = born + RAIN_FALL_TIME;
    if (time < born) {
      continue;
    }
    if (time < impact) {
      if (drops < dropCapacity) {
        const p = rainImpact(seed, k, water, scratchImpact);
        out.drops[3 * drops] = p.x;
        out.drops[3 * drops + 1] = water.maxY + RAIN_START_HEIGHT - RAIN_FALL_SPEED * (time - born);
        out.drops[3 * drops + 2] = p.z;
        drops++;
      }
      continue;
    }
    const age = time - impact;
    if (age < RIPPLE_DURATION && ripples < rippleCapacity) {
      const p = rainImpact(seed, k, water, scratchImpact);
      out.ripples[3 * ripples] = p.x;
      out.ripples[3 * ripples + 1] = p.z;
      out.ripples[3 * ripples + 2] = age;
      ripples++;
    }
  }
  out.dropCount = drops;
  out.rippleCount = ripples;
  return ripples;
}

/**
 * Rotation supplémentaire d'un nénuphar sous la pluie au temps `time`, pour la phase
 * `phase` (radians, propre à la feuille) : dans [−`RAIN_PAD_SHIVER_ANGLE`,
 * `RAIN_PAD_SHIVER_ANGLE`].
 */
export function rainShiver(time: number, phase: number): number {
  return RAIN_PAD_SHIVER_ANGLE * Math.sin((2 * Math.PI * time) / RAIN_PAD_SHIVER_PERIOD + phase);
}

/** Point dans [min + marge, max − marge] pour `u` dans [0, 1[, le milieu si trop étroit. */
function within(min: number, max: number, u: number): number {
  const lo = min + RIPPLE_MAX_RADIUS;
  const hi = max - RIPPLE_MAX_RADIUS;
  return lo <= hi ? lo + (hi - lo) * u : (min + max) / 2;
}
