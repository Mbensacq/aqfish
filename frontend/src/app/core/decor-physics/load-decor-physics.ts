import type { DecorDropper } from './decor-physics';

/**
 * Chargement à la demande du moteur de chute (issue #170, ADR 0046) : `import()` dynamique,
 * donc un fragment séparé du bundle initial, demandé seulement à la première ouverture de
 * l'éditeur du décor. Ce fichier n'importe le moteur qu'en type.
 */

/** Charge et initialise le moteur ; la promesse est rejetée s'il est inaccessible. */
export type DecorPhysicsLoader = () => Promise<DecorDropper>;

/** Chargeur réel : importe `decor-physics.ts` (et Rapier) puis initialise le moteur. */
export const loadDecorPhysics: DecorPhysicsLoader = () =>
  import('./decor-physics').then((module) => module.initDecorPhysics());
