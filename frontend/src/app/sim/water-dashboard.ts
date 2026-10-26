import type { EnvironmentId } from './environment';
import {
  MAX_HEATER_TEMPERATURE,
  MIN_HEATER_TEMPERATURE,
  WATER_TEMPERATURES,
  freshWater,
  type WaterState,
} from './water';
import { MAX_PH, MIN_PH, type PhZone } from './water-ph';
import {
  COMPOUND_THRESHOLDS,
  DEFAULT_WATER_READOUT,
  TEMPERATURE_THRESHOLDS,
  gaugeFill,
  levelOf,
  type WaterCompound,
  type WaterQuality,
  type WaterReadout,
} from './water-quality';

/**
 * Valeurs affichées par le tableau de bord de l'eau (issue #256, ADR 0059) : niveau
 * vert / orange / rouge, remplissage et tendance de chaque jauge, préparés hors d'Angular.
 * Fonctions pures, sans hasard ni horloge réelle : la tendance se mesure en pas de
 * simulation (`tick`), jamais en temps réel. Rien ici n'écrit dans le monde.
 */

/** Jauges du tableau de bord, dans l'ordre d'affichage. */
export type DashboardGaugeId = 'temperature' | WaterCompound | 'ph';

/** Jauges, dans l'ordre d'affichage. */
export const DASHBOARD_GAUGES: readonly DashboardGaugeId[] = [
  'temperature',
  'ammonia',
  'nitrite',
  'nitrate',
  'ph',
];

/** Niveau d'une jauge : couleur de zone, toujours doublée d'un texte et d'une icône. */
export type GaugeLevel = 'vert' | 'orange' | 'rouge';

/** Libellé affiché de chaque niveau (pH : `PH_LEVEL_LABELS`). */
export const GAUGE_LEVEL_LABELS: Readonly<Record<GaugeLevel, string>> = {
  vert: 'Bon',
  orange: 'À surveiller',
  rouge: 'Critique',
};

/** Libellé de chaque zone du pH, au niveau qu'elle donne (ADR 0057). */
export const PH_LEVEL_LABELS: Readonly<Record<GaugeLevel, string>> = {
  vert: 'Idéal',
  orange: 'Toléré',
  rouge: 'Hors plage',
};

/** Niveau d'un niveau de qualité (`levelOf`) : bonne → vert, à surveiller → orange, mauvaise → rouge. */
export const QUALITY_LEVELS: Readonly<Record<WaterQuality, GaugeLevel>> = {
  bonne: 'vert',
  'a-surveiller': 'orange',
  mauvaise: 'rouge',
};

/** Niveau de chaque zone du pH. */
export const PH_ZONE_LEVELS: Readonly<Record<PhZone, GaugeLevel>> = {
  ideal: 'vert',
  tolere: 'orange',
  'hors-plage': 'rouge',
};

/** Nom court affiché (étroit) et nom complet (lecteurs d'écran, info-bulle) de chaque jauge. */
export const GAUGE_NAMES: Readonly<
  Record<DashboardGaugeId, { readonly short: string; readonly full: string }>
> = {
  temperature: { short: 'Temp.', full: 'Température' },
  ammonia: { short: 'NH₃/NH₄⁺', full: 'Ammoniaque (NH₃/NH₄⁺)' },
  nitrite: { short: 'NO₂⁻', full: 'Nitrites (NO₂⁻)' },
  nitrate: { short: 'NO₃⁻', full: 'Nitrates (NO₃⁻)' },
  ph: { short: 'pH', full: 'pH' },
};

/**
 * Unité affichée et unité lue de chaque jauge. Les composés sont en **unités de jeu**
 * (`sim/water.ts`), pas en mg/L : l'interface le dit plutôt que d'inventer une unité.
 */
export const GAUGE_UNITS: Readonly<
  Record<DashboardGaugeId, { readonly short: string; readonly spoken: string }>
> = {
  temperature: { short: '°C', spoken: 'degrés' },
  ammonia: { short: 'u.', spoken: 'unités de jeu' },
  nitrite: { short: 'u.', spoken: 'unités de jeu' },
  nitrate: { short: 'u.', spoken: 'unités de jeu' },
  ph: { short: '', spoken: '' },
};

/** Tendance d'une jauge. */
export type Trend = 'hausse' | 'stable' | 'baisse';

/** Texte lu de chaque tendance. */
export const TREND_LABELS: Readonly<Record<Trend, string>> = {
  hausse: 'en hausse',
  stable: 'stable',
  baisse: 'en baisse',
};

/**
 * Écart minimal, sur la fenêtre de tendance, pour qu'une jauge soit en hausse ou en baisse
 * (seuil compris). Calés sur `sim/water.ts` et `sim/water-ph.ts` pour la population par
 * défaut du bac tropical : nitrates +25 par heure (≈ +0,4 par minute), pH −0,25 par heure
 * (≈ −0,004 par minute), température qui rejoint la consigne en une dizaine de minutes.
 */
export const TREND_THRESHOLDS: Readonly<Record<DashboardGaugeId, number>> = {
  temperature: 0.1,
  ammonia: 0.05,
  nitrite: 0.05,
  nitrate: 0.2,
  ph: 0.003,
};

/** Fenêtre de la tendance, en pas de simulation (60 s simulées à `SIM_DT` = 1/60 s). */
export const TREND_WINDOW_TICKS = 3600;

/**
 * Tendance de `current` par rapport à `previous` : hausse si l'écart atteint `threshold`,
 * baisse s'il atteint `-threshold`, stable sinon. Une valeur non finie (de part ou d'autre)
 * ou un seuil invalide (non fini, négatif ou nul) donne « stable » : une flèche ne doit
 * jamais alarmer sur une donnée absente.
 */
export function trendOf(previous: number, current: number, threshold: number): Trend {
  if (!Number.isFinite(previous) || !Number.isFinite(current)) {
    return 'stable';
  }
  if (!Number.isFinite(threshold) || threshold <= 0) {
    return 'stable';
  }
  const delta = current - previous;
  // Écart arrondi au millionième : 0,3 − 0,25 vaut 0,04999… en flottants, et un seuil de
  // 0,05 doit être atteint.
  const rounded = Math.round(delta * 1e6) / 1e6;
  if (rounded >= threshold) {
    return 'hausse';
  }
  return rounded <= -threshold ? 'baisse' : 'stable';
}

/** Valeurs exactes de l'eau à un pas donné, lues par le tableau de bord. Objet de données pur. */
export interface WaterSample {
  /** Pas de simulation du relevé (`world.tick`). */
  readonly tick: number;
  readonly environment: EnvironmentId;
  readonly temperature: number;
  readonly ammonia: number;
  readonly nitrite: number;
  readonly nitrate: number;
  readonly ph: number;
}

/** Relevé exact de l'eau `water` d'un bac de l'environnement `environment` au pas `tick`. */
export function waterSample(
  water: WaterState,
  environment: EnvironmentId,
  tick: number,
): WaterSample {
  return {
    tick,
    environment,
    temperature: water.temperature,
    ammonia: water.ammonia,
    nitrite: water.nitrite,
    nitrate: water.nitrate,
    ph: water.ph,
  };
}

/** Relevé exact d'une eau neuve du bac tropical à t = 0 (valeur initiale de l'interface). */
export const DEFAULT_WATER_SAMPLE: WaterSample = waterSample(freshWater('tropical'), 'tropical', 0);

/**
 * Mémoire de la tendance : `base` est un relevé vieux d'une à deux fenêtres, `checkpoint`
 * le relevé qui le remplacera. Objet de données pur, remplacé à chaque relevé.
 */
export interface TrendState {
  readonly base: WaterSample | null;
  readonly checkpoint: WaterSample | null;
}

/** Mémoire vide (aucune tendance : tout est stable). */
export const EMPTY_TREND_STATE: TrendState = { base: null, checkpoint: null };

/**
 * Mémoire de la tendance après le relevé `sample`. Repart de zéro quand le monde change
 * (autre environnement, pas qui recule, ou saut de plus de deux fenêtres : import d'une
 * sauvegarde, nouveau monde) : comparer deux mondes différents n'a pas de sens.
 */
export function nextTrendState(
  state: TrendState,
  sample: WaterSample,
  window: number = TREND_WINDOW_TICKS,
): TrendState {
  const checkpoint = state.checkpoint;
  if (
    checkpoint === null ||
    checkpoint.environment !== sample.environment ||
    !Number.isFinite(sample.tick) ||
    sample.tick < checkpoint.tick ||
    sample.tick - checkpoint.tick > 2 * window
  ) {
    return { base: null, checkpoint: sample };
  }
  if (sample.tick - checkpoint.tick >= window) {
    return { base: checkpoint, checkpoint: sample };
  }
  return state;
}

/**
 * Tendance de chaque jauge du relevé `sample` par rapport à la référence de `state` (le
 * relevé `base`, à défaut `checkpoint`). Sans référence, ou au même pas : tout est stable.
 */
export function gaugeTrends(
  state: TrendState,
  sample: WaterSample,
): Readonly<Record<DashboardGaugeId, Trend>> {
  const reference = state.base ?? state.checkpoint;
  const trend = (id: DashboardGaugeId): Trend =>
    reference === null || reference.tick === sample.tick
      ? 'stable'
      : trendOf(reference[id], sample[id], TREND_THRESHOLDS[id]);
  return {
    temperature: trend('temperature'),
    ammonia: trend('ammonia'),
    nitrite: trend('nitrite'),
    nitrate: trend('nitrate'),
    ph: trend('ph'),
  };
}

/** Tendances toutes stables. */
export const STABLE_TRENDS: Readonly<Record<DashboardGaugeId, Trend>> = {
  temperature: 'stable',
  ammonia: 'stable',
  nitrite: 'stable',
  nitrate: 'stable',
  ph: 'stable',
};

/** Une jauge prête à afficher. Objet de données pur. */
export interface DashboardGauge {
  readonly id: DashboardGaugeId;
  /** Nom court affiché. */
  readonly label: string;
  /** Nom complet (lecteurs d'écran, info-bulle). */
  readonly name: string;
  /** Valeur affichée, au dixième, virgule décimale (« 25,0 ») ; « – » si elle n'est pas finie. */
  readonly value: string;
  readonly unit: string;
  readonly level: GaugeLevel;
  readonly levelLabel: string;
  /** Part remplie de la jauge, dans [0, 1]. */
  readonly fill: number;
  readonly trend: Trend;
  /** Texte lu complet : « Nitrates : 42,5 unités de jeu, critique, en hausse ». */
  readonly spoken: string;
}

/**
 * Niveau de la température `temperature` dans l'environnement `environment` : écart à sa
 * température (`WATER_TEMPERATURES`), dans un sens comme dans l'autre (`levelOf` : non fini
 * → rouge).
 */
export function temperatureLevel(temperature: number, environment: EnvironmentId): GaugeLevel {
  return QUALITY_LEVELS[
    levelOf(Math.abs(temperature - WATER_TEMPERATURES[environment]), TEMPERATURE_THRESHOLDS)
  ];
}

/** Niveau d'un composé (`levelOf` sur ses seuils : non fini → rouge). */
export function compoundLevel(compound: WaterCompound, value: number): GaugeLevel {
  return QUALITY_LEVELS[levelOf(value, COMPOUND_THRESHOLDS[compound])];
}

/**
 * Part remplie de la jauge de température : position sur [`MIN_HEATER_TEMPERATURE`,
 * `MAX_HEATER_TEMPERATURE`], bornée à [0, 1] (0 si non finie).
 */
export function temperatureFill(temperature: number): number {
  return unitInterval(
    (temperature - MIN_HEATER_TEMPERATURE) / (MAX_HEATER_TEMPERATURE - MIN_HEATER_TEMPERATURE),
  );
}

/** Part remplie de la jauge pH : position sur [`MIN_PH`, `MAX_PH`], bornée à [0, 1]. */
export function phFill(ph: number): number {
  return unitInterval((ph - MIN_PH) / (MAX_PH - MIN_PH));
}

/** Nombre au dixième, virgule décimale (« 25,0 », « 0,8 ») ; « – » s'il n'est pas fini. */
export function formatTenth(value: number): string {
  return Number.isFinite(value)
    ? (Math.round(value * 10) / 10 + 0).toFixed(1).replace('.', ',')
    : '–';
}

/**
 * Jauges du tableau de bord : niveaux calculés sur les valeurs exactes de `sample` (et la
 * zone du pH de `readout`, pour les espèces présentes), valeurs affichées au dixième,
 * tendances `trends`. Bac sans animal : toute l'échelle du pH est idéale (`phBands`).
 */
export function dashboardGauges(
  sample: WaterSample,
  readout: Pick<WaterReadout, 'phZone'>,
  trends: Readonly<Record<DashboardGaugeId, Trend>> = STABLE_TRENDS,
): readonly DashboardGauge[] {
  return DASHBOARD_GAUGES.map((id) => {
    const raw = sample[id];
    const level =
      id === 'temperature'
        ? temperatureLevel(raw, sample.environment)
        : id === 'ph'
          ? PH_ZONE_LEVELS[readout.phZone]
          : compoundLevel(id, raw);
    const fill =
      id === 'temperature' ? temperatureFill(raw) : id === 'ph' ? phFill(raw) : gaugeFill(id, raw);
    const levelLabel = (id === 'ph' ? PH_LEVEL_LABELS : GAUGE_LEVEL_LABELS)[level];
    const value = formatTenth(raw);
    const unit = GAUGE_UNITS[id];
    const trend = trends[id];
    const reading = unit.spoken === '' ? value : `${value} ${unit.spoken}`;
    return {
      id,
      label: GAUGE_NAMES[id].short,
      name: GAUGE_NAMES[id].full,
      value,
      unit: unit.short,
      level,
      levelLabel,
      fill,
      trend,
      spoken: `${GAUGE_NAMES[id].full} : ${reading}, ${levelLabel.toLowerCase()}, ${TREND_LABELS[trend]}`,
    };
  });
}

/** Jauges d'une eau neuve du bac tropical (valeur initiale de l'interface). */
export const DEFAULT_DASHBOARD_GAUGES: readonly DashboardGauge[] = dashboardGauges(
  DEFAULT_WATER_SAMPLE,
  DEFAULT_WATER_READOUT,
);

/** Nombre ramené dans [0, 1] ; non fini : 0. */
function unitInterval(ratio: number): number {
  if (!Number.isFinite(ratio)) {
    return 0;
  }
  return Math.min(1, Math.max(0, ratio));
}
