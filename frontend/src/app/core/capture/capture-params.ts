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
 * Paramètre facultatif `population=` (issue #69) : effectifs par espèce, appliqués à t = 0
 * dans l'ordre donné (`sim/population.ts`, bornes comprises), séparés par des virgules ;
 * chacun `espece:n` (n entier). Exemple : `population=neon:12,guppy:2,corydora:0`. Entrées
 * mal formées ignorées ici, espèces inconnues ignorées par l'application ; absent, population
 * par défaut (séries existantes inchangées).
 *
 * Paramètre facultatif `environnement=` (issue #87, ADR 0026) : identifiant de
 * l'environnement (`tropical`, `bassin`) ; inconnu ou absent, le bac tropical (séries
 * existantes inchangées). Sans `camera=`, la vue est celle de l'environnement (de dessus pour
 * le bassin).
 *
 * Paramètre facultatif `granules=points|voxels` (issue #117) : rendu des granulés de
 * nourriture, en mode capture seulement ; absent ou invalide, en points (séries existantes
 * inchangées).
 *
 * Paramètre facultatif `pluie=1` (issue #106) : fait pleuvoir dans le bassin, en capture
 * comme hors capture (sans effet dans un environnement sans pluie) ; toute autre valeur ou
 * absent, pas de pluie (séries existantes inchangées).
 *
 * Paramètre facultatif `edition=<indice>` (issue #167) : en mode capture, montre le mode
 * édition du décor avec l'élément d'indice donné de `World.decor` sélectionné (entier de 0 à
 * 999) ; absent, invalide ou hors du décor, aucune sélection (séries existantes inchangées).
 *
 * Ce module est volontairement pur (aucune dépendance à Angular ni à Three.js).
 * Voir docs/ARCHITECTURE.md, section « Contrat de capture ».
 */

import { isFoodStyle, type FoodStyle } from '../food-style/food-style';
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
  /** Vrai si `camera=` est présent et valide (sinon, la vue par défaut de l'environnement). */
  readonly cameraGiven: boolean;
  /**
   * Identifiant d'environnement demandé par `environnement=` (minuscules), `null` si absent
   * ou mal formé. Non vérifié ici : l'application ignore un environnement inconnu.
   */
  readonly environment: string | null;
  /** Temps de simulation (en secondes) à atteindre avant de figer l'image. */
  readonly time: number;
  /** Filtre de rendu forcé par `filtre=` ; `null` si absent ou invalide (choix par défaut). */
  readonly filter: RenderFilter | null;
  /** Heure figée par `heure=`, dans [0, 24) ; `null` si absente ou invalide. */
  readonly hour: number | null;
  /** Dépôts de nourriture demandés par `nourrir=` (vide si absent). */
  readonly feedings: readonly CaptureFeeding[];
  /** Effectifs demandés par `population=`, dans l'ordre de l'URL (vide si absent). */
  readonly population: readonly CapturePopulation[];
  /** Rendu des granulés forcé par `granules=` ; `null` si absent ou invalide. */
  readonly foodStyle: FoodStyle | null;
  /** Vrai pour `pluie=1` : il pleut dès le départ (issue #106). */
  readonly rain: boolean;
  /** Élément du décor sélectionné par `edition=` (issue #167) ; `null` si absent ou invalide. */
  readonly editSelection: number | null;
}

/**
 * Effectif d'une espèce demandé par `population=`. L'espèce n'est pas vérifiée ici (module
 * sans dépendance à la simulation) : l'application ignore une espèce inconnue.
 */
export interface CapturePopulation {
  readonly species: string;
  readonly count: number;
}

/** Nombre maximal d'entrées lues dans `population=` (les suivantes sont ignorées). */
export const MAX_CAPTURE_POPULATION_ENTRIES = 10;

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
  cameraGiven: false,
  environment: null,
  time: 0,
  filter: null,
  hour: null,
  feedings: [],
  population: [],
  foodStyle: null,
  rain: false,
  editSelection: null,
};

/** Temps de simulation maximal accepté (1 h), pour éviter un calcul démesuré. */
export const MAX_CAPTURE_TIME_SECONDS = 3600;

/**
 * Paramètres d'URL qui décrivent le monde : `seed`, `environnement` et `population`. Hors
 * capture, s'il y en a un, l'URL prime sur la sauvegarde automatique (issue #70) : le monde
 * demandé est créé neuf, sans relire le stockage.
 */
export const WORLD_PARAMS = ['seed', 'environnement', 'population'] as const;

/** Vrai si l'URL donne au moins un paramètre de `WORLD_PARAMS` (même invalide). */
export function hasWorldParams(search: string): boolean {
  const params = new URLSearchParams(search);
  return WORLD_PARAMS.some((name) => params.has(name));
}

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
    cameraGiven: CAMERA_PRESETS.some((preset) => preset === params.get('camera')),
    environment: parseEnvironment(params.get('environnement')),
    time: parseTime(params.get('time')),
    filter: parseFilter(params.get('filtre')),
    hour: parseHour(params.get('heure')),
    feedings: parseFeedings(params.get('nourrir')),
    population: parsePopulation(params.get('population')),
    foodStyle: parseFoodStyle(params.get('granules')),
    rain: params.get('pluie') === '1',
    editSelection: parseEditSelection(params.get('edition')),
  };
}

/** Indice de `edition=` : entier décimal de 0 à 999, sinon `null`. */
function parseEditSelection(raw: string | null): number | null {
  return raw !== null && /^\d{1,3}$/.test(raw) ? Number(raw) : null;
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

/** Identifiant d'environnement : lettres minuscules, 1 à 20. */
const ENVIRONMENT_PATTERN = /^[a-z]{1,20}$/;

function parseEnvironment(raw: string | null): string | null {
  return raw !== null && ENVIRONMENT_PATTERN.test(raw) ? raw : null;
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

function parseFoodStyle(raw: string | null): FoodStyle | null {
  return isFoodStyle(raw) ? raw : null;
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

/** Entrée `espece:n` : identifiant en minuscules, effectif entier de 1 à 3 chiffres. */
const POPULATION_PATTERN = /^([a-z]+):(\d{1,3})$/;

/** Effectifs `espece:n` séparés par des virgules ; entrée mal formée : ignorée. */
function parsePopulation(raw: string | null): readonly CapturePopulation[] {
  if (raw === null) {
    return [];
  }
  const entries: CapturePopulation[] = [];
  for (const entry of raw.split(',')) {
    const match = POPULATION_PATTERN.exec(entry);
    if (match === null) {
      continue;
    }
    entries.push({ species: match[1], count: Number(match[2]) });
    if (entries.length === MAX_CAPTURE_POPULATION_ENTRIES) {
      break;
    }
  }
  return entries;
}
