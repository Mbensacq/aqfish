import { MAX_STEPS_PER_FRAME, SIM_DT } from './constants';

/**
 * Tolérance relative sur la division `accumulateur / SIM_DT` : absorbe l'erreur d'arrondi
 * flottant (ex. 60 images de 1/60 s doivent donner exactement 60 pas, pas 59).
 */
const ROUNDING_EPSILON = 1e-9;

export interface FixedStepInput {
  /** Temps réel accumulé et non encore simulé à l'image précédente, en secondes. */
  readonly accumulator: number;
  /** Temps réel écoulé depuis l'image précédente, en secondes. */
  readonly realDt: number;
}

export interface FixedStepResult {
  /** Nombre de pas `SIM_DT` à exécuter pour cette image (0 à `maxSteps`). */
  readonly steps: number;
  /** Reste à reporter à l'image suivante, dans [0, SIM_DT). */
  readonly accumulator: number;
  /** Facteur d'interpolation du rendu entre les deux derniers états, dans [0, 1). */
  readonly alpha: number;
}

/**
 * Boucle à pas fixe (accumulateur), en fonction pure.
 *
 * - Un `realDt` négatif, `NaN` ou infini compte pour 0 (horloge non monotone, première image).
 * - Au-delà de `maxSteps` pas, le retard est abandonné : seul le reste fractionnaire est
 *   conservé, pour que `alpha` reste cohérent.
 */
export function fixedStep(
  input: FixedStepInput,
  dt: number = SIM_DT,
  maxSteps: number = MAX_STEPS_PER_FRAME,
): FixedStepResult {
  if (!(dt > 0) || !Number.isFinite(dt)) {
    throw new RangeError(`dt doit être un réel strictement positif (reçu : ${dt})`);
  }
  if (!Number.isInteger(maxSteps) || maxSteps < 0) {
    throw new RangeError(`maxSteps doit être un entier positif ou nul (reçu : ${maxSteps})`);
  }

  const accumulated = sanitize(input.accumulator) + sanitize(input.realDt);
  const available = Math.floor(accumulated / dt + ROUNDING_EPSILON);
  const steps = Math.min(available, maxSteps);

  // Reste fractionnaire, ramené dans [0, dt) (le retard au-delà du plafond est abandonné).
  let accumulator = accumulated - available * dt;
  if (accumulator < 0 || accumulator >= dt) {
    accumulator = 0;
  }

  return { steps, accumulator, alpha: accumulator / dt };
}

function sanitize(seconds: number): number {
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
}
