import type { EnvironmentId } from './environment';
import { WATER_TEMPERATURES, type WaterState } from './water';
import type { DashboardGaugeId } from './water-dashboard';
import type { PhBands } from './water-ph';
import { COMPOUND_THRESHOLDS, TEMPERATURE_THRESHOLDS } from './water-quality';

/**
 * Historique de l'eau du bac affiché (issue #511, ADR 0118) : tampon circulaire de taille
 * fixe, un relevé toutes les 15 minutes de jeu sur les dernières 24 h, changements d'eau
 * marqués. Fonctions pures de ce qu'on leur donne, sans hasard ni horloge réelle : relever
 * aux mêmes pas donne le même historique, quelle que soit la cadence d'affichage.
 *
 * Le tampon vit hors du monde pendant la partie (rien n'est écrit à chaque pas, la simulation
 * reste identique au bit près) ; sa forme de données (`SavedWaterHistory`) va dans la
 * sauvegarde. Aucune allocation par relevé.
 */

/** Séries de l'historique, dans l'ordre du tampon. */
export const WATER_HISTORY_SERIES = [
  'temperature',
  'ammonia',
  'nitrite',
  'nitrate',
  'ph',
] as const satisfies readonly DashboardGaugeId[];

const SERIES_COUNT = WATER_HISTORY_SERIES.length;

/** Nombre de relevés gardés : un par quart d'heure de jeu sur 24 h. */
export const WATER_HISTORY_CAPACITY = 96;

/** Pas de simulation entre deux relevés (journée de 1200 s à 60 pas par seconde, sur 96). */
export const WATER_HISTORY_INTERVAL_TICKS = 750;

/** Version du champ `waterHistory` de la sauvegarde. */
export const WATER_HISTORY_VERSION = 1;

/** Valeur absolue maximale relue d'une sauvegarde. */
const MAX_SAVED_VALUE = 1e6;

/** Tampon de l'historique. Modifié en place par `recordWaterHistory` et `markWaterChange`. */
export interface WaterHistory {
  /** `WATER_HISTORY_CAPACITY` relevés de `WATER_HISTORY_SERIES.length` valeurs (NaN : aucune). */
  readonly values: Float32Array;
  /** 1 si un changement d'eau est marqué sur le relevé de même indice. */
  readonly marks: Uint8Array;
  /** Indice du relevé le plus récent (sans objet tant que `count` vaut 0). */
  head: number;
  /** Nombre de relevés gardés, dans [0, `WATER_HISTORY_CAPACITY`]. */
  count: number;
  /** Tranche de temps du relevé le plus récent (`tick` / intervalle) ; -1 : aucun relevé. */
  lastSlot: number;
  /** Incrémenté à chaque changement : l'interface ne relit le tampon que s'il a bougé. */
  version: number;
}

/** Forme de l'historique dans la sauvegarde : relevés du plus ancien au plus récent. */
export interface SavedWaterHistory {
  readonly version: typeof WATER_HISTORY_VERSION;
  readonly lastSlot: number;
  /** Valeurs à plat, série après série pour chaque relevé, au millième ; `null` : aucune. */
  readonly samples: readonly (number | null)[];
  /** Rangs (dans `samples`, par relevé) des relevés qui portent un changement d'eau. */
  readonly marks: readonly number[];
}

/** Historique lu par l'interface : relevés du plus ancien au plus récent. */
export interface WaterHistoryView {
  /** Nombre de relevés, trous compris. */
  readonly count: number;
  readonly series: Readonly<Record<DashboardGaugeId, readonly number[]>>;
  /** Rangs des relevés qui portent un changement d'eau. */
  readonly marks: readonly number[];
}

/** Historique vide. */
export function createWaterHistory(): WaterHistory {
  return {
    values: new Float32Array(WATER_HISTORY_CAPACITY * SERIES_COUNT).fill(Number.NaN),
    marks: new Uint8Array(WATER_HISTORY_CAPACITY),
    head: 0,
    count: 0,
    lastSlot: -1,
    version: 0,
  };
}

/** Pas restant avant la prochaine tranche de relevé (entre 1 et l'intervalle). */
export function ticksToNextWaterSample(tick: number): number {
  return WATER_HISTORY_INTERVAL_TICKS - (tick % WATER_HISTORY_INTERVAL_TICKS);
}

/**
 * Relève `water` si le pas `tick` ouvre une tranche de temps (multiple exact de l'intervalle)
 * pas encore relevée : c'est ce qui rend l'historique indépendant de la cadence d'affichage.
 * Des tranches sautées deviennent des trous, pour que la courbe reste à l'échelle du temps.
 * Une valeur non finie est gardée comme un trou. Renvoie vrai si un relevé a été écrit.
 */
export function recordWaterHistory(
  history: WaterHistory,
  water: WaterState,
  tick: number,
): boolean {
  return tick % WATER_HISTORY_INTERVAL_TICKS === 0 && writeSlot(history, water, tick);
}

/**
 * Marque un changement d'eau sur le relevé de la tranche du pas `tick` ; s'il n'existe pas
 * encore, il est d'abord pris sur `water`. Sans effet pour un pas invalide ou passé.
 */
export function markWaterChange(history: WaterHistory, water: WaterState, tick: number): void {
  writeSlot(history, water, tick);
  if (history.count === 0 || Math.floor(tick / WATER_HISTORY_INTERVAL_TICKS) !== history.lastSlot) {
    return;
  }
  history.marks[history.head] = 1;
  history.version++;
}

/** Écrit le relevé de la tranche de `tick`, si elle est postérieure à la dernière. */
function writeSlot(history: WaterHistory, water: WaterState, tick: number): boolean {
  if (!Number.isFinite(tick) || tick < 0) {
    return false;
  }
  const slot = Math.floor(tick / WATER_HISTORY_INTERVAL_TICKS);
  if (slot <= history.lastSlot) {
    return false;
  }
  if (history.lastSlot >= 0) {
    const gap = Math.min(slot - history.lastSlot - 1, WATER_HISTORY_CAPACITY);
    for (let i = 0; i < gap; i++) {
      pushSample(history);
    }
  }
  const at = pushSample(history) * SERIES_COUNT;
  for (let s = 0; s < SERIES_COUNT; s++) {
    history.values[at + s] = water[WATER_HISTORY_SERIES[s]!];
  }
  history.lastSlot = slot;
  history.version++;
  return true;
}

/** Place un relevé vide en tête et renvoie son indice. */
function pushSample(history: WaterHistory): number {
  const head = history.count === 0 ? 0 : (history.head + 1) % WATER_HISTORY_CAPACITY;
  history.values.fill(Number.NaN, head * SERIES_COUNT, (head + 1) * SERIES_COUNT);
  history.marks[head] = 0;
  history.head = head;
  history.count = Math.min(history.count + 1, WATER_HISTORY_CAPACITY);
  return head;
}

/** Indice dans le tampon du relevé de rang `rank` (0 : le plus ancien). */
function indexOfRank(history: WaterHistory, rank: number): number {
  const oldest = history.head - history.count + 1 + WATER_HISTORY_CAPACITY;
  return (oldest + rank) % WATER_HISTORY_CAPACITY;
}

/** Rangs des relevés marqués. */
function markedRanks(history: WaterHistory): number[] {
  const ranks: number[] = [];
  for (let rank = 0; rank < history.count; rank++) {
    if (history.marks[indexOfRank(history, rank)] === 1) {
      ranks.push(rank);
    }
  }
  return ranks;
}

/** Copie lisible de l'historique pour l'interface (trous en NaN). */
export function waterHistoryView(history: WaterHistory): WaterHistoryView {
  const seriesOf = (s: number): number[] => {
    const out: number[] = [];
    for (let rank = 0; rank < history.count; rank++) {
      out.push(history.values[indexOfRank(history, rank) * SERIES_COUNT + s]!);
    }
    return out;
  };
  return {
    count: history.count,
    series: {
      temperature: seriesOf(0),
      ammonia: seriesOf(1),
      nitrite: seriesOf(2),
      nitrate: seriesOf(3),
      ph: seriesOf(4),
    },
    marks: markedRanks(history),
  };
}

/** Forme sauvegardée de l'historique. */
export function savedWaterHistory(history: WaterHistory): SavedWaterHistory {
  const samples: (number | null)[] = [];
  for (let rank = 0; rank < history.count; rank++) {
    const at = indexOfRank(history, rank) * SERIES_COUNT;
    for (let s = 0; s < SERIES_COUNT; s++) {
      const value = history.values[at + s]!;
      samples.push(Number.isFinite(value) ? Math.round(value * 1000) / 1000 : null);
    }
  }
  return {
    version: WATER_HISTORY_VERSION,
    lastSlot: history.lastSlot,
    samples,
    marks: markedRanks(history),
  };
}

/** Tampon rempli à partir d'une forme sauvegardée (déjà validée par `readWaterHistory`). */
export function restoreWaterHistory(saved: SavedWaterHistory): WaterHistory {
  const history = createWaterHistory();
  const count = saved.samples.length / SERIES_COUNT;
  for (let rank = 0; rank < count; rank++) {
    const at = rank * SERIES_COUNT;
    for (let s = 0; s < SERIES_COUNT; s++) {
      history.values[at + s] = saved.samples[at + s] ?? Number.NaN;
    }
  }
  for (const rank of saved.marks) {
    history.marks[rank] = 1;
  }
  history.count = count;
  history.head = count === 0 ? 0 : count - 1;
  history.lastSlot = saved.lastSlot;
  return history;
}

/** Copie d'une forme sauvegardée (le monde et sa sauvegarde ne partagent rien). */
export function copySavedWaterHistory(saved: SavedWaterHistory): SavedWaterHistory {
  return { ...saved, samples: [...saved.samples], marks: [...saved.marks] };
}

/** Valide le champ `waterHistory` d'une sauvegarde ; invalide : `null` et un problème noté. */
export function readWaterHistory(value: unknown, problems: string[]): SavedWaterHistory | null {
  const record = value as Partial<Record<keyof SavedWaterHistory, unknown>> | null;
  if (typeof record !== 'object' || record === null || Array.isArray(record)) {
    problems.push('waterHistory doit être un objet');
    return null;
  }
  const { version, lastSlot, samples, marks } = record;
  if (version !== WATER_HISTORY_VERSION) {
    problems.push(`waterHistory.version doit valoir ${WATER_HISTORY_VERSION}`);
    return null;
  }
  if (
    !Array.isArray(samples) ||
    samples.length % SERIES_COUNT !== 0 ||
    samples.length > WATER_HISTORY_CAPACITY * SERIES_COUNT ||
    !samples.every(isSavedValue)
  ) {
    problems.push('waterHistory.samples doit être une liste bornée de relevés complets');
    return null;
  }
  const count = samples.length / SERIES_COUNT;
  if (!Number.isSafeInteger(lastSlot) || (lastSlot as number) < (count === 0 ? -1 : 0)) {
    problems.push('waterHistory.lastSlot doit être un entier valide');
    return null;
  }
  if (
    !Array.isArray(marks) ||
    !marks.every((rank) => Number.isInteger(rank) && rank >= 0 && rank < count)
  ) {
    problems.push('waterHistory.marks doit désigner des relevés existants');
    return null;
  }
  return {
    version: WATER_HISTORY_VERSION,
    lastSlot: lastSlot as number,
    samples: samples as (number | null)[],
    marks: marks as number[],
  };
}

function isSavedValue(value: unknown): boolean {
  return (
    value === null ||
    (typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MAX_SAVED_VALUE)
  );
}

/** Plage tolérée d'une jauge : là où son niveau n'est pas critique ; `null` : aucune. */
export function toleratedRange(
  id: DashboardGaugeId,
  environment: EnvironmentId,
  bands: PhBands,
): { readonly min: number; readonly max: number } | null {
  if (id === 'ph') {
    return bands.tolerated;
  }
  if (id === 'temperature') {
    const target = WATER_TEMPERATURES[environment];
    return { min: target - TEMPERATURE_THRESHOLDS.bad, max: target + TEMPERATURE_THRESHOLDS.bad };
  }
  return { min: 0, max: COMPOUND_THRESHOLDS[id].bad };
}
