import { DEFAULT_FOOD_STYLE, isFoodStyle, type FoodStyle } from '../core/food-style/food-style';
import { createDayClock, DEFAULT_DAY_CLOCK, HOURS_PER_DAY, type DayClock } from './daylight';
import { clampRoom, DEFAULT_ROOM, readRoom, roomData, type Room } from './room';
import { tidyRoom } from './room-furniture';
import { describe, isNumberIn, isRecord, own, problemsOf, type Rule } from './save-schema';
import { DEFAULT_SIM_SPEED, isSimSpeed, type SimSpeed } from './sim-speed';

/**
 * Réglages enregistrés avec le monde (`sim/save.ts`), communs aux schémas 1 et 2 : vitesse,
 * horloge de la journée, rendu des granulés et pièce. Écrits par `settingsData`, relus par
 * `parseSettings`.
 */

/**
 * Durée d'une journée simulée acceptée pour l'horloge, en secondes : de 1 min à 1 jour
 * réel (l'application utilise 20 min, `DEFAULT_DAY_LENGTH_SECONDS`).
 */
export const MIN_DAY_LENGTH_SECONDS = 60;
export const MAX_DAY_LENGTH_SECONDS = 86_400;

/** Réglages de l'interface enregistrés avec le monde. */
export interface SaveSettings {
  /** Vitesse de simulation (`sim/sim-speed.ts`). */
  readonly speed: SimSpeed;
  /** Horloge de la journée (`sim/daylight.ts`) : l'heure en dérive au temps du monde. */
  readonly clock: DayClock;
  /**
   * Rendu des granulés (issue #117). Facultatif : absent (anciennes sauvegardes), c'est
   * `DEFAULT_FOOD_STYLE` ; toujours présent dans une sauvegarde écrite et relue.
   */
  readonly foodStyle?: FoodStyle;
  /**
   * Pièce autour du bac (issue #187, ADR 0048). Facultative : absente (anciennes
   * sauvegardes), c'est `DEFAULT_ROOM` (masquée) ; toujours présente dans une sauvegarde
   * écrite et relue.
   */
  readonly room?: Room;
}

/**
 * Réglages par défaut (vitesse ×1, départ à midi, heure en marche, granulés en points, pièce
 * masquée).
 */
export const DEFAULT_SAVE_SETTINGS: SaveSettings = {
  speed: DEFAULT_SIM_SPEED,
  clock: DEFAULT_DAY_CLOCK,
  foodStyle: DEFAULT_FOOD_STYLE,
  room: DEFAULT_ROOM,
};

/**
 * Réglages enregistrés (copiés, pièce bornée), communs aux schémas 1 et 2.
 * @throws RangeError si un réglage est invalide.
 */
export function settingsData(settings: SaveSettings): SaveSettings {
  const problems = settingsProblems(settings);
  if (problems.length > 0) {
    throw new RangeError(`sauvegarde : ${problems.join(' ; ')}`);
  }
  return {
    speed: settings.speed,
    clock: {
      startHour: settings.clock.startHour,
      dayLengthSeconds: settings.clock.dayLengthSeconds,
      frozen: settings.clock.frozen,
    },
    foodStyle: settings.foodStyle ?? DEFAULT_FOOD_STYLE,
    room: roomData(clampRoom(settings.room ?? DEFAULT_ROOM)),
  };
}

/** Relit les réglages (communs aux schémas 1 et 2) ; `null` si un problème a été ajouté. */
export function parseSettings(value: unknown, problems: string[]): SaveSettings | null {
  if (!isRecord(value)) {
    problems.push('settings doit être un objet');
    return null;
  }
  const clockValue = own(value, 'clock');
  const clock = isRecord(clockValue) ? clockValue : {};
  const settings = {
    speed: own(value, 'speed') as SimSpeed,
    clock: {
      startHour: own(clock, 'startHour'),
      dayLengthSeconds: own(clock, 'dayLengthSeconds'),
      frozen: own(clock, 'frozen'),
    } as unknown as DayClock,
    foodStyle: own(value, 'foodStyle') as FoodStyle | undefined,
  };
  const found = settingsProblems(settings);
  // Pièce (#187) : absente, masquée ; présente, validée et bornée (`readRoom`).
  const roomValue = own(value, 'room');
  const room =
    roomValue === undefined ? { ok: true as const, room: DEFAULT_ROOM } : readRoom(roomValue);
  if (!room.ok) {
    problems.push(...found, room.error);
    return null;
  }
  if (found.length > 0) {
    problems.push(...found);
    return null;
  }
  return {
    speed: settings.speed,
    clock: createDayClock(
      settings.clock.startHour,
      settings.clock.dayLengthSeconds,
      settings.clock.frozen,
    ),
    foodStyle: settings.foodStyle ?? DEFAULT_FOOD_STYLE,
    // Éléments relus reposés et chevauchements écartés (#200, cas 2).
    room: tidyRoom(room.room),
  };
}

/** Vitesse de simulation. */
const SPEED_RULES: readonly Rule<SaveSettings>[] = [
  {
    valid: (s) => typeof s.speed === 'number' && isSimSpeed(s.speed),
    message: (s) => `vitesse inconnue (${describe(s.speed)})`,
  },
];

/** Horloge de la journée (champs lus directement : objet typé à l'écriture). */
const CLOCK_RULES: readonly Rule<Record<string, unknown>>[] = [
  {
    valid: (c) => isNumberIn(c['startHour'], 0, HOURS_PER_DAY) && c['startHour'] !== HOURS_PER_DAY,
    message: 'heure de l’horloge hors de [0, 24)',
  },
  {
    valid: (c) => isNumberIn(c['dayLengthSeconds'], MIN_DAY_LENGTH_SECONDS, MAX_DAY_LENGTH_SECONDS),
    message: `durée de la journée hors de [${MIN_DAY_LENGTH_SECONDS}, ${MAX_DAY_LENGTH_SECONDS}] s`,
  },
  {
    valid: (c) => typeof c['frozen'] === 'boolean',
    message: 'horloge : frozen doit être un booléen',
  },
];

/** Rendu des granulés et pièce, facultatifs. */
const LOOK_RULES: readonly Rule<SaveSettings>[] = [
  {
    valid: (s) => s.foodStyle === undefined || isFoodStyle(s.foodStyle),
    message: (s) => `rendu des granulés inconnu (${describe(s.foodStyle)})`,
  },
  {
    valid: (s) => s.room === undefined || readRoom(s.room).ok,
    message: (s) => {
      const room = readRoom(s.room);
      return room.ok ? '' : room.error;
    },
  },
];

function settingsProblems(settings: SaveSettings): string[] {
  const problems = problemsOf(settings, SPEED_RULES);
  const clock: unknown = settings.clock;
  if (!isRecord(clock)) {
    problems.push('horloge absente');
    return problems;
  }
  return [...problems, ...problemsOf(clock, CLOCK_RULES), ...problemsOf(settings, LOOK_RULES)];
}
