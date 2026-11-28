import { describe, expect, it } from 'vitest';

import { compatibility, incompatible } from './compatibility';
import { isDecorEditable } from './decor-edit';
import { COLD_TANK, environmentById, isTankResizable, livesIn } from './environment';
import { populationLimits, setPopulation } from './population';
import { addTank, createRoom, findTank, TANK_SIZES } from './room-state';
import { parseWorld, serializeWorld } from './save';
import { populationOf } from './tank-capacity';
import { capacityLimits, tankCapacity } from './tank-capacity-limits';
import { withTankDimensions } from './tank-resize';
import { createDefaultWorld } from './world';
import type { World } from './world-types';

/**
 * Scénario S3 jouable (#862, ADR 0190) : le poisson rouge est proposé au bac d'eau froide,
 * qui se redimensionne ; dans environ 120 L, un poisson rouge adulte bloque le deuxième avec la
 * raison OATA. L'axolotl et le poisson rouge restent incompatibles.
 */

/** Bac d'eau froide de 80 × 40 cm, 50 cm de haut : environ 123 L d'eau réelle. */
const S3_TANK = { width: 0.8, height: 0.5, depth: 0.4 };

/** Bac d'eau froide par défaut, sans axolotl, avec `goldfish` poissons rouges, redimensionné. */
function goldfishTank(goldfish: number, dims = S3_TANK): World {
  const empty = setPopulation(createDefaultWorld(42, 'eaufroide'), 'axolotl', 0);
  const resized = withTankDimensions(setPopulation(empty, 'rouge', goldfish), dims);
  if (resized === null) {
    throw new Error('bac d’eau froide non redimensionnable');
  }
  return resized;
}

/** Effectif maximal de poissons rouges et raison du refus, comme l'interface les calcule. */
function goldfishLimit(world: World): { max: number; reason: string | undefined } {
  const { liters } = tankCapacity(world);
  const { limits, reasons } = capacityLimits(
    { liters, population: populationOf(world) },
    environmentById(world.environment).species,
    populationLimits(world),
  );
  return { max: limits.rouge, reason: reasons.rouge };
}

describe('bac d’eau froide de poissons rouges (#862)', () => {
  it('le poisson rouge y est proposé, le bac se redimensionne', () => {
    expect(livesIn('eaufroide', 'rouge')).toBe(true);
    expect(isTankResizable('eaufroide')).toBe(true);
    // Les curseurs de dimensions sont dans l'éditeur de décor : il s'ouvre au bac d'eau froide.
    expect(isDecorEditable('eaufroide')).toBe(true);
    expect(COLD_TANK.population.map((p) => p.species)).toEqual(['axolotl']);
  });

  it('S3 : environ 120 L et un poisson rouge adulte, le deuxième est refusé (OATA)', () => {
    const world = goldfishTank(1);
    const { liters } = tankCapacity(world);
    expect(liters).toBeGreaterThan(115);
    expect(liters).toBeLessThan(130);
    const { max, reason } = goldfishLimit(world);
    expect(max).toBe(1);
    expect(reason).toMatch(
      /^1\d\d,\d L : un poisson rouge adulte demande 100 L, puis 50 L par poisson rouge en plus \(OATA\) ; il faudrait 150 L$/,
    );
  });

  it('cas limites : bac minimal refuse même le premier, grand bac en accepte plusieurs', () => {
    const tiny = goldfishLimit(goldfishTank(0, { width: 0.6, height: 0.5, depth: 0.3 }));
    expect(tiny.max).toBe(0);
    expect(tiny.reason).toContain('un poisson rouge demande un bac d’au moins 100 L (OATA)');
    const large = goldfishLimit(goldfishTank(1, { width: 2, height: 0.9, depth: 0.9 }));
    expect(large.max).toBeGreaterThan(2);
  });

  it('le bac d’eau froide par défaut reste sous la capacité (ADR 0173)', () => {
    const world = createDefaultWorld(42, 'eaufroide');
    expect(world.dimensions).toBeUndefined();
    expect(tankCapacity(world).status.over).toBe(false);
  });

  it('axolotl et poisson rouge toujours incompatibles, dans les deux sens', () => {
    expect(compatibility('axolotl', 'rouge')).toBe(compatibility('rouge', 'axolotl'));
    expect(compatibility('axolotl', 'rouge')).not.toBe('compatible');
    expect(incompatible('rouge', 'axolotl')).toBe(true);
  });

  it('sauvegarde : bac redimensionné et poisson rouge relus à l’identique', () => {
    const world = goldfishTank(1);
    const parsed = parseWorld(serializeWorld(world));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.world.environment).toBe('eaufroide');
    expect(parsed.world.dimensions).toEqual(S3_TANK);
    expect(populationOf(parsed.world)).toEqual(populationOf(world));
  });

  it('sauvegarde ancienne du bac d’eau froide (sans dimensions) toujours lisible', () => {
    const data = JSON.parse(serializeWorld(createDefaultWorld(42, 'eaufroide'))) as Record<
      string,
      unknown
    >;
    expect(data['dimensions']).toBeUndefined();
    const parsed = parseWorld(JSON.stringify(data));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.world.dimensions).toBeUndefined();
    expect(populationOf(parsed.world)).toEqual([{ species: 'axolotl', count: 2 }]);
  });

  it('pièce : un bac d’eau froide ajouté prend la taille choisie au catalogue', () => {
    const added = addTank(createRoom(42, ['tropical']), {
      environment: 'eaufroide',
      size: 'petit',
      placement: { supportId: null, x: 2.5, z: 2, quarter: 0 },
      name: 'Poissons rouges',
    });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(findTank(added.room, added.id)?.world.dimensions).toEqual(TANK_SIZES.petit.dimensions);
  });
});
