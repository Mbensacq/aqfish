import type { CameraPreset } from '../../core/capture/capture-params';
import type { AquariumView } from '../../render/aquarium-view';
import { environmentById, isEnvironmentId } from '../../sim/environment';
import { switchEnvironment } from '../../sim/environment-worlds';
import { DEFAULT_POND_SHAPE, type PondShape } from '../../sim/pond-shape';
import { setPondShapeInPlace } from '../../sim/pond-reshape';
import { ROOM_ANIMAL_CAP, roomAnimalCount } from '../../sim/room-limits';
import { tankResizeRefusal } from '../../sim/room-state';
import { sameDimensions, type TankDimensions } from '../../sim/tank';
import { clampTankDimensionsIn } from '../../sim/tank-limits';
import { setTankDimensionsInPlace } from '../../sim/tank-resize';
import type { MutableWorld } from '../../sim/world-types';
import type { AquariumProbe } from './aquarium-probe';
import type { RoomLayoutController } from './room-layout-controller';
import type { TankReadoutsController } from './tank-readouts-controller';
import type { TankRoomController } from './tank-room-controller';

/** Ce dont le lieu du bac a besoin de l'hôte (#696). */
export interface TankPlacePorts {
  /** Attributs `data-aqfish-*` de l'hôte. */
  readonly probe: AquariumProbe;
  /** Monde affiché, `null` avant le démarrage. */
  world(): MutableWorld | null;
  /** Remplace le monde affiché (changement d'environnement). */
  setWorld(world: MutableWorld): void;
  /** Vue courante, `null` avant le démarrage. */
  view(): AquariumView | null;
  isCapture(): boolean;
  /** Bacs de la pièce (#264, #306, #316) : rattrapage, synchronisation, mondes rangés. */
  readonly tanks: Pick<
    TankRoomController,
    'advanceBackground' | 'sync' | 'stash' | 'setStash' | 'selectedTankId'
  >;
  /** Refus lisible au catalogue de la pièce (#311). */
  refuse: RoomLayoutController['refuse'];
  /** Termine une chute de décor en cours (#170). */
  finishDrop(): void;
  /** Temps simulé de l'image affichée, en secondes. */
  renderTime(): number;
  /** Repart la boucle d'images sans rattrapage. */
  resetLoopClock(): void;
  /** Garde l'heure sans saut depuis `fromTime` (`carryClock`). */
  carryClock(fromTime: number): void;
  relight(): void;
  readonly readouts: Pick<
    TankReadoutsController,
    'refreshEnvironment' | 'refreshPopulation' | 'refreshTankDimensions' | 'tankDimensions'
  >;
  refreshWater(): void;
  /** Recrée la vue du monde affiché sur `preset`. */
  createView(preset: CameraPreset): void;
  /** Préréglage suivi par la caméra, `null` si l'utilisateur l'a quitté. */
  activePreset(): CameraPreset | null;
  /** Élément du décor sélectionné (#167), `null` sinon. */
  decorSelection(): number | null;
  saveNow(): void;
  scheduleFrame(): void;
}

/**
 * Lieu du bac affiché : environnement (#87, #277), dimensions du bac (#171, #311) et forme du
 * bassin (#190). Chaque changement recrée la vue et s'enregistre aussitôt. Sorti de l'hôte au
 * lot 10 de l'assainissement (#696), sans changement de comportement.
 */
export class TankPlaceController {
  constructor(private readonly ports: TankPlacePorts) {}

  /**
   * Change d'environnement (#87, ADR 0026, #277, ADR 0063) : range le monde affiché, figé, et
   * reprend celui de l'environnement choisi tel qu'il avait été laissé (population, décor,
   * eau, nourriture, dimensions, temps) ; un environnement jamais visité part de son monde de
   * départ avec la même graine, ramené à la place restante sous le plafond d'animaux de la
   * pièce (#396). Puis recrée la vue, la caméra allant sur la vue par défaut de
   * l'environnement. L'heure de la journée continue sans saut (`carryClock`) ; la vitesse, le
   * filtre et l'affichage du décor sont conservés. Le tout est enregistré aussitôt. Sans effet
   * en mode capture (`environnement=`), avant le démarrage, pour un environnement inconnu ou
   * déjà affiché.
   */
  setEnvironment(id: string): void {
    const { ports } = this;
    const world = ports.world();
    if (!world || !ports.view() || ports.isCapture() || !isEnvironmentId(id)) {
      return;
    }
    if (id === world.environment) {
      return;
    }
    // Une chute en cours se termine d'abord : le monde rangé garde un décor posé.
    ports.finishDrop();
    const fromTime = ports.renderTime();
    // Les autres bacs rattrapent le bac quitté avant l'échange (#316) ; le bac quitté garde
    // son identifiant dans la pièce, même jamais sauvegardé (#264).
    ports.tanks.advanceBackground();
    const room = ports.tanks.sync(world);
    // Bac de départ d'un environnement jamais visité ramené à la place restante sous le
    // plafond d'animaux de la pièce (#396, ADR 0096) : vide si la pièce est pleine.
    const free = Math.max(0, ROOM_ANIMAL_CAP - roomAnimalCount(room));
    const next = switchEnvironment(world, ports.tanks.stash, id, free);
    ports.tanks.setStash(next.stash);
    const shown = next.world as MutableWorld;
    ports.setWorld(shown);
    // La liste des bacs (#306) suit aussitôt le bac affiché.
    ports.tanks.sync(next.world);
    ports.resetLoopClock();
    ports.carryClock(fromTime);
    ports.relight();
    ports.readouts.refreshEnvironment();
    ports.probe.publishTick(shown);
    ports.probe.publishFood(shown);
    ports.readouts.refreshPopulation();
    ports.refreshWater();
    this.recreateView(environmentById(id).defaultCamera);
  }

  /**
   * Règle les dimensions du bac (issue #171, ADR 0047) : bornées, le décor ramené dans le bac,
   * poissons et granulés gardés dans l'eau (`setTankDimensionsInPlace`), puis la vue recréée
   * et la caméra recadrée sur le préréglage actif (la vue par défaut si l'utilisateur l'avait
   * quitté). La sélection du décor est conservée ; le monde est enregistré aussitôt. Sans
   * effet en mode capture (`bac=`), avant le démarrage, hors d'un environnement réglable ou à
   * dimensions inchangées.
   */
  setTankDimensions(dims: TankDimensions): void {
    const { ports } = this;
    const world = ports.world();
    const previous = ports.readouts.tankDimensions();
    if (!world || !ports.view() || ports.isCapture() || previous === null) {
      return;
    }
    // Un bac agrandi ne doit chevaucher ni meuble ni bac posé de la pièce (#311) : sinon la
    // sauvegarde refuserait la pièce entière.
    const room = ports.tanks.sync(world);
    const bounded = clampTankDimensionsIn(world.environment, dims);
    const refusal = tankResizeRefusal(room, ports.tanks.selectedTankId, bounded);
    if (refusal !== null) {
      return ports.refuse(refusal);
    }
    // Une chute en cours se termine d'abord : son décor est celui que l'on redimensionne.
    ports.finishDrop();
    const applied = setTankDimensionsInPlace(world, dims);
    if (applied === null || sameDimensions(applied, previous)) {
      return;
    }
    const selection = ports.decorSelection();
    this.reshaped(world, () => {
      if (selection !== null && selection < world.decor.length) {
        ports.view()?.setDecorSelection(selection);
      }
    });
  }

  /**
   * Règle la forme du bassin (issue #190, ADR 0080) : poissons et granulés ramenés dans la
   * forme (`setPondShapeInPlace`), puis la vue recréée sur le préréglage actif ; le monde est
   * enregistré aussitôt. Sans effet en mode capture (`forme=`), avant le démarrage, hors du
   * bassin ou à forme inchangée.
   */
  setPondShape(shape: PondShape): void {
    const { ports } = this;
    const world = ports.world();
    if (!world || !ports.view() || ports.isCapture()) {
      return;
    }
    if ((world.shape ?? DEFAULT_POND_SHAPE) === shape) {
      return;
    }
    ports.finishDrop();
    if (setPondShapeInPlace(world, shape) === null) {
      return;
    }
    this.reshaped(world, () => undefined);
  }

  /** Bac redimensionné ou reformé : relevé, vue recréée sur le préréglage actif, enregistré. */
  private reshaped(world: MutableWorld, afterView: () => void): void {
    const { ports } = this;
    ports.readouts.refreshTankDimensions();
    ports.probe.publishFood(world);
    ports.createView(ports.activePreset() ?? environmentById(world.environment).defaultCamera);
    afterView();
    // Comme une modification du décor : enregistré tout de suite.
    this.publishAndSave();
  }

  private recreateView(preset: CameraPreset): void {
    this.ports.createView(preset);
    this.publishAndSave();
  }

  private publishAndSave(): void {
    const { ports } = this;
    ports.probe.publishCamera(ports.view());
    ports.saveNow();
    ports.scheduleFrame();
  }
}
