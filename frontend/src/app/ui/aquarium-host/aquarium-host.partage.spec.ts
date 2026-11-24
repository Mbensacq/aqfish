import { TestBed, type ComponentFixture } from '@angular/core/testing';

import { resetCaptureReady } from '../../core/capture/capture-ready';
import { SAVE_STORAGE_KEY, type SaveStorage } from '../../core/save-storage/save-storage';
import type { AquariumRenderer } from '../../render/aquarium-view';
import { parseSaveWorlds } from '../../sim/room-save';
import { DEFAULT_SAVE_SETTINGS } from '../../sim/save';
import { createShare } from '../../sim/share-link';
import { createDefaultWorld } from '../../sim/world';
import { SAVE_ATTRIBUTE } from './aquarium-attributes';
import {
  AQUARIUM_RENDERER_FACTORY,
  AquariumHost,
  DECOR_PHYSICS_LOADER,
  SAVE_STORAGE,
  shareBase,
} from './aquarium-host';

/**
 * Caractérisation du partage par lien et du démarrage de la sauvegarde vus de l'hôte (#696) :
 * bouton « Partager », proposition d'import d'un lien reçu, acceptation, refus. Référence du
 * déplacement de la sauvegarde et du partage dans leur contrôleur : rien ne doit changer.
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

/** Attend la fin des promesses en cours (lecture asynchrone du lien, presse-papiers). */
async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}

describe('AquariumHost : partage par lien (caractérisation, #696)', () => {
  let fixture: ComponentFixture<AquariumHost>;
  let storage: MemoryStorage;
  const host = () => fixture.componentInstance;

  async function create(url = '/?vitesse=0'): Promise<void> {
    window.history.replaceState(null, '', url);
    fixture = TestBed.createComponent(AquariumHost);
    await fixture.whenStable();
    await settle();
  }

  /** Lien partagé (fragment seul) d'un bassin neuf de graine 9. */
  async function pondFragment(): Promise<string> {
    const outcome = await createShare(
      'http://localhost/',
      createDefaultWorld(9, 'bassin'),
      DEFAULT_SAVE_SETTINGS,
    );
    if (outcome.kind !== 'lien') {
      throw new RangeError(`lien attendu, reçu ${outcome.kind}`);
    }
    return outcome.url.slice(outcome.url.indexOf('#'));
  }

  beforeEach(() => {
    resetCaptureReady();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    storage = new MemoryStorage();
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
    window.history.replaceState(null, '', '/');
    vi.restoreAllMocks();
  });

  it('shareBase : adresse sans requête ni fragment', () => {
    expect(shareBase('http://h/app/?seed=1#partage=z.x')).toBe('http://h/app/');
    expect(shareBase('http://h/')).toBe('http://h/');
  });

  it('Partager : lien du bac affiché, copié si le presse-papiers l’accepte', async () => {
    await create();
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    await host().shareTank();
    const link = host().shareLink();
    expect(link).toMatch(/^http:\/\/localhost:\d+\/#partage=/);
    expect(writeText).toHaveBeenCalledWith(link);
    expect(host().saveMessage()).toEqual({
      kind: 'info',
      text: 'Lien de partage copié dans le presse-papiers.',
    });
    delete (window.navigator as unknown as Record<string, unknown>)['clipboard'];
  });

  it('Partager sans presse-papiers : lien prêt, à copier à la main', async () => {
    await create();
    await host().shareTank();
    expect(host().shareLink()).toMatch(/#partage=/);
    expect(host().saveMessage()).toEqual({
      kind: 'info',
      text: 'Lien de partage prêt : copiez-le ci-dessous.',
    });
  });

  it('lien reçu au démarrage : proposé sans rien remplacer, puis importé à l’acceptation', async () => {
    const fragment = await pondFragment();
    await create(`/?vitesse=0${fragment}`);
    const before = host().world;
    expect(host().environment()).toBe('tropical');
    expect(host().shareOffer()).toEqual({
      kind: 'offre',
      environment: 'Bassin',
      animals: createDefaultWorld(9, 'bassin').entities.length,
      tanks: 1,
    });
    expect(host().world).toBe(before);
    host().acceptShare();
    expect(host().shareOffer()).toBeNull();
    expect(host().environment()).toBe('bassin');
    expect(host().world!.seed).toBe(9);
    expect(window.location.hash).toBe('');
    // Bassin par défaut au-delà de sa capacité (ADR 0171) : l'import le signale (#809).
    expect(host().saveMessage()?.text).toMatch(
      /^Aquarium partagé importé\. Bac au-delà de sa capacité/,
    );
    const saved = parseSaveWorlds(storage.data.get(SAVE_STORAGE_KEY)!);
    expect(saved.ok && saved.world.environment).toBe('bassin');
  });

  it('lien collé dans l’onglet (hashchange) : proposé ; Ignorer garde le bac et retire le fragment', async () => {
    await create();
    const before = host().world;
    window.history.replaceState(null, '', `/?vitesse=0${await pondFragment()}`);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await settle();
    expect(host().shareOffer()?.kind).toBe('offre');
    host().dismissShare();
    expect(host().shareOffer()).toBeNull();
    expect(window.location.hash).toBe('');
    expect(host().world).toBe(before);
    host().acceptShare();
    expect(host().world).toBe(before);
  });

  it('lien invalide : refus lisible, bac intact', async () => {
    await create('/?vitesse=0#partage=z.@@@');
    expect(host().shareOffer()?.kind).toBe('erreur');
    expect((host().shareOffer() as { text: string }).text).toMatch(/^Lien de partage refusé : /);
    expect(host().environment()).toBe('tropical');
  });

  it('en capture : le lien est affiché tel quel, sans proposition ni sauvegarde', async () => {
    const fragment = await pondFragment();
    await create(`/?capture=1${fragment}`);
    expect(host().environment()).toBe('bassin');
    expect(host().world!.seed).toBe(9);
    expect(host().shareOffer()).toBeNull();
    await host().shareTank();
    expect(host().shareLink()).toBeNull();
    expect(fixture.nativeElement.hasAttribute(SAVE_ATTRIBUTE)).toBe(false);
    expect(storage.data.size).toBe(0);
  });

  it('sauvegarde active au démarrage, hors capture et hors fond d’écran', async () => {
    await create();
    expect(host().saveStatus()).toBe('active');
    expect(fixture.nativeElement.getAttribute(SAVE_ATTRIBUTE)).toBe('active');
  });
});
