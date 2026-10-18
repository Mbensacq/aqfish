import { TestBed } from '@angular/core/testing';

import { App } from './app';
import { isCaptureReady, resetCaptureReady } from './core/capture/capture-ready';
import type { AquariumRenderer } from './render/aquarium-view';
import { AQUARIUM_RENDERER_FACTORY } from './ui/aquarium-host/aquarium-host';

/** jsdom n'a pas WebGL : renderer factice (docs/PIEGES.md). */
const fakeRendererFactory = (): AquariumRenderer => ({
  setPixelRatio: () => undefined,
  setSize: () => undefined,
  setRenderTarget: () => undefined,
  render: () => undefined,
  dispose: () => undefined,
});

describe('App', () => {
  let frames: FrameRequestCallback[];

  beforeEach(async () => {
    resetCaptureReady();
    frames = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => frames.push(cb));
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [{ provide: AQUARIUM_RENDERER_FACTORY, useValue: fakeRendererFactory }],
    }).compileComponents();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetCaptureReady();
  });

  it("crée l'application", () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('affiche le nom du projet', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('aqfish');
  });

  it("contient l'hôte du canvas 3D", async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('app-aquarium-host canvas'),
    ).not.toBeNull();
  });

  it("ne signale « prêt » au harnais de capture qu'après la première image 3D", async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    // Le premier rendu Angular ne suffit plus : aucune image 3D n'a encore été produite.
    expect(isCaptureReady()).toBe(false);

    const canvas = (fixture.nativeElement as HTMLElement).querySelector('canvas')!;
    Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 640 });
    Object.defineProperty(canvas, 'clientHeight', { configurable: true, value: 480 });
    frames.splice(0).forEach((cb) => cb(0)); // première image rendue
    frames.splice(0).forEach((cb) => cb(0)); // image suivante : signal
    expect(isCaptureReady()).toBe(true);
  });

  it('affiche la barre des préréglages, reliée à la caméra', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const host = root.querySelector('app-aquarium-host')!;
    const canvas = host.querySelector('canvas')!;
    Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 640 });
    Object.defineProperty(canvas, 'clientHeight', { configurable: true, value: 480 });
    frames.splice(0).forEach((cb) => cb(0));
    const before = host.getAttribute('data-aqfish-camera');

    const buttons = root.querySelectorAll('app-view-presets-bar button');
    expect(buttons).toHaveLength(5);
    (root.querySelector('button[data-preset="top"]') as HTMLButtonElement).click();
    frames.splice(0).forEach((cb) => cb(10_000)); // au-delà de la transition
    const after = host.getAttribute('data-aqfish-camera');
    expect(after).not.toBe(before);
    expect(Number(after!.split(',')[1])).toBeGreaterThan(0.6);
  });

  it('masque la barre en mode capture', async () => {
    window.history.replaceState(null, '', '/?capture=1');
    try {
      const fixture = TestBed.createComponent(App);
      await fixture.whenStable();
      const root = fixture.nativeElement as HTMLElement;
      expect(root.querySelector('app-aquarium-host')).not.toBeNull();
      expect(root.querySelector('app-view-presets-bar')).toBeNull();
    } finally {
      window.history.replaceState(null, '', '/');
    }
  });
});
