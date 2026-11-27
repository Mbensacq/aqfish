import { signal } from '@angular/core';

import type { DayClock } from '../../sim/daylight';
import {
  advanceFirstTankPath,
  createFirstTankPath,
  firstTankFacts,
  firstTankPathAvailable,
  firstTankPathView,
  type FirstTankPathState,
  type FirstTankPathView,
} from '../../sim/first-tank-path';
import {
  addJournalEntry,
  carryJournalWatches,
  createJournal,
  journalLines,
  observeJournal,
  restoreJournal,
  savedJournal,
  watchJournal,
  type Journal,
  type JournalLine,
  type JournalWatch,
} from '../../sim/journal';
import {
  initialMaintenance,
  MAINTENANCE_TASKS,
  maintenanceReadout,
  sameMaintenanceReadout,
  type MaintenanceReadout,
  type MaintenanceTask,
} from '../../sim/maintenance';
import { reproductionSummary, reproductionText } from '../../sim/reproduction-summary';
import { worldAlerts } from '../../sim/tank-list';
import {
  createWaterHistory,
  recordWaterHistory,
  restoreWaterHistory,
  savedWaterHistory,
  ticksToNextWaterSample,
  waterHistoryView,
  type WaterHistory,
  type WaterHistoryView,
} from '../../sim/water-history';
import {
  advanceInPlace,
  recordWorldMaintenanceInPlace,
  worldHasPrunablePlants,
} from '../../sim/world';
import type { MutableWorld, World } from '../../sim/world-types';

/** Ce dont le suivi du bac a besoin de l'hôte (#696). */
export interface TankRecordsPorts {
  /** Mode capture : rien n'est suivi ni publié, le monde reste inchangé. */
  isCapture(): boolean;
}

/**
 * Suivi du bac affiché, gardé hors du monde pendant la partie : calendrier d'entretien (#513),
 * historique de l'eau (#511), journal (#581) et parcours « Mon premier aquarium » (#512). Chaque
 * suivi est repris de la sauvegarde au premier accès et n'est inscrit dans le monde qu'à la
 * sauvegarde, à l'export ou au changement de bac (`keep…`) : un bac relu et sans pas nouveau
 * reste identique au bit près. Sorti de l'hôte au lot 10 de l'assainissement (#696), sans
 * changement de comportement.
 */
export class TankRecordsController {
  /** Calendrier d'entretien du bac affiché (#513) ; `null` en capture. */
  readonly maintenance = signal<MaintenanceReadout | null>(null, {
    equal: sameMaintenanceReadout,
  });
  /** Historique de l'eau du bac affiché (#511), recopié à chaque relevé nouveau ; `null` en capture. */
  readonly waterHistory = signal<WaterHistoryView | null>(null);
  /** Journal du bac affiché (#581), du plus récent au plus ancien ; vide en capture. */
  readonly journal = signal<readonly JournalLine[]>([]);
  /** Bilan de reproduction des derniers jours du bac affiché (#677) ; `null` en capture. */
  readonly reproduction = signal<string | null>(null);
  /** Parcours « Mon premier aquarium » du bac affiché (#512) ; `null` : non proposé. */
  readonly firstTankPath = signal<FirstTankPathView | null>(null);

  /** Temps du premier relevé d'entretien de chaque monde sans calendrier (#513). */
  private readonly maintenanceStarts = new WeakMap<World, number>();
  /** Historique de l'eau de chaque monde affiché (#511). */
  private readonly waterHistories = new WeakMap<World, WaterHistory>();
  /** Journal de chaque monde affiché (#581). */
  private readonly journals = new WeakMap<World, Journal>();
  /** Dernière observation du journal de chaque monde affiché (#581). */
  private readonly journalWatches = new WeakMap<World, JournalWatch>();
  /** Parcours guidé de chaque monde (#512). */
  private readonly firstTankPaths = new WeakMap<World, FirstTankPathState>();
  private shownJournal: Journal | null = null;
  private shownJournalVersion = -1;
  /** Tampon et version du dernier historique exposé. */
  private shownHistory: WaterHistory | null = null;
  private shownHistoryVersion = -1;
  /** Dernier état de parcours publié dans `firstTankPath` (`null` : aucun). */
  private shownFirstTankPath: FirstTankPathState | null = null;

  constructor(private readonly ports: TankRecordsPorts) {}

  /**
   * Publie le suivi du bac affiché, au rythme des relevés de l'eau : calendrier, historique,
   * journal puis parcours, dans cet ordre. Jamais en capture.
   */
  refresh(world: MutableWorld): void {
    this.refreshMaintenance(world);
    this.refreshWaterHistory(world);
    this.refreshJournal(world);
    this.refreshFirstTankPath(world);
  }

  /** Temps du premier relevé d'un monde sans calendrier : début de son suivi (#513). */
  maintenanceStartOf(world: World): number {
    let start = this.maintenanceStarts.get(world);
    if (start === undefined) {
      start = world.time;
      this.maintenanceStarts.set(world, start);
    }
    return start;
  }

  /** Enregistre une tâche faite ; le suivi commence au premier relevé du monde. */
  recordMaintenance(world: MutableWorld, task: MaintenanceTask): void {
    world.maintenance ??= initialMaintenance(this.maintenanceStartOf(world));
    recordWorldMaintenanceInPlace(world, task);
  }

  /**
   * Inscrit dans `world` le début du suivi une fois le bac avancé, à la sauvegarde
   * automatique seulement (#513) : la simulation et un bac relu restent identiques au bit près.
   * Sans effet sans monde, en capture ou si le monde a déjà son calendrier.
   */
  keepMaintenanceStart(world: MutableWorld | null): void {
    if (world && !this.ports.isCapture() && world.maintenance === undefined) {
      const start = this.maintenanceStartOf(world);
      if (world.time > start) {
        world.maintenance = initialMaintenance(start);
      }
    }
  }

  /**
   * Avance le bac affiché de `steps` pas, coupés aux frontières de relevé (#511) : l'historique
   * ne dépend pas de la cadence d'affichage. Rythme du jour (#209) : `clock`.
   */
  advanceAndRecord(world: MutableWorld, steps: number, clock: DayClock): void {
    const history = this.waterHistoryOf(world);
    let left = steps;
    while (left > 0) {
      const count = Math.min(left, ticksToNextWaterSample(world.tick));
      advanceInPlace(world, count, clock);
      left -= count;
      recordWaterHistory(history, world.water, world.tick);
    }
  }

  /** Tampon d'historique de `world`, repris de sa sauvegarde au premier accès (#511). */
  waterHistoryOf(world: World): WaterHistory {
    let history = this.waterHistories.get(world);
    if (history === undefined) {
      history =
        world.waterHistory === undefined
          ? createWaterHistory()
          : restoreWaterHistory(world.waterHistory);
      this.waterHistories.set(world, history);
    }
    return history;
  }

  /**
   * Inscrit l'historique dans le monde, à la sauvegarde ou au changement de bac seulement
   * (#511) : un bac sans relevé nouveau reste identique à sa sauvegarde, au bit près.
   */
  keepWaterHistory(world: MutableWorld): void {
    const history = this.waterHistories.get(world);
    if (history !== undefined && history.count > 0) {
      world.waterHistory = savedWaterHistory(history);
    }
  }

  /** Journal de `world`, repris de sa sauvegarde au premier accès (#581). */
  journalOf(world: World): Journal {
    let journal = this.journals.get(world);
    if (journal === undefined) {
      journal = world.journal === undefined ? createJournal() : restoreJournal(world.journal);
      this.journals.set(world, journal);
    }
    return journal;
  }

  /**
   * Inscrit le journal dans le monde, à la sauvegarde ou au changement de bac seulement
   * (#581) : un bac sans événement nouveau reste identique à sa sauvegarde, au bit près.
   */
  keepJournal(world: MutableWorld): void {
    const journal = this.journals.get(world);
    if (journal !== undefined && journal.entries.length > 0) {
      world.journal = savedJournal(journal);
    }
  }

  /**
   * Reporte la dernière observation du journal de chaque ancien monde sur son nouveau monde
   * (rattrapage, transfert, #581) : aucun événement n'est écrit deux fois ni perdu.
   */
  carryJournalWatches(pairs: Iterable<readonly [World, World]>): void {
    carryJournalWatches(this.journalWatches, pairs);
  }

  /**
   * Avance et publie le parcours du bac affiché (#512), jamais en capture (monde inchangé) ni
   * en mode décor (eau en pause). Hors du monde (piège du cycle 176), sans allocation de vue
   * tant qu'aucune étape ne change.
   */
  refreshFirstTankPath(world: World): void {
    if (this.ports.isCapture()) {
      return;
    }
    if (!firstTankPathAvailable(world.environment) || world.careMode === 'decor') {
      this.shownFirstTankPath = null;
      this.firstTankPath.set(null);
      return;
    }
    const facts = firstTankFacts(world);
    const state = advanceFirstTankPath(
      this.firstTankPaths.get(world) ?? world.firstTankPath ?? createFirstTankPath(facts),
      facts,
    );
    this.firstTankPaths.set(world, state);
    if (state !== this.shownFirstTankPath) {
      this.shownFirstTankPath = state;
      this.firstTankPath.set(firstTankPathView(state));
    }
  }

  /**
   * Inscrit le parcours dans le monde, à la sauvegarde automatique, à l'export ou au changement
   * de bac seulement, une fois le bac avancé (#512), comme le début du suivi d'entretien : un
   * bac relu et sans pas nouveau reste identique, au bit près.
   */
  keepFirstTankPath(world: MutableWorld): void {
    const state = this.firstTankPaths.get(world);
    if (state !== undefined && world.time > state.startedAt) {
      world.firstTankPath = state;
    }
  }

  /** Calendrier d'entretien du bac affiché (#513) ; jamais en capture (monde inchangé). */
  private refreshMaintenance(world: MutableWorld): void {
    if (this.ports.isCapture()) {
      return;
    }
    const state = world.maintenance ?? initialMaintenance(this.maintenanceStartOf(world));
    this.maintenance.set(
      maintenanceReadout(
        state,
        world.time,
        worldHasPrunablePlants(world)
          ? MAINTENANCE_TASKS
          : MAINTENANCE_TASKS.filter((task) => task !== 'prune'),
      ),
    );
  }

  /** Publie l'historique du bac affiché s'il a changé (#511) ; jamais en capture. */
  private refreshWaterHistory(world: World): void {
    if (this.ports.isCapture()) {
      return;
    }
    const history = this.waterHistoryOf(world);
    if (history !== this.shownHistory || history.version !== this.shownHistoryVersion) {
      this.shownHistory = history;
      this.shownHistoryVersion = history.version;
      this.waterHistory.set(waterHistoryView(history));
    }
  }

  /**
   * Observe le bac affiché au rythme des relevés (#581) : maladies, guérisons, pontes,
   * éclosions et alertes franchies (#592) survenues depuis la dernière observation entrent au
   * journal (le premier regard sur un bac n'écrit rien ; un bac rangé garde sa dernière
   * observation, reportée par `carryJournalWatches`), puis publie le journal s'il a changé.
   * Jamais en capture.
   */
  private refreshJournal(world: World): void {
    if (this.ports.isCapture()) {
      return;
    }
    const journal = this.journalOf(world);
    const watch = this.journalWatches.get(world);
    const subject = {
      time: world.time,
      entities: world.entities,
      ...(world.eggs === undefined ? {} : { eggs: world.eggs }),
      ...(world.dead === undefined ? {} : { dead: world.dead }),
      alerts: worldAlerts(world),
    };
    if (watch === undefined) {
      this.journalWatches.set(world, watchJournal(subject));
    } else {
      for (const entry of observeJournal(watch, subject)) {
        addJournalEntry(journal, entry);
      }
    }
    if (journal !== this.shownJournal || journal.version !== this.shownJournalVersion) {
      this.shownJournal = journal;
      this.shownJournalVersion = journal.version;
      this.journal.set(journalLines(journal));
    }
    // Relu à chaque relevé : la période glisse avec les jours ; le texte, inchangé, ne republie rien.
    this.reproduction.set(reproductionText(reproductionSummary(journal.entries, world.time)));
  }
}
