import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  DOCUMENT,
  ElementRef,
  inject,
  InjectionToken,
  signal,
  viewChild,
} from '@angular/core';

import { parseCaptureParams, type CameraPreset } from '../../core/capture/capture-params';
import {
  type FilterStorage,
  initialRenderFilter,
  readStoredRenderFilter,
  type RenderFilter,
  toggleRenderFilter,
  writeStoredRenderFilter,
} from '../../core/render-filter/render-filter';
import { markCaptureReady, resetCaptureReady } from '../../core/capture/capture-ready';
import {
  AquariumView,
  createWebGLRenderer,
  type AquariumRendererFactory,
} from '../../render/aquarium-view';
import { CAMERA_TRANSITION_SECONDS } from '../../render/camera-presets';
import { SIM_DT } from '../../sim/constants';
import {
  createDayClock,
  createDayLight,
  dayPhaseAt,
  type DayPhase,
  DEFAULT_DAY_CLOCK,
  DEFAULT_DAY_LENGTH_SECONDS,
  DEFAULT_START_HOUR,
  freezeClockAt,
  hourAt,
  lightAtInto,
  toggleClock,
  type DayClock,
} from '../../sim/daylight';
import { fixedStepInto, type FixedStepState } from '../../sim/fixed-step';
import {
  advanceInPlace,
  advanceToWithFeedings,
  createDefaultWorld,
  feedInPlace,
  type MutableWorld,
  type World,
} from '../../sim/world';

/** Fabrique du renderer, remplaçable dans les tests (jsdom n'a pas WebGL). */
export const AQUARIUM_RENDERER_FACTORY = new InjectionToken<AquariumRendererFactory>(
  'AQUARIUM_RENDERER_FACTORY',
  { providedIn: 'root', factory: () => createWebGLRenderer },
);

/** Attribut du composant hôte exposant la position de la caméra aux tests de bout en bout. */
export const CAMERA_ATTRIBUTE = 'data-aqfish-camera';
/** Attribut du composant hôte exposant la cible de la caméra (mis à jour avec la position). */
export const CAMERA_TARGET_ATTRIBUTE = 'data-aqfish-target';
/** Attribut du composant hôte exposant `world.tick` (mis à jour quand il change). */
export const TICK_ATTRIBUTE = 'data-aqfish-tick';
/** Attribut du composant hôte exposant la graine du monde (fixée au démarrage). */
export const SEED_ATTRIBUTE = 'data-aqfish-seed';
/** Attribut du composant hôte exposant le filtre de rendu courant (`pixel` ou `aucun`). */
export const FILTER_ATTRIBUTE = 'data-aqfish-filter';

/** Attribut du composant hôte exposant le nombre de granulés de nourriture du monde (#67). */
export const FOOD_ATTRIBUTE = 'data-aqfish-food';

/** Attribut du composant hôte exposant l'heure de la journée affichée (2 décimales). */
export const HOUR_ATTRIBUTE = 'data-aqfish-hour';
/** Attribut du composant hôte : `true` si l'heure est figée, `false` sinon. */
export const HOUR_FROZEN_ATTRIBUTE = 'data-aqfish-hour-frozen';

/**
 * Écart d'heure minimal (en heures) avant de recalculer l'éclairage : 0,01 h, soit 0,5 s
 * avec la journée de 20 min. Évite de recalculer (et d'allouer) à chaque image pour un
 * changement invisible une fois l'image ramenée à la palette.
 */
export const LIGHT_HOUR_STEP = 0.01;

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

/** `localStorage` s'il est accessible, `null` sinon (l'accès lui-même peut lever). */
function browserStorage(win: Window): FilterStorage | null {
  try {
    return win.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Hôte du canvas 3D : crée la vue, porte la boucle `requestAnimationFrame`, suit la taille
 * de la fenêtre et libère toutes les ressources Three.js à la destruction.
 *
 * Simulation : le monde (`sim/world.ts`) est créé avec la graine de l'URL. Hors capture, il
 * avance en temps réel par pas fixes (`sim/fixed-step.ts`). En mode capture, il est avancé
 * jusqu'à `time` par pas fixes, sans temps réel, avant le premier rendu, puis figé.
 *
 * Contrat de capture : avec `capture=1`, pixel ratio forcé à 1, caméra figée sur le
 * préréglage demandé, une seule image rendue (puis à chaque redimensionnement). Dans tous
 * les modes, `markCaptureReady()` est appelé après la première image complète.
 * Aucun signal n'est mis à jour à chaque image (docs/ARCHITECTURE.md, « Interface »).
 *
 * Boucle d'affichage sans allocation : le monde appartient à l'hôte et avance en place
 * (`advanceInPlace`), l'accumulateur est réécrit dans un objet réutilisé (`fixedStepInto`)
 * et le rappel `requestAnimationFrame` est créé une seule fois.
 */
@Component({
  selector: 'app-aquarium-host',
  template: `<canvas
    #canvas
    class="aquarium-host__canvas"
    aria-label="Aquarium en 3D : faites glisser pour tourner, molette pour zoomer, clic droit pour vous déplacer, cliquez sur l’eau pour nourrir les poissons"
  ></canvas>`,
  styleUrl: './aquarium-host.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AquariumHost {
  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly document = inject(DOCUMENT);
  private readonly rendererFactory = inject(AQUARIUM_RENDERER_FACTORY);

  private view: AquariumView | null = null;
  private frameId: number | null = null;
  private readySignaled = false;
  private capture = false;
  private currentWorld: MutableWorld | null = null;
  /** État de la boucle à pas fixe, réécrit à chaque image (aucune allocation). */
  private readonly clock: FixedStepState = { steps: 0, accumulator: 0, alpha: 0 };
  private lastTimestamp: number | null = null;
  private exposedTick: number | null = null;
  private exposedFood: number | null = null;
  /** Horloge de la journée simulée (ADR 0018) : l'heure suit `world.time`. */
  private dayClock: DayClock = DEFAULT_DAY_CLOCK;
  /** Heure de l'éclairage appliqué en dernier (`null` : à appliquer à la prochaine image). */
  private litHour: number | null = null;
  /** Tampon de la lumière du jour, réécrit à chaque recalcul (aucune allocation). */
  private readonly light = createDayLight();
  private exposedHour: string | null = null;
  private readonly onFrame: FrameRequestCallback = (timestamp) => this.frame(timestamp);
  private readonly cleanups: (() => void)[] = [];

  /**
   * Préréglage que la caméra suit ou rejoint, `null` dès que l'utilisateur la déplace à la
   * souris (bug #23). Mis à jour au choix d'un préréglage et au début d'un geste, jamais à
   * chaque image. La barre des vues l'affiche.
   */
  readonly activePreset = signal<CameraPreset | null>(null);

  /**
   * Filtre de rendu courant (issue #33). Pixel art par défaut ; `filtre=` dans l'URL prime
   * sur le choix mémorisé (`aqfish.filtre`). Mis à jour à la bascule seulement.
   */
  readonly filter = signal<RenderFilter>('pixel');

  /**
   * Moment de la journée (issue #73), affiché par l'indicateur soleil / lune. Mis à jour
   * avec l'éclairage (au plus toutes les `LIGHT_HOUR_STEP` heures), et ne notifie que s'il
   * change : quatre fois par journée simulée.
   */
  readonly dayPhase = signal<DayPhase>(dayPhaseAt(DEFAULT_START_HOUR));

  /** État courant de la simulation (`null` avant le démarrage et après la destruction). */
  get world(): World | null {
    return this.currentWorld;
  }

  /** Nombre de bulles affichées à la dernière image (tests de bout en bout). */
  get bubbleCount(): number {
    return this.view?.bubbleCount ?? 0;
  }

  /** Facteur d'interpolation du rendu entre les deux derniers pas, dans [0, 1). */
  get interpolationAlpha(): number {
    return this.clock.alpha;
  }

  /**
   * Amène la caméra sur un préréglage (barre de vues, raccourcis clavier) : transition courte
   * hors capture, placement instantané en mode capture (déterminisme du contrat).
   */
  goToPreset(preset: CameraPreset): void {
    const view = this.view;
    if (!view) {
      return;
    }
    this.activePreset.set(preset);
    view.animateToPreset(preset, this.capture ? 0 : CAMERA_TRANSITION_SECONDS);
    if (!view.transitioning) {
      this.exposeCamera();
    }
    this.scheduleFrame();
  }

  /**
   * Change le filtre de rendu à chaud (bouton « Pixel art », touche `P`) : la simulation, la
   * caméra et la vue ne sont pas réinitialisées. Le choix est mémorisé s'il est possible de
   * l'écrire, sinon il reste en mémoire pour la session (repli silencieux).
   */
  setFilter(filter: RenderFilter): void {
    const view = this.view;
    if (!view) {
      return;
    }
    if (view.setFilter(filter)) {
      this.filter.set(filter);
      this.exposeFilter();
      this.scheduleFrame();
    }
    const win = this.document.defaultView;
    if (win && !this.capture) {
      writeStoredRenderFilter(browserStorage(win), filter);
    }
  }

  /** Heure de la journée affichée, dans [0, 24) (`null` avant le démarrage). */
  get hour(): number | null {
    return this.currentWorld ? hourAt(this.dayClock, this.renderTime()) : null;
  }

  /**
   * Fige l'heure ou la remet en marche (touche `H`), sans saut d'heure. Sans effet en mode
   * capture (l'heure y est toujours figée : contrat de capture).
   */
  toggleClock(): void {
    if (!this.currentWorld || this.capture) {
      return;
    }
    this.dayClock = toggleClock(this.dayClock, this.renderTime());
    this.litHour = null;
    this.host.nativeElement.setAttribute(HOUR_FROZEN_ATTRIBUTE, String(this.dayClock.frozen));
    this.scheduleFrame();
  }

  /**
   * Fige l'heure à `hour` (touches « plein jour » et « nuit », issue #75), que l'horloge
   * tourne ou non ; `toggleClock` la remet ensuite en marche depuis cette heure, sans saut.
   * Sans effet en mode capture (contrat de capture) ou si `hour` n'est pas un réel fini.
   */
  freezeClockAt(hour: number): void {
    if (!this.currentWorld || this.capture || !Number.isFinite(hour)) {
      return;
    }
    this.dayClock = freezeClockAt(this.dayClock, hour);
    this.litHour = null;
    this.host.nativeElement.setAttribute(HOUR_FROZEN_ATTRIBUTE, 'true');
    this.scheduleFrame();
  }

  /**
   * Dépose des granulés autour de (x, z), dans le repère du bac (clic sur l'eau, issue #67).
   * Sans effet en mode capture (image figée : les dépôts passent par `nourrir=`), avant le
   * démarrage, ou pour un point hors du bac.
   */
  feed(x: number, z: number): void {
    const world = this.currentWorld;
    if (!world || this.capture || !Number.isFinite(x) || !Number.isFinite(z)) {
      return;
    }
    if (feedInPlace(world, x, z) > 0) {
      this.exposeFood();
      this.scheduleFrame();
    }
  }

  /** Dépose des granulés au centre du bac (bouton « Nourrir », touche `G`). */
  feedAtCenter(): void {
    this.feed(0, 0);
  }

  /** Bascule entre pixel art et rendu sans filtre. */
  toggleFilter(): void {
    this.setFilter(toggleRenderFilter(this.filter()));
  }

  constructor() {
    afterNextRender(() => this.start());
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  private start(): void {
    const win = this.document.defaultView;
    if (!win) {
      return;
    }
    const params = parseCaptureParams(win.location.search);
    this.capture = params.capture;
    // En mode capture, le temps demandé est atteint ici, avant toute image (contrat de capture).
    // Le monde créé ici appartient à l'hôte seul : il pourra être avancé en place.
    // Dépôts de nourriture de `nourrir=` (#67) : au temps simulé de chacun, en capture.
    const world: MutableWorld = createDefaultWorld(params.seed);
    this.currentWorld = params.capture
      ? advanceToWithFeedings(world, params.time, params.feedings)
      : world;
    this.dayClock = initialDayClock(params.hour, params.capture);
    this.host.nativeElement.setAttribute(HOUR_FROZEN_ATTRIBUTE, String(this.dayClock.frozen));
    this.host.nativeElement.setAttribute(SEED_ATTRIBUTE, String(this.currentWorld.seed));
    this.exposeTick();
    this.exposeFood();

    const filter = initialRenderFilter(
      params.filter,
      params.capture ? null : readStoredRenderFilter(browserStorage(win)),
      params.capture,
    );
    this.filter.set(filter);

    const view = new AquariumView({
      canvas: this.canvasRef().nativeElement,
      rendererFactory: this.rendererFactory,
      pixelRatio: params.capture ? 1 : win.devicePixelRatio || 1,
      preset: params.camera,
      interactive: !params.capture,
      filter,
    });
    this.view = view;
    view.setDecor(this.currentWorld.decor, this.currentWorld.seed);
    this.exposeFilter();

    this.activePreset.set(params.camera);
    this.cleanups.push(view.onCameraChange(() => this.exposeCamera()));
    this.cleanups.push(view.onUserInteraction(() => this.activePreset.set(null)));
    this.cleanups.push(view.onSurfaceClick((x, z) => this.feed(x, z)));
    const onResize = () => this.scheduleFrame();
    win.addEventListener('resize', onResize);
    this.cleanups.push(() => win.removeEventListener('resize', onResize));

    this.scheduleFrame();
  }

  private scheduleFrame(): void {
    const win = this.document.defaultView;
    if (!win || !this.view || this.frameId !== null) {
      return;
    }
    this.frameId = win.requestAnimationFrame(this.onFrame);
  }

  private frame(timestamp: number): void {
    this.frameId = null;
    const view = this.view;
    if (!view) {
      return;
    }
    if (!this.capture) {
      const realDt = this.advanceRealTime(timestamp);
      if (view.stepCameraTransition(realDt)) {
        this.exposeCamera();
      }
    }
    const canvas = this.canvasRef().nativeElement;
    if (view.resize(canvas.clientWidth, canvas.clientHeight)) {
      this.exposeCamera();
    }
    if (this.currentWorld) {
      // En capture, l'image montre exactement l'état au temps demandé (alpha = 1).
      view.updateFish(this.currentWorld.entities, this.capture ? 1 : this.clock.alpha);
      view.updateFood(this.currentWorld.food);
      const time = this.renderTime();
      view.updateDecor(time);
      this.updateLight(view, time);
    }
    const rendered = view.renderFrame();

    if (rendered && !this.readySignaled) {
      this.readySignaled = true;
      // L'image vient d'être soumise : on attend l'image suivante pour être sûr qu'elle est
      // composée à l'écran avant de lever le signal du contrat de capture.
      this.document.defaultView?.requestAnimationFrame(() => {
        if (this.view) {
          markCaptureReady(this.document);
        }
      });
    }
    // En mode capture, l'image est figée : on ne rend de nouveau qu'au redimensionnement.
    // Tant qu'aucune image n'a pu être rendue (taille nulle), on réessaie à l'image suivante.
    if (!this.capture || !rendered) {
      this.scheduleFrame();
    }
  }

  /**
   * Temps simulé affiché : celui du monde, interpolé comme les poissons (alpha = 0 : pas
   * précédent ; en capture, alpha = 1 : état exact au temps demandé).
   */
  private renderTime(): number {
    const world = this.currentWorld;
    if (!world) {
      return 0;
    }
    const alpha = this.capture ? 1 : this.clock.alpha;
    return Math.max(0, world.time - (1 - alpha) * SIM_DT);
  }

  /**
   * Éclairage de l'heure courante, recalculé seulement si l'heure a bougé d'au moins
   * `LIGHT_HOUR_STEP` (ou après une bascule de l'horloge) ; l'heure exposée suit.
   */
  private updateLight(view: AquariumView, time: number): void {
    const hour = hourAt(this.dayClock, time);
    if (this.litHour === null || Math.abs(hour - this.litHour) >= LIGHT_HOUR_STEP) {
      this.litHour = hour;
      view.updateLight(lightAtInto(hour, this.light));
      this.dayPhase.set(dayPhaseAt(hour));
    }
    // Une heure comme 23,999 s'arrondit à « 24.00 » : affichée « 0.00 ».
    const rounded = hour.toFixed(2);
    const exposed = rounded === '24.00' ? '0.00' : rounded;
    if (exposed !== this.exposedHour) {
      this.exposedHour = exposed;
      this.host.nativeElement.setAttribute(HOUR_ATTRIBUTE, exposed);
    }
  }

  /**
   * Avance la simulation du temps réel écoulé depuis l'image précédente (hors capture).
   * Renvoie ce temps, en secondes (0 à la première image).
   */
  private advanceRealTime(timestamp: number): number {
    // Première image : pas de durée de référence, aucun pas.
    const realDt = this.lastTimestamp === null ? 0 : (timestamp - this.lastTimestamp) / 1000;
    this.lastTimestamp = timestamp;
    const clock = fixedStepInto(this.clock.accumulator, realDt, this.clock);
    if (clock.steps > 0 && this.currentWorld) {
      advanceInPlace(this.currentWorld, clock.steps);
      this.exposeTick();
      this.exposeFood();
    }
    return realDt;
  }

  /**
   * Expose `world.tick` aux tests de bout en bout (`data-aqfish-tick`), y compris en build de
   * production. Seule écriture DOM de la boucle : une courte chaîne, et seulement quand le
   * compteur a changé.
   */
  private exposeTick(): void {
    const world = this.currentWorld;
    if (!world || world.tick === this.exposedTick) {
      return;
    }
    this.exposedTick = world.tick;
    this.host.nativeElement.setAttribute(TICK_ATTRIBUTE, String(world.tick));
  }

  /** Expose le nombre de granulés (`data-aqfish-food`), seulement quand il change. */
  private exposeFood(): void {
    const world = this.currentWorld;
    if (!world || world.food.length === this.exposedFood) {
      return;
    }
    this.exposedFood = world.food.length;
    this.host.nativeElement.setAttribute(FOOD_ATTRIBUTE, String(world.food.length));
  }

  private exposeFilter(): void {
    this.host.nativeElement.setAttribute(FILTER_ATTRIBUTE, this.filter());
  }

  private exposeCamera(): void {
    if (!this.view) {
      return;
    }
    const format = (v: readonly number[]) => v.map((c) => c.toFixed(3)).join(',');
    this.host.nativeElement.setAttribute(CAMERA_ATTRIBUTE, format(this.view.cameraPosition()));
    this.host.nativeElement.setAttribute(CAMERA_TARGET_ATTRIBUTE, format(this.view.cameraTarget()));
  }

  private stop(): void {
    if (this.frameId !== null) {
      this.document.defaultView?.cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
    this.cleanups.splice(0).forEach((cleanup) => cleanup());
    this.view?.dispose();
    this.view = null;
    this.currentWorld = null;
    if (this.readySignaled) {
      resetCaptureReady(this.document);
    }
  }
}
