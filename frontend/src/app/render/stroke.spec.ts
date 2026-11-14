import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { describe, expect, it } from 'vitest';

import { AquariumView, STROKE_STEP_PX, strokePoints, type AquariumRenderer } from './aquarium-view';

/** Double minimal du renderer WebGL (jsdom n'a pas WebGL) : consigne les appels. */
class NullRenderer implements AquariumRenderer {
  readonly calls: string[] = [];
  setPixelRatio(): void {
    this.calls.push('pixelRatio');
  }
  setSize(): void {
    this.calls.push('setSize');
  }
  setRenderTarget(): void {
    this.calls.push('cible');
  }
  render(): void {
    this.calls.push('render');
  }
  dispose(): void {
    this.calls.push('dispose');
  }
}

function create(interactive = true): { view: AquariumView; canvas: HTMLCanvasElement } {
  const canvas = document.createElement('canvas');
  canvas.releasePointerCapture = () => undefined;
  canvas.setPointerCapture = () => undefined;
  const view = new AquariumView({
    canvas,
    rendererFactory: () => new NullRenderer(),
    pixelRatio: 1,
    preset: 'three-quarter',
    interactive,
  });
  view.resize(640, 360);
  return { view, canvas };
}

function pointer(type: string, x: number, y: number, kind = 'mouse'): Event {
  const event = new MouseEvent(type, { button: 0, clientX: x, clientY: y });
  Object.defineProperty(event, 'pointerId', { value: 3 });
  Object.defineProperty(event, 'isPrimary', { value: true });
  Object.defineProperty(event, 'pointerType', { value: kind });
  return event;
}

const controlsOf = (view: AquariumView) =>
  (view as unknown as { controls: OrbitControls }).controls;

describe('strokePoints (#604)', () => {
  it('découpe un trajet en pas de STROKE_STEP_PX au plus, arrivée comprise', () => {
    const points = strokePoints({ x: 0, y: 0 }, { x: 20, y: 0 }, 6);
    expect(points).toHaveLength(4);
    expect(points.at(-1)).toEqual({ x: 20, y: 0 });
    for (let i = 1; i < points.length; i++) {
      expect(points[i]!.x - points[i - 1]!.x).toBeLessThanOrEqual(6);
    }
  });

  it('rien sans mouvement, avec un pas nul ou des coordonnées non finies', () => {
    expect(strokePoints({ x: 3, y: 4 }, { x: 3, y: 4 }, 6)).toEqual([]);
    expect(strokePoints({ x: 0, y: 0 }, { x: 10, y: 0 }, 0)).toEqual([]);
    expect(strokePoints({ x: 0, y: 0 }, { x: Number.NaN, y: 0 }, 6)).toEqual([]);
  });

  it('petit mouvement : un seul point, l’arrivée', () => {
    expect(strokePoints({ x: 0, y: 0 }, { x: 1, y: 1 }, STROKE_STEP_PX)).toEqual([{ x: 1, y: 1 }]);
  });
});

describe('AquariumView : passage de raclette (#604)', () => {
  for (const kind of ['mouse', 'touch']) {
    it(`${kind} : glisser transmet les points et coupe la caméra le temps du geste`, () => {
      const { view, canvas } = create();
      const points: [number, number][] = [];
      const calls: number[] = [];
      view.onStroke((batch) => {
        calls.push(batch.length);
        points.push(...batch.map((p): [number, number] => [p.x, p.y]));
      });
      view.setStrokeEnabled(true);
      canvas.dispatchEvent(pointer('pointerdown', 100, 100, kind));
      expect(view.stroking).toBe(true);
      expect(controlsOf(view).enabled).toBe(false);
      canvas.dispatchEvent(pointer('pointermove', 130, 100, kind));
      canvas.dispatchEvent(pointer('pointerup', 130, 100, kind));
      expect(view.stroking).toBe(false);
      expect(controlsOf(view).enabled).toBe(true);
      expect(points[0]).toEqual([100, 100]);
      expect(points.at(-1)).toEqual([130, 100]);
      expect(points.length).toBe(1 + Math.ceil(30 / STROKE_STEP_PX));
      // Un appel par événement (#617) : l'appui, puis tous les points du glissé ensemble.
      expect(calls).toEqual([1, Math.ceil(30 / STROKE_STEP_PX)]);
      // Relâché : un mouvement ne transmet plus rien.
      canvas.dispatchEvent(pointer('pointermove', 200, 100, kind));
      expect(points.at(-1)).toEqual([130, 100]);
      expect(calls).toHaveLength(2);
      view.dispose();
    });
  }

  it('mouvement sur place : aucun appel (jamais de lot vide, #617)', () => {
    const { view, canvas } = create();
    const calls: number[] = [];
    view.onStroke((batch) => calls.push(batch.length));
    view.setStrokeEnabled(true);
    canvas.dispatchEvent(pointer('pointerdown', 100, 100));
    canvas.dispatchEvent(pointer('pointermove', 100, 100));
    expect(calls).toEqual([1]);
    view.dispose();
  });

  it('non autorisé : glisser tourne la caméra comme avant, rien n’est transmis', () => {
    const { view, canvas } = create();
    const points: number[] = [];
    view.onStroke((batch) => points.push(...batch.map((p) => p.x)));
    canvas.dispatchEvent(pointer('pointerdown', 100, 100));
    canvas.dispatchEvent(pointer('pointermove', 150, 100));
    expect(points).toEqual([]);
    expect(view.stroking).toBe(false);
    view.dispose();
  });

  it('couper en plein geste l’arrête et rend la caméra', () => {
    const { view, canvas } = create();
    view.onStroke(() => undefined);
    view.setStrokeEnabled(true);
    canvas.dispatchEvent(pointer('pointerdown', 100, 100));
    view.setStrokeEnabled(false);
    expect(view.stroking).toBe(false);
    expect(controlsOf(view).enabled).toBe(true);
    view.dispose();
  });

  it('pointeur annulé : passage terminé', () => {
    const { view, canvas } = create();
    view.onStroke(() => undefined);
    view.setStrokeEnabled(true);
    canvas.dispatchEvent(pointer('pointerdown', 100, 100));
    canvas.dispatchEvent(pointer('pointercancel', 100, 100));
    expect(view.stroking).toBe(false);
    view.dispose();
  });

  it('vue sans contrôles (capture) : aucun passage', () => {
    const { view, canvas } = create(false);
    const points: number[] = [];
    view.onStroke((batch) => points.push(...batch.map((p) => p.x)));
    view.setStrokeEnabled(true);
    canvas.dispatchEvent(pointer('pointerdown', 100, 100));
    expect(view.stroking).toBe(false);
    expect(points).toEqual([]);
    view.dispose();
  });

  it('désabonné : plus aucun point', () => {
    const { view, canvas } = create();
    const points: number[] = [];
    const off = view.onStroke((batch) => points.push(...batch.map((p) => p.x)));
    view.setStrokeEnabled(true);
    off();
    canvas.dispatchEvent(pointer('pointerdown', 100, 100));
    expect(points).toEqual([]);
    view.dispose();
  });
});
