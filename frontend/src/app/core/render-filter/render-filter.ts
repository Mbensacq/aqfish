/**
 * Filtre de rendu (issue #33, ADR 0010) : pixel art (basse résolution + palette, par défaut)
 * ou aucun filtre (rendu direct pleine résolution, modèles 3D tels quels).
 *
 * Module pur (ni Angular, ni Three.js) : décodage d'une valeur quelconque et lecture/écriture
 * tolérantes du choix mémorisé. Le stockage est injecté (en pratique `localStorage`, qui peut
 * être absent ou lever une exception : navigation privée, cookies bloqués, quota).
 */

export const RENDER_FILTERS = ['pixel', 'aucun'] as const;

export type RenderFilter = (typeof RENDER_FILTERS)[number];

/** Mode par défaut : le pixel art est l'identité visuelle du projet (docs/DA.md). */
export const DEFAULT_RENDER_FILTER: RenderFilter = 'pixel';

/** Clé du choix mémorisé dans le stockage du navigateur. */
export const RENDER_FILTER_STORAGE_KEY = 'aqfish.filtre';

/** Sous-ensemble de `Storage` utilisé ici (remplaçable par un double dans les tests). */
export interface FilterStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Vrai si `value` est exactement un filtre connu. */
export function isRenderFilter(value: unknown): value is RenderFilter {
  return RENDER_FILTERS.some((filter) => filter === value);
}

/** Normalise une valeur quelconque : un filtre connu est conservé, tout le reste ⇒ `pixel`. */
export function parseRenderFilter(value: unknown): RenderFilter {
  return isRenderFilter(value) ? value : DEFAULT_RENDER_FILTER;
}

/** L'autre filtre (bouton et touche `P`). */
export function toggleRenderFilter(filter: RenderFilter): RenderFilter {
  return filter === 'pixel' ? 'aucun' : 'pixel';
}

/**
 * Choix mémorisé, ou `null` s'il n'y en a pas, s'il est invalide ou si le stockage est
 * indisponible (absent ou levant une exception).
 */
export function readStoredRenderFilter(storage: FilterStorage | null): RenderFilter | null {
  if (!storage) {
    return null;
  }
  try {
    const value = storage.getItem(RENDER_FILTER_STORAGE_KEY);
    return isRenderFilter(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Mémorise le choix. Renvoie `false` si le stockage est indisponible ou refuse l'écriture :
 * l'appelant garde alors le choix en mémoire seulement (repli silencieux).
 */
export function writeStoredRenderFilter(
  storage: FilterStorage | null,
  filter: RenderFilter,
): boolean {
  if (!storage) {
    return false;
  }
  try {
    storage.setItem(RENDER_FILTER_STORAGE_KEY, filter);
    return true;
  } catch {
    return false;
  }
}

/**
 * Filtre initial : celui de l'URL s'il est donné (`filtre=`), sinon, hors capture, le choix
 * mémorisé ; en mode capture, le choix mémorisé est ignoré (images reproductibles, séries
 * de captures existantes inchangées).
 */
export function initialRenderFilter(
  fromUrl: RenderFilter | null,
  stored: RenderFilter | null,
  capture: boolean,
): RenderFilter {
  if (fromUrl !== null) {
    return fromUrl;
  }
  if (!capture && stored !== null) {
    return stored;
  }
  return DEFAULT_RENDER_FILTER;
}
