import { TestBed, type ComponentFixture } from '@angular/core/testing';

import {
  CALIBRATION_STORAGE_KEY,
  type CalibrationStorage,
} from '../../core/immersive/calibration-storage';
import { CARD_WIDTH_MM } from '../../core/immersive/screen-calibration';
import type { AquariumRenderer } from '../../render/aquarium-view';
import { isDecorMode } from '../../sim/care-mode';
import type { World } from '../../sim/world';
import { AQUARIUM_RENDERER_FACTORY } from '../aquarium-host/aquarium-host';
import { IMMERSIVE_STORAGE, ImmersiveMode } from './immersive-mode';

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

  it('libère la vue à la destruction', async () => {
    await create();
    frame(0);
    fixture.destroy();
    expect(renderers.at(-1)!.disposed).toBe(true);
  });
});
