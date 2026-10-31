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
import { CAMERA_FOV_DEG, cameraPresetPose, orbitPose, type CameraPose } from './camera-presets';
import { SAND_THICKNESS } from '../sim/tank';
import { DECOR_NIGHT_TINT, NIGHT_FLAT_BRIGHTNESS, TONE_PENALTY_OFF } from './night-shade';
import { OVERCAST_FADE_SECONDS, RAIN_OVERCAST_BRIGHTNESS, RAIN_TONES } from './overcast';
import { environmentTonePenalties } from './palette-pass';

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
    // Voxels par défaut (#226).
    expect(view.foodStyle).toBe('voxels');
    view.setFoodStyle('points');
    expect(view.foodStyle).toBe('points');
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
      'poissons-rasbora',
      'poissons-tetra',
      'poissons-kuhli',
      'poissons-gourami',
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
      // Six tons du récif, puis les deux de l'eau brun-thé (#239), écartés sans feuille, et
      // les cinq du ciel couvert (#123), écartés sans pluie.
      const expected = [
        ...(environment === REEF
          ? [0, 0, 0, 0, 0, 0]
          : new Array<number>(6).fill(TONE_PENALTY_OFF)),
        TONE_PENALTY_OFF,
        TONE_PENALTY_OFF,
        ...new Array<number>(RAIN_TONES.length).fill(TONE_PENALTY_OFF),
      ];
      expect(view.environmentTonePenalties).toEqual(expected);
      // L'heure ne les touche pas.
      view.updateLight(lightAt(0));
      expect(view.environmentTonePenalties).toEqual(expected);
      view.dispose();
    }
  });

  it('eau brun-thé (#239) : ses deux tons proposés seulement quand l’eau est teintée', () => {
    for (const environment of [TROPICAL_TANK, REEF]) {
      const view = new AquariumView({
        canvas: document.createElement('canvas'),
        rendererFactory: () => new RecordingRenderer(),
        pixelRatio: 1,
        preset: 'three-quarter',
        interactive: false,
        environment,
      });
      const base = view.environmentTonePenalties.slice(0, 6);
      view.setWaterTea(1);
      expect(view.waterTea).toBe(1);
      const dry = new Array<number>(RAIN_TONES.length).fill(TONE_PENALTY_OFF);
      expect(view.environmentTonePenalties).toEqual([...base, 0, 0, ...dry]);
      view.setWaterTea(0);
      expect(view.environmentTonePenalties).toEqual([
        ...base,
        TONE_PENALTY_OFF,
        TONE_PENALTY_OFF,
        ...dry,
      ]);
      view.setCatappa([1, 0]);
      expect(view.catappaCounts).toEqual([2, 1]);
      view.setCatappa(undefined);
      expect(view.catappaCounts).toEqual([0, 0]);
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

describe('AquariumView (ciel couvert sous la pluie, #123)', () => {
  function pondView(): AquariumView {
    const view = new AquariumView({
      canvas: document.createElement('canvas'),
      rendererFactory: () => new RecordingRenderer(),
      pixelRatio: 1,
      preset: 'top',
      interactive: false,
      environment: POND,
    });
    view.resize(1280, 720);
    return view;
  }

  it('à midi sous la pluie : décor assombri, tons couverts proposés, tons du soir écartés', () => {
    const view = pondView();
    view.updateLight(lightAt(12));
    const layers = view.flatBrightnesses.length;
    const dry = [...view.environmentTonePenalties];
    expect(dry.every((p) => p === TONE_PENALTY_OFF)).toBe(true);
    view.setRain(true);
    expect(view.decorTintValue).toEqual([
      RAIN_OVERCAST_BRIGHTNESS,
      RAIN_OVERCAST_BRIGHTNESS,
      RAIN_OVERCAST_BRIGHTNESS,
    ]);
    // Poissons et bulles gardent leur clarté (koïs aux couleurs de midi).
    expect(view.flatBrightnesses).toEqual(Array(layers).fill(1));
    expect(view.tonePenalties).toEqual([TONE_PENALTY_OFF, TONE_PENALTY_OFF]);
    expect(view.environmentTonePenalties).toEqual(environmentTonePenalties(RAIN_TONES));
    // L'heure peut avancer sous la pluie : le ciel couvert reste appliqué.
    view.updateLight(lightAt(12));
    expect(view.decorTintValue[1]).toBe(RAIN_OVERCAST_BRIGHTNESS);
    expect(view.tonePenalties).toEqual([TONE_PENALTY_OFF, TONE_PENALTY_OFF]);
    // Fin de la pluie : valeurs de midi exactes.
    view.setRain(false);
    expect(view.decorTintValue).toEqual([1, 1, 1]);
    expect(view.environmentTonePenalties).toEqual(dry);
    view.dispose();
  });

  it('la nuit sous la pluie : pénalités de la nuit seule, décor plus sombre encore', () => {
    const view = pondView();
    view.updateLight(lightAt(0));
    const penalties = [...view.tonePenalties];
    const night = [...view.decorTintValue];
    view.setRain(true);
    expect(view.tonePenalties).toEqual(penalties);
    for (let k = 0; k < 3; k++) {
      expect(view.decorTintValue[k]).toBeCloseTo(night[k] * RAIN_OVERCAST_BRIGHTNESS, 12);
    }
    view.dispose();
  });

  it('fondu (#338) : le facteur glisse en quelques secondes, puis vaut exactement la cible', () => {
    const view = pondView();
    view.updateLight(lightAt(12));
    view.setRain(true, true);
    // Bascule : pluie et tons couverts tout de suite, assombrissement pas encore.
    expect(view.overcastFactor).toBe(1);
    expect(view.decorTintValue).toEqual([1, 1, 1]);
    expect(view.environmentTonePenalties).toEqual(environmentTonePenalties(RAIN_TONES));
    expect(view.stepOvercastFade(OVERCAST_FADE_SECONDS / 2)).toBe(true);
    const middle = (1 + RAIN_OVERCAST_BRIGHTNESS) / 2;
    expect(view.overcastFactor).toBeCloseTo(middle, 12);
    expect(view.decorTintValue[1]).toBeCloseTo(middle, 12);
    expect(view.stepOvercastFade(OVERCAST_FADE_SECONDS)).toBe(true);
    expect(view.overcastFactor).toBe(RAIN_OVERCAST_BRIGHTNESS);
    expect(view.decorTintValue[1]).toBe(RAIN_OVERCAST_BRIGHTNESS);
    // Fondu terminé : plus aucun travail par image.
    expect(view.stepOvercastFade(1)).toBe(false);
    // Fin de la pluie en fondu : retour progressif, puis exactement 1 (valeurs de midi).
    view.setRain(false, true);
    expect(view.overcastFactor).toBe(RAIN_OVERCAST_BRIGHTNESS);
    view.stepOvercastFade(1);
    expect(view.overcastFactor).toBeGreaterThan(RAIN_OVERCAST_BRIGHTNESS);
    expect(view.overcastFactor).toBeLessThan(1);
    for (let i = 0; i < 600; i++) {
      view.stepOvercastFade(1 / 60);
    }
    expect(view.overcastFactor).toBe(1);
    expect(view.decorTintValue).toEqual([1, 1, 1]);
    view.dispose();
  });

  it('sans fondu (démarrage, capture) : ciel couvert d’un coup, même en plein fondu', () => {
    const view = pondView();
    view.updateLight(lightAt(12));
    view.setRain(true, true);
    view.stepOvercastFade(1);
    // Même état de pluie, sans fondu : le facteur rejoint aussitôt sa cible.
    view.setRain(true);
    expect(view.overcastFactor).toBe(RAIN_OVERCAST_BRIGHTNESS);
    expect(view.decorTintValue[0]).toBe(RAIN_OVERCAST_BRIGHTNESS);
    view.setRain(false);
    expect(view.overcastFactor).toBe(1);
    expect(view.stepOvercastFade(1)).toBe(false);
    view.dispose();
    expect(view.stepOvercastFade(1)).toBe(false);
  });

  it('sans pluie possible (bac tropical) : rien ne change', () => {
    const view = new AquariumView({
      canvas: document.createElement('canvas'),
      rendererFactory: () => new RecordingRenderer(),
      pixelRatio: 1,
      preset: 'top',
      interactive: false,
    });
    view.updateLight(lightAt(12));
    const penalties = [...view.environmentTonePenalties];
    expect(view.setRain(true)).toBe(false);
    expect(view.setRain(true, true)).toBe(false);
    expect(view.stepOvercastFade(1)).toBe(false);
    expect(view.overcastFactor).toBe(1);
    expect(view.decorTintValue).toEqual([1, 1, 1]);
    expect(view.environmentTonePenalties).toEqual(penalties);
    view.dispose();
  });
});

describe('AquariumView (caméra du fond d’écran, #332)', () => {
  it('applyOrbit : pose de base calculée une fois par taille, position de orbitPose', () => {
    const view = new AquariumView({
      canvas: document.createElement('canvas'),
      rendererFactory: () => new RecordingRenderer(),
      pixelRatio: 1,
      preset: 'three-quarter',
      interactive: false,
    });
    view.resize(1280, 720);
    const spy = vi.spyOn(
      view as unknown as { presetPose(preset: 'three-quarter'): CameraPose },
      'presetPose',
    );
    const expected = (aspect: number, angle: number) =>
      orbitPose(cameraPresetPose('three-quarter', view.dimensions, aspect, CAMERA_FOV_DEG), angle);
    for (const angle of [0, 0.1, -0.2, 0.3]) {
      view.applyOrbit('three-quarter', angle);
      const pose = expected(1280 / 720, angle);
      view.cameraPosition().forEach((c, i) => expect(c).toBeCloseTo(pose.position[i], 9));
      view.cameraTarget().forEach((c, i) => expect(c).toBeCloseTo(pose.target[i], 9));
    }
    expect(spy).toHaveBeenCalledTimes(1);
    // Redimensionnement : pose de base recalculée une fois, pour le nouvel aspect.
    view.resize(800, 600);
    spy.mockClear();
    view.applyOrbit('three-quarter', 0.25);
    view.applyOrbit('three-quarter', 0.5);
    expect(spy).toHaveBeenCalledTimes(1);
    const pose = expected(800 / 600, 0.5);
    view.cameraPosition().forEach((c, i) => expect(c).toBeCloseTo(pose.position[i], 9));
    // Autre préréglage : recalculée aussi.
    spy.mockClear();
    view.applyOrbit('front' as 'three-quarter', 0);
    expect(spy).toHaveBeenCalledTimes(1);
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
      planeAt: (x: number, y: number, plane: number) => { x: number; z: number } | null;
    };
    const coords: unknown[] = [];
    const original = internals.raycaster.setFromCamera.bind(internals.raycaster);
    internals.raycaster.setFromCamera = (c, camera) => {
      coords.push(c);
      original(c, camera);
    };
    view.pickDecor(400, 450);
    view.pickDecor(100, 500);
    expect(internals.planeAt(420, 460, SAND_THICKNESS)).not.toBeNull();
    internals.planeAt(300, 480, -0.75);
    expect(coords).toHaveLength(4);
    expect(new Set(coords).size).toBe(1);
    // Le vecteur porte bien le dernier point visé (coordonnées normalisées).
    const last = coords[0] as { x: number; y: number };
    expect(last.x).toBeCloseTo(-0.25, 12);
    expect(last.y).toBeCloseTo(-0.6, 12);
    view.dispose();
  });
});

describe('AquariumView (choix dans la pièce, #188)', () => {
  function viewWithRoom(): AquariumView {
    const canvas = document.createElement('canvas');
    canvas.getBoundingClientRect = () => new DOMRect(0, 0, 800, 600);
    Object.defineProperty(canvas, 'clientWidth', { value: 800 });
    Object.defineProperty(canvas, 'clientHeight', { value: 600 });
    const view = new AquariumView({
      canvas,
      rendererFactory: () => new RecordingRenderer(),
      pixelRatio: 1,
      preset: 'three-quarter',
      interactive: true,
    });
    view.renderFrame();
    view.setRoom({ shown: true, cabinetHeight: 0.75 });
    return view;
  }

  it('vise le parquet, puis le meuble posé dessus, ou le sable du bac devant eux', () => {
    const view = viewWithRoom();
    // En trois-quarts, le parquet se voit en bas à gauche, le sable au centre.
    const floor = view.pickDecor(50, 550);
    if (floor?.kind !== 'floor') {
      throw new Error(`parquet attendu : ${JSON.stringify(floor)}`);
    }
    expect(view.pickDecor(500, 450)?.kind).toBe('sand');
    const x = Math.round(floor.x * 100) / 100;
    const z = Math.round(floor.z * 100) / 100;
    view.setRoom({
      shown: true,
      cabinetHeight: 0.75,
      items: [{ kind: 'table-basse', x, z, quarter: 0 }],
    });
    const table = view.pickDecor(50, 550);
    expect(table?.kind).toBe('room-item');
    expect(table?.kind === 'room-item' && table.index).toBe(0);
    // Point visé sur le meuble, au-dessus de son emprise.
    expect(table?.kind === 'room-item' && Math.abs(table.x - x)).toBeLessThan(0.5);
    // Pièce masquée : rien.
    view.setRoom({ shown: false, cabinetHeight: 0.75 });
    expect(view.pickDecor(50, 550)).toBeNull();
    view.dispose();
  });

  it('sélection de la pièce : contour dessiné, levé pour un indice inconnu', () => {
    const view = viewWithRoom();
    view.setRoom({
      shown: true,
      cabinetHeight: 0.75,
      items: [{ kind: 'table-basse', x: 1.3, z: 0.5, quarter: 0 }],
    });
    view.setRoomSelection(0);
    expect(view.roomSelection).toBe(0);
    view.previewRoom({ shown: true, cabinetHeight: 0.75 });
    expect(view.roomSelection).toBeNull();
    view.setRoomSelection(null);
    view.dispose();
    expect(() => view.setRoomSelection(0)).not.toThrow();
  });
});

describe('AquariumView (caméra libre dans la pièce, #343)', () => {
  function create(options: { interactive?: boolean; room?: boolean } = {}): AquariumView {
    const canvas = document.createElement('canvas');
    // jsdom n'a pas la capture du pointeur, qu'`OrbitControls` demande à l'appui.
    canvas.setPointerCapture = () => undefined;
    canvas.releasePointerCapture = () => undefined;
    const view = new AquariumView({
      canvas,
      rendererFactory: () => new RecordingRenderer(),
      pixelRatio: 1,
      preset: 'three-quarter',
      interactive: options.interactive ?? true,
    });
    view.resize(640, 360);
    if (options.room ?? true) {
      view.setRoom({ shown: true, cabinetHeight: 0.75 });
    }
    return view;
  }

  function pointer(type: string, x: number, y: number): Event {
    const event = new MouseEvent(type, { button: 0, clientX: x, clientY: y });
    Object.defineProperty(event, 'pointerId', { value: 7 });
    Object.defineProperty(event, 'isPrimary', { value: true });
    return event;
  }

  function controlsOf(view: AquariumView): OrbitControls {
    return (view as unknown as { controls: OrbitControls }).controls;
  }

  const FORWARD = { forward: 1, strafe: 0, vertical: 0 };

  it('sans pièce affichée : refusée, orbite inchangée', () => {
    const view = create({ room: false });
    const before = view.cameraPosition();
    expect(view.enterFreeCamera()).toBe(false);
    expect(view.freeCameraActive).toBe(false);
    expect(view.stepFreeCamera(FORWARD, 1)).toBe(false);
    expect(view.exitFreeCamera()).toBe(false);
    expect(view.cameraPosition()).toEqual(before);
    expect(controlsOf(view).enabled).toBe(true);
    view.dispose();
  });

  it('vue non interactive (capture) : refusée', () => {
    const view = create({ interactive: false });
    expect(view.enterFreeCamera()).toBe(false);
    view.dispose();
  });

  it('entre à la pose orbitale, coupe les contrôles, avance, puis rend la pose d’avant', () => {
    const view = create();
    const position = view.cameraPosition();
    const target = view.cameraTarget();
    expect(view.enterFreeCamera()).toBe(true);
    expect(view.enterFreeCamera()).toBe(false);
    expect(view.freeCameraActive).toBe(true);
    expect(controlsOf(view).enabled).toBe(false);
    // Pose de trois-quarts déjà dans la pièce : aucune correction.
    view.cameraPosition().forEach((value, i) => expect(value).toBeCloseTo(position[i], 9));
    expect(view.stepFreeCamera(FORWARD, 0.5)).toBe(true);
    expect(view.cameraPosition()).not.toEqual(position);
    expect(view.exitFreeCamera()).toBe(true);
    expect(view.freeCameraActive).toBe(false);
    expect(controlsOf(view).enabled).toBe(true);
    view.cameraPosition().forEach((value, i) => expect(value).toBeCloseTo(position[i], 9));
    view.cameraTarget().forEach((value, i) => expect(value).toBeCloseTo(target[i], 9));
    view.dispose();
  });

  it('pose orbitale quelconque (hors préréglage) rendue à l’identique', () => {
    const view = create();
    view.stepCameraTransition(0);
    // Pose déplacée à la main, hors préréglage.
    (view as unknown as { setPose(p: CameraPose): void }).setPose({
      position: [0.9, 0.7, 1.1],
      target: [0.05, 0.2, 0],
    });
    (view as unknown as { preset: null }).preset = null;
    const position = view.cameraPosition();
    const target = view.cameraTarget();
    view.enterFreeCamera();
    view.stepFreeCamera({ forward: -1, strafe: 1, vertical: 1 }, 0.25);
    view.exitFreeCamera();
    view.cameraPosition().forEach((value, i) => expect(value).toBeCloseTo(position[i], 12));
    view.cameraTarget().forEach((value, i) => expect(value).toBeCloseTo(target[i], 12));
    view.dispose();
  });

  it('glisser à la souris oriente la vue sans déplacer la caméra', () => {
    const view = create();
    const canvas = (view as unknown as { canvas: HTMLCanvasElement }).canvas;
    view.enterFreeCamera();
    const changes: number[] = [];
    view.onCameraChange(() => changes.push(1));
    const position = view.cameraPosition();
    const yaw = view.freeCameraState!.yaw;
    canvas.dispatchEvent(pointer('pointerdown', 100, 100));
    canvas.dispatchEvent(pointer('pointermove', 160, 80));
    canvas.dispatchEvent(pointer('pointerup', 160, 80));
    expect(view.freeCameraState!.yaw).toBeLessThan(yaw);
    expect(view.cameraPosition()).toEqual(position);
    expect(changes.length).toBe(1);
    // Relâché : un mouvement ne tourne plus.
    const after = view.freeCameraState!.yaw;
    canvas.dispatchEvent(pointer('pointermove', 300, 80));
    expect(view.freeCameraState!.yaw).toBe(after);
    view.dispose();
  });

  it('orbite : glisser n’oriente rien (aucun état libre)', () => {
    const view = create();
    const canvas = (view as unknown as { canvas: HTMLCanvasElement }).canvas;
    canvas.dispatchEvent(pointer('pointerdown', 100, 100));
    canvas.dispatchEvent(pointer('pointermove', 160, 80));
    expect(view.freeCameraState).toBeNull();
    view.dispose();
  });

  it('un préréglage quitte la caméra libre ; masquer la pièce rend l’orbite', () => {
    const view = create();
    view.enterFreeCamera();
    view.animateToPreset('top', 0.5);
    expect(view.freeCameraActive).toBe(false);
    expect(view.transitioning).toBe(true);
    expect(controlsOf(view).enabled).toBe(true);
    view.applyPreset('three-quarter');
    const position = view.cameraPosition();
    view.enterFreeCamera();
    view.stepFreeCamera(FORWARD, 0.5);
    view.setRoom({ shown: false, cabinetHeight: 0.75 });
    expect(view.freeCameraActive).toBe(false);
    view.cameraPosition().forEach((value, i) => expect(value).toBeCloseTo(position[i], 9));
    view.dispose();
  });

  function touch(type: string, id: number, x: number, y: number, primary: boolean): Event {
    const event = new MouseEvent(type, { button: 0, clientX: x, clientY: y });
    Object.defineProperty(event, 'pointerId', { value: id });
    Object.defineProperty(event, 'isPrimary', { value: primary });
    Object.defineProperty(event, 'pointerType', { value: 'touch' });
    return event;
  }

  it('au doigt : un appui qui tremble sous le seuil n’oriente pas (#344)', () => {
    const view = create();
    const canvas = (view as unknown as { canvas: HTMLCanvasElement }).canvas;
    view.enterFreeCamera();
    const yaw = view.freeCameraState!.yaw;
    canvas.dispatchEvent(touch('pointerdown', 3, 100, 100, true));
    canvas.dispatchEvent(touch('pointermove', 3, 106, 104, true));
    expect(view.freeCameraState!.yaw).toBe(yaw);
    // Au-delà du seuil, tout le glissement depuis l'appui compte.
    canvas.dispatchEvent(touch('pointermove', 3, 140, 100, true));
    expect(view.freeCameraState!.yaw).toBeCloseTo(yaw - 40 * 0.004, 12);
    canvas.dispatchEvent(touch('pointerup', 3, 140, 100, true));
    view.dispose();
  });

  it('deux doigts qui s’écartent avancent, puis la poussée s’éteint (#344)', () => {
    const view = create();
    const canvas = (view as unknown as { canvas: HTMLCanvasElement }).canvas;
    view.enterFreeCamera();
    const state = view.freeCameraState!;
    const yaw = state.yaw;
    const start = view.cameraPosition();
    canvas.dispatchEvent(touch('pointerdown', 1, 300, 200, true));
    canvas.dispatchEvent(touch('pointerdown', 2, 340, 200, false));
    // Le premier doigt bouge aussi : pas d'orientation pendant le pincement.
    canvas.dispatchEvent(touch('pointermove', 1, 260, 200, true));
    canvas.dispatchEvent(touch('pointermove', 2, 400, 200, false));
    expect(view.freeCameraState!.yaw).toBe(yaw);
    expect(view.freeCameraThrust).toBeGreaterThan(0.5);
    canvas.dispatchEvent(touch('pointerup', 2, 400, 200, false));
    canvas.dispatchEvent(touch('pointerup', 1, 260, 200, true));
    expect(view.stepFreeCamera({ forward: 0, strafe: 0, vertical: 0 }, 0.2)).toBe(true);
    // Avance selon le cap : vers −Z pour la vue de trois-quarts (cap proche de 0).
    const forward = [-Math.sin(yaw), 0, -Math.cos(yaw)];
    const moved = view.cameraPosition().map((value, i) => value - start[i]);
    expect(moved[0] * forward[0] + moved[2] * forward[2]).toBeGreaterThan(0);
    for (let i = 0; i < 120; i++) {
      view.stepFreeCamera({ forward: 0, strafe: 0, vertical: 0 }, 1 / 30);
    }
    expect(view.freeCameraThrust).toBe(0);
    view.dispose();
  });

  it('deux doigts qui se rapprochent reculent ; sortir du mode efface la poussée (#344)', () => {
    const view = create();
    const canvas = (view as unknown as { canvas: HTMLCanvasElement }).canvas;
    view.enterFreeCamera();
    canvas.dispatchEvent(touch('pointerdown', 1, 200, 200, true));
    canvas.dispatchEvent(touch('pointerdown', 2, 400, 200, false));
    canvas.dispatchEvent(touch('pointermove', 2, 260, 200, false));
    expect(view.freeCameraThrust).toBeLessThan(0);
    view.exitFreeCamera();
    expect(view.freeCameraThrust).toBe(0);
    view.dispose();
  });

  it('reste dans la pièce même en avançant longtemps', () => {
    const view = create();
    view.enterFreeCamera();
    for (let i = 0; i < 600; i++) {
      view.stepFreeCamera(FORWARD, 1 / 30);
    }
    const [, , z] = view.cameraPosition();
    // Mur du fond derrière le bac : la caméra s'arrête devant le bac ou contre un mur.
    expect(z).toBeGreaterThan(-0.5);
    view.dispose();
    expect(view.enterFreeCamera()).toBe(false);
  });
});
