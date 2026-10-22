import { TestBed, type ComponentFixture } from '@angular/core/testing';

import { isCaptureReady, resetCaptureReady } from '../../core/capture/capture-ready';
import { RENDER_FILTER_STORAGE_KEY } from '../../core/render-filter/render-filter';
import { SAVE_STORAGE_KEY, type SaveStorage } from '../../core/save-storage/save-storage';
import { createDayClock } from '../../sim/daylight';
import { parseWorld, serializeWorld } from '../../sim/save';
import type { AquariumRenderer } from '../../render/aquarium-view';
import { MAX_STEPS_PER_FRAME } from '../../sim/constants';
import { AXOLOTL, CORYDORA, GRENOUILLE, GUPPY, KOI, NEON } from '../../sim/species';
import { expiryAge, FOOD_PER_DROP } from '../../sim/food';
import { setPopulation } from '../../sim/population';
import { advance, advanceToWithFeedings, createDefaultWorld } from '../../sim/world';
import {
  applyPopulation,
  AQUARIUM_RENDERER_FACTORY,
  AquariumHost,
  AUTOSAVE_INTERVAL_MS,
  SAVE_ATTRIBUTE,
  SAVE_FILE_NAME,
  SAVE_STORAGE,
  CAMERA_ATTRIBUTE,
  ENVIRONMENT_ATTRIBUTE,
  RAIN_ATTRIBUTE,
  CAMERA_TARGET_ATTRIBUTE,
  DECOR_ATTRIBUTE,
  FILTER_ATTRIBUTE,
  FOOD_STYLE_ATTRIBUTE,
  FOOD_ATTRIBUTE,
  HOUR_ATTRIBUTE,
  HOUR_FROZEN_ATTRIBUTE,
  formatPopulation,
  initialDayClock,
  POPULATION_ATTRIBUTE,
  SEED_ATTRIBUTE,
  SPEED_ATTRIBUTE,
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

/** Stockage en mémoire (sauvegarde automatique, #70), avec quota optionnel et compteurs. */
class MemoryStorage implements SaveStorage {
  readonly data = new Map<string, string>();
  reads = 0;
  writes = 0;
  constructor(private readonly quota = Number.POSITIVE_INFINITY) {}
  getItem(key: string): string | null {
    this.reads++;
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.writes++;
    if (value.length > this.quota) {
      throw new DOMException('quota', 'QuotaExceededError');
    }
    this.data.set(key, value);
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
  /** Stockage de la sauvegarde automatique (#70), neuf pour chaque test. */
  let saveStorage: SaveStorage | null;

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
    saveStorage = new MemoryStorage();
    TestBed.configureTestingModule({
      imports: [AquariumHost],
      providers: [
        { provide: SAVE_STORAGE, useFactory: () => saveStorage },
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
    window.localStorage.removeItem(RENDER_FILTER_STORAGE_KEY);
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
      expect(host().world?.entities.length).toBe(
        NEON.defaultPopulation + GUPPY.defaultPopulation + CORYDORA.defaultPopulation,
      );
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

  describe('nourriture (#67)', () => {
    function host(): AquariumHost {
      return fixture.componentInstance;
    }
    const exposedFood = () => fixture.nativeElement.getAttribute(FOOD_ATTRIBUTE);

    it('feed et feedAtCenter déposent des granulés, exposés dans data-aqfish-food', async () => {
      await create('?seed=3');
      expect(exposedFood()).toBe('0');
      host().feed(0.2, 0.1);
      expect(host().world?.food.length).toBe(FOOD_PER_DROP);
      expect(exposedFood()).toBe(String(FOOD_PER_DROP));
      host().feedAtCenter();
      expect(exposedFood()).toBe(String(2 * FOOD_PER_DROP));
      expect(host().world?.food.at(-1)?.x).toBeCloseTo(0, 1);
    });

    it('point hors du bac ou non fini : ignoré', async () => {
      await create();
      host().feed(3, 0);
      host().feed(Number.NaN, 0);
      expect(host().world?.food).toEqual([]);
      expect(exposedFood()).toBe('0');
    });

    it('le nombre exposé suit la disparition des granulés', async () => {
      await create();
      setCanvasSize(800, 600);
      host().feedAtCenter();
      frames.flush(0);
      // Granulés amenés juste avant leur disparition (sans simuler une minute image par image).
      for (const pellet of host().world!.food) {
        (pellet as { age: number }).age = expiryAge(pellet) - 0.001;
      }
      frames.flush(100);
      expect(host().world?.food).toEqual([]);
      expect(exposedFood()).toBe('0');
    });

    it('en capture : feed est sans effet ; nourrir= dépose au temps demandé', async () => {
      await create('?capture=1&seed=42&time=4&nourrir=1,2:0.1:0.1');
      const expected = advanceToWithFeedings(createDefaultWorld(42), 4, [
        { time: 1, x: 0, z: 0 },
        { time: 2, x: 0.1, z: 0.1 },
      ]);
      expect(host().world).toEqual(expected);
      expect(exposedFood()).toBe(String(2 * FOOD_PER_DROP));
      host().feed(0, 0);
      expect(host().world?.food.length).toBe(2 * FOOD_PER_DROP);
    });

    it('sans effet avant le démarrage', () => {
      const instance = TestBed.createComponent(AquariumHost).componentInstance;
      expect(() => instance.feedAtCenter()).not.toThrow();
      expect(instance.world).toBeNull();
    });
  });

  describe('heure de la journée (#51)', () => {
    const host = () => fixture.componentInstance;
    const attr = (name: string) => (fixture.nativeElement as HTMLElement).getAttribute(name);
    /** Avance de `seconds` secondes réelles, image par image à 60 Hz, depuis `from` ms. */
    function run(seconds: number, from = 0): number {
      const frames60 = Math.round(seconds * 60);
      for (let i = 1; i <= frames60; i++) {
        frames.flush(from + (i * 1000) / 60);
      }
      return from + seconds * 1000;
    }

    it('initialDayClock : heure= figée, sinon midi figé en capture, midi en marche hors capture', () => {
      expect(initialDayClock(6.5, false)).toEqual({
        startHour: 6.5,
        dayLengthSeconds: 1200,
        frozen: true,
      });
      expect(initialDayClock(null, true)).toEqual({
        startHour: 12,
        dayLengthSeconds: 1200,
        frozen: true,
      });
      expect(initialDayClock(null, false).frozen).toBe(false);
      expect(initialDayClock(null, false).startHour).toBe(12);
    });

    it('en capture, sans heure= : midi, même après time=90 (heure figée)', async () => {
      await create('?capture=1&time=90');
      setCanvasSize(800, 600);
      frames.flush(0);
      expect(host().hour).toBe(12);
      expect(attr(HOUR_ATTRIBUTE)).toBe('12.00');
      expect(attr(HOUR_FROZEN_ATTRIBUTE)).toBe('true');
    });

    it('heure= fige l’heure, hors capture comme en capture ; valeur invalide ignorée', async () => {
      await create('?heure=21.5');
      setCanvasSize(800, 600);
      frames.flush(0);
      run(3);
      expect(host().hour).toBe(21.5);
      expect(attr(HOUR_ATTRIBUTE)).toBe('21.50');
      fixture.destroy();
      await create('?capture=1&heure=abc');
      setCanvasSize(800, 600);
      frames.flush(0);
      expect(host().hour).toBe(12);
    });

    // Simulation courte (≤ 9 s simulées par test) : chaque pas fait nager tout le monde par
    // défaut, et jsdom sur la CI est lent (docs/PIEGES.md, « Test de performance »).
    it('hors capture : l’heure avance avec le monde par pas fixes (7,5 s ⇒ 12,15 h)', async () => {
      await create();
      setCanvasSize(800, 600);
      frames.flush(0);
      expect(attr(HOUR_FROZEN_ATTRIBUTE)).toBe('false');
      run(7.5);
      expect(host().world?.tick).toBe(450);
      // Journée de 1 200 s : 7,5 s = 0,15 h.
      expect(host().hour).toBeCloseTo(12.15, 2);
      expect(Number(attr(HOUR_ATTRIBUTE))).toBeCloseTo(12.15, 2);
    }, 15_000);

    it('la touche H (toggleClock) fige puis remet en marche l’heure, sans saut', async () => {
      await create();
      setCanvasSize(800, 600);
      frames.flush(0);
      let now = run(3);
      host().toggleClock();
      expect(attr(HOUR_FROZEN_ATTRIBUTE)).toBe('true');
      const frozenHour = host().hour!;
      expect(frozenHour).toBeCloseTo(12.06, 2);
      now = run(3, now);
      expect(host().hour).toBe(frozenHour);
      host().toggleClock();
      expect(attr(HOUR_FROZEN_ATTRIBUTE)).toBe('false');
      expect(host().hour).toBeCloseTo(frozenHour, 9);
      run(3, now);
      expect(host().hour).toBeCloseTo(frozenHour + 0.06, 2);
    }, 15_000);

    it('freezeClockAt (touches J et N, #75) : fige à midi ou minuit, puis H reprend sans saut', async () => {
      await create();
      setCanvasSize(800, 600);
      frames.flush(0);
      let now = run(1);
      expect(attr(HOUR_FROZEN_ATTRIBUTE)).toBe('false');
      host().freezeClockAt(0);
      expect(attr(HOUR_FROZEN_ATTRIBUTE)).toBe('true');
      now = run(1, now);
      expect(host().hour).toBe(0);
      expect(attr(HOUR_ATTRIBUTE)).toBe('0.00');
      // Déjà figée : on peut passer directement au plein jour.
      host().freezeClockAt(12);
      now = run(1, now);
      expect(host().hour).toBe(12);
      expect(attr(HOUR_ATTRIBUTE)).toBe('12.00');
      // Valeur non finie ignorée.
      host().freezeClockAt(Number.NaN);
      expect(host().hour).toBe(12);
      host().toggleClock();
      expect(attr(HOUR_FROZEN_ATTRIBUTE)).toBe('false');
      expect(host().hour).toBeCloseTo(12, 9);
      run(3, now);
      // Journée de 20 min : 3 s = 0,06 h.
      expect(host().hour).toBeCloseTo(12.06, 2);
    }, 15_000);

    it('dayPhase (indicateur, #73) suit l’heure de l’éclairage', async () => {
      await create();
      setCanvasSize(800, 600);
      expect(host().dayPhase()).toBe('jour');
      frames.flush(0);
      let now = run(1);
      expect(host().dayPhase()).toBe('jour');
      host().freezeClockAt(0);
      now = run(1, now);
      expect(host().dayPhase()).toBe('nuit');
      host().freezeClockAt(18);
      now = run(1, now);
      expect(host().dayPhase()).toBe('crepuscule');
      host().freezeClockAt(6);
      run(1, now);
      expect(host().dayPhase()).toBe('aube');
    }, 15_000);

    it('en capture, freezeClockAt est sans effet ; avant le démarrage aussi', async () => {
      await create('?capture=1&heure=3');
      setCanvasSize(800, 600);
      frames.flush(0);
      const renders = renderers[0].renders;
      host().freezeClockAt(12);
      expect(host().hour).toBe(3);
      frames.flush(1000);
      expect(renderers[0].renders).toBe(renders);
      fixture.destroy();
      host().freezeClockAt(0);
      expect(host().hour).toBeNull();
    });

    it('en capture, toggleClock est sans effet ; avant le démarrage, heure null', async () => {
      await create('?capture=1&heure=3');
      setCanvasSize(800, 600);
      frames.flush(0);
      const renders = renderers[0].renders;
      host().toggleClock();
      expect(host().hour).toBe(3);
      expect(attr(HOUR_FROZEN_ATTRIBUTE)).toBe('true');
      frames.flush(1000);
      expect(renderers[0].renders).toBe(renders);
      fixture.destroy();
      expect(host().hour).toBeNull();
      host().toggleClock();
    });
  });

  describe('environnement (#87)', () => {
    const host = () => fixture.componentInstance;
    const element = () => fixture.nativeElement as HTMLElement;
    const cameraY = () => Number(element().getAttribute(CAMERA_ATTRIBUTE)!.split(',')[1]);

    it('bac tropical par défaut, exposé dans data-aqfish-environment', async () => {
      await create('?seed=3');
      expect(host().environment()).toBe('tropical');
      expect(element().getAttribute(ENVIRONMENT_ATTRIBUTE)).toBe('tropical');
      expect(host().world).toEqual(createDefaultWorld(3));
      expect(host().activePreset()).toBe('three-quarter');
    });

    it('environnement= : monde du bassin, vu de dessus sans camera= ; inconnu ignoré', async () => {
      await create('?capture=1&seed=5&environnement=bassin');
      expect(host().world).toEqual(createDefaultWorld(5, 'bassin'));
      expect(host().activePreset()).toBe('top');
      expect(element().getAttribute(ENVIRONMENT_ATTRIBUTE)).toBe('bassin');
      fixture.destroy();
      await create('?capture=1&seed=5&environnement=bassin&camera=side');
      expect(host().activePreset()).toBe('side');
      fixture.destroy();
      await create('?capture=1&seed=5&environnement=recif');
      expect(host().world).toEqual(createDefaultWorld(5));
    });

    it('setEnvironment : nouveau monde (même graine), nouvelle vue, caméra de dessus', async () => {
      await create('?seed=9');
      setCanvasSize(800, 600);
      frames.flush(0);
      frames.flush(500);
      host().feedAtCenter();
      const tropicalY = cameraY();
      host().setDecorVisible(false);
      host().setEnvironment('bassin');
      expect(host().world).toEqual(createDefaultWorld(9, 'bassin'));
      expect(host().environment()).toBe('bassin');
      expect(element().getAttribute(ENVIRONMENT_ATTRIBUTE)).toBe('bassin');
      expect(element().getAttribute('data-aqfish-food')).toBe('0');
      expect(host().population()).toEqual({
        neon: 0,
        guppy: 0,
        corydora: 0,
        koi: KOI.defaultPopulation,
        axolotl: 0,
        grenouille: 0,
      });
      expect(element().getAttribute(POPULATION_ATTRIBUTE)).toBe(`koi:${KOI.defaultPopulation}`);
      expect(host().activePreset()).toBe('top');
      // L'ancienne vue est libérée, une nouvelle est créée ; le décor reste masqué.
      expect(renderers).toHaveLength(2);
      expect(renderers[0].disposed).toBe(true);
      expect(host().decorVisible()).toBe(false);
      frames.flush(1000);
      expect(renderers[1].renders).toBeGreaterThan(0);
      expect(cameraY()).not.toBe(tropicalY);
      // Retour au bac : même monde de départ qu'au démarrage avec cette graine.
      host().setEnvironment('tropical');
      expect(host().world).toEqual(createDefaultWorld(9));
      expect(renderers).toHaveLength(3);
    });

    it('setEnvironment : inconnu, identique, en capture ou avant le démarrage : sans effet', async () => {
      const instance = TestBed.createComponent(AquariumHost).componentInstance;
      expect(() => instance.setEnvironment('bassin')).not.toThrow();
      await create('?seed=2');
      const world = host().world;
      const created = renderers.length;
      host().setEnvironment('recif');
      host().setEnvironment('constructor');
      host().setEnvironment('tropical');
      expect(host().world).toBe(world);
      expect(renderers).toHaveLength(created);
      fixture.destroy();
      await create('?capture=1&seed=2');
      const captured = host().world;
      host().setEnvironment('bassin');
      expect(host().world).toBe(captured);
    });
  });

  describe('pluie (#106)', () => {
    const host = () => fixture.componentInstance;
    const rainAttr = () => (fixture.nativeElement as HTMLElement).getAttribute(RAIN_ATTRIBUTE);

    it('bassin : touche R et case, exposée ; jamais dans la sauvegarde ; bac : sans effet', async () => {
      await create('?seed=4');
      setCanvasSize(800, 600);
      frames.flush(0);
      expect(host().rain()).toBe(false);
      expect(rainAttr()).toBe('false');
      // Bac tropical : pas de pluie possible.
      host().toggleRain();
      host().setRain(true);
      expect(host().rain()).toBe(false);
      expect(rainAttr()).toBe('false');
      host().setEnvironment('bassin');
      const world = host().world;
      host().toggleRain();
      expect(host().rain()).toBe(true);
      expect(rainAttr()).toBe('true');
      frames.flush(500);
      // La simulation n'est pas touchée, et rien n'est sauvegardé de la pluie.
      expect(host().world).toBe(world);
      host().saveNow();
      expect(saveStorage?.getItem(SAVE_STORAGE_KEY)).not.toMatch(/pluie|rain/i);
      host().setRain(false);
      expect(rainAttr()).toBe('false');
      host().setRain(true);
      // Retour au bac : la pluie s'arrête.
      host().setEnvironment('tropical');
      expect(host().rain()).toBe(false);
      expect(rainAttr()).toBe('false');
    });

    it('pluie=1 : il pleut dès le départ dans le bassin, pas dans le bac ; capture figée', async () => {
      await create('?capture=1&seed=5&environnement=bassin&pluie=1');
      expect(host().rain()).toBe(true);
      expect(rainAttr()).toBe('true');
      host().setRain(false);
      host().toggleRain();
      expect(host().rain()).toBe(true);
      fixture.destroy();
      await create('?capture=1&seed=5&pluie=1');
      expect(host().rain()).toBe(false);
      expect(rainAttr()).toBe('false');
      fixture.destroy();
      await create('?seed=5&environnement=bassin');
      expect(host().rain()).toBe(false);
    });

    it('sans effet avant le démarrage', () => {
      const early = TestBed.createComponent(AquariumHost);
      early.componentInstance.setRain(true);
      early.componentInstance.toggleRain();
      expect(early.componentInstance.rain()).toBe(false);
      early.destroy();
    });
  });

  describe('population (#69)', () => {
    const host = () => fixture.componentInstance;
    const exposed = () => (fixture.nativeElement as HTMLElement).getAttribute(POPULATION_ATTRIBUTE);

    it('formatPopulation : espece:n, dans l’ordre des espèces', () => {
      const counts = { neon: 12, guppy: 0, corydora: 6, koi: 2, axolotl: 1, grenouille: 3 };
      expect(formatPopulation(counts)).toBe(
        'neon:12,guppy:0,corydora:6,koi:2,axolotl:1,grenouille:3',
      );
      // Espèces d'un environnement (#88) : seulement elles, dans leur ordre.
      expect(formatPopulation(counts, ['koi'])).toBe('koi:2');
    });

    it('applyPopulation : ordre de l’URL, bornes, espèce inconnue ou hors de l’environnement ignorée', () => {
      const world = createDefaultWorld(42);
      applyPopulation(world, [
        { species: 'koi', count: 3 },
        { species: 'neon', count: 999 },
        { species: 'constructor', count: 1 },
        { species: 'guppy', count: 2 },
      ]);
      expect(world).toEqual(
        setPopulation(setPopulation(createDefaultWorld(42), 'neon', 999), 'guppy', 2),
      );
    });

    it('expose les effectifs et leurs maximums au démarrage', async () => {
      await create('?seed=3');
      expect(exposed()).toBe(
        `neon:${NEON.defaultPopulation},guppy:${GUPPY.defaultPopulation},corydora:${CORYDORA.defaultPopulation}`,
      );
      expect(host().population()).toEqual({
        neon: NEON.defaultPopulation,
        guppy: GUPPY.defaultPopulation,
        corydora: CORYDORA.defaultPopulation,
        koi: 0,
        axolotl: 0,
        grenouille: 0,
      });
      expect(host().populationMax()).toEqual({
        neon: NEON.maxPopulation,
        guppy: GUPPY.maxPopulation,
        corydora: CORYDORA.maxPopulation,
        koi: KOI.maxPopulation,
        axolotl: AXOLOTL.maxPopulation,
        grenouille: GRENOUILLE.maxPopulation,
      });
    });

    it('setPopulation : ajoute et retire sans remettre la simulation à zéro', async () => {
      await create('?seed=3');
      setCanvasSize(800, 600);
      for (let i = 1; i <= 60; i++) {
        frames.flush((i * 1000) / 60);
      }
      const world = host().world!;
      const tick = world.tick;
      expect(tick).toBeGreaterThan(0);
      const before = structuredClone(world);
      host().setPopulation('neon', 15);
      host().setPopulation('corydora', 0);
      // Même objet monde (avancé en place), même temps, même décor.
      expect(host().world).toBe(world);
      expect(world.tick).toBe(tick);
      expect(world.decor).toEqual(before.decor);
      expect(world).toEqual(setPopulation(setPopulation(before, 'neon', 15), 'corydora', 0));
      expect(exposed()).toBe(`neon:15,guppy:${GUPPY.defaultPopulation},corydora:0`);
      expect(host().population().neon).toBe(15);
    }, 15_000);

    it('setPopulation : effectif invalide ou espèce inconnue ignorés', async () => {
      await create('?seed=3');
      const before = structuredClone(host().world);
      host().setPopulation('neon', 2.5);
      host().setPopulation('neon', -1);
      host().setPopulation('requin' as never, 3);
      // Le koï ne vit pas dans le bac tropical (#88).
      host().setPopulation('koi', 3);
      expect(host().world).toEqual(before);
    });

    it('population= : appliqué à t = 0, avant d’avancer (capture comme hors capture)', async () => {
      await create('?capture=1&seed=42&time=2&population=neon:3,guppy:0,corydora:1');
      let expected = setPopulation(createDefaultWorld(42), 'neon', 3);
      expected = setPopulation(setPopulation(expected, 'guppy', 0), 'corydora', 1);
      expect(host().world).toEqual(advance(expected, 120));
      expect(exposed()).toBe('neon:3,guppy:0,corydora:1');
    });

    it('en capture : setPopulation est sans effet ; avant le démarrage aussi', async () => {
      const instance = TestBed.createComponent(AquariumHost).componentInstance;
      expect(() => instance.setPopulation('neon', 3)).not.toThrow();
      await create('?capture=1&seed=42');
      const before = structuredClone(host().world);
      host().setPopulation('neon', 3);
      expect(host().world).toEqual(before);
    });
  });

  describe('panneau de contrôle (#52)', () => {
    const host = () => fixture.componentInstance;
    const attr = (name: string) => (fixture.nativeElement as HTMLElement).getAttribute(name);
    /** Avance de `seconds` secondes réelles, image par image à 60 Hz, depuis `from` ms. */
    function run(seconds: number, from = 0): number {
      const frames60 = Math.round(seconds * 60);
      for (let i = 1; i <= frames60; i++) {
        frames.flush(from + (i * 1000) / 60);
      }
      return from + seconds * 1000;
    }

    it('vitesse 0 : le monde s’arrête, le rendu continue ; ×1 reprend', async () => {
      await create();
      setCanvasSize(800, 600);
      frames.flush(0);
      expect(host().speed()).toBe(1);
      expect(attr(SPEED_ATTRIBUTE)).toBe('1');
      let now = run(0.5);
      expect(host().world?.tick).toBe(30);
      host().setSpeed(0);
      expect(attr(SPEED_ATTRIBUTE)).toBe('0');
      const renders = renderers[0].renders;
      const hour = host().hour;
      now = run(1, now);
      expect(host().world?.tick).toBe(30);
      expect(host().hour).toBe(hour);
      expect(renderers[0].renders).toBe(renders + 60);
      host().setSpeed(1);
      run(0.5, now);
      expect(host().world?.tick).toBe(60);
    }, 15_000);

    it('vitesse ×2 et ×0,5 : deux fois plus et deux fois moins de pas, même pas fixe', async () => {
      await create();
      setCanvasSize(800, 600);
      frames.flush(0);
      host().setSpeed(2);
      let now = run(1);
      expect(host().world?.tick).toBe(120);
      host().setSpeed(0.5);
      now = run(1, now);
      expect(host().world?.tick).toBe(150);
      // ×4 : la caméra suit toujours le temps réel (transition non accélérée).
      host().setSpeed(4);
      run(0.25, now);
      expect(host().world?.tick).toBe(210);
    }, 15_000);

    it('vitesse invalide, en capture ou avant le démarrage : sans effet', async () => {
      // Avant le démarrage (aucune image encore rendue, pas de monde).
      const early = TestBed.createComponent(AquariumHost);
      early.componentInstance.setSpeed(0);
      early.componentInstance.setDecorVisible(false);
      expect(early.componentInstance.speed()).toBe(1);
      expect(early.componentInstance.decorVisible()).toBe(true);
      early.destroy();
      await create();
      host().setSpeed(3);
      host().setSpeed(Number.NaN);
      expect(host().speed()).toBe(1);
      fixture.destroy();
      await create('?capture=1&time=1');
      host().setSpeed(0);
      expect(host().speed()).toBe(1);
      expect(attr(SPEED_ATTRIBUTE)).toBe('1');
    });

    it('heure du panneau : quart d’heure de l’éclairage, horloge figée puis remise en marche', async () => {
      await create();
      setCanvasSize(800, 600);
      frames.flush(0);
      expect(host().clockHour()).toBe(12);
      expect(host().clockFrozen()).toBe(false);
      host().freezeClockAt(14.5);
      const now = run(0.1);
      expect(host().clockHour()).toBe(14.5);
      expect(host().clockFrozen()).toBe(true);
      host().setClockRunning(false); // déjà figée : rien ne change
      expect(host().clockFrozen()).toBe(true);
      host().setClockRunning(true);
      expect(host().clockFrozen()).toBe(false);
      expect(attr('data-aqfish-hour-frozen')).toBe('false');
      host().setClockRunning(true); // déjà en marche
      expect(host().clockFrozen()).toBe(false);
      // 2,5 s réelles à ×4 = 10 s simulées = 0,2 h : 14:42 ⇒ quart d’heure 14:45.
      host().setSpeed(4);
      run(2.5, now);
      expect(host().hour).toBeCloseTo(14.7, 2);
      expect(host().clockHour()).toBe(14.75);
      host().setClockRunning(false);
      expect(host().clockFrozen()).toBe(true);
    }, 15_000);

    it('heure= : clockFrozen vrai dès le démarrage', async () => {
      await create('?heure=6');
      expect(host().clockFrozen()).toBe(true);
      setCanvasSize(800, 600);
      frames.flush(0);
      expect(host().clockHour()).toBe(6);
    });

    it('décor : masqué puis réaffiché, exposé dans data-aqfish-decor ; sans effet en capture', async () => {
      await create();
      setCanvasSize(800, 600);
      frames.flush(0);
      expect(attr(DECOR_ATTRIBUTE)).toBe('true');
      const world = host().world;
      host().setDecorVisible(false);
      expect(host().decorVisible()).toBe(false);
      expect(attr(DECOR_ATTRIBUTE)).toBe('false');
      // La simulation n'est pas touchée : le décor reste un obstacle.
      expect(host().world).toBe(world);
      expect(host().world?.obstacles.length).toBeGreaterThan(0);
      host().setDecorVisible(true);
      expect(attr(DECOR_ATTRIBUTE)).toBe('true');
      fixture.destroy();
      await create('?capture=1');
      setCanvasSize(800, 600);
      frames.flush(0);
      const renders = renderers.at(-1)!.renders;
      host().setDecorVisible(false);
      expect(host().decorVisible()).toBe(true);
      frames.flush(1000);
      expect(renderers.at(-1)!.renders).toBe(renders);
    });
  });

  describe('filtre de rendu (#33)', () => {
    const host = () => fixture.componentInstance;
    const exposedFilter = () =>
      (fixture.nativeElement as HTMLElement).getAttribute(FILTER_ATTRIBUTE);
    const stored = () => window.localStorage.getItem(RENDER_FILTER_STORAGE_KEY);

    it('pixel art par défaut, exposé dans data-aqfish-filter', async () => {
      await create();
      expect(host().filter()).toBe('pixel');
      expect(exposedFilter()).toBe('pixel');
    });

    it('reprend le choix mémorisé au démarrage', async () => {
      window.localStorage.setItem(RENDER_FILTER_STORAGE_KEY, 'aucun');
      await create();
      expect(host().filter()).toBe('aucun');
      expect(exposedFilter()).toBe('aucun');
    });

    it('un choix mémorisé invalide est ignoré', async () => {
      window.localStorage.setItem(RENDER_FILTER_STORAGE_KEY, 'flou');
      await create();
      expect(host().filter()).toBe('pixel');
    });

    it('filtre= dans l’URL prime sur le choix mémorisé', async () => {
      window.localStorage.setItem(RENDER_FILTER_STORAGE_KEY, 'aucun');
      await create('?filtre=pixel');
      expect(host().filter()).toBe('pixel');
    });

    it('en capture, le choix mémorisé est ignoré ; filtre=aucun est appliqué', async () => {
      window.localStorage.setItem(RENDER_FILTER_STORAGE_KEY, 'aucun');
      await create('?capture=1');
      expect(host().filter()).toBe('pixel');
      fixture.destroy();
      await create('?capture=1&filtre=aucun');
      expect(host().filter()).toBe('aucun');
    });

    it('bascule à chaud : mémorise, conserve monde et caméra, rend une nouvelle image', async () => {
      await create();
      setCanvasSize(800, 600);
      frames.flush(0);
      frames.flush(100);
      const world = host().world;
      const tick = world!.tick;
      const camera = (fixture.nativeElement as HTMLElement).getAttribute(CAMERA_ATTRIBUTE);

      host().toggleFilter();
      expect(host().filter()).toBe('aucun');
      expect(exposedFilter()).toBe('aucun');
      expect(stored()).toBe('aucun');
      expect(host().world).toBe(world);
      expect(host().world!.tick).toBe(tick);
      expect((fixture.nativeElement as HTMLElement).getAttribute(CAMERA_ATTRIBUTE)).toBe(camera);
      expect(renderers).toHaveLength(1);

      host().toggleFilter();
      expect(host().filter()).toBe('pixel');
      expect(stored()).toBe('pixel');
    });

    it('en capture : la bascule rend une nouvelle image mais ne mémorise rien', async () => {
      await create('?capture=1');
      setCanvasSize(800, 600);
      frames.flush();
      expect(renderers[0].renders).toBe(1);
      expect(frames.pending.size).toBe(1); // signal « prêt »
      frames.flush();
      host().setFilter('aucun');
      frames.flush();
      expect(renderers[0].renders).toBe(2);
      expect(stored()).toBeNull();
    });

    it('stockage indisponible : la bascule fonctionne quand même (repli en mémoire)', async () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('Quota dépassé', 'QuotaExceededError');
      });
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new DOMException('Accès refusé', 'SecurityError');
      });
      await create();
      expect(host().filter()).toBe('pixel');
      expect(() => host().toggleFilter()).not.toThrow();
      expect(host().filter()).toBe('aucun');
    });

    it('sans effet avant le démarrage ou après la destruction', async () => {
      setSearch('');
      fixture = TestBed.createComponent(AquariumHost);
      host().setFilter('aucun'); // avant afterNextRender
      expect(host().filter()).toBe('pixel');
      await fixture.whenStable();
      fixture.destroy();
      host().toggleFilter();
      expect(host().filter()).toBe('pixel');
      expect(stored()).toBeNull();
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
  describe('sauvegarde (#70)', () => {
    const host = () => fixture.componentInstance;
    const element = () => fixture.nativeElement as HTMLElement;
    const memory = () => saveStorage as MemoryStorage;

    /** Écrit dans le stockage la sauvegarde d'un bassin avancé, à vitesse ×2, figé à 18 h. */
    function storePond(): string {
      const world = setPopulation(advance(createDefaultWorld(11, 'bassin'), 600), 'koi', 3);
      const text = serializeWorld(world, { speed: 2, clock: createDayClock(18, 1200, true) });
      memory().data.set(SAVE_STORAGE_KEY, text);
      return text;
    }

    it('sans sauvegarde : monde neuf, sauvegarde automatique active', async () => {
      await create();
      expect(host().world).toEqual(createDefaultWorld(42));
      expect(host().saveStatus()).toBe('active');
      expect(element().getAttribute(SAVE_ATTRIBUTE)).toBe('active');
    });

    it('restaure au démarrage le monde, la population, la vitesse et l’heure', async () => {
      const text = storePond();
      await create();
      const expected = parseWorld(text);
      expect(expected.ok).toBe(true);
      expect(host().world).toEqual(expected.ok ? expected.world : null);
      expect(host().environment()).toBe('bassin');
      expect(host().population().koi).toBe(3);
      expect(host().speed()).toBe(2);
      expect(element().getAttribute(SPEED_ATTRIBUTE)).toBe('2');
      expect(host().clockFrozen()).toBe(true);
      expect(host().hour).toBe(18);
      expect(host().activePreset()).toBe('top');
    });

    it('heure= prime sur l’heure sauvegardée ; seed=, environnement= ou population= sur le monde', async () => {
      storePond();
      await create('?heure=6');
      expect(host().environment()).toBe('bassin');
      expect(host().hour).toBe(6);
      fixture.destroy();
      for (const search of ['?seed=11', '?environnement=tropical', '?population=neon:2']) {
        await create(search);
        expect(host().environment()).toBe('tropical');
        expect(host().world!.tick).toBe(0);
        fixture.destroy();
      }
    });

    it('rendu des granulés (#117) : points par défaut, bascule enregistrée et restaurée', async () => {
      await create();
      expect(host().foodStyle()).toBe('points');
      expect(element().getAttribute(FOOD_STYLE_ATTRIBUTE)).toBe('points');
      host().toggleFoodStyle();
      expect(host().foodStyle()).toBe('voxels');
      expect(element().getAttribute(FOOD_STYLE_ATTRIBUTE)).toBe('voxels');
      const saved = parseWorld(memory().data.get(SAVE_STORAGE_KEY)!);
      expect(saved.ok && saved.settings.foodStyle).toBe('voxels');
      // Valeur inconnue ignorée.
      host().setFoodStyle('cubes' as never);
      expect(host().foodStyle()).toBe('voxels');
      fixture.destroy();
      await create();
      expect(host().foodStyle()).toBe('voxels');
      expect(element().getAttribute(FOOD_STYLE_ATTRIBUTE)).toBe('voxels');
    });

    it('rendu des granulés : granules= en capture seulement, bouton sans effet', async () => {
      await create('?capture=1&seed=3&granules=voxels');
      expect(host().foodStyle()).toBe('voxels');
      host().toggleFoodStyle();
      expect(host().foodStyle()).toBe('voxels');
      fixture.destroy();
      await create('?granules=voxels');
      expect(host().foodStyle()).toBe('points');
    });

    it('en mode capture : le stockage n’est ni lu ni écrit', async () => {
      storePond();
      const reads = memory().reads;
      await create('?capture=1&seed=3');
      expect(host().world).toEqual(createDefaultWorld(3));
      expect(host().saveNow()).toBeNull();
      host().exportSave();
      expect(host().importSave(serializeWorld(createDefaultWorld(1)))).toBe(false);
      window.dispatchEvent(new Event('pagehide'));
      expect(memory().reads).toBe(reads);
      expect(memory().writes).toBe(0);
      expect(host().saveStatus()).toBeNull();
      expect(element().hasAttribute(SAVE_ATTRIBUTE)).toBe(false);
    });

    it('sauvegarde illisible : monde neuf et message d’erreur', async () => {
      memory().data.set(SAVE_STORAGE_KEY, '{"format":"aqfish","schema":99}');
      await create();
      expect(host().world).toEqual(createDefaultWorld(42));
      expect(host().saveMessage()?.kind).toBe('erreur');
      expect(host().saveMessage()?.text).toMatch(/illisible/);
    });

    it('écrit à intervalle et quand la page est quittée ou masquée', async () => {
      const interval = vi.spyOn(window, 'setInterval');
      await create('');
      setCanvasSize(800, 600);
      frames.flush(0);
      frames.flush(1000);
      const call = interval.mock.calls.find(([, delay]) => delay === AUTOSAVE_INTERVAL_MS);
      expect(call).toBeDefined();
      (call![0] as () => void)();
      const saved = parseWorld(memory().data.get(SAVE_STORAGE_KEY)!);
      expect(saved.ok && saved.world).toEqual(host().world);
      host().feedAtCenter();
      window.dispatchEvent(new Event('pagehide'));
      const afterPagehide = parseWorld(memory().data.get(SAVE_STORAGE_KEY)!);
      expect(afterPagehide.ok && afterPagehide.world.food.length).toBe(FOOD_PER_DROP);
      const writes = memory().writes;
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
      delete (document as unknown as Record<string, unknown>)['visibilityState'];
      expect(memory().writes).toBe(writes + 1);
      // Plus aucune écriture après la destruction.
      fixture.destroy();
      window.dispatchEvent(new Event('pagehide'));
      expect(memory().writes).toBe(writes + 1);
    });

    it('stockage indisponible ou plein : l’application continue et le signale', async () => {
      saveStorage = null;
      await create();
      expect(host().saveNow()).toBe('indisponible');
      expect(element().getAttribute(SAVE_ATTRIBUTE)).toBe('indisponible');
      setCanvasSize(800, 600);
      frames.flush(0);
      frames.flush(500);
      expect(host().world!.tick).toBeGreaterThan(0);
      fixture.destroy();
      saveStorage = new MemoryStorage(10);
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [AquariumHost],
        providers: [
          { provide: SAVE_STORAGE, useFactory: () => saveStorage },
          {
            provide: AQUARIUM_RENDERER_FACTORY,
            useValue: (canvas: HTMLCanvasElement) => new FakeRenderer(canvas),
          },
        ],
      });
      await create();
      expect(host().saveNow()).toBe('plein');
      expect(host().saveStatus()).toBe('plein');
    });

    it('importSave : remplace le monde et les réglages, puis enregistre', async () => {
      await create('?seed=4');
      const world = advance(createDefaultWorld(8, 'bassin'), 300);
      expect(
        host().importSave(
          serializeWorld(world, { speed: 0.5, clock: createDayClock(3, 1200, false) }),
        ),
      ).toBe(true);
      expect(host().world).toEqual(world);
      expect(host().environment()).toBe('bassin');
      expect(host().speed()).toBe(0.5);
      expect(host().clockFrozen()).toBe(false);
      expect(host().saveMessage()).toEqual({ kind: 'info', text: 'Aquarium importé.' });
      expect(renderers).toHaveLength(2);
      expect(renderers[0].disposed).toBe(true);
      expect(element().getAttribute(TICK_ATTRIBUTE)).toBe('300');
      expect(memory().data.has(SAVE_STORAGE_KEY)).toBe(true);
    });

    it('importSave refusé : le bac en cours est intact et l’erreur est affichée', async () => {
      await create('?seed=4');
      const world = host().world;
      const snapshot = structuredClone(world);
      for (const text of ['pas du json', '{"format":"aqfish","schema":2}', '{"__proto__":{}}']) {
        expect(host().importSave(text)).toBe(false);
        expect(host().saveMessage()?.kind).toBe('erreur');
        expect(host().saveMessage()?.text).toMatch(/^Import refusé : /);
      }
      expect(host().world).toBe(world);
      expect(host().world).toEqual(snapshot);
      expect(renderers).toHaveLength(1);
      host().rejectImport('fichier trop volumineux');
      expect(host().saveMessage()?.text).toBe('Import refusé : fichier trop volumineux.');
    });

    it('exportSave : télécharge la sauvegarde du monde courant', async () => {
      await create('?seed=6');
      host().setSpeed(4);
      let blob: Blob | null = null;
      const createUrl = vi.fn((b: Blob) => {
        blob = b;
        return 'blob:aqfish';
      });
      Object.assign(window.URL, { createObjectURL: createUrl, revokeObjectURL: vi.fn() });
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
        this: HTMLAnchorElement,
      ) {
        expect(this.download).toBe(SAVE_FILE_NAME);
        expect(this.href).toBe('blob:aqfish');
      });
      host().exportSave();
      expect(click).toHaveBeenCalledOnce();
      const result = parseWorld(await blob!.text());
      expect(result.ok && result.world).toEqual(host().world);
      expect(result.ok && result.settings.speed).toBe(4);
      expect(host().saveMessage()?.kind).toBe('info');
      delete (window.URL as unknown as Record<string, unknown>)['createObjectURL'];
      delete (window.URL as unknown as Record<string, unknown>)['revokeObjectURL'];
      host().exportSave();
      expect(host().saveMessage()?.kind).toBe('erreur');
    });
  });
});
