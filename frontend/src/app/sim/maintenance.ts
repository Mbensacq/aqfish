import { DEFAULT_DAY_LENGTH_SECONDS } from './daylight';

/**
 * Calendrier d'entretien d'un bac (issue #513, ADR 0116) : tâches périodiques, échéances en
 * temps simulé et journal des dernières actions. Fonctions pures, sans hasard ni horloge ;
 * le temps est celui du monde (`World.time`), donc la vitesse de simulation ne change rien
 * aux échéances exprimées en jours de jeu.
 *
 * Un rappel n'est jamais une alerte : il ne dit rien de la santé du bac, c'est le rôle de
 * `sim/dashboard-alerts.ts`. Une valeur non finie ne donne ni retard ni action enregistrée.
 */

/** Tâche suivie dès le début du calendrier. */
export type CoreMaintenanceTask = 'waterChange' | 'filter' | 'waterTest' | 'prune';

/**
 * Tâche d'entretien. `glass` (vitres, #604) n'est suivie qu'après une première séance
 * guidée (`sim/care-session.ts`) : absente d'un calendrier, elle n'est ni affichée ni échue,
 * et les sauvegardes d'avant restent valides.
 */
export type MaintenanceTask = CoreMaintenanceTask | 'glass';

/** Tâches suivies dès le début, dans l'ordre d'affichage. */
export const MAINTENANCE_TASKS: readonly CoreMaintenanceTask[] = [
  'waterChange',
  'filter',
  'waterTest',
  'prune',
];

/** Toutes les tâches connues (journal, relecture). */
export const ALL_MAINTENANCE_TASKS: readonly MaintenanceTask[] = [...MAINTENANCE_TASKS, 'glass'];

/** Libellé affiché de chaque tâche. */
export const MAINTENANCE_LABELS: Readonly<Record<MaintenanceTask, string>> = {
  waterChange: 'Changement d’eau',
  filter: 'Nettoyage du filtre',
  waterTest: 'Test de l’eau',
  prune: 'Taille des plantes',
  glass: 'Nettoyage des vitres',
};

/**
 * Période de chaque tâche, en jours de jeu : **approximation de jeu**, choisie pour que les
 * rappels restent rares à la durée de journée par défaut, pas une règle d'aquariophilie.
 */
export const MAINTENANCE_PERIOD_DAYS: Readonly<Record<MaintenanceTask, number>> = {
  waterChange: 7,
  filter: 30,
  waterTest: 7,
  prune: 14,
  glass: 14,
};

/** Durée d'un jour de jeu, en secondes simulées (celle des traitements). */
export const MAINTENANCE_DAY_SECONDS = DEFAULT_DAY_LENGTH_SECONDS;

/** Nombre d'actions gardées au journal. */
export const MAINTENANCE_LOG_SIZE = 10;

/** Action enregistrée au journal. */
export interface MaintenanceLogEntry {
  readonly task: MaintenanceTask;
  /** Temps simulé de l'action, en secondes. */
  readonly time: number;
}

/** Calendrier d'un bac. */
export interface MaintenanceState {
  /**
   * Temps simulé de la dernière fois que chaque tâche a été faite (ou du début du suivi) ;
   * `glass` seulement après un premier nettoyage des vitres (#604).
   */
  readonly lastDone: Readonly<Record<CoreMaintenanceTask, number>> & { readonly glass?: number };
  /** Dernières actions, de la plus récente à la plus ancienne. */
  readonly log: readonly MaintenanceLogEntry[];
}

/** Échéance d'une tâche. */
export interface MaintenanceItem {
  readonly task: MaintenanceTask;
  readonly label: string;
  readonly overdue: boolean;
  /** Jours entiers avant l'échéance, ou de retard si `overdue` ; 0 au plus tôt. */
  readonly days: number;
  /** État en texte : « Dans 3 j », « À faire », « En retard de 2 j ». */
  readonly text: string;
}

/** Ligne du journal affichée. */
export interface MaintenanceLogLine {
  readonly task: MaintenanceTask;
  readonly label: string;
  /** Numéro du jour de jeu, à partir de 1. */
  readonly day: number;
}

/** Relevé affiché par le tableau de bord. */
export interface MaintenanceReadout {
  readonly items: readonly MaintenanceItem[];
  /** Tâches échues, dans l'ordre d'affichage. */
  readonly due: readonly MaintenanceTask[];
  readonly log: readonly MaintenanceLogLine[];
}

/** Vrai si `task` est une tâche connue. */
export function isMaintenanceTask(task: unknown): task is MaintenanceTask {
  return typeof task === 'string' && (ALL_MAINTENANCE_TASKS as readonly string[]).includes(task);
}

/** Calendrier neuf : le suivi de chaque tâche commence au temps `time`. */
export function initialMaintenance(time: number): MaintenanceState {
  const start = Number.isFinite(time) && time > 0 ? time : 0;
  return {
    lastDone: { waterChange: start, filter: start, waterTest: start, prune: start },
    log: [],
  };
}

/**
 * Enregistre `task` faite au temps `time` : échéance remise à zéro, action en tête du journal,
 * limité à `MAINTENANCE_LOG_SIZE`. Un temps non fini ou négatif laisse le calendrier inchangé.
 */
export function maintenanceDone(
  state: MaintenanceState,
  task: MaintenanceTask,
  time: number,
): MaintenanceState {
  if (!Number.isFinite(time) || time < 0) {
    return state;
  }
  return {
    lastDone: { ...state.lastDone, [task]: time },
    log: [{ task, time }, ...state.log].slice(0, MAINTENANCE_LOG_SIZE),
  };
}

/** Échéance de `task` au temps `time` (voir `MaintenanceItem`). */
export function maintenanceItem(
  state: MaintenanceState,
  task: MaintenanceTask,
  time: number,
): MaintenanceItem {
  // Tâche jamais suivie (vitres avant la première séance) : comptée depuis maintenant.
  const elapsed = time - (state.lastDone[task] ?? time);
  const period = MAINTENANCE_PERIOD_DAYS[task] * MAINTENANCE_DAY_SECONDS;
  const label = MAINTENANCE_LABELS[task];
  // Non fini (ou horloge antérieure à l'action) : ni retard, ni échéance avancée.
  const known = Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : 0;
  if (known < period) {
    const days = Math.ceil((period - known) / MAINTENANCE_DAY_SECONDS);
    return { task, label, overdue: false, days, text: `Dans ${days} j` };
  }
  const days = Math.floor((known - period) / MAINTENANCE_DAY_SECONDS);
  return {
    task,
    label,
    overdue: true,
    days,
    text: days === 0 ? 'À faire' : `En retard de ${days} j`,
  };
}

/**
 * Relevé du calendrier au temps `time`, pour les tâches `tasks` qui concernent ce bac, plus
 * les vitres si elles sont suivies (`lastDone.glass`, #604), en dernier.
 */
export function maintenanceReadout(
  state: MaintenanceState,
  time: number,
  tasks: readonly MaintenanceTask[] = MAINTENANCE_TASKS,
): MaintenanceReadout {
  const shown =
    state.lastDone.glass !== undefined && !tasks.includes('glass')
      ? [...tasks, 'glass' as const]
      : tasks;
  const items = shown.map((task) => maintenanceItem(state, task, time));
  return {
    items,
    due: items.filter((item) => item.overdue).map((item) => item.task),
    log: state.log.map((entry) => ({
      task: entry.task,
      label: MAINTENANCE_LABELS[entry.task],
      day: Math.floor(entry.time / MAINTENANCE_DAY_SECONDS) + 1,
    })),
  };
}

/** Résumé court du bouton : tâche échue, nombre de tâches, ou « à jour ». */
export function maintenanceSummary(readout: MaintenanceReadout): string {
  if (readout.due.length === 0) {
    return 'à jour';
  }
  if (readout.due.length === 1) {
    return MAINTENANCE_LABELS[readout.due[0]].toLowerCase();
  }
  return `${readout.due.length} tâches à faire`;
}

/** Vrai si deux relevés affichent la même chose. */
export function sameMaintenanceReadout(
  a: MaintenanceReadout | null,
  b: MaintenanceReadout | null,
): boolean {
  if (a === b) {
    return true;
  }
  return (
    a !== null &&
    b !== null &&
    sameList(a.items, b.items, sameMaintenanceItem) &&
    sameList(a.due, b.due, (x, y) => x === y) &&
    sameList(a.log, b.log, sameMaintenanceLogLine)
  );
}

function sameList<T>(a: readonly T[], b: readonly T[], same: (x: T, y: T) => boolean): boolean {
  return a.length === b.length && a.every((item, index) => same(item, b[index]!));
}

function sameMaintenanceItem(a: MaintenanceItem, b: MaintenanceItem): boolean {
  return (
    a.task === b.task &&
    a.label === b.label &&
    a.overdue === b.overdue &&
    a.days === b.days &&
    a.text === b.text
  );
}

function sameMaintenanceLogLine(a: MaintenanceLogLine, b: MaintenanceLogLine): boolean {
  return a.task === b.task && a.label === b.label && a.day === b.day;
}

/** Copie d'un calendrier (sauvegarde). */
export function copyMaintenance(state: MaintenanceState): MaintenanceState {
  return { lastDone: { ...state.lastDone }, log: state.log.map((entry) => ({ ...entry })) };
}

const isTime = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

/** Relit un calendrier enregistré ; `null` et un message dans `problems` s'il est invalide. */
export function readMaintenance(value: unknown, problems: string[]): MaintenanceState | null {
  const record = value as { lastDone?: unknown; log?: unknown } | null;
  if (typeof record !== 'object' || record === null || Array.isArray(record)) {
    problems.push('maintenance doit être un objet');
    return null;
  }
  const saved = record.lastDone as Record<string, unknown> | null | undefined;
  const log = record.log;
  if (typeof saved !== 'object' || saved === null) {
    problems.push('maintenance.lastDone doit être un objet');
    return null;
  }
  if (!MAINTENANCE_TASKS.every((task) => Object.hasOwn(saved, task) && isTime(saved[task]))) {
    problems.push('maintenance.lastDone doit donner un temps à chaque tâche');
    return null;
  }
  const glass = saved['glass'];
  if (glass !== undefined && !isTime(glass)) {
    problems.push('maintenance.lastDone.glass doit être un temps');
    return null;
  }
  if (!Array.isArray(log) || log.length > MAINTENANCE_LOG_SIZE) {
    problems.push(`maintenance.log doit être une liste de ${MAINTENANCE_LOG_SIZE} actions au plus`);
    return null;
  }
  const entries: MaintenanceLogEntry[] = [];
  for (const item of log as unknown[]) {
    const entry = item as { task?: unknown; time?: unknown } | null;
    if (typeof entry !== 'object' || entry === null) {
      problems.push('maintenance.log : action invalide');
      return null;
    }
    const { task, time } = entry;
    if (!isMaintenanceTask(task) || !isTime(time)) {
      problems.push('maintenance.log : action invalide');
      return null;
    }
    entries.push({ task, time });
  }
  return {
    lastDone: {
      waterChange: saved['waterChange'] as number,
      filter: saved['filter'] as number,
      waterTest: saved['waterTest'] as number,
      prune: saved['prune'] as number,
      ...(glass === undefined ? {} : { glass }),
    },
    log: entries,
  };
}
