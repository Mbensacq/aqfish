import type { CameraPreset } from '../../core/capture/capture-params';
import type { RenderFilter } from '../../core/render-filter/render-filter';
import { AquariumView, type AquariumRendererFactory } from '../../render/aquarium-view';
import { placeEnvironmentData } from '../../sim/environment';
import { waterTurbidity } from '../../sim/water-quality';
import type { World } from '../../sim/world-types';
import type { CareSessionController } from '../care-session/care-session-controller';
import type { AquariumProbe } from './aquarium-probe';
import type { DecorEditingController } from './decor-editing-controller';
import type { DisplayController } from './display-controller';
import type { FramePainter } from './frame-painter';
import type { FreeCameraController } from './free-camera-controller';
import type { RoomEditingController } from './room-editing-controller';
import type { TankLooksController } from './tank-looks-controller';
import type { TankReadoutsController } from './tank-readouts-controller';
import type { TankToolsController } from './tank-tools-controller';

/** Contrôleurs de l'hôte que la vue neuve rejoint. */
export interface ViewControllers {
  readonly display: Pick<
    DisplayController,
    | 'applyFoodStyle'
    | 'applyRoom'
    | 'applyRain'
    | 'applyReducedMotion'
    | 'decorVisible'
    | 'foodStyle'
    | 'room'
    | 'rain'
  >;
  readonly readouts: Pick<TankReadoutsController, 'water' | 'refreshCurrent'>;
  readonly looks: Pick<TankLooksController, 'refresh'>;
  readonly painter: Pick<FramePainter, 'relight'>;
  readonly free: Pick<FreeCameraController, 'reset'>;
  readonly care: Pick<CareSessionController, 'strokeEnabled' | 'stroke'>;
  readonly decorEdit: Pick<
    DecorEditingController,
    'editing' | 'startDrag' | 'moveDrag' | 'endDrag' | 'viewCreated'
  >;
  readonly roomEdit: Pick<
    RoomEditingController,
    'startDrag' | 'moveDrag' | 'endDrag' | 'viewCreated'
  >;
  readonly tools: Pick<TankToolsController, 'canvasClick' | 'surfaceClick'>;
}

/** Ce dont la création de la vue a besoin de l'hôte (#696). */
export interface ViewBuilderPorts {
  readonly probe: AquariumProbe;
  readonly rendererFactory: AquariumRendererFactory;
  /** Contrôleurs, lus à l'appel (l'ordre des champs de l'hôte n'importe pas). */
  controllers(): ViewControllers;
  canvas(): HTMLCanvasElement;
  world(): World | null;
  view(): AquariumView | null;
  setView(view: AquariumView): void;
  pixelRatio(): number;
  /** Vue manipulable à la souris : ni capture, ni fond d'écran. */
  interactive(): boolean;
  filter(): RenderFilter;
  /** Préréglage que la caméra suit. */
  setActivePreset(preset: CameraPreset | null): void;
  /** Désabonnements liés à la vue courante, vidés à chaque nouvelle vue. */
  readonly viewCleanups: (() => void)[];
}

/**
 * Création de la vue du monde affiché (#87, #343, #604, #696) : libère la précédente, crée
 * l'`AquariumView` avec le filtre, le décor, la pièce, la pluie et l'eau courants, puis
 * branche ses rappels (caméra, glissements, clics). Sortie de l'hôte au lot 10 de
 * l'assainissement (#696), sans changement de comportement.
 */
export class ViewBuilder {
  constructor(private readonly ports: ViewBuilderPorts) {}

  /**
   * Crée la vue du monde courant (en libérant la précédente) sur le préréglage `preset`, avec
   * le filtre et l'affichage du décor courants. Sans effet avant le démarrage.
   */
  build(preset: CameraPreset): void {
    const { ports } = this;
    const world = ports.world();
    if (!world) {
      return;
    }
    ports.viewCleanups.splice(0).forEach((cleanup) => cleanup());
    ports.view()?.dispose();
    const view = new AquariumView({
      canvas: ports.canvas(),
      rendererFactory: ports.rendererFactory,
      pixelRatio: ports.pixelRatio(),
      preset,
      interactive: ports.interactive(),
      filter: ports.filter(),
      environment: placeEnvironmentData(world),
    });
    ports.setView(view);
    this.applyState(view, world);
    ports.setActivePreset(preset);
    // Vue neuve : en orbite (#343).
    ports.controllers().free.reset();
    this.listen(view);
  }

  /** Décor, granulés, pièce, pluie, eau, aspect du bac, courant et éclairage courants. */
  private applyState(view: AquariumView, world: World): void {
    const { display, readouts, looks, painter } = this.ports.controllers();
    view.setDecor(world.decor, world.seed);
    view.setDecorVisible(display.decorVisible());
    display.applyFoodStyle(display.foodStyle());
    // Hors du bac tropical, la vue ne dessine pas la pièce : l'état exposé suit (#187).
    display.applyRoom(display.room());
    // Hors du bassin, la vue refuse la pluie : l'état affiché suit (#106).
    display.applyRain(display.rain());
    // Eau trouble quand elle est mauvaise (#207) : teinte seulement.
    view.setWaterTurbidity(waterTurbidity(readouts.water().quality));
    // Feuilles de catappa et eau brun-thé (#239).
    view.setWaterTea(readouts.water().tea);
    view.setCatappa(world.water.catappa);
    looks.refresh(world);
    readouts.refreshCurrent(world);
    display.applyReducedMotion();
    painter.relight();
  }

  /** Rappels de la vue : caméra, geste de la séance, glissements et clics. */
  private listen(view: AquariumView): void {
    const { ports } = this;
    const { care, decorEdit, roomEdit, tools } = ports.controllers();
    const cleanups = ports.viewCleanups;
    cleanups.push(view.onCameraChange(() => ports.probe.publishCamera(ports.view())));
    cleanups.push(view.onUserInteraction(() => ports.setActivePreset(null)));
    view.setDecorDragEnabled(decorEdit.editing());
    // Séance d'entretien (#604) : glisser racle à l'étape « vitres ».
    view.setStrokeEnabled(care.strokeEnabled());
    cleanups.push(view.onStroke((points) => care.stroke(points)));
    cleanups.push(
      view.onDecorDrag({
        start: (index) => decorEdit.startDrag(index),
        move: (index, x, z) => decorEdit.moveDrag(index, x, z),
        end: (index, commit) => decorEdit.endDrag(index, commit),
      }),
      view.onRoomDrag({
        start: (index) => roomEdit.startDrag(index),
        move: (index, x, z) => roomEdit.moveDrag(index, x, z),
        end: (index, commit) => roomEdit.endDrag(index, commit),
      }),
    );
    cleanups.push(
      view.onCanvasClick((x, y) => tools.canvasClick(view, x, y)),
      view.onSurfaceClick((x, z) => tools.surfaceClick(x, z)),
    );
    // Vue neuve : aucun glissement en cours, aucun élément sélectionné.
    decorEdit.viewCreated();
    roomEdit.viewCreated();
  }
}
