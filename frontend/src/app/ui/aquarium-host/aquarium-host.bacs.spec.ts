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
 * Caractérisation des bacs de la pièce vus de l'hôte (#696) : quarantaine installée, soin et
 * amorce dans un bac posé seul, transfert et retour d'un animal, refus. Référence du
 * déplacement des bacs de la pièce dans leur contrôleur : rien ne doit changer.
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

describe('AquariumHost : bacs de la pièce (caractérisation, #696)', () => {
  let fixture: ComponentFixture<AquariumHost>;
  let storage: MemoryStorage;
  let frames: FrameQueue;
  const host = () => fixture.componentInstance;
  const notice = () => host().tankNotice();
  const count = (species: string) =>
    host().world!.entities.filter((entity) => entity.species === species).length;

  async function create(search: string): Promise<void> {
    window.history.replaceState(null, '', `/${search}`);
    fixture = TestBed.createComponent(AquariumHost);
    await fixture.whenStable();
    const canvas = fixture.nativeElement.querySelector('canvas') as HTMLCanvasElement;
    Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 640 });
    Object.defineProperty(canvas, 'clientHeight', { configurable: true, value: 480 });
    frames.flush(0);
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

  it('quarantine installée : bac posé vide, liste et vue de la quarantaine à jour', async () => {
    await create('?seed=42&vitesse=0&points-blancs=1');
    expect(host().quarantine()).toEqual({ tanks: [], sickHere: 24 });
    host().installQuarantine();
    expect(notice()).toEqual({
      kind: 'info',
      text: 'Bac « Quarantaine » installé : laissez mûrir son filtre avant d’y mettre un animal',
    });
    expect(
      host()
        .tankList()
        .map((tank) => [tank.id, tank.name, tank.selectable]),
    ).toEqual([
      [0, 'Bac tropical', true],
      [1, 'Quarantaine', false],
    ]);
    expect(host().quarantine()).toEqual({
      tanks: [{ id: 1, name: 'Quarantaine', species: [], sick: 0, filter: 5 }],
      sickHere: 24,
    });
    host().selectTank(1);
    expect(notice()).toEqual({
      kind: 'erreur',
      text: '« Quarantaine » est posé dans la pièce : pas encore sélectionnable',
    });
  });

  it('transfert, soin et amorce dans la quarantaine seule, puis retour avec le rappel', async () => {
    await create('?seed=42&vitesse=0&points-blancs=1');
    host().installQuarantine();
    const before = count('neon');
    host().transferAnimal('neon', 1);
    expect(notice()).toEqual({
      kind: 'info',
      text: 'Néon transféré dans « Quarantaine ». Groupe trop petit : 1 néon, 6 au moins conseillés',
    });
    expect(count('neon')).toBe(before - 1);
    expect(host().quarantine().tanks[0]).toEqual({
      id: 1,
      name: 'Quarantaine',
      species: ['neon'],
      sick: 1,
      filter: 5,
    });
    const shownWater = JSON.stringify(host().world!.water);
    host().treatPlacedTank(1, 'medicament');
    expect(notice()).toEqual({
      kind: 'info',
      text: "« Quarantaine » : Dose ajoutée (1,0 dans l'eau) : redoser tous les deux jours, jusqu'à la fin.",
    });
    host().treatPlacedTank(1, 'medicament');
    expect(notice()?.kind).toBe('erreur');
    expect(notice()?.text).toMatch(/^Surdosage refusé/);
    host().doseStarterInPlacedTank(1);
    expect(notice()?.kind).toBe('info');
    expect(notice()?.text).toMatch(/^« Quarantaine » : Amorce de bactéries versée/);
    expect(JSON.stringify(host().world!.water)).toBe(shownWater);
    host().returnAnimal(1, 'neon');
    expect(notice()).toEqual({
      kind: 'info',
      text: 'Néon ramené dans « Bac tropical ». Acclimatation : mélangez lentement les deux eaux plutôt que de le verser d’un coup',
    });
    expect(count('neon')).toBe(before);
    const saved = JSON.parse(storage.getItem(SAVE_STORAGE_KEY)!) as {
      tanks: { id: number; name: string }[];
    };
    expect(saved.tanks.map((tank) => [tank.id, tank.name])).toEqual([
      [0, 'Bac tropical'],
      [1, 'Quarantaine'],
    ]);
  });

  it('refus : aucun animal, bac affiché visé, nom vide, bassin au jardin', async () => {
    await create('?seed=42&vitesse=0');
    host().installQuarantine();
    host().returnAnimal(1, 'neon');
    expect(notice()).toEqual({ kind: 'erreur', text: 'Aucun animal de cette espèce ici' });
    host().transferAnimal('koi', 1);
    expect(notice()).toEqual({ kind: 'erreur', text: 'Aucun animal de cette espèce ici' });
    host().renameTank(1, '');
    expect(notice()).toEqual({ kind: 'erreur', text: 'Nom refusé : de 1 à 40 caractères' });
    host().treatPlacedTank(0, 'medicament');
    host().doseStarterInPlacedTank(0);
    expect(notice()).toEqual({ kind: 'erreur', text: 'Nom refusé : de 1 à 40 caractères' });
    host().setEnvironment('bassin');
    host().installQuarantine();
    expect(notice()).toEqual({
      kind: 'erreur',
      text: 'Le bassin est au jardin : installez la quarantaine depuis un bac de la pièce',
    });
  });

  it('en capture : aucune liste, aucune quarantaine', async () => {
    await create('?capture=1&seed=42&time=1');
    host().installQuarantine();
    expect(host().tankList()).toEqual([]);
    expect(notice()).toBeNull();
  });
});
