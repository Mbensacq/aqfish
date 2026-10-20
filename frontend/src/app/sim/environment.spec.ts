import {
  DEFAULT_ENVIRONMENT_ID,
  ENVIRONMENT_IDS,
  ENVIRONMENTS,
  environmentById,
  environmentWater,
  isEnvironmentId,
  POND,
  TROPICAL_TANK,
  type EnvironmentId,
} from './environment';
import { DEFAULT_DECOR, validateDecorItem } from './decor';
import { SPECIES } from './species';
import { DEFAULT_TANK, waterVolume } from './tank';

describe('environnements', () => {
  it('le bac tropical est l’environnement par défaut, avec le bac d’avant #87', () => {
    expect(DEFAULT_ENVIRONMENT_ID).toBe('tropical');
    expect(TROPICAL_TANK.dimensions).toBe(DEFAULT_TANK);
    expect(TROPICAL_TANK.decor).toBe(DEFAULT_DECOR);
    expect(TROPICAL_TANK.population).toEqual(
      Object.values(SPECIES).map((def) => ({ species: def.id, count: def.defaultPopulation })),
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
    for (const bad of ['recif', '', 'constructor', 'toString', null, undefined, 3]) {
      expect(isEnvironmentId(bad)).toBe(false);
    }
  });

  it('environmentById lève pour un environnement inconnu', () => {
    expect(environmentById('bassin')).toBe(POND);
    expect(() => environmentById('recif' as EnvironmentId)).toThrow(RangeError);
    expect(() => environmentById('constructor' as EnvironmentId)).toThrow(RangeError);
  });

  it('environmentWater donne le volume d’eau des dimensions, calculé une fois', () => {
    expect(environmentWater('tropical')).toEqual(waterVolume());
    expect(environmentWater('bassin')).toEqual(waterVolume(POND.dimensions));
    expect(environmentWater('bassin')).toBe(environmentWater('bassin'));
  });
});
