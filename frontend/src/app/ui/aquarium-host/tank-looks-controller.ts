import { signal } from '@angular/core';

import type { AquariumView } from '../../render/aquarium-view';
import {
  algaeCoverage,
  DEFAULT_LIGHTING_HOURS,
  hasAlgae,
  lightingOf,
  visibleAlgaeCount,
} from '../../sim/algae';
import { feederReadout, type FeederReadout } from '../../sim/auto-feeder';
import { isDecorMode } from '../../sim/care-mode';
import { environmentWater, hasFlatFloor } from '../../sim/environment';
import { NO_FOULING, sampleFouling, worldFouling } from '../../sim/fouling';
import { DEFAULT_LAMP_ON_HOUR, lampOnOf } from '../../sim/lamp';
import { worldAlgaePatches, worldPlantShade, worldShownPlantGrowth } from '../../sim/world';
import type { World } from '../../sim/world-types';
import type { AquariumProbe } from './aquarium-probe';

/** Ce dont l'aspect du bac a besoin de l'hôte (#696). */
export interface TankLooksPorts {
  /** Attributs `data-aqfish-*` de l'hôte. */
  readonly probe: AquariumProbe;
  /** Vue courante, `null` avant le démarrage. */
  view(): AquariumView | null;
  isCapture(): boolean;
  /** Niveau du voile d'exemple de `encrassement=` (#607), en capture. */
  captureFouling(): number;
  /** Début du calendrier d'entretien du bac `world` (#513). */
  maintenanceStartOf(world: World): number;
}

/**
 * Aspect du bac affiché, relevé avec l'eau : pousse des plantes à tige (#477), distributeur
 * automatique (#583), algues et éclairage (#476, #584), voile d'encrassement (#607). Vue,
 * signaux du tableau de bord et attributs suivent. Sorti de l'hôte au lot 10 de
 * l'assainissement (#696), sans changement de comportement.
 */
export class TankLooksController {
  /** Durée d'éclairage du bac affiché, en heures par jour (#476). */
  readonly lighting = signal(DEFAULT_LIGHTING_HOURS);
  /** Heure d'allumage de la lampe du bac affiché (#584). */
  readonly lampOn = signal(DEFAULT_LAMP_ON_HOUR);
  /** Distributeur automatique du bac affiché (#583) ; `null` : aucun. */
  readonly feeder = signal<FeederReadout | null>(null);
  /** Plaques d'algues visibles, pour la consigne de l'étape « vitres » (#604). */
  readonly visibleAlgae = signal(0);

  constructor(private readonly ports: TankLooksPorts) {}

  /** Algues, distributeur puis plantes : tout l'aspect du bac `world`. */
  refresh(world: World): void {
    this.refreshAlgae(world);
    this.refreshFeeder(world);
    this.refreshPlants(world);
  }

  /** Pousse des plantes à tige (#477) : vue (hauteur, ombre du fond) et `PLANTS_ATTRIBUTE`. */
  refreshPlants(world: World): void {
    const view = this.ports.view();
    let shown = '';
    world.decor.forEach((item, n) => {
      if (item.kind === 'plant' && item.form === 'tall') {
        const growth = worldShownPlantGrowth(world, n);
        view?.setPlantGrowth(n, growth);
        shown += shown === '' ? String(growth) : `,${growth}`;
      }
    });
    const shade = worldPlantShade(world);
    view?.setPlantShade(shade);
    // Attribut réécrit seulement s'il change (#494), comme le pas et l'heure.
    this.ports.probe.publishPlants(shown, shade);
  }

  /** Distributeur automatique (#583) : vue, signal du tableau de bord et `FEEDER_ATTRIBUTE`. */
  private refreshFeeder(world: World): void {
    const feeder = world.feeder;
    this.ports.view()?.setFeeder(feeder !== undefined);
    if (this.ports.probe.publishFeeder(feeder)) {
      this.feeder.set(feeder === undefined ? null : feederReadout(feeder));
    }
  }

  /** Algues du bac (#476) : vue, signal de l'éclairage et `ALGAE_ATTRIBUTE`. */
  private refreshAlgae(world: World): void {
    this.ports.view()?.setAlgae(worldAlgaePatches(world), world.water.algae);
    const hours = lightingOf(world.water);
    this.lighting.set(hours);
    this.lampOn.set(lampOnOf(world.water));
    const visible = visibleAlgaeCount(world.water.algae);
    this.visibleAlgae.set(visible);
    const percent = Math.round(algaeCoverage(world.water.algae) * 100);
    this.ports.probe.publishAlgae(visible, percent, hours);
    this.refreshFouling(world);
  }

  /**
   * Voile d'encrassement (#607) : vue et `FOULING_ATTRIBUTE`. En capture, celui
   * d'`encrassement=` (séries existantes inchangées) ; jamais en mode décor ni hors des bacs à
   * algues.
   */
  private refreshFouling(world: World): void {
    const { ports } = this;
    const fouling = ports.isCapture()
      ? isDecorMode(world) || !hasAlgae(world.environment)
        ? NO_FOULING
        : sampleFouling(ports.captureFouling())
      : worldFouling(world, ports.maintenanceStartOf(world));
    const view = ports.view();
    view?.setFouling(environmentWater(world), fouling, hasFlatFloor(world.environment));
    ports.probe.publishFouling(fouling, view?.foulingCounts ?? NO_FOULING);
  }
}
