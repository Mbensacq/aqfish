/**
 * Petites étapes de mouvement communes à la nage (`sim/swimmer.ts`) et à la marche sur le
 * fond (`sim/axolotl.ts`), chantier #686 : fonctions pures, sans allocation, dont l'ordre
 * des opérations flottantes est celui du code d'origine (trajectoires identiques au bit près).
 */

const TWO_PI = Math.PI * 2;

/** `value` ramené dans [`min`, `max`]. */
export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/**
 * Inclinaison après un pas : `pitch` s'approche de `goal` d'au plus `maxStep` radians, puis
 * reste dans [`min`, `max`].
 */
export function pitchToward(
  pitch: number,
  goal: number,
  maxStep: number,
  min: number,
  max: number,
): number {
  return clamp(pitch + clamp(goal - pitch, -maxStep, maxStep), min, max);
}

/**
 * Vitesse de virage d'errance après un pas : `turn` amorti de `damping` par seconde, plus
 * l'à-coup aléatoire `jitter` (rad/s).
 */
export function dampedTurn(turn: number, damping: number, jitter: number, dt: number): number {
  return turn * (1 - damping * dt) + jitter;
}

/** Phase du battement de queue après `dt` secondes à `rate` rad/s, dans [0, 2π). */
export function advancePhase(phase: number, rate: number, dt: number): number {
  return (phase + rate * dt) % TWO_PI;
}

/** Ramène un angle dans (-π, π]. */
export function wrapAngle(angle: number): number {
  let a = angle % TWO_PI;
  if (a <= -Math.PI) {
    a += TWO_PI;
  } else if (a > Math.PI) {
    a -= TWO_PI;
  }
  return a;
}
