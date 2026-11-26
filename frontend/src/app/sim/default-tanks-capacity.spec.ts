import { describe, expect, it } from 'vitest';

import { ENVIRONMENT_IDS, environmentById } from './environment';
import { capacityAlert, tankCapacity } from './tank-capacity-limits';
import { canAdd, populationOf } from './tank-capacity';
import { createDefaultWorld } from './world';

/**
 * Bacs par défaut sous leur capacité (#811, ADR 0173) : au premier lancement, en mode soins,
 * aucun environnement n'affiche l'alerte de capacité.
 */
describe('bacs par défaut sous leur capacité (#811)', () => {
  it.each(ENVIRONMENT_IDS)('%s : pas d’alerte au premier lancement, graines 1 et 7', (id) => {
    for (const seed of [1, 7]) {
      const capacity = tankCapacity(createDefaultWorld(seed, id));

      expect(capacity.decor).toBe(false);
      expect(capacity.status.over).toBe(false);
      expect(capacity.status.occupation).toBeLessThanOrEqual(1);
      expect(capacityAlert(capacity)).toBeNull();
    }
  });

  it('bassin : trois koïs, 720 L demandés pour 834 L d’eau réelle ; une quatrième refusée', () => {
    const world = createDefaultWorld(1, 'bassin');
    const capacity = tankCapacity(world);

    expect(environmentById('bassin').population).toEqual([{ species: 'koi', count: 3 }]);
    expect(capacity.status.needLiters).toBeCloseTo(720, 6);
    expect(capacity.liters).toBeCloseTo(834.3, 1);
    expect(Math.round(capacity.status.occupation * 100)).toBe(86);

    const verdict = canAdd({ liters: capacity.liters, population: populationOf(world) }, 'koi');
    expect(verdict.ok).toBe(false);
    expect(verdict.limit).toBe('capacite');
  });

  it('paludarium : deux sonneurs comptés sur les 105 L du milieu (ADR 0177) ; un triton accepté, pas deux', () => {
    const world = createDefaultWorld(1, 'paludarium');
    const capacity = tankCapacity(world);

    expect(environmentById('paludarium').population).toEqual([{ species: 'grenouille', count: 2 }]);
    // Plus rien sur l'eau réelle : 2 × 18,9 L sur le milieu, berge comprise.
    expect(capacity.status.needLiters).toBe(0);
    expect(capacity.status.milieuNeedLiters).toBeCloseTo(37.8, 6);
    expect(capacity.liters).toBeCloseTo(45.7, 1);
    expect(capacity.grossLiters).toBeCloseTo(105, 6);
    expect(Math.round(capacity.status.occupation * 100)).toBe(36);

    const tank = {
      liters: capacity.liters,
      milieuLiters: capacity.grossLiters,
      population: populationOf(world),
    };
    // Critère de #813 : un sonneur et un triton cohabitent en mode soins (94,6 L pour 105 L).
    const triton = canAdd(tank, 'triton');
    expect(triton.ok).toBe(true);
    expect(Math.round(triton.occupation * 100)).toBe(90);
    expect(triton.reason).toContain('105 L de milieu');
    expect(triton.reason).toContain('(PetMD)');

    const withTriton = {
      ...tank,
      population: [...tank.population, { species: 'triton' as const, count: 1 }],
    };
    expect(canAdd(withTriton, 'triton').ok).toBe(false);
    expect(canAdd(withTriton, 'triton').limit).toBe('capacite');
    expect(canAdd(withTriton, 'grenouille').ok).toBe(false);
    // Sans triton : cinq sonneurs (94,5 L), pas six (113,4 L).
    const five = { ...tank, population: [{ species: 'grenouille' as const, count: 4 }] };
    expect(canAdd(five, 'grenouille').ok).toBe(true);
    expect(
      canAdd({ ...tank, population: [{ species: 'grenouille' as const, count: 5 }] }, 'grenouille')
        .ok,
    ).toBe(false);
    // L'axolotl reste compté sur l'eau réelle : 45,7 L sous ses 75 L.
    expect(canAdd(tank, 'axolotl').limit).toBe('volume-minimal');
  });
});
