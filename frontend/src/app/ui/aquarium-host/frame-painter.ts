import { signal } from '@angular/core';

import type { CameraPreset } from '../../core/capture/capture-params';
import { markCaptureReady } from '../../core/capture/capture-ready';
import { wallpaperOrbitAngle } from '../../core/wallpaper/wallpaper';
import type { AquariumView } from '../../render/aquarium-view';
import type { GroundFrame } from '../../render/view-layers';
import { hasAlgae } from '../../sim/algae';
import { hasLandedFood } from '../../sim/behaviors';
import { SIM_DT } from '../../sim/constants';
import {
  createDayLight,
  dayPhaseAt,
  DEFAULT_START_HOUR,
  hourAt,
  lightAtInto,
  snapHour,
  type DayClock,
  type DayPhase,
} from '../../sim/daylight';
import { EGG_HATCH_TIME } from '../../sim/eggs';
import { LAMP_FADE_HOURS, waterLampAt, withLampInto } from '../../sim/lamp';
import { gameDayAt, withMoonInto } from '../../sim/moon';
import type { Mutable, MutableWorld, World } from '../../sim/world-types';
import { refreshDue } from '../dashboard-frame/refresh-pace';
import type { AquariumProbe } from './aquarium-probe';
import type { RenderLoop } from './render-loop';

/** Préréglage de base de la caméra automatique du fond d'écran (#279). */
export const WALLPAPER_PRESET: CameraPreset = 'three-quarter';
/** Écart (s réelles) entre deux expositions de la caméra automatique (`data-aqfish-camera`). */
export const WALLPAPER_CAMERA_EXPOSE_SECONDS = 1;
/** Pas de temps réel maximal versé à la caméra automatique (pas de saut après une pause). */
const WALLPAPER_MAX_ORBIT_STEP_SECONDS = 0.25;

/**
 * Écart d'heure minimal (en heures) avant de recalculer l'éclairage : 0,01 h, soit 0,5 s
 * avec la journée de 20 min. Évite de recalculer (et d'allouer) à chaque image pour un
 * changement invisible une fois l'image ramenée à la palette.
 */
export const LIGHT_HOUR_STEP = 0.01;

/** Ce dont une image a besoin de l'hôte (#696). */
export interface FramePainterPorts {
  readonly document: Document;
  /** Boucle d'images et pas fixe de la simulation. */
  readonly loop: RenderLoop;
  /** Attributs `data-aqfish-*` de l'hôte. */
  readonly probe: AquariumProbe;
  /** Vue courante, `null` avant le démarrage ou après l'arrêt. */
  view(): AquariumView | null;
  /** Monde affiché, `null` avant le démarrage. */
  world(): MutableWorld | null;
  canvas(): HTMLCanvasElement;
  isCapture(): boolean;
  /** Vue fond d'écran (#279) : caméra automatique, cadence limitée. */
  isWallpaper(): boolean;
  /** Images par seconde de la vue fond d'écran. */
  wallpaperFps(): number;
  /** Vitesse de simulation (#52). */
  speed(): number;
  /** Horloge de la journée simulée (ADR 0018). */
  dayClock(): DayClock;
  /** Option « Réduire les mouvements » (#406). */
  reducedMotion(): boolean;
  /** Clarté de la nuit au jour de jeu donné (#856, `DisplayController.moonGlowAt`). */
  moonGlowAt(gameDay: number): number;
  /** Caméra libre (#343) : vrai si la caméra a bougé. */
  stepFreeCamera(view: AquariumView, realDt: number): boolean;
  /** Chute du décor posé (#170). */
  stepDecorDrop(realDt: number): void;
  /** Avance le monde de `steps` pas en tenant son suivi (#511). */
  advanceAndRecord(world: MutableWorld, steps: number, clock: DayClock): void;
  /** Vrai si assez de pas simulés depuis le dernier relevé de l'eau. */
  waterReadDue(world: World): boolean;
  /** Relevé de la boucle : bacs de la pièce en arrière-plan puis eau du bac affiché. */
  readWater(): void;
}

/**
 * Une image de l'aquarium : temps réel versé à la simulation, caméras (transition, libre,
 * automatique du fond d'écran), pose des animaux et du décor, éclairage de l'heure et signal
 * du contrat de capture. Sans allocation par image. Sorti de l'hôte au lot 10 de
 * l'assainissement (#696), sans changement de comportement.
 */
export class FramePainter {
  /**
   * Moment de la journée (issue #73), affiché par l'indicateur soleil / lune. Mis à jour
   * avec l'éclairage (au plus toutes les `LIGHT_HOUR_STEP` heures), et ne notifie que s'il
   * change : quatre fois par journée simulée.
   */
  readonly dayPhase = signal<DayPhase>(dayPhaseAt(DEFAULT_START_HOUR));
  /**
   * Heure affichée par le panneau de contrôle (#52), arrondie au quart d'heure : mise à jour
   * avec l'éclairage et ne notifie qu'au changement de quart d'heure (toutes les 12,5 s
   * réelles à vitesse ×1), jamais à chaque image.
   */
  readonly clockHour = signal<number>(DEFAULT_START_HOUR);

  private readySignaledFlag = false;
  /** Temps réel (s) de la caméra automatique et de sa dernière exposition. */
  private orbitSeconds = 0;
  private orbitExposedAt = Number.NEGATIVE_INFINITY;
  /** Heure de l'éclairage appliqué en dernier (`null` : à appliquer à la prochaine image). */
  private litHour: number | null = null;
  /** Intensité de la lampe appliquée en dernier (`updateLight`). */
  private litLamp: number | null = null;
  /** Clarté lunaire appliquée en dernier (`updateLight`, #856). */
  private litMoon: number | null = null;
  /** Tampon de la lumière du jour, réécrit à chaque recalcul (aucune allocation). */
  private readonly light = createDayLight();
  /** Contexte des gestes passé à `updateFish`, réécrit à chaque image (#433). */
  private readonly behaviorFrame = { time: 0, landedFood: false };
  /** Couches du sol passées à `updateGround`, réécrites à chaque image (#870). */
  private readonly groundFrame: Mutable<GroundFrame> = {
    food: [],
    eggs: undefined,
    hatchTime: EGG_HATCH_TIME,
    exuviae: undefined,
    time: 0,
  };
  /** Instant (ms, horloge de `requestAnimationFrame`) du dernier relevé de la boucle. */
  private waterReadAt: number | null = null;

  constructor(private readonly ports: FramePainterPorts) {}

  /** Vrai dès que la première image a été soumise (signal du contrat de capture). */
  get readySignaled(): boolean {
    return this.readySignaledFlag;
  }

  /** L'éclairage sera recalculé à la prochaine image (horloge ou vue changée). */
  relight(): void {
    this.litHour = null;
  }

  frame(timestamp: number): void {
    const { ports } = this;
    const view = ports.view();
    if (!view) {
      return;
    }
    const capture = ports.isCapture();
    const wallpaper = ports.isWallpaper() && !capture;
    // Fond d'écran (#279) : au plus `wallpaperFps` images par seconde (le temps réel écoulé
    // entre deux images rendues est versé d'un bloc à la simulation).
    if (
      wallpaper &&
      this.readySignaledFlag &&
      ports.loop.throttled(timestamp, ports.wallpaperFps())
    ) {
      ports.loop.schedule();
      return;
    }
    const orbitDt = capture ? 0 : this.stepRealTime(view, timestamp);
    const canvas = ports.canvas();
    if (view.resize(canvas.clientWidth, canvas.clientHeight)) {
      ports.probe.publishCamera(ports.view());
    }
    if (wallpaper) {
      this.stepWallpaperCamera(view, orbitDt);
    }
    const world = ports.world();
    if (world) {
      this.drawWorld(view, world);
    }
    const rendered = view.renderFrame();
    if (rendered && !this.readySignaledFlag) {
      this.signalReady();
    }
    // En mode capture, l'image est figée : on ne rend de nouveau qu'au redimensionnement.
    // Tant qu'aucune image n'a pu être rendue (taille nulle), on réessaie à l'image suivante.
    if (!capture || !rendered) {
      ports.loop.schedule();
    }
  }

  /**
   * Temps simulé affiché : celui du monde, interpolé comme les poissons (alpha = 0 : pas
   * précédent ; en capture, alpha = 1 : état exact au temps demandé).
   */
  renderTime(): number {
    const world = this.ports.world();
    if (!world) {
      return 0;
    }
    const alpha = this.ports.isCapture() ? 1 : this.ports.loop.alpha;
    return Math.max(0, world.time - (1 - alpha) * SIM_DT);
  }

  /**
   * Temps réel de l'image (hors capture) : simulation au pas fixe, transition de caméra,
   * caméra libre, fondu du ciel couvert et chute du décor. Renvoie le temps réel écoulé (s).
   */
  private stepRealTime(view: AquariumView, timestamp: number): number {
    const { ports } = this;
    const realDt = this.advanceRealTime(timestamp);
    if (view.stepCameraTransition(realDt)) {
      ports.probe.publishCamera(ports.view());
    }
    // Caméra libre (#343) : touches tenues, pas fixes du modèle de déplacement.
    if (ports.stepFreeCamera(view, realDt)) {
      ports.probe.publishCamera(ports.view());
    }
    // Fondu du ciel couvert à la bascule de la pluie (#338) : jamais en capture.
    view.stepOvercastFade(realDt);
    ports.stepDecorDrop(realDt);
    return realDt;
  }

  /** Pose les animaux, la nourriture, les œufs, le décor et la lumière du temps affiché. */
  private drawWorld(view: AquariumView, world: World): void {
    // En capture, l'image montre exactement l'état au temps demandé (alpha = 1).
    const time = this.renderTime();
    // Gestes des comportements (#427) : au temps affiché, fouille seulement s'il y a un
    // granulé posé (`sim/behaviors.ts`).
    // Objet de l'instance réécrit à chaque image (#433) : aucune allocation.
    this.behaviorFrame.time = time;
    this.behaviorFrame.landedFood = hasLandedFood(world.food);
    view.updateFish(
      world.entities,
      this.ports.isCapture() ? 1 : this.ports.loop.alpha,
      world.seed,
      this.behaviorFrame,
      world.dead,
    );
    // Objet de l'instance réécrit à chaque image (#870) : aucune allocation.
    const ground = this.groundFrame;
    ground.food = world.food;
    ground.eggs = world.eggs;
    ground.exuviae = world.exuviae;
    ground.time = world.time;
    view.updateGround(ground);
    view.updateDecor(time);
    this.updateLight(view, time);
  }

  /**
   * Première image soumise : on attend l'image suivante pour être sûr qu'elle est composée à
   * l'écran avant de lever le signal du contrat de capture.
   */
  private signalReady(): void {
    this.readySignaledFlag = true;
    const { document } = this.ports;
    document.defaultView?.requestAnimationFrame(() => {
      if (this.ports.view()) {
        markCaptureReady(document);
      }
    });
  }

  /**
   * Caméra automatique du fond d'écran (#279) : balancement lent autour de la vue
   * trois-quarts, au temps réel (indépendant de la simulation et de sa vitesse) ; exposée au
   * plus toutes les `WALLPAPER_CAMERA_EXPOSE_SECONDS`.
   */
  private stepWallpaperCamera(view: AquariumView, realDt: number): void {
    const dt = Number.isFinite(realDt) && realDt > 0 ? realDt : 0;
    this.orbitSeconds += Math.min(dt, WALLPAPER_MAX_ORBIT_STEP_SECONDS);
    view.applyOrbit(WALLPAPER_PRESET, wallpaperOrbitAngle(this.orbitSeconds));
    if (this.orbitSeconds - this.orbitExposedAt >= WALLPAPER_CAMERA_EXPOSE_SECONDS) {
      this.orbitExposedAt = this.orbitSeconds;
      this.ports.probe.publishCamera(this.ports.view());
    }
  }

  /**
   * Éclairage de l'heure courante, recalculé seulement si l'heure a bougé d'au moins
   * `LIGHT_HOUR_STEP` (ou après une bascule de l'horloge) ; l'heure exposée suit.
   */
  private updateLight(view: AquariumView, time: number): void {
    const clock = this.ports.dayClock();
    const hour = hourAt(clock, time);
    const lamp = this.lampAt(hour);
    // Lune (#856) : arrondie au centième, elle ne change qu'une fois en quelques heures de jeu.
    const moon = this.ports.moonGlowAt(gameDayAt(time, clock.dayLengthSeconds));
    if (
      this.litHour === null ||
      Math.abs(hour - this.litHour) >= LIGHT_HOUR_STEP ||
      lamp !== this.litLamp ||
      moon !== this.litMoon
    ) {
      this.litHour = hour;
      this.litLamp = lamp;
      this.litMoon = moon;
      // Lampe du bac (#584) : ajoutée à la lumière du jour, sans jamais l'assombrir ; puis la
      // lune, qui n'agit que la nuit (une lampe allumée l'efface).
      const light = withLampInto(lightAtInto(hour, this.light), lamp);
      view.updateLight(withMoonInto(light, moon));
      view.updateFlowers(hour);
      view.updateLightRays(hour);
      this.dayPhase.set(dayPhaseAt(hour));
      this.clockHour.set(snapHour(hour));
    }
    const { probe } = this.ports;
    // Rayons (#567) : au plus une écriture par seconde.
    probe.publishLightRays(view.lightRaysStrength, view.lightRaysTime);
    probe.publishLamp(lamp);
    probe.publishHour(hour);
  }

  /**
   * Intensité de la lampe du bac affiché à l'heure `hour` (#584), arrondie au centième (pas de
   * recalcul de l'éclairage pour un écart invisible) : 0 hors des bacs à lampe. « Réduire les
   * mouvements » : changement net, sans fondu.
   */
  private lampAt(hour: number): number {
    const world = this.ports.world();
    if (!world || !hasAlgae(world.environment)) {
      return 0;
    }
    const fade = this.ports.reducedMotion() ? 0 : LAMP_FADE_HOURS;
    return Math.round(waterLampAt(world.water, hour, fade) * 100) / 100;
  }

  /**
   * Avance la simulation du temps réel écoulé depuis l'image précédente (hors capture).
   * Renvoie ce temps, en secondes (0 à la première image).
   */
  private advanceRealTime(timestamp: number): number {
    const { ports } = this;
    // Vitesse (#52) : temps simulé = temps réel × vitesse, toujours par pas `SIM_DT`.
    const realDt = ports.loop.advance(timestamp, ports.speed());
    const steps = ports.loop.clock.steps;
    const world = ports.world();
    if (steps > 0 && world) {
      ports.advanceAndRecord(world, steps, ports.dayClock());
      ports.probe.publishTick(world);
      ports.probe.publishFood(world);
      // Au plus 4 relevés par seconde de temps réel, quelle que soit la vitesse (#256).
      if (ports.waterReadDue(world) && refreshDue(timestamp, this.waterReadAt)) {
        this.waterReadAt = timestamp;
        // Les autres bacs avancent par lots, au rythme des relevés (#316, ADR 0076).
        ports.readWater();
      }
    }
    return realDt;
  }
}
