import {
  DEFAULT_ENVIRONMENT_ID,
  ENVIRONMENT_IDS,
  ENVIRONMENTS,
  environmentById,
  environmentWater,
  isEnvironmentId,
  PALUDARIUM,
  POND,
  TROPICAL_TANK,
  type EnvironmentId,
} from './environment';
import { DEFAULT_DECOR, validateDecorItem } from './decor';
import { CORYDORA, GUPPY, NEON } from './species';
import { DEFAULT_TANK, SAND_THICKNESS, WATER_LEVEL_RATIO, waterVolume } from './tank';
import { terrainAt, terrainMaxRise } from './terrain';

describe('environnements', () => {
  it('le bac tropical est l’environnement par défaut, avec le bac d’avant #87', () => {
    expect(DEFAULT_ENVIRONMENT_ID).toBe('tropical');
    expect(TROPICAL_TANK.dimensions).toBe(DEFAULT_TANK);
    expect(TROPICAL_TANK.decor).toBe(DEFAULT_DECOR);
    expect(TROPICAL_TANK.population).toEqual(
      [NEON, GUPPY, CORYDORA].map((def) => ({ species: def.id, count: def.defaultPopulation })),
    );
    expect(TROPICAL_TANK.border).toBe('verre');
    expect(TROPICAL_TANK.bubbles).toBe(true);
    expect(TROPICAL_TANK.caustics).toBe(true);
    expect(TROPICAL_TANK.defaultCamera).toBe('three-quarter');
  });

  it('le bassin est plus large et moins profond que le bac, bordé de pierre, vu de dessus', () => {
    const pond = POND.dimensions;
    expect(pond.width).toBeGreaterThan(DEFAULT_TANK.width);
    expect(pond.depth).toBeGreaterThan(DEFAULT_TANK.depth);
    expect(pond.height).toBeLessThan(DEFAULT_TANK.height);
    expect(POND.border).toBe('pierre');
    expect(POND.defaultCamera).toBe('top');
    expect(POND.bubbles).toBe(false);
    expect(POND.water).not.toEqual(TROPICAL_TANK.water);
  });

  it('le paludarium (#129) : bac vitré à moitié en eau, berge émergée, axolotls (#130), grenouilles (#131) et tritons (#133)', () => {
    expect(PALUDARIUM.id).toBe('paludarium');
    expect(PALUDARIUM.name).toBe('Paludarium');
    expect(PALUDARIUM.border).toBe('verre');
    expect(PALUDARIUM.waterLevel).toBeLessThan(WATER_LEVEL_RATIO);
    // Axolotls depuis l'issue #130.
    expect(PALUDARIUM.species).toEqual(['axolotl', 'grenouille', 'triton']);
    expect(PALUDARIUM.population).toEqual([
      { species: 'axolotl', count: 2 },
      { species: 'grenouille', count: 3 },
      { species: 'triton', count: 2 },
    ]);
    expect(PALUDARIUM.bubbles || PALUDARIUM.caustics || PALUDARIUM.rain).toBe(false);
    expect(PALUDARIUM.lilyPads).toBeNull();
    const terrain = PALUDARIUM.terrain;
    if (!terrain) {
      throw new Error('le paludarium doit avoir un sol');
    }
    const water = environmentWater('paludarium');
    expect(water.maxY).toBeCloseTo(PALUDARIUM.dimensions.height * PALUDARIUM.waterLevel, 12);
    // La berge la plus haute reste sous le haut du bac.
    expect(water.maxY + terrainMaxRise(terrain)).toBeLessThan(PALUDARIUM.dimensions.height);
    expect(terrain.bedHeight).toBeGreaterThanOrEqual(SAND_THICKNESS);
    // Environ la moitié de la longueur en eau : part immergée de la surface sur une grille.
    let submerged = 0;
    const n = 100;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const x = water.minX + ((i + 0.5) / n) * (water.maxX - water.minX);
        const z = water.minZ + ((j + 0.5) / n) * (water.maxZ - water.minZ);
        submerged += terrainAt(x, z, terrain, water).submerged ? 1 : 0;
      }
    }
    expect(submerged / (n * n)).toBeGreaterThan(0.4);
    expect(submerged / (n * n)).toBeLessThan(0.6);
  });

  it('seul le paludarium a un sol à berge ; le bac et le bassin gardent l’eau à 90 %', () => {
    expect(TROPICAL_TANK.terrain).toBeNull();
    expect(POND.terrain).toBeNull();
    // Mousses et racines (#132) : seulement sur la berge du paludarium.
    expect(TROPICAL_TANK.bankDecor).toBeNull();
    expect(POND.bankDecor).toBeNull();
    expect(PALUDARIUM.bankDecor).not.toBeNull();
    expect(TROPICAL_TANK.waterLevel).toBe(WATER_LEVEL_RATIO);
    expect(POND.waterLevel).toBe(WATER_LEVEL_RATIO);
  });

  it('chaque environnement est indexé par son identifiant, dans l’ordre du sélecteur', () => {
    expect(Object.keys(ENVIRONMENTS)).toEqual([...ENVIRONMENT_IDS]);
    for (const id of ENVIRONMENT_IDS) {
      expect(ENVIRONMENTS[id].id).toBe(id);
      expect(ENVIRONMENTS[id].name.length).toBeGreaterThan(0);
    }
  });

  it('le décor de départ de chaque environnement tient dans ses dimensions', () => {
    for (const env of Object.values(ENVIRONMENTS)) {
      for (const item of env.decor) {
        expect(validateDecorItem(item, env.dimensions)).toEqual([]);
      }
    }
  });

  it('isEnvironmentId refuse les valeurs inconnues et les clés héritées', () => {
    expect(isEnvironmentId('tropical')).toBe(true);
    expect(isEnvironmentId('bassin')).toBe(true);
    expect(isEnvironmentId('paludarium')).toBe(true);
    for (const bad of ['lune', '', 'constructor', 'toString', null, undefined, 3]) {
      expect(isEnvironmentId(bad)).toBe(false);
    }
  });

  it('environmentById lève pour un environnement inconnu', () => {
    expect(environmentById('bassin')).toBe(POND);
    expect(() => environmentById('lune' as EnvironmentId)).toThrow(RangeError);
    expect(() => environmentById('constructor' as EnvironmentId)).toThrow(RangeError);
  });

  it('environmentWater donne le volume d’eau des dimensions, calculé une fois', () => {
    expect(environmentWater('tropical')).toEqual(waterVolume());
    expect(environmentWater('bassin')).toEqual(waterVolume(POND.dimensions));
    expect(environmentWater('bassin')).toBe(environmentWater('bassin'));
    expect(environmentWater('paludarium')).toEqual(
      waterVolume(PALUDARIUM.dimensions, PALUDARIUM.waterLevel),
    );
  });
});
