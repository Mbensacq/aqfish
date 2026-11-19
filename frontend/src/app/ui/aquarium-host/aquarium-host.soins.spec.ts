import { TestBed, type ComponentFixture } from '@angular/core/testing';

import { resetCaptureReady } from '../../core/capture/capture-ready';
import { RENDER_FILTER_STORAGE_KEY } from '../../core/render-filter/render-filter';
import { FREE_CAMERA_STORAGE_KEY } from '../../core/free-camera-pref/free-camera-pref';
import { SAVE_STORAGE_KEY, type SaveStorage } from '../../core/save-storage/save-storage';
import type { AquariumRenderer } from '../../render/aquarium-view';
import { WATER_TEST_TICKS } from '../../sim/water-test';
import {
  AQUARIUM_RENDERER_FACTORY,
  AquariumHost,
  DECOR_PHYSICS_LOADER,
  SAVE_STORAGE,
} from './aquarium-host';

/**
 * Caractérisation des soins de l’eau vus de l’hôte (#696) : test de l’eau, charbon,
 * régulateur de pH, amorce de bactéries et eau du robinet : messages, relevés, sauvegarde,
 * sans effet en capture ou en mode décor. Référence du déplacement des soins de l’eau dans
 * leur contrôleur : rien ne doit changer.
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

describe('AquariumHost : soins de l’eau (caractérisation, #696)', () => {
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
    for (let now = 0; (host().world?.tick ?? 0) < tick && now < 120_000; now += 20) {
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

  it('test de l’eau : lancé hors du monde, refusé tant qu’il court, prêt après son délai', async () => {
    await create('?seed=42&vitesse=4');
    frames.flush(0);
    expect(host().waterTest()).toBeNull();
    const before = JSON.stringify(host().world);
    host().startWaterTest('ph');
    expect(host().waterTest()).toMatchObject({ kit: 'ph', done: false, results: [] });
    expect(JSON.stringify(host().world)).toBe(before);
    const startTick = host().waterTest()!.startTick;
    host().startWaterTest('nitrates');
    expect(host().waterTest()).toMatchObject({ kit: 'ph', startTick });
    runTo(startTick + WATER_TEST_TICKS);
    // Relevé forcé : la boucle relève l'eau à cadence limitée.
    (host() as unknown as { refreshWater: () => void }).refreshWater();
    expect(host().waterTest()).toMatchObject({ kit: 'ph', done: true, remainingSeconds: 0 });
    expect(host().waterTest()!.results.length).toBeGreaterThan(0);
    host().startWaterTest('nitrates');
    expect(host().waterTest()).toMatchObject({ kit: 'nitrates', done: false });
    expect(JSON.stringify(host().world)).not.toContain('waterTest');
  }, 30_000);

  it('test-eau= : résultat prêt dès le démarrage, hors capture seulement', async () => {
    await create('?seed=42&vitesse=0&test-eau=durete');
    frames.flush(0);
    expect(host().waterTest()).toMatchObject({ kit: 'durete', done: true });
  });

  it('charbon actif : posé puis retiré, message toujours accepté, enregistré', async () => {
    await create('?seed=42&vitesse=0');
    frames.flush(0);
    host().toggleCarbon();
    expect(host().world!.water.carbon).toBe(true);
    expect(host().carbon()).toBe(true);
    expect(host().treatmentNotice()).toMatchObject({ ok: true, text: expect.any(String) });
    expect((savedWorld()['water'] as Record<string, unknown>)['carbon']).toBe(true);
    host().toggleCarbon();
    expect(host().world!.water.carbon).not.toBe(true);
    expect(host().carbon()).toBe(false);
    expect(host().treatmentNotice()).toMatchObject({ ok: true });
  });

  it('régulateur de pH : dose acceptée ou refusée avec un message', async () => {
    await create('?seed=42&vitesse=0');
    frames.flush(0);
    const notices: boolean[] = [];
    for (let n = 0; n < 12; n++) {
      host().dosePhRegulator(-1);
      notices.push(host().treatmentNotice()!.ok);
    }
    expect(notices[0]).toBe(true);
    expect(notices).toContain(false);
    const refused = host().treatmentNotice();
    expect(refused).toMatchObject({ ok: false, warning: null });
    expect(refused!.text.length).toBeGreaterThan(0);
  });

  it('amorce de bactéries : refusée sur un filtre mûr, acceptée sur un filtre faible', async () => {
    await create('?seed=42&vitesse=0');
    frames.flush(0);
    const before = JSON.stringify(host().world);
    host().doseBacteriaStarter();
    expect(host().treatmentNotice()).toMatchObject({ ok: false, warning: null });
    expect(host().treatmentNotice()!.text).toContain('Filtre déjà mûr');
    expect(JSON.stringify(host().world)).toBe(before);
    (host().world! as { water: object }).water = { ...host().world!.water, filter: 0.2 };
    host().doseBacteriaStarter();
    expect(host().treatmentNotice()).toMatchObject({ ok: true, warning: null });
    expect(host().world!.water.bacteriaStarter).toBeGreaterThan(0);
    const saved = savedWorld()['water'] as Record<string, unknown>;
    expect(saved['bacteriaStarter']).toBe(host().world!.water.bacteriaStarter);
  });

  it('eau du robinet : non traitée puis traitée, enregistrée, sans message', async () => {
    await create('?seed=42&vitesse=0');
    frames.flush(0);
    host().toggleUntreatedTap();
    expect(host().untreatedTap()).toBe(true);
    expect((savedWorld()['water'] as Record<string, unknown>)['untreatedTap']).toBe(true);
    expect(host().treatmentNotice()).toBeNull();
    host().toggleUntreatedTap();
    expect(host().untreatedTap()).toBe(false);
  });

  it('message de soin effacé au changement de bac', async () => {
    await create('?seed=42&vitesse=0');
    frames.flush(0);
    host().toggleCarbon();
    expect(host().treatmentNotice()).not.toBeNull();
    host().setEnvironment('bassin');
    expect(host().treatmentNotice()).toBeNull();
  });

  it('mode décor : soins sans effet, test de l’eau toujours possible', async () => {
    await create('?seed=42&vitesse=0');
    frames.flush(0);
    host().setCareMode('decor');
    const before = JSON.stringify(host().world);
    host().toggleCarbon();
    host().dosePhRegulator(1);
    host().doseBacteriaStarter();
    host().doseConditioner('thiosulfate');
    host().toggleUntreatedTap();
    host().treat('medicament');
    expect(JSON.stringify(host().world)).toBe(before);
    expect(host().treatmentNotice()).toBeNull();
    host().startWaterTest('ph');
    expect(host().waterTest()).toMatchObject({ kit: 'ph' });
  });

  it('en capture : aucun soin, aucun test, monde inchangé', async () => {
    await create('?capture=1&seed=42&time=1&test-eau=ph');
    frames.flush(0);
    const before = JSON.stringify(host().world);
    host().startWaterTest('ph');
    host().toggleCarbon();
    host().dosePhRegulator(1);
    host().doseBacteriaStarter();
    host().doseConditioner('thiosulfate');
    host().toggleUntreatedTap();
    expect(JSON.stringify(host().world)).toBe(before);
    expect(host().waterTest()).toBeNull();
    expect(host().treatmentNotice()).toBeNull();
    expect(host().pharmacy()).toMatchObject({ active: [], used: [] });
  });
});
