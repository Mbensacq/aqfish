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
  FrameLimiter,
  WakeLockGuard,
  enterFullscreen,
  leaveFullscreen,
  orientationSupport,
  requestOrientationPermission,
  type DeviceWindow,
  type FullscreenDocument,
  type FullscreenElement,
  type WakeLockNavigator,
} from '../../core/immersive/device-api';
import {
  clampEyeDistanceMm,
  defaultEyeDistanceMm,
  EYE_DISTANCE_MM,
} from '../../core/immersive/off-axis';
import {
  createParallaxState,
  parallaxStep,
  resetParallax,
  type OrientationReading,
} from '../../core/immersive/parallax';
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
import { createFixedStepState, fixedStepInto, type FixedStepState } from '../../sim/fixed-step';
import { glassPoint } from '../../sim/glass-tap';
import {
  IMMERSIVE_DEPTH_MM,
  clampDepthMm,
  createImmersiveWorld,
  defaultDepthMm,
  immersiveLayout,
  type ImmersiveLayout,
} from '../../sim/immersive-tank';
import { sameDimensions } from '../../sim/tank';
import { advanceInPlace, feedInPlace, tapGlassInWorld, type MutableWorld } from '../../sim/world';
import { AQUARIUM_RENDERER_FACTORY } from '../aquarium-host/aquarium-host';

/** Graine du bac immersif (fixe : le bac est un décor, jamais sauvegardé). */
export const IMMERSIVE_SEED = 345;

/** Images par seconde au plus en mode immersif (batterie, ADR 0087). */
export const IMMERSIVE_MAX_FPS = 30;

/** Durée d'un appui long qui affiche l'interface, en millisecondes (#346). */
export const LONG_PRESS_MS = 500;

/** Délai après lequel l'interface se cache seule, en millisecondes (#346). */
export const UI_HIDE_MS = 5000;

/**
 * Images rendues au moins avant de cacher l'interface : sur un appareil qui peine (une image
 * par seconde ou moins), elle reste le temps qu'on la voie et qu'on s'en serve.
 */
export const UI_HIDE_MIN_FRAMES = 15;

/** Déplacement au-delà duquel un appui n'est plus un toucher, en pixels CSS. */
export const TAP_SLOP_PX = 10;

/** Part haute de l'écran où un toucher fait tomber de la nourriture (#346). */
export const FEED_BAND = 0.2;

/** Écart sous lequel la caméra n'est pas réappliquée, en mm d'œil (#355). */
const EYE_EPSILON_MM = 0.05;

/** État de la parallaxe affiché sur l'hôte : `off` sans capteur, `denied` si refusée. */
export type ParallaxStatus = 'off' | 'waiting' | 'on' | 'denied';

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
 * Mode immersif, lots 1 et 2 (#345, #346, ADR 0086 et 0087) : plein cadre au-dessus de l'application, un bac aux
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
    '[attr.data-immersive-parallax]': 'parallax()',
    '[attr.data-immersive-ui]': "uiVisible() ? 'visible' : 'hidden'",
    '[class.immersive--ui-hidden]': '!uiVisible()',
    '(document:keydown)': 'onKey($event)',
    '(document:visibilitychange)': 'onVisibilityChange()',
    '(pointerdown)': 'onPointerDown($event)',
  },
  template: `
    <canvas
      #canvas
      class="immersive__canvas"
      aria-hidden="true"
      (pointerdown)="onPressStart($event)"
      (pointermove)="onPressMove($event)"
      (pointerup)="onPressEnd($event)"
      (pointercancel)="cancelPress()"
      (contextmenu)="$event.preventDefault()"
    ></canvas>
    <div class="immersive__bar" (focusin)="showUi()" (pointerdown)="showUi()">
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
          <button type="button" class="immersive__button" (click)="closeCalibration()">
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
  private readonly hostRef = inject<ElementRef<HTMLElement>>(ElementRef);
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
  /** Parallaxe : capteur absent, en attente de lecture, active ou refusée. */
  readonly parallax = signal<ParallaxStatus>('off');
  /** Interface (barre) affichée : à l'entrée et après un appui long, cachée seule ensuite. */
  readonly uiVisible = signal(true);
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
  private readonly clock: FixedStepState = createFixedStepState();
  private readonly frameCallback = (time: number) => this.frame(time);
  private sizeKey = '';
  private screenMm: ScreenSizeMm | null = null;
  private readonly limiter = new FrameLimiter(IMMERSIVE_MAX_FPS);
  private readonly wakeLock = new WakeLockGuard(
    this.document.defaultView?.navigator as WakeLockNavigator | undefined,
  );
  private readonly parallaxState = createParallaxState();
  /** Dernière lecture d'orientation (objet réutilisé) ; `hasReading` faux avant la première. */
  private readonly reading: OrientationReading = { beta: 0, gamma: 0 };
  private hasReading = false;
  private orientationListening = false;
  private gestureHandled = false;
  /** Caméra appliquée en dernier (mm d'œil, échelle), pour ne pas la réappliquer (#355). */
  private readonly applied = { eyeX: NaN, eyeY: NaN, eyeDistance: NaN, view: null as unknown };
  private readonly camera = { eyeX: 0, eyeY: 0, eyeDistance: 1 };
  private eyeText = '';
  /** Nombre d'applications de la caméra immersive, lu par `cameraApplications` (#355). */
  private cameraApplied = 0;
  private readonly orientationHandler = (event: Event) => this.onOrientation(event);
  /** Appui en cours sur la vitre : pointeur, point de départ, appui long déjà traité. */
  private press: { id: number; x: number; y: number; long: boolean } | null = null;
  private pressTimer: ReturnType<typeof setTimeout> | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  /** Granulés affichés en dernier, exposés aux tests de bout en bout s'ils changent. */
  private foodShown = -1;
  /** Images rendues depuis que l'interface a été affichée ; délai de masquage écoulé. */
  private framesShown = 0;
  private hideDue = false;

  constructor() {
    afterNextRender(() => {
      this.scheduleFrame();
      this.scheduleHide();
      void this.wakeLock.acquire();
      // Orientation sans autorisation à demander : écoutée tout de suite ; sinon (Safari,
      // Chromium récent), l'autorisation est demandée au premier toucher (ADR 0087).
      if (orientationSupport(this.deviceWindow) === 'available') {
        this.listenOrientation();
      }
    });
    inject(DestroyRef).onDestroy(() => {
      const win = this.document.defaultView;
      if (this.frameId !== null && win) {
        win.cancelAnimationFrame(this.frameId);
      }
      this.frameId = null;
      this.clearPressTimer();
      this.clearHideTimer();
      if (this.orientationListening) {
        win?.removeEventListener('deviceorientation', this.orientationHandler);
        this.orientationListening = false;
      }
      void this.wakeLock.release();
      void leaveFullscreen(this.document as FullscreenDocument);
      this.view?.dispose();
      this.view = null;
      this.world = null;
    });
  }

  private get deviceWindow(): DeviceWindow | null {
    return this.document.defaultView as DeviceWindow | null;
  }

  /** Nombre d'applications de la caméra immersive (tests, #355), en lecture seule (#357). */
  get cameraApplications(): number {
    return this.cameraApplied;
  }

  /** Décalage courant de l'œil, en mm (tests). */
  get eyeOffsetMm(): { readonly x: number; readonly y: number } {
    return { x: this.parallaxState.eyeX, y: this.parallaxState.eyeY };
  }

  /**
   * Premier toucher : autorisation d'orientation si le navigateur l'exige, plein écran si le
   * toucher est tactile (ADR 0087). Les deux demandes exigent un geste de l'utilisateur. Une
   * seule demande d'autorisation par ouverture du mode : un refus n'est pas redemandé aux
   * touchers suivants, mais à la prochaine ouverture (ADR 0087, #357).
   */
  onPointerDown(event: PointerEvent): void {
    if (this.gestureHandled) {
      return;
    }
    this.gestureHandled = true;
    if (event.pointerType === 'touch') {
      void enterFullscreen(this.hostRef.nativeElement as FullscreenElement);
    }
    if (orientationSupport(this.deviceWindow) === 'needs-permission') {
      this.parallax.set('waiting');
      void requestOrientationPermission(this.deviceWindow).then((granted) => {
        if (granted) {
          this.listenOrientation();
        } else {
          this.parallax.set('denied');
        }
      });
    }
    void this.wakeLock.acquire();
  }

  /** Page masquée : boucle arrêtée, verrou d'éveil relâché ; visible : reprise sans rattrapage. */
  onVisibilityChange(): void {
    const win = this.document.defaultView;
    if (this.document.visibilityState === 'hidden') {
      if (this.frameId !== null && win) {
        win.cancelAnimationFrame(this.frameId);
      }
      this.frameId = null;
      void this.wakeLock.release();
      return;
    }
    this.lastTime = null;
    this.limiter.reset();
    this.scheduleFrame();
    void this.wakeLock.acquire();
  }

  private listenOrientation(): void {
    const win = this.document.defaultView;
    if (!win || this.orientationListening) {
      return;
    }
    win.addEventListener('deviceorientation', this.orientationHandler);
    this.orientationListening = true;
    this.parallax.set('waiting');
  }

  private onOrientation(event: Event): void {
    const { beta, gamma } = event as DeviceOrientationEvent;
    // Ordinateur sans capteur : Chromium envoie des valeurs nulles ; ignorées (repli).
    if (typeof beta !== 'number' || typeof gamma !== 'number') {
      return;
    }
    if (!Number.isFinite(beta) || !Number.isFinite(gamma)) {
      return;
    }
    this.reading.beta = beta;
    this.reading.gamma = gamma;
    if (!this.hasReading) {
      this.hasReading = true;
      this.parallax.set('on');
    }
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
      this.closeCalibration();
      this.sizeKey = '';
    } catch {
      // Largeur hors bornes : le curseur ne le permet pas ; rien à faire.
    }
  }

  resetCalibration(): void {
    this.store.reset();
    this.calibration.set(this.store.calibration);
    this.cardPx.set(Math.round(cardWidthPx(this.calibration())));
    this.closeCalibration();
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
      this.closeCalibration();
    } else {
      this.closed.emit();
    }
  }

  /** Échap : sortie (ou fin de l'étalonnage) ; toute autre touche affiche l'interface. */
  onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.onEscape();
    } else {
      this.showUi();
    }
  }

  closeCalibration(): void {
    this.calibrating.set(false);
    this.scheduleHide();
  }

  /** Affiche l'interface et relance le délai après lequel elle se cache. */
  showUi(): void {
    this.uiVisible.set(true);
    this.scheduleHide();
  }

  /**
   * Cache l'interface après `UI_HIDE_MS` et au moins `UI_HIDE_MIN_FRAMES` images rendues,
   * sauf pendant les réglages ou l'étalonnage (le délai repart quand ils se ferment).
   */
  private scheduleHide(): void {
    this.clearHideTimer();
    this.framesShown = 0;
    this.hideDue = false;
    this.hideTimer = setTimeout(() => {
      this.hideTimer = null;
      this.hideDue = true;
      this.hideIfDue();
    }, UI_HIDE_MS);
  }

  private hideIfDue(): void {
    if (!this.hideDue || this.framesShown < UI_HIDE_MIN_FRAMES) {
      return;
    }
    this.hideDue = false;
    if (!this.settingsOpen() && !this.calibrating()) {
      this.uiVisible.set(false);
    }
  }

  private clearHideTimer(): void {
    if (this.hideTimer !== null) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }

  private clearPressTimer(): void {
    if (this.pressTimer !== null) {
      clearTimeout(this.pressTimer);
      this.pressTimer = null;
    }
  }

  /** Début d'un appui sur la vitre : un appui long (`LONG_PRESS_MS`) affichera l'interface. */
  onPressStart(event: PointerEvent): void {
    if (event.isPrimary === false) {
      // Second doigt : ni toucher, ni appui long.
      this.cancelPress();
      return;
    }
    this.clearPressTimer();
    const press = { id: event.pointerId, x: event.clientX, y: event.clientY, long: false };
    this.press = press;
    this.pressTimer = setTimeout(() => {
      this.pressTimer = null;
      press.long = true;
      this.showUi();
    }, LONG_PRESS_MS);
  }

  /** Un appui qui glisse au-delà de `TAP_SLOP_PX` n'est ni un toucher ni un appui long. */
  onPressMove(event: PointerEvent): void {
    const press = this.press;
    if (press && press.id === event.pointerId && moved(press, event)) {
      this.cancelPress();
    }
  }

  /** Fin d'un appui bref et immobile : nourriture en haut de l'écran, tapotement ailleurs. */
  onPressEnd(event: PointerEvent): void {
    const press = this.press;
    this.clearPressTimer();
    this.press = null;
    if (!press || press.id !== event.pointerId || press.long || moved(press, event)) {
      return;
    }
    this.touchGlass(event.clientX, event.clientY);
  }

  cancelPress(): void {
    this.clearPressTimer();
    this.press = null;
  }

  /**
   * Toucher de la vitre au point (`clientX`, `clientY`) : dans la bande haute (`FEED_BAND`),
   * des granulés tombent à l'aplomb, à mi-chemin de la vitre et du milieu du bac ; ailleurs,
   * les poissons proches réagissent (`tapGlassInWorld`). Sans effet avant le premier bac.
   */
  private touchGlass(clientX: number, clientY: number): void {
    const world = this.world;
    const layout = this.layout;
    const canvas = this.canvasRef().nativeElement;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!world || !layout || width <= 0 || height <= 0) {
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const v = (clientY - rect.top) / height;
    const point = glassPoint(layout.dimensions, (clientX - rect.left) / width, v);
    if (point === null) {
      return;
    }
    if (v < FEED_BAND) {
      feedInPlace(world, point.x, layout.dimensions.depth / 4);
    } else {
      tapGlassInWorld(world, point);
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
      if (!this.limiter.shouldRender(time)) {
        // Image sautée (limite d'images) : le temps s'accumule jusqu'à la suivante.
        this.scheduleFrame();
        return;
      }
      const view = this.view;
      const world = this.world;
      const screen = this.screenMm;
      if (view && world && screen) {
        const realDt = this.lastTime === null ? 0 : (time - this.lastTime) / 1000;
        fixedStepInto(this.clock.accumulator, realDt, this.clock);
        advanceInPlace(world, this.clock.steps, null);
        view.resize(widthPx, heightPx);
        const eyeDistanceMm = this.eyeDistanceMm();
        parallaxStep(this.parallaxState, this.hasReading ? this.reading : null, realDt, {
          eyeDistance: eyeDistanceMm,
          screenWidth: screen.width,
          screenHeight: screen.height,
          screenAngleDeg: this.screenAngle(),
        });
        this.applyCamera(view, eyeDistanceMm);
        view.updateFood(world.food);
        this.exposeFood(world.food.length);
        view.updateFish(world.entities, this.clock.alpha, world.seed);
        view.renderFrame();
        this.framesShown++;
        this.hideIfDue();
      }
    }
    this.lastTime = time;
    this.scheduleFrame();
  }

  /** Nombre de granulés exposé aux tests de bout en bout, écrit seulement s'il change. */
  private exposeFood(count: number): void {
    if (count !== this.foodShown) {
      this.foodShown = count;
      this.hostRef.nativeElement.setAttribute('data-immersive-food', String(count));
    }
  }

  /** Angle d'affichage de l'écran (0 si l'API manque). */
  private screenAngle(): number {
    try {
      return this.document.defaultView?.screen?.orientation?.angle ?? 0;
    } catch {
      return 0;
    }
  }

  /**
   * Pose la caméra immersive seulement si l'œil, la distance ou la vue ont changé (#355) :
   * à paramètres identiques, ni objet neuf, ni tronc, ni matrice.
   */
  private applyCamera(view: AquariumView, eyeDistanceMm: number): void {
    const { eyeX, eyeY } = this.parallaxState;
    const applied = this.applied;
    if (
      applied.view === view &&
      applied.eyeDistance === eyeDistanceMm &&
      Math.abs(applied.eyeX - eyeX) < EYE_EPSILON_MM &&
      Math.abs(applied.eyeY - eyeY) < EYE_EPSILON_MM
    ) {
      return;
    }
    const scale = this.layout!.scale / 1000;
    this.camera.eyeX = eyeX * scale;
    this.camera.eyeY = eyeY * scale;
    this.camera.eyeDistance = eyeDistanceMm * scale;
    if (view.setImmersiveCamera(this.camera)) {
      applied.view = view;
      applied.eyeX = eyeX;
      applied.eyeY = eyeY;
      applied.eyeDistance = eyeDistanceMm;
      this.cameraApplied++;
      const text = `${eyeX.toFixed(0)},${eyeY.toFixed(0)}`;
      if (text !== this.eyeText) {
        // Exposé pour les tests de bout en bout, écrit seulement quand il change.
        this.eyeText = text;
        this.hostRef.nativeElement.setAttribute('data-immersive-eye-mm', text);
      }
    }
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
    this.screenMm = screen;
    // Nouvelle taille ou rotation : la pose courante redevient la pose neutre.
    resetParallax(this.parallaxState);
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

/** Vrai si le pointeur s'est écarté de plus de `TAP_SLOP_PX` du point de départ. */
function moved(start: { x: number; y: number }, event: PointerEvent): boolean {
  return Math.hypot(event.clientX - start.x, event.clientY - start.y) > TAP_SLOP_PX;
}
