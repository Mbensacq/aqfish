import { TestBed, type ComponentFixture } from '@angular/core/testing';

import { resetCaptureReady } from '../../core/capture/capture-ready';
import { initDecorPhysics, type DecorDropper } from '../../core/decor-physics/decor-physics';
import { FREE_CAMERA_STORAGE_KEY } from '../../core/free-camera-pref/free-camera-pref';
import { RENDER_FILTER_STORAGE_KEY } from '../../core/render-filter/render-filter';
import { SAVE_STORAGE_KEY, type SaveStorage } from '../../core/save-storage/save-storage';
import { AquariumView, type AquariumRenderer } from '../../render/aquarium-view';
import { DEFAULT_DECOR } from '../../sim/decor';
import { parseSaveWorlds } from '../../sim/room-save';
import {
  AQUARIUM_RENDERER_FACTORY,
  AquariumHost,
  DECOR_PHYSICS_LOADER,
  SAVE_STORAGE,
} from './aquarium-host';

/**
 * Caractérisation de l'édition du décor et de la pièce vue de l'hôte (#695) : moteur de
 * chute en erreur, support retiré, geste abandonné, refus de la pièce. Complète
 * `aquarium-host.spec.ts` avant le déplacement de l'édition dans ses contrôleurs
 * (`decor-editing-controller.ts`, `room-editing-controller.ts`) : rien ne doit changer.
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

/** Moteur de chute qui lève à chaque lâcher. */
const BROKEN_DROPPER: DecorDropper = {
  drop: () => {
    throw new Error('moteur en panne');
  },
};

const SHELF = { kind: 'etagere', x: -1.25, z: -0.17, quarter: 0 } as const;

describe('AquariumHost : édition du décor et de la pièce (caractérisation, #695)', () => {
  let fixture: ComponentFixture<AquariumHost>;
  let storage: MemoryStorage;
  const host = () => fixture.componentInstance;
  const view = () => (host() as unknown as { view: AquariumView }).view;
  const savedDecor = () => {
    const saved = parseSaveWorlds(storage.getItem(SAVE_STORAGE_KEY)!);
    return saved.ok ? saved.world.decor : null;
  };

  async function create(search = '?seed=42&vitesse=0'): Promise<void> {
    window.history.replaceState(null, '', `/${search}`);
    fixture = TestBed.createComponent(AquariumHost);
    await fixture.whenStable();
  }

  function useLoader(loader: () => Promise<DecorDropper>): void {
    TestBed.overrideProvider(DECOR_PHYSICS_LOADER, { useValue: loader });
  }

  async function editWithPhysics(): Promise<void> {
    await create();
    host().setDecorEditing(true);
    await vi.waitFor(() => expect(host().decorPhysics()).toBe('pret'));
  }

  beforeEach(() => {
    resetCaptureReady();
    storage = new MemoryStorage();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
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
    fixture?.destroy();
    vi.restoreAllMocks();
    resetCaptureReady();
    window.history.replaceState(null, '', '/');
    window.localStorage.removeItem(RENDER_FILTER_STORAGE_KEY);
    window.localStorage.removeItem(FREE_CAMERA_STORAGE_KEY);
  });

  it('moteur en erreur au lâcher : posé sur le sable, sans message de moteur absent', async () => {
    useLoader(() => Promise.resolve(BROKEN_DROPPER));
    await editWithPhysics();
    host().editAt({ kind: 'sand', x: 0, z: 0.1 });
    const item = host().world!.decor.at(-1)!;
    expect(item).toMatchObject({ kind: 'rock', x: 0, z: 0.1 });
    expect(item).not.toHaveProperty('elevation');
    expect(host().decorDropGrounded()).toBe(false);
    expect(host().decorSelection()).toBe(host().world!.decor.length - 1);
  });

  it('moteur en chargement : posé sur le sable, sans message de moteur absent', async () => {
    await create();
    host().setDecorEditing(true);
    expect(host().decorPhysics()).toBe('chargement');
    host().editAt({ kind: 'sand', x: 0, z: 0.1 });
    expect(host().world!.decor.at(-1)).not.toHaveProperty('elevation');
    expect(host().decorDropGrounded()).toBe(false);
  });

  it('supprimer le support d’un rocher empilé : il retombe et la pose est enregistrée (#182)', async () => {
    useLoader(() => initDecorPhysics());
    await editWithPhysics();
    const target = DEFAULT_DECOR[0];
    host().editAt({ kind: 'sand', x: target.x, z: target.z });
    const stacked = host().world!.decor.at(-1)!;
    expect(stacked.elevation ?? 0).toBeGreaterThan(0.01);
    const count = host().world!.decor.length;
    host().selectDecor(0);
    expect(host().deleteSelectedDecor()).toBe(true);
    const fallen = host().world!.decor.at(-1)!;
    expect(host().world!.decor).toHaveLength(count - 1);
    expect(fallen.elevation ?? 0).toBeLessThan(stacked.elevation!);
    expect(host().decorSelection()).toBeNull();
    expect(savedDecor()).toEqual(host().world!.decor);
  });

  it('sans sélection ou hors édition : supprimer, tourner et redimensionner sont sans effet', async () => {
    await create();
    expect(host().deleteSelectedDecor()).toBe(false);
    expect(host().rotateSelectedDecor(1)).toBe(false);
    expect(host().scaleSelectedDecor(1)).toBe(false);
    host().setDecorEditing(true);
    expect(host().deleteSelectedDecor()).toBe(false);
    expect(host().rotateSelectedDecor(1)).toBe(false);
  });

  it('glisser abandonné : pose rendue, aucun refus ; tourner pendant le geste est refusé', async () => {
    await create();
    host().setDecorEditing(true);
    const before = host().world!.decor;
    const preview = vi.spyOn(view(), 'previewDecorMove');
    host().startDecorDrag(2);
    expect(host().decorSelection()).toBe(2);
    host().moveDecorDrag(2, before[2].x + 0.05, before[2].z);
    expect(preview).toHaveBeenLastCalledWith(2, before[2].x + 0.05, before[2].z);
    expect(host().rotateSelectedDecor(1)).toBe(false);
    host().endDecorDrag(2, false);
    expect(host().world!.decor).toBe(before);
    expect(preview).toHaveBeenLastCalledWith(2, before[2].x, before[2].z);
    expect(host().decorRefused()).toBe(false);
    // Fin d'un geste déjà terminé, ou d'un autre élément : sans effet.
    host().endDecorDrag(2, true);
    expect(host().world!.decor).toBe(before);
  });

  it('sortir de l’édition lève la sélection et le refus ; un indice non entier est ignoré', async () => {
    await create();
    host().setDecorEditing(true);
    host().selectDecor(1);
    host().selectDecor(1.5);
    expect(host().decorSelection()).toBe(1);
    host().setDecorEditing(false);
    expect(host().decorEditing()).toBe(false);
    expect(host().decorSelection()).toBeNull();
    expect(host().decorRefused()).toBe(false);
    host().selectDecor(1);
    expect(host().decorSelection()).toBeNull();
  });

  it('outil inconnu ignoré ; outil de la pièce refusé : sélection du décor levée, refus signalé', async () => {
    await create();
    host().setRoomShown(true);
    host().setDecorEditing(true);
    host().setDecorTool('licorne');
    expect(host().decorTool()).toBe('rock');
    host().selectDecor(1);
    host().setDecorTool('etagere');
    // Parquet sous le meuble du bac : la pose est refusée.
    host().editAt({ kind: 'floor', x: 0, z: 0.1 });
    expect(host().decorSelection()).toBeNull();
    expect(host().decorRefused()).toBe(true);
    expect(host().roomCount()).toBe(0);
  });

  it('pièce : quart de tour nul sans effet ; glisser pendant le geste bloque la rotation', async () => {
    await create();
    host().setRoomShown(true);
    host().setDecorEditing(true);
    host().setDecorTool('etagere');
    host().editAt({ kind: 'floor', x: SHELF.x, z: SHELF.z });
    expect(host().roomSelection()).toBe(0);
    expect(host().rotateSelectedDecor(0)).toBe(false);
    host().startRoomDrag(0);
    expect(host().rotateSelectedDecor(2)).toBe(false);
    // Pendant le geste, la rotation n'est pas tentée : aucun refus signalé.
    expect(host().decorRefused()).toBe(false);
    host().endRoomDrag(0, false);
    expect(host().decorRefused()).toBe(false);
    expect(host().room().items).toEqual([SHELF]);
    // Geste fini : la rotation est de nouveau tentée (un quart de tour entre dans le mur).
    expect(host().rotateSelectedDecor(2)).toBe(false);
    expect(host().decorRefused()).toBe(true);
  });

  it('pièce : hors édition, poser, sélectionner et glisser sont sans effet', async () => {
    await create();
    host().setRoomShown(true);
    host().setDecorEditing(true);
    host().setDecorTool('etagere');
    host().editAt({ kind: 'floor', x: SHELF.x, z: SHELF.z });
    host().setDecorEditing(false);
    expect(host().roomSelection()).toBeNull();
    host().selectRoomItem(0);
    expect(host().roomSelection()).toBeNull();
    host().startRoomDrag(0);
    host().moveRoomDrag(0, -2.2, 0.6);
    host().endRoomDrag(0, true);
    expect(host().room().items).toEqual([SHELF]);
    expect(host().deleteSelectedDecor()).toBe(false);
  });
});
