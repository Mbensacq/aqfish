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
 * chacun `espece:n` (n entier, 6 chiffres au plus, borné par l'application, #95). Exemple : `population=neon:12,guppy:2,corydora:0`. Entrées
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
 * Paramètre facultatif `eau=bonne|a-surveiller|mauvaise` (issue #207) : en mode capture, eau
 * d'exemple de ce niveau à t = 0 (`sampleWater`, nitrates élevés), qui trouble l'eau quand
 * elle est mauvaise. Le niveau n'est pas vérifié ici : l'application ignore une valeur
 * inconnue ; absent, eau saine (séries existantes inchangées).
 *
 * Paramètre facultatif `affames=1` (issue #208) : en mode capture, animaux affamés de longue
 * date à t = 0 (faim maximale, santé au plancher : nage ralentie, couleurs ternies). Toute
 * autre valeur ou absent : animaux nourris et en bonne santé (séries existantes inchangées).
 *
 * Paramètre facultatif `piece=1` (issue #187) : en mode capture, la pièce autour du bac
 * (sol, mur, meuble support) est affichée, dans le bac tropical seulement ; toute autre
 * valeur ou absent, pièce masquée (séries existantes inchangées).
 *
 * Paramètre facultatif `edition=<indice>` (issue #167) : en mode capture, montre le mode
 * édition du décor avec l'élément d'indice donné de `World.decor` sélectionné (entier de 0 à
 * 999) ; absent, invalide ou hors du décor, aucune sélection (séries existantes inchangées).
 *
 * Paramètre facultatif `edition-meuble=<indice>` (issue #188) : en mode capture, avec
 * `piece=1`, montre le mode édition avec l'élément d'indice donné de la pièce (`meubles=`)
 * sélectionné (entier de 0 à 999) ; absent, invalide ou hors de la pièce, aucune sélection.
 *
 * Paramètre facultatif `bois=` (issue #169) : en mode capture, bois flottés ajoutés au décor
 * par défaut de l'environnement, séparés par des virgules ; chacun `x:z:rotation:echelle:graine`
 * (mètres, radians, graine entière). Exemple : `bois=0.05:0.02:0.3:1:7`. Entrée mal formée
 * ignorée ici, bois invalide (hors du bac, échelle hors bornes) ignoré par l'application ;
 * absent, décor par défaut (séries existantes inchangées).
 *
 * Paramètre facultatif `bac=longueur:hauteur:profondeur` (issue #171) : en mode capture,
 * dimensions du bac en mètres (exemple : `bac=0.8:0.45:0.35`), bornées par l'application
 * (`TANK_LIMITS`) ; sans effet hors d'un environnement réglable. Entrée mal formée ou absente,
 * dimensions de l'environnement (séries existantes inchangées).
 *
 * Paramètre facultatif `meubles=` (issue #188) : en mode capture, avec `piece=1`, éléments
 * lâchés dans la pièce dans l'ordre de l'URL, séparés par des virgules ; chacun
 * `type:x:z:quart` (type du catalogue, centre en mètres, quart de tour de 0 à 3). Exemple :
 * `meubles=etagere:-1.2:-0.2:0,plante-pot:-1.2:-0.2:0` (la plante se pose sur l'étagère).
 * Entrée mal formée ignorée ici ; type inconnu ou pose refusée ignorés par l'application ;
 * absent, pièce nue (séries existantes inchangées).
 *
 * Paramètre facultatif `vitesse=` (issue #232) : hors capture, vitesse de la simulation au
 * démarrage, l'une de `SIM_SPEEDS` (`sim/sim-speed.ts`, vérifiée par l'application) ;
 * `vitesse=0` laisse le monde à l'arrêt dès t = 0, pour des captures d'interface
 * reproductibles à l'octet. Prime sur la vitesse de la sauvegarde. Sans effet en capture (le
 * monde y est déjà figé) ; absente ou invalide, vitesse habituelle.
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
  /** Vrai pour `piece=1` : pièce autour du bac affichée, en capture (issue #187). */
  readonly room: boolean;
  /** Niveau de l'eau d'exemple de `eau=` (issue #207), non vérifié ; `null` si absent. */
  readonly water: string | null;
  /** Vrai pour `affames=1` : animaux affamés de longue date à t = 0 (issue #208). */
  readonly starved: boolean;
  /** Élément du décor sélectionné par `edition=` (issue #167) ; `null` si absent ou invalide. */
  readonly editSelection: number | null;
  /** Élément de la pièce sélectionné par `edition-meuble=` (issue #188) ; `null` sinon. */
  readonly editRoomSelection: number | null;
  /** Bois flottés ajoutés au décor par `bois=` (issue #169), vide si absent. */
  readonly woods: readonly CaptureWood[];
  /** Dimensions du bac de `bac=` (issue #171), en mètres ; `null` si absent ou mal formé. */
  readonly tank: CaptureTank | null;
  /** Éléments lâchés dans la pièce par `meubles=` (issue #188), vide si absent. */
  readonly furniture: readonly CaptureFurniture[];
  /**
   * Vitesse de départ de `vitesse=` (issue #232), hors capture ; `null` si absente ou mal
   * formée. Non vérifiée ici (module sans dépendance à la simulation) : l'application ignore
   * une vitesse qui n'est pas l'une de `SIM_SPEEDS`.
   */
  readonly speed: number | null;
}

/**
 * Élément de la pièce du contrat de capture : type (non vérifié ici), centre (m) et quart de
 * tour (0 à 3).
 */
export interface CaptureFurniture {
  readonly kind: string;
  readonly x: number;
  readonly z: number;
  readonly quarter: 0 | 1 | 2 | 3;
}

/** Nombre maximal d'éléments lus dans `meubles=` (les suivants sont ignorés). */
export const MAX_CAPTURE_FURNITURE = 8;

/** Bois flotté du contrat de capture : position (m), rotation (rad), échelle, graine. */
export interface CaptureWood {
  readonly x: number;
  readonly z: number;
  readonly rotation: number;
  readonly scale: number;
  readonly seed: number;
}

/** Dimensions du bac lues dans `bac=` (mètres, non bornées ici). */
export interface CaptureTank {
  readonly width: number;
  readonly height: number;
  readonly depth: number;
}

/** Nombre maximal de bois lus dans `bois=` (les suivants sont ignorés). */
export const MAX_CAPTURE_WOODS = 4;

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
  room: false,
  water: null,
  starved: false,
  editSelection: null,
  editRoomSelection: null,
  woods: [],
  furniture: [],
  tank: null,
  speed: null,
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
    room: params.get('piece') === '1',
    water: params.get('eau'),
    starved: params.get('affames') === '1',
    editSelection: parseEditSelection(params.get('edition')),
    editRoomSelection: parseEditSelection(params.get('edition-meuble')),
    woods: parseWoods(params.get('bois')),
    tank: parseTank(params.get('bac')),
    furniture: parseFurniture(params.get('meubles')),
    speed: parseSpeed(params.get('vitesse')),
  };
}

/** Vitesse `vitesse=` : réel positif ou nul à un chiffre avant la virgule (`0`, `0.5`, `4`). */
const SPEED_PATTERN = /^\d(\.\d{1,3})?$/;

function parseSpeed(raw: string | null): number | null {
  return raw !== null && SPEED_PATTERN.test(raw) ? Number(raw) : null;
}

/** Graine décimale : entier de 1 à 10 chiffres (bornes vérifiées par l'application). */
const SEED_PATTERN = /^\d{1,10}$/;

/**
 * Bois `x:z:rotation:echelle:graine` séparés par des virgules : quatre réels décimaux puis
 * une graine entière. Entrée mal formée : ignorée.
 */
function parseWoods(raw: string | null): readonly CaptureWood[] {
  if (raw === null) {
    return [];
  }
  const woods: CaptureWood[] = [];
  for (const entry of raw.split(',')) {
    const parts = entry.split(':');
    if (
      parts.length !== 5 ||
      !parts.slice(0, 4).every((p) => DECIMAL_PATTERN.test(p)) ||
      !SEED_PATTERN.test(parts[4])
    ) {
      continue;
    }
    const [x, z, rotation, scale, seed] = parts.map(Number);
    woods.push({ x, z, rotation, scale, seed });
    if (woods.length === MAX_CAPTURE_WOODS) {
      break;
    }
  }
  return woods;
}

/** Type d'élément de `meubles=` : minuscules et tirets (vérifié par l'application). */
const FURNITURE_KIND_PATTERN = /^[a-z][a-z-]{0,31}$/;

/**
 * Éléments `type:x:z:quart` séparés par des virgules : un type, deux réels décimaux puis un
 * quart de tour de 0 à 3. Entrée mal formée : ignorée.
 */
function parseFurniture(raw: string | null): readonly CaptureFurniture[] {
  if (raw === null) {
    return [];
  }
  const furniture: CaptureFurniture[] = [];
  for (const entry of raw.split(',')) {
    const parts = entry.split(':');
    if (
      parts.length !== 4 ||
      !FURNITURE_KIND_PATTERN.test(parts[0]) ||
      !DECIMAL_PATTERN.test(parts[1]) ||
      !DECIMAL_PATTERN.test(parts[2]) ||
      !/^[0-3]$/.test(parts[3])
    ) {
      continue;
    }
    furniture.push({
      kind: parts[0],
      x: Number(parts[1]),
      z: Number(parts[2]),
      quarter: Number(parts[3]) as CaptureFurniture['quarter'],
    });
    if (furniture.length === MAX_CAPTURE_FURNITURE) {
      break;
    }
  }
  return furniture;
}

/** Dimensions `longueur:hauteur:profondeur` : trois réels décimaux positifs, sinon `null`. */
function parseTank(raw: string | null): CaptureTank | null {
  const parts = raw?.split(':') ?? [];
  if (parts.length !== 3 || !parts.every((p) => /^\d+(\.\d+)?$/.test(p))) {
    return null;
  }
  const [width, height, depth] = parts.map(Number);
  return { width, height, depth };
}

/** Indice de `edition=` ou `edition-meuble=` : entier décimal de 0 à 999, sinon `null`. */
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

/**
 * Entrée `espece:n` : identifiant en minuscules, effectif entier de 1 à 6 chiffres ; un
 * effectif trop grand est borné par l'application (`applySpeciesCountsInPlace`), pas ignoré (#95).
 */
const POPULATION_PATTERN = /^([a-z]+):(\d{1,6})$/;

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
