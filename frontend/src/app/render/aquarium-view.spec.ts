import type { Camera, Scene, WebGLRenderTarget } from 'three';

import { createDefaultWorld } from '../sim/world';
import { AquariumView, type AquariumRenderer } from './aquarium-view';

/** Double du renderer WebGL qui consigne les appels (jsdom n'a pas WebGL). */
class RecordingRenderer implements AquariumRenderer {
  readonly calls: string[] = [];
  /** Taille de la cible au moment de chaque `setRenderTarget` (`null` : écran). */
  readonly targetSizes: ([number, number] | null)[] = [];
  setPixelRatio(ratio: number): void {
    this.calls.push(`pixelRatio ${ratio}`);
  }
  setSize(width: number, height: number): void {
    this.calls.push(`setSize ${width}x${height}`);
  }
  setRenderTarget(target: WebGLRenderTarget | null): void {
    this.targetSizes.push(target === null ? null : [target.width, target.height]);
    this.calls.push(target === null ? 'cible écran' : `cible ${target.width}x${target.height}`);
  }
  render(_scene: Scene, camera: Camera): void {
    this.calls.push(`render ${camera.type}`);
  }
  dispose(): void {
    this.calls.push('dispose');
  }
}

describe('AquariumView (pipeline pixel art)', () => {
  let renderer: RecordingRenderer;
  let view: AquariumView;

  beforeEach(() => {
    renderer = new RecordingRenderer();
    view = new AquariumView({
      canvas: document.createElement('canvas'),
      rendererFactory: () => renderer,
      pixelRatio: 1,
      preset: 'three-quarter',
      interactive: false,
    });
  });

  afterEach(() => view.dispose());

  it('ne rend rien tant que la taille est nulle', () => {
    expect(view.renderFrame()).toBe(false);
    expect(renderer.calls.filter((c) => c.startsWith('render'))).toEqual([]);
  });

  it('rend la scène dans la cible basse résolution, puis la passe palette à l’écran', () => {
    view.resize(1280, 721);
    renderer.calls.length = 0;
    expect(view.renderFrame()).toBe(true);
    expect(renderer.calls).toEqual([
      'cible 427x241',
      'render PerspectiveCamera',
      'cible écran',
      'render OrthographicCamera',
    ]);
  });

  it('cale le rapport d’aspect de la caméra sur la cible', () => {
    view.resize(1280, 721);
    expect(view.camera.aspect).toBeCloseTo(427 / 241, 10);
  });

  it('la cible suit le redimensionnement', () => {
    view.resize(900, 600);
    view.renderFrame();
    view.resize(300, 30);
    view.renderFrame();
    expect(renderer.targetSizes.filter((t) => t !== null)).toEqual([
      [300, 200],
      [100, 10],
    ]);
  });

  it('libère le renderer à la destruction, une seule fois', () => {
    view.dispose();
    view.dispose();
    expect(renderer.calls.filter((c) => c === 'dispose')).toEqual(['dispose']);
    expect(view.renderFrame()).toBe(false);
  });

  it('place les poissons du monde avant le rendu ; ignore les appels après destruction', () => {
    const world = createDefaultWorld(42);
    view.updateFish(world.entities, 0.5);
    expect(view.fishCount).toBe(world.entities.length);
    view.dispose();
    view.updateFish([], 0);
    expect(view.fishCount).toBe(world.entities.length);
  });
});
