import { createBubbleBuffer } from './bubbles';
import { DEFAULT_DECOR, type DecorItem } from './decor';
import { POND, type EnvironmentId } from './environment';
import { setPopulation } from './population';
import { SPECIES } from './species';
import {
  advance,
  boundsFor,
  createDefaultWorld,
  createWorld,
  feed,
  step,
  worldBubbles,
  type World,
} from './world';

/** Vrai si tous les poissons sont dans la limite de nage `hard` de leur espèce. */
function allInside(world: World): boolean {
  return world.entities.every((fish) => {
    const hard = boundsFor(fish.species, world.environment).hard;
    const eps = 1e-9;
    return (
      fish.x >= hard.minX - eps &&
      fish.x <= hard.maxX + eps &&
      fish.y >= hard.minY - eps &&
      fish.y <= hard.maxY + eps &&
      fish.z >= hard.minZ - eps &&
      fish.z <= hard.maxZ + eps
    );
  });
}

describe('monde et environnement (#87)', () => {
  it('le monde par défaut est le bac tropical, identique à celui d’avant #87', () => {
    const world = createDefaultWorld(42);
    expect(world.environment).toBe('tropical');
    expect(createDefaultWorld(42, 'tropical')).toEqual(world);
    const before = createWorld(
      42,
      Object.values(SPECIES).map((def) => ({ species: def.id, count: def.defaultPopulation })),
      [],
      DEFAULT_DECOR,
    );
    expect(before).toEqual(world);
  });

  it('le bassin de départ : son décor, aucun poisson, déterministe à graine égale', () => {
    const pond = createDefaultWorld(7, 'bassin');
    expect(pond.environment).toBe('bassin');
    expect(pond.entities).toEqual([]);
    expect(pond.decor).toEqual(POND.decor);
    expect(pond.obstacles.length).toBe(POND.decor.length);
    expect(createDefaultWorld(7, 'bassin')).toEqual(pond);
  });

  it('changer d’environnement recrée un monde valide et déterministe (poissons ajoutés)', () => {
    for (const seed of [0, 1, 42, 4294967295]) {
      const make = () => setPopulation(createDefaultWorld(seed, 'bassin'), 'neon', 12);
      const a = advance(make(), 600);
      expect(advance(make(), 600)).toEqual(a);
      expect(a.environment).toBe('bassin');
      expect(a.entities).toHaveLength(12);
      expect(allInside(a)).toBe(true);
      expect(JSON.parse(JSON.stringify(a))).toEqual(a);
    }
  });

  it('les poissons du bassin nagent dans le volume du bassin, pas dans celui du bac', () => {
    const pond = boundsFor('neon', 'bassin').hard;
    const tank = boundsFor('neon', 'tropical').hard;
    expect(boundsFor('neon')).toBe(boundsFor('neon', 'tropical'));
    expect(pond.maxX).toBeGreaterThan(tank.maxX);
    expect(pond.maxY).toBeLessThan(tank.maxY);
    // Graines différentes : des néons naissent ou passent hors des bornes du bac.
    const world = advance(createWorld(3, [{ species: 'neon', count: 20 }], [], [], 'bassin'), 1200);
    expect(allInside(world)).toBe(true);
    const outsideTank = world.entities.some(
      (f) => Math.abs(f.x) > tank.maxX || Math.abs(f.z) > tank.maxZ,
    );
    expect(outsideTank).toBe(true);
  });

  it('step garde l’environnement', () => {
    expect(step(createDefaultWorld(1, 'bassin')).environment).toBe('bassin');
  });

  it('le décor est validé dans les dimensions de l’environnement', () => {
    const farRock: DecorItem = { kind: 'rock', x: 0.85, z: 0.5, rotation: 0, scale: 1, seed: 1 };
    expect(() => createWorld(1, [], [], [farRock])).toThrow(RangeError);
    expect(createWorld(1, [], [], [farRock], 'bassin').decor).toEqual([farRock]);
  });

  it('refuse un environnement inconnu', () => {
    expect(() => createWorld(1, [], [], [], 'recif' as EnvironmentId)).toThrow(RangeError);
    expect(() => createDefaultWorld(1, 'constructor' as EnvironmentId)).toThrow(RangeError);
  });

  it('la nourriture se dépose dans le volume de l’environnement', () => {
    expect(feed(createDefaultWorld(1), 0.85, 0.5).food).toHaveLength(0);
    expect(feed(createDefaultWorld(1, 'bassin'), 0.85, 0.5).food.length).toBeGreaterThan(0);
    expect(feed(createDefaultWorld(1, 'bassin'), 1.2, 0).food).toHaveLength(0);
  });

  it('pas de bulles dans le bassin (aucun diffuseur)', () => {
    const buffer = createBubbleBuffer();
    const pond = advance(createDefaultWorld(5, 'bassin'), 600);
    expect(worldBubbles(pond, buffer)).toBe(0);
    expect(buffer.count).toBe(0);
    expect(worldBubbles(advance(createDefaultWorld(5), 600), buffer)).toBeGreaterThan(0);
  });
});
