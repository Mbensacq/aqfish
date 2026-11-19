import type { WritableSignal } from '@angular/core';

import {
  hasWorldParams,
  parseCaptureParams,
  type CameraPreset,
  type CaptureParams,
} from '../../core/capture/capture-params';
import type { FoodStyle } from '../../core/food-style/food-style';
import { DEFAULT_FOOD_STYLE } from '../../core/food-style/food-style';
import {
  initialRenderFilter,
  readStoredRenderFilter,
  type RenderFilter,
} from '../../core/render-filter/render-filter';
import type { SaveStorage } from '../../core/save-storage/save-storage';
import {
  clampWallpaperFps,
  DEFAULT_WALLPAPER_FPS,
  readWallpaperGlobal,
} from '../../core/wallpaper/wallpaper';
import type { AquariumView } from '../../render/aquarium-view';
import {
  createDayClock,
  DEFAULT_DAY_CLOCK,
  DEFAULT_DAY_LENGTH_SECONDS,
  DEFAULT_START_HOUR,
  type DayClock,
} from '../../sim/daylight';
import { isDecorEditable } from '../../sim/decor-edit';
import { environmentById } from '../../sim/environment';
import { DEFAULT_ROOM, type Room } from '../../sim/room';
import { hasShareFragment, readShare } from '../../sim/share-link';
import { isSimSpeed, type SimSpeed } from '../../sim/sim-speed';
import { isWaterKit } from '../../sim/water-test';
import { advanceToWithFeedings } from '../../sim/world';
import type { SaveSettings } from '../../sim/save';
import type { MutableWorld, World } from '../../sim/world-types';
import type { AquariumProbe } from './aquarium-probe';
import { browserStorage } from './browser-storage';
import type { ClockController } from './clock-controller';
import type { DecorEditingController } from './decor-editing-controller';
import type { FreeCameraController } from './free-camera-controller';
import { WALLPAPER_PRESET } from './frame-painter';
import type { RenderLoop } from './render-loop';
import type { RoomEditingController } from './room-editing-controller';
import type { RoomLayoutController } from './room-layout-controller';
import type { ImportedSave, RestoredSave, SaveShareController } from './save-share-controller';
import { createStartupWorld } from './startup-world';
import type { TankReadoutsController } from './tank-readouts-controller';
import type { TankRoomController } from './tank-room-controller';
import { loadWallpaperConfig } from './wallpaper-config';
import type { WaterCareController } from './water-care-controller';

/**
 * Horloge de départ (ADR 0018) : `heure=` la fige à cette heure ; sans elle, figée à midi
 * en mode capture (images reproductibles, séries existantes inchangées), en marche depuis
 * midi sinon.
 */
export function initialDayClock(hour: number | null, capture: boolean): DayClock {
  if (hour !== null) {
    return createDayClock(hour, DEFAULT_DAY_LENGTH_SECONDS, true);
  }
  return capture
    ? createDayClock(DEFAULT_START_HOUR, DEFAULT_DAY_LENGTH_SECONDS, true)
    : DEFAULT_DAY_CLOCK;
}

/** Mode de la session fixé au démarrage. */
export interface StartupMode {
  readonly capture: boolean;
  /** Niveau du voile d'exemple de `encrassement=` (#607), en capture ; 0 sinon. */
  readonly fouling: number;
  /** Vue fond d'écran (#279). */
  readonly wallpaper: boolean;
}

/** Signaux de l'hôte que le démarrage écrit. */
export interface StartupSignals {
  readonly speed: WritableSignal<SimSpeed>;
  readonly foodStyle: WritableSignal<FoodStyle>;
  readonly room: WritableSignal<Room>;
  readonly rain: WritableSignal<boolean>;
  readonly filter: WritableSignal<RenderFilter>;
  /** Scène sonore autorisée (#411). */
  readonly soundAllowed: WritableSignal<boolean>;
}

/** Contrôleurs de l'hôte que le démarrage enchaîne. */
export interface StartupControllers {
  readonly clock: Pick<ClockController, 'refreshFrozen' | 'applySpeed'>;
  readonly saves: Pick<SaveShareController, 'readStored' | 'activate' | 'publishStatus' | 'status'>;
  readonly tanks: Pick<TankRoomController, 'stashOthers' | 'restore' | 'sync'>;
  readonly roomLayout: Pick<RoomLayoutController, 'applyCaptureLayout'>;
  readonly waterCare: Pick<WaterCareController, 'presetWaterTest'>;
  readonly readouts: Pick<TankReadoutsController, 'refreshEnvironment' | 'refreshPopulation'>;
  readonly decorEdit: Pick<DecorEditingController, 'applyEditing' | 'showCaptureSelection'>;
  readonly roomEdit: Pick<RoomEditingController, 'editable' | 'count' | 'showCaptureSelection'>;
  readonly free: Pick<FreeCameraController, 'resumeStored' | 'onKey' | 'releaseAll'>;
  readonly loop: Pick<RenderLoop, 'setHidden' | 'resetClock'>;
}

/** Ce dont le démarrage a besoin de l'hôte (#696). */
export interface StartupPorts {
  readonly document: Document;
  readonly saveStorage: SaveStorage | null;
  readonly probe: AquariumProbe;
  readonly signals: StartupSignals;
  /** Contrôleurs, lus à l'appel (l'ordre des champs de l'hôte n'importe pas). */
  controllers(): StartupControllers;
  /** Vrai après `stop()` : un chargement asynchrone en cours ne démarre plus rien. */
  isStopped(): boolean;
  setMode(mode: StartupMode): void;
  isWallpaper(): boolean;
  setWallpaperFps(fps: number): void;
  /** Interdit toute scène sonore (capture). */
  forbidSound(): void;
  dayClock(): DayClock;
  setDayClock(clock: DayClock): void;
  setWorld(world: MutableWorld): void;
  setPixelRatio(ratio: number): void;
  decorVisible(): boolean;
  /** Recalcule l'éclairage à l'heure affichée. */
  relight(): void;
  refreshWater(): void;
  /** Crée la vue du monde affiché sur `preset`. */
  createView(preset: CameraPreset): void;
  view(): AquariumView | null;
  /** La caméra quitte tout préréglage (pose libre de `libre=`). */
  clearActivePreset(): void;
  onCleanup(cleanup: () => void): void;
  scheduleFrame(): void;
}

/**
 * Séquence de démarrage de l'hôte : lecture de l'URL, choix de la scène (sauvegarde, fond
 * d'écran, lien partagé, monde neuf), services, première vue, caméra et écoutes de la
 * fenêtre. Sortie de l'hôte au lot 10 de l'assainissement (#696), sans changement de
 * comportement ni d'ordre.
 */
export class StartupSequence {
  constructor(private readonly ports: StartupPorts) {}

  /** Démarre l'hôte (après le premier rendu Angular). */
  start(): void {
    const { ports } = this;
    const win = ports.document.defaultView;
    if (!win) {
      return;
    }
    const params = parseCaptureParams(win.location.search);
    // Vue fond d'écran (#279) : `fond=1`, ou la globale `aqfishFond` du paquet. En capture,
    // seule l'interface est masquée (contrat de capture inchangé).
    const global = readWallpaperGlobal(win);
    ports.setMode({
      capture: params.capture,
      fouling: params.capture ? params.fouling : 0,
      wallpaper: params.wallpaper || global !== null,
    });
    ports.signals.soundAllowed.set(!params.capture);
    if (params.capture) {
      ports.forbidSound();
    }
    if (ports.isWallpaper() && !params.capture) {
      ports.setWallpaperFps(clampWallpaperFps(params.fps ?? global?.fps ?? DEFAULT_WALLPAPER_FPS));
      // L'URL qui décrit le monde prime, comme hors fond d'écran.
      if (hasWorldParams(win.location.search)) {
        this.begin(win, params, null);
        return;
      }
      void loadWallpaperConfig(win, global, ports.saveStorage).then((choice) => {
        if (!ports.isStopped()) {
          ports.probe.publishWallpaper(choice.source);
          this.begin(win, params, choice.value);
        }
      });
      return;
    }
    // Lien partagé en capture (#426) : le bac du lien est affiché tel quel (même graine, même
    // temps), sans confirmation ; un lien invalide donne le monde de l'URL.
    if (params.capture && hasShareFragment(win.location.hash)) {
      void readShare(win.location.hash).then((result) => {
        if (!ports.isStopped()) {
          this.begin(win, params, result.ok ? result : null);
        }
      });
      return;
    }
    this.begin(win, params, undefined);
  }

  /** Remplace la pièce par une sauvegarde relue et validée (import, lien partagé). */
  loadImported(result: ImportedSave): void {
    const { ports } = this;
    ports.controllers().tanks.restore(result.room, result.selectedTankId);
    this.loadWorld(result.world as MutableWorld, result.settings, result.others);
    ports.createView(environmentById(result.world.environment).defaultCamera);
    ports.probe.publishCamera(ports.view());
    ports.scheduleFrame();
  }

  /**
   * Installe un monde, ses réglages et les mondes des autres environnements (import) ; la
   * vue suit à part.
   */
  private loadWorld(world: MutableWorld, settings: SaveSettings, others: readonly World[]): void {
    const { ports } = this;
    const { tanks, loop, clock, readouts } = ports.controllers();
    ports.setWorld(world);
    tanks.stashOthers(others, world.environment);
    loop.resetClock();
    clock.applySpeed(settings.speed);
    ports.setDayClock(settings.clock);
    ports.signals.foodStyle.set(settings.foodStyle ?? DEFAULT_FOOD_STYLE);
    ports.signals.room.set(settings.room ?? DEFAULT_ROOM);
    ports.relight();
    clock.refreshFrozen();
    readouts.refreshEnvironment();
    ports.probe.publishTick(world);
    ports.probe.publishFood(world);
    readouts.refreshPopulation();
    ports.refreshWater();
  }

  /**
   * Suite du démarrage, une fois la scène connue. `restoredOverride` : scène choisie par le
   * fond d'écran (`null` : monde neuf) ; `undefined` : sauvegarde automatique habituelle.
   * Les étapes s'enchaînent dans cet ordre, figé par les tests de l'hôte et les captures.
   */
  private begin(
    win: Window,
    params: CaptureParams,
    restoredOverride: RestoredSave | null | undefined,
  ): void {
    const { ports } = this;
    // En mode capture, le temps demandé est atteint ici, avant toute image (contrat de capture).
    // Le monde créé ici appartient à l'hôte seul : il pourra être avancé en place.
    ports.setDayClock(initialDayClock(params.hour, params.capture));
    const restored = this.startupSave(win, params, restoredOverride);
    const world = restored ? this.applyRestored(restored, params) : this.createWorld(params);
    ports.setWorld(world);
    this.prepareRoom(world, params);
    this.startServices(win, params);
    this.publishStartState(world, params);
    this.createStartView(win, params, world);
    this.applyCaptureEditing(world, params);
    this.applyStartCamera(params);
    this.listenWindow(win);
    ports.scheduleFrame();
  }

  /**
   * Sauvegarde à restaurer au démarrage (#70) : celle du fond d'écran si elle est donnée ;
   * jamais en capture (images reproductibles), ni si l'URL décrit le monde (`seed`,
   * `environnement`, `population`). Lue avant toute création : le monde neuf n'est créé que
   * s'il n'y a rien à restaurer.
   */
  private startupSave(
    win: Window,
    params: CaptureParams,
    restoredOverride: RestoredSave | null | undefined,
  ): RestoredSave | null {
    if (restoredOverride !== undefined) {
      return restoredOverride;
    }
    if (params.capture || hasWorldParams(win.location.search)) {
      return null;
    }
    return this.ports.controllers().saves.readStored();
  }

  /** Reprend la pièce, les mondes et les réglages d'une sauvegarde ; renvoie le monde affiché. */
  private applyRestored(restored: RestoredSave, params: CaptureParams): MutableWorld {
    const { ports } = this;
    const { tanks } = ports.controllers();
    tanks.stashOthers(restored.others, restored.world.environment);
    tanks.restore(restored.room, restored.selectedTankId);
    ports.signals.speed.set(restored.settings.speed);
    ports.signals.foodStyle.set(restored.settings.foodStyle ?? DEFAULT_FOOD_STYLE);
    ports.signals.room.set(restored.settings.room ?? DEFAULT_ROOM);
    // `heure=` fige l'heure : l'horloge sauvegardée ne s'applique pas.
    if (params.hour === null) {
      ports.setDayClock(restored.settings.clock);
    }
    // Monde relu et validé, appartenant à l'hôte seul : il sera avancé en place.
    return restored.world as MutableWorld;
  }

  /**
   * Monde neuf décrit par l'URL (`createStartupWorld`), amené en capture au temps demandé
   * avec les dépôts de nourriture de `nourrir=` (#67), chacun à son temps simulé.
   */
  private createWorld(params: CaptureParams): MutableWorld {
    const { ports } = this;
    if (params.capture && params.foodStyle !== null) {
      ports.signals.foodStyle.set(params.foodStyle);
    }
    const created = createStartupWorld(params, ports.signals.room());
    ports.signals.room.set(created.room);
    const world = params.capture
      ? advanceToWithFeedings(created.world, params.time, params.feedings, ports.dayClock())
      : created.world;
    // Test de l'eau de `test-eau=` (#564), hors capture : résultat déjà prêt.
    if (!params.capture && isWaterKit(params.waterTest)) {
      ports.controllers().waterCare.presetWaterTest(world, params.waterTest);
    }
    return world;
  }

  /**
   * Pièce de N bacs (#305) : bacs et meubles exposés au catalogue dès le démarrage ; `bacs=`
   * en capture, avec `piece=1`, y ajoute meubles supports et bacs posés. Puis la vitesse de
   * `vitesse=` (#232), hors capture : elle prime sur celle de la sauvegarde (`vitesse=0` : le
   * monde ne quitte pas t = 0, captures d'interface reproductibles).
   */
  private prepareRoom(world: MutableWorld, params: CaptureParams): void {
    const controllers = this.ports.controllers();
    controllers.tanks.sync(world);
    if (params.capture && params.room && params.roomLayout.length > 0) {
      controllers.roomLayout.applyCaptureLayout(world, params.roomLayout);
    }
    if (!params.capture && params.speed !== null && isSimSpeed(params.speed)) {
      this.ports.signals.speed.set(params.speed);
    }
  }

  /**
   * Sauvegarde automatique et liens partagés, hors capture et hors fond d'écran : le fond
   * d'écran (#279) n'écrit jamais le stockage (la sauvegarde de l'application n'est pas
   * remplacée par sa scène) et se met en pause quand la page est masquée.
   */
  private startServices(win: Window, params: CaptureParams): void {
    if (params.capture) {
      return;
    }
    if (this.ports.isWallpaper()) {
      this.startWallpaperPause();
      return;
    }
    this.ports.controllers().saves.activate(win);
  }

  /** Expose l'état initial : horloge, vitesse, décor, pluie, graine, eau, sauvegarde. */
  private publishStartState(world: World, params: CaptureParams): void {
    const { ports } = this;
    const controllers = ports.controllers();
    controllers.clock.refreshFrozen();
    ports.probe.publishSpeed(ports.signals.speed());
    ports.probe.publishDecorVisible(ports.decorVisible());
    // Pluie de `pluie=1` (#106) : appliquée à la création de la vue (bassin seulement).
    ports.signals.rain.set(params.rain);
    ports.probe.publishSeed(world.seed);
    controllers.readouts.refreshEnvironment();
    ports.probe.publishTick(world);
    ports.probe.publishFood(world);
    controllers.readouts.refreshPopulation();
    ports.refreshWater();
    controllers.saves.publishStatus(controllers.saves.status());
  }

  /**
   * Filtre de rendu, pixel ratio et première vue. Sans `camera=`, la vue par défaut de
   * l'environnement (#87 : de dessus pour le bassin) ; en fond d'écran, la vue trois-quarts,
   * base de la caméra automatique, et un pixel ratio 1 comme en capture (image pixel art).
   */
  private createStartView(win: Window, params: CaptureParams, world: World): void {
    const { ports } = this;
    ports.signals.filter.set(
      initialRenderFilter(
        params.filter,
        params.capture ? null : readStoredRenderFilter(browserStorage(win)),
        params.capture,
      ),
    );
    ports.setPixelRatio(params.capture || ports.isWallpaper() ? 1 : win.devicePixelRatio || 1);
    ports.createView(this.startPreset(params, world));
    ports.probe.publishFilter(ports.signals.filter());
  }

  private startPreset(params: CaptureParams, world: World): CameraPreset {
    if (params.cameraGiven) {
      return params.camera;
    }
    return this.ports.isWallpaper()
      ? WALLPAPER_PRESET
      : environmentById(world.environment).defaultCamera;
  }

  /**
   * Éditeurs fermés, sauf en capture : `edition=` (#167) ouvre l'éditeur du décor sur un
   * élément, `edition-meuble=` (#188) celui de la pièce sur un meuble.
   */
  private applyCaptureEditing(world: World, params: CaptureParams): void {
    const { decorEdit, roomEdit } = this.ports.controllers();
    decorEdit.applyEditing(false);
    if (!params.capture) {
      return;
    }
    const decorSelection = params.editSelection;
    if (
      decorSelection !== null &&
      isDecorEditable(world.environment) &&
      decorSelection < world.decor.length
    ) {
      decorEdit.showCaptureSelection(decorSelection);
    }
    const roomSelection = params.editRoomSelection;
    if (roomSelection !== null && roomEdit.editable() && roomSelection < roomEdit.count()) {
      decorEdit.applyEditing(true);
      roomEdit.showCaptureSelection(roomSelection);
    }
  }

  /**
   * Caméra de départ : pose de `libre=` (#343) en capture, pièce affichée seulement ; sinon
   * caméra libre mémorisée (#344), reprise hors capture et hors fond d'écran
   * (`toggleFreeCamera` refuse sinon).
   */
  private applyStartCamera(params: CaptureParams): void {
    const { ports } = this;
    const free = params.freeCamera;
    const view = ports.view();
    if (params.capture && free !== null && view?.roomShown) {
      const toRadians = Math.PI / 180;
      const posed = view.applyFreePose(
        [free.x, free.y, free.z],
        free.yawDeg * toRadians,
        free.pitchDeg * toRadians,
      );
      if (posed) {
        ports.clearActivePreset();
        ports.probe.publishCamera(ports.view());
      }
    }
    ports.controllers().free.resumeStored();
  }

  /**
   * Écoutes de la fenêtre : redimensionnement (nouvelle image), touches tenues de la caméra
   * libre (#343), tout relâché si la fenêtre perd le focus (le relâchement n'arriverait jamais).
   */
  private listenWindow(win: Window): void {
    const { ports } = this;
    const { free } = ports.controllers();
    const doc = ports.document;
    const onResize = () => ports.scheduleFrame();
    win.addEventListener('resize', onResize);
    ports.onCleanup(() => win.removeEventListener('resize', onResize));
    const onKeyDown = (event: KeyboardEvent) => free.onKey(event, true);
    const onKeyUp = (event: KeyboardEvent) => free.onKey(event, false);
    const onBlur = () => free.releaseAll();
    doc.addEventListener('keydown', onKeyDown);
    doc.addEventListener('keyup', onKeyUp);
    win.addEventListener('blur', onBlur);
    ports.onCleanup(() => {
      doc.removeEventListener('keydown', onKeyDown);
      doc.removeEventListener('keyup', onKeyUp);
      win.removeEventListener('blur', onBlur);
    });
  }

  /**
   * Pause de la vue fond d'écran (#279) : page masquée, plus aucune image demandée ; de
   * nouveau visible, la boucle repart sans rattraper le temps passé masqué.
   */
  private startWallpaperPause(): void {
    const { ports } = this;
    const { loop } = ports.controllers();
    const doc = ports.document;
    const onVisibility = () => {
      const hidden = doc.visibilityState === 'hidden';
      ports.probe.publishWallpaperPaused(hidden);
      loop.setHidden(hidden);
    };
    onVisibility();
    doc.addEventListener('visibilitychange', onVisibility);
    ports.onCleanup(() => doc.removeEventListener('visibilitychange', onVisibility));
  }
}
