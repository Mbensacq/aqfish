import { TestBed, type ComponentFixture } from '@angular/core/testing';

import { isCaptureReady, resetCaptureReady } from '../../core/capture/capture-ready';
import type { AquariumRenderer } from '../../render/aquarium-view';
import { AQUARIUM_RENDERER_FACTORY, AquariumHost, CAMERA_ATTRIBUTE } from './aquarium-host';

/** Double du renderer WebGL (jsdom n'a pas WebGL). */
class FakeRenderer implements AquariumRenderer {
  readonly canvas: HTMLCanvasElement;
  pixelRatio = 0;
  size: [number, number] = [0, 0];
  renders = 0;
  disposed = false;
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }
  setPixelRatio(ratio: number): void {
    this.pixelRatio = ratio;
  }
  setSize(width: number, height: number): void {
    this.size = [width, height];
  }
  render(): void {
    this.renders++;
  }
  dispose(): void {
    this.disposed = true;
  }
}

/** File d'attente manuelle pour `requestAnimationFrame`. */
class FrameQueue {
  private nextId = 1;
  readonly pending = new Map<number, FrameRequestCallback>();
  request = (callback: FrameRequestCallback): number => {
    const id = this.nextId++;
    this.pending.set(id, callback);
    return id;
  };
  cancel = (id: number): void => {
    this.pending.delete(id);
  };
  /** Exécute les rappels en attente (une « image »). */
  flush(): void {
    const callbacks = [...this.pending.values()];
    this.pending.clear();
    callbacks.forEach((cb) => cb(0));
  }
}

describe('AquariumHost', () => {
  let renderers: FakeRenderer[];
  let frames: FrameQueue;
  let fixture: ComponentFixture<AquariumHost>;

  function setCanvasSize(width: number, height: number): void {
    const canvas = fixture.nativeElement.querySelector('canvas') as HTMLCanvasElement;
    Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: width });
    Object.defineProperty(canvas, 'clientHeight', { configurable: true, value: height });
  }

  function setSearch(search: string): void {
    window.history.replaceState(null, '', `/${search}`);
  }

  async function create(search = ''): Promise<void> {
    setSearch(search);
    fixture = TestBed.createComponent(AquariumHost);
    await fixture.whenStable();
  }

  beforeEach(() => {
    resetCaptureReady();
    renderers = [];
    frames = new FrameQueue();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(frames.request);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(frames.cancel);
    TestBed.configureTestingModule({
      imports: [AquariumHost],
      providers: [
        {
          provide: AQUARIUM_RENDERER_FACTORY,
          useValue: (canvas: HTMLCanvasElement) => {
            const renderer = new FakeRenderer(canvas);
            renderers.push(renderer);
            return renderer;
          },
        },
      ],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetCaptureReady();
    setSearch('');
  });

  it('crée un renderer sur son canvas', async () => {
    await create();
    expect(renderers).toHaveLength(1);
    expect(renderers[0].canvas).toBe(fixture.nativeElement.querySelector('canvas'));
  });

  it("n'est pas prêt tant qu'aucune image n'a été rendue (taille nulle)", async () => {
    await create();
    setCanvasSize(0, 0);
    frames.flush();
    frames.flush();
    expect(renderers[0].renders).toBe(0);
    expect(isCaptureReady()).toBe(false);
    expect(frames.pending.size).toBe(1); // réessaie à l'image suivante
  });

  it('signale « prêt » après la première image complète, pas avant', async () => {
    await create();
    expect(isCaptureReady()).toBe(false);
    setCanvasSize(800, 600);
    frames.flush();
    expect(renderers[0].renders).toBe(1);
    expect(renderers[0].size).toEqual([800, 600]);
    expect(isCaptureReady()).toBe(false);
    frames.flush();
    expect(isCaptureReady()).toBe(true);
  });

  it('boucle en continu hors mode capture et suit le redimensionnement', async () => {
    await create();
    setCanvasSize(800, 600);
    frames.flush();
    frames.flush();
    setCanvasSize(400, 300);
    frames.flush();
    expect(renderers[0].renders).toBe(3);
    expect(renderers[0].size).toEqual([400, 300]);
  });

  it('expose la position de la caméra', async () => {
    await create();
    setCanvasSize(800, 600);
    frames.flush();
    const value = (fixture.nativeElement as HTMLElement).getAttribute(CAMERA_ATTRIBUTE);
    expect(value).toMatch(/^-?\d+\.\d{3},-?\d+\.\d{3},-?\d+\.\d{3}$/);
  });

  it('en mode capture : pixel ratio 1, image figée, nouveau rendu au redimensionnement', async () => {
    vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(2);
    await create('?capture=1&camera=top');
    expect(renderers[0].pixelRatio).toBe(1);
    setCanvasSize(800, 600);
    frames.flush();
    frames.flush();
    frames.flush();
    expect(renderers[0].renders).toBe(1);
    expect(isCaptureReady()).toBe(true);

    setCanvasSize(640, 480);
    window.dispatchEvent(new Event('resize'));
    frames.flush();
    expect(renderers[0].renders).toBe(2);
    expect(renderers[0].size).toEqual([640, 480]);
  });

  it('caméra « top » au-dessus du bac en mode capture', async () => {
    await create('?capture=1&camera=top');
    setCanvasSize(800, 600);
    frames.flush();
    const [, y] = (fixture.nativeElement as HTMLElement)
      .getAttribute(CAMERA_ATTRIBUTE)!
      .split(',')
      .map(Number);
    expect(y).toBeGreaterThan(0.6);
  });

  it('utilise le devicePixelRatio de la fenêtre hors mode capture', async () => {
    vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(2);
    await create();
    expect(renderers[0].pixelRatio).toBe(2);
  });

  it('libère tout à la destruction : boucle annulée, renderer libéré, signal retiré', async () => {
    await create();
    setCanvasSize(800, 600);
    frames.flush();
    frames.flush();
    expect(isCaptureReady()).toBe(true);
    expect(frames.pending.size).toBe(1);

    fixture.destroy();

    expect(frames.pending.size).toBe(0);
    expect(renderers[0].disposed).toBe(true);
    expect(isCaptureReady()).toBe(false);
    window.dispatchEvent(new Event('resize'));
    expect(frames.pending.size).toBe(0);
  });
});
