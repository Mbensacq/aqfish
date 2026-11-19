import { signal } from '@angular/core';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import type { CameraPreset } from '../../core/capture/capture-params';
import { DEFAULT_FOOD_STYLE } from '../../core/food-style/food-style';
import { AquariumView, type AquariumRenderer } from '../../render/aquarium-view';
import { DEFAULT_ROOM } from '../../sim/room';
import { createWorld } from '../../sim/world';
import type { World } from '../../sim/world-types';
import { AquariumProbe } from './aquarium-probe';
import { ViewBuilder, type ViewControllers } from './view-builder';

/** Double minimal du renderer WebGL (jsdom n'a pas WebGL). */
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

describe('ViewBuilder (#696)', () => {
  let world: World | null;
  let view: AquariumView | null;
  let presets: (CameraPreset | null)[];
  let calls: string[];
  let renderers: NullRenderer[];
  let cleanups: (() => void)[];
  let builder: ViewBuilder;

  beforeEach(() => {
    world = createWorld(3, [{ species: 'neon', count: 1 }], [], [], 'tropical');
    view = null;
    presets = [];
    calls = [];
    renderers = [];
    cleanups = [];
    const controllers = {
      display: {
        decorVisible: signal(true),
        foodStyle: signal(DEFAULT_FOOD_STYLE),
        room: signal(DEFAULT_ROOM),
        rain: signal(false),
        applyFoodStyle: () => calls.push('granulés'),
        applyRoom: () => calls.push('pièce'),
        applyRain: () => calls.push('pluie'),
        applyReducedMotion: () => calls.push('mouvements'),
      },
      readouts: {
        water: signal({ quality: 1, tea: 0 }),
        refreshCurrent: () => calls.push('courant'),
      },
      looks: { refresh: () => calls.push('aspect') },
      painter: { relight: () => calls.push('éclairage') },
      free: { reset: () => calls.push('orbite') },
      care: { strokeEnabled: () => false, stroke: () => undefined },
      decorEdit: {
        editing: signal(false),
        startDrag: () => undefined,
        moveDrag: () => undefined,
        endDrag: () => undefined,
        viewCreated: () => calls.push('décor prêt'),
      },
      roomEdit: {
        startDrag: () => undefined,
        moveDrag: () => undefined,
        endDrag: () => undefined,
        viewCreated: () => calls.push('pièce prête'),
      },
      tools: { canvasClick: () => undefined, surfaceClick: () => undefined },
    } as unknown as ViewControllers;
    builder = new ViewBuilder({
      probe: new AquariumProbe(document.createElement('div')),
      rendererFactory: () => {
        const renderer = new NullRenderer();
        renderers.push(renderer);
        return renderer;
      },
      controllers: () => controllers,
      canvas: () => document.createElement('canvas'),
      world: () => world,
      view: () => view,
      setView: (next) => {
        view = next;
        calls.push('vue');
      },
      pixelRatio: () => 1,
      interactive: () => false,
      filter: () => 'pixel',
      setActivePreset: (preset) => presets.push(preset),
      viewCleanups: cleanups,
    });
  });

  afterEach(() => view?.dispose());

  it('ne crée rien avant le démarrage', () => {
    world = null;
    builder.build('front');
    expect(view).toBeNull();
    expect(calls).toEqual([]);
  });

  it('crée la vue puis applique l’état courant dans l’ordre, sur le préréglage demandé', () => {
    builder.build('top');
    expect(view).toBeInstanceOf(AquariumView);
    expect(calls).toEqual([
      'vue',
      'granulés',
      'pièce',
      'pluie',
      'aspect',
      'courant',
      'mouvements',
      'éclairage',
      'orbite',
      'décor prêt',
      'pièce prête',
    ]);
    expect(presets).toEqual(['top']);
    expect(cleanups.length).toBeGreaterThan(0);
  });

  it('libère la vue précédente et ses abonnements avant d’en créer une autre', () => {
    builder.build('front');
    const first = view;
    let released = 0;
    cleanups.push(() => released++);
    const count = cleanups.length;
    builder.build('three-quarter');
    expect(view).not.toBe(first);
    expect(released).toBe(1);
    expect(renderers[0]!.calls.filter((call) => call === 'dispose')).toHaveLength(1);
    expect(cleanups.length).toBe(count - 1);
  });

  it('suit la caméra : une interaction de l’utilisateur quitte le préréglage', () => {
    builder.build('front');
    const { controls } = view as unknown as { controls: OrbitControls };
    controls.dispatchEvent({ type: 'start' });
    expect(presets.at(-1)).toBeNull();
  });
});
