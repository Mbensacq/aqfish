/**
 * Ondulation des plantes (issue #49, ADR 0016) : fonction pure, sans état ni tirage.
 *
 * Le déplacement latéral d'un point d'une plante ne dépend que de sa hauteur relative
 * `h` (0 à la racine, 1 à la pointe), du temps **simulé** `time` (jamais de l'horloge
 * murale : même temps, même pose, contrat de capture) et de la phase propre de la plante.
 * Il est nul à la racine, croît comme `h²` vers la pointe et ne dépasse jamais
 * `amplitude · h²` en norme : la forme de collision de la tige, élargie de cette borne,
 * contient la tige à tout instant (`sim/plant.ts`).
 *
 * Mouvement lent : une onde principale selon X (période `SWAY_PERIOD`), une onde
 * secondaire plus lente selon Z, toutes deux en retard vers la pointe (`SWAY_WAVE_LAG`),
 * ce qui courbe la tige au lieu de l'incliner d'un bloc.
 */

/** Période de l'onde principale, en secondes. */
export const SWAY_PERIOD = 5;
/** Rapport de la période de l'onde secondaire (selon Z) à celle de l'onde principale. */
export const SWAY_SECONDARY_PERIOD_RATIO = 1.6;
/** Retard de phase de la pointe sur la racine, en radians (onde qui monte la tige). */
export const SWAY_WAVE_LAG = 1.2;
/**
 * Poids des deux ondes : `0,8² + 0,6² = 1`, la norme du déplacement reste donc bornée par
 * `amplitude · h²`.
 */
export const SWAY_WEIGHT_X = 0.8;
export const SWAY_WEIGHT_Z = 0.6;

const TWO_PI = Math.PI * 2;
const OMEGA = TWO_PI / SWAY_PERIOD;
const OMEGA_Z = OMEGA / SWAY_SECONDARY_PERIOD_RATIO;

/** Déplacement horizontal dans le repère du bac, en mètres. */
export interface SwayOffset {
  x: number;
  z: number;
}

/**
 * Écrit dans `out` le déplacement horizontal (repère du bac) d'un point de plante de
 * hauteur relative `h` (ramenée dans [0, 1]) au temps simulé `time`, pour une plante de
 * phase `phase` et d'amplitude `amplitude` (mètres, à la pointe).
 * @throws RangeError si `time`, `phase` ou `amplitude` n'est pas fini, ou si `amplitude`
 * est négative.
 */
export function plantSway(
  h: number,
  time: number,
  phase: number,
  amplitude: number,
  out: SwayOffset,
): SwayOffset {
  if (!Number.isFinite(time) || !Number.isFinite(phase)) {
    throw new RangeError(`time et phase doivent être finis (reçus : ${time}, ${phase})`);
  }
  if (!Number.isFinite(amplitude) || amplitude < 0) {
    throw new RangeError(`amplitude doit être un réel positif ou nul (reçu : ${amplitude})`);
  }
  const hc = h > 0 ? (h < 1 ? h : 1) : 0;
  const scale = amplitude * hc * hc;
  const lag = SWAY_WAVE_LAG * hc;
  out.x = scale * SWAY_WEIGHT_X * Math.sin(OMEGA * time + phase - lag);
  out.z = scale * SWAY_WEIGHT_Z * Math.sin(OMEGA_Z * time + 1.7 * phase - lag);
  return out;
}

/** Borne de la norme du déplacement à la hauteur relative `h` : `amplitude · h²`. */
export function plantSwayBound(h: number, amplitude: number): number {
  const hc = h > 0 ? (h < 1 ? h : 1) : 0;
  return amplitude * hc * hc;
}
