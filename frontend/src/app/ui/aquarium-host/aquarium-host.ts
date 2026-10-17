import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  DOCUMENT,
  ElementRef,
  inject,
  InjectionToken,
  viewChild,
} from '@angular/core';

import { parseCaptureParams } from '../../core/capture/capture-params';
import { markCaptureReady, resetCaptureReady } from '../../core/capture/capture-ready';
import {
  AquariumView,
  createWebGLRenderer,
  type AquariumRendererFactory,
} from '../../render/aquarium-view';
import { fixedStep } from '../../sim/fixed-step';
import { advance, advanceTo, createWorld, type World } from '../../sim/world';

/** Fabrique du renderer, remplaçable dans les tests (jsdom n'a pas WebGL). */
export const AQUARIUM_RENDERER_FACTORY = new InjectionToken<AquariumRendererFactory>(
  'AQUARIUM_RENDERER_FACTORY',
  { providedIn: 'root', factory: () => createWebGLRenderer },
);

/** Attribut du composant hôte exposant la position de la caméra aux tests de bout en bout. */
export const CAMERA_ATTRIBUTE = 'data-aqfish-camera';

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
  private currentWorld: World | null = null;
  private accumulator = 0;
  private alpha = 0;
  private lastTimestamp: number | null = null;
  private readonly cleanups: (() => void)[] = [];

  /** État courant de la simulation (`null` avant le démarrage et après la destruction). */
  get world(): World | null {
    return this.currentWorld;
  }

  /** Facteur d'interpolation du rendu entre les deux derniers pas, dans [0, 1). */
  get interpolationAlpha(): number {
    return this.alpha;
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
    const world = createWorld(params.seed);
    this.currentWorld = params.capture ? advanceTo(world, params.time) : world;

    const view = new AquariumView({
      canvas: this.canvasRef().nativeElement,
      rendererFactory: this.rendererFactory,
      pixelRatio: params.capture ? 1 : win.devicePixelRatio || 1,
      preset: params.camera,
      interactive: !params.capture,
    });
    this.view = view;

    this.cleanups.push(view.onCameraChange(() => this.exposeCamera()));
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
    this.frameId = win.requestAnimationFrame((timestamp) => this.frame(timestamp));
  }

  private frame(timestamp: number): void {
    this.frameId = null;
    const view = this.view;
    if (!view) {
      return;
    }
    if (!this.capture) {
      this.advanceRealTime(timestamp);
    }
    const canvas = this.canvasRef().nativeElement;
    if (view.resize(canvas.clientWidth, canvas.clientHeight)) {
      this.exposeCamera();
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

  /** Avance la simulation du temps réel écoulé depuis l'image précédente (hors capture). */
  private advanceRealTime(timestamp: number): void {
    // Première image : pas de durée de référence, aucun pas.
    const realDt = this.lastTimestamp === null ? 0 : (timestamp - this.lastTimestamp) / 1000;
    this.lastTimestamp = timestamp;
    const result = fixedStep({ accumulator: this.accumulator, realDt });
    this.accumulator = result.accumulator;
    this.alpha = result.alpha;
    if (result.steps > 0 && this.currentWorld) {
      this.currentWorld = advance(this.currentWorld, result.steps);
    }
  }

  private exposeCamera(): void {
    if (!this.view) {
      return;
    }
    const value = this.view
      .cameraPosition()
      .map((c) => c.toFixed(3))
      .join(',');
    this.host.nativeElement.setAttribute(CAMERA_ATTRIBUTE, value);
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
