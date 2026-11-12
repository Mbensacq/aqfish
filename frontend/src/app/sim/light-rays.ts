import { dayIntensityAt, HOURS_PER_DAY, normalizeHour, NOON_HOUR } from './daylight';

/**
 * Rayons de lumière dans l'eau (issue #567, ADR 0134) : force et inclinaison des rayons qui
 * descendent de la surface, selon l'heure et la météo.
 *
 * Module pur et déterministe, sans couleur : la force suit l'intensité du jour
 * (`dayIntensityAt`, ADR 0018), nulle la nuit, partielle à l'aube et au crépuscule, et
 * baisse sous un ciel couvert ; l'inclinaison suit la course du soleil d'est en ouest
 * (verticale à midi), bornée par la réfraction à la surface. Le rendu
 * (`render/light-rays-layer.ts`) traduit ces grandeurs en tramage de la palette.
 */

/**
 * Inclinaison maximale des rayons par rapport à la verticale, en radians (≈ 29°), atteinte à
 * 6 h et à 18 h : sous l'eau, la réfraction resserre les rayons (fenêtre de Snell ≈ 48,6°) ;
 * valeur de jeu, plus discrète que la limite physique.
 */
export const MAX_RAY_TILT = 0.5;

/** Part de la force des rayons conservée sous un ciel entièrement couvert (pluie). */
export const OVERCAST_RAY_RATIO = 0.35;

/** Rayons de lumière à une heure donnée. */
export interface LightRays {
  /** Force des rayons dans [0, 1] : 1 en plein jour par temps clair, 0 la nuit. */
  readonly strength: number;
  /**
   * Inclinaison par rapport à la verticale, en radians, dans [−MAX_RAY_TILT, MAX_RAY_TILT] :
   * négative le matin (le pied des rayons part vers −X), nulle à midi, positive l'après-midi
   * (vers +X).
   */
  readonly tilt: number;
}

/** Rayons modifiables : tampon que `lightRaysInto` remplit sans allocation. */
export interface MutableLightRays extends LightRays {
  strength: number;
  tilt: number;
}

/** Nouveau tampon de rayons, initialisé à midi par temps clair. */
export function createLightRays(): MutableLightRays {
  return { strength: 1, tilt: 0 };
}

/**
 * Couverture nuageuse ramenée dans [0, 1] (0 : ciel clair, 1 : pluie) ; une valeur non finie
 * compte comme un ciel clair.
 */
export function clampCloudiness(cloudiness: number): number {
  return Number.isFinite(cloudiness) ? Math.min(1, Math.max(0, cloudiness)) : 0;
}

/**
 * Inclinaison des rayons à l'heure `hour` (toute valeur finie, ramenée modulo 24) :
 * `MAX_RAY_TILT · sin(2π · (h − 12) / 24)`, continue et périodique, nulle à midi (et à
 * minuit), extrême à 6 h (−) et à 18 h (+).
 * @throws RangeError si `hour` n'est pas un réel fini.
 */
export function rayTiltAt(hour: number): number {
  const h = normalizeHour(hour);
  // `+ 0` : jamais de −0 (midi pile donne sin(0) = 0, minuit sin(−π) ≈ −1e−16).
  const tilt = MAX_RAY_TILT * Math.sin((2 * Math.PI * (h - NOON_HOUR)) / HOURS_PER_DAY) + 0;
  return Math.abs(tilt) < 1e-12 ? 0 : tilt;
}

/**
 * Rayons à l'heure `hour` sous la couverture nuageuse `cloudiness` (0 : clair, 1 : pluie ;
 * ramenée dans [0, 1]) : force `dayIntensityAt(hour) · (1 − c · (1 − OVERCAST_RAY_RATIO))`,
 * exactement l'intensité du jour par temps clair, nulle en pleine nuit ; inclinaison
 * `rayTiltAt(hour)`.
 *
 * Alloue un nouvel objet : dans une boucle par image, préférer `lightRaysInto`.
 * @throws RangeError si `hour` n'est pas un réel fini.
 */
export function lightRaysAt(hour: number, cloudiness = 0): LightRays {
  return lightRaysInto(hour, cloudiness, createLightRays());
}

/**
 * Variante sans allocation de `lightRaysAt` : écrit les rayons dans `out` et le renvoie.
 * @throws RangeError si `hour` n'est pas un réel fini (`out` n'est alors pas modifié).
 */
export function lightRaysInto(
  hour: number,
  cloudiness: number,
  out: MutableLightRays,
): MutableLightRays {
  const day = dayIntensityAt(hour);
  const tilt = rayTiltAt(hour);
  const cloud = clampCloudiness(cloudiness);
  out.strength = cloud === 0 ? day : day * (1 - cloud * (1 - OVERCAST_RAY_RATIO));
  out.tilt = tilt;
  return out;
}
