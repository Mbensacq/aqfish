import { signal } from '@angular/core';

import {
  carryClock,
  DEFAULT_DAY_CLOCK,
  freezeClockAt,
  hourAt,
  toggleClock,
  type DayClock,
} from '../../sim/daylight';
import { DEFAULT_SIM_SPEED, isSimSpeed, type SimSpeed } from '../../sim/sim-speed';
import type { AquariumProbe } from './aquarium-probe';

/** Ce dont l'horloge et la vitesse ont besoin de l'hôte (#696). */
export interface ClockPorts {
  /** Attributs `data-aqfish-*` de l'hôte. */
  readonly probe: AquariumProbe;
  /** Vrai après le démarrage (un monde est affiché). */
  hasWorld(): boolean;
  isCapture(): boolean;
  /** Temps simulé de l'image affichée, en secondes. */
  renderTime(): number;
  /** Éclairage recalculé pour l'heure courante. */
  relight(): void;
  scheduleFrame(): void;
}

/**
 * Horloge de la journée simulée (ADR 0018) et vitesse de simulation (#52) : heure figée ou en
 * marche (touche `H`, case du panneau), heure fixée (#75), vitesse. Sorti de l'hôte au lot 10
 * de l'assainissement (#696), sans changement de comportement.
 */
export class ClockController {
  /** Vrai si l'heure est figée (curseur, touches `H`, `J`, `N`, `heure=`, mode capture). */
  readonly clockFrozen = signal(false);
  /** Vitesse de simulation (#52) : multiplie le temps réel versé à la boucle à pas fixe. */
  readonly speed = signal<SimSpeed>(DEFAULT_SIM_SPEED);
  /** Horloge de la journée simulée (ADR 0018) : l'heure suit `world.time`. */
  private clock: DayClock = DEFAULT_DAY_CLOCK;

  constructor(private readonly ports: ClockPorts) {}

  /** Horloge courante, enregistrée avec les réglages de la sauvegarde. */
  get dayClock(): DayClock {
    return this.clock;
  }

  /** Remplace l'horloge (démarrage, sauvegarde relue) ; `refreshFrozen` l'expose. */
  set dayClock(clock: DayClock) {
    this.clock = clock;
  }

  /** Heure de la journée affichée, dans [0, 24) (`null` avant le démarrage). */
  hour(): number | null {
    return this.ports.hasWorld() ? hourAt(this.clock, this.ports.renderTime()) : null;
  }

  /**
   * Fige l'heure ou la remet en marche (touche `H`), sans saut d'heure. Sans effet en mode
   * capture (l'heure y est toujours figée : contrat de capture).
   */
  toggle(): void {
    if (!this.ports.hasWorld() || this.ports.isCapture()) {
      return;
    }
    this.clock = toggleClock(this.clock, this.ports.renderTime());
    this.changed();
  }

  /** Remet l'heure en marche (`true`) ou la fige (`false`), si elle n'y est pas déjà (#52). */
  setRunning(running: boolean): void {
    if (this.ports.hasWorld() && running === this.clock.frozen) {
      this.toggle();
    }
  }

  /**
   * Fige l'heure à `hour` (touches « plein jour » et « nuit », #75), que l'horloge tourne ou
   * non. Sans effet en mode capture ou si `hour` n'est pas un réel fini.
   */
  freezeAt(hour: number): void {
    if (!this.ports.hasWorld() || this.ports.isCapture() || !Number.isFinite(hour)) {
      return;
    }
    this.clock = freezeClockAt(this.clock, hour);
    this.changed();
  }

  /**
   * Garde l'heure sans saut quand le temps simulé affiché passe de `fromTime` à celui du
   * nouveau monde (`carryClock`, changement d'environnement).
   */
  carryFrom(fromTime: number): void {
    this.clock = carryClock(this.clock, fromTime, this.ports.renderTime());
  }

  /**
   * Change la vitesse de simulation (#52) : seul le temps réel versé à la boucle est
   * multiplié. Sans effet en mode capture, avant le démarrage ou hors de `SIM_SPEEDS`.
   */
  setSpeed(speed: number): void {
    if (!this.ports.hasWorld() || this.ports.isCapture() || !isSimSpeed(speed)) {
      return;
    }
    this.applySpeed(speed);
  }

  /** Pose la vitesse et l'expose (`data-aqfish-speed`), sans condition. */
  applySpeed(speed: SimSpeed): void {
    this.speed.set(speed);
    this.ports.probe.publishSpeed(speed);
  }

  /** Expose l'état de l'horloge (`data-aqfish-hour-frozen` et signal `clockFrozen`). */
  refreshFrozen(): void {
    this.clockFrozen.set(this.clock.frozen);
    this.ports.probe.publishHourFrozen(this.clock.frozen);
  }

  private changed(): void {
    this.ports.relight();
    this.refreshFrozen();
    this.ports.scheduleFrame();
  }
}
