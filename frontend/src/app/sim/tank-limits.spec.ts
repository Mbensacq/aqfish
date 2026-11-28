import { COLD_TANK_DIMENSIONS, ENVIRONMENT_IDS, environmentById } from './environment';
import { parseWorld, serializeWorld } from './save';
import { TANK_LIMITS } from './tank';
import { clampTankDimensionsIn, tankLimits } from './tank-limits';
import { setTankDimensionsInPlace } from './tank-resize';
import { createDefaultWorld } from './world';

/**
 * Bornes des dimensions par environnement (#885) : le bac d'eau froide garde sa hauteur
 * d'origine (45 cm, sous les 50 cm de `TANK_LIMITS`), le bac tropical n'est pas touché.
 */
describe('tankLimits (#885)', () => {
  it('bac tropical : exactement `TANK_LIMITS`', () => {
    expect(tankLimits('tropical')).toEqual(TANK_LIMITS);
  });

  it('bac d’eau froide : hauteur minimale abaissée à 45 cm, sur la même grille de pas', () => {
    const limits = tankLimits('eaufroide');
    expect(limits.height).toEqual({ min: 0.45, max: 0.9, step: 0.05 });
    expect(limits.width).toEqual(TANK_LIMITS.width);
    expect(limits.depth).toEqual(TANK_LIMITS.depth);
  });

  it('chaque environnement : ses dimensions d’origine sont dans ses bornes', () => {
    for (const id of ENVIRONMENT_IDS) {
      const origin = environmentById(id).dimensions;
      const limits = tankLimits(id);
      for (const key of ['width', 'height', 'depth'] as const) {
        expect(limits[key].min, `${id} ${key}`).toBeLessThanOrEqual(origin[key]);
        expect(limits[key].max).toBe(TANK_LIMITS[key].max);
        expect(limits[key].step).toBe(TANK_LIMITS[key].step);
      }
    }
  });

  it('borne au pas : 45 cm gardés au bac d’eau froide, ramenés à 50 cm au bac tropical', () => {
    const dims = { width: 1.2, height: 0.45, depth: 0.45 };
    expect(clampTankDimensionsIn('eaufroide', dims)).toEqual(dims);
    expect(clampTankDimensionsIn('tropical', dims)).toEqual({ ...dims, height: 0.5 });
    // Sous le minimum, au pas, au maximum : mêmes règles que `clampDimension`.
    expect(clampTankDimensionsIn('eaufroide', { ...dims, height: 0.3 }).height).toBe(0.45);
    expect(clampTankDimensionsIn('eaufroide', { ...dims, height: 0.62 }).height).toBe(0.6);
    expect(clampTankDimensionsIn('eaufroide', { ...dims, height: 5 }).height).toBe(0.9);
    expect(clampTankDimensionsIn('eaufroide', { ...dims, height: Number.NaN }).height).toBe(0.6);
  });

  it('bac d’eau froide : régler la longueur ne change plus la hauteur (plus de saut à 50 cm)', () => {
    const world = createDefaultWorld(42, 'eaufroide');
    const applied = setTankDimensionsInPlace(world, { ...COLD_TANK_DIMENSIONS, width: 1.2 });
    expect(applied).toEqual({ width: 1.2, height: 0.45, depth: 0.45 });
    // La sauvegarde relue garde aussi les 45 cm.
    const reread = parseWorld(serializeWorld(world));
    expect(reread.ok && reread.world.dimensions).toEqual({ width: 1.2, height: 0.45, depth: 0.45 });
  });
});
