/**
 * Contrat de capture : paramètres d'URL lus par l'application pour produire
 * une image reproductible (utilisé par le harnais Playwright `e2e/captures.spec.ts`).
 *
 * Exemple : /?capture=1&seed=42&camera=top&time=30
 *
 * Paramètre facultatif `filtre=pixel|aucun` (issue #33) : force le filtre de rendu ; absent,
 * l'image est en pixel art (séries de captures existantes inchangées).
 *
 * Paramètre facultatif `heure=` (issue #51, ADR 0018) : fige l'heure de la journée simulée,
 * réel dans [0, 24) (`heure=0` : minuit, `heure=18.5` : 18 h 30) ; valeur invalide ignorée.
 * Absent en capture : midi (séries de captures existantes inchangées).
 *
 * Paramètre facultatif `nourrir=` (issue #67) : dépôts de nourriture, en mode capture
 * seulement, séparés par des virgules ; chacun `t` (centre du bac) ou `t:x:z` (temps simulé
 * en secondes, position en mètres dans le repère du bac). Exemple : `nourrir=10,25:0.2:0.05`.
 * Les entrées invalides sont ignorées ; absent, aucun dépôt (séries existantes inchangées).
 *
 * Ce module est volontairement pur (aucune dépendance à Angular ni à Three.js).
 * Voir docs/ARCHITECTURE.md, section « Contrat de capture ».
 */

import { isRenderFilter, type RenderFilter } from '../render-filter/render-filter';

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
  /** Filtre de rendu forcé par `filtre=` ; `null` si absent ou invalide (choix par défaut). */
  readonly filter: RenderFilter | null;
  /** Heure figée par `heure=`, dans [0, 24) ; `null` si absente ou invalide. */
  readonly hour: number | null;
  /** Dépôts de nourriture demandés par `nourrir=` (vide si absent). */
  readonly feedings: readonly CaptureFeeding[];
}

/** Dépôt de nourriture du contrat de capture : temps simulé (s) et position (m). */
export interface CaptureFeeding {
  readonly time: number;
  readonly x: number;
  readonly z: number;
}

/** Nombre maximal de dépôts lus dans `nourrir=` (les suivants sont ignorés). */
export const MAX_CAPTURE_FEEDINGS = 20;

export const DEFAULT_CAPTURE_PARAMS: CaptureParams = {
  capture: false,
  seed: 42,
  camera: 'three-quarter',
  time: 0,
  filter: null,
  hour: null,
  feedings: [],
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
    filter: parseFilter(params.get('filtre')),
    hour: parseHour(params.get('heure')),
    feedings: parseFeedings(params.get('nourrir')),
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

function parseFilter(raw: string | null): RenderFilter | null {
  return isRenderFilter(raw) ? raw : null;
}

/** Heure décimale : chiffres, point décimal facultatif (ni signe, ni exposant, ni espace). */
const HOUR_PATTERN = /^\d{1,2}(\.\d+)?$/;

function parseHour(raw: string | null): number | null {
  if (raw === null || !HOUR_PATTERN.test(raw)) {
    return null;
  }
  const value = Number(raw);
  return value < 24 ? value : null;
}

/** Réel décimal signé, sans exposant ni espace. */
const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;

/**
 * Dépôts `t` ou `t:x:z` séparés par des virgules. Temps : réel positif ou nul, au plus
 * `MAX_CAPTURE_TIME_SECONDS` ; position : réels (un point hors du bac est ignoré par la
 * simulation). Entrée invalide : ignorée.
 */
function parseFeedings(raw: string | null): readonly CaptureFeeding[] {
  if (raw === null) {
    return [];
  }
  const feedings: CaptureFeeding[] = [];
  for (const entry of raw.split(',')) {
    const parts = entry.split(':');
    if (
      (parts.length !== 1 && parts.length !== 3) ||
      !parts.every((p) => DECIMAL_PATTERN.test(p))
    ) {
      continue;
    }
    const [time, x, z] = [...parts.map(Number), 0, 0];
    if (time < 0 || time > MAX_CAPTURE_TIME_SECONDS) {
      continue;
    }
    feedings.push({ time, x, z });
    if (feedings.length === MAX_CAPTURE_FEEDINGS) {
      break;
    }
  }
  return feedings;
}
