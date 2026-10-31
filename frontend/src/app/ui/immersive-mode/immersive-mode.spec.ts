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

  it('libère la vue à la destruction', async () => {
    await create();
    frame(0);
    fixture.destroy();
    expect(renderers.at(-1)!.disposed).toBe(true);
  });
});
