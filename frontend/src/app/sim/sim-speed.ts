import { MAX_STEPS_PER_FRAME } from './constants';

/**
 * Vitesse de simulation (issue #52) : multiplicateur du temps réel versé dans la boucle à
 * pas fixe (`sim/fixed-step.ts`). Le pas `SIM_DT` ne change jamais (déterminisme,
 * docs/ARCHITECTURE.md) : seule la quantité de temps à simuler par image varie. À 0, aucun
 * pas n'est exécuté, mais le rendu continue (caméra, redimensionnement).
 *
 * Module pur : l'hôte (`ui/aquarium-host`) lit ces fonctions à chaque image.
 */

/** Vitesses proposées par le panneau de contrôle, de la pause à ×4. */
export const SIM_SPEEDS = [0, 0.5, 1, 2, 4] as const;

/** Une des vitesses proposées. */
export type SimSpeed = (typeof SIM_SPEEDS)[number];

/** Vitesse par défaut : temps réel. */
export const DEFAULT_SIM_SPEED: SimSpeed = 1;

/** Vrai si `value` est l'une des vitesses proposées (`SIM_SPEEDS`). */
export function isSimSpeed(value: number): value is SimSpeed {
  return (SIM_SPEEDS as readonly number[]).includes(value);
}

/**
 * Libellé d'une vitesse de simulation, en français : « Pause » à 0, sinon « ×0,5 », « ×1 »,
 * « ×2 », « ×4 » (virgule décimale).
 */
export function speedLabel(speed: number): string {
  return speed === 0 ? 'Pause' : `×${String(speed).replace('.', ',')}`;
}

/**
 * Temps à simuler pour une image : `realDt · speed`. Un `realDt` négatif, `NaN` ou infini
 * compte pour 0, comme dans `fixedStepInto` (horloge non monotone, première image).
 * @throws RangeError si `speed` n'est pas l'une des vitesses proposées.
 */
export function scaledDt(realDt: number, speed: number): number {
  assertSimSpeed(speed);
  if (!Number.isFinite(realDt) || realDt <= 0) {
    return 0;
  }
  return realDt * speed;
}

/**
 * Plafond de pas par image à la vitesse `speed` : `MAX_STEPS_PER_FRAME` multiplié par la
 * vitesse quand elle dépasse 1 (sinon ×4 à 30 images par seconde, 8 pas demandés, serait
 * ramené à 5 et la simulation prendrait du retard), jamais en dessous du plafond de base.
 * Le plafond reste borné : la spirale de rattrapage après une longue pause est toujours
 * évitée (au plus 20 pas par image à ×4).
 * @throws RangeError si `speed` n'est pas l'une des vitesses proposées.
 */
export function maxStepsForSpeed(speed: number, base: number = MAX_STEPS_PER_FRAME): number {
  assertSimSpeed(speed);
  return Math.ceil(base * Math.max(1, speed));
}

function assertSimSpeed(speed: number): void {
  if (!isSimSpeed(speed)) {
    throw new RangeError(
      `vitesse de simulation invalide (reçu : ${speed}, attendu : ${SIM_SPEEDS.join(', ')})`,
    );
  }
}
