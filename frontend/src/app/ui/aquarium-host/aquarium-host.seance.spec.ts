import { TestBed, type ComponentFixture } from '@angular/core/testing';

import { resetCaptureReady } from '../../core/capture/capture-ready';
import { RENDER_FILTER_STORAGE_KEY } from '../../core/render-filter/render-filter';
import { FREE_CAMERA_STORAGE_KEY } from '../../core/free-camera-pref/free-camera-pref';
import type { SaveStorage } from '../../core/save-storage/save-storage';
import { AquariumView, type AquariumRenderer, type StrokePoint } from '../../render/aquarium-view';
import { serializeCareSession, type CareSession } from '../../sim/care-session';
import { SIPHON_SHARE_PER_POINT } from '../../sim/siphon';
import { AmbientSoundState } from '../ambient-sound/ambient-sound-state';
import { CARE_SESSION_ATTRIBUTE, PRUNER_ATTRIBUTE, SCRAPER_ATTRIBUTE } from './aquarium-attributes';
import {
  AQUARIUM_RENDERER_FACTORY,
  AquariumHost,
  CARE_SESSION_STORAGE_KEY,
  DECOR_PHYSICS_LOADER,
  SAVE_STORAGE,
} from './aquarium-host';

/**
 * Caractérisation de la séance d'entretien vue de l'hôte (#694) : outils en main, passage,
 * reprise, siphon, rinçage, eau neuve. Référence du déplacement de la séance dans son
 * contrôleur (`ui/care-session/care-session-controller.ts`) : rien ne doit changer.
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

/** Stockage en mémoire de la sauvegarde automatique et de la séance interrompue. */
class MemoryStorage implements SaveStorage {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

/** Rayon vertical qui touche le fond au centre du bac. */
const DOWN_RAY = {
  origin: [0, 10, 0] as const,
  direction: [0, -1, 0] as const,
};

describe('AquariumHost : séance d’entretien (caractérisation, #694)', () => {
  let fixture: ComponentFixture<AquariumHost>;
  let storage: MemoryStorage;
  let strokeListeners: ((points: readonly StrokePoint[]) => void)[];
  const host = () => fixture.componentInstance;
  const attribute = (name: string) => (fixture.nativeElement as HTMLElement).getAttribute(name);
  /** Passage du geste de séance transmis par la vue, `count` points. */
  const stroke = (count: number) =>
    strokeListeners.at(-1)!(Array.from({ length: count }, (_, i) => ({ x: i, y: i })));

  async function create(search = '?seed=42&vitesse=0'): Promise<void> {
    window.history.replaceState(null, '', `/${search}`);
    fixture = TestBed.createComponent(AquariumHost);
    await fixture.whenStable();
  }

  beforeEach(() => {
    resetCaptureReady();
    storage = new MemoryStorage();
    strokeListeners = [];
    const onStroke = AquariumView.prototype.onStroke;
    vi.spyOn(AquariumView.prototype, 'onStroke').mockImplementation(function (
      this: AquariumView,
      listener,
    ) {
      strokeListeners.push(listener);
      return onStroke.call(this, listener);
    });
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
    vi.restoreAllMocks();
    resetCaptureReady();
    window.history.replaceState(null, '', '/');
    window.localStorage.removeItem(RENDER_FILTER_STORAGE_KEY);
    window.localStorage.removeItem(FREE_CAMERA_STORAGE_KEY);
  });

  it('outils : raclette et passage aux vitres, passage au siphon, sécateur à la taille, rien après', async () => {
    const strokeEnabled = vi.spyOn(AquariumView.prototype, 'setStrokeEnabled');
    await create();
    strokeEnabled.mockClear();
    host().openCareSession();
    expect(host().careSession()?.step).toBe('vitres');
    expect(host().scraping()).toBe(true);
    expect(host().pruning()).toBe(false);
    expect(attribute(SCRAPER_ATTRIBUTE)).toBe('true');
    expect(attribute(CARE_SESSION_ATTRIBUTE)).toBe('vitres');
    expect(strokeEnabled.mock.calls.at(-1)).toEqual([true]);
    host().completeCareSessionStep();
    expect(host().world!.maintenance?.lastDone.glass).toBe(host().world!.time);
    expect(host().careSession()?.step).toBe('siphon');
    expect(host().scraping()).toBe(false);
    expect(strokeEnabled.mock.calls.at(-1)).toEqual([true]);
    host().skipCareSessionStep();
    expect(strokeEnabled.mock.calls.at(-1)).toEqual([false]);
    host().skipCareSessionStep();
    host().skipCareSessionStep();
    expect(host().careSession()?.step).toBe('taille');
    expect(host().pruning()).toBe(true);
    expect(attribute(PRUNER_ATTRIBUTE)).toBe('true');
    host().skipCareSessionStep();
    expect(host().careSession()?.step).toBe('bilan');
    expect(host().pruning()).toBe(false);
    expect(attribute(CARE_SESSION_ATTRIBUTE)).toBe('bilan');
    host().closeCareSession();
    expect(host().careSession()).toBeNull();
    expect(attribute(CARE_SESSION_ATTRIBUTE)).toBeNull();
    expect(strokeEnabled.mock.calls.at(-1)).toEqual([false]);
  });

  it('reprise : séance interrompue enregistrée et reprise à son étape, oubliée au bilan', async () => {
    await create();
    host().openCareSession();
    host().skipCareSessionStep();
    host().skipCareSessionStep();
    host().closeCareSession();
    expect(host().careSession()).toBeNull();
    expect(storage.data.get(CARE_SESSION_STORAGE_KEY)).toBe(
      serializeCareSession({ step: 'filtre', outcomes: { vitres: 'saute', siphon: 'saute' } }),
    );
    host().openCareSession();
    expect(host().careSession()?.step).toBe('filtre');
    // Rouvrir une séance affichée ne change rien.
    host().openCareSession();
    expect(host().careSession()?.step).toBe('filtre');
    for (let i = 0; i < 3; i++) {
      host().skipCareSessionStep();
    }
    expect(host().careSession()?.step).toBe('bilan');
    expect(storage.data.get(CARE_SESSION_STORAGE_KEY)).toBe('');
    host().closeCareSession();
    host().openCareSession();
    expect(host().careSession()).toEqual({ step: 'vitres', outcomes: {} });
  });

  it('siphon : chaque point du passage compte dans la jauge, bruitage ; rien hors de l’eau', async () => {
    await create();
    const play = vi.spyOn(TestBed.inject(AmbientSoundState), 'playCareSound');
    const pick = vi.spyOn(AquariumView.prototype, 'pickRay').mockReturnValue(DOWN_RAY);
    host().openCareSession();
    host().completeCareSessionStep();
    play.mockClear();
    stroke(10);
    expect(host().careSession()?.siphoned).toBeCloseTo(10 * SIPHON_SHARE_PER_POINT, 10);
    expect(play.mock.calls).toEqual([['siphon']]);
    pick.mockReturnValue(null);
    stroke(5);
    expect(host().careSession()?.siphoned).toBeCloseTo(10 * SIPHON_SHARE_PER_POINT, 10);
    expect(play).toHaveBeenCalledTimes(1);
    host().closeCareSession();
  });

  it('vitres : passage sans plaque touchée, ni bruitage ni enregistrement', async () => {
    await create();
    const play = vi.spyOn(TestBed.inject(AmbientSoundState), 'playCareSound');
    vi.spyOn(AquariumView.prototype, 'pickRay').mockReturnValue(DOWN_RAY);
    host().openCareSession();
    const saved = storage.data.get('aqfish.sauvegarde');
    stroke(3);
    expect(play).not.toHaveBeenCalled();
    expect(storage.data.get('aqfish.sauvegarde')).toBe(saved);
    expect(host().careSession()?.step).toBe('vitres');
    host().closeCareSession();
  });

  it('filtre : rinçage choisi appliqué à « Étape terminée » seulement, filtre au calendrier', async () => {
    await create();
    host().openCareSession();
    host().chooseCareRinse('robinet');
    expect(host().careSession()?.rinse).toBeUndefined();
    host().skipCareSessionStep();
    host().skipCareSessionStep();
    const filter = host().world!.water.filter;
    host().chooseCareRinse('robinet');
    expect(host().careSession()?.rinse).toBe('robinet');
    expect(host().world!.water.filter).toBe(filter);
    host().completeCareSessionStep();
    expect(host().careSession()?.step).toBe('eau');
    expect(host().world!.water.filter).toBeLessThan(filter);
    expect(host().careFilter()).toBe(host().world!.water.filter);
    expect(host().world!.maintenance?.lastDone.filter).toBe(host().world!.time);
    host().closeCareSession();
  });

  it('eau neuve : seaux jusqu’à l’eau retirée, seau choisi versé, calendrier et journal', async () => {
    const stored: CareSession = {
      step: 'eau',
      outcomes: { vitres: 'saute', siphon: 'fait', filtre: 'saute' },
      siphoned: 0.15,
    };
    storage.setItem(CARE_SESSION_STORAGE_KEY, serializeCareSession(stored));
    await create();
    const play = vi.spyOn(TestBed.inject(AmbientSoundState), 'playCareSound');
    host().openCareSession();
    expect(host().careSession()?.step).toBe('eau');
    expect(host().careConditioner()).toBe(true);
    expect(host().careBucketGap()).toBe(0);
    host().pourCareBucket();
    expect(host().careSession()?.poured).toBeCloseTo(0.1, 10);
    host().pourCareBucket();
    expect(host().careSession()?.poured).toBeCloseTo(0.15, 10);
    host().pourCareBucket();
    expect(play.mock.calls).toEqual([['seau'], ['seau']]);
    host().careConditioner.set(false);
    host().careBucketGap.set(4);
    const temperature = host().world!.water.temperature;
    host().completeCareSessionStep();
    expect(host().careSession()?.step).toBe('taille');
    expect(host().world!.water.temperature).toBeGreaterThan(temperature);
    expect(host().world!.maintenance?.lastDone.waterChange).toBe(host().world!.time);
    // Conditionneur oublié : l'alerte au chlore suit l'eau neuve au journal.
    expect(
      host()
        .journal()
        .map((line) => line.kind),
    ).toEqual(['alerte', 'eauNeuve']);
    host().closeCareSession();
  });

  it('eau neuve sans seau versé : rien n’est changé ni noté', async () => {
    await create();
    host().openCareSession();
    for (let i = 0; i < 3; i++) {
      host().skipCareSessionStep();
    }
    const water = host().world!.water;
    host().completeCareSessionStep();
    expect(host().careSession()?.step).toBe('taille');
    expect(host().world!.water).toBe(water);
    expect(host().journal()).toEqual([]);
    host().closeCareSession();
  });

  it('capture : aucune séance', async () => {
    await create('?capture=1&seed=42');
    host().openCareSession();
    expect(host().careSession()).toBeNull();
    expect(attribute(CARE_SESSION_ATTRIBUTE)).toBeNull();
  });
});
