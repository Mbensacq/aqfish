/**
 * Préférence d'affichage « caméra libre » (#344, ADR 0085) : le dernier mode choisi (libre ou
 * orbite) est mémorisé à part de la sauvegarde du monde, comme le filtre de rendu
 * (`aqfish.filtre`) : le schéma de la sauvegarde ne change pas.
 *
 * Module pur (ni Angular, ni Three.js) : lecture et écriture tolérantes ; le stockage est
 * injecté (en pratique `localStorage`, qui peut être absent ou lever une exception).
 */

/** Clé du choix mémorisé dans le stockage du navigateur. */
export const FREE_CAMERA_STORAGE_KEY = 'aqfish.camera-libre';

/** Valeur mémorisée pour la caméra libre ; toute autre valeur vaut « orbite ». */
const FREE_VALUE = 'libre';
const ORBIT_VALUE = 'orbite';

/** Sous-ensemble de `Storage` utilisé ici (remplaçable par un double dans les tests). */
export interface FreeCameraPrefStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Vrai si la caméra libre a été mémorisée comme dernier mode. Faux sans choix, pour une
 * valeur inconnue ou si le stockage est indisponible (absent ou levant une exception).
 */
export function readStoredFreeCamera(storage: FreeCameraPrefStorage | null): boolean {
  if (!storage) {
    return false;
  }
  try {
    return storage.getItem(FREE_CAMERA_STORAGE_KEY) === FREE_VALUE;
  } catch {
    return false;
  }
}

/**
 * Mémorise le mode. Renvoie `false` si le stockage est indisponible ou refuse l'écriture :
 * le mode reste alors celui de la session (repli silencieux).
 */
export function writeStoredFreeCamera(
  storage: FreeCameraPrefStorage | null,
  free: boolean,
): boolean {
  if (!storage) {
    return false;
  }
  try {
    storage.setItem(FREE_CAMERA_STORAGE_KEY, free ? FREE_VALUE : ORBIT_VALUE);
    return true;
  } catch {
    return false;
  }
}
