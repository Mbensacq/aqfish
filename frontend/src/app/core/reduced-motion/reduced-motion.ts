/**
 * Option « Réduire les mouvements » (#406, ADR 0098) : l'état vient de deux sources, la
 * préférence du système (`prefers-reduced-motion: reduce`) et le choix fait dans les réglages,
 * mémorisé à part de la sauvegarde du monde (comme `aqfish.filtre`). Le choix mémorisé, s'il
 * existe, l'emporte ; sans choix, la préférence système décide.
 *
 * L'option n'agit que sur le rendu (`MotionFactors`) : la simulation, les soins et le hasard
 * ne la voient jamais, donc un monde avance exactement de la même façon avec ou sans elle.
 *
 * Module pur (ni Angular, ni Three.js) : lecture et écriture tolérantes ; le stockage et la
 * source des requêtes média sont injectés (en pratique `localStorage` et `window`, qui peuvent
 * être absents ou lever une exception).
 */

/** Clé du choix mémorisé dans le stockage du navigateur. */
export const REDUCED_MOTION_STORAGE_KEY = 'aqfish.mouvements-reduits';

/** Requête média de la préférence système. */
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** Valeurs mémorisées ; toute autre valeur vaut « pas de choix ». */
const REDUCED_VALUE = 'reduits';
const FULL_VALUE = 'normaux';

/** Sous-ensemble de `Storage` utilisé ici (remplaçable par un double dans les tests). */
export interface ReducedMotionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Sous-ensemble de `Window` utilisé ici : `matchMedia` peut manquer (jsdom, vieux moteurs). */
export interface MediaQuerySource {
  matchMedia?: (query: string) => { readonly matches: boolean };
}

/**
 * Choix mémorisé : `true` (réduire), `false` (mouvements normaux), ou `null` sans choix, pour
 * une valeur inconnue ou si le stockage est indisponible (absent ou levant une exception).
 */
export function readStoredReducedMotion(storage: ReducedMotionStorage | null): boolean | null {
  if (!storage) {
    return null;
  }
  try {
    const value = storage.getItem(REDUCED_MOTION_STORAGE_KEY);
    return value === REDUCED_VALUE ? true : value === FULL_VALUE ? false : null;
  } catch {
    return null;
  }
}

/**
 * Mémorise le choix. Renvoie `false` si le stockage est indisponible ou refuse l'écriture :
 * le choix reste alors celui de la session (repli silencieux en mémoire).
 */
export function writeStoredReducedMotion(
  storage: ReducedMotionStorage | null,
  reduced: boolean,
): boolean {
  if (!storage) {
    return false;
  }
  try {
    storage.setItem(REDUCED_MOTION_STORAGE_KEY, reduced ? REDUCED_VALUE : FULL_VALUE);
    return true;
  } catch {
    return false;
  }
}

/**
 * Vrai si le système demande de réduire les mouvements. Faux si `matchMedia` manque, lève une
 * exception ou ne renvoie pas de résultat exploitable.
 */
export function systemPrefersReducedMotion(source: MediaQuerySource | null): boolean {
  if (!source || typeof source.matchMedia !== 'function') {
    return false;
  }
  try {
    return source.matchMedia(REDUCED_MOTION_QUERY)?.matches === true;
  } catch {
    return false;
  }
}

/** État effectif : le choix mémorisé s'il existe, sinon la préférence système. */
export function resolveReducedMotion(stored: boolean | null, system: boolean): boolean {
  return stored ?? system;
}

/**
 * Facteurs appliqués aux mouvements décoratifs du rendu. 1 partout : rendu inchangé (et
 * multiplications exactes, donc captures identiques à l'octet) ; 0 : mouvement supprimé.
 */
export interface MotionFactors {
  /** Part de la durée des transitions de caméra (préréglages, retour à l'orbite) ; 0 : saut. */
  readonly cameraTransition: number;
  /** Vitesse des caustiques, du reflet de surface et de la dérive des nénuphars. */
  readonly waterWave: number;
  /** Amplitude de l'ondulation des plantes. */
  readonly plantSway: number;
  /**
   * Vitesse du temps de la pluie : chute des gouttes, naissance et élargissement des ronds
   * (le nombre de gouttes en l'air ne change pas, elles tombent plus lentement).
   */
  readonly rainSpeed: number;
  /** Part du décalage de l'œil dû à l'inclinaison de l'appareil (mode immersif). */
  readonly parallax: number;
}

/** Mouvements normaux : rien ne change. */
export const FULL_MOTION: MotionFactors = Object.freeze({
  cameraTransition: 1,
  waterWave: 1,
  plantSway: 1,
  rainSpeed: 1,
  parallax: 1,
});

/**
 * Mouvements réduits (valeurs de jeu, choisies à l'œil sur capture) : caméra qui saute, eau
 * et plantes calmes, pluie plus lente, parallaxe coupée.
 */
export const REDUCED_MOTION: MotionFactors = Object.freeze({
  cameraTransition: 0,
  waterWave: 0.25,
  plantSway: 0.3,
  rainSpeed: 0.4,
  parallax: 0,
});

/** Facteurs de l'état `reduced`. */
export function motionFactors(reduced: boolean): MotionFactors {
  return reduced ? REDUCED_MOTION : FULL_MOTION;
}
