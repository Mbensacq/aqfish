import type { Camera, Scene, WebGLRenderTarget } from 'three';

import { SPECIES, speciesVariants } from '../sim/species';
import { createDefaultWorld } from '../sim/world';
import { AquariumView, type AquariumRenderer } from './aquarium-view';
import { cameraPresetPose } from './camera-presets';

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

  it('crée une couche de poissons par apparence de chaque espèce de SPECIES, dans l’ordre', () => {
    expect(view.fishLayerSpecies).toEqual(
      Object.values(SPECIES).flatMap((def) => speciesVariants(def).map(() => def.id)),
    );
    expect(view.fishLayerNames).toEqual([
      'poissons-neon',
      'poissons-guppy-male',
      'poissons-guppy-femelle',
      'poissons-corydora',
    ]);
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

describe('AquariumView (transitions de caméra)', () => {
  let view: AquariumView;
  const presetPosition = (preset: 'top' | 'front' | 'side') =>
    cameraPresetPose(preset, view.dimensions, view.camera.aspect).position;

  function create(interactive: boolean): AquariumView {
    const v = new AquariumView({
      canvas: document.createElement('canvas'),
      rendererFactory: () => new RecordingRenderer(),
      pixelRatio: 1,
      preset: 'front',
      interactive,
    });
    v.resize(640, 360);
    return v;
  }

  afterEach(() => view.dispose());

  it('part de la pose courante et arrive exactement sur le préréglage', () => {
    view = create(true);
    const start = view.cameraPosition();
    view.animateToPreset('top', 0.5);
    expect(view.transitioning).toBe(true);
    // Aucun pas : la caméra n'a pas encore bougé.
    expect(view.cameraPosition()).toEqual(start);

    expect(view.stepCameraTransition(0.25)).toBe(true);
    const mid = view.cameraPosition();
    expect(mid).not.toEqual(start);
    expect(view.transitioning).toBe(true);

    expect(view.stepCameraTransition(0.25)).toBe(true);
    expect(view.transitioning).toBe(false);
    view.cameraPosition().forEach((c, i) => expect(c).toBeCloseTo(presetPosition('top')[i], 9));
    // Terminé : plus rien à avancer.
    expect(view.stepCameraTransition(0.1)).toBe(false);
  });

  it('un grand pas de temps termine la transition sans la dépasser', () => {
    view = create(true);
    view.animateToPreset('side', 0.5);
    view.stepCameraTransition(10);
    view.cameraPosition().forEach((c, i) => expect(c).toBeCloseTo(presetPosition('side')[i], 9));
  });

  it('ignore les pas de temps négatifs ou non finis', () => {
    view = create(true);
    const start = view.cameraPosition();
    view.animateToPreset('side', 0.5);
    view.stepCameraTransition(-1);
    view.stepCameraTransition(Number.NaN);
    view.cameraPosition().forEach((c, i) => expect(c).toBeCloseTo(start[i], 9));
    expect(view.transitioning).toBe(true);
  });

  it('mode capture (contrôles inactifs) ou durée nulle : placement instantané', () => {
    view = create(false);
    view.animateToPreset('top', 0.5);
    expect(view.transitioning).toBe(false);
    view.cameraPosition().forEach((c, i) => expect(c).toBeCloseTo(presetPosition('top')[i], 9));
    view.dispose();

    view = create(true);
    view.animateToPreset('side', 0);
    expect(view.transitioning).toBe(false);
    view.cameraPosition().forEach((c, i) => expect(c).toBeCloseTo(presetPosition('side')[i], 9));
  });

  it('applyPreset annule une transition en cours', () => {
    view = create(true);
    view.animateToPreset('top', 0.5);
    view.applyPreset('side');
    expect(view.transitioning).toBe(false);
    expect(view.stepCameraTransition(0.5)).toBe(false);
  });

  it('une interaction à la souris annule la transition', () => {
    const canvas = document.createElement('canvas');
    view = new AquariumView({
      canvas,
      rendererFactory: () => new RecordingRenderer(),
      pixelRatio: 1,
      preset: 'front',
      interactive: true,
    });
    view.resize(640, 360);
    view.animateToPreset('top', 0.5);
    view.stepCameraTransition(0.1);
    // OrbitControls émet « start » au début d'un geste (molette ici).
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, cancelable: true }));
    expect(view.transitioning).toBe(false);
  });

  it('ne fait rien après destruction', () => {
    view = create(true);
    view.dispose();
    view.animateToPreset('top', 0.5);
    expect(view.transitioning).toBe(false);
  });
});

describe('AquariumView (filtre de rendu)', () => {
  let renderer: RecordingRenderer;
  let view: AquariumView;

  function createView(filter?: 'pixel' | 'aucun', interactive = false): AquariumView {
    return new AquariumView({
      canvas: document.createElement('canvas'),
      rendererFactory: () => renderer,
      pixelRatio: 1,
      preset: 'three-quarter',
      interactive,
      filter,
    });
  }

  beforeEach(() => {
    renderer = new RecordingRenderer();
  });

  afterEach(() => view.dispose());

  it('pixel art par défaut', () => {
    view = createView();
    expect(view.filter).toBe('pixel');
  });

  it('filtre aucun : la scène est rendue directement à l’écran, sans passe palette', () => {
    view = createView('aucun');
    view.resize(1280, 721);
    renderer.calls.length = 0;
    expect(view.renderFrame()).toBe(true);
    expect(renderer.calls).toEqual(['cible écran', 'render PerspectiveCamera']);
  });

  it('filtre aucun : rapport d’aspect du canvas (pleine résolution), pas de la cible', () => {
    view = createView('aucun');
    view.resize(1280, 721);
    expect(view.camera.aspect).toBeCloseTo(1280 / 721, 10);
  });

  it('bascule à chaud dans les deux sens sans déplacer la caméra', () => {
    view = createView('pixel', true);
    view.resize(1280, 721);
    const position = view.cameraPosition();
    const target = view.cameraTarget();

    expect(view.setFilter('aucun')).toBe(true);
    expect(view.filter).toBe('aucun');
    expect(view.camera.aspect).toBeCloseTo(1280 / 721, 10);
    renderer.calls.length = 0;
    view.renderFrame();
    expect(renderer.calls).toEqual(['cible écran', 'render PerspectiveCamera']);

    expect(view.setFilter('pixel')).toBe(true);
    expect(view.camera.aspect).toBeCloseTo(427 / 241, 10);
    renderer.calls.length = 0;
    view.renderFrame();
    expect(renderer.calls).toEqual([
      'cible 427x241',
      'render PerspectiveCamera',
      'cible écran',
      'render OrthographicCamera',
    ]);
    expect(view.cameraPosition()).toEqual(position);
    expect(view.cameraTarget()).toEqual(target);
  });

  it('la bascule conserve une transition de caméra en cours', () => {
    view = createView('pixel', true);
    view.resize(1280, 721);
    view.animateToPreset('top', 1);
    view.stepCameraTransition(0.25);
    view.setFilter('aucun');
    expect(view.transitioning).toBe(true);
  });

  it('même filtre, avant toute taille ou après destruction : sans effet', () => {
    view = createView('pixel');
    expect(view.setFilter('pixel')).toBe(false);
    // Avant redimensionnement : le filtre change, le rapport d'aspect suivra au resize.
    expect(view.setFilter('aucun')).toBe(true);
    view.resize(600, 300);
    expect(view.camera.aspect).toBeCloseTo(2, 10);
    view.dispose();
    expect(view.setFilter('pixel')).toBe(false);
    expect(view.filter).toBe('aucun');
  });

  it('la cible basse résolution reste à jour en mode aucun (retour au pixel art immédiat)', () => {
    view = createView('aucun');
    view.resize(900, 600);
    view.setFilter('pixel');
    renderer.calls.length = 0;
    view.renderFrame();
    expect(renderer.calls[0]).toBe('cible 300x200');
  });
});
