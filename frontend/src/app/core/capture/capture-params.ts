/**
 * Contrat de capture : paramètres d'URL lus par l'application pour produire
 * une image reproductible (utilisé par le harnais Playwright `e2e/captures.spec.ts`).
 *
 * Exemple : /?capture=1&seed=42&camera=top&time=30
 *
 * Ce module est volontairement pur (aucune dépendance à Angular ni à Three.js).
 * Voir docs/ARCHITECTURE.md, section « Contrat de capture ».
 */

export const CAMERA_PRESETS = ['top', 'bottom', 'front', 'side', 'three-quarter'] as const;

export type CameraPreset = (typeof CAMERA_PRESETS)[number];

export interface CaptureParams {
  /** true quand l'URL contient capture=1 : simulation figée, interface masquée. */
  readonly capture: boolean;
  /** Graine du générateur pseudo-aléatoire de la simulation. */
  readonly seed: number;
  /** Angle de caméra prédéfini. */
  readonly camera: CameraPreset;
  /** Temps de simulation (en secondes) à atteindre avant de figer l'image. */
  readonly time: number;
}

export const DEFAULT_CAPTURE_PARAMS: CaptureParams = {
  capture: false,
  seed: 42,
  camera: 'three-quarter',
  time: 0,
};

/** Temps de simulation maximal accepté (1 h), pour éviter un calcul démesuré. */
export const MAX_CAPTURE_TIME_SECONDS = 3600;

/**
 * Lit les paramètres de capture depuis une chaîne de requête (`location.search`).
 * Toute valeur absente ou invalide est remplacée par la valeur par défaut.
 */
export function parseCaptureParams(search: string): CaptureParams {
  const params = new URLSearchParams(search);

  return {
    capture: params.get('capture') === '1',
    seed: parseSeed(params.get('seed')),
    camera: parseCamera(params.get('camera')),
    time: parseTime(params.get('time')),
  };
}

function parseSeed(raw: string | null): number {
  if (raw === null || !/^\d+$/.test(raw)) {
    return DEFAULT_CAPTURE_PARAMS.seed;
  }
  const value = Number(raw);
  // Graine sur 32 bits non signés, compatible avec les PRNG usuels (mulberry32, etc.).
  return Number.isSafeInteger(value) && value <= 0xffffffff ? value : DEFAULT_CAPTURE_PARAMS.seed;
}

function parseCamera(raw: string | null): CameraPreset {
  return CAMERA_PRESETS.find((preset) => preset === raw) ?? DEFAULT_CAPTURE_PARAMS.camera;
}

function parseTime(raw: string | null): number {
  if (raw === null || raw.trim() === '') {
    return DEFAULT_CAPTURE_PARAMS.time;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    return DEFAULT_CAPTURE_PARAMS.time;
  }
  return Math.min(value, MAX_CAPTURE_TIME_SECONDS);
}
