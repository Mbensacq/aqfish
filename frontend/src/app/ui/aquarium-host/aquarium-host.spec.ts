import { TestBed, type ComponentFixture } from '@angular/core/testing';

import { isCaptureReady, resetCaptureReady } from '../../core/capture/capture-ready';
import { RENDER_FILTER_STORAGE_KEY } from '../../core/render-filter/render-filter';
import { SAVE_STORAGE_KEY, type SaveStorage } from '../../core/save-storage/save-storage';
import { createDayClock } from '../../sim/daylight';
import { DEFAULT_SAVE_SETTINGS, parseWorld, serializeWorld } from '../../sim/save';
import { DEFAULT_ROOM } from '../../sim/room';
import type { AquariumRenderer, AquariumView } from '../../render/aquarium-view';
import { MAX_STEPS_PER_FRAME } from '../../sim/constants';
import { DEFAULT_SIM_SPEED } from '../../sim/sim-speed';
import {
  AXOLOTL,
  CHIRURGIEN,
  CLOWN,
  CORYDORA,
  GRENOUILLE,
  GUPPY,
  KOI,
  NEON,
  TRITON,
} from '../../sim/species';
import { expiryAge, FOOD_PER_DROP } from '../../sim/food';
import { setPopulation } from '../../sim/population';
import {
  advance,
  advanceToWithFeedings,
  changeWorldWater,
  createDefaultWorld,
  setWorldHeater,
} from '../../sim/world';
import { freshWater } from '../../sim/water';
import { phBands } from '../../sim/water-ph';
import { sampleWater } from '../../sim/water-quality';
import {
  DEFAULT_DECOR,
  MAX_DECOR_SCALE,
  MIN_DECOR_SCALE,
  withElevation,
  type DecorItem,
} from '../../sim/decor';
import {
  DECOR_ROTATION_STEP,
  DECOR_SCALE_STEP,
  decorFootprint,
  decorItemsOverlap,
} from '../../sim/decor-edit';
import { DEFAULT_TANK } from '../../sim/tank';
import { initDecorPhysics } from '../../core/decor-physics/decor-physics';
import {
  applyCaptureFurniture,
  applyCaptureWoods,
  applyPopulation,
  AQUARIUM_RENDERER_FACTORY,
  AquariumHost,
  DECOR_PHYSICS_ATTRIBUTE,
  DECOR_PHYSICS_LOADER,
  AUTOSAVE_INTERVAL_MS,
  SAVE_ATTRIBUTE,
  SAVE_FILE_NAME,
  SAVE_STORAGE,
  CAMERA_ATTRIBUTE,
  ENVIRONMENT_ATTRIBUTE,
  RAIN_ATTRIBUTE,
  WATER_ATTRIBUTE,
  PH_ATTRIBUTE,
  WATER_READOUT_TICKS,
  ROOM_ATTRIBUTE,
  ROOM_COUNT_ATTRIBUTE,
  ROOM_SELECTION_ATTRIBUTE,
  TANK_ATTRIBUTE,
  CAMERA_TARGET_ATTRIBUTE,
  DECOR_ATTRIBUTE,
  DECOR_COUNT_ATTRIBUTE,
  DECOR_SELECTION_ATTRIBUTE,
  EDITING_ATTRIBUTE,
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
        // Moteur de chute (#170) : jamais chargé, sauf dans les tests qui le remplacent.
        { provide: DECOR_PHYSICS_LOADER, useValue: () => new Promise<never>(() => undefined) },
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

    it('hors capture : vitesse=0 laisse le monde à t = 0 quel que soit le temps réel (#232)', async () => {
      await create('?seed=42&vitesse=0');
      const el = fixture.nativeElement as HTMLElement;
      expect(host().speed()).toBe(0);
      expect(el.getAttribute(SPEED_ATTRIBUTE)).toBe('0');
      setCanvasSize(800, 600);
      frames.flush(0);
      for (let i = 1; i <= 120; i++) {
        frames.flush((i * 1000) / 60);
      }
      frames.flush(60_000);
      expect(host().world?.tick).toBe(0);
      expect(el.getAttribute(TICK_ATTRIBUTE)).toBe('0');
      expect(host().interpolationAlpha).toBe(0);
      // Le curseur reste utilisable : la simulation repart.
      host().setSpeed(1);
      for (let i = 1; i <= 30; i++) {
        frames.flush(60_000 + (i * 1000) / 60);
      }
      expect(host().world?.tick).toBe(30);
    });

    it('hors capture : vitesse= hors des vitesses proposées ignorée (#232)', async () => {
      for (const search of ['?vitesse=3', '?vitesse=x', '?vitesse=-1']) {
        await create(search);
        expect(host().speed()).toBe(DEFAULT_SIM_SPEED);
      }
    });

    it('en capture : vitesse= sans effet, le monde va jusqu’à time (#232)', async () => {
      await create('?capture=1&seed=42&time=1&vitesse=0');
      expect(host().world?.tick).toBe(60);
      expect(host().speed()).toBe(DEFAULT_SIM_SPEED);
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
      await create('?capture=1&seed=5&environnement=lune');
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
        triton: 0,
        clown: 0,
        chirurgien: 0,
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

    it('setEnvironment (#277) : retour au bac quitté, état gardé et figé, heure sans saut', async () => {
      await create('?seed=9');
      setCanvasSize(800, 600);
      frames.flush(0);
      frames.flush(700);
      host().setPopulation('neon', 3);
      host().feedAtCenter();
      host().setTankDimensions({ width: 1.2, height: 0.5, depth: 0.45 });
      frames.flush(900);
      const tropical = host().world!;
      const snapshot = serializeWorld(tropical);
      const tick = tropical.tick;
      const hour = host().hour!;
      host().setEnvironment('bassin');
      // L'heure continue : le bassin neuf part de t = 0 sans ramener l'heure de départ.
      expect(host().hour!).toBeCloseTo(hour, 6);
      expect(host().world!.tick).toBe(0);
      host().setPopulation('koi', 2);
      frames.flush(1500);
      expect(host().world!.tick).toBeGreaterThan(0);
      const pond = host().world!;
      const pondText = serializeWorld(pond);
      const pondHour = host().hour!;
      host().setEnvironment('tropical');
      // Même objet, même contenu, même temps : rien n'a avancé pendant le séjour au bassin.
      expect(host().world).toBe(tropical);
      expect(serializeWorld(host().world!)).toBe(snapshot);
      expect(host().world!.tick).toBe(tick);
      expect(host().hour!).toBeCloseTo(pondHour, 6);
      expect(host().population().neon).toBe(3);
      expect(host().tankDimensions()).toEqual({ width: 1.2, height: 0.5, depth: 0.45 });
      expect(element().getAttribute('data-aqfish-food')).toBe(String(tropical.food.length));
      host().setEnvironment('bassin');
      expect(serializeWorld(host().world!)).toBe(pondText);
      expect(host().population().koi).toBe(2);
    });

    it('setEnvironment (#277) : un environnement jamais visité part de son monde de départ', async () => {
      await create('?seed=4');
      host().setPopulation('guppy', 1);
      host().setEnvironment('recif');
      expect(host().world).toEqual(createDefaultWorld(4, 'recif'));
      host().setEnvironment('paludarium');
      expect(host().world).toEqual(createDefaultWorld(4, 'paludarium'));
      host().setEnvironment('tropical');
      expect(host().population().guppy).toBe(1);
    });

    it('setEnvironment : inconnu, identique, en capture ou avant le démarrage : sans effet', async () => {
      const instance = TestBed.createComponent(AquariumHost).componentInstance;
      expect(() => instance.setEnvironment('bassin')).not.toThrow();
      await create('?seed=2');
      const world = host().world;
      const created = renderers.length;
      host().setEnvironment('lune');
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

  describe('dimensions du bac (#171)', () => {
    const host = () => fixture.componentInstance;
    const element = () => fixture.nativeElement as HTMLElement;
    const SMALL = { width: 0.6, height: 0.5, depth: 0.3 };

    it('setTankDimensions : bornées, décor ramené, vue recréée sur le même préréglage, enregistré', async () => {
      await create('?seed=9');
      setCanvasSize(800, 600);
      frames.flush(0);
      expect(host().tankDimensions()).toEqual(DEFAULT_TANK);
      expect(element().getAttribute(TANK_ATTRIBUTE)).toBe('1.2:0.6:0.5');
      host().goToPreset('side');
      const population = host().population();
      host().setTankDimensions({ width: 0.1, height: 0.5, depth: 0.3 });
      expect(host().world?.dimensions).toEqual(SMALL);
      expect(host().tankDimensions()).toEqual(SMALL);
      expect(element().getAttribute(TANK_ATTRIBUTE)).toBe('0.6:0.5:0.3');
      expect(host().population()).toEqual(population);
      expect(host().world?.decor.every((item) => Math.abs(item.z) < SMALL.depth / 2)).toBe(true);
      expect(renderers).toHaveLength(2);
      expect(renderers[0].disposed).toBe(true);
      expect(host().activePreset()).toBe('side');
      expect(saveStorage?.getItem(SAVE_STORAGE_KEY)).toContain('"dimensions"');
      frames.flush(1000);
      expect(renderers[1].renders).toBeGreaterThan(0);
      // Mêmes dimensions : rien n'est recréé.
      host().setTankDimensions(SMALL);
      expect(renderers).toHaveLength(2);
    });

    it('hors du bac tropical, en capture ou avant le démarrage : sans effet ; bac= en capture', async () => {
      const instance = TestBed.createComponent(AquariumHost).componentInstance;
      expect(() => instance.setTankDimensions(SMALL)).not.toThrow();
      await create('?seed=2');
      host().setEnvironment('bassin');
      expect(host().tankDimensions()).toBeNull();
      const world = host().world;
      host().setTankDimensions(SMALL);
      expect(host().world).toBe(world);
      fixture.destroy();
      await create('?capture=1&seed=2&bac=0.6:0.5:0.3');
      expect(host().world?.dimensions).toEqual(SMALL);
      host().setTankDimensions(DEFAULT_TANK);
      expect(host().world?.dimensions).toEqual(SMALL);
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

  describe('eau (#207)', () => {
    const host = () => fixture.componentInstance;
    const waterAttr = () => (fixture.nativeElement as HTMLElement).getAttribute(WATER_ATTRIBUTE);
    const phAttr = () => (fixture.nativeElement as HTMLElement).getAttribute(PH_ATTRIBUTE);
    const viewOf = (h: AquariumHost) => (h as unknown as { view: AquariumView }).view;

    it('relevé exposé au démarrage : eau saine, bonne, eau claire', async () => {
      await create('?seed=42');
      expect(host().water()).toEqual({
        quality: 'bonne',
        temperature: 25,
        target: 25,
        ammonia: 0,
        nitrite: 0,
        nitrate: 0,
        ph: 7,
        phZone: 'ideal',
        phBands: phBands(['neon', 'guppy', 'corydora']),
      });
      expect(waterAttr()).toBe('bonne;25;25;0;0;0');
      expect(phAttr()).toBe('7;ideal');
      expect(viewOf(host()).waterTurbidity).toBe(0);
    });

    it('tableau de bord (#256) : relevé exact exposé, au plus 4 fois par seconde à vitesse 4', async () => {
      await create('?seed=42');
      expect(host().waterSample()).toMatchObject({ tick: 0, environment: 'tropical', ph: 7 });
      host().setSpeed(4);
      setCanvasSize(800, 600);
      const reads: number[] = [];
      let last = host().waterSample();
      frames.flush(0);
      // 3 s de temps réel à 60 images par seconde : 720 pas simulés, soit 24 relevés
      // possibles tous les 30 pas, ramenés à 4 par seconde au plus.
      for (let i = 1; i <= 180; i++) {
        const now = (i * 1000) / 60;
        frames.flush(now);
        if (host().waterSample() !== last) {
          last = host().waterSample();
          reads.push(now);
        }
      }
      expect(host().world?.tick).toBe(720);
      for (const t of reads) {
        expect(reads.filter((u) => u >= t && u < t + 1000).length).toBeLessThanOrEqual(4);
      }
      expect(reads.length).toBeGreaterThanOrEqual(10);
      expect(host().waterSample().tick).toBeGreaterThan(0);
      expect(host().waterSample().tick).toBeLessThanOrEqual(720);
    }, 15_000);

    it('tableau de bord (#260) : santé relevée avec l’eau, au plus 4 fois par seconde', async () => {
      await create('?seed=42');
      expect(host().health()).toMatchObject({ animals: 24, averageHealth: 1, sick: 0 });
      // Animaux à la santé usée : la santé remonte (aucune cause), relevée au rythme de l'eau.
      const fishes = host().world!.entities as unknown as { health: number; hunger: number }[];
      for (const fish of fishes) {
        fish.health = 0.5;
        fish.hunger = 0;
      }
      host().setSpeed(4);
      setCanvasSize(800, 600);
      const reads: number[] = [];
      let last = host().health();
      frames.flush(0);
      for (let i = 1; i <= 180; i++) {
        const now = (i * 1000) / 60;
        frames.flush(now);
        if (host().health() !== last) {
          last = host().health();
          reads.push(now);
        }
      }
      for (const t of reads) {
        expect(reads.filter((u) => u >= t && u < t + 1000).length).toBeLessThanOrEqual(4);
      }
      expect(reads.length).toBeGreaterThanOrEqual(1);
      expect(host().health().sick).toBe(24);
      expect(host().health().averageHealth).toBeGreaterThan(0.5);
    }, 15_000);

    it('pH (#236) : zone selon les espèces présentes, remonte au changement d’eau', async () => {
      await create('?seed=42');
      const world = host().world as unknown as { water: object };
      world.water = { ...freshWater('tropical'), ph: 6 };
      host().changeWater();
      // 6 + 0,3 × (7 − 6) = 6,3 : sous la tolérance des guppys (6,5).
      expect(host().world!.water.ph).toBeCloseTo(6.3, 12);
      expect(host().water().ph).toBe(6.3);
      expect(host().water().phZone).toBe('hors-plage');
      expect(phAttr()).toBe('6.3;hors-plage');
      host().changeWater();
      expect(phAttr()).toBe('6.5;tolere');
      const saved = parseWorld(saveStorage!.getItem(SAVE_STORAGE_KEY)!);
      expect(saved.ok && saved.world.water.ph).toBeCloseTo(6.51, 12);
    });

    it('changer l’eau : retire une part des nitrates, relevé et sauvegarde suivent', async () => {
      await create('?seed=42');
      const world = host().world as unknown as { water: object };
      world.water = { ...sampleWater('tropical', 'mauvaise') };
      const expected = changeWorldWater(structuredClone(host().world!)).water;
      host().changeWater();
      expect(host().world!.water).toEqual(expected);
      expect(host().water().nitrate).toBe(35);
      expect(host().water().quality).toBe('a-surveiller');
      const saved = parseWorld(saveStorage!.getItem(SAVE_STORAGE_KEY)!);
      expect(saved.ok && saved.world.water.nitrate).toBe(35);
    });

    it('eau mauvaise : l’eau se trouble, puis s’éclaircit après des changements d’eau', async () => {
      await create('?seed=42');
      const world = host().world as unknown as { water: object };
      world.water = { ...sampleWater('tropical', 'mauvaise') };
      host().changeWater();
      host().changeWater();
      expect(viewOf(host()).waterTurbidity).toBe(0);
      world.water = { ...sampleWater('tropical', 'mauvaise') };
      host().changeWater();
      // 50 × 0,7 = 35 : à surveiller, pas de trouble ; remis à 50 sans passer par l'hôte, le
      // relevé suit à la boucle suivante.
      world.water = { ...sampleWater('tropical', 'mauvaise') };
      setCanvasSize(800, 600);
      for (let t = 0; t <= 2000; t += 100) {
        frames.flush(t);
      }
      expect(host().world!.tick).toBeGreaterThanOrEqual(WATER_READOUT_TICKS);
      expect(host().water().quality).toBe('mauvaise');
      expect(viewOf(host()).waterTurbidity).toBe(1);
    });

    it('chauffage : consigne réglée, enregistrée et restaurée ; hors bornes ignorée', async () => {
      await create();
      host().setHeater(28.04);
      expect(host().world!.water.heater).toBe(28);
      expect(host().water().target).toBe(28);
      host().setHeater(50);
      host().setHeater(Number.NaN);
      expect(host().world!.water.heater).toBe(28);
      fixture.destroy();
      await create();
      expect(host().world!.water.heater).toBe(28);
      expect(host().water().target).toBe(28);
      expect(waterAttr()).toBe('bonne;25;28;0;0;0');
    });

    it('eau= en capture : eau d’exemple, troublée si mauvaise ; boutons sans effet', async () => {
      await create('?capture=1&seed=42&eau=mauvaise');
      expect(host().world!.water.nitrate).toBe(50);
      expect(host().water().quality).toBe('mauvaise');
      expect(viewOf(host()).waterTurbidity).toBe(1);
      host().changeWater();
      host().setHeater(30);
      expect(host().world!.water).toEqual(sampleWater('tropical', 'mauvaise'));
      fixture.destroy();
      for (const search of ['?capture=1&seed=42&eau=autre', '?capture=1&seed=42']) {
        await create(search);
        expect(host().world).toEqual(createDefaultWorld(42));
        expect(viewOf(host()).waterTurbidity).toBe(0);
        fixture.destroy();
      }
      // Hors capture, `eau=` est ignoré.
      await create('?seed=42&eau=mauvaise');
      expect(host().water().quality).toBe('bonne');
    });

    it('changer d’environnement : eau saine du nouvel environnement', async () => {
      await create('?seed=42');
      host().setHeater(30);
      host().setEnvironment('bassin');
      expect(host().water().target).toBe(18);
      expect(host().water().quality).toBe('bonne');
      expect(setWorldHeater(createDefaultWorld(42, 'bassin'), 30).water.heater).toBe(30);
    });

    it('sans effet avant le démarrage', () => {
      const early = TestBed.createComponent(AquariumHost);
      expect(() => early.componentInstance.changeWater()).not.toThrow();
      expect(() => early.componentInstance.setHeater(26)).not.toThrow();
      early.destroy();
    });
  });

  describe('pièce autour du bac (#187)', () => {
    const host = () => fixture.componentInstance;
    const roomAttr = () => (fixture.nativeElement as HTMLElement).getAttribute(ROOM_ATTRIBUTE);
    const savedRoom = () => {
      const saved = parseWorld(saveStorage!.getItem(SAVE_STORAGE_KEY)!);
      return saved.ok ? saved.settings.room : null;
    };

    it('case : affichée, enregistrée et restaurée, sans toucher au monde ni recréer la vue', async () => {
      await create('?seed=8');
      setCanvasSize(800, 600);
      frames.flush(0);
      expect(host().room()).toEqual(DEFAULT_ROOM);
      expect(roomAttr()).toBe('false');
      const world = host().world;
      const tick = world!.tick;
      host().setRoomShown(true);
      expect(host().room().shown).toBe(true);
      expect(roomAttr()).toBe('true');
      expect(renderers).toHaveLength(1);
      expect(host().world).toBe(world);
      expect(host().world!.tick).toBe(tick);
      expect(savedRoom()).toEqual({ ...DEFAULT_ROOM, shown: true });
      frames.flush(1000);
      expect(renderers[0].renders).toBeGreaterThan(0);
      fixture.destroy();
      await create();
      expect(host().room().shown).toBe(true);
      expect(roomAttr()).toBe('true');
      host().setRoomShown(false);
      expect(roomAttr()).toBe('false');
      expect(savedRoom()).toEqual(DEFAULT_ROOM);
    });

    it('hors du bac tropical : réglage gardé mais rien n’est dessiné', async () => {
      await create('?seed=8');
      host().setRoomShown(true);
      host().setEnvironment('bassin');
      expect(host().room().shown).toBe(true);
      expect(roomAttr()).toBe('false');
      host().setEnvironment('tropical');
      expect(roomAttr()).toBe('true');
    });

    it('même simulation, pièce affichée ou non', async () => {
      await create('?seed=12');
      host().setRoomShown(true);
      setCanvasSize(800, 600);
      frames.flush(0);
      frames.flush(500);
      const withRoom = host().world;
      fixture.destroy();
      await create('?seed=12');
      setCanvasSize(800, 600);
      frames.flush(0);
      frames.flush(500);
      expect(host().world).toEqual(withRoom);
    });

    it('piece=1 en capture seulement ; case sans effet en capture et avant le démarrage', async () => {
      const early = TestBed.createComponent(AquariumHost);
      expect(() => early.componentInstance.setRoomShown(true)).not.toThrow();
      expect(early.componentInstance.room().shown).toBe(false);
      early.destroy();
      await create('?capture=1&seed=3&piece=1');
      expect(host().room().shown).toBe(true);
      expect(roomAttr()).toBe('true');
      host().setRoomShown(false);
      expect(host().room().shown).toBe(true);
      fixture.destroy();
      await create('?capture=1&seed=3&piece=1&environnement=bassin');
      expect(roomAttr()).toBe('false');
      fixture.destroy();
      await create('?capture=1&seed=3');
      expect(roomAttr()).toBe('false');
      fixture.destroy();
      await create('?seed=3&piece=1');
      expect(host().room().shown).toBe(false);
    });

    it('import : la pièce de la sauvegarde importée est appliquée', async () => {
      await create('?seed=3');
      const text = serializeWorld(createDefaultWorld(5), {
        ...DEFAULT_SAVE_SETTINGS,
        room: { shown: true, cabinetHeight: 0.9 },
      });
      expect(host().importSave(text)).toBe(true);
      expect(host().room()).toEqual({ shown: true, cabinetHeight: 0.9 });
      expect(roomAttr()).toBe('true');
    });
  });

  describe('population (#69)', () => {
    const host = () => fixture.componentInstance;
    const exposed = () => (fixture.nativeElement as HTMLElement).getAttribute(POPULATION_ATTRIBUTE);

    it('formatPopulation : espece:n, dans l’ordre des espèces', () => {
      const counts = {
        neon: 12,
        guppy: 0,
        corydora: 6,
        koi: 2,
        axolotl: 1,
        grenouille: 3,
        triton: 2,
        clown: 0,
        chirurgien: 0,
      };
      expect(formatPopulation(counts)).toBe(
        'neon:12,guppy:0,corydora:6,koi:2,axolotl:1,grenouille:3,triton:2,clown:0,chirurgien:0',
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

    it('applyCaptureFurniture : éléments lâchés dans l’ordre, inconnus ou refusés ignorés (#188)', () => {
      const room = { shown: true, cabinetHeight: 0.75 };
      const furnished = applyCaptureFurniture(room, DEFAULT_TANK, [
        { kind: 'etagere', x: -1.25, z: -0.17, quarter: 0 },
        { kind: 'lit', x: -2, z: 1, quarter: 0 }, // type inconnu
        { kind: 'plante-pot', x: 0, z: 0, quarter: 0 }, // sur le meuble du bac
        { kind: 'plante-pot', x: -1.4, z: -0.17, quarter: 0 }, // sur l'étagère
      ]);
      expect(furnished.items).toEqual([
        { kind: 'etagere', x: -1.25, z: -0.17, quarter: 0 },
        { kind: 'plante-pot', x: -1.4, z: -0.17, quarter: 0, elevation: 0.8 },
      ]);
      expect(room).toEqual({ shown: true, cabinetHeight: 0.75 });
      expect(applyCaptureFurniture(room, DEFAULT_TANK, [])).toEqual(room);
    });

    it('applyCaptureWoods : bois valides ajoutés au décor, invalides ignorés (#169)', () => {
      const world = createDefaultWorld(42);
      const before = world.decor.length;
      applyCaptureWoods(world, [
        { x: 0.05, z: 0.1, rotation: 0.3, scale: 1, seed: 7 },
        { x: 9, z: 0, rotation: 0, scale: 1, seed: 1 }, // hors du bac
        { x: 0, z: 0, rotation: 0, scale: 9, seed: 1 }, // échelle hors bornes
        { x: 0, z: 0, rotation: 0, scale: 1, seed: 2 ** 40 }, // graine invalide
      ]);
      expect(world.decor).toHaveLength(before + 1);
      expect(world.decor[before]).toEqual({
        kind: 'wood',
        x: 0.05,
        z: 0.1,
        rotation: 0.3,
        scale: 1,
        seed: 7,
      });
      expect(world.obstacles).toHaveLength(createDefaultWorld(42).obstacles.length + 1);
      // Sans bois valide : monde inchangé.
      const untouched = createDefaultWorld(42);
      applyCaptureWoods(untouched, [{ x: 9, z: 9, rotation: 0, scale: 1, seed: 1 }]);
      expect(untouched).toEqual(createDefaultWorld(42));
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
        triton: 0,
        clown: 0,
        chirurgien: 0,
      });
      expect(host().populationMax()).toEqual({
        neon: NEON.maxPopulation,
        guppy: GUPPY.maxPopulation,
        corydora: CORYDORA.maxPopulation,
        koi: KOI.maxPopulation,
        axolotl: AXOLOTL.maxPopulation,
        grenouille: GRENOUILLE.maxPopulation,
        triton: TRITON.maxPopulation,
        clown: CLOWN.maxPopulation,
        chirurgien: CHIRURGIEN.maxPopulation,
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

    it('changer d’environnement (#277) : enregistré aussitôt avec le monde quitté, restauré au démarrage', async () => {
      await create();
      host().setPopulation('neon', 2);
      const tropical = serializeWorld(host().world!);
      host().setEnvironment('bassin');
      const stored = JSON.parse(memory().data.get(SAVE_STORAGE_KEY)!) as {
        environment: string;
        others: { environment: string }[];
      };
      expect(stored.environment).toBe('bassin');
      expect(stored.others.map((o) => o.environment)).toEqual(['tropical']);
      host().setPopulation('koi', 1);
      // Sauvegarde automatique (minuterie ou `pagehide` en vrai).
      host().saveNow();
      fixture.destroy();
      // Rechargement : le bassin est affiché, le bac tropical attend tel qu'il a été quitté.
      await create();
      expect(host().environment()).toBe('bassin');
      expect(host().population().koi).toBe(1);
      host().setEnvironment('tropical');
      expect(serializeWorld(host().world!)).toBe(tropical);
      expect(host().population().neon).toBe(2);
    });

    it('import (#277) : remplace aussi les mondes des autres environnements', async () => {
      await create('?seed=6');
      host().setEnvironment('recif');
      host().setEnvironment('tropical');
      const pond = setPopulation(createDefaultWorld(8, 'bassin'), 'koi', 4);
      const text = serializeWorld(createDefaultWorld(8), DEFAULT_SAVE_SETTINGS, [pond]);
      expect(host().importSave(text)).toBe(true);
      host().setEnvironment('bassin');
      expect(host().world).toEqual(pond);
      // Le récif visité avant l'import est oublié : monde de départ de la graine importée.
      host().setEnvironment('recif');
      expect(host().world).toEqual(createDefaultWorld(8, 'recif'));
    });

    it('sans sauvegarde : monde neuf, sauvegarde automatique active', async () => {
      await create();
      expect(host().world).toEqual(createDefaultWorld(42));
      expect(host().saveStatus()).toBe('active');
      expect(element().getAttribute(SAVE_ATTRIBUTE)).toBe('active');
    });

    it('vitesse= prime sur la vitesse de la sauvegarde, le monde restauré est gardé (#232)', async () => {
      const text = storePond();
      await create('?vitesse=0');
      const expected = parseWorld(text);
      expect(host().world).toEqual(expected.ok ? expected.world : null);
      expect(host().speed()).toBe(0);
      expect(element().getAttribute(SPEED_ATTRIBUTE)).toBe('0');
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

    it('rendu des granulés (#117) : voxels par défaut (#226), bascule enregistrée et restaurée', async () => {
      await create();
      expect(host().foodStyle()).toBe('voxels');
      expect(element().getAttribute(FOOD_STYLE_ATTRIBUTE)).toBe('voxels');
      host().toggleFoodStyle();
      expect(host().foodStyle()).toBe('points');
      expect(element().getAttribute(FOOD_STYLE_ATTRIBUTE)).toBe('points');
      const saved = parseWorld(memory().data.get(SAVE_STORAGE_KEY)!);
      expect(saved.ok && saved.settings.foodStyle).toBe('points');
      // Valeur inconnue ignorée.
      host().setFoodStyle('cubes' as never);
      expect(host().foodStyle()).toBe('points');
      fixture.destroy();
      await create();
      expect(host().foodStyle()).toBe('points');
      expect(element().getAttribute(FOOD_STYLE_ATTRIBUTE)).toBe('points');
    });

    it('rendu des granulés : granules= en capture seulement, bouton sans effet', async () => {
      await create('?capture=1&seed=3&granules=points');
      expect(host().foodStyle()).toBe('points');
      host().toggleFoodStyle();
      expect(host().foodStyle()).toBe('points');
      fixture.destroy();
      await create('?granules=points');
      expect(host().foodStyle()).toBe('voxels');
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

  describe('édition de la pièce (#188)', () => {
    const host = () => fixture.componentInstance;
    const element = () => fixture.nativeElement as HTMLElement;
    const items = () => host().room().items ?? [];
    const savedItems = () => {
      const saved = parseWorld(saveStorage!.getItem(SAVE_STORAGE_KEY)!);
      return saved.ok ? (saved.settings.room?.items ?? []) : null;
    };
    const SHELF = { kind: 'etagere', x: -1.25, z: -0.17, quarter: 0 } as const;
    const viewOf = (h: AquariumHost) => (h as unknown as { view: AquariumView }).view;

    async function editRoom(): Promise<void> {
      await create('?seed=4');
      host().setRoomShown(true);
      host().setDecorEditing(true);
    }

    it('outils de la pièce seulement pièce dessinée ; masquer la pièce rend la sélection', async () => {
      await create('?seed=4');
      host().setDecorEditing(true);
      expect(host().roomEditable()).toBe(false);
      host().setDecorTool('etagere');
      expect(host().decorTool()).toBe('rock');
      host().setRoomShown(true);
      expect(host().roomEditable()).toBe(true);
      host().setDecorTool('etagere');
      expect(host().decorTool()).toBe('etagere');
      host().editAt({ kind: 'floor', x: SHELF.x, z: SHELF.z });
      expect(host().roomSelection()).toBe(0);
      host().setRoomShown(false);
      expect(host().roomSelection()).toBeNull();
      expect(host().decorTool()).toBe('select');
      expect(element().getAttribute(ROOM_SELECTION_ATTRIBUTE)).toBe('aucun');
    });

    it('pose sur le parquet puis sur l’étagère, sélectionne, enregistre et restitue', async () => {
      await editRoom();
      host().setDecorTool('etagere');
      host().editAt({ kind: 'floor', x: SHELF.x, z: SHELF.z });
      expect(items()).toEqual([SHELF]);
      expect(element().getAttribute(ROOM_COUNT_ATTRIBUTE)).toBe('1');
      expect(element().getAttribute(ROOM_SELECTION_ATTRIBUTE)).toBe('0');
      expect(viewOf(host()).roomSelection).toBe(0);
      host().setDecorTool('plante-pot');
      // Clic sur l'étagère avec la plante : elle se pose dessus.
      host().editAt({ kind: 'room-item', index: 0, x: -1.4, z: -0.17 });
      expect(items()[1]).toEqual({
        kind: 'plante-pot',
        x: -1.4,
        z: -0.17,
        quarter: 0,
        elevation: 0.8,
      });
      expect(host().roomSelection()).toBe(1);
      expect(savedItems()).toEqual(items());
      // Parquet hors de la pièce ou sur le meuble du bac : refus, rien ne change.
      host().editAt({ kind: 'floor', x: 0, z: 0.1 });
      expect(items()).toHaveLength(2);
      expect(host().decorRefused()).toBe(true);
      fixture.destroy();
      await create();
      expect(items()).toHaveLength(2);
      expect(element().getAttribute(ROOM_COUNT_ATTRIBUTE)).toBe('2');
    });

    it('sélection exclusive avec le décor ; le parquet désélectionne', async () => {
      await editRoom();
      host().setDecorTool('etagere');
      host().editAt({ kind: 'floor', x: SHELF.x, z: SHELF.z });
      host().editAt({ kind: 'item', index: 1 });
      expect(host().decorSelection()).toBe(1);
      expect(host().roomSelection()).toBeNull();
      host().setDecorTool('select');
      host().editAt({ kind: 'room-item', index: 0, x: SHELF.x, z: SHELF.z });
      expect(host().roomSelection()).toBe(0);
      expect(host().decorSelection()).toBeNull();
      host().editAt({ kind: 'floor', x: 1.5, z: 1 });
      expect(host().roomSelection()).toBeNull();
      host().selectRoomItem(7);
      expect(host().roomSelection()).toBeNull();
    });

    it('sélectionner un élément de la pièce ne pose sa sélection qu’une fois (#202)', async () => {
      await editRoom();
      host().setDecorTool('etagere');
      host().editAt({ kind: 'floor', x: SHELF.x, z: SHELF.z });
      host().editAt({ kind: 'item', index: 1 });
      expect(host().decorSelection()).toBe(1);
      const view = viewOf(host());
      const setRoomSelection = vi.spyOn(view, 'setRoomSelection');
      host().selectRoomItem(0);
      expect(setRoomSelection.mock.calls).toEqual([[0]]);
      expect(host().decorSelection()).toBeNull();
      expect(view.decorSelection).toBeNull();
      expect(view.roomSelection).toBe(0);
    });

    it('tourne d’un quart de tour, sans changer la taille ; supprimer fait retomber', async () => {
      await editRoom();
      host().setDecorTool('etagere');
      host().editAt({ kind: 'floor', x: SHELF.x, z: SHELF.z });
      host().setDecorTool('plante-pot');
      host().editAt({ kind: 'room-item', index: 0, x: -1.4, z: -0.17 });
      host().selectRoomItem(0);
      expect(host().scaleSelectedDecor(1)).toBe(false);
      // Un quart de tour : l'étagère (80 × 30) entrerait dans le mur ; un demi-tour passe.
      expect(host().rotateSelectedDecor(1)).toBe(false);
      expect(host().decorRefused()).toBe(true);
      host().selectRoomItem(1);
      expect(host().rotateSelectedDecor(-1)).toBe(true);
      expect(items()[1].quarter).toBe(3);
      expect(items()[1].elevation).toBe(0.8);
      host().selectRoomItem(0);
      expect(host().deleteSelectedDecor()).toBe(true);
      expect(items()).toEqual([{ kind: 'plante-pot', x: -1.4, z: -0.17, quarter: 3 }]);
      expect(host().roomSelection()).toBeNull();
      expect(savedItems()).toEqual(items());
    });

    it('glisser : aperçu de la pose, appliquée au relâchement, sinon pièce rendue', async () => {
      await editRoom();
      host().setDecorTool('etagere');
      host().editAt({ kind: 'floor', x: SHELF.x, z: SHELF.z });
      host().setDecorTool('plante-pot');
      host().editAt({ kind: 'room-item', index: 0, x: -1.4, z: -0.17 });
      const before = host().room();
      host().startRoomDrag(0);
      host().moveRoomDrag(0, -2.2, 0.6);
      // Pendant le geste, la pièce n'est pas encore changée.
      expect(host().room()).toBe(before);
      host().moveRoomDrag(0, 0, 0); // meuble du bac : refusé, aperçu précédent gardé
      host().endRoomDrag(0, true);
      expect(items()).toEqual([
        { ...SHELF, x: -2.2, z: 0.6 },
        { kind: 'plante-pot', x: -1.4, z: -0.17, quarter: 0 },
      ]);
      expect(host().roomSelection()).toBe(0);
      expect(savedItems()).toEqual(items());
      // Geste sans pose acceptée : rien ne change, refus signalé.
      const after = host().room();
      host().startRoomDrag(1);
      host().moveRoomDrag(1, 0, 0);
      host().endRoomDrag(1, true);
      expect(host().room()).toBe(after);
      expect(host().decorRefused()).toBe(true);
      // Abandon et indice inconnu : sans effet.
      host().startRoomDrag(0);
      host().moveRoomDrag(0, 2, 1);
      host().endRoomDrag(0, false);
      expect(host().room()).toBe(after);
      host().startRoomDrag(9);
      host().moveRoomDrag(9, 1, 1);
      host().endRoomDrag(9, true);
      expect(host().room()).toBe(after);
    });

    it('edition-meuble= en capture : élément de la pièce sélectionné', async () => {
      await create('?capture=1&seed=3&piece=1&meubles=etagere:-1.25:-0.17:0&edition-meuble=0');
      expect(host().decorEditing()).toBe(true);
      expect(host().roomSelection()).toBe(0);
      expect(viewOf(host()).roomSelection).toBe(0);
      fixture.destroy();
      await create('?capture=1&seed=3&piece=1&meubles=etagere:-1.25:-0.17:0&edition-meuble=1');
      expect(host().roomSelection()).toBeNull();
      expect(host().decorEditing()).toBe(false);
      fixture.destroy();
      await create('?capture=1&seed=3&meubles=etagere:-1.25:-0.17:0&edition-meuble=0');
      expect(host().roomSelection()).toBeNull();
    });
  });

  describe('édition du décor (#167)', () => {
    const host = () => fixture.componentInstance;
    const element = () => fixture.nativeElement as HTMLElement;

    it('expose le décor ; entrer et sortir du mode édition', async () => {
      await create('?seed=42');
      expect(element().getAttribute(DECOR_COUNT_ATTRIBUTE)).toBe(String(DEFAULT_DECOR.length));
      expect(element().getAttribute(EDITING_ATTRIBUTE)).toBe('false');
      expect(element().getAttribute(DECOR_SELECTION_ATTRIBUTE)).toBe('aucun');
      expect(host().decorEditable()).toBe(true);
      host().setDecorEditing(true);
      expect(host().decorEditing()).toBe(true);
      expect(element().getAttribute(EDITING_ATTRIBUTE)).toBe('true');
      host().editAt({ kind: 'item', index: 1 });
      expect(host().decorSelection()).toBe(1);
      host().setDecorEditing(false);
      expect(host().decorEditing()).toBe(false);
      expect(host().decorSelection()).toBeNull();
    });

    it('hors édition, un clic n’édite rien ; un indice inexistant n’est pas sélectionné', async () => {
      await create('?seed=42');
      host().editAt({ kind: 'sand', x: 0, z: 0.1 });
      host().selectDecor(0);
      expect(host().world!.decor).toEqual(DEFAULT_DECOR);
      expect(host().decorSelection()).toBeNull();
      host().setDecorEditing(true);
      host().selectDecor(DEFAULT_DECOR.length);
      host().selectDecor(-1);
      host().selectDecor(0.5);
      expect(host().decorSelection()).toBeNull();
      expect(host().deleteSelectedDecor()).toBe(false);
    });

    it('sable : pose l’élément de l’outil (sélectionné) ; outil Sélection ou hors du bac : désélectionne', async () => {
      await create('?seed=42');
      host().setDecorEditing(true);
      host().editAt({ kind: 'sand', x: 0, z: 0.1 });
      const world = host().world!;
      expect(world.decor.length).toBe(DEFAULT_DECOR.length + 1);
      expect(world.decor.at(-1)).toMatchObject({ kind: 'rock', x: 0, z: 0.1 });
      expect(world.obstacles.length).toBe(DEFAULT_DECOR.length + 1);
      expect(host().decorSelection()).toBe(DEFAULT_DECOR.length);
      expect(element().getAttribute(DECOR_COUNT_ATTRIBUTE)).toBe(String(DEFAULT_DECOR.length + 1));
      host().editAt(null);
      expect(host().decorSelection()).toBeNull();
      host().setDecorTool('tall');
      host().setDecorTool('inconnu');
      expect(host().decorTool()).toBe('tall');
      host().editAt({ kind: 'sand', x: -0.3, z: 0.1 });
      expect(host().world!.decor.at(-1)).toMatchObject({ kind: 'plant', form: 'tall' });
      host().setDecorTool('select');
      host().editAt({ kind: 'sand', x: 0.2, z: 0.1 });
      expect(host().world!.decor.length).toBe(DEFAULT_DECOR.length + 2);
      expect(host().decorSelection()).toBeNull();
      // Hors des bornes : rien n'est posé.
      host().setDecorTool('rock');
      host().editAt({ kind: 'sand', x: 10, z: 0 });
      expect(host().world!.decor.length).toBe(DEFAULT_DECOR.length + 2);
    });

    it('supprime la sélection et enregistre aussitôt le décor édité', async () => {
      await create();
      host().setDecorEditing(true);
      host().editAt({ kind: 'item', index: 2 });
      expect(host().deleteSelectedDecor()).toBe(true);
      expect(host().decorSelection()).toBeNull();
      expect(host().world!.decor).toEqual(DEFAULT_DECOR.filter((_, n) => n !== 2));
      const saved = parseWorld(saveStorage!.getItem(SAVE_STORAGE_KEY)!);
      expect(saved.ok && saved.world.decor).toEqual(host().world!.decor);
      fixture.destroy();
      await create();
      expect(host().world!.decor).toEqual(DEFAULT_DECOR.filter((_, n) => n !== 2));
    });

    it('environnement non éditable : refusé, et changer d’environnement quitte l’édition', async () => {
      await create('?seed=42');
      host().setDecorEditing(true);
      host().setEnvironment('bassin');
      expect(host().decorEditing()).toBe(false);
      expect(host().decorEditable()).toBe(false);
      host().setDecorEditing(true);
      expect(host().decorEditing()).toBe(false);
    });

    it('tourner et redimensionner la sélection (#168), enregistré aussitôt', async () => {
      await create();
      host().setDecorEditing(true);
      expect(host().rotateSelectedDecor(1)).toBe(false);
      host().editAt({ kind: 'item', index: 2 });
      expect(host().rotateSelectedDecor(1)).toBe(true);
      expect(host().world!.decor[2].rotation).toBeCloseTo(
        DEFAULT_DECOR[2].rotation + DECOR_ROTATION_STEP,
        12,
      );
      expect(host().scaleSelectedDecor(-1)).toBe(true);
      expect(host().world!.decor[2].scale).toBe(DEFAULT_DECOR[2].scale - DECOR_SCALE_STEP);
      // La sélection reste sur l'élément modifié ; les autres sont intacts.
      expect(host().decorSelection()).toBe(2);
      expect(host().world!.decor.filter((_, n) => n !== 2)).toEqual(
        DEFAULT_DECOR.filter((_, n) => n !== 2),
      );
      const saved = parseWorld(saveStorage!.getItem(SAVE_STORAGE_KEY)!);
      expect(saved.ok && saved.world.decor[2].scale).toBe(host().world!.decor[2].scale);
      // À la borne d'échelle : rien ne change, et ce n'est pas un refus.
      while (host().scaleSelectedDecor(-1)) {
        // jusqu'à MIN_DECOR_SCALE
      }
      expect(host().world!.decor[2].scale).toBe(MIN_DECOR_SCALE);
      expect(host().decorRefused()).toBe(false);
    });

    it('agrandir jusqu’à pénétrer un voisin : refusé, signalé, pose inchangée', async () => {
      await create('?seed=42');
      host().setDecorEditing(true);
      host().editAt({ kind: 'item', index: 1 });
      let n = 0;
      while (host().scaleSelectedDecor(1)) {
        n++;
      }
      const decor = host().world!.decor;
      expect(decor[1].scale).toBeLessThan(MAX_DECOR_SCALE);
      expect(host().decorRefused()).toBe(true);
      expect(n).toBeGreaterThan(0);
      // Une sélection efface le refus.
      host().selectDecor(1);
      expect(host().decorRefused()).toBe(false);
    });

    it('glisser : aperçu borné au bac, pose enregistrée au lâcher (#168)', async () => {
      await create();
      host().setDecorEditing(true);
      host().startDecorDrag(2);
      expect(host().decorSelection()).toBe(2);
      host().moveDecorDrag(2, 0.35, 10);
      // Pendant le glissement, le monde n'a pas changé.
      expect(host().world!.decor).toEqual(DEFAULT_DECOR);
      host().endDecorDrag(2, true);
      const rock = host().world!.decor[2];
      expect(rock.x).toBe(0.35);
      expect(rock.z).toBeCloseTo(DEFAULT_TANK.depth / 2 - decorFootprint(rock), 12);
      expect(host().world!.obstacles.length).toBe(DEFAULT_DECOR.length);
      const saved = parseWorld(saveStorage!.getItem(SAVE_STORAGE_KEY)!);
      expect(saved.ok && saved.world.decor[2]).toEqual(rock);
    });

    it('glisser sur un autre élément : refusé, retour à la dernière pose valide', async () => {
      await create('?seed=42');
      host().setDecorEditing(true);
      host().startDecorDrag(2);
      host().moveDecorDrag(2, DEFAULT_DECOR[1].x, DEFAULT_DECOR[1].z);
      host().endDecorDrag(2, true);
      expect(host().world!.decor).toEqual(DEFAULT_DECOR);
      expect(host().decorRefused()).toBe(true);
      // Geste abandonné (commit faux) : rien n'est enregistré, sans refus.
      host().startDecorDrag(2);
      host().moveDecorDrag(2, 0, 0.15);
      host().endDecorDrag(2, false);
      expect(host().world!.decor).toEqual(DEFAULT_DECOR);
      expect(host().decorRefused()).toBe(false);
      // Hors édition ou indice inexistant : ignoré.
      host().setDecorEditing(false);
      host().startDecorDrag(2);
      host().moveDecorDrag(2, 0, 0.15);
      host().endDecorDrag(2, true);
      host().setDecorEditing(true);
      host().startDecorDrag(99);
      host().moveDecorDrag(99, 0, 0.15);
      host().endDecorDrag(99, true);
      expect(host().world!.decor).toEqual(DEFAULT_DECOR);
    });

    it('glisser pendant qu’un élément est supprimé : le glissement est abandonné', async () => {
      await create('?seed=42');
      host().setDecorEditing(true);
      host().startDecorDrag(2);
      host().moveDecorDrag(2, 0, 0.15);
      expect(host().deleteSelectedDecor()).toBe(true);
      host().moveDecorDrag(2, 0, 0.16);
      host().endDecorDrag(2, true);
      expect(host().world!.decor).toEqual(DEFAULT_DECOR.filter((_, n) => n !== 2));
    });

    it('capture : edition=<indice> montre la sélection ; aucune édition possible', async () => {
      await create('?capture=1&seed=42&edition=2');
      expect(host().decorEditing()).toBe(true);
      expect(host().decorSelection()).toBe(2);
      expect(element().getAttribute(DECOR_SELECTION_ATTRIBUTE)).toBe('2');
      fixture.destroy();
      await create('?capture=1&seed=42&edition=99');
      expect(host().decorEditing()).toBe(false);
      expect(host().decorSelection()).toBeNull();
      host().setDecorEditing(true);
      expect(host().decorEditing()).toBe(false);
      fixture.destroy();
      await create('?seed=42&edition=1');
      expect(host().decorEditing()).toBe(false);
    });
  });

  describe('pose par gravité (#170)', () => {
    const host = () => fixture.componentInstance;
    const element = () => fixture.nativeElement as HTMLElement;

    it('charge le moteur une fois, à la première ouverture de l’éditeur seulement', async () => {
      const loader = vi.fn(() => initDecorPhysics());
      TestBed.overrideProvider(DECOR_PHYSICS_LOADER, { useValue: loader });
      await create('?seed=42');
      expect(loader).not.toHaveBeenCalled();
      expect(element().getAttribute(DECOR_PHYSICS_ATTRIBUTE)).toBeNull();
      host().setDecorEditing(true);
      expect(element().getAttribute(DECOR_PHYSICS_ATTRIBUTE)).toBe('chargement');
      await vi.waitFor(() => expect(host().decorPhysics()).toBe('pret'));
      host().setDecorEditing(false);
      host().setDecorEditing(true);
      expect(loader).toHaveBeenCalledTimes(1);
      expect(element().getAttribute(DECOR_PHYSICS_ATTRIBUTE)).toBe('pret');
    });

    it('un rocher lâché sur un autre s’y pose (élévation enregistrée), puis tombe à l’image', async () => {
      TestBed.overrideProvider(DECOR_PHYSICS_LOADER, { useValue: () => initDecorPhysics() });
      await create('?seed=42');
      setCanvasSize(800, 600);
      host().setDecorEditing(true);
      await vi.waitFor(() => expect(host().decorPhysics()).toBe('pret'));
      const target = DEFAULT_DECOR[0];
      host().editAt({ kind: 'sand', x: target.x, z: target.z });
      const world = host().world!;
      const item = world.decor.at(-1)!;
      expect(item.elevation ?? 0).toBeGreaterThan(0.01);
      expect(decorItemsOverlap(item, target)).toBe(false);
      expect(host().decorDropGrounded()).toBe(false);
      const saved = parseWorld(saveStorage!.getItem(SAVE_STORAGE_KEY)!);
      expect(saved.ok && saved.world.decor.at(-1)).toEqual(item);
      // Animation de la chute sur plusieurs images : la pose enregistrée ne bouge pas.
      frames.flush(1000);
      frames.flush(1016);
      frames.flush(5000);
      expect(host().world!.decor.at(-1)).toBe(item);
    });

    /** Rocher ajouté sur `DEFAULT_DECOR[0]` (graine 42), moteur prêt, sélectionné. */
    async function stackedRock(): Promise<{ index: number; item: DecorItem }> {
      TestBed.overrideProvider(DECOR_PHYSICS_LOADER, { useValue: () => initDecorPhysics() });
      await create('?seed=42');
      host().setDecorEditing(true);
      await vi.waitFor(() => expect(host().decorPhysics()).toBe('pret'));
      const target = DEFAULT_DECOR[0];
      host().editAt({ kind: 'sand', x: target.x, z: target.z });
      const index = host().world!.decor.length - 1;
      const item = host().world!.decor[index];
      expect(item.elevation ?? 0).toBeGreaterThan(0.01);
      expect(host().decorSelection()).toBe(index);
      return { index, item };
    }

    /** Vrai si `item`, abaissé de `drop` mètres, pénètre un autre élément de `decor`. */
    function restsOnSupport(decor: readonly DecorItem[], index: number, drop: number): boolean {
      const item = decor[index];
      const lowered = withElevation(item, Math.max(0, (item.elevation ?? 0) - drop));
      return decor.some((other, n) => n !== index && decorItemsOverlap(lowered, other));
    }

    it('réduire un rocher posé sur un autre le fait reposer sur son support, sans vide (#183)', async () => {
      const { index, item } = await stackedRock();
      expect(host().scaleSelectedDecor(-2)).toBe(true);
      const decor = host().world!.decor;
      const rock = decor[index];
      expect(rock.scale).toBe(item.scale - 2 * DECOR_SCALE_STEP);
      expect(rock.elevation ?? 0).toBeGreaterThan(0);
      // Posé : il ne pénètre rien, mais 3 mm plus bas il pénétrerait son support (contact du
      // moteur à `DROP_SKIN` près).
      expect(decor.every((other, n) => n === index || !decorItemsOverlap(rock, other))).toBe(true);
      expect(restsOnSupport(decor, index, 0.003)).toBe(true);
      expect(rock.elevation!).toBeLessThan(item.elevation!);
      // Sans nouvelle chute, la réduction l'aurait laissé au-dessus d'un vide.
      const kept = decor.map((other, n) =>
        n === index ? { ...rock, elevation: item.elevation } : other,
      );
      expect(restsOnSupport(kept, index, 0.003)).toBe(false);
      // Pose enregistrée telle quelle, puis chute affichée sans la modifier.
      const saved = parseWorld(saveStorage!.getItem(SAVE_STORAGE_KEY)!);
      expect(saved.ok && saved.world.decor[index]).toEqual(rock);
      frames.flush(1000);
      frames.flush(5000);
      expect(host().world!.decor[index]).toBe(rock);
    });

    it('tourner un élément posé sur un autre : il retombe et reste posé, sans vide (#183)', async () => {
      const { index } = await stackedRock();
      expect(host().rotateSelectedDecor(3)).toBe(true);
      const decor = host().world!.decor;
      expect(
        decor.every((other, n) => n === index || !decorItemsOverlap(decor[index], other)),
      ).toBe(true);
      const elevation = decor[index].elevation ?? 0;
      expect(elevation === 0 || restsOnSupport(decor, index, 0.003)).toBe(true);
    });

    it('un élément sur le sable tourné ou redimensionné garde exactement sa pose (#183)', async () => {
      TestBed.overrideProvider(DECOR_PHYSICS_LOADER, { useValue: () => initDecorPhysics() });
      await create('?seed=42');
      host().setDecorEditing(true);
      await vi.waitFor(() => expect(host().decorPhysics()).toBe('pret'));
      host().editAt({ kind: 'item', index: 2 });
      expect(host().rotateSelectedDecor(1)).toBe(true);
      expect(host().scaleSelectedDecor(-1)).toBe(true);
      const rock = host().world!.decor[2];
      expect(rock).not.toHaveProperty('elevation');
      expect([rock.x, rock.z]).toEqual([DEFAULT_DECOR[2].x, DEFAULT_DECOR[2].z]);
      expect(rock.rotation).toBeCloseTo(DEFAULT_DECOR[2].rotation + DECOR_ROTATION_STEP, 12);
      expect(rock.scale).toBe(DEFAULT_DECOR[2].scale - DECOR_SCALE_STEP);
    });

    it('moteur indisponible : posé sur le sable à la position du lâcher, avec un message', async () => {
      TestBed.overrideProvider(DECOR_PHYSICS_LOADER, {
        useValue: () => Promise.reject(new Error('hors ligne')),
      });
      await create('?seed=42');
      host().setDecorEditing(true);
      await vi.waitFor(() => expect(host().decorPhysics()).toBe('indisponible'));
      expect(element().getAttribute(DECOR_PHYSICS_ATTRIBUTE)).toBe('indisponible');
      host().editAt({ kind: 'sand', x: 0, z: 0.1 });
      expect(host().world!.decor.at(-1)).toMatchObject({ kind: 'rock', x: 0, z: 0.1 });
      expect(host().world!.decor.at(-1)).not.toHaveProperty('elevation');
      expect(host().decorDropGrounded()).toBe(true);
    });
  });
});
