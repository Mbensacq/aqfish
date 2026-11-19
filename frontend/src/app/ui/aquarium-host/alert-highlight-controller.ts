import { signal } from '@angular/core';

import type { AquariumView } from '../../render/aquarium-view';
import {
  alertTargets,
  NO_ALERT_TARGETS,
  sameAlertTargets,
  type AlertTargets,
} from '../../sim/alert-animals';
import { mixWarnings } from '../../sim/compatibility';
import { environmentById } from '../../sim/environment';
import type { PopulationCounts } from '../../sim/population';
import type { World } from '../../sim/world-types';
import type { AquariumProbe } from './aquarium-probe';

/** Durée de la mise en évidence depuis une alerte (#483), en millisecondes de temps réel. */
export const ALERT_HIGHLIGHT_MS = 6000;

/** Ce dont les alertes ont besoin de l'hôte (#696). */
export interface AlertHighlightPorts {
  /** Attributs `data-aqfish-*` de l'hôte. */
  readonly probe: AquariumProbe;
  /** Vue courante, `null` avant le démarrage. */
  view(): AquariumView | null;
  /** Monde affiché, `null` avant le démarrage. */
  world(): World | null;
  isCapture(): boolean;
}

/**
 * Animaux désignés par chaque alerte du tableau de bord (#483) et leur mise en évidence dans
 * la scène, en temps réel. Rien n'est écrit dans le monde. Sorti de l'hôte au lot 10 de
 * l'assainissement (#696), sans changement de comportement.
 */
export class AlertHighlightController {
  /** Animaux désignés par chaque alerte (#483), relevés avec l'eau, remplacés s'ils changent. */
  readonly alertAnimals = signal<AlertTargets>(NO_ALERT_TARGETS, { equal: sameAlertTargets });
  /** Nombre d'animaux mis en évidence depuis une alerte (#483) ; 0 : aucun. */
  readonly highlightedAnimals = signal(0);
  /** Fin de la mise en évidence en cours (#483). */
  private highlightTimer: ReturnType<typeof setTimeout> | null = null;
  /** Monde de la mise en évidence : elle cesse si le bac affiché change. */
  private highlightWorld: World | null = null;

  constructor(private readonly ports: AlertHighlightPorts) {}

  /**
   * Animaux désignés par chaque alerte pour le bac `world` peuplé de `population` ; la mise en
   * évidence cesse au changement de bac.
   */
  refresh(world: World, population: PopulationCounts): void {
    this.alertAnimals.set(
      alertTargets(world.entities, {
        temperature: world.water.temperature,
        ph: world.water.ph,
        mixes: mixWarnings(environmentById(world.environment).species, population),
      }),
    );
    if (this.highlightWorld !== null && this.highlightWorld !== world) {
      this.clear();
    }
  }

  /**
   * Met en évidence dans la scène les animaux `ids` pendant `ALERT_HIGHLIGHT_MS` (#483). Temps
   * réel : la mise en évidence vaut aussi simulation en pause.
   */
  highlight(ids: readonly number[]): void {
    const world = this.ports.world();
    if (!world || this.ports.isCapture() || ids.length === 0) {
      return;
    }
    this.clear();
    this.highlightWorld = world;
    this.ports.view()?.setAlertHighlight(ids);
    this.highlightedAnimals.set(ids.length);
    this.ports.probe.publishAlertHighlight(ids.length);
    this.highlightTimer = setTimeout(() => this.clear(), ALERT_HIGHLIGHT_MS);
  }

  /** Fin de la mise en évidence (minuterie annulée). */
  clear(): void {
    if (this.highlightTimer !== null) {
      clearTimeout(this.highlightTimer);
      this.highlightTimer = null;
    }
    this.highlightWorld = null;
    this.ports.view()?.setAlertHighlight([]);
    this.highlightedAnimals.set(0);
    this.ports.probe.publishAlertHighlight(0);
  }
}
