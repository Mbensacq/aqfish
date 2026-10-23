import {
  DEFAULT_DECOR,
  MAX_DECOR_SCALE,
  MIN_DECOR_SCALE,
  validateDecorItem,
  type DecorItem,
} from './decor';
import {
  addDecorItem,
  canPlaceDecorAt,
  clampDecorPosition,
  decorFootprint,
  decorItemsOverlap,
  DECOR_EDGE_MARGIN,
  DECOR_ROTATION_STEP,
  DECOR_SCALE_STEP,
  isDecorChoiceId,
  isDecorEditable,
  isDecorPoseAllowed,
  MAX_DECOR_ITEMS,
  moveDecorItem,
  nextDecorSeed,
  removeDecorItem,
  rotateDecorItem,
  scaleDecorItem,
  setDecorInPlace,
  withDecor,
} from './decor-edit';
import { environmentById } from './environment';
import { obstacleDistance, sphereObstacle } from './obstacles';
import { parseWorld, serializeWorld } from './save';
import { DEFAULT_TANK } from './tank';
import {
  advance,
  advanceInPlace,
  createDefaultWorld,
  createWorld,
  type MutableWorld,
} from './world';

const HALF_W = DEFAULT_TANK.width / 2;
const HALF_D = DEFAULT_TANK.depth / 2;

describe('addDecorItem', () => {
  it('ajoute un rocher puis une plante, dans l’ordre, sans modifier le décor donné', () => {
    const start = [...DEFAULT_DECOR];
    const withRock = addDecorItem(start, 'rock', 0.1, 0.05, 42, 'tropical');
    expect(withRock).not.toBeNull();
    expect(start.length).toBe(DEFAULT_DECOR.length);
    expect(withRock!.length).toBe(DEFAULT_DECOR.length + 1);
    const withPlant = addDecorItem(withRock!, 'tuft', -0.2, -0.1, 42, 'tropical');
    expect(withPlant!.length).toBe(DEFAULT_DECOR.length + 2);
    const rock = withPlant!.at(-2)!;
    const plant = withPlant!.at(-1)!;
    expect(rock).toMatchObject({ kind: 'rock', x: 0.1, z: 0.05, scale: 1 });
    expect('form' in rock).toBe(false);
    expect(plant).toMatchObject({ kind: 'plant', form: 'tuft', x: -0.2, z: -0.1, scale: 1 });
    for (const item of withPlant!) {
      expect(validateDecorItem(item)).toEqual([]);
    }
    expect(withPlant!.slice(0, DEFAULT_DECOR.length)).toEqual(DEFAULT_DECOR);
  });

  it('chaque forme du catalogue donne un élément valide', () => {
    for (const choice of ['rock', 'tall', 'tuft'] as const) {
      const decor = addDecorItem([], choice, 0, 0, 7, 'tropical');
      expect(decor).not.toBeNull();
      expect(validateDecorItem(decor![0])).toEqual([]);
    }
    expect(addDecorItem([], 'tall', 0, 0, 7, 'tropical')![0].form).toBe('tall');
  });

  it('est déterministe : même graine, même décor, même élément', () => {
    const a = addDecorItem(DEFAULT_DECOR, 'rock', 0, 0, 42, 'tropical');
    const b = addDecorItem(DEFAULT_DECOR, 'rock', 0, 0, 42, 'tropical');
    expect(a).toEqual(b);
    const other = addDecorItem(DEFAULT_DECOR, 'rock', 0, 0, 43, 'tropical');
    expect(other!.at(-1)!.seed).not.toBe(a!.at(-1)!.seed);
  });

  it('tire la rotation de la graine, dans [0, 2π)', () => {
    const rotations = new Set<number>();
    let decor: DecorItem[] = [];
    for (let n = 0; n < 5; n++) {
      decor = addDecorItem(decor, 'rock', -0.3 + n * 0.15, 0, 42, 'tropical')!;
      const r = decor.at(-1)!.rotation;
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(2 * Math.PI);
      rotations.add(r);
    }
    expect(rotations.size).toBe(5);
  });

  it('n’ajoute rien hors des bornes du bac, marge comprise', () => {
    const edge = HALF_W - DECOR_EDGE_MARGIN;
    expect(addDecorItem([], 'rock', edge, 0, 1, 'tropical')).not.toBeNull();
    expect(
      addDecorItem([], 'rock', -edge, HALF_D - DECOR_EDGE_MARGIN, 1, 'tropical'),
    ).not.toBeNull();
    expect(addDecorItem([], 'rock', edge + 1e-6, 0, 1, 'tropical')).toBeNull();
    expect(
      addDecorItem([], 'rock', 0, -(HALF_D - DECOR_EDGE_MARGIN) - 1e-6, 1, 'tropical'),
    ).toBeNull();
    expect(addDecorItem([], 'rock', HALF_W + 1, 0, 1, 'tropical')).toBeNull();
    expect(addDecorItem([], 'rock', Number.NaN, 0, 1, 'tropical')).toBeNull();
    expect(addDecorItem([], 'rock', 0, Number.POSITIVE_INFINITY, 1, 'tropical')).toBeNull();
  });

  it('refuse un type inconnu, un environnement non éditable et un décor plein', () => {
    expect(addDecorItem([], 'coral' as never, 0, 0, 1, 'tropical')).toBeNull();
    expect(addDecorItem([], 'rock', 0, 0, 1, 'bassin')).toBeNull();
    expect(addDecorItem([], 'rock', 0, 0, 1, 'recif')).toBeNull();
    let decor: DecorItem[] = [];
    for (let n = 0; n < MAX_DECOR_ITEMS; n++) {
      decor = addDecorItem(
        decor,
        'tuft',
        ((n % 8) - 4) * 0.1,
        (Math.floor(n / 8) - 4) * 0.02,
        3,
        'tropical',
      )!;
    }
    expect(decor.length).toBe(MAX_DECOR_ITEMS);
    expect(addDecorItem(decor, 'rock', 0, 0, 3, 'tropical')).toBeNull();
  });

  it('accepte la graine 0 et la plus grande graine', () => {
    expect(addDecorItem([], 'rock', 0, 0, 0, 'tropical')).not.toBeNull();
    expect(addDecorItem([], 'rock', 0, 0, 0xffffffff, 'tropical')).not.toBeNull();
  });
});

describe('nextDecorSeed', () => {
  it('ne réutilise jamais une graine déjà prise, même après une suppression', () => {
    let decor = addDecorItem([], 'rock', 0, 0, 9, 'tropical')!;
    decor = addDecorItem(decor, 'rock', 0.2, 0, 9, 'tropical')!;
    decor = removeDecorItem(decor, 0)!;
    const seed = nextDecorSeed(9, decor);
    expect(decor.map((i) => i.seed)).not.toContain(seed);
  });
});

describe('removeDecorItem', () => {
  it('retire l’élément d’indice donné et garde l’ordre des autres', () => {
    const decor = removeDecorItem(DEFAULT_DECOR, 2)!;
    expect(decor.length).toBe(DEFAULT_DECOR.length - 1);
    expect(decor).toEqual([...DEFAULT_DECOR.slice(0, 2), ...DEFAULT_DECOR.slice(3)]);
  });

  it('refuse un indice inexistant', () => {
    expect(removeDecorItem(DEFAULT_DECOR, -1)).toBeNull();
    expect(removeDecorItem(DEFAULT_DECOR, DEFAULT_DECOR.length)).toBeNull();
    expect(removeDecorItem(DEFAULT_DECOR, 1.5)).toBeNull();
    expect(removeDecorItem([], 0)).toBeNull();
  });
});

describe('canPlaceDecorAt et isDecorEditable', () => {
  it('le bac tropical seul est éditable', () => {
    expect(isDecorEditable('tropical')).toBe(true);
    expect(isDecorEditable('bassin')).toBe(false);
    expect(isDecorEditable('paludarium')).toBe(false);
    expect(isDecorEditable('recif')).toBe(false);
  });

  it('borne le point aux dimensions de l’environnement', () => {
    const { width } = environmentById('tropical').dimensions;
    expect(canPlaceDecorAt(0, 0, 'tropical')).toBe(true);
    expect(canPlaceDecorAt(width / 2, 0, 'tropical')).toBe(false);
  });

  it('reconnaît les identifiants du catalogue', () => {
    expect(isDecorChoiceId('rock')).toBe(true);
    expect(isDecorChoiceId('tuft')).toBe(true);
    expect(isDecorChoiceId('plant')).toBe(false);
    expect(isDecorChoiceId(undefined)).toBe(false);
  });
});

describe('setDecorInPlace et withDecor', () => {
  it('recalcule les obstacles comme à la création, sans toucher aux poissons ni au temps', () => {
    const world = advance(createDefaultWorld(42), 30) as MutableWorld;
    const decor = addDecorItem(world.decor, 'rock', 0, 0.1, world.seed, world.environment)!;
    const entities = world.entities;
    const tick = world.tick;
    setDecorInPlace(world, decor);
    expect(world.decor).toEqual(decor);
    expect(world.decor).not.toBe(decor);
    expect(world.entities).toBe(entities);
    expect(world.tick).toBe(tick);
    expect(world.obstacles).toEqual(createWorld(42, [], [], decor).obstacles);
  });

  it('withDecor ne modifie pas le monde donné', () => {
    const world = createDefaultWorld(42);
    const decor = removeDecorItem(world.decor, 0)!;
    const next = withDecor(world, decor);
    expect(world.decor.length).toBe(DEFAULT_DECOR.length);
    expect(next.decor.length).toBe(DEFAULT_DECOR.length - 1);
    expect(next.obstacles.length).toBe(DEFAULT_DECOR.length - 1);
  });

  it('refuse un monde à obstacles explicites et un élément invalide', () => {
    const explicit = createWorld(1, [], [sphereObstacle(0, 0, 0.1, 0, 0.02)]) as MutableWorld;
    expect(() => setDecorInPlace(explicit, [])).toThrow(RangeError);
    const world = createDefaultWorld(1) as MutableWorld;
    const bad = { ...DEFAULT_DECOR[0], scale: 99 };
    expect(() => setDecorInPlace(world, [bad])).toThrow(RangeError);
    expect(world.decor).toEqual(DEFAULT_DECOR);
  });

  it('un poisson ne traverse jamais un élément ajouté, même posé sur lui', () => {
    for (const seed of [1, 42, 2024]) {
      const world = advance(createDefaultWorld(seed), 60) as MutableWorld;
      // Rocher posé sur le premier poisson, plus un second au centre du bac.
      const fish = world.entities[0];
      let decor = addDecorItem(world.decor, 'rock', fish.x, fish.z, seed, world.environment)!;
      decor = addDecorItem(decor, 'rock', 0, 0, seed, world.environment)!;
      setDecorInPlace(world, decor);
      const added = world.obstacles.slice(DEFAULT_DECOR.length, DEFAULT_DECOR.length + 2);
      const normal = { x: 0, y: 0, z: 0 };
      for (let n = 0; n < 600; n++) {
        advanceInPlace(world, 1);
        for (const f of world.entities) {
          for (const o of added) {
            expect(obstacleDistance(o, f.x, f.y, f.z, normal)).toBeGreaterThanOrEqual(-1e-9);
          }
        }
      }
    }
  });

  it('le décor édité est conservé par l’export et l’import JSON', () => {
    const world = createDefaultWorld(42) as MutableWorld;
    let decor = addDecorItem(world.decor, 'rock', 0.05, 0.12, 42, 'tropical')!;
    decor = addDecorItem(decor, 'tall', -0.25, -0.05, 42, 'tropical')!;
    decor = removeDecorItem(decor, 0)!;
    setDecorInPlace(world, decor);
    const result = parseWorld(serializeWorld(world));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.world.decor).toEqual(decor);
      expect(result.world.obstacles).toEqual(world.obstacles);
    }
  });
});

describe('decorFootprint', () => {
  it('contient tous les voxels, et croît avec l’échelle', () => {
    for (const item of DEFAULT_DECOR) {
      const r = decorFootprint(item);
      expect(r).toBeGreaterThan(0);
      expect(decorFootprint({ ...item, scale: item.scale * 2 })).toBeGreaterThan(r);
    }
  });

  it('ne dépend pas de la rotation ni de la position', () => {
    const rock = DEFAULT_DECOR[0];
    expect(decorFootprint({ ...rock, rotation: 3, x: 0.2, z: -0.1 })).toBe(decorFootprint(rock));
  });
});

describe('clampDecorPosition', () => {
  const rock = DEFAULT_DECOR[2];
  const reach = decorFootprint(rock);

  it('laisse inchangée une position libre à l’intérieur du bac', () => {
    expect(clampDecorPosition(rock, 0.1, -0.05, 'tropical')).toEqual({ x: 0.1, z: -0.05 });
  });

  it('borne la position à l’emprise de l’élément, sur chaque vitre (bornes comprises)', () => {
    expect(clampDecorPosition(rock, 5, 0, 'tropical')).toEqual({ x: HALF_W - reach, z: 0 });
    expect(clampDecorPosition(rock, -5, 0, 'tropical')).toEqual({ x: -(HALF_W - reach), z: 0 });
    expect(clampDecorPosition(rock, 0, 5, 'tropical')).toEqual({ x: 0, z: HALF_D - reach });
    expect(clampDecorPosition(rock, 0, -5, 'tropical')).toEqual({ x: 0, z: -(HALF_D - reach) });
    // Juste à la borne : inchangé.
    expect(clampDecorPosition(rock, HALF_W - reach, 0, 'tropical')!.x).toBe(HALF_W - reach);
    // Coin : les deux axes sont bornés.
    expect(clampDecorPosition(rock, 9, -9, 'tropical')).toEqual({
      x: HALF_W - reach,
      z: -(HALF_D - reach),
    });
  });

  it('garde au moins DECOR_EDGE_MARGIN, même pour un élément minuscule', () => {
    const tiny = { ...rock, scale: MIN_DECOR_SCALE };
    const p = clampDecorPosition(tiny, 9, 9, 'tropical')!;
    expect(HALF_W - p.x).toBeGreaterThanOrEqual(DECOR_EDGE_MARGIN - 1e-12);
    expect(HALF_D - p.z).toBeGreaterThanOrEqual(DECOR_EDGE_MARGIN - 1e-12);
  });

  it('centre sur un axe un élément plus large que le bac', () => {
    const huge = { ...rock, scale: MAX_DECOR_SCALE };
    expect(decorFootprint(huge)).toBeGreaterThan(HALF_D);
    expect(clampDecorPosition(huge, 0.1, 0.2, 'tropical')!.z).toBe(0);
  });

  it('refuse une position non finie', () => {
    expect(clampDecorPosition(rock, Number.NaN, 0, 'tropical')).toBeNull();
    expect(clampDecorPosition(rock, 0, Infinity, 'tropical')).toBeNull();
  });
});

describe('moveDecorItem', () => {
  it('déplace l’élément d’indice donné, sans modifier le décor ni les autres éléments', () => {
    const start = [...DEFAULT_DECOR];
    const moved = moveDecorItem(start, 2, 0.05, 0.1, 'tropical')!;
    expect(moved[2]).toEqual({ ...DEFAULT_DECOR[2], x: 0.05, z: 0.1 });
    expect(start).toEqual(DEFAULT_DECOR);
    moved.forEach((item, n) => {
      if (n !== 2) {
        expect(item).toBe(DEFAULT_DECOR[n]);
      }
    });
  });

  it('borne la position au bac (rayon de la souris hors du bac)', () => {
    const moved = moveDecorItem(DEFAULT_DECOR, 0, 10, -10, 'tropical')!;
    const reach = decorFootprint(DEFAULT_DECOR[0]);
    expect(moved[0].x).toBeCloseTo(HALF_W - reach, 12);
    expect(moved[0].z).toBeCloseTo(-(HALF_D - reach), 12);
    expect(validateDecorItem(moved[0])).toEqual([]);
  });

  it('null : indice inexistant, position non finie, environnement non éditable', () => {
    expect(moveDecorItem(DEFAULT_DECOR, -1, 0, 0, 'tropical')).toBeNull();
    expect(moveDecorItem(DEFAULT_DECOR, DEFAULT_DECOR.length, 0, 0, 'tropical')).toBeNull();
    expect(moveDecorItem(DEFAULT_DECOR, 1.5, 0, 0, 'tropical')).toBeNull();
    expect(moveDecorItem(DEFAULT_DECOR, 0, Number.NaN, 0, 'tropical')).toBeNull();
    expect(moveDecorItem(DEFAULT_DECOR, 0, 0, 0, 'bassin')).toBeNull();
    expect(moveDecorItem([], 0, 0, 0, 'tropical')).toBeNull();
  });
});

describe('rotateDecorItem', () => {
  it('tourne par pas de 15°, dans les deux sens, angle dans [0, 2π)', () => {
    expect(DECOR_ROTATION_STEP).toBeCloseTo((15 * Math.PI) / 180, 12);
    const item: DecorItem = { ...DEFAULT_DECOR[2], rotation: 0 };
    const decor = [item];
    expect(rotateDecorItem(decor, 0, 1, 'tropical')![0].rotation).toBeCloseTo(Math.PI / 12, 12);
    expect(rotateDecorItem(decor, 0, -1, 'tropical')![0].rotation).toBeCloseTo(
      2 * Math.PI - Math.PI / 12,
      12,
    );
    // 24 pas : un tour complet.
    expect(rotateDecorItem(decor, 0, 24, 'tropical')![0].rotation).toBeCloseTo(0, 9);
    let current: DecorItem[] = decor;
    for (let n = 0; n < 30; n++) {
      current = rotateDecorItem(current, 0, 1, 'tropical')!;
      expect(current[0].rotation).toBeGreaterThanOrEqual(0);
      expect(current[0].rotation).toBeLessThan(2 * Math.PI);
    }
    expect(current[0].rotation).toBeCloseTo(6 * DECOR_ROTATION_STEP, 9);
    expect(current[0]).toMatchObject({ x: item.x, z: item.z, scale: item.scale });
  });

  it('null : zéro pas, pas fractionnaire, indice inexistant, environnement non éditable', () => {
    expect(rotateDecorItem(DEFAULT_DECOR, 0, 0, 'tropical')).toBeNull();
    expect(rotateDecorItem(DEFAULT_DECOR, 0, 0.5, 'tropical')).toBeNull();
    expect(rotateDecorItem(DEFAULT_DECOR, 99, 1, 'tropical')).toBeNull();
    expect(rotateDecorItem(DEFAULT_DECOR, 0, 1, 'recif')).toBeNull();
  });
});

describe('scaleDecorItem', () => {
  it('change l’échelle par pas de DECOR_SCALE_STEP, sans dérive', () => {
    const decor = [{ ...DEFAULT_DECOR[2], x: 0, z: 0, scale: 1.4 }];
    expect(scaleDecorItem(decor, 0, 1, 'tropical')![0].scale).toBe(1.4 + DECOR_SCALE_STEP);
    expect(scaleDecorItem(decor, 0, 3, 'tropical')![0].scale).toBe(2.15);
    expect(scaleDecorItem(decor, 0, -2, 'tropical')![0].scale).toBe(0.9);
  });

  it('borne l’échelle à [MIN_DECOR_SCALE, MAX_DECOR_SCALE] ; null à la borne', () => {
    const decor = [{ ...DEFAULT_DECOR[2], x: 0, z: 0, scale: 1 }];
    expect(scaleDecorItem(decor, 0, 100, 'tropical')![0].scale).toBe(MAX_DECOR_SCALE);
    expect(scaleDecorItem(decor, 0, -100, 'tropical')![0].scale).toBe(MIN_DECOR_SCALE);
    const top = [{ ...decor[0], scale: MAX_DECOR_SCALE }];
    const bottom = [{ ...decor[0], scale: MIN_DECOR_SCALE }];
    expect(scaleDecorItem(top, 0, 1, 'tropical')).toBeNull();
    expect(scaleDecorItem(bottom, 0, -1, 'tropical')).toBeNull();
    expect(scaleDecorItem(top, 0, -1, 'tropical')![0].scale).toBe(MAX_DECOR_SCALE - 0.25);
  });

  it('rentre dans le bac un élément agrandi contre une vitre', () => {
    const rock = DEFAULT_DECOR[2];
    const atEdge = clampDecorPosition(rock, 9, 0, 'tropical')!;
    const decor = [{ ...rock, x: atEdge.x, z: 0 }];
    const bigger = scaleDecorItem(decor, 0, 2, 'tropical')![0];
    expect(bigger.x).toBeLessThan(atEdge.x);
    expect(bigger.x + decorFootprint(bigger)).toBeCloseTo(HALF_W, 12);
  });

  it('null : zéro pas, pas fractionnaire, indice inexistant', () => {
    expect(scaleDecorItem(DEFAULT_DECOR, 0, 0, 'tropical')).toBeNull();
    expect(scaleDecorItem(DEFAULT_DECOR, 0, 1.5, 'tropical')).toBeNull();
    expect(scaleDecorItem(DEFAULT_DECOR, -1, 1, 'tropical')).toBeNull();
  });
});

describe('isDecorPoseAllowed (chevauchement au lâcher)', () => {
  const rockA: DecorItem = { kind: 'rock', x: -0.2, z: 0, rotation: 0, scale: 1, seed: 11 };
  const rockB: DecorItem = { kind: 'rock', x: 0.2, z: 0, rotation: 0, scale: 1, seed: 27 };

  it('le décor par défaut ne se chevauche pas', () => {
    DEFAULT_DECOR.forEach((a, i) =>
      DEFAULT_DECOR.forEach((b, j) => {
        if (j > i) {
          expect(decorItemsOverlap(a, b)).toBe(false);
        }
      }),
    );
  });

  it('accepte une pose libre, refuse une pose qui pénètre un autre élément', () => {
    const decor = [rockA, rockB];
    const free = moveDecorItem(decor, 0, -0.3, 0.05, 'tropical')!;
    expect(isDecorPoseAllowed(decor, free, 0)).toBe(true);
    const onTop = moveDecorItem(decor, 0, 0.21, 0, 'tropical')!;
    expect(decorItemsOverlap(onTop[0], rockB)).toBe(true);
    expect(isDecorPoseAllowed(decor, onTop, 0)).toBe(false);
  });

  it('un chevauchement hérité ne bloque pas l’élément ; un nouveau, si', () => {
    const rockC: DecorItem = { ...rockB, x: -0.5, seed: 3 };
    const tangled = [rockA, { ...rockB, x: -0.18 }, rockC];
    expect(decorItemsOverlap(tangled[0], tangled[1])).toBe(true);
    const turned = rotateDecorItem(tangled, 0, 1, 'tropical');
    expect(turned).not.toBeNull();
    const intoC = moveDecorItem(tangled, 0, -0.48, 0, 'tropical')!;
    expect(isDecorPoseAllowed(tangled, intoC, 0)).toBe(false);
  });

  it('refuse un agrandissement ou une rotation qui pénètre un voisin', () => {
    const close: DecorItem[] = [rockA, { ...rockB, x: rockA.x + 0.13 }];
    expect(decorItemsOverlap(close[0], close[1])).toBe(false);
    expect(scaleDecorItem(close, 0, 4, 'tropical')).toBeNull();
  });

  it('faux pour des décors de longueurs différentes ou un indice inexistant', () => {
    expect(isDecorPoseAllowed([rockA, rockB], [rockA], 0)).toBe(false);
    expect(isDecorPoseAllowed([rockA], [rockA], 1)).toBe(false);
    expect(isDecorPoseAllowed([rockA], [rockA], -1)).toBe(false);
  });
});
