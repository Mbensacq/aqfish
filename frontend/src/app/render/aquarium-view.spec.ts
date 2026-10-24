import { MOUSE, TOUCH, type Camera, type Scene, type WebGLRenderTarget } from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { ORBIT_MOUSE_BUTTONS, ORBIT_TOUCHES } from '../core/commands/commands';

import { lightAt } from '../sim/daylight';
import { SPECIES, speciesVariants } from '../sim/species';
import { environmentWater, PALUDARIUM, POND, REEF, TROPICAL_TANK } from '../sim/environment';
import { lilyPadLayout } from '../sim/lily-pads';
import { createDefaultWorld, createWorld, seededFeatures } from '../sim/world';
import {
  AquariumView,
  ORBIT_MOUSE_ACTIONS,
  ORBIT_TOUCH_ACTIONS,
  type AquariumRenderer,
} from './aquarium-view';
import { cameraPresetPose } from './camera-presets';
import { DECOR_NIGHT_TINT, NIGHT_FLAT_BRIGHTNESS, TONE_PENALTY_OFF } from './night-shade';

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

  it('granulés (#117) : taille selon le zoom à chaque image, rendu points ou voxels', () => {
    // Vue trois-quarts du bac tropical en 1280 × 720 : 2 pixels de scène, comme avant #117.
    view.resize(1280, 720);
    view.renderFrame();
    expect(view.foodPointSize).toBe(2);
    // Écran étroit (téléphone en portrait) : caméra plus loin, 1 pixel.
    view.resize(390, 844);
    view.renderFrame();
    expect(view.foodPointSize).toBe(1);
    expect(view.foodStyle).toBe('points');
    view.setFoodStyle('voxels');
    expect(view.foodStyle).toBe('voxels');
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
      'poissons-koi-kohaku',
      'poissons-koi-orenji',
      'poissons-koi-sanke',
      'poissons-axolotl',
      'poissons-grenouille',
      'poissons-triton',
      'poissons-clown',
      'poissons-chirurgien',
    ]);
  });

  it('parcourt les couches d’effets (bulles, pluie, feuilles mortes) dans une liste (#125, #107)', () => {
    expect(view.effectLayerNames).toEqual(['bulles', 'pluie', 'feuilles-mortes']);
  });

  it('place les poissons du monde avant le rendu ; ignore les appels après destruction', () => {
    const world = createDefaultWorld(42);
    view.updateFish(world.entities, 0.5);
    expect(view.fishCount).toBe(world.entities.length);
    view.dispose();
    view.updateFish([], 0);
    expect(view.fishCount).toBe(world.entities.length);
  });

  it('lumière du jour : poissons et bulles assombris la nuit, intacts à midi (ADR 0019)', () => {
    const layers = view.flatBrightnesses.length;
    expect(layers).toBe(view.fishLayerNames.length + 1);
    expect(view.flatBrightnesses).toEqual(Array(layers).fill(1));
    view.updateLight(lightAt(0));
    expect(view.flatBrightnesses).toEqual(Array(layers).fill(NIGHT_FLAT_BRIGHTNESS));
    view.updateLight(lightAt(18));
    for (const b of view.flatBrightnesses) {
      expect(b).toBeGreaterThan(NIGHT_FLAT_BRIGHTNESS);
      expect(b).toBeLessThan(1);
    }
    view.updateLight(lightAt(12));
    expect(view.flatBrightnesses).toEqual(Array(layers).fill(1));
    view.dispose();
    view.updateLight(lightAt(0)); // ignoré après destruction
    expect(view.flatBrightnesses).toEqual(Array(layers).fill(1));
  });

  it('lumière du jour : décor teinté et tons de nuit la nuit, rien à midi (ADR 0021)', () => {
    const off = [TONE_PENALTY_OFF, TONE_PENALTY_OFF];
    expect(view.decorTintValue).toEqual([1, 1, 1]);
    expect(view.tonePenalties).toEqual(off);
    view.updateLight(lightAt(0));
    for (let k = 0; k < 3; k++) {
      expect(view.decorTintValue[k]).toBeCloseTo(DECOR_NIGHT_TINT[k], 6);
    }
    expect(view.tonePenalties).toEqual([0, TONE_PENALTY_OFF]);
    view.updateLight(lightAt(18));
    expect(view.tonePenalties[1]).toBe(0);
    expect(view.tonePenalties[0]).toBeGreaterThan(0);
    expect(view.tonePenalties[0]).toBeLessThan(TONE_PENALTY_OFF);
    view.updateLight(lightAt(12));
    expect(view.decorTintValue).toEqual([1, 1, 1]);
    expect(view.tonePenalties).toEqual(off);
  });

  it('setDecorVisible masque puis réaffiche le décor sans le détruire (#52)', () => {
    const world = createDefaultWorld(42);
    view.setDecor(world.decor, world.seed);
    expect(view.decorVisible).toBe(true);
    view.setDecorVisible(false);
    expect(view.decorVisible).toBe(false);
    expect(view.decorCount).toBe(world.decor.length);
    view.setDecorVisible(true);
    expect(view.decorVisible).toBe(true);
    view.dispose();
    view.setDecorVisible(false); // sans effet après destruction
    expect(view.decorVisible).toBe(true);
  });

  it('affiche le décor du monde ; ignore setDecor après destruction', () => {
    const world = createDefaultWorld(42);
    expect(view.decorCount).toBe(0);
    view.setDecor(world.decor, world.seed);
    expect(view.decorCount).toBe(world.decor.length);
    expect(world.decor.length).toBeGreaterThan(0);
    view.dispose();
    expect(view.decorCount).toBe(0); // libéré avec la vue
    view.setDecor(world.decor, world.seed);
    expect(view.decorCount).toBe(0);
  });
});

describe('AquariumView (tons d’environnement, #148)', () => {
  it('le récif propose ses six tons à la passe (eau, #148 ; coraux, #149 ; clown, #150 ; chirurgien, #151), les autres aucun', () => {
    for (const environment of [TROPICAL_TANK, POND, PALUDARIUM, REEF]) {
      const view = new AquariumView({
        canvas: document.createElement('canvas'),
        rendererFactory: () => new RecordingRenderer(),
        pixelRatio: 1,
        preset: 'three-quarter',
        interactive: false,
        environment,
      });
      const expected =
        environment === REEF ? [0, 0, 0, 0, 0, 0] : new Array<number>(6).fill(TONE_PENALTY_OFF);
      expect(view.environmentTonePenalties).toEqual(expected);
      // L'heure ne les touche pas.
      view.updateLight(lightAt(0));
      expect(view.environmentTonePenalties).toEqual(expected);
      view.dispose();
    }
  });
});

describe('AquariumView (coraux, #149)', () => {
  it('récif : coraux tirés de la graine du monde ; autres environnements sans corail', () => {
    for (const environment of [TROPICAL_TANK, POND, PALUDARIUM, REEF]) {
      const view = new AquariumView({
        canvas: document.createElement('canvas'),
        rendererFactory: () => new RecordingRenderer(),
        pixelRatio: 1,
        preset: 'three-quarter',
        interactive: false,
        environment,
      });
      const world = createDefaultWorld(42, environment.id);
      view.setDecor(world.decor, world.seed);
      // Coraux du monde : ils évitent les anémones (#150), comme dans `createWorld`.
      const { corals: expected, anemones } = seededFeatures(42, environment.id, world.decor);
      expect(view.coralCount).toBe(expected.length);
      // Anémones (#150) : affichées après les coraux, obstacles après eux.
      expect(view.anemoneCount).toBe(anemones.length);
      expect(view.coralCount + view.anemoneCount).toBe(world.obstacles.length - world.decor.length);
      expect(view.decorCount).toBe(world.decor.length + expected.length + anemones.length);
      if (environment === REEF) {
        expect(view.coralCount).toBeGreaterThanOrEqual(4);
        expect(view.anemoneCount).toBeGreaterThanOrEqual(2);
      } else {
        expect(view.anemoneCount).toBe(0);
      }
      view.dispose();
    }
  });
});

describe('AquariumView (nénuphars, #103)', () => {
  function createIn(environment = POND): AquariumView {
    return new AquariumView({
      canvas: document.createElement('canvas'),
      rendererFactory: () => new RecordingRenderer(),
      pixelRatio: 1,
      preset: 'top',
      interactive: false,
      environment,
    });
  }

  it('le bassin affiche les nénuphars tirés de la graine du monde', () => {
    const view = createIn();
    const world = createWorld(42, [], [], POND.decor, 'bassin');
    expect(view.lilyPadCount).toBe(0);
    view.setDecor(world.decor, world.seed);
    const expected = lilyPadLayout(42, environmentWater('bassin'), POND.lilyPads).length;
    expect(expected).toBeGreaterThan(0);
    expect(view.lilyPadCount).toBe(expected);
    view.updateDecor(30);
    view.updateLight(lightAt(0));
    view.dispose();
    expect(view.lilyPadCount).toBe(0); // libérés avec la vue
  });

  it('le bac tropical n’en a aucun', () => {
    const view = createIn(TROPICAL_TANK);
    const world = createDefaultWorld(42);
    view.setDecor(world.decor, world.seed);
    expect(view.lilyPadCount).toBe(0);
    view.dispose();
  });

  it('feuilles mortes (#107) : posées au temps simulé dans le bassin, jamais dans le bac', () => {
    const pond = createIn();
    const world = createWorld(42, [], [], POND.decor, 'bassin');
    pond.setDecor(world.decor, world.seed);
    pond.updateDecor(0);
    expect(pond.floatingLeafCount).toBe(0);
    pond.updateDecor(30);
    expect(pond.floatingLeafCount).toBeGreaterThanOrEqual(2);
    pond.dispose();

    const tank = createIn(TROPICAL_TANK);
    const tropical = createDefaultWorld(42);
    tank.setDecor(tropical.decor, tropical.seed);
    tank.updateDecor(30);
    expect(tank.floatingLeafCount).toBe(0);
    tank.dispose();
  });

  it('les fleurs s’ouvrent à midi et se ferment à minuit (updateFlowers, issue #104)', () => {
    const view = createIn();
    const world = createWorld(42, [], [], POND.decor, 'bassin');
    view.setDecor(world.decor, world.seed);
    view.updateFlowers(0);
    expect(view.flowerOpenness).toBe(0);
    view.updateFlowers(12);
    expect(view.flowerOpenness).toBe(1);
    view.updateFlowers(6.5);
    expect(view.flowerOpenness).toBeGreaterThan(0);
    expect(view.flowerOpenness).toBeLessThan(1);
    expect(() => view.updateFlowers(Number.NaN)).toThrow(RangeError);
    view.dispose();
    expect(() => view.updateFlowers(0)).not.toThrow(); // sans effet une fois libérée
  });

  it('masqués et réaffichés avec le décor', () => {
    const view = createIn();
    const world = createWorld(7, [], [], POND.decor, 'bassin');
    view.setDecor(world.decor, world.seed);
    view.setDecorVisible(false);
    expect(view.lilyPadsVisible).toBe(false);
    view.setDecorVisible(true);
    expect(view.lilyPadsVisible).toBe(true);
    view.dispose();
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

describe('AquariumView (gestes de la caméra, #74)', () => {
  it('règle OrbitControls d’après la déclaration des gestes (source de l’aide-mémoire)', () => {
    const view = new AquariumView({
      canvas: document.createElement('canvas'),
      rendererFactory: () => new RecordingRenderer(),
      pixelRatio: 1,
      preset: 'three-quarter',
      interactive: true,
    });
    const controls = (view as unknown as { controls: OrbitControls }).controls;
    expect(controls.mouseButtons).toEqual({
      LEFT: ORBIT_MOUSE_ACTIONS[ORBIT_MOUSE_BUTTONS.left],
      MIDDLE: ORBIT_MOUSE_ACTIONS[ORBIT_MOUSE_BUTTONS.middle],
      RIGHT: ORBIT_MOUSE_ACTIONS[ORBIT_MOUSE_BUTTONS.right],
    });
    expect(controls.touches).toEqual({
      ONE: ORBIT_TOUCH_ACTIONS[ORBIT_TOUCHES.one],
      TWO: ORBIT_TOUCH_ACTIONS[ORBIT_TOUCHES.two],
    });
    // Réglage actuel, en clair : rotation, zoom, déplacement ; un doigt tourne.
    expect(controls.mouseButtons).toEqual({
      LEFT: MOUSE.ROTATE,
      MIDDLE: MOUSE.DOLLY,
      RIGHT: MOUSE.PAN,
    });
    expect(controls.touches).toEqual({ ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN });
    view.dispose();
  });

  it('associe chaque action déclarée à une action distincte d’OrbitControls', () => {
    expect(new Set(Object.values(ORBIT_MOUSE_ACTIONS)).size).toBe(3);
    expect(new Set(Object.values(ORBIT_TOUCH_ACTIONS)).size).toBe(4);
  });
});

describe('AquariumView (ronds de pluie vus de biais, #125)', () => {
  it('tracé de biais en trois-quarts, habituel de dessus, de face et de dessous', () => {
    const view = new AquariumView({
      canvas: document.createElement('canvas'),
      rendererFactory: () => new RecordingRenderer(),
      pixelRatio: 1,
      preset: 'top',
      interactive: false,
      environment: POND,
    });
    view.resize(1280, 720);
    view.setRain(true);
    const oblique: Record<string, boolean> = {};
    for (const preset of ['top', 'bottom', 'front', 'side', 'three-quarter'] as const) {
      view.applyPreset(preset);
      view.renderFrame();
      oblique[preset] = view.rainObliqueView;
    }
    expect(oblique).toEqual({
      top: false,
      bottom: false,
      front: false,
      side: false,
      'three-quarter': true,
    });
    // Sans filtre aussi : le choix ne dépend que de la caméra.
    view.setFilter('aucun');
    view.renderFrame();
    expect(view.rainObliqueView).toBe(true);
    view.dispose();
  });
});

describe('AquariumView (lancer de rayon du pointeur, #178)', () => {
  it('aucun Vector2 alloué par événement : le même vecteur sert à chaque lancer', () => {
    const canvas = document.createElement('canvas');
    canvas.getBoundingClientRect = () => new DOMRect(0, 0, 800, 600);
    const view = new AquariumView({
      canvas,
      rendererFactory: () => new RecordingRenderer(),
      pixelRatio: 1,
      preset: 'three-quarter',
      interactive: true,
    });
    const internals = view as unknown as {
      raycaster: { setFromCamera: (coords: unknown, camera: unknown) => void };
      sandPlaneAt: (x: number, y: number) => { x: number; z: number } | null;
    };
    const coords: unknown[] = [];
    const original = internals.raycaster.setFromCamera.bind(internals.raycaster);
    internals.raycaster.setFromCamera = (c, camera) => {
      coords.push(c);
      original(c, camera);
    };
    view.pickDecor(400, 450);
    view.pickDecor(100, 500);
    expect(internals.sandPlaneAt(420, 460)).not.toBeNull();
    internals.sandPlaneAt(300, 480);
    expect(coords).toHaveLength(4);
    expect(new Set(coords).size).toBe(1);
    // Le vecteur porte bien le dernier point visé (coordonnées normalisées).
    const last = coords[0] as { x: number; y: number };
    expect(last.x).toBeCloseTo(-0.25, 12);
    expect(last.y).toBeCloseTo(-0.6, 12);
    view.dispose();
  });
});
