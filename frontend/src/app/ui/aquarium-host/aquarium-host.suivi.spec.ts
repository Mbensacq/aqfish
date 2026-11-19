import { TestBed, type ComponentFixture } from '@angular/core/testing';

import { resetCaptureReady } from '../../core/capture/capture-ready';
import { RENDER_FILTER_STORAGE_KEY } from '../../core/render-filter/render-filter';
import { FREE_CAMERA_STORAGE_KEY } from '../../core/free-camera-pref/free-camera-pref';
import { SAVE_STORAGE_KEY, type SaveStorage } from '../../core/save-storage/save-storage';
import type { AquariumRenderer } from '../../render/aquarium-view';
import {
  AQUARIUM_RENDERER_FACTORY,
  AquariumHost,
  DECOR_PHYSICS_LOADER,
  SAVE_STORAGE,
} from './aquarium-host';

/**
 * Caractérisation du suivi du bac vu de l'hôte (#696) : calendrier d'entretien publié, tâche
 * marquée faite, début du suivi inscrit à la sauvegarde automatique seulement une fois le bac
 * avancé, rien en capture. Référence du déplacement du suivi (entretien, historique, journal,
 * parcours) dans son contrôleur : rien ne doit changer.
 */

/** Double du renderer WebGL (jsdom n'a pas WebGL). */
class FakeRenderer implements AquariumRenderer {
  constructor(readonly canvas: HTMLCanvasElement) {}
  setPixelRatio(ratio: number): void {
    void ratio;
  }
  setSize(width: number, height: number): void {
    void width;
    void height;
  }
  setRenderTarget(target: unknown): void {
    void target;
  }
  render(): void {
    void this.canvas;
  }
  dispose(): void {
    void this.canvas;
  }
}

/** Stockage en mémoire de la sauvegarde automatique. */
class MemoryStorage implements SaveStorage {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
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
  flush(timestamp: number): void {
    const callbacks = [...this.pending.values()];
    this.pending.clear();
    callbacks.forEach((cb) => cb(timestamp));
  }
}

describe('AquariumHost : suivi du bac (caractérisation, #696)', () => {
  let fixture: ComponentFixture<AquariumHost>;
  let storage: MemoryStorage;
  let frames: FrameQueue;
  const host = () => fixture.componentInstance;
  const savedWorld = () =>
    JSON.parse(storage.getItem(SAVE_STORAGE_KEY)!).tanks[0].world as Record<string, unknown>;

  async function create(search: string): Promise<void> {
    window.history.replaceState(null, '', `/${search}`);
    fixture = TestBed.createComponent(AquariumHost);
    await fixture.whenStable();
    const canvas = fixture.nativeElement.querySelector('canvas') as HTMLCanvasElement;
    Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 640 });
    Object.defineProperty(canvas, 'clientHeight', { configurable: true, value: 480 });
  }

  /** Fait tourner l'application jusqu'au pas `tick` au moins. */
  function runTo(tick: number): void {
    for (let now = 0; (host().world?.tick ?? 0) < tick && now < 10_000; now += 20) {
      frames.flush(now);
    }
  }

  beforeEach(() => {
    resetCaptureReady();
    storage = new MemoryStorage();
    frames = new FrameQueue();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(frames.request);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(frames.cancel);
    TestBed.configureTestingModule({
      imports: [AquariumHost],
      providers: [
        { provide: SAVE_STORAGE, useFactory: () => storage },
        {
          provide: AQUARIUM_RENDERER_FACTORY,
          useValue: (canvas: HTMLCanvasElement) => new FakeRenderer(canvas),
        },
        { provide: DECOR_PHYSICS_LOADER, useValue: () => new Promise<never>(() => undefined) },
      ],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetCaptureReady();
    window.history.replaceState(null, '', '/');
    window.localStorage.removeItem(RENDER_FILTER_STORAGE_KEY);
    window.localStorage.removeItem(FREE_CAMERA_STORAGE_KEY);
  });

  it('calendrier publié dès le démarrage, hors du monde', async () => {
    await create('?seed=42&vitesse=0');
    frames.flush(0);
    const readout = host().maintenance();
    expect(readout).not.toBeNull();
    expect(readout!.items.map((item) => item.task)).toContain('waterChange');
    expect(readout!.log).toEqual([]);
    expect(host().world!.maintenance).toBeUndefined();
  });

  it('tâche marquée faite : écrite dans le monde, au journal du calendrier, publiée', async () => {
    await create('?seed=42&vitesse=0');
    frames.flush(0);
    host().markMaintenanceDone('filter');
    const world = host().world!;
    expect(world.maintenance?.lastDone.filter).toBe(world.time);
    expect(world.maintenance?.log).toHaveLength(1);
    expect(host().maintenance()!.log).toHaveLength(1);
    expect(savedWorld()['maintenance']).toEqual(JSON.parse(JSON.stringify(world.maintenance)));
  });

  it('sauvegarde automatique : début du suivi inscrit une fois le bac avancé', async () => {
    await create('?seed=42');
    runTo(40);
    expect(host().world!.maintenance).toBeUndefined();
    window.dispatchEvent(new Event('pagehide'));
    const maintenance = host().world!.maintenance;
    expect(maintenance).toBeDefined();
    expect(maintenance!.log).toEqual([]);
    expect(maintenance!.lastDone.waterChange).toBeLessThan(host().world!.time);
    expect(savedWorld()['maintenance']).toEqual(JSON.parse(JSON.stringify(maintenance)));
  }, 30_000);

  it('sauvegarde automatique à monde figé : rien d’inscrit, le bac reste identique', async () => {
    await create('?seed=42&vitesse=0');
    frames.flush(0);
    window.dispatchEvent(new Event('pagehide'));
    expect(host().world!.maintenance).toBeUndefined();
    expect(savedWorld()['maintenance']).toBeUndefined();
    expect(savedWorld()['firstTankPath']).toBeUndefined();
  });

  it('en capture : aucun calendrier, monde inchangé', async () => {
    await create('?capture=1&seed=42&time=1');
    frames.flush(0);
    host().markMaintenanceDone('filter');
    expect(host().maintenance()).toBeNull();
    expect(host().world!.maintenance).toBeUndefined();
  });
});
