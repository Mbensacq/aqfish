import { CAPTURE_READY_ATTRIBUTE, resetCaptureReady } from '../../core/capture/capture-ready';
import type { AquariumView } from '../../render/aquarium-view';
import { SIM_DT } from '../../sim/constants';
import { createDayClock, DEFAULT_DAY_CLOCK, type DayClock } from '../../sim/daylight';
import { createWorld } from '../../sim/world';
import type { MutableWorld } from '../../sim/world-types';
import type { AquariumProbe } from './aquarium-probe';
import {
  FramePainter,
  LIGHT_HOUR_STEP,
  WALLPAPER_CAMERA_EXPOSE_SECONDS,
  WALLPAPER_PRESET,
} from './frame-painter';
import type { RenderLoop } from './render-loop';

/** Double de la vue : compte ce que le peintre lui demande. */
class FakeView {
  other = 0;
  rendered = true;
  resized = false;
  lights = 0;
  fish = 0;
  lastAlpha = -1;
  readonly orbits: string[] = [];
  readonly lightRaysStrength = 0;
  readonly lightRaysTime = 0;
  resize(): boolean {
    return this.resized;
  }
  renderFrame(): boolean {
    return this.rendered;
  }
  stepCameraTransition(): boolean {
    return false;
  }
  stepOvercastFade(): void {
    this.other++;
  }
  updateFish(_entities: unknown, alpha: number): void {
    this.fish++;
    this.lastAlpha = alpha;
  }
  updateGround(): void {
    this.other++;
  }
  updateDecor(): void {
    this.other++;
  }
  updateLight(): void {
    this.lights++;
  }
  updateFlowers(): void {
    this.other++;
  }
  updateLightRays(): void {
    this.other++;
  }
  applyOrbit(preset: string): void {
    this.orbits.push(preset);
  }
}

/** Double de la boucle : temps réel et pas simulés fixés par le test. */
class FakeLoop {
  alpha = 0.5;
  realDt = 0;
  readonly clock = { steps: 0 };
  scheduled = 0;
  throttle = false;
  schedule(): void {
    this.scheduled++;
  }
  throttled(): boolean {
    return this.throttle;
  }
  advance(): number {
    return this.realDt;
  }
}

/** Double de la sonde : compte les publications. */
class FakeProbe {
  other = 0;
  cameras = 0;
  ticks = 0;
  readonly hours: number[] = [];
  publishCamera(): void {
    this.cameras++;
  }
  publishTick(): void {
    this.ticks++;
  }
  publishFood(): void {
    this.other++;
  }
  publishLightRays(): void {
    this.other++;
  }
  publishLamp(): void {
    this.other++;
  }
  publishHour(hour: number): void {
    this.hours.push(hour);
  }
}

describe('FramePainter (#696)', () => {
  let view: FakeView;
  let loop: FakeLoop;
  let probe: FakeProbe;
  let world: MutableWorld | null;
  let shownView: FakeView | null;
  let capture: boolean;
  let wallpaper: boolean;
  let clock: DayClock;
  let waterDue: boolean;
  let advanced: number[];
  let waterReads: number;
  let rafCallbacks: FrameRequestCallback[];
  let painter: FramePainter;

  beforeEach(() => {
    view = new FakeView();
    shownView = view;
    loop = new FakeLoop();
    probe = new FakeProbe();
    world = createWorld(7, [{ species: 'neon', count: 2 }], [], [], 'tropical') as MutableWorld;
    capture = false;
    wallpaper = false;
    clock = DEFAULT_DAY_CLOCK;
    waterDue = true;
    advanced = [];
    waterReads = 0;
    rafCallbacks = [];
    resetCaptureReady(document);
    // Le document réel porte l'attribut ; seule la fenêtre (rAF) est doublée.
    const doc = {
      body: document.body,
      defaultView: { requestAnimationFrame: (cb: FrameRequestCallback) => rafCallbacks.push(cb) },
    } as unknown as Document;
    painter = new FramePainter({
      document: doc,
      loop: loop as unknown as RenderLoop,
      probe: probe as unknown as AquariumProbe,
      view: () => shownView as unknown as AquariumView | null,
      world: () => world,
      canvas: () => ({ clientWidth: 320, clientHeight: 240 }) as HTMLCanvasElement,
      isCapture: () => capture,
      isWallpaper: () => wallpaper,
      wallpaperFps: () => 10,
      speed: () => 1,
      dayClock: () => clock,
      reducedMotion: () => false,
      stepFreeCamera: () => false,
      stepDecorDrop: () => undefined,
      advanceAndRecord: (_world, steps) => advanced.push(steps),
      waterReadDue: () => waterDue,
      readWater: () => waterReads++,
    });
  });

  afterEach(() => resetCaptureReady(document));

  it('sans vue, ne fait rien et ne redemande aucune image', () => {
    shownView = null;
    painter.frame(16);
    expect(loop.scheduled).toBe(0);
    expect(painter.readySignaled).toBe(false);
  });

  it('lève le signal de capture une image après la première image rendue', () => {
    painter.frame(16);
    expect(painter.readySignaled).toBe(true);
    expect(document.body.getAttribute(CAPTURE_READY_ATTRIBUTE)).toBeNull();
    expect(rafCallbacks).toHaveLength(1);
    rafCallbacks[0](32);
    expect(document.body.getAttribute(CAPTURE_READY_ATTRIBUTE)).toBe('true');
    expect(loop.scheduled).toBe(1);
  });

  it("ne lève pas le signal si la vue a été libérée avant l'image suivante", () => {
    painter.frame(16);
    shownView = null;
    rafCallbacks[0](32);
    expect(document.body.getAttribute(CAPTURE_READY_ATTRIBUTE)).toBeNull();
  });

  it('en capture, rend une seule image figée (alpha = 1) sans avancer le monde', () => {
    capture = true;
    loop.clock.steps = 3;
    painter.frame(16);
    expect(loop.scheduled).toBe(0);
    expect(view.lastAlpha).toBe(1);
    expect(advanced).toEqual([]);
  });

  it("en capture, réessaie à l'image suivante tant que rien n'a été rendu", () => {
    capture = true;
    view.rendered = false;
    painter.frame(16);
    expect(loop.scheduled).toBe(1);
    expect(painter.readySignaled).toBe(false);
  });

  it('expose la caméra au redimensionnement', () => {
    view.resized = true;
    painter.frame(16);
    expect(probe.cameras).toBe(1);
  });

  it('avance le monde des pas de la boucle et relève l’eau quand c’est dû', () => {
    loop.clock.steps = 2;
    painter.frame(1000);
    expect(advanced).toEqual([2]);
    expect(probe.ticks).toBe(1);
    expect(waterReads).toBe(1);
    // Relevé suivant trop proche (moins de 250 ms) : pas de nouveau relevé.
    painter.frame(1100);
    expect(waterReads).toBe(1);
    painter.frame(1300);
    expect(waterReads).toBe(2);
    waterDue = false;
    painter.frame(2000);
    expect(waterReads).toBe(2);
  });

  it("sans pas simulé, n'avance pas le monde", () => {
    loop.clock.steps = 0;
    painter.frame(1000);
    expect(advanced).toEqual([]);
    expect(waterReads).toBe(0);
  });

  it("recalcule l'éclairage seulement si l'heure bouge assez, ou après relight()", () => {
    clock = createDayClock(10, 1200, true);
    painter.frame(16);
    painter.frame(32);
    expect(view.lights).toBe(1);
    expect(painter.clockHour()).toBe(10);
    expect(painter.dayPhase()).toBe('jour');
    painter.relight();
    painter.frame(48);
    expect(view.lights).toBe(2);
    // Heure exposée à chaque image, même sans recalcul.
    expect(probe.hours).toEqual([10, 10, 10]);
  });

  it("suit l'heure qui avance au-delà de LIGHT_HOUR_STEP", () => {
    const hourPerSecond = 24 / clock.dayLengthSeconds;
    world!.time = (LIGHT_HOUR_STEP / hourPerSecond) * 0.4;
    loop.alpha = 1;
    painter.frame(16);
    painter.frame(32);
    expect(view.lights).toBe(1);
    world!.time = (LIGHT_HOUR_STEP / hourPerSecond) * 1.6;
    painter.frame(48);
    expect(view.lights).toBe(2);
  });

  it('renderTime : 0 sans monde, temps interpolé hors capture, exact en capture', () => {
    world!.time = 1;
    loop.alpha = 0.25;
    expect(painter.renderTime()).toBeCloseTo(1 - 0.75 * SIM_DT, 12);
    capture = true;
    expect(painter.renderTime()).toBe(1);
    world!.time = 0;
    capture = false;
    expect(painter.renderTime()).toBe(0);
    world = null;
    expect(painter.renderTime()).toBe(0);
  });

  it('fond d’écran : caméra automatique, exposée au plus une fois par seconde', () => {
    wallpaper = true;
    loop.realDt = 0.2;
    painter.frame(16);
    expect(view.orbits).toEqual([WALLPAPER_PRESET]);
    expect(probe.cameras).toBe(1);
    const framesPerExpose = Math.ceil(WALLPAPER_CAMERA_EXPOSE_SECONDS / 0.2);
    for (let n = 1; n < framesPerExpose; n++) {
      painter.frame(16 + n * 200);
    }
    expect(probe.cameras).toBe(1);
    painter.frame(16 + framesPerExpose * 200);
    expect(probe.cameras).toBe(2);
  });

  it('fond d’écran : après la première image, la cadence limitée saute les images en trop', () => {
    wallpaper = true;
    loop.throttle = true;
    painter.frame(16);
    expect(view.fish).toBe(1);
    painter.frame(20);
    expect(view.fish).toBe(1);
    expect(loop.scheduled).toBe(2);
  });

  it('fond d’écran en capture : ni cadence limitée ni caméra automatique', () => {
    wallpaper = true;
    capture = true;
    loop.throttle = true;
    painter.frame(16);
    painter.frame(20);
    expect(view.fish).toBe(2);
    expect(view.orbits).toEqual([]);
  });
});
