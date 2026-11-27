/**
 * Option « Lune » des réglages (#856, ADR 0189) : le cycle lunaire fait varier la clarté des
 * nuits (`sim/moon.ts`). Activée par défaut ; le choix est mémorisé à part de la sauvegarde
 * du monde (comme « Réduire les mouvements », `aqfish.mouvements-reduits`).
 *
 * L'option n'agit que sur le rendu : la simulation ne la voit jamais. Module pur : lecture et
 * écriture tolérantes, le stockage (en pratique `localStorage`) est injecté et peut manquer
 * ou lever une exception.
 */

/** Clé du choix mémorisé dans le stockage du navigateur. */
export const MOON_OPTION_STORAGE_KEY = 'aqfish.lune';

/** Valeurs mémorisées ; toute autre valeur vaut l'option par défaut (activée). */
const ON_VALUE = 'active';
const OFF_VALUE = 'coupee';

/** Sous-ensemble de `Storage` utilisé ici (remplaçable par un double dans les tests). */
export interface MoonOptionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Choix mémorisé : `false` seulement si l'option a été coupée ; `true` sinon (aucun choix,
 * valeur inconnue, stockage absent ou levant une exception).
 */
export function readStoredMoonOption(storage: MoonOptionStorage | null): boolean {
  if (!storage) {
    return true;
  }
  try {
    return storage.getItem(MOON_OPTION_STORAGE_KEY) !== OFF_VALUE;
  } catch {
    return true;
  }
}

/**
 * Mémorise le choix. Renvoie `false` si le stockage est indisponible ou refuse l'écriture :
 * le choix reste alors celui de la session (repli silencieux en mémoire).
 */
export function writeStoredMoonOption(
  storage: MoonOptionStorage | null,
  enabled: boolean,
): boolean {
  if (!storage) {
    return false;
  }
  try {
    storage.setItem(MOON_OPTION_STORAGE_KEY, enabled ? ON_VALUE : OFF_VALUE);
    return true;
  } catch {
    return false;
  }
}
