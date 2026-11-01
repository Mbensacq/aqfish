import { TestBed, type ComponentFixture } from '@angular/core/testing';

import {
  CALIBRATION_STORAGE_KEY,
  type CalibrationStorage,
} from '../../core/immersive/calibration-storage';
import { CARD_WIDTH_MM } from '../../core/immersive/screen-calibration';
import type { AquariumRenderer } from '../../render/aquarium-view';
import { isDecorMode } from '../../sim/care-mode';
import { TAP_REACTIONS } from '../../sim/glass-tap';
import { SPECIES } from '../../sim/species';
import type { Fish } from '../../sim/swimmer';
import type { World } from '../../sim/world';
import { AQUARIUM_RENDERER_FACTORY } from '../aquarium-host/aquarium-host';
import {
  FEED_BAND,
  IMMERSIVE_STORAGE,
  ImmersiveMode,
  LONG_PRESS_MS,
  TAP_SLOP_PX,
  UI_HIDE_MIN_FRAMES,
  UI_HIDE_MS,
} from './immersive-mode';

class FakeRenderer implements AquariumRenderer {
  renders = 0;
  disposed = false;
  calls = 0;
  setPixelRatio(): void {
    this.calls++;
  }
  setSize(): void {
    this.calls++;
  }
  setRenderTarget(): void {
    this.calls++;
  }
  render(): void {
    this.renders++;
  }
  dispose(): void {
    this.disposed = true;
  }
}

function memoryStorage(): CalibrationStorage & { readonly data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

describe('ImmersiveMode', () => {
  let fixture: ComponentFixture<ImmersiveMode>;
  let renderers: FakeRenderer[];
  let storage: ReturnType<typeof memoryStorage>;
  let closed: number;
  let size: { width: number; height: number };

  const host = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const query = <T extends Element>(selector: string): T | null =>
    host().querySelector<T>(selector);

  /** Une image de la boucle (rAF de jsdom non utilisé : appel direct). */
  function frame(time: number): void {
    (fixture.componentInstance as unknown as { frame(t: number): void }).frame(time);
    fixture.detectChanges();
  }

  async function create(): Promise<void> {
    fixture = TestBed.createComponent(ImmersiveMode);
    const canvas = query<HTMLCanvasElement>('canvas')!;
    Object.defineProperty(canvas, 'clientWidth', { get: () => size.width });
    Object.defineProperty(canvas, 'clientHeight', { get: () => size.height });
    fixture.componentInstance.closed.subscribe(() => closed++);
    fixture.detectChanges();
    await fixture.whenStable();
  }

  beforeEach(() => {
    renderers = [];
    storage = memoryStorage();
    closed = 0;
    size = { width: 390, height: 844 };
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AQUARIUM_RENDERER_FACTORY,
          useValue: () => {
            const renderer = new FakeRenderer();
            renderers.push(renderer);
            return renderer;
          },
        },
        { provide: IMMERSIVE_STORAGE, useFactory: () => storage },
      ],
    });
  });

  afterEach(() => fixture?.destroy());

  it('sans étalonnage : taille estimée signalée, rappel du mode décor', async () => {
    await create();
    frame(0);
    expect(host().getAttribute('data-immersive-calibrated')).toBe('false');
    expect(query('[data-immersive-estimated]')).not.toBeNull();
    expect(query('[data-immersive-note]')!.textContent).toContain('pas une simulation réaliste');
    expect(host().getAttribute('role')).toBe('dialog');
  });

  it('crée un bac en mode décor aux proportions de l’écran et le rend en vue immersive', async () => {
    await create();
    frame(0);
    frame(16);
    const view = fixture.componentInstance.immersiveView!;
    const layout = fixture.componentInstance.currentLayout!;
    expect(view.immersiveActive).toBe(true);
    expect(layout.dimensions.width / layout.dimensions.height).toBeCloseTo(390 / 844, 9);
    expect(renderers.at(-1)!.renders).toBeGreaterThan(0);
    const world = (fixture.componentInstance as unknown as { world: World }).world;
    expect(isDecorMode(world)).toBe(true);
  });

  it('suit le redimensionnement et l’orientation : nouveau bac, ancienne vue libérée', async () => {
    await create();
    frame(0);
    const first = renderers.at(-1)!;
    size = { width: 844, height: 390 };
    frame(16);
    const layout = fixture.componentInstance.currentLayout!;
    expect(layout.dimensions.width).toBeGreaterThan(layout.dimensions.height);
    expect(layout.dimensions.width / layout.dimensions.height).toBeCloseTo(844 / 390, 9);
    expect(first.disposed).toBe(true);
    expect(renderers.length).toBe(2);
    // Même taille : rien n'est recréé.
    frame(32);
    expect(renderers.length).toBe(2);
  });

  it('étalonner : la carte ajustée donne la taille réelle, enregistrée', async () => {
    await create();
    frame(0);
    query<HTMLButtonElement>('[data-immersive-calibrate]')!.click();
    fixture.detectChanges();
    const range = query<HTMLInputElement>('[data-immersive-card-width]')!;
    range.value = '300';
    range.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(query<HTMLElement>('[data-immersive-card]')!.style.width).toBe('300px');
    query<HTMLButtonElement>('[data-immersive-validate]')!.click();
    frame(16);
    expect(query('[data-immersive-calibration]')).toBeNull();
    expect(host().getAttribute('data-immersive-calibrated')).toBe('true');
    expect(query('[data-immersive-estimated]')).toBeNull();
    const pxPerMm = 300 / CARD_WIDTH_MM;
    expect(JSON.parse(storage.data.get(CALIBRATION_STORAGE_KEY)!).pxPerMm).toBeCloseTo(pxPerMm, 9);
    expect(host().getAttribute('data-immersive-screen-mm')).toBe(
      `${(390 / pxPerMm).toFixed(1)}x${(844 / pxPerMm).toFixed(1)}`,
    );
  });

  it('étalonnage relu au retour dans le mode', async () => {
    storage.data.set(CALIBRATION_STORAGE_KEY, JSON.stringify({ pxPerMm: 6 }));
    await create();
    frame(0);
    expect(host().getAttribute('data-immersive-calibrated')).toBe('true');
    expect(host().getAttribute('data-immersive-screen-mm')).toBe('65.0x140.7');
  });

  it('Échap ferme l’étalonnage, puis quitte ; « Quitter » quitte', async () => {
    await create();
    query<HTMLButtonElement>('[data-immersive-calibrate]')!.click();
    fixture.detectChanges();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(query('[data-immersive-calibration]')).toBeNull();
    expect(closed).toBe(0);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(closed).toBe(1);
    query<HTMLButtonElement>('[data-immersive-exit]')!.click();
    expect(closed).toBe(2);
  });

  it('distance de l’œil et profondeur réglables et bornées', async () => {
    await create();
    frame(0);
    query<HTMLButtonElement>('.immersive__actions button')!.click();
    fixture.detectChanges();
    const eye = query<HTMLInputElement>('[data-immersive-eye]')!;
    eye.value = '5000';
    eye.dispatchEvent(new Event('input'));
    expect(fixture.componentInstance.eyeDistanceMm()).toBe(1500);
    const before = fixture.componentInstance.currentLayout!.dimensions.depth;
    const depth = query<HTMLInputElement>('[data-immersive-depth]')!;
    depth.value = '300';
    depth.dispatchEvent(new Event('input'));
    frame(16);
    expect(fixture.componentInstance.depthMm()).toBe(300);
    expect(fixture.componentInstance.currentLayout!.dimensions.depth).toBeGreaterThan(before);
  });

  describe('lot 2 (#346) : parallaxe, gardes d’API, batterie', () => {
    const win = window as unknown as { DeviceOrientationEvent?: unknown };
    let original: unknown;

    beforeEach(() => {
      original = win.DeviceOrientationEvent;
    });
    afterEach(() => {
      if (original === undefined) {
        delete win.DeviceOrientationEvent;
      } else {
        win.DeviceOrientationEvent = original;
      }
    });

    function orientation(beta: number | null, gamma: number | null): void {
      window.dispatchEvent(Object.assign(new Event('deviceorientation'), { beta, gamma }));
    }

    /** Événement `pointerdown` (jsdom n'a pas toujours `PointerEvent`). */
    function pointer(pointerType: string): Event {
      return Object.assign(new Event('pointerdown', { bubbles: true }), { pointerType });
    }

    /** Images à 30 par seconde (toutes rendues sous la limite). */
    function frames(from: number, count: number): number {
      let t = from;
      for (let i = 0; i < count; i++) {
        t += 1000 / 30;
        frame(t);
      }
      return t;
    }

    it('sans capteur d’orientation : repli sans parallaxe, œil centré', async () => {
      delete win.DeviceOrientationEvent;
      await create();
      frame(0);
      frames(0, 10);
      expect(host().getAttribute('data-immersive-parallax')).toBe('off');
      expect(fixture.componentInstance.eyeOffsetMm).toEqual({ x: 0, y: 0 });
      // Un toucher ne demande rien et ne lève rien.
      host().dispatchEvent(pointer('touch'));
      fixture.detectChanges();
      expect(host().getAttribute('data-immersive-parallax')).toBe('off');
    });

    it('orientation sans autorisation : l’inclinaison déplace l’œil ; lectures nulles ignorées', async () => {
      win.DeviceOrientationEvent = function DeviceOrientationEvent() {
        /* factice */
      };
      await create();
      frame(0);
      expect(host().getAttribute('data-immersive-parallax')).toBe('waiting');
      // Ordinateur : valeurs nulles, ignorées.
      orientation(null, null);
      frames(0, 5);
      expect(host().getAttribute('data-immersive-parallax')).toBe('waiting');
      orientation(60, 0);
      const t = frames(200, 2);
      orientation(60, 8);
      frames(t, 15);
      expect(host().getAttribute('data-immersive-parallax')).toBe('on');
      expect(fixture.componentInstance.eyeOffsetMm.x).toBeLessThan(-1);
      expect(host().getAttribute('data-immersive-eye-mm')).toMatch(/^-\d+,-?\d+$/);
      // La caméra suit l'œil décalé (mètres de la scène, à l'échelle du bac).
      const view = fixture.componentInstance.immersiveView!;
      const layout = fixture.componentInstance.currentLayout!;
      const eyeX = (fixture.componentInstance.eyeOffsetMm.x / 1000) * layout.scale;
      expect(view.cameraPosition()[0]).toBeCloseTo(eyeX, 2);
      fixture.destroy();
      // Écouteur retiré : plus aucun effet après la destruction.
      expect(() => orientation(60, 20)).not.toThrow();
    });

    it('autorisation exigée : demandée au premier toucher ; refus → repli signalé', async () => {
      let asked = 0;
      win.DeviceOrientationEvent = Object.assign(
        function DeviceOrientationEvent() {
          /* factice */
        },
        { requestPermission: async () => (asked++, 'denied') },
      );
      await create();
      frame(0);
      expect(host().getAttribute('data-immersive-parallax')).toBe('off');
      host().dispatchEvent(pointer('mouse'));
      host().dispatchEvent(pointer('mouse'));
      await fixture.whenStable();
      fixture.detectChanges();
      expect(asked).toBe(1);
      expect(host().getAttribute('data-immersive-parallax')).toBe('denied');
      orientation(60, 10);
      frames(0, 10);
      expect(fixture.componentInstance.eyeOffsetMm).toEqual({ x: 0, y: 0 });
    });

    it('refus : pas redemandé aux touchers suivants, redemandé à la réouverture (#357)', async () => {
      let asked = 0;
      let answer = 'denied';
      win.DeviceOrientationEvent = Object.assign(
        function DeviceOrientationEvent() {
          /* factice */
        },
        { requestPermission: async () => (asked++, answer) },
      );
      await create();
      frame(0);
      host().dispatchEvent(pointer('touch'));
      await fixture.whenStable();
      fixture.detectChanges();
      expect(host().getAttribute('data-immersive-parallax')).toBe('denied');
      for (let i = 0; i < 3; i++) {
        host().dispatchEvent(pointer('touch'));
      }
      await fixture.whenStable();
      fixture.detectChanges();
      expect(asked).toBe(1);
      expect(host().getAttribute('data-immersive-parallax')).toBe('denied');
      // Mode refermé puis rouvert : nouvelle demande au premier toucher, accordée cette fois.
      fixture.destroy();
      answer = 'granted';
      await create();
      frame(0);
      expect(host().getAttribute('data-immersive-parallax')).toBe('off');
      host().dispatchEvent(pointer('touch'));
      await fixture.whenStable();
      fixture.detectChanges();
      expect(asked).toBe(2);
      expect(host().getAttribute('data-immersive-parallax')).toBe('waiting');
    });

    it('autorisation accordée : l’orientation est écoutée', async () => {
      win.DeviceOrientationEvent = Object.assign(
        function DeviceOrientationEvent() {
          /* factice */
        },
        { requestPermission: async () => 'granted' },
      );
      await create();
      frame(0);
      host().dispatchEvent(pointer('touch'));
      await fixture.whenStable();
      orientation(60, 0);
      fixture.detectChanges();
      expect(host().getAttribute('data-immersive-parallax')).toBe('on');
    });

    it('caméra non réappliquée à paramètres identiques (#355), réappliquée si la distance change', async () => {
      delete win.DeviceOrientationEvent;
      await create();
      frame(0);
      const applied = fixture.componentInstance.cameraApplications;
      expect(applied).toBe(1);
      frames(0, 20);
      expect(fixture.componentInstance.cameraApplications).toBe(applied);
      query<HTMLButtonElement>('.immersive__actions button')!.click();
      fixture.detectChanges();
      const eye = query<HTMLInputElement>('[data-immersive-eye]')!;
      eye.value = '500';
      eye.dispatchEvent(new Event('input'));
      frames(1000, 1);
      expect(fixture.componentInstance.cameraApplications).toBe(applied + 1);
    });

    it('images limitées : à 60 Hz, une image sur deux est rendue', async () => {
      await create();
      frame(0);
      const renderer = renderers.at(-1)!;
      const before = renderer.renders;
      for (let i = 1; i <= 60; i++) {
        frame(i * (1000 / 60));
      }
      // `before` : rendus d'une image (cible basse résolution puis écran).
      expect(before).toBeGreaterThan(0);
      expect(renderer.renders - before).toBe(30 * before);
    });

    it('page masquée : boucle arrêtée ; visible : reprise sans rattrapage', async () => {
      let hidden = false;
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => (hidden ? 'hidden' : 'visible'),
      });
      try {
        await create();
        frame(0);
        const component = fixture.componentInstance as unknown as {
          frameId: number | null;
          lastTime: number | null;
        };
        hidden = true;
        document.dispatchEvent(new Event('visibilitychange'));
        expect(component.frameId).toBeNull();
        hidden = false;
        document.dispatchEvent(new Event('visibilitychange'));
        expect(component.lastTime).toBeNull();
        expect(component.frameId).not.toBeNull();
      } finally {
        delete (document as unknown as { visibilityState?: string }).visibilityState;
      }
    });
  });

  describe('toucher, nourriture et appui long (#346)', () => {
    /** Événement de pointeur synthétique (jsdom n'a pas toujours `PointerEvent`). */
    function press(type: string, x: number, y: number, extra: object = {}): Event {
      return Object.assign(new Event(type, { bubbles: true }), {
        pointerId: 1,
        isPrimary: true,
        pointerType: 'touch',
        clientX: x,
        clientY: y,
        ...extra,
      });
    }

    const canvas = (): HTMLCanvasElement => query<HTMLCanvasElement>('canvas')!;
    const world = (): World => (fixture.componentInstance as unknown as { world: World }).world;

    function tap(x: number, y: number): void {
      canvas().dispatchEvent(press('pointerdown', x, y));
      canvas().dispatchEvent(press('pointerup', x, y));
      fixture.detectChanges();
    }

    /** Images à 30 par seconde, à partir de `time`. */
    let time = 0;
    function render(count: number): void {
      for (let i = 0; i < count; i++) {
        time += 1000 / 30;
        frame(time);
      }
    }

    /** Délai de masquage écoulé et assez d'images rendues : l'interface se cache. */
    function waitHide(): void {
      vi.advanceTimersByTime(UI_HIDE_MS);
      render(UI_HIDE_MIN_FRAMES);
    }

    beforeEach(() => {
      time = 0;
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    });
    afterEach(() => vi.useRealTimers());

    it('l’interface se cache seule, sauf pendant les réglages', async () => {
      await create();
      frame(0);
      expect(host().getAttribute('data-immersive-ui')).toBe('visible');
      render(UI_HIDE_MIN_FRAMES);
      vi.advanceTimersByTime(UI_HIDE_MS - 1);
      fixture.detectChanges();
      expect(host().getAttribute('data-immersive-ui')).toBe('visible');
      vi.advanceTimersByTime(1);
      fixture.detectChanges();
      expect(host().getAttribute('data-immersive-ui')).toBe('hidden');
      // Appareil qui peine : délai écoulé, mais trop peu d'images rendues.
      fixture.componentInstance.showUi();
      render(UI_HIDE_MIN_FRAMES - 1);
      vi.advanceTimersByTime(UI_HIDE_MS);
      fixture.detectChanges();
      expect(host().getAttribute('data-immersive-ui')).toBe('visible');
      render(1);
      expect(host().getAttribute('data-immersive-ui')).toBe('hidden');
      expect(host().classList).toContain('immersive--ui-hidden');
      // Réglages ouverts : l'interface reste ; refermés, le délai repart.
      fixture.componentInstance.showUi();
      fixture.componentInstance.toggleSettings();
      waitHide();
      waitHide();
      expect(host().getAttribute('data-immersive-ui')).toBe('visible');
      fixture.componentInstance.toggleSettings();
      fixture.componentInstance.showUi();
      waitHide();
      expect(host().getAttribute('data-immersive-ui')).toBe('hidden');
      // Une touche du clavier la rend (accès sans appui long).
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
      fixture.detectChanges();
      expect(host().getAttribute('data-immersive-ui')).toBe('visible');
      expect(closed).toBe(0);
    });

    it('appui long : affiche l’interface, sans toucher la vitre', async () => {
      await create();
      frame(0);
      waitHide();
      expect(host().getAttribute('data-immersive-ui')).toBe('hidden');
      const speeds = world().entities.map((f) => f.speed);
      canvas().dispatchEvent(press('pointerdown', 195, 422));
      vi.advanceTimersByTime(LONG_PRESS_MS - 1);
      fixture.detectChanges();
      expect(host().getAttribute('data-immersive-ui')).toBe('hidden');
      vi.advanceTimersByTime(1);
      fixture.detectChanges();
      expect(host().getAttribute('data-immersive-ui')).toBe('visible');
      canvas().dispatchEvent(press('pointerup', 195, 422));
      expect(world().entities.map((f) => f.speed)).toEqual(speeds);
      // Puis elle se cache de nouveau seule.
      waitHide();
      expect(host().getAttribute('data-immersive-ui')).toBe('hidden');
    });

    it('un appui qui glisse ou un second doigt n’est ni un toucher ni un appui long', async () => {
      await create();
      frame(0);
      waitHide();
      canvas().dispatchEvent(press('pointerdown', 100, 400));
      canvas().dispatchEvent(press('pointermove', 100 + TAP_SLOP_PX + 1, 400));
      vi.advanceTimersByTime(LONG_PRESS_MS);
      canvas().dispatchEvent(press('pointerup', 100, 400));
      canvas().dispatchEvent(press('pointerdown', 100, 400, { isPrimary: false }));
      vi.advanceTimersByTime(LONG_PRESS_MS);
      canvas().dispatchEvent(press('pointerdown', 100, 400));
      // Les contrôles d'orbite écoutent aussi `pointercancel` ; jsdom n'a pas la capture.
      canvas().releasePointerCapture = () => undefined;
      canvas().dispatchEvent(new Event('pointercancel'));
      vi.advanceTimersByTime(LONG_PRESS_MS);
      canvas().dispatchEvent(press('pointerup', 100, 30));
      fixture.detectChanges();
      expect(host().getAttribute('data-immersive-ui')).toBe('hidden');
      expect(world().food).toEqual([]);
    });

    it('toucher le haut fait tomber de la nourriture, rendue et exposée', async () => {
      await create();
      frame(0);
      tap(195, FEED_BAND * size.height - 1);
      expect(world().food.length).toBeGreaterThan(0);
      const layout = fixture.componentInstance.currentLayout!;
      for (const pellet of world().food) {
        expect(Math.abs(pellet.x)).toBeLessThan(layout.dimensions.width / 2);
      }
      frame(1000 / 30);
      expect(host().getAttribute('data-immersive-food')).toBe(String(world().food.length));
      expect(fixture.componentInstance.immersiveView!.foodCount).toBe(world().food.length);
    });

    it('tapoter la vitre fait réagir les poissons proches, pas la nourriture', async () => {
      await create();
      // Avant le premier bac : un toucher ne fait rien et ne lève rien.
      tap(195, 422);
      frame(0);
      const layout = fixture.componentInstance.currentLayout!;
      const fish = world().entities[0] as { -readonly [K in keyof Fish]: Fish[K] };
      // Poisson posé juste derrière la vitre, au milieu de l'écran.
      fish.x = 0;
      fish.y = layout.dimensions.height / 2;
      fish.z = layout.dimensions.depth / 2 - 0.01;
      fish.speed = SPECIES[fish.species].minSpeed;
      const reaction = TAP_REACTIONS[fish.species];
      tap(size.width / 2, size.height / 2);
      expect(world().food).toEqual([]);
      expect(fish.speed).toBe(
        reaction === 'fuite' ? SPECIES[fish.species].maxSpeed : SPECIES[fish.species].cruiseSpeed,
      );
    });
  });

  it('libère la vue à la destruction', async () => {
    await create();
    frame(0);
    fixture.destroy();
    expect(renderers.at(-1)!.disposed).toBe(true);
  });
});
