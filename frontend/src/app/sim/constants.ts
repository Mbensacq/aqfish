/** Pas de temps fixe de la simulation, en secondes (ADR 0003). */
export const SIM_DT = 1 / 60;

/**
 * Nombre maximal de pas de simulation par image affichée. Au-delà (onglet en arrière-plan,
 * gros ralentissement), le retard est abandonné plutôt que rattrapé : cela évite la
 * « spirale de la mort » où chaque image coûte plus de pas que la précédente.
 * 5 pas ≈ 83 ms de simulation par image.
 */
export const MAX_STEPS_PER_FRAME = 5;
