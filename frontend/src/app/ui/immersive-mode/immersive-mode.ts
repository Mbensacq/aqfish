import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  DOCUMENT,
  ElementRef,
  InjectionToken,
  afterNextRender,
  computed,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';

import {
  CalibrationStore,
  type CalibrationStorage,
} from '../../core/immersive/calibration-storage';
import {
  clampEyeDistanceMm,
  defaultEyeDistanceMm,
  EYE_DISTANCE_MM,
} from '../../core/immersive/off-axis';
import {
  CARD_HEIGHT_MM,
  CARD_WIDTH_MM,
  PX_PER_MM_LIMITS,
  calibrationFromCard,
  cardWidthPx,
  screenSizeMm,
  type ScreenCalibration,
  type ScreenSizeMm,
} from '../../core/immersive/screen-calibration';
import { AquariumView } from '../../render/aquarium-view';
import { lightAt } from '../../sim/daylight';
import { placeEnvironmentData } from '../../sim/environment';
import { fixedStepInto, type FixedStepState } from '../../sim/fixed-step';
import {
  IMMERSIVE_DEPTH_MM,
  clampDepthMm,
  createImmersiveWorld,
  defaultDepthMm,
  immersiveLayout,
  type ImmersiveLayout,
} from '../../sim/immersive-tank';
import { sameDimensions } from '../../sim/tank';
import { advanceInPlace, type MutableWorld } from '../../sim/world';
import { AQUARIUM_RENDERER_FACTORY } from '../aquarium-host/aquarium-host';

/** Graine du bac immersif (fixe : le bac est un décor, jamais sauvegardé). */
export const IMMERSIVE_SEED = 345;

/** Stockage de l'étalonnage, remplaçable dans les tests ; `null` si inaccessible. */
export const IMMERSIVE_STORAGE = new InjectionToken<CalibrationStorage | null>(
  'IMMERSIVE_STORAGE',
  {
    providedIn: 'root',
    factory: () => {
      try {
        return inject(DOCUMENT).defaultView?.localStorage ?? null;
      } catch {
        return null;
      }
    },
  },
);

/**
 * Mode immersif, lot 1 (#345, ADR 0086) : plein cadre au-dessus de l'application, un bac aux
 * proportions de l'écran vu à travers sa vitre avant par une projection décentrée
 * (`AquariumView.setImmersiveCamera`). L'écran s'étalonne avec une carte ID-1 ; sans
 * étalonnage, sa taille est estimée et la mention l'indique. Contenu en mode décor : pas une
 * simulation réaliste. Le bac et sa vue sont recréés quand la taille physique de l'écran
 * change (redimensionnement, rotation, étalonnage, profondeur).
 */
@Component({
  selector: 'app-immersive-mode',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './immersive-mode.scss',
  host: {
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': 'Mode immersif',
    '[attr.data-immersive-calibrated]': '!calibration().estimated',
    '[attr.data-immersive-screen-mm]': 'screenText()',
    '(document:keydown.escape)': 'onEscape()',
  },
  template: `
    <canvas #canvas class="immersive__canvas" aria-hidden="true"></canvas>
    <div class="immersive__bar">
      <p class="immersive__note" data-immersive-note>
        Mode décor : pas une simulation réaliste.
        @if (calibration().estimated) {
          <strong data-immersive-estimated>Taille de l’écran estimée</strong> : étalonnez-le.
        }
      </p>
      <div class="immersive__actions">
        <button
          type="button"
          class="immersive__button"
          (click)="toggleSettings()"
          [attr.aria-expanded]="settingsOpen()"
        >
          Réglages
        </button>
        <button
          type="button"
          class="immersive__button"
          (click)="startCalibration()"
          data-immersive-calibrate
        >
          Étalonner
        </button>
        <button type="button" class="immersive__button" (click)="closed.emit()" data-immersive-exit>
          Quitter
        </button>
      </div>
      @if (settingsOpen()) {
        <div class="immersive__settings">
          <label class="immersive__field">
            Distance de l’œil : {{ centimeters(eyeDistanceMm()) }} cm
            <input
              type="range"
              min="150"
              max="1500"
              step="10"
              [value]="eyeDistanceMm()"
              (input)="onEyeDistance($event)"
              data-immersive-eye
            />
          </label>
          <label class="immersive__field">
            Profondeur du bac : {{ centimeters(depthMm()) }} cm
            <input
              type="range"
              min="20"
              max="600"
              step="5"
              [value]="depthMm()"
              (input)="onDepth($event)"
              data-immersive-depth
            />
          </label>
        </div>
      }
    </div>
    @if (calibrating()) {
      <div
        class="immersive__calibration"
        role="group"
        aria-label="Étalonnage de l’écran"
        data-immersive-calibration
      >
        <p class="immersive__instructions">
          Posez une carte bancaire (ou toute carte au format 85,60 × 53,98 mm) contre l’écran et
          ajustez le rectangle à sa largeur.
        </p>
        <div
          class="immersive__card"
          data-immersive-card
          [style.width.px]="cardPx()"
          [style.height.px]="cardPx() * cardRatio"
        ></div>
        <label class="immersive__field">
          Largeur de la carte
          <input
            type="range"
            [attr.min]="cardMin"
            [attr.max]="cardMax()"
            step="1"
            [value]="cardPx()"
            (input)="onCard($event)"
            data-immersive-card-width
          />
        </label>
        <div class="immersive__actions">
          <button
            type="button"
            class="immersive__button"
            (click)="validateCalibration()"
            data-immersive-validate
          >
            Valider
          </button>
          <button type="button" class="immersive__button" (click)="resetCalibration()">
            Oublier
          </button>
          <button type="button" class="immersive__button" (click)="calibrating.set(false)">
            Annuler
          </button>
        </div>
        @if (!persisted()) {
          <p class="immersive__instructions">Étalonnage gardé pour cette session seulement.</p>
        }
      </div>
    }
  `,
})
export class ImmersiveMode {
  /** Sortie du mode immersif (bouton « Quitter » ou Échap). */
  readonly closed = output<void>();

  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly document = inject(DOCUMENT);
  private readonly rendererFactory = inject(AQUARIUM_RENDERER_FACTORY);
  private readonly store = new CalibrationStore(inject(IMMERSIVE_STORAGE));

  readonly calibration = signal<ScreenCalibration>(this.store.calibration);
  readonly screen = signal<ScreenSizeMm | null>(null);
  readonly eyeDistanceMm = signal<number>(EYE_DISTANCE_MM.desktop);
  readonly depthMm = signal<number>(IMMERSIVE_DEPTH_MM.min);
  readonly settingsOpen = signal(false);
  readonly calibrating = signal(false);
  readonly cardPx = signal(cardWidthPx(this.calibration()));
  readonly persisted = signal(true);
  readonly cardRatio = CARD_HEIGHT_MM / CARD_WIDTH_MM;
  readonly cardMin = Math.ceil(CARD_WIDTH_MM * PX_PER_MM_LIMITS.min);
  readonly cardMax = signal(Math.floor(CARD_WIDTH_MM * PX_PER_MM_LIMITS.max));
  readonly screenText = computed(() => {
    const s = this.screen();
    return s === null ? null : `${s.width.toFixed(1)}x${s.height.toFixed(1)}`;
  });

  private view: AquariumView | null = null;
  private world: MutableWorld | null = null;
  private layout: ImmersiveLayout | null = null;
  /** Réglages choisis à la main (sinon, défauts selon la taille de l'écran). */
  private eyeChosen = false;
  private depthChosen = false;
  private frameId: number | null = null;
  private lastTime: number | null = null;
  private readonly clock: FixedStepState = { steps: 0, accumulator: 0, alpha: 0 };
  private readonly frameCallback = (time: number) => this.frame(time);
  private sizeKey = '';

  constructor() {
    afterNextRender(() => this.scheduleFrame());
    inject(DestroyRef).onDestroy(() => {
      const win = this.document.defaultView;
      if (this.frameId !== null && win) {
        win.cancelAnimationFrame(this.frameId);
      }
      this.frameId = null;
      this.view?.dispose();
      this.view = null;
      this.world = null;
    });
  }

  /** Longueur `mm` en centimètres entiers, pour l'affichage. */
  centimeters(mm: number): number {
    return Math.round(mm / 10);
  }

  /** Vue courante (tests). */
  get immersiveView(): AquariumView | null {
    return this.view;
  }

  /** Dimensions du bac courant (tests). */
  get currentLayout(): ImmersiveLayout | null {
    return this.layout;
  }

  toggleSettings(): void {
    this.settingsOpen.update((open) => !open);
  }

  startCalibration(): void {
    const width = this.canvasRef().nativeElement.clientWidth;
    if (width > 0) {
      this.cardMax.set(
        Math.max(
          this.cardMin,
          Math.min(Math.floor(CARD_WIDTH_MM * PX_PER_MM_LIMITS.max), width - 16),
        ),
      );
    }
    this.cardPx.set(Math.min(this.cardMax(), Math.round(cardWidthPx(this.calibration()))));
    this.calibrating.set(true);
  }

  onCard(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (Number.isFinite(value) && value > 0) {
      this.cardPx.set(value);
    }
  }

  /** Retient la largeur ajustée ; une valeur hors bornes est ignorée (étalonnage inchangé). */
  validateCalibration(): void {
    try {
      const calibration = calibrationFromCard(this.cardPx());
      this.persisted.set(this.store.save(calibration));
      this.calibration.set(this.store.calibration);
      this.calibrating.set(false);
      this.sizeKey = '';
    } catch {
      // Largeur hors bornes : le curseur ne le permet pas ; rien à faire.
    }
  }

  resetCalibration(): void {
    this.store.reset();
    this.calibration.set(this.store.calibration);
    this.cardPx.set(Math.round(cardWidthPx(this.calibration())));
    this.calibrating.set(false);
    this.sizeKey = '';
  }

  onEyeDistance(event: Event): void {
    this.eyeChosen = true;
    this.eyeDistanceMm.set(
      clampEyeDistanceMm(Number((event.target as HTMLInputElement).value), this.eyeDistanceMm()),
    );
  }

  onDepth(event: Event): void {
    this.depthChosen = true;
    this.depthMm.set(clampDepthMm(Number((event.target as HTMLInputElement).value)));
    this.sizeKey = '';
  }

  onEscape(): void {
    if (this.calibrating()) {
      this.calibrating.set(false);
    } else {
      this.closed.emit();
    }
  }

  private scheduleFrame(): void {
    const win = this.document.defaultView;
    if (win && this.frameId === null) {
      this.frameId = win.requestAnimationFrame(this.frameCallback);
    }
  }

  private frame(time: number): void {
    this.frameId = null;
    const canvas = this.canvasRef().nativeElement;
    const widthPx = canvas.clientWidth;
    const heightPx = canvas.clientHeight;
    if (widthPx > 0 && heightPx > 0) {
      this.syncLayout(widthPx, heightPx);
      const view = this.view;
      const world = this.world;
      if (view && world) {
        const realDt = this.lastTime === null ? 0 : (time - this.lastTime) / 1000;
        fixedStepInto(this.clock.accumulator, realDt, this.clock);
        advanceInPlace(world, this.clock.steps, null);
        view.resize(widthPx, heightPx);
        view.setImmersiveCamera({
          eyeX: 0,
          eyeY: 0,
          eyeDistance: (this.eyeDistanceMm() / 1000) * this.layout!.scale,
        });
        view.updateFish(world.entities, this.clock.alpha, world.seed);
        view.renderFrame();
      }
    }
    this.lastTime = time;
    this.scheduleFrame();
  }

  /** Recrée le bac et sa vue si la taille physique de l'écran ou la profondeur ont changé. */
  private syncLayout(widthPx: number, heightPx: number): void {
    const calibration = this.calibration();
    const key = `${widthPx}x${heightPx}@${calibration.pxPerMm}`;
    if (key === this.sizeKey) {
      return;
    }
    this.sizeKey = key;
    const screen = screenSizeMm(widthPx, heightPx, calibration);
    this.screen.set(screen);
    if (!this.eyeChosen) {
      this.eyeDistanceMm.set(defaultEyeDistanceMm(screen.width, screen.height));
    }
    if (!this.depthChosen) {
      this.depthMm.set(defaultDepthMm(screen));
    }
    const layout = immersiveLayout(screen, this.depthMm());
    if (
      this.layout !== null &&
      this.view !== null &&
      sameDimensions(this.layout.dimensions, layout.dimensions)
    ) {
      this.layout = layout;
      return;
    }
    this.layout = layout;
    const world = createImmersiveWorld(IMMERSIVE_SEED, layout) as MutableWorld;
    this.view?.dispose();
    const view = new AquariumView({
      canvas: this.canvasRef().nativeElement,
      rendererFactory: this.rendererFactory,
      pixelRatio: this.document.defaultView?.devicePixelRatio ?? 1,
      preset: 'front',
      interactive: true,
      environment: placeEnvironmentData(world),
    });
    view.updateLight(lightAt(12));
    view.setDecor(world.decor, world.seed);
    this.world = world;
    this.view = view;
  }
}
