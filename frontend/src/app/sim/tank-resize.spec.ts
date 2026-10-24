import { MAX_SEED } from '../core/random/prng';
import { bubbleSourceFor, createBubbleBuffer, DEFAULT_BUBBLE_SOURCE, MAX_BUBBLES } from './bubbles';
import { decorFootprint, DECOR_EDGE_MARGIN, moveDecorItem, setDecorInPlace } from './decor-edit';
import { validateDecorItem } from './decor';
import {
  environmentWater,
  PLACE_CACHE_LIMIT,
  placeDimensions,
  placeKey,
  placeKeyBuildCount,
} from './environment';
import { sphereObstacle } from './obstacles';
import { populationCounts, setPopulationInPlace } from './population';
import { parseWorld, serializeWorld } from './save';
import {
  clampDimension,
  clampTankDimensions,
  DEFAULT_TANK,
  MAX_TANK,
  sameDimensions,
  TANK_LIMITS,
  type TankDimensions,
} from './tank';
import { setTankDimensionsInPlace, withTankDimensions } from './tank-resize';
import {
  advance,
  advanceInPlace,
  boundsFor,
  cloneWorld,
  createDefaultWorld,
  createWorld,
  feed,
  worldBubbles,
  type MutableWorld,
  type World,
} from './world';

const SMALL: TankDimensions = { width: 0.6, height: 0.5, depth: 0.3 };
const LARGE: TankDimensions = MAX_TANK;

/** Monde tropical avancé et nourri (poissons répartis, granulés en chute et posés). */
function busyWorld(seed = 42): MutableWorld {
  let world: World = createDefaultWorld(seed);
  world = feed(advance(world, 600), 0.5, 0.2);
  world = feed(advance(world, 200), -0.5, -0.2);
  return cloneWorld(advance(world, 60));
}

function resized(world: World, dims: TankDimensions): World {
  const next = withTankDimensions(world, dims);
  if (next === null) {
    throw new Error('redimensionnement refusé');
  }
  return next;
}

/** Vrai si toutes les entités, bulles et granulés de `world` sont dans son eau. */
function everythingInside(world: World): string[] {
  const problems: string[] = [];
  const water = environmentWater(world);
  const inBox = (x: number, y: number, z: number) =>
    x >= water.minX &&
    x <= water.maxX &&
    y >= water.minY &&
    y <= water.maxY &&
    z >= water.minZ &&
    z <= water.maxZ;
  for (const fish of world.entities) {
    const hard = boundsFor(fish.species, world).hard;
    if (
      fish.x < hard.minX ||
      fish.x > hard.maxX ||
      fish.y < hard.minY ||
      fish.y > hard.maxY ||
      fish.z < hard.minZ ||
      fish.z > hard.maxZ
    ) {
      problems.push(`poisson ${fish.id} hors de sa zone de nage`);
    }
  }
  for (const p of world.food) {
    if (!inBox(p.x, p.y, p.z)) {
      problems.push(`granulé ${p.id} hors de l’eau`);
    }
  }
  const buffer = createBubbleBuffer();
  const n = worldBubbles(world, buffer);
  for (let i = 0; i < n; i++) {
    const [x, y, z] = [0, 1, 2].map((k) => buffer.positions[3 * i + k]);
    if (!inBox(x, y, z)) {
      problems.push(`bulle ${i} hors de l’eau`);
    }
  }
  return problems;
}

describe('clampTankDimensions (#171)', () => {
  it('garde les dimensions par défaut, qui tombent sur un pas', () => {
    expect(clampTankDimensions(DEFAULT_TANK)).toEqual(DEFAULT_TANK);
    for (const key of ['width', 'height', 'depth'] as const) {
      const { min, step } = TANK_LIMITS[key];
      const steps = (DEFAULT_TANK[key] - min) / step;
      expect(Math.abs(steps - Math.round(steps))).toBeLessThan(1e-9);
    }
  });

  it('borne aux limites, valeurs limites comprises, sans refuser', () => {
    const min = { width: 0.6, height: 0.5, depth: 0.3 };
    expect(clampTankDimensions(min)).toEqual(min);
    expect(clampTankDimensions(MAX_TANK)).toEqual(MAX_TANK);
    expect(clampTankDimensions({ width: 0.1, height: 0, depth: -3 })).toEqual(min);
    expect(clampTankDimensions({ width: 50, height: 2, depth: 1e9 })).toEqual(MAX_TANK);
    expect(clampTankDimensions({ width: 0.5999, height: 0.9001, depth: 0.3 })).toEqual({
      width: 0.6,
      height: 0.9,
      depth: 0.3,
    });
  });

  it('ramène au pas le plus proche, sans erreur d’arrondi', () => {
    expect(clampTankDimensions({ width: 1.14, height: 0.62, depth: 0.476 })).toEqual({
      width: 1.1,
      height: 0.6,
      depth: 0.5,
    });
    for (let n = 0; n <= 14; n++) {
      const w = clampDimension(0.6 + n * 0.1, TANK_LIMITS.width, 1);
      expect(w).toBe(Number((0.6 + n * 0.1).toFixed(2)));
    }
  });

  it('valeur non finie : celle du bac par défaut', () => {
    expect(clampTankDimensions({ width: NaN, height: Infinity, depth: -Infinity })).toEqual(
      DEFAULT_TANK,
    );
  });

  it('sameDimensions compare les trois dimensions', () => {
    expect(sameDimensions(DEFAULT_TANK, { ...DEFAULT_TANK })).toBe(true);
    expect(sameDimensions(DEFAULT_TANK, { ...DEFAULT_TANK, depth: 0.55 })).toBe(false);
  });
});

describe('setTankDimensionsInPlace (#171)', () => {
  it('borne les dimensions demandées et les enregistre dans le monde', () => {
    const world = cloneWorld(createDefaultWorld(1));
    expect(world.dimensions).toBeUndefined();
    expect(setTankDimensionsInPlace(world, { width: 9, height: 0.62, depth: 0.1 })).toEqual({
      width: 2,
      height: 0.6,
      depth: 0.3,
    });
    expect(placeDimensions(world)).toEqual({ width: 2, height: 0.6, depth: 0.3 });
    const water = environmentWater(world);
    expect(water.maxX).toBe(1);
    expect(water.maxZ).toBeCloseTo(0.15, 12);
  });

  it('refuse hors d’un environnement réglable, ou avec des obstacles explicites', () => {
    for (const id of ['bassin', 'paludarium', 'recif'] as const) {
      const world = cloneWorld(createDefaultWorld(3, id));
      const before = structuredClone(world);
      expect(setTankDimensionsInPlace(world, SMALL)).toBeNull();
      expect(world).toEqual(before);
    }
    const explicit = cloneWorld(createWorld(3, [], [sphereObstacle(0, 0, 0.2, 0, 0.05)]));
    expect(setTankDimensionsInPlace(explicit, SMALL)).toBeNull();
    expect(explicit.dimensions).toBeUndefined();
  });

  it('ramène chaque élément du décor dans le bac, emprise comprise, sans changer graine ni forme', () => {
    const world = busyWorld();
    const before = world.decor.map((item) => ({ ...item }));
    setTankDimensionsInPlace(world, SMALL);
    expect(world.decor).toHaveLength(before.length);
    world.decor.forEach((item, i) => {
      const { x, z, ...rest } = item;
      const { x: bx, z: bz, ...beforeRest } = before[i];
      expect(rest).toEqual(beforeRest);
      expect(validateDecorItem(item, SMALL)).toEqual([]);
      const reach = Math.max(decorFootprint(item), DECOR_EDGE_MARGIN);
      // Emprise dans le bac sur chaque axe, sauf élément plus large que le bac (centré).
      const fits = (v: number, half: number) => v === 0 || Math.abs(v) + reach <= half + 1e-9;
      expect(fits(x, SMALL.width / 2)).toBe(true);
      expect(fits(z, SMALL.depth / 2)).toBe(true);
      // Un élément qui tenait déjà garde sa position exacte.
      if (Math.abs(bx) + reach <= SMALL.width / 2 && Math.abs(bz) + reach <= SMALL.depth / 2) {
        expect([x, z]).toEqual([bx, bz]);
      }
    });
    // Obstacles recalculés comme à la création, depuis le décor ramené.
    const rebuilt = createWorld(world.seed, [], [], world.decor, world);
    expect(world.obstacles).toEqual(rebuilt.obstacles);
  });

  it('agrandir laisse le décor en place', () => {
    const world = busyWorld();
    const before = world.decor.map((item) => ({ ...item }));
    setTankDimensionsInPlace(world, LARGE);
    expect(world.decor).toEqual(before);
  });

  it('borne l’élévation d’un élément posé à la hauteur du bac', () => {
    const world = cloneWorld(createDefaultWorld(5));
    const decor = world.decor.map((item, i) => (i === 0 ? { ...item, elevation: 0.55 } : item));
    setDecorInPlace(world, decor);
    setTankDimensionsInPlace(world, { ...DEFAULT_TANK, height: 0.5 });
    expect(world.decor[0].elevation).toBe(0.5);
  });

  it('garde population, identifiants, temps et générateurs', () => {
    const world = busyWorld();
    const before = structuredClone(world);
    setTankDimensionsInPlace(world, SMALL);
    expect(populationCounts(world)).toEqual(populationCounts(before));
    expect(world.entities.map((f) => [f.id, f.species, f.rng])).toEqual(
      before.entities.map((f) => [f.id, f.species, f.rng]),
    );
    expect(world.food.map((p) => p.id)).toEqual(before.food.map((p) => p.id));
    expect([world.tick, world.time, world.nextFishId, world.nextFoodId]).toEqual([
      before.tick,
      before.time,
      before.nextFishId,
      before.nextFoodId,
    ]);
  });

  for (const seed of [0, 42, MAX_SEED]) {
    for (const [name, dims] of [
      ['petit', SMALL],
      ['grand', LARGE],
      ['plat et long', { width: 2, height: 0.5, depth: 0.3 }],
    ] as const) {
      it(`graine ${seed}, bac ${name} : rien hors du bac au pas suivant, ni après 60 s`, () => {
        const world = resized(busyWorld(seed), dims);
        expect(everythingInside(world)).toEqual([]);
        const next = advance(world, 1);
        expect(everythingInside(next)).toEqual([]);
        expect(everythingInside(advance(next, 3600))).toEqual([]);
        // ~4 500 pas de simulation : au-delà des 5 s par défaut sur la CI.
      }, 30_000);
    }
  }

  it('aller-retour vers les dimensions par défaut : bornes de nage d’origine', () => {
    const world = resized(resized(busyWorld(), SMALL), DEFAULT_TANK);
    expect(placeDimensions(world)).toEqual(DEFAULT_TANK);
    expect(boundsFor('neon', world)).toEqual(boundsFor('neon', 'tropical'));
    expect(environmentWater(world)).toEqual(environmentWater('tropical'));
  });

  it('les poissons ajoutés naissent dans le bac redimensionné', () => {
    const world = cloneWorld(resized(createDefaultWorld(9), SMALL));
    setPopulationInPlace(world, 'guppy', 12);
    expect(everythingInside(world)).toEqual([]);
  });

  it('l’édition du décor suit les dimensions réglées', () => {
    const world = resized(createDefaultWorld(9), SMALL);
    const moved = moveDecorItem(world.decor, 0, 5, 5, world);
    expect(moved).not.toBeNull();
    expect(validateDecorItem(moved![0], SMALL)).toEqual([]);
    expect(Math.abs(moved![0].x)).toBeLessThan(SMALL.width / 2);
  });

  it('withTankDimensions ne modifie pas le monde d’origine', () => {
    const world = createDefaultWorld(4);
    const before = structuredClone(world);
    resized(world, SMALL);
    expect(world).toEqual(before);
    expect(withTankDimensions(createDefaultWorld(4, 'bassin'), SMALL)).toBeNull();
  });

  it('même graine, mêmes dimensions : même monde, que la simulation soit pure ou en place', () => {
    const a = cloneWorld(resized(createDefaultWorld(11), SMALL));
    const b = resized(createDefaultWorld(11), SMALL);
    advanceInPlace(a, 300);
    expect(a).toEqual(advance(b, 300));
  });
});

describe('clé du lieu d’un bac redimensionné (#185)', () => {
  it('aucune clé construite par pas : une seule au premier pas après le redimensionnement', () => {
    const world = busyWorld();
    setTankDimensionsInPlace(world, SMALL);
    advanceInPlace(world, 1);
    const before = placeKeyBuildCount();
    advanceInPlace(world, 120);
    expect(placeKeyBuildCount()).toBe(before);
    // Nouveau redimensionnement : nouvel objet `dimensions`, clé reconstruite, puis plus rien.
    setTankDimensionsInPlace(world, LARGE);
    advanceInPlace(world, 1);
    const resized = placeKeyBuildCount();
    expect(resized).toBeGreaterThan(before);
    advanceInPlace(world, 60);
    expect(placeKeyBuildCount()).toBe(resized);
  });

  it('même clé pour des dimensions égales, quel que soit l’objet ; clé propre à chaque environnement', () => {
    const a = { environment: 'tropical' as const, dimensions: { ...SMALL } };
    const b = { environment: 'tropical' as const, dimensions: { ...SMALL } };
    expect(placeKey(a)).toBe('tropical:0.6:0.5:0.3');
    expect(placeKey(b)).toBe(placeKey(a));
    expect(placeKey(a)).toBe(placeKey(a));
    // Le même objet `dimensions` sous un autre environnement ne reprend pas la clé mémorisée.
    expect(placeKey({ environment: 'recif', dimensions: a.dimensions })).toBe('recif:0.6:0.5:0.3');
    expect(placeKey(a)).toBe('tropical:0.6:0.5:0.3');
    // Sans dimensions réglées : l'identifiant seul, sans rien construire.
    const before = placeKeyBuildCount();
    expect(placeKey({ environment: 'tropical' })).toBe('tropical');
    expect(placeKey('bassin')).toBe('bassin');
    expect(placeKeyBuildCount()).toBe(before);
  });
});

describe('dimensions par défaut (#171) : monde inchangé', () => {
  it('un monde jamais redimensionné n’a pas de champ dimensions et avance comme avant', () => {
    const world = createDefaultWorld(42);
    expect('dimensions' in world).toBe(false);
    expect(serializeWorld(world)).not.toContain('dimensions');
  });

  it('diffuseur : exactement la position par défaut aux dimensions par défaut', () => {
    expect(bubbleSourceFor(DEFAULT_TANK)).toEqual(DEFAULT_BUBBLE_SOURCE);
    const source = bubbleSourceFor(SMALL);
    expect(Math.abs(source.x)).toBeLessThan(SMALL.width / 2);
    expect(Math.abs(source.z)).toBeLessThan(SMALL.depth / 2);
  });

  it('le tampon de bulles suffit au plus haut bac', () => {
    const world = resized(createDefaultWorld(42), LARGE);
    const buffer = createBubbleBuffer(MAX_BUBBLES + 20);
    let maxSeen = 0;
    for (let t = 30; t < 60; t += 0.25) {
      maxSeen = Math.max(maxSeen, worldBubbles({ ...world, time: t }, buffer));
    }
    expect(maxSeen).toBeLessThanOrEqual(MAX_BUBBLES);
  });

  it('les tables par lieu restent bornées', () => {
    for (let i = 0; i < PLACE_CACHE_LIMIT + 10; i++) {
      const dims = { width: 0.6 + i * 1e-4, height: 0.5, depth: 0.4 };
      expect(environmentWater({ environment: 'tropical', dimensions: dims }).maxX).toBeCloseTo(
        dims.width / 2,
        12,
      );
    }
  });
});

describe('sauvegarde des dimensions (#171)', () => {
  it('aller-retour : dimensions, décor, poissons et granulés restitués', () => {
    const world = resized(busyWorld(), SMALL);
    const result = parseWorld(serializeWorld(world));
    if (!result.ok) {
      throw new Error(result.error);
    }
    expect(result.world).toEqual(world);
    expect(advance(result.world, 120)).toEqual(advance(world, 120));
  });

  it('ancienne sauvegarde sans dimensions : bac par défaut', () => {
    const data = JSON.parse(serializeWorld(createDefaultWorld(8))) as Record<string, unknown>;
    delete data['dimensions'];
    const result = parseWorld(JSON.stringify(data));
    expect(result.ok && placeDimensions(result.world)).toEqual(DEFAULT_TANK);
    expect(result.ok && result.world.dimensions).toBeUndefined();
  });

  it('dimensions hors bornes : bornées à la lecture, pas refusées', () => {
    const data = JSON.parse(serializeWorld(createDefaultWorld(8))) as Record<string, unknown>;
    data['dimensions'] = { width: 9, height: 0.6, depth: 0.5 };
    const result = parseWorld(JSON.stringify(data));
    expect(result.ok && result.world.dimensions).toEqual({ width: 2, height: 0.6, depth: 0.5 });
  });

  it('refuse des dimensions invalides ou dans un environnement non réglable', () => {
    const base = JSON.parse(serializeWorld(createDefaultWorld(8))) as Record<string, unknown>;
    for (const bad of [
      null,
      3,
      'grand',
      [],
      { width: 1, height: 0.5 },
      { width: 1, height: 'x', depth: 0.4 },
    ]) {
      const result = parseWorld(JSON.stringify({ ...base, dimensions: bad }));
      expect(result.ok).toBe(false);
    }
    const pond = JSON.parse(serializeWorld(createDefaultWorld(8, 'bassin'))) as Record<
      string,
      unknown
    >;
    const result = parseWorld(JSON.stringify({ ...pond, dimensions: SMALL }));
    expect(result.ok ? '' : result.error).toContain('non réglables');
  });

  it('refuse un poisson hors du bac sauvegardé', () => {
    const data = JSON.parse(serializeWorld(resized(createDefaultWorld(8), SMALL))) as {
      fish: { x: number }[];
    };
    data.fish[0].x = 0.5;
    expect(parseWorld(JSON.stringify(data)).ok).toBe(false);
  });
});
