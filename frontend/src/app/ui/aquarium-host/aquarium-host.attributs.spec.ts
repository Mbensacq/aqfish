import { TestBed, type ComponentFixture } from '@angular/core/testing';

import { resetCaptureReady } from '../../core/capture/capture-ready';
import { RENDER_FILTER_STORAGE_KEY } from '../../core/render-filter/render-filter';
import { FREE_CAMERA_STORAGE_KEY } from '../../core/free-camera-pref/free-camera-pref';
import type { SaveStorage } from '../../core/save-storage/save-storage';
import type { AquariumRenderer } from '../../render/aquarium-view';
import {
  AQUARIUM_RENDERER_FACTORY,
  AquariumHost,
  DECOR_PHYSICS_LOADER,
  SAVE_STORAGE,
} from './aquarium-host';

/**
 * Caractérisation des attributs `data-aqfish-*` publiés par l'hôte (#693) : liste et valeurs,
 * graine fixe, après quelques images et quelques gestes. Référence du déplacement des
 * publications dans la sonde (`aquarium-probe.ts`) : aucun attribut ajouté, retiré ou modifié.
 */

/** Double du renderer WebGL (jsdom n'a pas WebGL). */
class FakeRenderer implements AquariumRenderer {
  renders = 0;
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
    this.renders++;
  }
  dispose(): void {
    this.renders = 0;
  }
}

/** Stockage en mémoire de la sauvegarde automatique. */
class MemoryStorage implements SaveStorage {
  private readonly data = new Map<string, string>();
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
  flush(timestamp: number): void {
    const callbacks = [...this.pending.values()];
    this.pending.clear();
    callbacks.forEach((cb) => cb(timestamp));
  }
}

/** Attributs `data-aqfish-*` de l'élément, triés par nom. */
function aqfishAttributes(element: HTMLElement): Record<string, string> {
  const entries = element
    .getAttributeNames()
    .filter((name) => name.startsWith('data-aqfish-'))
    .sort()
    .map((name) => [name, element.getAttribute(name) ?? ''] as const);
  return Object.fromEntries(entries);
}

describe('AquariumHost : attributs publiés (caractérisation, #693)', () => {
  let frames: FrameQueue;
  let fixture: ComponentFixture<AquariumHost>;

  async function create(search: string): Promise<void> {
    window.history.replaceState(null, '', `/${search}`);
    fixture = TestBed.createComponent(AquariumHost);
    await fixture.whenStable();
    const canvas = fixture.nativeElement.querySelector('canvas') as HTMLCanvasElement;
    Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 320 });
    Object.defineProperty(canvas, 'clientHeight', { configurable: true, value: 240 });
  }

  /** Avance de `count` images de 16 ms à partir de `start`, en ms. */
  function run(start: number, count: number): void {
    for (let n = 0; n < count; n++) {
      frames.flush(start + n * 16);
    }
  }

  beforeEach(() => {
    resetCaptureReady();
    window.localStorage.clear();
    frames = new FrameQueue();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(frames.request);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(frames.cancel);
    TestBed.configureTestingModule({
      imports: [AquariumHost],
      providers: [
        { provide: SAVE_STORAGE, useFactory: () => new MemoryStorage() },
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

  it('relevé interactif : attributs après le démarrage, une seconde et des gestes', async () => {
    await create('?seed=7');
    run(0, 70);
    const element = fixture.nativeElement as HTMLElement;
    const started = aqfishAttributes(element);
    const host = fixture.componentInstance;
    host.setSpeed(2);
    host.setDecorVisible(false);
    host.cycleCurrent();
    host.toggleFoodStyle();
    host.toggleScraper();
    host.togglePruner();
    host.setDecorEditing(true);
    host.selectDecor(0);
    host.highlightAlertAnimals([1, 2]);
    host.setRain(true);
    host.setRoomShown(false);
    host.toggleFilter();
    host.feedAtCenter();
    run(2000, 40);
    const after = aqfishAttributes(element);
    expect(started).toEqual({
      'data-aqfish-algae': '0;0;8',
      'data-aqfish-bacteries': '100',
      'data-aqfish-camera': '1.079,1.091,1.438',
      'data-aqfish-camera-libre': 'false',
      'data-aqfish-capacity': '63',
      'data-aqfish-catappa': '0;0',
      'data-aqfish-current': 'coupe',
      'data-aqfish-decor': 'true',
      'data-aqfish-decor-count': '10',
      'data-aqfish-decor-selected': 'aucun',
      'data-aqfish-editing': 'false',
      'data-aqfish-environment': 'tropical',
      'data-aqfish-feeder': 'aucun',
      'data-aqfish-filter': 'pixel',
      'data-aqfish-food': '0',
      'data-aqfish-food-style': 'voxels',
      'data-aqfish-fouling': '0;0',
      'data-aqfish-fouling-cells': '0;0',
      'data-aqfish-hour': '12.02',
      'data-aqfish-hour-frozen': 'false',
      'data-aqfish-lamp': '1.00',
      'data-aqfish-mode': 'soins',
      'data-aqfish-mouvements-reduits': 'false',
      'data-aqfish-ph': '7;ideal',
      'data-aqfish-plants': '0,0,0;100',
      'data-aqfish-population':
        'neon:12,guppy:6,corydora:6,rasbora:0,tetra:0,kuhli:0,gourami:0,platy:0,danio:0,ancistrus:0,otocinclus:0,braise:0,molly:0,miel:0,xipho:0,cerise:0,neritine:0',
      'data-aqfish-rain': 'false',
      'data-aqfish-rayons': '1.00;1',
      'data-aqfish-room': 'false',
      'data-aqfish-room-count': '0',
      'data-aqfish-room-selected': 'aucun',
      'data-aqfish-room-supports': '0',
      'data-aqfish-room-tanks': '1',
      'data-aqfish-save': 'active',
      'data-aqfish-seed': '7',
      'data-aqfish-selected-tank': '0',
      'data-aqfish-shape': 'rectangle',
      'data-aqfish-speed': '1',
      'data-aqfish-tank': '1.2:0.6:0.5',
      'data-aqfish-target': '0.000,0.300,0.000',
      'data-aqfish-tick': '66',
      'data-aqfish-water': 'bonne;24;24;0;0;0',
    });
    expect(after).toEqual({
      'data-aqfish-algae': '0;0;8',
      'data-aqfish-animaux-signales': '2',
      'data-aqfish-bacteries': '100',
      'data-aqfish-camera': '1.079,1.091,1.438',
      'data-aqfish-camera-libre': 'false',
      'data-aqfish-capacity': '63',
      'data-aqfish-catappa': '0;0',
      'data-aqfish-current': 'doux',
      'data-aqfish-decor': 'true',
      'data-aqfish-decor-count': '10',
      'data-aqfish-decor-physics': 'chargement',
      'data-aqfish-decor-selected': '0',
      'data-aqfish-editing': 'true',
      'data-aqfish-environment': 'tropical',
      'data-aqfish-feeder': 'aucun',
      'data-aqfish-filter': 'aucun',
      'data-aqfish-food': '5',
      'data-aqfish-food-style': 'points',
      'data-aqfish-fouling': '0;0',
      'data-aqfish-fouling-cells': '0;0',
      'data-aqfish-hour': '12.05',
      'data-aqfish-hour-frozen': 'false',
      'data-aqfish-lamp': '1.00',
      'data-aqfish-mode': 'soins',
      'data-aqfish-mouvements-reduits': 'false',
      'data-aqfish-ph': '7;ideal',
      'data-aqfish-plants': '0,0,0;100',
      'data-aqfish-population':
        'neon:12,guppy:6,corydora:6,rasbora:0,tetra:0,kuhli:0,gourami:0,platy:0,danio:0,ancistrus:0,otocinclus:0,braise:0,molly:0,miel:0,xipho:0,cerise:0,neritine:0',
      'data-aqfish-pruner': 'true',
      'data-aqfish-rain': 'false',
      'data-aqfish-rayons': '1.00;2',
      'data-aqfish-room': 'false',
      'data-aqfish-room-count': '0',
      'data-aqfish-room-selected': 'aucun',
      'data-aqfish-room-supports': '0',
      'data-aqfish-room-tanks': '1',
      'data-aqfish-save': 'active',
      'data-aqfish-scraper': 'false',
      'data-aqfish-seed': '7',
      'data-aqfish-selected-tank': '0',
      'data-aqfish-shape': 'rectangle',
      'data-aqfish-speed': '2',
      'data-aqfish-tank': '1.2:0.6:0.5',
      'data-aqfish-target': '0.000,0.300,0.000',
      'data-aqfish-tick': '151',
      'data-aqfish-water': 'bonne;24;24;0;0;0',
    });
  });

  it("relevé interactif : bassin, pluie, pièce, traitement et séance d'entretien", async () => {
    await create('?seed=11');
    run(0, 10);
    const host = fixture.componentInstance;
    host.treat('medicament');
    host.openCareSession();
    host.setEnvironment('bassin');
    host.setRain(true);
    host.setRoomShown(true);
    host.selectRoomItem(0);
    run(1000, 40);
    const after = aqfishAttributes(fixture.nativeElement as HTMLElement);
    expect(after).toEqual({
      'data-aqfish-algae': '0;0;8',
      'data-aqfish-bacteries': '100',
      'data-aqfish-camera': '0.000,3.594,0.003',
      'data-aqfish-camera-libre': 'false',
      'data-aqfish-capacity': '86',
      'data-aqfish-care-session': 'vitres',
      'data-aqfish-catappa': '0;0',
      'data-aqfish-current': 'coupe',
      'data-aqfish-decor': 'true',
      'data-aqfish-decor-count': '4',
      'data-aqfish-decor-selected': 'aucun',
      'data-aqfish-editing': 'false',
      'data-aqfish-environment': 'bassin',
      'data-aqfish-feeder': 'aucun',
      'data-aqfish-filter': 'pixel',
      'data-aqfish-food': '0',
      'data-aqfish-food-style': 'voxels',
      'data-aqfish-fouling': '0;0',
      'data-aqfish-fouling-cells': '0;0',
      'data-aqfish-hour': '12.02',
      'data-aqfish-hour-frozen': 'false',
      'data-aqfish-lamp': '0.00',
      'data-aqfish-mode': 'soins',
      'data-aqfish-mouvements-reduits': 'false',
      'data-aqfish-ph': '7.5;ideal',
      'data-aqfish-plants': ';100',
      'data-aqfish-population': 'koi:3,rouge:0',
      'data-aqfish-rain': 'true',
      'data-aqfish-rayons': '0.68;0',
      'data-aqfish-room': 'false',
      'data-aqfish-room-count': '0',
      'data-aqfish-room-selected': 'aucun',
      'data-aqfish-room-supports': '0',
      'data-aqfish-room-tanks': '2',
      'data-aqfish-save': 'active',
      'data-aqfish-scraper': 'true',
      'data-aqfish-seed': '11',
      'data-aqfish-selected-tank': '1',
      'data-aqfish-shape': 'rectangle',
      'data-aqfish-speed': '1',
      'data-aqfish-tank': '2:0.4:1.4',
      'data-aqfish-target': '0.000,0.200,0.000',
      'data-aqfish-tick': '42',
      // Bassin (#858, ADR 0186) : température visée saisonnière, 18,06 °C au 19 mai.
      'data-aqfish-water': 'bonne;18;18.1;0;0;0',
    });
  });

  it('relevé de capture : attributs de la première image', async () => {
    await create('?capture=1&seed=7&heure=10');
    run(0, 3);
    const captured = aqfishAttributes(fixture.nativeElement as HTMLElement);
    expect(captured).toEqual({
      'data-aqfish-algae': '0;0;8',
      'data-aqfish-bacteries': '100',
      'data-aqfish-camera': '1.079,1.091,1.438',
      'data-aqfish-camera-libre': 'false',
      'data-aqfish-capacity': '63',
      'data-aqfish-catappa': '0;0',
      'data-aqfish-current': 'coupe',
      'data-aqfish-decor': 'true',
      'data-aqfish-decor-count': '10',
      'data-aqfish-decor-selected': 'aucun',
      'data-aqfish-editing': 'false',
      'data-aqfish-environment': 'tropical',
      'data-aqfish-feeder': 'aucun',
      'data-aqfish-filter': 'pixel',
      'data-aqfish-food': '0',
      'data-aqfish-food-style': 'voxels',
      'data-aqfish-fouling': '0;0',
      'data-aqfish-fouling-cells': '0;0',
      'data-aqfish-hour': '10.00',
      'data-aqfish-hour-frozen': 'true',
      'data-aqfish-lamp': '0.00',
      'data-aqfish-mode': 'soins',
      'data-aqfish-mouvements-reduits': 'false',
      'data-aqfish-ph': '7;ideal',
      'data-aqfish-plants': '0,0,0;100',
      'data-aqfish-population':
        'neon:12,guppy:6,corydora:6,rasbora:0,tetra:0,kuhli:0,gourami:0,platy:0,danio:0,ancistrus:0,otocinclus:0,braise:0,molly:0,miel:0,xipho:0,cerise:0,neritine:0',
      'data-aqfish-rain': 'false',
      'data-aqfish-rayons': '1.00;0',
      'data-aqfish-room': 'false',
      'data-aqfish-room-count': '0',
      'data-aqfish-room-selected': 'aucun',
      'data-aqfish-room-supports': '0',
      'data-aqfish-room-tanks': '1',
      'data-aqfish-seed': '7',
      'data-aqfish-shape': 'rectangle',
      'data-aqfish-speed': '1',
      'data-aqfish-tank': '1.2:0.6:0.5',
      'data-aqfish-target': '0.000,0.300,0.000',
      'data-aqfish-tick': '0',
      'data-aqfish-water': 'bonne;24;24;0;0;0',
    });
  });
});
