/**
 * Sons d'ambiance optionnels (#411, ADR 0100) : logique pure du fond sonore synthétisé.
 *
 * - Choix mémorisé (case « Sons d'ambiance » et volume) à part de la sauvegarde du monde,
 *   comme `aqfish.mouvements-reduits` (ADR 0098) : lecture et écriture tolérantes.
 * - Table « contexte de la scène → niveau de chaque couche » (eau, bulles, pluie) et rythme
 *   des bulles, tirés d'un générateur à graine propre au son.
 *
 * Le son ne lit ni n'écrit jamais le monde et n'utilise pas le hasard de la simulation : un
 * monde avance exactement de la même façon avec ou sans lui. Module pur (ni Angular, ni
 * Three.js, ni Web Audio) ; rien n'est importé de `sim/` (l'environnement et le moment de la
 * journée arrivent sous forme de chaînes, une valeur inconnue prend le défaut).
 */

import { createPrng, type Prng } from '../random/prng';

/** Clé du choix mémorisé dans le stockage du navigateur. */
export const AMBIENT_SOUND_STORAGE_KEY = 'aqfish.sons';

/** Volume par défaut (30 %). */
export const DEFAULT_AMBIENT_VOLUME = 0.3;

/**
 * Graine du hasard du son (bruit et rythme des bulles), fixe et sans lien avec la graine du
 * monde : deux sessions sonnent pareil, et la simulation n'en tire jamais rien.
 */
export const AMBIENT_SOUND_SEED = 0x50f7a9;

/** Choix fait dans les réglages. */
export interface AmbientSoundChoice {
  /** Fond sonore activé. */
  readonly enabled: boolean;
  /** Volume général dans [0, 1]. */
  readonly volume: number;
}

/** Sous-ensemble de `Storage` utilisé ici (remplaçable par un double dans les tests). */
export interface AmbientSoundStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Valeur mémorisée : `actif:30` ou `muet:30` (volume en pour cent, entier de 0 à 100). */
const STORED_PATTERN = /^(actif|muet):(\d{1,3})$/;

/** Ramène un volume à [0, 1] ; une valeur qui n'est pas un réel fini prend le défaut. */
export function clampVolume(volume: unknown): number {
  if (typeof volume !== 'number' || !Number.isFinite(volume)) {
    return DEFAULT_AMBIENT_VOLUME;
  }
  return Math.min(1, Math.max(0, volume));
}

/**
 * Choix mémorisé, ou `null` sans choix : clé absente, valeur inconnue (volume hors de 0 à 100
 * compris) ou stockage indisponible (absent ou levant une exception).
 */
export function readStoredAmbientSound(
  storage: AmbientSoundStorage | null,
): AmbientSoundChoice | null {
  if (!storage) {
    return null;
  }
  let value: string | null;
  try {
    value = storage.getItem(AMBIENT_SOUND_STORAGE_KEY);
  } catch {
    return null;
  }
  const match = value === null ? null : STORED_PATTERN.exec(value);
  if (!match) {
    return null;
  }
  const percent = Number(match[2]);
  if (percent > 100) {
    return null;
  }
  return { enabled: match[1] === 'actif', volume: percent / 100 };
}

/**
 * Mémorise le choix (volume arrondi au pour cent). Renvoie `false` si le stockage est
 * indisponible ou refuse l'écriture : le choix vaut alors pour la session.
 */
export function writeStoredAmbientSound(
  storage: AmbientSoundStorage | null,
  choice: AmbientSoundChoice,
): boolean {
  if (!storage) {
    return false;
  }
  const percent = Math.round(clampVolume(choice.volume) * 100);
  try {
    storage.setItem(AMBIENT_SOUND_STORAGE_KEY, `${choice.enabled ? 'actif' : 'muet'}:${percent}`);
    return true;
  } catch {
    return false;
  }
}

/** Contexte de la scène lu par le fond sonore. */
export interface AmbientScene {
  /** Identifiant d'environnement (`tropical`, `bassin`…) ; inconnu : défaut sous l'eau. */
  readonly environment: string;
  /** Moment de la journée (`jour`, `aube`, `crepuscule`, `nuit`) ; inconnu : jour. */
  readonly phase: string;
  /** Pluie active. */
  readonly rain: boolean;
  /** Un bulleur (diffuseur) est présent dans le décor. */
  readonly bubbler: boolean;
  /** Son coupé : onglet masqué, simulation en pause ou aucun aquarium affiché. */
  readonly silenced: boolean;
}

/** Niveaux de chaque couche, déjà multipliés par le volume et le facteur de nuit. */
export interface AmbientLevels {
  /** Gain du bruit grave et lent « sous l'eau » (filtration). */
  readonly water: number;
  /** Gain de chaque « blop ». */
  readonly bubbles: number;
  /** Nombre moyen de bulles par seconde (0 : aucune). */
  readonly bubbleRate: number;
  /** Gain du bruit de pluie. */
  readonly rain: number;
}

/** Silence complet. */
export const SILENT_LEVELS: AmbientLevels = Object.freeze({
  water: 0,
  bubbles: 0,
  bubbleRate: 0,
  rain: 0,
});

/** Niveaux d'un environnement à volume 1, de jour, sans pluie (valeurs de jeu, ADR 0100). */
interface EnvironmentSound {
  readonly water: number;
  /** Gain et rythme des bulles sans bulleur (rares bulles des plantes et du sol). */
  readonly bubbles: number;
  readonly bubbleRate: number;
}

/** Défaut, pour un environnement inconnu : bac d'intérieur, filtration audible. */
const DEFAULT_ENVIRONMENT_SOUND: EnvironmentSound = Object.freeze({
  water: 0.35,
  bubbles: 0.25,
  bubbleRate: 0.3,
});

/**
 * Valeurs de jeu par environnement : le bassin extérieur n'a pas de filtration bruyante, le
 * paludarium (peu d'eau) est plus feutré, le récif brassé plus présent.
 */
export const ENVIRONMENT_SOUNDS: Readonly<Record<string, EnvironmentSound>> = Object.freeze({
  tropical: DEFAULT_ENVIRONMENT_SOUND,
  bassin: Object.freeze({ water: 0.2, bubbles: 0.2, bubbleRate: 0.2 }),
  paludarium: Object.freeze({ water: 0.25, bubbles: 0.2, bubbleRate: 0.2 }),
  recif: Object.freeze({ water: 0.45, bubbles: 0.25, bubbleRate: 0.3 }),
  eaufroide: DEFAULT_ENVIRONMENT_SOUND,
});

/** Bulles avec un bulleur : plus nombreuses et un peu plus fortes. */
export const BUBBLER_SOUND = Object.freeze({ bubbles: 0.4, bubbleRate: 2.5 });

/** Gain de la pluie active (à volume 1, de jour). */
export const RAIN_LEVEL = 0.6;

/** Facteur général de nuit : le niveau est réduit de moitié. */
export const NIGHT_FACTOR = 0.5;

/** Facteur général d'un moment de la journée : nuit 0,5, tout le reste 1. */
export function phaseFactor(phase: string): number {
  return phase === 'nuit' ? NIGHT_FACTOR : 1;
}

/** Niveaux de chaque couche pour une scène et un volume (voir `AmbientLevels`). */
export function ambientLevels(scene: AmbientScene, volume: unknown): AmbientLevels {
  const gain = clampVolume(volume) * phaseFactor(scene.phase);
  if (scene.silenced || gain === 0) {
    return SILENT_LEVELS;
  }
  const base = Object.hasOwn(ENVIRONMENT_SOUNDS, scene.environment)
    ? ENVIRONMENT_SOUNDS[scene.environment]
    : DEFAULT_ENVIRONMENT_SOUND;
  const bubbles = scene.bubbler ? BUBBLER_SOUND : base;
  return {
    water: base.water * gain,
    bubbles: bubbles.bubbles * gain,
    bubbleRate: bubbles.bubbleRate,
    rain: scene.rain ? RAIN_LEVEL * gain : 0,
  };
}

/**
 * Profondeur du lent va-et-vient de la filtration (LFO), en part du niveau « eau » : la couche
 * oscille entre `water × (1 − 0,35)` et `water × (1 + 0,35)`.
 */
export const WATER_LFO_DEPTH = 0.35;

/** Crête maximale de la somme des couches avant le limiteur (pleine échelle : 1). */
export const MAX_PEAK = 1;

/**
 * Crête de la somme des couches pour des niveaux donnés : eau au sommet du LFO, plus un
 * « blop » à son maximum (enveloppe à 1 ; deux bulles ne se chevauchent jamais, voir
 * `MIN_BUBBLE_DELAY`), plus la pluie. Les bruits filtrés sont comptés à leur amplitude
 * nominale : le limiteur du moteur rattrape le reste.
 */
export function peakLevel(levels: AmbientLevels): number {
  return levels.water * (1 + WATER_LFO_DEPTH) + levels.bubbles + levels.rain;
}

/**
 * Marge de niveau (#413) : si la crête de la somme des couches dépasse `MAX_PEAK` (volume
 * fort, pluie et bulleur ensemble), toutes les couches sont réduites dans la même proportion
 * pour la ramener à `MAX_PEAK` ; le mélange (rapport entre couches) est conservé. Sinon,
 * niveaux rendus tels quels (même objet). Le rythme des bulles n'est jamais touché.
 */
export function limitPeak(levels: AmbientLevels): AmbientLevels {
  const peak = peakLevel(levels);
  if (!(peak > MAX_PEAK)) {
    return levels;
  }
  const scale = MAX_PEAK / peak;
  return {
    water: levels.water * scale,
    bubbles: levels.bubbles * scale,
    bubbleRate: levels.bubbleRate,
    rain: levels.rain * scale,
  };
}

/** Délai minimal entre deux bulles (s) : deux « blop » ne se chevauchent pas. */
export const MIN_BUBBLE_DELAY = 0.12;

/** Délai d'attente quand il n'y a pas de bulle (s) : le rythme est relu ensuite. */
export const IDLE_BUBBLE_DELAY = 1;

/**
 * Délai avant la prochaine bulle (s), loi exponentielle de moyenne `1 / rate` (bulles
 * irrégulières), au moins `MIN_BUBBLE_DELAY`. Rythme nul, négatif ou non fini :
 * `IDLE_BUBBLE_DELAY`.
 */
export function nextBubbleDelay(prng: Prng, rate: number): number {
  if (!Number.isFinite(rate) || rate <= 0) {
    return IDLE_BUBBLE_DELAY;
  }
  const u = prng.next();
  return Math.max(MIN_BUBBLE_DELAY, -Math.log(1 - u) / rate);
}

/** Hauteur d'un « blop » : fréquence de départ (Hz), tirée dans [320, 720). */
export function bubblePitch(prng: Prng): number {
  return 320 + prng.next() * 400;
}

/** Générateur du son, à graine fixe (`AMBIENT_SOUND_SEED`). */
export function createAmbientPrng(): Prng {
  return createPrng(AMBIENT_SOUND_SEED);
}

/**
 * Remplit `out` d'un bruit blanc dans [-1, 1) tiré du générateur du son : même graine,
 * même bruit.
 */
export function fillNoise(out: Float32Array, prng: Prng): void {
  for (let i = 0; i < out.length; i++) {
    out[i] = prng.next() * 2 - 1;
  }
}
