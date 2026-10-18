import { MAX_STEPS_PER_FRAME, SIM_DT } from './constants';
import { assertTimeStep } from './time-step';

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

/** Résultat modifiable de `fixedStepInto`, réutilisé d'une image à l'autre. */
export type FixedStepState = { -readonly [K in keyof FixedStepResult]: FixedStepResult[K] };

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
  const out: FixedStepState = { steps: 0, accumulator: 0, alpha: 0 };
  return fixedStepInto(input.accumulator, input.realDt, out, dt, maxSteps);
}

/**
 * Même calcul que `fixedStep`, sans allocation : le résultat est écrit dans `out`, qui est
 * renvoyé. Réservé à la boucle d'affichage (`ui/aquarium-host`), appelée à chaque image.
 * @throws RangeError si `dt` n'est pas un réel strictement positif ou si `maxSteps` n'est
 * pas un entier positif ou nul.
 */
export function fixedStepInto(
  accumulator: number,
  realDt: number,
  out: FixedStepState,
  dt: number = SIM_DT,
  maxSteps: number = MAX_STEPS_PER_FRAME,
): FixedStepState {
  assertTimeStep(dt);
  if (!Number.isInteger(maxSteps) || maxSteps < 0) {
    throw new RangeError(`maxSteps doit être un entier positif ou nul (reçu : ${maxSteps})`);
  }

  const accumulated = sanitize(accumulator) + sanitize(realDt);
  const available = Math.floor(accumulated / dt + ROUNDING_EPSILON);
  const steps = Math.min(available, maxSteps);

  // Reste fractionnaire, ramené dans [0, dt) (le retard au-delà du plafond est abandonné).
  let rest = accumulated - available * dt;
  if (rest < 0 || rest >= dt) {
    rest = 0;
  }

  out.steps = steps;
  out.accumulator = rest;
  out.alpha = rest / dt;
  return out;
}

function sanitize(seconds: number): number {
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
}
