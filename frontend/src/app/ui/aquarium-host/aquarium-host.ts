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
  private readonly cleanups: (() => void)[] = [];

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
    this.frameId = win.requestAnimationFrame(() => this.frame());
  }

  private frame(): void {
    this.frameId = null;
    const view = this.view;
    if (!view) {
      return;
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
    if (this.readySignaled) {
      resetCaptureReady(this.document);
    }
  }
}
