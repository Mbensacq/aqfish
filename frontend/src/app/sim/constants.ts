/** Pas de temps fixe de la simulation, en secondes (ADR 0003). */
export const SIM_DT = 1 / 60;

/**
 * Nombre maximal de pas de simulation par image affichée. Au-delà (onglet en arrière-plan,
 * gros ralentissement), le retard est abandonné plutôt que rattrapé : cela évite la
 * « spirale de la mort » où chaque image coûte plus de pas que la précédente.
 * 5 pas ≈ 83 ms de simulation par image.
 */
export const MAX_STEPS_PER_FRAME = 5;

/**
 * Nombre maximal de poissons d'un bac, toutes espèces confondues (issue #69, ADR 0025) :
 * plafond de performance (banc en O(n²)) et de lisibilité. Ici plutôt que dans
 * `sim/population.ts` pour que la mise bas (`sim/world.ts`, issue #459) le lise sans import
 * circulaire ; réexporté par `sim/population.ts`.
 */
export const MAX_TOTAL_FISH = 60;
