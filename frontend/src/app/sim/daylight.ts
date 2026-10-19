/**
 * Cycle jour/nuit (issue #51, ADR 0018) : horloge de journée et courbe de lumière.
 *
 * Module pur et déterministe : l'heure est une fonction du **temps simulé** du monde
 * (`World.time`, avancé uniquement par les pas fixes de `sim/world.ts`), jamais de
 * l'horloge murale. Aucune couleur de la palette ici : `lightAt` renvoie des grandeurs
 * abstraites (intensité dans [0, 1], teintes RVB dans [0, 1]) que le rendu traduit
 * (`render/aquarium-scene.ts`), la passe palette restant le seul endroit qui fixe les
 * couleurs affichées (ADR 0007).
 */

/** Durée d'une journée simulée par défaut, en secondes. */
export const DEFAULT_DAY_LENGTH_SECONDS = 180;
/** Heure de départ par défaut : midi (captures par défaut inchangées). */
export const DEFAULT_START_HOUR = 12;
/** Nombre d'heures d'une journée. */
export const HOURS_PER_DAY = 24;

/** Couleur RVB, composantes dans [0, 1] (sRGB). */
export type Rgb = readonly [number, number, number];
/** Couleur RVB modifiable (tampon réutilisé par `lightAtInto`). */
export type MutableRgb = [number, number, number];

/**
 * Horloge de journée : données pures. L'heure au temps simulé `t` vaut
 * `startHour + 24 · t / dayLengthSeconds` (modulo 24), ou `startHour` si l'horloge est figée.
 */
export interface DayClock {
  /** Heure au temps simulé 0 (ou heure figée), dans [0, 24). */
  readonly startHour: number;
  /** Durée d'une journée simulée, en secondes (> 0). */
  readonly dayLengthSeconds: number;
  /** Heure figée (touche `H`, paramètre d'URL `heure=`, mode capture). */
  readonly frozen: boolean;
}

/** Lumière du jour à une heure donnée. */
export interface DayLight {
  /** Intensité du jour : 1 en plein jour (midi), 0 la nuit (minuit). */
  readonly intensity: number;
  /** Teinte de la lumière directe (soleil, puis lune) : blanc à midi. */
  readonly tint: Rgb;
  /** Teinte du ciel (lumière ambiante venant du haut) : blanc à midi. */
  readonly sky: Rgb;
}

/**
 * Lumière du jour modifiable : tampon que `lightAtInto` remplit sans allocation (une
 * instance par hôte, réutilisée à chaque recalcul de l'éclairage). Utilisable partout où
 * une `DayLight` est attendue.
 */
export interface MutableDayLight extends DayLight {
  intensity: number;
  readonly tint: MutableRgb;
  readonly sky: MutableRgb;
}

/** Nouveau tampon de lumière, initialisé à la lumière de midi. */
export function createDayLight(): MutableDayLight {
  return { intensity: 1, tint: [1, 1, 1], sky: [1, 1, 1] };
}

/**
 * Élévation du soleil (sans unité, dans [−1, 1]) en dessous de laquelle c'est la nuit, et
 * au-dessus de laquelle c'est le plein jour. Entre les deux : aube ou crépuscule.
 * Avec une élévation `−cos(2π · h / 24)` : nuit avant ≈ 5 h 02 et après ≈ 18 h 58, plein
 * jour de 8 h à 16 h.
 */
export const NIGHT_ELEVATION = -0.25;
export const DAY_ELEVATION = 0.5;

const WHITE: Rgb = [1, 1, 1];
/** Lumière de lune : bleutée. */
export const NIGHT_TINT: Rgb = [0.55, 0.66, 1];
/** Lumière rasante de l'aube et du crépuscule : orangée. */
export const TWILIGHT_TINT: Rgb = [1, 0.62, 0.38];
/** Ciel de nuit : bleu profond. */
export const NIGHT_SKY: Rgb = [0.4, 0.5, 0.9];
/** Ciel de l'aube et du crépuscule : rosé. */
export const TWILIGHT_SKY: Rgb = [1, 0.78, 0.66];
/** Part maximale de la teinte d'aube ou de crépuscule (atteinte à mi-transition). */
export const TWILIGHT_STRENGTH = 0.6;

/** Horloge par défaut : départ à midi, journée de 180 s, en marche. */
export const DEFAULT_DAY_CLOCK: DayClock = {
  startHour: DEFAULT_START_HOUR,
  dayLengthSeconds: DEFAULT_DAY_LENGTH_SECONDS,
  frozen: false,
};

/**
 * Ramène une heure dans [0, 24).
 * @throws RangeError si `hour` n'est pas un réel fini.
 */
export function normalizeHour(hour: number): number {
  if (!Number.isFinite(hour)) {
    throw new RangeError(`heure invalide (reçu : ${hour})`);
  }
  const h = hour % HOURS_PER_DAY;
  // `+ 0` : jamais de −0 ; un reste négatif infime peut arrondir à 24, ramené à 0.
  const wrapped = h < 0 ? h + HOURS_PER_DAY : h + 0;
  return wrapped >= HOURS_PER_DAY ? 0 : wrapped;
}

/**
 * Crée une horloge validée.
 * @throws RangeError si l'heure n'est pas finie ou si la durée n'est pas un réel fini > 0.
 */
export function createDayClock(
  startHour: number = DEFAULT_START_HOUR,
  dayLengthSeconds: number = DEFAULT_DAY_LENGTH_SECONDS,
  frozen = false,
): DayClock {
  if (!(dayLengthSeconds > 0) || !Number.isFinite(dayLengthSeconds)) {
    throw new RangeError(
      `dayLengthSeconds doit être un réel strictement positif (reçu : ${dayLengthSeconds})`,
    );
  }
  return { startHour: normalizeHour(startHour), dayLengthSeconds, frozen };
}

/**
 * Heure (dans [0, 24)) au temps simulé `time`, en secondes.
 * @throws RangeError si `time` n'est pas un réel fini positif ou nul.
 */
export function hourAt(clock: DayClock, time: number): number {
  if (!Number.isFinite(time) || time < 0) {
    throw new RangeError(`time doit être un réel positif ou nul (reçu : ${time})`);
  }
  if (clock.frozen) {
    return normalizeHour(clock.startHour);
  }
  return normalizeHour(clock.startHour + (HOURS_PER_DAY * time) / clock.dayLengthSeconds);
}

/** Fige l'horloge à l'heure qu'elle indique au temps `time` (sans effet si déjà figée). */
export function freezeClock(clock: DayClock, time: number): DayClock {
  if (clock.frozen) {
    return clock;
  }
  return { ...clock, startHour: hourAt(clock, time), frozen: true };
}

/**
 * Remet l'horloge en marche au temps `time`, sans saut : l'heure au temps `time` reste
 * l'heure figée (sans effet si l'horloge tourne déjà).
 */
export function resumeClock(clock: DayClock, time: number): DayClock {
  if (!clock.frozen) {
    return clock;
  }
  if (!Number.isFinite(time) || time < 0) {
    throw new RangeError(`time doit être un réel positif ou nul (reçu : ${time})`);
  }
  const elapsedHours = (HOURS_PER_DAY * time) / clock.dayLengthSeconds;
  return { ...clock, startHour: normalizeHour(clock.startHour - elapsedHours), frozen: false };
}

/** Fige ou remet en marche l'horloge au temps `time` (touche `H`). */
export function toggleClock(clock: DayClock, time: number): DayClock {
  return clock.frozen ? resumeClock(clock, time) : freezeClock(clock, time);
}

/** Élévation du soleil dans [−1, 1] : −1 à minuit, 0 à 6 h et 18 h, 1 à midi. */
export function sunElevation(hour: number): number {
  return -Math.cos(2 * Math.PI * (normalizeHour(hour) / HOURS_PER_DAY));
}

/**
 * Lumière du jour à l'heure `hour` (toute valeur finie, ramenée modulo 24) : fonction
 * continue et périodique de période 24 h, symétrique autour de midi.
 *
 * - `intensity` : `smoothstep` de l'élévation du soleil entre `NIGHT_ELEVATION` et
 *   `DAY_ELEVATION` ; exactement 1 en plein jour et 0 en pleine nuit.
 * - `tint` et `sky` : mélange nuit → jour selon l'intensité, puis vers la teinte d'aube ou
 *   de crépuscule avec un poids `TWILIGHT_STRENGTH · 4 · i · (1 − i)`, nul en plein jour et
 *   en pleine nuit, maximal à mi-transition. Exactement blanc en plein jour.
 *
 * Alloue un nouvel objet : dans une boucle par image, préférer `lightAtInto`.
 * @throws RangeError si `hour` n'est pas un réel fini.
 */
export function lightAt(hour: number): DayLight {
  return lightAtInto(hour, createDayLight());
}

/**
 * Variante sans allocation de `lightAt` : écrit la lumière de l'heure `hour` dans `out` et
 * le renvoie. Résultat identique à `lightAt(hour)`, composante par composante.
 * @throws RangeError si `hour` n'est pas un réel fini (`out` n'est alors pas modifié).
 */
export function lightAtInto(hour: number, out: MutableDayLight): MutableDayLight {
  const intensity = smoothstep(NIGHT_ELEVATION, DAY_ELEVATION, sunElevation(hour));
  const twilight = TWILIGHT_STRENGTH * 4 * intensity * (1 - intensity);
  out.intensity = intensity;
  for (let k = 0; k < 3; k++) {
    out.tint[k] = mix(mix(NIGHT_TINT[k], WHITE[k], intensity), TWILIGHT_TINT[k], twilight);
    out.sky[k] = mix(mix(NIGHT_SKY[k], WHITE[k], intensity), TWILIGHT_SKY[k], twilight);
  }
  return out;
}

/** `a · (1 − t) + b · t` : exactement `a` pour t = 0 et `b` pour t = 1. */
export function mix(a: number, b: number, t: number): number {
  return a * (1 - t) + b * t;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
