import {
  acceptsSpecies,
  careModeOf,
  isCareMode,
  setCareModeInPlace,
  type CareMode,
} from '../../sim/care-mode';
import { returnToCareInPlace } from '../../sim/care-return';
import { isSpeciesId, setPopulationInPlace } from '../../sim/population';
import { roomPopulationLimits } from '../../sim/room-limits';
import type { SpeciesId } from '../../sim/species';
import { capacityLimits, tankCapacity } from '../../sim/tank-capacity-limits';
import { populationOf } from '../../sim/tank-capacity';
import { feedInPlace } from '../../sim/world';
import type { MutableWorld } from '../../sim/world-types';
import type { AquariumProbe } from './aquarium-probe';
import type { TankRecordsController } from './tank-records-controller';
import type { TankRoomController } from './tank-room-controller';

/** Ce dont les animaux du bac ont besoin de l'hôte (#696). */
export interface PopulationPorts {
  readonly probe: AquariumProbe;
  /** Monde affiché, `null` avant le démarrage. */
  world(): MutableWorld | null;
  isCapture(): boolean;
  /** Bacs de la pièce (#392) : synchronisation et bac sélectionné. */
  tanks(): Pick<TankRoomController, 'sync' | 'selectedTankId'>;
  /** Suivi du bac (#512) : parcours guidé. */
  records(): Pick<TankRecordsController, 'refreshFirstTankPath'>;
  refreshPopulation(): void;
  refreshWater(): void;
  saveNow(): void;
  scheduleFrame(): void;
}

/**
 * Animaux du bac affiché : effectifs (#69, #392), nourriture (#67) et mode décor ou soins
 * (#278). Sorti de l'hôte au lot 10 de l'assainissement (#696), sans changement de
 * comportement.
 */
export class PopulationController {
  constructor(private readonly ports: PopulationPorts) {}

  /**
   * Règle l'effectif d'une espèce (#69), ramené à ses bornes : les poissons ajoutés naissent
   * à une position valide, les plus récents sont retirés ; ni le temps ni le décor ne sont
   * réinitialisés. Sans effet en mode capture (les effectifs passent par `population=`),
   * avant le démarrage, pour une espèce inconnue ou absente de l'environnement (#88, sauf en
   * mode décor, #278), ou un effectif qui n'est pas un entier positif ou nul. En mode soins, un
   * ajout est aussi borné par la capacité du bac (#809).
   */
  setPopulation(species: SpeciesId, count: number): void {
    const { ports } = this;
    const world = ports.world();
    if (
      !world ||
      ports.isCapture() ||
      !isSpeciesId(species) ||
      !acceptsSpecies(world, species) ||
      !Number.isInteger(count) ||
      count < 0
    ) {
      return;
    }
    // Plafond d'animaux de la pièce (#392, ADR 0096) : un ajout au-delà est ramené à la place
    // restante, sans effet si elle est nulle ; retirer reste toujours possible.
    const tanks = ports.tanks();
    const room = tanks.sync(world);
    const limits = roomPopulationLimits(room, tanks.selectedTankId, world);
    // Capacité du bac en mode soins (#809, ADR 0172) : un ajout au-delà est ramené au plus grand
    // effectif qu'elle permet, jamais sous l'effectif actuel ; le mode décor n'est pas borné.
    const { liters, grossLiters, decor } = tankCapacity(world);
    const limit = capacityLimits(
      {
        liters,
        milieuLiters: grossLiters,
        population: populationOf(world),
        mode: decor ? 'decor' : 'soins',
      },
      [species],
      limits,
    ).limits[species];
    setPopulationInPlace(world, species, Math.min(count, limit));
    ports.refreshPopulation();
    ports.scheduleFrame();
  }

  /**
   * Dépose des granulés autour de (x, z), dans le repère du bac (clic sur l'eau, issue #67).
   * Sans effet en mode capture (image figée : les dépôts passent par `nourrir=`), avant le
   * démarrage, ou pour un point hors du bac.
   */
  feed(x: number, z: number): void {
    const { ports } = this;
    const world = ports.world();
    if (!world || ports.isCapture() || !Number.isFinite(x) || !Number.isFinite(z)) {
      return;
    }
    if (feedInPlace(world, x, z) > 0) {
      ports.probe.publishFood(ports.world());
      ports.records().refreshFirstTankPath(world);
      ports.scheduleFrame();
    }
  }

  /**
   * Règle le mode du bac affiché (#278) : en décor, eau, faim et santé sont en pause (pas
   * effacées) et toute espèce s'ajoute ; au retour en soins, l'état reprend où il était et
   * les animaux d'un autre milieu sont gardés (lot 1). La confirmation est demandée par le
   * panneau. Sans effet en capture, avant le démarrage, ou pour un mode inconnu.
   */
  setCareMode(mode: CareMode): void {
    const world = this.ports.world();
    if (!world || this.ports.isCapture() || !isCareMode(mode) || careModeOf(world) === mode) {
      return;
    }
    setCareModeInPlace(world, mode);
    this.changed();
  }

  /**
   * « Tout retirer » au retour en soins (#278, lot 2) : retire du bac affiché tous les animaux
   * des espèces `remove` (celles que la confirmation a listées comme inadaptées), puis le
   * repasse en mode soins ; les autres animaux et l'eau reprennent où ils en étaient. Sans
   * effet en capture, avant le démarrage, ou si le bac n'est pas en mode décor.
   */
  returnToCare(remove: readonly SpeciesId[]): void {
    const world = this.ports.world();
    if (!world || this.ports.isCapture() || careModeOf(world) !== 'decor') {
      return;
    }
    returnToCareInPlace(world, remove);
    this.changed();
  }

  /** Après un changement de mode : relevés, sauvegarde et nouvelle image. */
  private changed(): void {
    const { ports } = this;
    ports.refreshPopulation();
    ports.refreshWater();
    ports.saveNow();
    ports.scheduleFrame();
  }
}
