import { clampIntensity, mix, type MutableDayLight } from './daylight';

/**
 * Cycle lunaire et nuits du récif (issue #856, ADR 0189) : une phase de lune, fonction pure
 * du jour de jeu, éclaircit ou assombrit légèrement la nuit.
 *
 * Module pur et déterministe, sans hasard ni allocation. Le jour de jeu se compte en
 * journées simulées depuis le temps 0 du monde (`World.time`), jamais à l'horloge murale.
 * La lune n'agit que la nuit : sa clarté (`moonShadeAt`) vaut **exactement** 1 en plein jour,
 * donc les images de jour restent identiques à l'octet. Valeurs : **approximations de jeu**.
 */

/** Durée d'un cycle lunaire, en jours de jeu (lunaison moyenne arrondie). */
export const LUNAR_CYCLE_DAYS = 29.5;

/**
 * Phase au jour de jeu 0 : la pleine lune (0,5). Le monde neuf commence donc sous la lune la
 * plus claire, qui est la nuit d'avant le cycle lunaire : captures de nuit existantes inchangées.
 */
export const LUNAR_PHASE_AT_START = 0.5;

/**
 * Clarté de la nuit sans lune, en facteur de la nuit de pleine lune : à la nouvelle lune, la
 * lumière ambiante, l'eau et le décor gardent 72 % de leur clarté de pleine lune.
 */
export const NEW_MOON_GLOW = 0.72;

/** Pas d'arrondi de la clarté : un écart plus petit ne se voit pas après la passe palette. */
export const MOON_GLOW_STEP = 0.01;

/**
 * Part de la variation lunaire gardée avec « Réduire les mouvements » : un minimum, pour que
 * la nuit change à peine d'un jour à l'autre.
 */
export const REDUCED_MOON_AMPLITUDE = 0.2;

/**
 * Jour de jeu (réel, non arrondi) au temps simulé `time` : `time / dayLengthSeconds`.
 * @throws RangeError si `time` n'est pas un réel fini positif ou nul, ou si la durée du jour
 * n'est pas un réel fini strictement positif.
 */
export function gameDayAt(time: number, dayLengthSeconds: number): number {
  if (!Number.isFinite(time) || time < 0) {
    throw new RangeError(`time doit être un réel positif ou nul (reçu : ${time})`);
  }
  if (!(dayLengthSeconds > 0) || !Number.isFinite(dayLengthSeconds)) {
    throw new RangeError(
      `dayLengthSeconds doit être un réel strictement positif (reçu : ${dayLengthSeconds})`,
    );
  }
  return time / dayLengthSeconds;
}

/**
 * Phase de la lune au jour de jeu `gameDay`, dans [0, 1) : 0 à la nouvelle lune, 0,5 à la
 * pleine lune. Continue et périodique de période `LUNAR_CYCLE_DAYS`.
 * @throws RangeError si `gameDay` n'est pas un réel fini positif ou nul.
 */
export function lunarPhase(gameDay: number): number {
  if (!Number.isFinite(gameDay) || gameDay < 0) {
    throw new RangeError(`jour de jeu positif ou nul attendu (reçu : ${gameDay})`);
  }
  return wrapPhase(LUNAR_PHASE_AT_START + gameDay / LUNAR_CYCLE_DAYS);
}

/**
 * Part éclairée du disque pour la phase `phase` (toute valeur finie, ramenée dans [0, 1)) :
 * `(1 − cos 2πφ) / 2`, 0 à la nouvelle lune, 1 à la pleine lune.
 * @throws RangeError si `phase` n'est pas un réel fini.
 */
export function moonIllumination(phase: number): number {
  return (1 - Math.cos(2 * Math.PI * wrapPhase(phase))) / 2;
}

/**
 * Clarté de la nuit pour la phase `phase`, en facteur de la nuit de pleine lune, arrondie à
 * `MOON_GLOW_STEP` : 1 à la pleine lune, `NEW_MOON_GLOW` à la nouvelle lune pour une
 * amplitude 1. L'amplitude (ramenée dans [0, 1], non finie : 0) règle la part de la variation
 * gardée : 0, option « lune » coupée (toujours 1), `REDUCED_MOON_AMPLITUDE` avec « Réduire les
 * mouvements ».
 * @throws RangeError si `phase` n'est pas un réel fini.
 */
export function moonGlow(phase: number, amplitude: number): number {
  const a = Number.isFinite(amplitude) ? Math.min(1, Math.max(0, amplitude)) : 0;
  const darkness = (1 - NEW_MOON_GLOW) * a * (1 - moonIllumination(phase));
  const steps = Math.round(1 / MOON_GLOW_STEP);
  return Math.round((1 - darkness) * steps) / steps;
}

/**
 * Clarté appliquée à la scène pour la clarté de nuit `glow` et l'intensité du jour
 * `intensity` : `glow` en pleine nuit, **exactement** 1 en plein jour (intensité 1), fondu
 * entre les deux. Une intensité non finie compte comme le plein jour ; un `glow` hors de
 * ]0, 1] compte comme 1 (aucun effet).
 */
export function moonShadeAt(glow: number, intensity: number): number {
  const g = glow > 0 && glow <= 1 ? glow : 1;
  return mix(g, 1, clampIntensity(intensity));
}

/**
 * Pose la clarté lunaire de la clarté de nuit `glow` sur la lumière `light`, **en la
 * modifiant** (`light.moon = moonShadeAt(glow, light.intensity)`) et la renvoie. À appeler
 * après la lampe (`withLampInto`) : une lampe allumée relève l'intensité, donc efface la lune.
 */
export function withMoonInto(light: MutableDayLight, glow: number): MutableDayLight {
  light.moon = moonShadeAt(glow, light.intensity);
  return light;
}

/** Phase ramenée dans [0, 1). */
function wrapPhase(phase: number): number {
  if (!Number.isFinite(phase)) {
    throw new RangeError(`phase de lune invalide (reçu : ${phase})`);
  }
  const p = phase % 1;
  const wrapped = p < 0 ? p + 1 : p + 0;
  return wrapped >= 1 ? 0 : wrapped;
}
