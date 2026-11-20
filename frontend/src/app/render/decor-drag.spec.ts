import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { describe, expect, it } from 'vitest';

import type { DecorItem } from '../sim/decor';
import { tankCenter } from './camera-presets';
import { AquariumView, type AquariumRenderer, type DecorDragListener } from './aquarium-view';

/**
 * Caractérisation des gestes du pointeur de `AquariumView` (glisser du décor et de la pièce,
 * clics, caméra libre) avant leur extraction (#698) : ces tests figent le comportement actuel.
 */

/** Double minimal du renderer WebGL (jsdom n'a pas WebGL). */
class NullRenderer implements AquariumRenderer {
  setPixelRatio(): void {
    // Rien à consigner.
  }
  setSize(): void {
    // Rien à consigner.
  }
  setRenderTarget(): void {
    // Rien à consigner.
  }
  render(): void {
    // Rien à consigner.
  }
  dispose(): void {
    // Rien à consigner.
  }
}

const WIDTH = 800;
const HEIGHT = 600;

interface Fixture {
  readonly view: AquariumView;
  readonly canvas: HTMLCanvasElement;
  readonly captured: number[];
  readonly released: number[];
}

function create(interactive = true): Fixture {
  const canvas = document.createElement('canvas');
  canvas.getBoundingClientRect = () => new DOMRect(0, 0, WIDTH, HEIGHT);
  Object.defineProperty(canvas, 'clientWidth', { value: WIDTH });
  Object.defineProperty(canvas, 'clientHeight', { value: HEIGHT });
  const captured: number[] = [];
  const released: number[] = [];
  canvas.setPointerCapture = (id: number) => void captured.push(id);
  canvas.releasePointerCapture = (id: number) => void released.push(id);
  const view = new AquariumView({
    canvas,
    rendererFactory: () => new NullRenderer(),
    pixelRatio: 1,
    preset: 'three-quarter',
    interactive,
  });
  view.resize(WIDTH, HEIGHT);
  return { view, canvas, captured, released };
}

function pointer(
  type: string,
  x: number,
  y: number,
  options: { id?: number; button?: number; primary?: boolean; kind?: string } = {},
): Event {
  const event = new MouseEvent(type, { button: options.button ?? 0, clientX: x, clientY: y });
  Object.defineProperty(event, 'pointerId', { value: options.id ?? 1 });
  Object.defineProperty(event, 'isPrimary', { value: options.primary ?? true });
  Object.defineProperty(event, 'pointerType', { value: options.kind ?? 'mouse' });
  return event;
}

const controlsOf = (view: AquariumView) =>
  (view as unknown as { controls: OrbitControls }).controls;

/** Un rocher au centre du sable du bac. */
function rockAtCenter(view: AquariumView): DecorItem {
  const [x, , z] = tankCenter(view.dimensions);
  return { kind: 'rock', x, z, rotation: 0, scale: 2, seed: 7 };
}

/** Point de l'écran qui vise l'élément de décor 0 (balayage de l'écran, pas de 10 px). */
function screenPointOf(view: AquariumView, kind: 'item' | 'room-item'): { x: number; y: number } {
  const hits: { x: number; y: number }[] = [];
  for (let y = 5; y < HEIGHT; y += 10) {
    for (let x = 5; x < WIDTH; x += 10) {
      if (view.pickDecor(x, y)?.kind === kind) {
        hits.push({ x, y });
      }
    }
  }
  const hit = hits[Math.floor(hits.length / 2)];
  if (!hit) {
    throw new Error(`aucun point de l’écran ne vise ${kind}`);
  }
  return hit;
}

/** Premier point de l'écran qui vise la surface de l'eau (balayage, pas de 20 px). */
function surfacePoint(view: AquariumView): { x: number; y: number } {
  for (let y = 10; y < HEIGHT; y += 20) {
    for (let x = 10; x < WIDTH; x += 20) {
      if (view.pickWaterSurface(x, y)) {
        return { x, y };
      }
    }
  }
  throw new Error('aucun point de l’écran ne vise la surface');
}

/** Abonné qui consigne ses appels sous forme de texte. */
function recorder(): { readonly calls: string[]; readonly listener: DecorDragListener } {
  const calls: string[] = [];
  return {
    calls,
    listener: {
      start: (index) => calls.push(`start ${index}`),
      move: (index, x, z) => calls.push(`move ${index} ${x.toFixed(3)} ${z.toFixed(3)}`),
      end: (index, commit) => calls.push(`end ${index} ${commit}`),
    },
  };
}

function editableRock(): Fixture & {
  readonly calls: string[];
  readonly at: { x: number; y: number };
} {
  const fixture = create();
  fixture.view.setDecor([rockAtCenter(fixture.view)], 1);
  const { calls, listener } = recorder();
  fixture.view.onDecorDrag(listener);
  fixture.view.setDecorDragEnabled(true);
  return { ...fixture, calls, at: screenPointOf(fixture.view, 'item') };
}

describe('AquariumView : glisser du décor (#168, caractérisation #698)', () => {
  it('appui sur un élément : glissement commencé, caméra coupée, curseur saisi, pointeur capturé', () => {
    const { view, canvas, calls, at, captured } = editableRock();
    canvas.dispatchEvent(pointer('pointerdown', at.x, at.y, { id: 4 }));
    expect(view.decorDragging).toBe(true);
    expect(controlsOf(view).enabled).toBe(false);
    expect(canvas.style.cursor).toBe('grabbing');
    expect(captured).toEqual([4]);
    expect(calls).toEqual(['start 0']);
    view.dispose();
  });

  it('glisser puis relâcher : déplacements sur le sable, prise gardée, fin validée', () => {
    const { view, canvas, calls, at, released } = editableRock();
    canvas.dispatchEvent(pointer('pointerdown', at.x, at.y));
    // Sous le seuil du clic : rien n'est transmis.
    canvas.dispatchEvent(pointer('pointermove', at.x + 1, at.y));
    expect(calls).toEqual(['start 0']);
    canvas.dispatchEvent(pointer('pointermove', at.x + 40, at.y));
    canvas.dispatchEvent(pointer('pointermove', at.x, at.y));
    canvas.dispatchEvent(pointer('pointerup', at.x, at.y));
    expect(calls).toHaveLength(4);
    expect(calls[1]).toMatch(/^move 0 /);
    // Revenu au point de l'appui : l'élément revient à sa place (décalage de la prise gardé).
    const [x, , z] = tankCenter(view.dimensions);
    expect(calls[2]).toBe(`move 0 ${x.toFixed(3)} ${z.toFixed(3)}`);
    expect(calls[3]).toBe('end 0 true');
    expect(view.decorDragging).toBe(false);
    expect(controlsOf(view).enabled).toBe(true);
    expect(canvas.style.cursor).toBe('');
    expect(released).toEqual([1]);
    view.dispose();
  });

  it('appui relâché sans bouger : fin non validée, et le clic est transmis', () => {
    const { view, canvas, calls, at } = editableRock();
    const clicks: string[] = [];
    view.onCanvasClick((x, y) => clicks.push(`${x},${y}`));
    canvas.dispatchEvent(pointer('pointerdown', at.x, at.y));
    canvas.dispatchEvent(pointer('pointerup', at.x, at.y));
    expect(calls).toEqual(['start 0', 'end 0 false']);
    expect(clicks).toEqual([`${at.x},${at.y}`]);
    view.dispose();
  });

  it('pointeur annulé ou glissement coupé : fin non validée, caméra rendue', () => {
    const { view, canvas, calls, at } = editableRock();
    canvas.dispatchEvent(pointer('pointerdown', at.x, at.y));
    canvas.dispatchEvent(pointer('pointermove', at.x + 40, at.y));
    canvas.dispatchEvent(pointer('pointercancel', at.x + 40, at.y));
    expect(calls.at(-1)).toBe('end 0 false');
    canvas.dispatchEvent(pointer('pointerdown', at.x, at.y));
    canvas.dispatchEvent(pointer('pointermove', at.x + 40, at.y));
    view.setDecorDragEnabled(false);
    expect(calls.at(-1)).toBe('end 0 false');
    expect(view.decorDragging).toBe(false);
    expect(controlsOf(view).enabled).toBe(true);
    view.dispose();
  });

  it('autre pointeur, bouton secondaire ou pointeur non principal : aucun glissement', () => {
    const { view, canvas, calls, at } = editableRock();
    canvas.dispatchEvent(pointer('pointerdown', at.x, at.y, { button: 2 }));
    canvas.dispatchEvent(pointer('pointerdown', at.x, at.y, { primary: false }));
    expect(calls).toEqual([]);
    canvas.dispatchEvent(pointer('pointerdown', at.x, at.y, { id: 1 }));
    canvas.dispatchEvent(pointer('pointermove', at.x + 40, at.y, { id: 2 }));
    canvas.dispatchEvent(pointer('pointerup', at.x + 40, at.y, { id: 2 }));
    expect(calls).toEqual(['start 0']);
    expect(view.decorDragging).toBe(true);
    view.dispose();
  });

  it('appui dans le vide, édition coupée ou sans abonné : la caméra garde la main', () => {
    const { view, canvas, calls, at } = editableRock();
    canvas.dispatchEvent(pointer('pointerdown', 5, 5));
    expect(view.decorDragging).toBe(false);
    view.setDecorDragEnabled(false);
    canvas.dispatchEvent(pointer('pointerdown', at.x, at.y));
    expect(view.decorDragging).toBe(false);
    view.setDecorDragEnabled(true);
    view.onDecorDrag({ start: () => undefined, move: () => undefined, end: () => undefined })();
    canvas.dispatchEvent(pointer('pointerdown', at.x, at.y));
    expect(view.decorDragging).toBe(false);
    expect(calls).toEqual([]);
    expect(controlsOf(view).enabled).toBe(true);
    view.dispose();
  });

  it('un ancien désabonnement ne retire pas le nouvel abonné', () => {
    const { view, canvas, at } = editableRock();
    const off = view.onDecorDrag(recorder().listener);
    const second = recorder();
    view.onDecorDrag(second.listener);
    off();
    canvas.dispatchEvent(pointer('pointerdown', at.x, at.y));
    expect(second.calls).toEqual(['start 0']);
    view.dispose();
  });

  it('vue non interactive (capture) : aucun glissement', () => {
    const fixture = create(false);
    fixture.view.setDecor([rockAtCenter(fixture.view)], 1);
    const { calls, listener } = recorder();
    fixture.view.onDecorDrag(listener);
    fixture.view.setDecorDragEnabled(true);
    const at = screenPointOf(fixture.view, 'item');
    fixture.canvas.dispatchEvent(pointer('pointerdown', at.x, at.y));
    expect(calls).toEqual([]);
    expect(fixture.view.decorDragging).toBe(false);
    fixture.view.dispose();
  });

  it('pendant un glissement, la raclette ne démarre pas', () => {
    const { view, canvas, at } = editableRock();
    const strokes: number[] = [];
    view.onStroke((points) => strokes.push(points.length));
    view.setStrokeEnabled(true);
    canvas.dispatchEvent(pointer('pointerdown', at.x, at.y));
    expect(view.decorDragging).toBe(true);
    expect(view.stroking).toBe(false);
    expect(strokes).toEqual([]);
    view.dispose();
  });
});

describe('AquariumView : glisser d’un élément de la pièce (#188, caractérisation #698)', () => {
  function roomFixture(): Fixture & { readonly at: { x: number; y: number } } {
    const fixture = create();
    fixture.view.setRoom({ shown: true, cabinetHeight: 0.75 });
    const floor = fixture.view.pickDecor(50, 550);
    if (floor?.kind !== 'floor') {
      throw new Error('parquet attendu');
    }
    fixture.view.setRoom({
      shown: true,
      cabinetHeight: 0.75,
      items: [{ kind: 'table-basse', x: floor.x, z: floor.z, quarter: 0 }],
    });
    fixture.view.setDecorDragEnabled(true);
    return { ...fixture, at: screenPointOf(fixture.view, 'room-item') };
  }

  it('avec les deux abonnés : seul celui de la pièce est appelé, sur le plan de la base', () => {
    const { view, canvas, at } = roomFixture();
    const decor = recorder();
    const room = recorder();
    view.onDecorDrag(decor.listener);
    view.onRoomDrag(room.listener);
    canvas.dispatchEvent(pointer('pointerdown', at.x, at.y));
    canvas.dispatchEvent(pointer('pointermove', at.x + 30, at.y));
    canvas.dispatchEvent(pointer('pointerup', at.x + 30, at.y));
    expect(decor.calls).toEqual([]);
    expect(room.calls[0]).toBe('start 0');
    expect(room.calls[1]).toMatch(/^move 0 /);
    expect(room.calls.at(-1)).toBe('end 0 true');
    view.dispose();
  });

  it('sans abonné de la pièce, ou sans abonné du décor : aucun glissement', () => {
    const { view, canvas, at } = roomFixture();
    const decor = recorder();
    view.onDecorDrag(decor.listener);
    canvas.dispatchEvent(pointer('pointerdown', at.x, at.y));
    expect(view.decorDragging).toBe(false);
    expect(decor.calls).toEqual([]);
    view.onDecorDrag(recorder().listener)();
    const room = recorder();
    view.onRoomDrag(room.listener);
    canvas.dispatchEvent(pointer('pointerdown', at.x, at.y));
    expect(view.decorDragging).toBe(false);
    expect(room.calls).toEqual([]);
    view.dispose();
  });
});

describe('AquariumView : clics sur le canvas (#67, caractérisation #698)', () => {
  it('clic : abonnés du canvas puis de la surface, avec le point visé', () => {
    const { view, canvas } = create();
    const calls: string[] = [];
    view.onCanvasClick(() => calls.push('canvas'));
    view.onSurfaceClick(() => calls.push('surface'));
    const at = surfacePoint(view);
    canvas.dispatchEvent(pointer('pointerdown', at.x, at.y));
    canvas.dispatchEvent(pointer('pointerup', at.x, at.y));
    expect(calls).toEqual(['canvas', 'surface']);
    // Hors du bac : le clic du canvas seul.
    canvas.dispatchEvent(pointer('pointerdown', 2, 2));
    canvas.dispatchEvent(pointer('pointerup', 2, 2));
    expect(calls).toEqual(['canvas', 'surface', 'canvas']);
    view.dispose();
  });

  it('glisser, autre pointeur, bouton secondaire ou pointeur annulé : aucun clic', () => {
    const { view, canvas } = create();
    const calls: string[] = [];
    const off = view.onCanvasClick(() => calls.push('canvas'));
    canvas.dispatchEvent(pointer('pointerdown', 100, 100));
    canvas.dispatchEvent(pointer('pointerup', 160, 100));
    canvas.dispatchEvent(pointer('pointerdown', 100, 100, { id: 1 }));
    canvas.dispatchEvent(pointer('pointerup', 100, 100, { id: 2 }));
    canvas.dispatchEvent(pointer('pointerdown', 100, 100, { button: 2 }));
    canvas.dispatchEvent(pointer('pointerup', 100, 100, { button: 2 }));
    canvas.dispatchEvent(pointer('pointerdown', 100, 100));
    canvas.dispatchEvent(pointer('pointercancel', 100, 100));
    canvas.dispatchEvent(pointer('pointerup', 100, 100));
    expect(calls).toEqual([]);
    off();
    canvas.dispatchEvent(pointer('pointerdown', 100, 100));
    canvas.dispatchEvent(pointer('pointerup', 100, 100));
    expect(calls).toEqual([]);
    view.dispose();
  });

  it('vue non interactive ou libérée : aucun clic', () => {
    const { view, canvas } = create(false);
    const calls: string[] = [];
    view.onCanvasClick(() => calls.push('canvas'));
    canvas.dispatchEvent(pointer('pointerdown', 100, 100));
    canvas.dispatchEvent(pointer('pointerup', 100, 100));
    view.dispose();
    const second = create();
    second.view.onCanvasClick(() => calls.push('canvas'));
    second.view.dispose();
    second.canvas.dispatchEvent(pointer('pointerdown', 100, 100));
    second.canvas.dispatchEvent(pointer('pointerup', 100, 100));
    expect(calls).toEqual([]);
  });
});

describe('AquariumView : gestes de la caméra libre (#343, #344, caractérisation #698)', () => {
  function freeFixture(): Fixture {
    const fixture = create();
    fixture.view.setRoom({ shown: true, cabinetHeight: 0.75 });
    expect(fixture.view.enterFreeCamera()).toBe(true);
    return fixture;
  }

  it('second doigt : pincement, plus d’orientation ni de clic du premier doigt', () => {
    const { view, canvas } = freeFixture();
    const clicks: string[] = [];
    view.onCanvasClick(() => clicks.push('clic'));
    const touch = { kind: 'touch' } as const;
    canvas.dispatchEvent(pointer('pointerdown', 300, 300, { ...touch, id: 1 }));
    canvas.dispatchEvent(pointer('pointerdown', 400, 300, { ...touch, id: 2, primary: false }));
    canvas.dispatchEvent(pointer('pointerup', 300, 300, { ...touch, id: 1 }));
    expect(clicks).toEqual([]);
    view.dispose();
  });

  it('pendant une raclette, glisser n’oriente pas la caméra libre', () => {
    const { view, canvas } = freeFixture();
    view.onStroke(() => undefined);
    view.setStrokeEnabled(true);
    const before = view.freeCameraState?.yaw;
    canvas.dispatchEvent(pointer('pointerdown', 300, 300));
    canvas.dispatchEvent(pointer('pointermove', 400, 300));
    expect(view.stroking).toBe(true);
    expect(view.freeCameraState?.yaw).toBe(before);
    canvas.dispatchEvent(pointer('pointerup', 400, 300));
    // Raclette finie en caméra libre : les contrôles orbitaux restent coupés.
    expect(controlsOf(view).enabled).toBe(false);
    view.dispose();
  });

  it('libérée : plus aucun geste n’oriente la caméra', () => {
    const { view, canvas } = freeFixture();
    const changes: number[] = [];
    view.onCameraChange(() => changes.push(1));
    view.dispose();
    canvas.dispatchEvent(pointer('pointerdown', 300, 300));
    canvas.dispatchEvent(pointer('pointermove', 400, 300));
    expect(changes).toEqual([]);
    expect(view.freeCameraActive).toBe(false);
  });
});
