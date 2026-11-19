import { addJournalEntry, waterChangeEntry, type Journal } from '../../sim/journal';
import type { MaintenanceTask } from '../../sim/maintenance';
import { isCurrentLevel, nextCurrentLevel, type CurrentLevel } from '../../sim/water-current';
import { markWaterChange, type WaterHistory } from '../../sim/water-history';
import {
  changeWorldWaterInPlace,
  refillWorldFeederInPlace,
  setWorldCatappaInPlace,
  setWorldCurrentInPlace,
  setWorldFeederInPlace,
  setWorldHeaterInPlace,
  setWorldLampOnInPlace,
  setWorldLightingInPlace,
} from '../../sim/world';
import type { MutableWorld, World } from '../../sim/world-types';

/** Ce dont les réglages de l'eau ont besoin de l'hôte (#696). */
export interface WaterSettingsPorts {
  /** Monde affiché, `null` avant le démarrage. */
  world(): MutableWorld | null;
  isCapture(): boolean;
  /** Suivi du bac (#511, #513, #581), hors du monde. */
  readonly records: {
    recordMaintenance(world: MutableWorld, task: MaintenanceTask): void;
    waterHistoryOf(world: World): WaterHistory;
    journalOf(world: World): Journal;
  };
  /** Force du courant affichée (#460). */
  currentLevel(): CurrentLevel;
  refreshWater(): void;
  refreshCurrent(world: World): void;
  saveNow(): void;
  scheduleFrame(): void;
}

/**
 * Réglages de l'eau du bac affiché par l'utilisateur : changement d'eau (#207), chauffage,
 * éclairage et lampe (#476, #584), distributeur (#583), catappa (#239), courant (#460) et
 * tâches d'entretien sans geste (#513). Chacun est suivi d'un relevé, d'un enregistrement et
 * d'une image. Sorti de l'hôte au lot 10 de l'assainissement (#696), sans changement de
 * comportement.
 */
export class WaterSettingsController {
  constructor(private readonly ports: WaterSettingsPorts) {}

  /**
   * Réglage de l'eau par l'utilisateur : appliqué au monde courant, puis relevé et
   * enregistrement. Sans effet en mode capture, avant le démarrage ou si `apply` lève.
   */
  apply(apply: (world: MutableWorld) => void): void {
    const { ports } = this;
    const world = ports.world();
    if (!world || ports.isCapture()) {
      return;
    }
    try {
      apply(world);
    } catch {
      return;
    }
    ports.refreshWater();
    ports.saveNow();
    ports.scheduleFrame();
  }

  /**
   * Changement d'eau (#207) : retire une part des composés dissous (`changeWorldWaterInPlace`),
   * noté à l'entretien, à l'historique et au journal, puis enregistre. Sans effet en mode
   * capture ou avant le démarrage.
   */
  changeWater(): void {
    const { ports } = this;
    const world = ports.world();
    if (!world || ports.isCapture()) {
      return;
    }
    changeWorldWaterInPlace(world);
    ports.records.recordMaintenance(world, 'waterChange');
    markWaterChange(ports.records.waterHistoryOf(world), world.water, world.tick);
    addJournalEntry(ports.records.journalOf(world), waterChangeEntry(world.time));
    ports.refreshWater();
    ports.saveNow();
    ports.scheduleFrame();
  }

  /** Marque faite une tâche d'entretien sans geste dans le jeu (filtre, test de l'eau, #513). */
  markMaintenanceDone(task: MaintenanceTask): void {
    this.apply((world) => this.ports.records.recordMaintenance(world, task));
  }

  /** Consigne du chauffage (#207), en °C ; sans effet hors bornes. */
  setHeater(temperature: number): void {
    this.apply((world) => setWorldHeaterInPlace(world, temperature));
  }

  /** Durée d'éclairage (#476), en heures entières par jour ; sans effet hors bornes. */
  setLighting(hours: number): void {
    this.apply((world) => {
      if (!setWorldLightingInPlace(world, hours)) {
        throw new RangeError('éclairage hors bornes');
      }
    });
  }

  /** Heure d'allumage de la lampe (#584), de 0 à 23 ; sans effet hors bornes. */
  setLampOn(hour: number): void {
    this.apply((world) => {
      if (!setWorldLampOnInPlace(world, hour)) {
        throw new RangeError('heure d’allumage hors bornes');
      }
    });
  }

  /** Pose, règle (1 à 4 heures) ou retire (`null`) le distributeur (#583). */
  setFeeder(hours: readonly number[] | null): void {
    this.apply((world) => {
      if (!setWorldFeederInPlace(world, hours)) {
        throw new RangeError('distributeur impossible');
      }
    });
  }

  /** Remplit le distributeur automatique (#583) : 14 rations. Sans effet sans distributeur. */
  refillFeeder(): void {
    this.apply((world) => {
      refillWorldFeederInPlace(world);
    });
  }

  /** Nombre de feuilles de catappa (#239), de 0 à `MAX_CATAPPA_LEAVES`. */
  setCatappa(count: number): void {
    this.apply((world) => setWorldCatappaInPlace(world, count));
  }

  /**
   * Règle la force du courant du bac (#460, ADR 0108), puis enregistre. Sans effet en mode
   * capture (le courant passe par `courant=`), avant le démarrage ou pour une force inconnue.
   */
  setCurrent(level: CurrentLevel): void {
    const { ports } = this;
    const world = ports.world();
    if (!world || ports.isCapture() || !isCurrentLevel(level)) {
      return;
    }
    setWorldCurrentInPlace(world, level);
    ports.refreshCurrent(world);
    ports.saveNow();
    ports.scheduleFrame();
  }

  /** Force suivante du courant (bouton du panneau, #460) : coupé, doux, fort. */
  cycleCurrent(): void {
    this.setCurrent(nextCurrentLevel(this.ports.currentLevel()));
  }
}
