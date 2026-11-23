import { algaeCoverage } from '../algae';
import { DEFAULT_DAY_LENGTH_SECONDS } from '../daylight';
import {
  advanceEcosystemInPlace,
  ECOSYSTEM_STEP_SECONDS,
  feedAnimalsInPlace,
} from '../ecosystem-step';
import { MAINTENANCE_PERIOD_DAYS } from '../maintenance';
import { changeWaterInPlace, WATER_CHANGE_SHARE, type MutableWaterState } from '../water';
import { WATER_QUALITIES, waterQuality, type WaterQuality } from '../water-quality';
import { cloneWorld } from '../world';
import type { World } from '../world-types';

/**
 * Harnais des scénarios de référence de l'écosystème (issue #799, `docs/ECOSYSTEME.md` § 4) :
 * un bac, un entretien, une durée ; le harnais fait tourner le bac à gros pas
 * (`sim/ecosystem-step.ts`) et relève ce qu'il faut pour juger de l'issue (pics, qualité de
 * l'eau, santé, algues). Ce n'est pas une spec : l'importer n'enregistre aucun test. Hors du
 * build de l'application (`tsconfig.app.json`) et des mutants (`stryker.config.json`).
 */

const NO_PEAK: ScenarioPeak = { value: 0, day: 0 };

/** Durée d'un jour de jeu, en secondes simulées. */
export const SCENARIO_DAY_SECONDS = DEFAULT_DAY_LENGTH_SECONDS;

/** Entretien d'un scénario. */
export interface ScenarioCare {
  /**
   * Période des repas, en secondes simulées, multiple de `ECOSYSTEM_STEP_SECONDS` ; absente :
   * jamais nourri.
   */
  readonly feedEverySeconds?: number;
  /** Période des changements d'eau, en jours de jeu ; absente : jamais. */
  readonly waterChangeEveryDays?: number;
  /** Part d'eau changée, dans [0, 1] (défaut : `WATER_CHANGE_SHARE`). */
  readonly waterChangeShare?: number;
}

/**
 * Entretien normal : un repas par minute simulée (la faim d'un guppy, pleine en 150 s, ne
 * doit jamais atteindre son maximum) et changement d'eau à la période du calendrier d'entretien
 * (`MAINTENANCE_PERIOD_DAYS.waterChange`), de la part par défaut.
 */
export const NORMAL_CARE: ScenarioCare = {
  feedEverySeconds: 60,
  waterChangeEveryDays: MAINTENANCE_PERIOD_DAYS.waterChange,
  waterChangeShare: WATER_CHANGE_SHARE,
};

/** Scénario : bac de départ (jamais modifié), volume imposé, entretien, durée. */
export interface EcosystemScenario {
  readonly world: World;
  /** Volume d'eau imposé, en litres (défaut : celui du monde). */
  readonly liters?: number;
  readonly care: ScenarioCare;
  /** Durée, en jours de jeu. */
  readonly days: number;
}

/** Pic d'un composé : valeur maximale (mg/L) et jour de jeu où elle est atteinte. */
export interface ScenarioPeak {
  readonly value: number;
  readonly day: number;
}

/** Relevé d'un scénario, après chaque pas long. */
export interface ScenarioRecord {
  readonly ammonia: ScenarioPeak;
  readonly nitrite: ScenarioPeak;
  readonly nitrate: ScenarioPeak;
  /** Pire qualité de l'eau rencontrée. */
  readonly worstQuality: WaterQuality;
  /** Premier jour de jeu (fractionnaire) où l'eau est « mauvaise » ; `null` : jamais. */
  readonly firstBadDay: number | null;
  /** Santé la plus basse d'un animal. */
  readonly minHealth: number;
  /** Couverture d'algues la plus haute (`algaeCoverage`). */
  readonly maxAlgae: number;
  /** Bac à la fin du scénario. */
  readonly world: World;
}

/** Fait tourner `scenario` et renvoie son relevé. Déterministe : aucun hasard. */
export function runScenario(scenario: EcosystemScenario): ScenarioRecord {
  const world = cloneWorld(scenario.world);
  const { care, liters } = scenario;
  const step = ECOSYSTEM_STEP_SECONDS;
  const total = Math.round((scenario.days * SCENARIO_DAY_SECONDS) / step);
  const feedEvery = (care.feedEverySeconds ?? 0) / step;
  const changeEvery = ((care.waterChangeEveryDays ?? 0) * SCENARIO_DAY_SECONDS) / step;
  const share = care.waterChangeShare ?? WATER_CHANGE_SHARE;
  const recorder = new Recorder();
  for (let i = 0; i < total; i++) {
    if (feedEvery > 0 && i % feedEvery === 0) {
      feedAnimalsInPlace(world, liters);
    }
    if (changeEvery > 0 && i > 0 && i % changeEvery === 0) {
      changeWaterInPlace(world.water as MutableWaterState, world.environment, share);
    }
    advanceEcosystemInPlace(world, step, { liters });
    recorder.record(world, ((i + 1) * step) / SCENARIO_DAY_SECONDS);
  }
  return recorder.result(world);
}

/** Relevé en cours d'un scénario. */
class Recorder {
  private readonly peaks = { ammonia: NO_PEAK, nitrite: NO_PEAK, nitrate: NO_PEAK };
  private worst = 0;
  private firstBadDay: number | null = null;
  private minHealth = 1;
  private maxAlgae = 0;

  record(world: World, day: number): void {
    for (const compound of ['ammonia', 'nitrite', 'nitrate'] as const) {
      if (world.water[compound] > this.peaks[compound].value) {
        this.peaks[compound] = { value: world.water[compound], day };
      }
    }
    const quality = waterQuality(world.water, world.environment);
    this.worst = Math.max(this.worst, WATER_QUALITIES.indexOf(quality));
    if (this.firstBadDay === null && quality === 'mauvaise') {
      this.firstBadDay = day;
    }
    for (const animal of world.entities) {
      this.minHealth = Math.min(this.minHealth, animal.health);
    }
    this.maxAlgae = Math.max(this.maxAlgae, algaeCoverage(world.water.algae));
  }

  result(world: World): ScenarioRecord {
    return {
      ...this.peaks,
      worstQuality: WATER_QUALITIES[this.worst],
      firstBadDay: this.firstBadDay,
      minHealth: this.minHealth,
      maxAlgae: this.maxAlgae,
      world,
    };
  }
}
