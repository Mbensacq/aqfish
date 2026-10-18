import { TestBed, type ComponentFixture } from '@angular/core/testing';

import { isCaptureReady, resetCaptureReady } from '../../core/capture/capture-ready';
import type { AquariumRenderer } from '../../render/aquarium-view';
import { MAX_STEPS_PER_FRAME } from '../../sim/constants';
import { NEON } from '../../sim/species';
import { createDefaultWorld } from '../../sim/world';
import {
  AQUARIUM_RENDERER_FACTORY,
  AquariumHost,
  CAMERA_ATTRIBUTE,
  CAMERA_TARGET_ATTRIBUTE,
  SEED_ATTRIBUTE,
  TICK_ATTRIBUTE,
} from './aquarium-host';

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
  /** Cible courante : la scène va dans la cible basse résolution, l'image à l'écran (`null`). */
  target: unknown = null;
  setRenderTarget(target: unknown): void {
    this.target = target;
  }
  /** Ne compte que les images affichées (rendu à l'écran, après la passe palette). */
  render(): void {
    if (this.target === null) {
      this.renders++;
    }
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
  /** Exécute les rappels en attente (une « image ») avec l'horodatage donné, en ms. */
  flush(timestamp = 0): void {
    const callbacks = [...this.pending.values()];
    this.pending.clear();
    callbacks.forEach((cb) => cb(timestamp));
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

  it('expose la cible de la caméra (centre du bac sur un préréglage)', async () => {
    await create('?camera=front');
    setCanvasSize(800, 600);
    frames.flush();
    const target = (fixture.nativeElement as HTMLElement).getAttribute(CAMERA_TARGET_ATTRIBUTE);
    const [x, y, z] = target!.split(',').map(Number);
    expect(x).toBeCloseTo(0, 3);
    expect(y).toBeGreaterThan(0);
    expect(z).toBeCloseTo(0, 3);
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

  describe('préréglages (goToPreset)', () => {
    const camera = () =>
      (fixture.nativeElement as HTMLElement).getAttribute(CAMERA_ATTRIBUTE)!.split(',').map(Number);

    it('transition courte vers le préréglage, avancée par les images', async () => {
      await create('?camera=front');
      setCanvasSize(800, 600);
      frames.flush(0);
      const start = camera();
      (fixture.componentInstance as AquariumHost).goToPreset('top');
      // Le départ ne bouge pas la caméra ; la transition avance image par image.
      expect(camera()).toEqual(start);
      frames.flush(200);
      const mid = camera();
      expect(mid).not.toEqual(start);
      expect(mid[1]).toBeLessThan(1.5);
      frames.flush(1000); // au-delà de la durée : arrivée
      const end = camera();
      expect(end[0]).toBeCloseTo(0, 3);
      expect(end[1]).toBeGreaterThan(mid[1]);
      // Arrivé : plus de mouvement aux images suivantes.
      frames.flush(1500);
      expect(camera()).toEqual(end);
    });

    it('en mode capture : placement instantané, nouvelle image rendue', async () => {
      await create('?capture=1&camera=front');
      setCanvasSize(800, 600);
      frames.flush();
      frames.flush();
      const renders = renderers[0].renders;
      (fixture.componentInstance as AquariumHost).goToPreset('top');
      expect(camera()[1]).toBeGreaterThan(0.6);
      expect(camera()[0]).toBeCloseTo(0, 3);
      frames.flush();
      expect(renderers[0].renders).toBe(renders + 1);
    });

    it('préréglage actif : celui de l’URL, puis celui choisi, null après un geste (#23)', async () => {
      await create('?camera=front');
      setCanvasSize(800, 600);
      frames.flush(0);
      const host = fixture.componentInstance as AquariumHost;
      expect(host.activePreset()).toBe('front');
      host.goToPreset('side');
      // Actif dès le choix, pendant la transition.
      expect(host.activePreset()).toBe('side');
      frames.flush(1000);
      expect(host.activePreset()).toBe('side');
      // OrbitControls émet « start » au début d'un geste (molette ici).
      const canvas = fixture.nativeElement.querySelector('canvas') as HTMLCanvasElement;
      canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, cancelable: true }));
      expect(host.activePreset()).toBeNull();
      // Les images suivantes ne le rétablissent pas ; un nouveau choix, si.
      frames.flush(1100);
      expect(host.activePreset()).toBeNull();
      host.goToPreset('top');
      expect(host.activePreset()).toBe('top');
    });

    it('plus d’effet des gestes après la destruction (#23)', async () => {
      await create('?camera=front');
      const host = fixture.componentInstance as AquariumHost;
      const canvas = fixture.nativeElement.querySelector('canvas') as HTMLCanvasElement;
      fixture.destroy();
      canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, cancelable: true }));
      expect(host.activePreset()).toBe('front');
    });

    it('sans effet avant le démarrage ou après la destruction', async () => {
      await create();
      fixture.destroy();
      expect(() => (fixture.componentInstance as AquariumHost).goToPreset('top')).not.toThrow();
      expect(frames.pending.size).toBe(0);
    });
  });

  it('utilise le devicePixelRatio de la fenêtre hors mode capture', async () => {
    vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(2);
    await create();
    expect(renderers[0].pixelRatio).toBe(2);
  });

  describe('simulation', () => {
    function host(): AquariumHost {
      return fixture.componentInstance;
    }

    it('crée le monde par défaut (néons compris) avec la graine de l’URL', async () => {
      await create('?seed=7');
      expect(host().world).toEqual(createDefaultWorld(7));
      expect(host().world?.entities.length).toBe(NEON.defaultPopulation);
    });

    it('en mode capture : avance jusqu’à time par pas fixes avant le premier rendu', async () => {
      await create('?capture=1&seed=42&time=30');
      // Monde avancé avant toute image : 30 s ⇒ round(30 / (1/60)) = 1800 pas.
      expect(renderers[0].renders).toBe(0);
      expect(host().world?.tick).toBe(1800);
      expect(host().world?.seed).toBe(42);
    });

    it('en mode capture : le monde reste figé quel que soit le temps réel', async () => {
      await create('?capture=1&time=1');
      setCanvasSize(800, 600);
      frames.flush(0);
      frames.flush(5000);
      window.dispatchEvent(new Event('resize'));
      frames.flush(10000);
      expect(host().world?.tick).toBe(60);
      expect(isCaptureReady()).toBe(true);
    });

    it('hors capture : ignore time et avance en temps réel par pas fixes', async () => {
      await create('?time=30');
      setCanvasSize(800, 600);
      expect(host().world?.tick).toBe(0);
      frames.flush(1000); // première image : référence, aucun pas
      expect(host().world?.tick).toBe(0);
      for (let i = 1; i <= 60; i++) {
        frames.flush(1000 + (i * 1000) / 60);
      }
      expect(host().world?.tick).toBe(60);
      expect(host().interpolationAlpha).toBeGreaterThanOrEqual(0);
      expect(host().interpolationAlpha).toBeLessThan(1);
    });

    it('hors capture : plafonne les pas après une longue pause (onglet masqué)', async () => {
      await create();
      setCanvasSize(800, 600);
      frames.flush(0);
      frames.flush(60_000);
      expect(host().world?.tick).toBe(MAX_STEPS_PER_FRAME);
    });

    it('expose la graine et le tick dans le DOM (data-aqfish-seed, data-aqfish-tick)', async () => {
      await create('?capture=1&seed=42&time=30');
      const el = fixture.nativeElement as HTMLElement;
      expect(el.getAttribute(SEED_ATTRIBUTE)).toBe('42');
      expect(el.getAttribute(TICK_ATTRIBUTE)).toBe('1800');
    });

    it('hors capture : le tick exposé suit le monde', async () => {
      await create('?seed=5');
      const el = fixture.nativeElement as HTMLElement;
      setCanvasSize(800, 600);
      expect(el.getAttribute(TICK_ATTRIBUTE)).toBe('0');
      frames.flush(0);
      for (let i = 1; i <= 30; i++) {
        frames.flush((i * 1000) / 60);
      }
      expect(el.getAttribute(TICK_ATTRIBUTE)).toBe(String(host().world?.tick));
      expect(host().world?.tick).toBe(30);
    });

    it('hors capture : avance le monde en place et réutilise le même rappel rAF', async () => {
      const raf = vi.mocked(window.requestAnimationFrame);
      await create();
      setCanvasSize(800, 600);
      frames.flush(0);
      const world = host().world;
      const entities = world?.entities;
      raf.mockClear();
      for (let i = 1; i <= 10; i++) {
        frames.flush((i * 1000) / 60);
      }
      // Même objet monde (aucune copie par image), tick avancé.
      expect(host().world).toBe(world);
      expect(host().world?.entities).toBe(entities);
      expect(world?.tick).toBe(10);
      // Une demande d'image par image, toujours avec le même rappel (créé une seule fois).
      expect(raf).toHaveBeenCalledTimes(10);
      expect(new Set(raf.mock.calls.map(([cb]) => cb)).size).toBe(1);
    });

    it('libère le monde à la destruction', async () => {
      await create();
      fixture.destroy();
      expect(host().world).toBeNull();
    });
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
