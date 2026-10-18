/**
 * Valide un pas de temps de simulation (seule source de cette règle, utilisée par
 * `sim/fixed-step.ts` et `sim/world.ts`).
 * @throws RangeError si `dt` n'est pas un réel fini strictement positif.
 */
export function assertTimeStep(dt: number): void {
  if (!(dt > 0) || !Number.isFinite(dt)) {
    throw new RangeError(`dt doit être un réel strictement positif (reçu : ${dt})`);
  }
}
