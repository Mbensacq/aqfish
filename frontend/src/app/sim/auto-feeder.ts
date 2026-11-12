import { HOURS_PER_DAY, formatHour, type DayClock } from './daylight';
import type { EnvironmentId } from './environment';
import type { Box3 } from './tank';

/**
 * Distributeur de nourriture automatique (issue #583, ADR 0136) : un appareil posé sur le bord
 * du bac qui lâche une ration, comme un clic de nourrissage, à des heures choisies (1 à 4 par
 * jour), tant que sa réserve n'est pas vide. Fonctions pures et déterministes : l'heure vient
 * de l'horloge de journée (`sim/daylight.ts`, temps simulé), jamais de l'horloge murale ; la
 * vitesse de simulation ne change que le nombre de pas, donc pas les rations.
 *
 * Un monde sans distributeur (`World.feeder` absent, cas du bac par défaut et des anciennes
 * sauvegardes) avance exactement comme avant, au bit près.
 *
 * Valeurs : **approximations de jeu** (`docs/SOINS.md` § 12), pas des réglages d'un appareil
 * réel.
 */

/** Rations contenues dans un distributeur plein (deux semaines à une ration par jour). */
export const FEEDER_CAPACITY = 14;
/** Rations par jour, au plus. */
export const FEEDER_MAX_RATIONS_PER_DAY = 4;

/** Heures proposées pour `n` rations par jour (le joueur les règle ensuite une à une). */
export const FEEDER_DEFAULT_HOURS: Readonly<Record<1 | 2 | 3 | 4, readonly number[]>> = {
  1: [9],
  2: [9, 18],
  3: [8, 13, 18],
  4: [8, 12, 16, 20],
};

/** Environnements où un distributeur peut être posé : bacs vitrés à bord droit. */
const FEEDER_ENVIRONMENTS: readonly EnvironmentId[] = ['tropical', 'recif', 'eaufroide'];

/** Position du distributeur sur le bord du bac, en fractions de la largeur et de la profondeur. */
export const FEEDER_SPOT_X = 0.12;
export const FEEDER_SPOT_Z = 0.08;

/** État d'un distributeur. Objet de données pur. */
export interface FeederState {
  /** Heures de distribution, entiers distincts dans [0, 23], triés, 1 à 4 valeurs. */
  readonly hours: readonly number[];
  /** Rations restantes, entier dans [0, `FEEDER_CAPACITY`]. */
  readonly stock: number;
}

interface MutableFeeder {
  hours: number[];
  stock: number;
}

/** Vrai si un distributeur peut être posé dans un bac de l'environnement `environment`. */
export function hasFeeder(environment: EnvironmentId): boolean {
  return FEEDER_ENVIRONMENTS.includes(environment);
}

/** Vrai si `hour` est une heure de distribution valide : entier dans [0, 23]. */
export function isFeederHour(hour: unknown): hour is number {
  return typeof hour === 'number' && Number.isInteger(hour) && hour >= 0 && hour < HOURS_PER_DAY;
}

/**
 * Heures de distribution normalisées : distinctes et triées. Renvoie `null` si une heure est
 * invalide, ou s'il en reste moins d'une ou plus de `FEEDER_MAX_RATIONS_PER_DAY`.
 */
export function feederHours(hours: readonly unknown[]): number[] | null {
  if (!hours.every(isFeederHour)) {
    return null;
  }
  const unique = [...new Set(hours as readonly number[])].sort((a, b) => a - b);
  return unique.length >= 1 && unique.length <= FEEDER_MAX_RATIONS_PER_DAY ? unique : null;
}

/**
 * Distributeur neuf et plein, aux heures `hours` (normalisées par `feederHours`).
 * @throws RangeError si les heures sont invalides.
 */
export function createFeeder(hours: readonly number[] = FEEDER_DEFAULT_HOURS[1]): FeederState {
  const normalized = feederHours(hours);
  if (normalized === null) {
    throw new RangeError(`heures de distribution invalides (reçu : ${hours.join(', ')})`);
  }
  return { hours: normalized, stock: FEEDER_CAPACITY };
}

/**
 * Nombre de rations prévues entre l'heure `fromHour` (exclue) et `elapsedHours` heures plus
 * tard (incluse), aux heures `hours` : passage de minuit compris, et plusieurs jours si
 * `elapsedHours` dépasse 24 h. Une durée nulle, négative ou non finie n'en prévoit aucune.
 * `fromHour` peut dépasser 24 (heure continue, `rationsDue`) : le compte se télescope d'un
 * pas au suivant, si bien qu'une ration n'est jamais lâchée deux fois ni oubliée, même quand
 * une fin de pas tombe exactement sur son heure.
 * @throws RangeError si `fromHour` n'est pas un réel fini.
 */
export function rationsBetween(
  fromHour: number,
  elapsedHours: number,
  hours: readonly number[],
): number {
  if (!Number.isFinite(fromHour)) {
    throw new RangeError(`heure invalide (reçu : ${fromHour})`);
  }
  if (!(elapsedHours > 0) || !Number.isFinite(elapsedHours)) {
    return 0;
  }
  return countBetween(fromHour, fromHour + elapsedHours, hours);
}

/** Heures prévues dans ]from, to], en heures continues. */
function countBetween(from: number, to: number, hours: readonly number[]): number {
  let count = 0;
  for (const hour of hours) {
    count += Math.floor((to - hour) / HOURS_PER_DAY) - Math.floor((from - hour) / HOURS_PER_DAY);
  }
  return count;
}

/**
 * Heures de jeu écoulées pendant `seconds` secondes simulées sur l'horloge `clock` : 0 si
 * l'horloge est figée (touche `H`, mode capture) ou si la durée n'est pas positive.
 */
export function clockHoursIn(clock: DayClock, seconds: number): number {
  if (clock.frozen || !(seconds > 0) || !Number.isFinite(seconds)) {
    return 0;
  }
  return (HOURS_PER_DAY * seconds) / clock.dayLengthSeconds;
}

/**
 * Rations dues entre les temps simulés `fromTime` (exclu) et `toTime` (inclus), sur l'horloge
 * `clock`, en heure continue (`startHour + 24 · t / dayLengthSeconds`, sans retour à 0 à
 * minuit) : aucune si l'horloge est figée.
 */
export function rationsDue(
  clock: DayClock,
  fromTime: number,
  toTime: number,
  hours: readonly number[],
): number {
  if (clock.frozen || !(toTime > fromTime)) {
    return 0;
  }
  const from = clock.startHour + (HOURS_PER_DAY * fromTime) / clock.dayLengthSeconds;
  const to = clock.startHour + (HOURS_PER_DAY * toTime) / clock.dayLengthSeconds;
  return countBetween(from, to, hours);
}

/**
 * Rations dues pendant une image de `realSeconds` secondes réelles à la vitesse `speed` (temps
 * simulé = temps réel × vitesse), à partir de l'heure `fromHour` : à vitesse ×8, une image
 * couvre huit fois plus d'heures et peut donc lâcher plusieurs rations.
 */
export function rationsInFrame(
  fromHour: number,
  realSeconds: number,
  speed: number,
  clock: DayClock,
  hours: readonly number[],
): number {
  return rationsBetween(fromHour, clockHoursIn(clock, realSeconds * speed), hours);
}

/**
 * Retire de la réserve de `feeder` jusqu'à `due` rations, **en le modifiant**, et renvoie le
 * nombre de rations réellement lâchées : réserve vide, aucune.
 */
export function takeRationsInPlace(feeder: FeederState, due: number): number {
  const taken = Math.max(0, Math.min(feeder.stock, Number.isFinite(due) ? Math.floor(due) : 0));
  (feeder as MutableFeeder).stock = feeder.stock - taken;
  return taken;
}

/** Remplit la réserve de `feeder`, **en le modifiant**. */
export function refillFeederInPlace(feeder: FeederState): void {
  (feeder as MutableFeeder).stock = FEEDER_CAPACITY;
}

/** Vrai si le distributeur est vide (plus aucune ration ne tombe). */
export function isFeederEmpty(feeder: FeederState | undefined): boolean {
  return feeder !== undefined && feeder.stock <= 0;
}

/** Point de chute des rations dans le volume d'eau `water` (sous le distributeur). */
export function feederSpot(water: Box3): { readonly x: number; readonly z: number } {
  return {
    x: water.minX + FEEDER_SPOT_X * (water.maxX - water.minX),
    z: water.minZ + FEEDER_SPOT_Z * (water.maxZ - water.minZ),
  };
}

/** Copie d'un distributeur (sauvegarde). */
export function copyFeeder(feeder: FeederState): FeederState {
  return { hours: [...feeder.hours], stock: feeder.stock };
}

/**
 * Lit un distributeur enregistré ; ajoute un message à `problems` et renvoie `null` s'il est
 * invalide (heures hors de [0, 23], en double, trop nombreuses, réserve hors bornes).
 */
export function readFeeder(value: unknown, problems: string[]): FeederState | null {
  const record = value as { hours?: unknown; stock?: unknown } | null;
  if (typeof record !== 'object' || record === null || Array.isArray(record)) {
    problems.push('feeder doit être un objet');
    return null;
  }
  const { hours, stock } = record;
  const normalized = Array.isArray(hours) ? feederHours(hours) : null;
  if (normalized === null || normalized.length !== (hours as unknown[]).length) {
    problems.push(
      `feeder.hours doit lister 1 à ${FEEDER_MAX_RATIONS_PER_DAY} heures distinctes dans [0, 23]`,
    );
    return null;
  }
  if (
    typeof stock !== 'number' ||
    !Number.isInteger(stock) ||
    stock < 0 ||
    stock > FEEDER_CAPACITY
  ) {
    problems.push(`feeder.stock doit être un entier dans [0, ${FEEDER_CAPACITY}]`);
    return null;
  }
  return { hours: normalized, stock };
}

/** Ligne du tableau de bord : réserve, heures, vide ou non. */
export interface FeederReadout {
  readonly stock: number;
  readonly capacity: number;
  readonly hours: readonly number[];
  /** Heures lisibles : « 09:00 · 18:00 ». */
  readonly schedule: string;
  readonly empty: boolean;
}

/** Relevé d'un distributeur pour le tableau de bord. */
export function feederReadout(feeder: FeederState): FeederReadout {
  return {
    stock: feeder.stock,
    capacity: FEEDER_CAPACITY,
    hours: feeder.hours,
    schedule: feeder.hours.map(formatHour).join(' · '),
    empty: feeder.stock <= 0,
  };
}
