import { environmentById, environmentWater, placeKey } from './environment';
import {
  constrainToShape,
  insideShape,
  isPondShape,
  keepInShape,
  POND_SHAPES,
  shapeContour,
  shapeDistance,
  shapeNormal,
  shapeOutline,
  type PondShape,
} from './pond-shape';
import { setPondShapeInPlace, withPondShape } from './pond-reshape';
import { parseWorld, serializeWorld } from './save';
import { SPECIES } from './species';
import {
  advance,
  advanceInPlace,
  boundsFor,
  cloneWorld,
  createDefaultWorld,
  createWorld,
  feed,
  type World,
} from './world';

/** Boîte de 2 m × 1,4 m centrée (celle de l'eau du bassin, en X et Z). */
const BOX = { minX: -1, maxX: 1, minY: 0, maxY: 0.3, minZ: -0.7, maxZ: 0.7 };

function pondWorld(shape: PondShape, seed = 42): World {
  const env = environmentById('bassin');
  return createWorld(seed, env.population, [], env.decor, { environment: 'bassin', shape });
}

describe('forme du bassin : distance au bord (#190)', () => {
  it('reconnaît les trois formes et rien d’autre', () => {
    expect(POND_SHAPES).toEqual(['rectangle', 'ovale', 'haricot']);
    for (const s of POND_SHAPES) {
      expect(isPondShape(s)).toBe(true);
    }
    for (const v of ['', 'Ovale', 'cercle', 0, null, undefined, {}]) {
      expect(isPondShape(v)).toBe(false);
    }
  });

  it('rectangle : distance exacte au bord de la boîte', () => {
    const o = shapeOutline('rectangle', BOX);
    expect(shapeDistance(o, 0, 0)).toBeCloseTo(0.7, 12);
    expect(shapeDistance(o, 1, 0)).toBeCloseTo(0, 12);
    expect(shapeDistance(o, 0.9, 0.65)).toBeCloseTo(0.05, 12);
    // Coin : intérieur ; dehors, distance euclidienne au coin.
    expect(insideShape(o, 0.999, 0.699)).toBe(true);
    expect(shapeDistance(o, 1.3, 1.1)).toBeCloseTo(-0.5, 12);
  });

  it('ovale : centre, bord, coin de la boîte, point extérieur', () => {
    const o = shapeOutline('ovale', BOX);
    expect(shapeDistance(o, 0, 0)).toBeCloseTo(0.7, 12);
    // Sur les axes, distance exacte.
    expect(shapeDistance(o, 0.5, 0)).toBeCloseTo(0.5, 9);
    expect(shapeDistance(o, 0, 0.6)).toBeCloseTo(0.1, 9);
    // Sur le bord : nulle.
    const a = 0.8;
    expect(shapeDistance(o, Math.cos(a), 0.7 * Math.sin(a))).toBeCloseTo(0, 9);
    // Coin de la boîte : hors de l'ovale, alors qu'il est dans le rectangle.
    expect(insideShape(o, 0.95, 0.65)).toBe(false);
    expect(shapeDistance(o, 0.95, 0.65)).toBeLessThan(0);
    expect(shapeDistance(o, 2, 0)).toBeCloseTo(-1, 9);
  });

  it('haricot : échancrure au milieu du côté +Z, centre dans l’eau', () => {
    const o = shapeOutline('haricot', BOX);
    expect(insideShape(o, 0, 0, 0.3)).toBe(true);
    // Milieu du côté +Z : dans l'ovale, mais dans l'échancrure.
    expect(insideShape(shapeOutline('ovale', BOX), 0, 0.55)).toBe(true);
    expect(insideShape(o, 0, 0.55)).toBe(false);
    // Côté −Z et extrémités en X : comme l'ovale.
    expect(insideShape(o, 0, -0.65)).toBe(true);
    expect(insideShape(o, 0.95, 0)).toBe(true);
    expect(insideShape(o, 0.95, 0.65)).toBe(false);
    expect(shapeDistance(o, 0, 3)).toBeLessThan(0);
    // Toujours au plus la distance à l'ovale (intersection).
    for (const [x, z] of [
      [0, 0],
      [0.4, 0.2],
      [-0.7, -0.3],
      [0.3, 0.6],
    ]) {
      expect(shapeDistance(o, x, z)).toBeLessThanOrEqual(
        shapeDistance(shapeOutline('ovale', BOX), x, z) + 1e-12,
      );
    }
  });

  it('boîte dégénérée : tout point est dehors', () => {
    const o = shapeOutline('ovale', { ...BOX, maxX: -1 });
    expect(insideShape(o, -1, 0)).toBe(false);
  });

  it('normale intérieure unitaire, nulle au centre de l’ovale', () => {
    const o = shapeOutline('ovale', BOX);
    const n = shapeNormal(o, 0.99, 0, { x: 0, z: 0 });
    expect(n.x).toBeCloseTo(-1, 6);
    expect(n.z).toBeCloseTo(0, 6);
    const top = shapeNormal(o, 0, 0.69, { x: 0, z: 0 });
    expect(top.z).toBeCloseTo(-1, 6);
    const c = shapeNormal(o, 0, 0, { x: 9, z: 9 });
    expect(Math.hypot(c.x, c.z)).toBeLessThanOrEqual(1);
  });

  it('ramène dans la forme à la marge demandée, sans toucher un point déjà dedans', () => {
    for (const shape of ['ovale', 'haricot'] as const) {
      const o = shapeOutline(shape, BOX);
      const out = { x: 0, z: 0 };
      expect(constrainToShape(o, 0.1, -0.1, 0.05, out)).toEqual({ x: 0.1, z: -0.1 });
      for (const [x, z] of [
        [0.98, 0.69],
        [-1.5, -1.5],
        [0, 0.5],
        [0.2, 0.45],
        [40, -30],
      ]) {
        constrainToShape(o, x, z, 0.05, out);
        expect(insideShape(o, out.x, out.z, 0.05 - 1e-9)).toBe(true);
      }
      // Marge plus grande que la forme : au centre.
      constrainToShape(o, 0.9, 0, 5, out);
      expect(out).toEqual({ x: 0, z: 0 });
      const p = { x: 0.99, z: 0.69 };
      keepInShape(p, o, 0);
      expect(insideShape(o, p.x, p.z)).toBe(true);
    }
  });

  it('contour : points sur le bord, dans l’ordre des angles', () => {
    expect(() => shapeContour(shapeOutline('ovale', BOX), 2)).toThrow(RangeError);
    expect(() => shapeContour(shapeOutline('ovale', BOX), 3.5)).toThrow(RangeError);
    for (const shape of POND_SHAPES) {
      const o = shapeOutline(shape, BOX);
      const pts = shapeContour(o, 48);
      expect(pts).toHaveLength(96);
      for (let i = 0; i < pts.length; i += 2) {
        expect(Math.abs(shapeDistance(o, pts[i], pts[i + 1]))).toBeLessThan(1e-6);
      }
    }
    const bean = shapeContour(shapeOutline('haricot', BOX), 4);
    // Angle π/2 : fond de l'échancrure, bien en deçà du bord de la boîte.
    expect(bean[3]).toBeLessThan(0.5);
  });
});

describe('bassin ovale ou haricot : nage (#190)', () => {
  it('rectangle : mêmes bornes et même monde qu’avant', () => {
    const before = createDefaultWorld(42, 'bassin');
    const rect = pondWorld('rectangle');
    expect(rect).toEqual(before);
    expect(rect.shape).toBeUndefined();
    expect(advance(rect, 300)).toEqual(advance(before, 300));
    expect(boundsFor('koi', 'bassin').outline).toBeUndefined();
  });

  it('refuse une forme inconnue ou hors du bassin', () => {
    expect(() =>
      createWorld(1, [], [], [], { environment: 'bassin', shape: 'cercle' as PondShape }),
    ).toThrow(RangeError);
    expect(() => createWorld(1, [], [], [], { environment: 'tropical', shape: 'ovale' })).toThrow(
      RangeError,
    );
    expect(createWorld(1, [], [], [], { environment: 'tropical', shape: 'rectangle' }).shape).toBe(
      undefined,
    );
  });

  it('clé de lieu distincte par forme', () => {
    const keys = POND_SHAPES.map((shape) => placeKey({ environment: 'bassin', shape }));
    expect(keys[0]).toBe('bassin');
    expect(new Set(keys).size).toBe(3);
    expect(placeKey({ environment: 'bassin', shape: 'ovale' })).toBe(keys[1]);
  });

  for (const shape of POND_SHAPES) {
    it(`graine 42, 600 pas : aucun koï hors de la forme ${shape}`, () => {
      const world = cloneWorld(pondWorld(shape));
      const outline = shapeOutline(shape, environmentWater('bassin'));
      const margin = SPECIES.koi.wallMargin;
      expect(world.entities.length).toBeGreaterThan(0);
      for (const fish of world.entities) {
        expect(insideShape(outline, fish.x, fish.z, margin - 1e-9)).toBe(true);
      }
      for (let t = 0; t < 600; t++) {
        advanceInPlace(world, 1);
        for (const fish of world.entities) {
          expect(insideShape(outline, fish.x, fish.z, margin - 1e-9)).toBe(true);
        }
      }
    });
  }

  it('les koïs explorent l’ovale (pas collés au centre)', () => {
    const world = cloneWorld(pondWorld('ovale'));
    let far = 0;
    const outline = shapeOutline('ovale', environmentWater('bassin'));
    for (let t = 0; t < 600; t++) {
      advanceInPlace(world, 1);
      for (const fish of world.entities) {
        if (shapeDistance(outline, fish.x, fish.z) < 0.25) {
          far += 1;
        }
      }
    }
    expect(far).toBeGreaterThan(0);
  });

  it('nourriture : rien sur la berge, granulés dans l’eau près du bord', () => {
    const world = pondWorld('haricot');
    expect(feed(world, 0.97, 0.68).food).toHaveLength(0);
    expect(feed(world, 0, 0.6).food).toHaveLength(0);
    const fed = feed(world, 0.99, 0);
    expect(fed.food.length).toBeGreaterThan(0);
    const outline = shapeOutline('haricot', environmentWater('bassin'));
    for (const p of fed.food) {
      expect(insideShape(outline, p.x, p.z)).toBe(true);
    }
  });
});

describe('forme du bassin : réglage et sauvegarde (#190)', () => {
  it('passe de rectangle à haricot en ramenant poissons et granulés', () => {
    let world: World = feed(advance(createDefaultWorld(7, 'bassin'), 200), 0.95, 0.65);
    world = advance(world, 1);
    const shaped = withPondShape(world, 'haricot')!;
    expect(shaped.shape).toBe('haricot');
    expect(shaped.entities.map((f) => f.id)).toEqual(world.entities.map((f) => f.id));
    expect(shaped.decor).toEqual(world.decor);
    expect(shaped.obstacles).toEqual(world.obstacles);
    const outline = shapeOutline('haricot', environmentWater('bassin'));
    for (const fish of shaped.entities) {
      expect(insideShape(outline, fish.x, fish.z, SPECIES.koi.wallMargin - 1e-9)).toBe(true);
      expect(insideShape(outline, fish.px, fish.pz, SPECIES.koi.wallMargin - 1e-9)).toBe(true);
    }
    for (const p of shaped.food) {
      expect(insideShape(outline, p.x, p.z, -1e-9)).toBe(true);
    }
    // Le monde d'origine n'est pas modifié ; retour au rectangle : forme absente.
    expect(world.shape).toBeUndefined();
    const back = cloneWorld(shaped);
    expect(setPondShapeInPlace(back, 'rectangle')).toBe('rectangle');
    expect(back.shape).toBeUndefined();
    expect('shape' in back).toBe(false);
    expect(setPondShapeInPlace(back, 'rectangle')).toBe('rectangle');
  });

  it('refuse hors du bassin ou une forme inconnue', () => {
    const tropical = cloneWorld(createDefaultWorld(3));
    expect(setPondShapeInPlace(tropical, 'ovale')).toBeNull();
    expect(tropical.shape).toBeUndefined();
    const pond = cloneWorld(createDefaultWorld(3, 'bassin'));
    expect(setPondShapeInPlace(pond, 'triangle' as PondShape)).toBeNull();
    expect(withPondShape(createDefaultWorld(3), 'ovale')).toBeNull();
  });

  it('aller-retour JSON : forme conservée, même suite de pas', () => {
    for (const shape of ['ovale', 'haricot'] as const) {
      const world = advance(pondWorld(shape, 9), 50);
      const text = serializeWorld(world);
      expect(JSON.parse(text).shape).toBe(shape);
      const result = parseWorld(text);
      if (!result.ok) {
        throw new Error(result.error);
      }
      expect(result.world).toEqual(world);
      expect(advance(result.world, 120)).toEqual(advance(world, 120));
    }
  });

  it('sauvegarde ancienne sans forme : rectangle ; rectangle jamais écrit', () => {
    const world = advance(createDefaultWorld(5, 'bassin'), 20);
    const text = serializeWorld(world);
    expect(JSON.parse(text).shape).toBeUndefined();
    const result = parseWorld(text);
    expect(result.ok && result.world.shape).toBeUndefined();
    const explicit = JSON.parse(text);
    explicit.shape = 'rectangle';
    const parsed = parseWorld(JSON.stringify(explicit));
    expect(parsed.ok && parsed.world).toEqual(world);
  });

  it('refuse une forme inconnue ou hors du bassin à la relecture', () => {
    const data = JSON.parse(serializeWorld(createDefaultWorld(5, 'bassin')));
    data.shape = 'étoile';
    const bad = parseWorld(JSON.stringify(data));
    expect(bad.ok).toBe(false);
    expect(!bad.ok && bad.error).toContain('forme de bassin inconnue');
    const tropical = JSON.parse(serializeWorld(createDefaultWorld(5)));
    tropical.shape = 'ovale';
    const refused = parseWorld(JSON.stringify(tropical));
    expect(!refused.ok && refused.error).toContain('forme non réglable');
  });
});
