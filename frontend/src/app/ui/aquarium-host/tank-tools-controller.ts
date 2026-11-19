import { signal } from '@angular/core';

import type { AquariumView } from '../../render/aquarium-view';
import type { DecorPick } from '../../render/decor-pick';
import { addPruneEntry, type Journal } from '../../sim/journal';
import type { MaintenanceTask } from '../../sim/maintenance';
import { netTarget } from '../../sim/mortality';
import {
  pruneWorldPlantInPlace,
  removeDeadInPlace,
  scrapeWorldAlgaeInPlace,
} from '../../sim/world';
import type { MutableWorld, World } from '../../sim/world-types';
import type { AquariumProbe } from './aquarium-probe';

/** Rayon dans le repère du bac : origine et direction. */
type Ray3 = readonly [number, number, number];

/** Ce dont les outils en main ont besoin de l'hôte (#696). */
export interface TankToolsPorts {
  /** Attributs `data-aqfish-*` de l'hôte. */
  readonly probe: AquariumProbe;
  /** Monde affiché, `null` avant le démarrage. */
  world(): World | null;
  isCapture(): boolean;
  /** Réglage du bac suivi d'un relevé et d'un enregistrement : `WaterSettingsController.apply`. */
  applyWaterSetting(apply: (world: MutableWorld) => void): void;
  /** Suivi du bac (#513, #581), hors du monde. */
  readonly records: {
    recordMaintenance(world: MutableWorld, task: MaintenanceTask): void;
    journalOf(world: World): Journal;
  };
  refreshPopulation(): void;
  /** Éditeur du décor (#167) : un clic en mode édition pose ou choisit un élément. */
  readonly editor: {
    editing(): boolean;
    editAt(pick: DecorPick): void;
  };
  /** Séance d'entretien (#604) : coupe des pousses (#644) et tuyau du siphon (#605). */
  readonly care: {
    isCutting(): boolean;
    cutPlant(index: number): boolean;
    isSiphoning(): boolean;
  };
  /** Dépôt de granulés au point visé de la surface (#67). */
  feed(x: number, z: number): void;
}

/**
 * Outils en main et clics sur le bac : raclette (#476), sécateur (#477), épuisette (#582) et
 * choix de ce que fait un clic sur le canvas puis sur la surface (édition, taille, raclage,
 * corps retiré, nourriture). Sorti de l'hôte au lot 10 de l'assainissement (#696), sans
 * changement de comportement.
 */
export class TankToolsController {
  /** Vrai tant que la raclette est en main (#476) : un clic sur le bac racle. */
  readonly scraping = signal(false);
  /** Vrai tant que le sécateur est en main (#477) : un clic sur une plante à tige la taille. */
  readonly pruning = signal(false);
  /** Vrai si le dernier clic sur le canvas a retiré un corps (#582) : il ne nourrit pas. */
  private netted = false;

  constructor(private readonly ports: TankToolsPorts) {}

  /**
   * Prend ou pose la raclette (#476) : tant qu'elle est en main, un clic sur le bac retire la
   * plaque d'algues visée au lieu de nourrir. Sans effet en mode capture.
   */
  toggleScraper(): void {
    if (!this.ports.isCapture()) {
      this.scraping.update((on) => !on);
      this.ports.probe.publishScraper(this.scraping());
      if (this.scraping() && this.pruning()) {
        this.togglePruner();
      }
    }
  }

  /**
   * Prend ou pose le sécateur (#477) : tant qu'il est en main, un clic sur une plante à tige la
   * taille au lieu de nourrir ; prendre le sécateur pose la raclette. Sans effet en mode capture.
   */
  togglePruner(): void {
    if (!this.ports.isCapture()) {
      this.pruning.update((on) => !on);
      this.ports.probe.publishPruner(this.pruning());
      if (this.pruning() && this.scraping()) {
        this.toggleScraper();
      }
    }
  }

  /**
   * Taille (#477) la plante à tige d'indice `index` du décor : renvoie vrai si elle a
   * raccourci (faux pour un autre élément, une plante sans pousse visible, en mode capture ou
   * avant le démarrage). Enregistré avec l'eau.
   */
  prunePlant(index: number): boolean {
    let pruned = false;
    this.ports.applyWaterSetting((world) => {
      pruned = pruneWorldPlantInPlace(world, index);
      if (pruned) {
        this.ports.records.recordMaintenance(world, 'prune');
        addPruneEntry(this.ports.records.journalOf(world), world.time);
      }
    });
    return pruned;
  }

  /**
   * Raclette (#476) : retire la plaque d'algues touchée la première par le rayon, sans toucher
   * aux poissons. Renvoie l'indice de la plaque retirée, `-1` si aucune (ou en mode capture,
   * avant le démarrage).
   */
  scrapeAlong(origin: Ray3, direction: Ray3): number {
    let index = -1;
    this.ports.applyWaterSetting((world) => {
      index = scrapeWorldAlgaeInPlace(world, origin, direction);
    });
    return index;
  }

  /**
   * Épuisette (#582) : retire le corps touché le premier par le rayon, ce qui arrête sa
   * pollution. Renvoie vrai si un corps a été retiré (jamais en mode capture, ni avant le
   * démarrage).
   */
  netAlong(origin: Ray3, direction: Ray3): boolean {
    let removed = false;
    this.ports.applyWaterSetting((world) => {
      const id = netTarget(world.dead, origin, direction);
      removed = id !== null && removeDeadInPlace(world, id);
    });
    if (removed) {
      this.ports.refreshPopulation();
    }
    return removed;
  }

  /**
   * Clic sur le canvas, avant la nourriture : en mode édition, il pose ou choisit un élément du
   * décor (#167) ; sécateur en main, il taille une plante (#477) ou coupe une pousse (#644) ;
   * raclette en main, il racle (#476) ; épuisette (#582), il retire un corps.
   */
  canvasClick(view: AquariumView, x: number, y: number): void {
    if (this.ports.editor.editing()) {
      this.ports.editor.editAt(view.pickDecor(x, y));
    } else if (this.pruning()) {
      this.pruneAt(view, x, y);
    } else if (this.scraping()) {
      const ray = view.pickRay(x, y);
      if (ray) {
        this.scrapeAlong(ray.origin, ray.direction);
      }
    } else if (this.ports.world()?.dead !== undefined) {
      // Épuisette (#582) : un clic sur un corps le retire au lieu de nourrir.
      const ray = view.pickRay(x, y);
      this.netted = ray !== null && this.netAlong(ray.origin, ray.direction);
    }
  }

  /**
   * Clic sur la surface de l'eau : nourrit, sauf si le clic a retiré un corps, ou si un outil
   * (édition, raclette, sécateur, tuyau du siphon #605) est en main.
   */
  surfaceClick(x: number, z: number): void {
    const { ports } = this;
    const netted = this.netted;
    this.netted = false;
    const siphoning = ports.care.isSiphoning();
    if (!netted && !siphoning && !ports.editor.editing() && !this.scraping() && !this.pruning()) {
      ports.feed(x, z);
    }
  }

  /** Sécateur en main : taille la plante visée, ou coupe sa pousse pendant la séance. */
  private pruneAt(view: AquariumView, x: number, y: number): void {
    const pick = view.pickDecor(x, y);
    if (pick?.kind !== 'item') {
      return;
    }
    if (this.ports.care.isCutting()) {
      this.ports.care.cutPlant(pick.index);
    } else {
      this.prunePlant(pick.index);
    }
  }
}
