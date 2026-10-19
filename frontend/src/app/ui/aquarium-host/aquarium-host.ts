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
import { fixedStepInto, type FixedStepState } from '../../sim/fixed-step';
import {
  advanceInPlace,
  advanceTo,
  createDefaultWorld,
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
    aria-label="Aquarium en 3D : faites glisser pour tourner, molette pour zoomer, clic droit pour vous déplacer"
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
    const world: MutableWorld = createDefaultWorld(params.seed);
    this.currentWorld = params.capture ? advanceTo(world, params.time) : world;
    this.host.nativeElement.setAttribute(SEED_ATTRIBUTE, String(this.currentWorld.seed));
    this.exposeTick();

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
      // Temps du décor interpolé comme les poissons (alpha = 0 : pas précédent).
      const alpha = this.capture ? 1 : this.clock.alpha;
      view.updateDecor(Math.max(0, this.currentWorld.time - (1 - alpha) * SIM_DT));
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
