import type { SpeciesDefinition } from './species';

/**
 * Ondulation du corps des poissons (ADR 0009, issue #29) : fonctions pures, sans état.
 *
 * La simulation n'en tire que la vitesse d'avance de la phase (`tailBeatRate`) ; la phase
 * n'est lue par aucun calcul de position, de cap ou de vitesse, et son avance ne consomme
 * aucun tirage du générateur : l'ondulation n'influence pas la trajectoire. Le rendu en
 * tire la pose (lacet du corps, battement de la queue) avec `undulationScale` et
 * `undulationAt`.
 */

/** Amplitude du lacet du corps (autour de son centre) à vitesse de croisière, en radians. */
export const BODY_SWAY = 0.12;
/** Amplitude du battement de la queue à vitesse de croisière, en radians. */
export const TAIL_SWING = 0.6;
/** Retard de phase de la queue sur le corps (l'onde part de la tête), en radians. */
export const TAIL_LAG = 0.9;

/**
 * Facteur d'amplitude : `AMPLITUDE_BASE + (1 − AMPLITUDE_BASE) · vitesse / croisière`,
 * borné à [`MIN_AMPLITUDE_SCALE`, `MAX_AMPLITUDE_SCALE`] (approximations de jeu). Vaut 1 à
 * la vitesse de croisière ; un poisson qui accélère bat plus fort, un poisson lent garde
 * un battement lisible (≥ 1 pixel de scène au bout de la queue, voir les tests).
 */
const AMPLITUDE_BASE = 0.5;
export const MIN_AMPLITUDE_SCALE = 0.6;
export const MAX_AMPLITUDE_SCALE = 1.4;

const TWO_PI = Math.PI * 2;

/** Pose d'ondulation : angles de lacet autour de l'axe vertical du modèle, en radians. */
export interface Undulation {
  /** Lacet du corps autour de son centre. */
  bodySway: number;
  /** Battement de la queue autour de son pivot, relatif au corps. */
  tailSwing: number;
}

/**
 * Vitesse d'avance de la phase, en rad/s : `2π · tailBeatFrequency · vitesse / croisière`.
 * Nulle à l'arrêt (vitesse ≤ 0).
 * @throws RangeError si `speed` n'est pas fini.
 */
export function tailBeatRate(def: SpeciesDefinition, speed: number): number {
  assertFinite(speed);
  if (speed <= 0) {
    return 0;
  }
  return TWO_PI * def.tailBeatFrequency * (speed / def.cruiseSpeed);
}

/**
 * Facteur d'amplitude de l'ondulation selon la vitesse (1 à la vitesse de croisière).
 * @throws RangeError si `speed` n'est pas fini.
 */
export function undulationScale(def: SpeciesDefinition, speed: number): number {
  assertFinite(speed);
  const scale = AMPLITUDE_BASE + (1 - AMPLITUDE_BASE) * (speed / def.cruiseSpeed);
  return scale < MIN_AMPLITUDE_SCALE
    ? MIN_AMPLITUDE_SCALE
    : scale > MAX_AMPLITUDE_SCALE
      ? MAX_AMPLITUDE_SCALE
      : scale;
}

/**
 * Pose d'ondulation à la phase `phase` (radians) et au facteur d'amplitude `scale`.
 * Écrit dans `out` (aucune allocation) et le renvoie.
 */
export function undulationAt(phase: number, scale: number, out: Undulation): Undulation {
  out.bodySway = Math.sin(phase) * BODY_SWAY * scale;
  out.tailSwing = Math.sin(phase - TAIL_LAG) * TAIL_SWING * scale;
  return out;
}

function assertFinite(speed: number): void {
  if (!Number.isFinite(speed)) {
    throw new RangeError(`Vitesse invalide : ${speed}`);
  }
}
