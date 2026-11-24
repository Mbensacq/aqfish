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

  it('paludarium : deux sonneurs, 36 L pour 45,7 L ; un triton de plus refusé', () => {
    const world = createDefaultWorld(1, 'paludarium');
    const capacity = tankCapacity(world);

    expect(environmentById('paludarium').population).toEqual([{ species: 'grenouille', count: 2 }]);
    expect(capacity.status.needLiters).toBeCloseTo(36, 6);
    expect(capacity.liters).toBeCloseTo(45.7, 1);
    expect(Math.round(capacity.status.occupation * 100)).toBe(79);

    const tank = { liters: capacity.liters, population: populationOf(world) };
    expect(canAdd(tank, 'triton').ok).toBe(false);
    expect(canAdd(tank, 'grenouille').ok).toBe(false);
  });
});
