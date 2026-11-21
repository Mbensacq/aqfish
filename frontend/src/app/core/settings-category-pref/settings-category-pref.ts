/**
 * Préférence locale « catégorie ouverte » de la fenêtre des réglages (#722,
 * `docs/INTERFACE.md` section 2) : la dernière catégorie ouverte est retenue d'une visite à
 * l'autre, à part de la sauvegarde du monde, comme le filtre de rendu ou la caméra libre : le
 * schéma de la sauvegarde ne change pas.
 *
 * Module pur (ni Angular, ni Three.js) : il ignore la liste des catégories, que l'appelant
 * fournit (`known`) ; lecture et écriture tolérantes, stockage injecté (en pratique
 * `localStorage`, qui peut être absent ou lever une exception).
 */

/** Clé de la catégorie retenue dans le stockage du navigateur. */
export const SETTINGS_CATEGORY_STORAGE_KEY = 'aqfish.reglages-categorie';

/** Sous-ensemble de `Storage` utilisé ici (remplaçable par un double dans les tests). */
export interface SettingsCategoryPrefStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Catégorie retenue si elle fait partie de `known`, sinon `fallback` : aucune valeur, valeur
 * inconnue (catégorie renommée ou retirée) ou stockage indisponible.
 */
export function readStoredSettingsCategory<T extends string>(
  storage: SettingsCategoryPrefStorage | null,
  known: readonly T[],
  fallback: T,
): T {
  if (!storage) {
    return fallback;
  }
  try {
    const value = storage.getItem(SETTINGS_CATEGORY_STORAGE_KEY);
    return known.find((id) => id === value) ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Retient la catégorie `id`. Renvoie `false` si le stockage est indisponible ou refuse
 * l'écriture : la catégorie reste alors celle de la session (repli silencieux).
 */
export function writeStoredSettingsCategory(
  storage: SettingsCategoryPrefStorage | null,
  id: string,
): boolean {
  if (!storage) {
    return false;
  }
  try {
    storage.setItem(SETTINGS_CATEGORY_STORAGE_KEY, id);
    return true;
  } catch {
    return false;
  }
}
