import { lightingOf } from './algae';
import { HOURS_PER_DAY, formatHour, mix, normalizeHour, type MutableDayLight } from './daylight';

/**
 * Lampe du bac (issue #584, ADR 0133) : une lampe allumée chaque jour à une heure réglée,
 * pendant la durée d'éclairage du bac (`WaterState.lighting`, `sim/algae.ts`), avec un fondu
 * à l'allumage et à l'extinction. Fonctions pures et déterministes : l'heure vient de
 * l'horloge de journée (`sim/daylight.ts`, temps simulé), jamais de l'horloge murale.
 *
 * La lampe s'ajoute à la lumière du jour sans jamais l'assombrir (`withLampInto`) : à midi
 * (plein jour) comme lampe éteinte, la lumière est exactement celle d'avant, donc les captures
 * par défaut ne changent pas.
 *
 * Valeurs : **approximations de jeu** (`docs/SOINS.md` § 12). Les 8 à 10 h conseillées sont un
 * ordre de grandeur courant de l'aquariophilie, non vérifié dans une source primaire.
 */

/** Durée d'éclairage la plus courte proposée par le réglage, en heures par jour. */
export const LAMP_MIN_HOURS = 4;
/** Durée d'éclairage la plus longue proposée par le réglage, en heures par jour. */
export const LAMP_MAX_HOURS = 14;
/** Durée conseillée par le tableau de bord, en heures par jour (approximation de jeu). */
export const LAMP_ADVISED_MIN_HOURS = 8;
export const LAMP_ADVISED_MAX_HOURS = 10;

/** Heure d'allumage par défaut : 10 h (lampe allumée de 10 h à 18 h, midi compris). */
export const DEFAULT_LAMP_ON_HOUR = 10;

/** Durée du fondu à l'allumage, comme à l'extinction, en heures de jeu (une demi-heure). */
export const LAMP_FADE_HOURS = 0.5;

/** Ce que la lampe lit et écrit dans l'eau. */
export interface LampWater {
  lighting?: number;
  lampOn?: number;
}

/**
 * Intensité de la lampe, dans [0, 1], à l'heure `hour` (toute valeur finie, ramenée modulo
 * 24), pour une lampe allumée à `onHour` pendant `duration` heures : fondu linéaire de
 * `fade` heures à l'allumage et à l'extinction, compris dans la durée (raccourci à la moitié
 * de la durée au besoin). L'éclairage peut passer minuit (allumage à 20 h, 8 h : jusqu'à 4 h).
 * Durée nulle, négative ou non finie : lampe éteinte ; 24 h ou plus : toujours allumée.
 * `fade` nul (« Réduire les mouvements ») : changement net.
 * @throws RangeError si `hour` ou `onHour` n'est pas un réel fini.
 */
export function lampIntensityAt(
  hour: number,
  onHour: number,
  duration: number,
  fade: number = LAMP_FADE_HOURS,
): number {
  const elapsed = normalizeHour(hour - normalizeHour(onHour));
  if (!(duration > 0)) {
    return 0;
  }
  if (duration >= HOURS_PER_DAY) {
    return 1;
  }
  if (elapsed >= duration) {
    return 0;
  }
  const f = Number.isFinite(fade) && fade > 0 ? Math.min(fade, duration / 2) : 0;
  if (f === 0) {
    return 1;
  }
  return Math.min(1, elapsed / f, (duration - elapsed) / f);
}

/** Heure d'allumage d'une eau : sa valeur réglée, ou `DEFAULT_LAMP_ON_HOUR`. */
export function lampOnOf(water: { readonly lampOn?: number }): number {
  return water.lampOn ?? DEFAULT_LAMP_ON_HOUR;
}

/** Intensité de la lampe d'une eau `water` à l'heure `hour` (voir `lampIntensityAt`). */
export function waterLampAt(
  water: { readonly lighting?: number; readonly lampOn?: number },
  hour: number,
  fade: number = LAMP_FADE_HOURS,
): number {
  return lampIntensityAt(hour, lampOnOf(water), lightingOf(water), fade);
}

/** Vrai si `hour` est une heure d'allumage valide : entier dans [0, 23]. */
export function isLampOnHour(hour: unknown): hour is number {
  return typeof hour === 'number' && Number.isInteger(hour) && hour >= 0 && hour < HOURS_PER_DAY;
}

/**
 * Règle l'heure d'allumage, **en modifiant** `water` ; la valeur par défaut n'est pas écrite
 * (sauvegardes inchangées). Renvoie faux, sans rien changer, hors des heures entières de 0 à 23.
 */
export function setLampOnInPlace(water: LampWater, hour: number): boolean {
  if (!isLampOnHour(hour)) {
    return false;
  }
  if (hour === DEFAULT_LAMP_ON_HOUR) {
    delete water.lampOn;
  } else {
    water.lampOn = hour;
  }
  return true;
}

/** Plage d'éclairage lisible : « 10:00 → 18:00 ». */
export function lampScheduleText(onHour: number, duration: number): string {
  return `${formatHour(onHour)} → ${formatHour(onHour + duration)}`;
}

/** Avis du tableau de bord sur une durée d'éclairage. */
export type LampAdvice = 'courte' | 'conseillee' | 'longue';

/** Avis sur `duration` heures : sous 8 h, courte ; au-delà de 10 h, longue. */
export function lampAdvice(duration: number): LampAdvice {
  if (duration < LAMP_ADVISED_MIN_HOURS) {
    return 'courte';
  }
  return duration > LAMP_ADVISED_MAX_HOURS ? 'longue' : 'conseillee';
}

/** Phrase de l'avis, affichée par le tableau de bord. */
export const LAMP_ADVICE_TEXT: Readonly<Record<LampAdvice, string>> = {
  courte: 'trop courte : les plantes poussent moins vite',
  conseillee: 'durée conseillée',
  longue: 'trop longue : les algues poussent',
};

/** Ligne du tableau de bord : « Lampe : 8 h par jour, 10:00 → 18:00 ». */
export interface LampReadout {
  readonly hours: number;
  readonly schedule: string;
  readonly advice: LampAdvice;
  readonly text: string;
}

/** Relevé de la lampe d'une eau pour le tableau de bord. */
export function lampReadout(water: {
  readonly lighting?: number;
  readonly lampOn?: number;
}): LampReadout {
  const hours = lightingOf(water);
  const advice = lampAdvice(hours);
  return {
    hours,
    schedule: lampScheduleText(lampOnOf(water), hours),
    advice,
    text: `${LAMP_ADVICE_TEXT[advice]} (conseillé : ${LAMP_ADVISED_MIN_HOURS} à ${LAMP_ADVISED_MAX_HOURS} h, approximation de jeu)`,
  };
}

/**
 * Ajoute la lampe d'intensité `lamp` (dans [0, 1]) à la lumière du jour `light`, **en la
 * modifiant** : intensité au moins celle de la lampe, teintes rapprochées du blanc d'autant.
 * Lampe éteinte : `light` exactement inchangée ; en plein jour (teintes blanches, intensité
 * 1), inchangée aussi. Une intensité non finie compte comme lampe éteinte. Renvoie `light`.
 */
export function withLampInto(light: MutableDayLight, lamp: number): MutableDayLight {
  const w = Number.isFinite(lamp) ? Math.min(1, Math.max(0, lamp)) : 0;
  if (w === 0) {
    return light;
  }
  light.intensity = Math.max(light.intensity, w);
  for (let k = 0; k < 3; k++) {
    light.tint[k] = mix(light.tint[k], 1, w);
    light.sky[k] = mix(light.sky[k], 1, w);
  }
  return light;
}
