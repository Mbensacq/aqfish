/**
 * Vue « fond d'écran » (issue #279, ADR 0079) : aqfish sans interface, pour Wallpaper Engine
 * ou un onglet plein écran. Ce module est pur (ni Angular ni Three.js) : choix de la
 * configuration, limiteur d'images par seconde et course de la caméra automatique.
 *
 * Activation : `fond=1` dans l'URL, ou variable globale `aqfishFond` posée par le script
 * `aqfish-fond.js` du paquet (`npm run paquet-fond`), dont la page s'ouvre sans paramètre.
 */

/** Fichier de configuration lu à côté de la page (chemin relatif) : un export d'aqfish. */
export const WALLPAPER_CONFIG_FILE = 'aqfish-fond.json';

/** Images par seconde par défaut en fond d'écran. */
export const DEFAULT_WALLPAPER_FPS = 30;
/** Bornes de `fps=` (comprises) ; hors bornes, la valeur est ramenée à la borne. */
export const MIN_WALLPAPER_FPS = 15;
export const MAX_WALLPAPER_FPS = 60;

/** Configuration posée par `aqfish-fond.js` : `window.aqfishFond = { config, fps }`. */
export interface WallpaperGlobal {
  /** Sauvegarde d'aqfish (objet JSON ou texte), `null` ou absente : pas de configuration. */
  readonly config: unknown;
  /** Images par seconde demandées (bornées comme `fps=`), `null` : défaut. */
  readonly fps: number | null;
}

/**
 * Lit `window.aqfishFond` : `null` s'il est absent ; sinon sa configuration (texte JSON ou
 * objet, rendu en texte) et ses images par seconde. Ne lève jamais.
 */
export function readWallpaperGlobal(win: object | null | undefined): WallpaperGlobal | null {
  let raw: unknown;
  try {
    raw = win ? (win as Record<string, unknown>)['aqfishFond'] : undefined;
  } catch {
    return null;
  }
  if (raw === undefined || raw === null) {
    return null;
  }
  if (typeof raw !== 'object') {
    return { config: null, fps: null };
  }
  const record = raw as Record<string, unknown>;
  const fps = record['fps'];
  return {
    config: record['config'] ?? null,
    fps: typeof fps === 'number' && Number.isFinite(fps) ? fps : null,
  };
}

/** Configuration de la globale en texte JSON (`null` si absente ou non sérialisable). */
export function wallpaperGlobalText(global: WallpaperGlobal | null): string | null {
  const config = global?.config;
  if (config === null || config === undefined) {
    return null;
  }
  if (typeof config === 'string') {
    return config;
  }
  try {
    return JSON.stringify(config) ?? null;
  } catch {
    return null;
  }
}

/** `fps=` : entier de 1 à 3 chiffres, borné à [15, 60] ; mal formé ou absent : `null`. */
export function parseWallpaperFps(raw: string | null): number | null {
  if (raw === null || !/^\d{1,3}$/.test(raw)) {
    return null;
  }
  return clampWallpaperFps(Number(raw));
}

/** Images par seconde bornées à [15, 60], arrondies à l'entier ; non fini : le défaut. */
export function clampWallpaperFps(fps: number): number {
  if (!Number.isFinite(fps)) {
    return DEFAULT_WALLPAPER_FPS;
  }
  return Math.min(MAX_WALLPAPER_FPS, Math.max(MIN_WALLPAPER_FPS, Math.round(fps)));
}

/** Source de la scène du fond d'écran, par ordre de priorité. */
export type WallpaperSource = 'fichier' | 'script' | 'sauvegarde' | 'defaut';

/** Candidat à la configuration : texte lu (ou `null` si absent) et sa source. */
export interface WallpaperCandidate {
  readonly source: Exclude<WallpaperSource, 'defaut'>;
  readonly text: string | null;
}

/** Résultat du choix : la source retenue, sa valeur relue, et les sources refusées. */
export type WallpaperChoice<T> =
  | {
      readonly source: Exclude<WallpaperSource, 'defaut'>;
      readonly value: T;
      readonly rejected: readonly string[];
    }
  | { readonly source: 'defaut'; readonly value: null; readonly rejected: readonly string[] };

/**
 * Choisit la configuration du fond d'écran : le premier candidat présent que `parse`
 * accepte, dans l'ordre donné (fichier, script, sauvegarde locale) ; sinon la scène par
 * défaut. Un candidat invalide est ignoré (repli) et noté dans `rejected` avec sa raison.
 */
export function chooseWallpaperConfig<T>(
  candidates: readonly WallpaperCandidate[],
  parse: (
    text: string,
  ) => { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string },
): WallpaperChoice<T> {
  const rejected: string[] = [];
  for (const { source, text } of candidates) {
    if (text === null) {
      continue;
    }
    const result = parse(text);
    if (result.ok) {
      return { source, value: result.value, rejected };
    }
    rejected.push(`${source} : ${result.error}`);
  }
  return { source: 'defaut', value: null, rejected };
}

/**
 * Limiteur d'images par seconde : `next` est l'instant (ms) à partir duquel la prochaine
 * image est due (`null` : la prochaine image est due tout de suite).
 */
export interface FrameLimiter {
  next: number | null;
}

/** Tolérance (ms) : une image arrivée un peu avant l'échéance est rendue quand même. */
const FRAME_TOLERANCE_MS = 1;

/**
 * Vrai si une image est due à l'instant `now` (ms) pour `fps` images par seconde ; dans ce
 * cas, l'échéance suivante est posée. L'échéance avance d'un intervalle à la fois, pour
 * tenir la cadence en moyenne sur un écran de fréquence quelconque ; après une longue
 * pause (page masquée), elle repart de `now` au lieu de rattraper. Sans allocation.
 */
export function frameDue(limiter: FrameLimiter, now: number, fps: number): boolean {
  const interval = 1000 / clampWallpaperFps(fps);
  if (limiter.next !== null && now < limiter.next - FRAME_TOLERANCE_MS) {
    return false;
  }
  const base = limiter.next === null || now - limiter.next > interval ? now : limiter.next;
  limiter.next = base + interval;
  return true;
}

/** Amplitude (rad) du balancement de la caméra autour du bac : ±0,6 rad (≈ 34°). */
export const WALLPAPER_ORBIT_AMPLITUDE = 0.6;
/** Période (s) d'un aller-retour complet de la caméra. */
export const WALLPAPER_ORBIT_PERIOD_SECONDS = 90;

/**
 * Angle (rad) de la caméra automatique après `seconds` secondes réelles : balancement
 * sinusoïdal lent autour de la vue trois-quarts (0 à t = 0), sans fin. Temps non fini ou
 * négatif : 0.
 */
export function wallpaperOrbitAngle(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return 0;
  }
  const phase = (seconds % WALLPAPER_ORBIT_PERIOD_SECONDS) / WALLPAPER_ORBIT_PERIOD_SECONDS;
  return WALLPAPER_ORBIT_AMPLITUDE * Math.sin(2 * Math.PI * phase);
}
