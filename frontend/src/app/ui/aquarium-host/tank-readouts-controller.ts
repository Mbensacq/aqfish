import { signal } from '@angular/core';

import { CHEVRON_COUNTS } from '../../render/current-indicator-layer';
import type { AquariumView } from '../../render/aquarium-view';
import { careModeOf, speciesShownIn, type CareMode } from '../../sim/care-mode';
import {
  DEFAULT_ENVIRONMENT_ID,
  environmentById,
  environmentWater,
  isTankResizable,
  placeDimensions,
  type EnvironmentId,
} from '../../sim/environment';
import { filterMaturityPercent } from '../../sim/filter-maturation';
import {
  EMPTY_HEALTH_SUMMARY,
  healthSummary,
  sameHealthSummary,
  type HealthSummary,
} from '../../sim/health-summary';
import { DEFAULT_POND_SHAPE, type PondShape } from '../../sim/pond-shape';
import {
  NO_FISH,
  populationCounts,
  populationLimits,
  type PopulationCounts,
} from '../../sim/population';
import { roomAnimalCapRefusal, roomPopulationLimits } from '../../sim/room-limits';
import type { RoomState } from '../../sim/room-state';
import type { SpeciesId } from '../../sim/species';
import {
  capacityAlert,
  capacityLimits,
  capacityLine,
  tankCapacity,
} from '../../sim/tank-capacity-limits';
import { NO_CAPACITY, type CapacityShown } from '../../sim/capacity-shown';
import { possibleSpecies, type PossibleSpeciesTank } from '../../sim/possible-species';
import { populationOf } from '../../sim/tank-capacity';
import type { TankDimensions } from '../../sim/tank';
import type { TreatmentReadout } from '../../sim/treatment-text';
import { waterLiters } from '../../sim/water';
import type { CurrentLevel, CurrentVelocity } from '../../sim/water-current';
import { DEFAULT_WATER_SAMPLE, waterSample, type WaterSample } from '../../sim/water-dashboard';
import {
  DEFAULT_WATER_READOUT,
  sameReadout,
  waterReadout,
  waterTurbidity,
  type WaterReadout,
} from '../../sim/water-quality';
import { worldCurrentLevel, worldCurrentVelocity } from '../../sim/world';
import type { MutableWorld, World } from '../../sim/world-types';
import type { AquariumProbe } from './aquarium-probe';

/**
 * Effectifs au format de `population=` et de `data-aqfish-population` : `neon:12,guppy:6`.
 * Avec `species`, seulement ces espèces, dans cet ordre (celles de l'environnement, #88).
 */
export function formatPopulation(
  counts: PopulationCounts,
  species: readonly SpeciesId[] = Object.keys(counts) as SpeciesId[],
): string {
  return species.map((id) => `${id}:${counts[id]}`).join(',');
}

/** Ce dont les relevés du bac affiché ont besoin de l'hôte (#696). */
export interface TankReadoutsPorts {
  /** Attributs `data-aqfish-*` de l'hôte. */
  readonly probe: AquariumProbe;
  /** Monde affiché, `null` avant le démarrage. */
  world(): MutableWorld | null;
  /** Vue courante, `null` avant le démarrage. */
  view(): AquariumView | null;
  /** Pièce de N bacs, `null` avant sa première synchronisation (#264). */
  roomState(): RoomState | null;
  /** Liste des bacs de la pièce (#306), relevée avec l'eau. */
  refreshTankList(): void;
  /** Séance d'entretien (#604) : consignes relevées avec l'eau, fermée en mode décor. */
  readonly care: {
    refreshReadouts(world: World): void;
    isOpen(): boolean;
    close(): void;
  };
  /** Animaux désignés par les alertes (#483). */
  refreshAlerts(world: World, population: PopulationCounts): void;
  /** Suivi du bac : entretien, historique, journal, parcours (#511, #512, #513, #581). */
  refreshRecords(world: MutableWorld): void;
  /** Soins de l'eau (#361, #533, #564) : renvoie le traitement en cours à exposer. */
  refreshWaterCare(world: World): TreatmentReadout | null;
  /** Aspect du bac : plantes, distributeur, algues, voile (#476, #477, #583, #607). */
  refreshLooks(world: World): void;
  /** L'éditeur du décor suit l'environnement affiché (#167). */
  environmentChanged(environment: EnvironmentId): void;
}

/**
 * Relevés du bac affiché, publiés en signaux pour le panneau et le tableau de bord et en
 * attributs `data-aqfish-*` : effectifs et plafond de la pièce (#69, #392), santé (#260),
 * corps (#582), eau (#207, #256), courant (#460), mode (#278), environnement et dimensions
 * (#87, #171, #190, #237). Sorti de l'hôte au lot 10 de l'assainissement (#696), sans
 * changement de comportement.
 */
export class TankReadoutsController {
  /** Environnement affiché (#87), changé par le sélecteur du panneau. */
  readonly environment = signal<EnvironmentId>(DEFAULT_ENVIRONMENT_ID);
  /** Effectif de chaque espèce (#69), mis à jour au démarrage et à chaque réglage. */
  readonly population = signal<PopulationCounts>(NO_FISH);
  /**
   * Effectif maximal de chaque espèce compte tenu des autres (`populationLimits`, #69) et du
   * plafond d'animaux de la pièce (`roomPopulationLimits`, #392).
   */
  readonly populationMax = signal<PopulationCounts>(NO_FISH);
  /** Plafond d'animaux de la pièce atteint (#392, ADR 0096) : message en clair, sinon `null`. */
  readonly populationNotice = signal<string | null>(null);
  /**
   * Capacité du bac affiché (#809, ADR 0172) : ligne d'occupation et de volume réel, alerte
   * d'un bac trop plein et raisons des refus (`CapacityShown`).
   */
  readonly capacity = signal<CapacityShown>(NO_CAPACITY);
  /** Relevé de l'eau affiché par le tableau de bord et le panneau (#207, #256), au dixième. */
  readonly water = signal<WaterReadout>(DEFAULT_WATER_READOUT);
  /**
   * Relevé exact de l'eau lu par le tableau de bord (#256) : remplacé à chaque relevé
   * (`refreshWater`), donc au plus 4 fois par seconde dans la boucle (`refreshDue`).
   */
  readonly waterSample = signal<WaterSample>(DEFAULT_WATER_SAMPLE);
  /** Vrai si les changements d'eau du bac affiché versent de l'eau non traitée (#530). */
  readonly untreatedTap = signal(false);
  /** Vrai si du charbon actif est dans le filtre du bac affiché (#531). */
  readonly carbon = signal(false);
  /**
   * Synthèse de la santé des animaux lue par le tableau de bord (#260), relevée avec l'eau
   * (`refreshWater`) et remplacée seulement si ce qu'elle affiche change (`sameHealthSummary`).
   */
  readonly health = signal<HealthSummary>(EMPTY_HEALTH_SUMMARY, { equal: sameHealthSummary });
  /** Mode du bac affiché (#278) : `decor` remplace le tableau de bord par le badge. */
  readonly careMode = signal<CareMode>('soins');
  /** Force du courant du bac affiché (#460). */
  readonly current = signal<CurrentLevel>('coupe');
  /**
   * Dimensions du bac du monde courant (issue #171), `null` si l'environnement ne les règle
   * pas (`isTankResizable`).
   */
  readonly tankDimensions = signal<TankDimensions | null>(null);
  /** Forme du bassin du monde courant (issue #190) : rectangle hors du bassin. */
  readonly pondShape = signal<PondShape>(DEFAULT_POND_SHAPE);
  /** Litres d'eau du bac du monde courant (#237, avertissements d'ajout), `null` avant le départ. */
  readonly tankLiters = signal<number | null>(null);

  /** Pas du dernier relevé de l'eau (`refreshWater`). */
  private waterReadTick = Number.NEGATIVE_INFINITY;
  /** Corps exposés au dernier relevé (#582) : un décès depuis relève aussi les effectifs. */
  private shownDead = 0;
  private readonly currentScratch: CurrentVelocity = { x: 0, z: 0 };

  constructor(private readonly ports: TankReadoutsPorts) {}

  /** Vrai si `ticks` pas au moins ont passé depuis le dernier relevé de l'eau de `world`. */
  waterReadDue(world: World, ticks: number): boolean {
    return world.tick - this.waterReadTick >= ticks;
  }

  /** Expose les effectifs (`data-aqfish-population`, signaux `population` et `populationMax`). */
  refreshPopulation(): void {
    const { ports } = this;
    const world = ports.world();
    if (!world) {
      return;
    }
    const counts = populationCounts(world);
    this.population.set(counts);
    // Pièce à jour pour ce monde (même objet) : plafond de la pièce ; sinon, celui du bac seul.
    const room = ports.roomState();
    const shownTank = room?.tanks.find((tank) => tank.world === world);
    const bounds =
      room && shownTank ? roomPopulationLimits(room, shownTank.id, world) : populationLimits(world);
    this.refreshCapacity(world, bounds);
    this.populationNotice.set(
      room && shownTank ? roomAnimalCapRefusal(room, shownTank.id, 1, world) : null,
    );
    this.health.set(healthSummary(world.entities));
    this.shownDead = world.dead?.length ?? 0;
    ports.probe.publishDead(this.shownDead);
    ports.refreshAlerts(world, this.population());
    ports.probe.publishPopulation(
      formatPopulation(counts, speciesShownIn(environmentById(world.environment).species, counts)),
    );
    const mode = careModeOf(world);
    if (mode === 'decor' && ports.care.isOpen()) {
      ports.care.close();
    }
    this.careMode.set(mode);
    ports.probe.publishCareMode(mode);
    this.refreshCurrent(world);
  }

  /**
   * Capacité du bac (#809, ADR 0172) : effectifs maximaux de `bounds` ramenés sous la capacité
   * en mode soins (jamais sous l'effectif actuel), raisons des refus, ligne d'occupation et
   * alerte d'un bac trop plein.
   */
  private refreshCapacity(world: World, bounds: PopulationCounts): void {
    const readout = tankCapacity(world);
    const tank: PossibleSpeciesTank = {
      liters: readout.liters,
      population: populationOf(world),
      mode: readout.decor ? 'decor' : 'soins',
      species: environmentById(world.environment).species,
      bounds,
    };
    const capacity = capacityLimits(tank, tank.species, bounds);
    this.populationMax.set(capacity.limits);
    this.capacity.set({
      text: capacityLine(readout),
      alert: capacityAlert(readout),
      reasons: capacity.reasons,
      // Espèces encore possibles (#818) : même capacité, recalculée seulement ici.
      possible: possibleSpecies(tank, capacity),
    });
    this.ports.probe.publishCapacity(readout.status.occupation);
  }

  /**
   * Relevé de l'eau (#207) : signal `water` et `data-aqfish-water` mis à jour seulement s'il
   * change, trouble de l'eau de la vue suivant le niveau.
   */
  refreshWater(): void {
    const { ports } = this;
    const world = ports.world();
    if (!world) {
      return;
    }
    this.waterReadTick = world.tick;
    ports.refreshTankList();
    this.waterSample.set(waterSample(world.water, world.environment, world.tick));
    ports.care.refreshReadouts(world);
    ports.probe.publishFilterBacteria(filterMaturityPercent(world.water));
    this.untreatedTap.set(world.water.untreatedTap === true);
    this.carbon.set(world.water.carbon === true);
    this.health.set(healthSummary(world.entities));
    this.refreshDead(world);
    ports.refreshAlerts(world, this.population());
    ports.refreshRecords(world);
    ports.probe.publishTreatment(ports.refreshWaterCare(world));
    this.publishWater(world);
    ports.refreshLooks(world);
  }

  /** Expose la force du courant de `world` et la donne à la vue (bulles, feuilles, repère). */
  refreshCurrent(world: World): void {
    const level = worldCurrentLevel(world);
    this.current.set(level);
    this.ports.probe.publishCurrent(level);
    const v = worldCurrentVelocity(world, this.currentScratch);
    this.ports
      .view()
      ?.setWaterCurrent(
        v.x,
        v.z,
        environmentById(world.environment).current.direction,
        level === 'coupe' ? 0 : CHEVRON_COUNTS[level],
      );
  }

  /** Expose l'environnement (`data-aqfish-environment` et signal `environment`). */
  refreshEnvironment(): void {
    const world = this.ports.world();
    if (world) {
      this.environment.set(world.environment);
      this.ports.probe.publishEnvironment(world.environment);
      this.refreshTankDimensions();
      this.ports.environmentChanged(world.environment);
    }
  }

  /** Expose les dimensions du bac (`data-aqfish-tank` et signal `tankDimensions`). */
  refreshTankDimensions(): void {
    const world = this.ports.world();
    if (!world) {
      return;
    }
    const dims = placeDimensions(world);
    this.tankDimensions.set(isTankResizable(world.environment) ? dims : null);
    this.pondShape.set(world.shape ?? DEFAULT_POND_SHAPE);
    this.tankLiters.set(waterLiters(environmentWater(world)));
    this.ports.probe.publishTank(world.shape ?? DEFAULT_POND_SHAPE, dims);
  }

  /** Relevé de l'eau, son attribut s'il change, puis trouble, thé et catappa de la vue. */
  private publishWater(world: World): void {
    const { probe } = this.ports;
    const readout = waterReadout(
      world.water,
      world.environment,
      world.entities.map((entity) => entity.species),
    );
    if (!sameReadout(readout, this.water()) || !probe.hasWater()) {
      this.water.set(readout);
      probe.publishWater(readout);
    }
    const view = this.ports.view();
    view?.setWaterTurbidity(waterTurbidity(readout.quality));
    view?.setWaterTea(readout.tea);
    view?.setCatappa(world.water.catappa);
  }

  /**
   * Corps du bac (#582) : un décès depuis le relevé précédent relève les effectifs (l'animal
   * mort n'y compte plus) et l'attribut `DEAD_ATTRIBUTE`.
   */
  private refreshDead(world: World): void {
    if ((world.dead?.length ?? 0) !== this.shownDead) {
      this.refreshPopulation();
    }
  }
}
