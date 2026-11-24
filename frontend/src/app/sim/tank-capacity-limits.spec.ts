import { describe, expect, it } from 'vitest';

import { setCareModeInPlace } from './care-mode';
import { NO_FISH, type PopulationCounts } from './population';
import type { SpeciesId } from './species';
import {
  capacityAlert,
  capacityLimits,
  capacityLine,
  tankCapacity,
  type TankCapacityReadout,
} from './tank-capacity-limits';
import { createDefaultWorld, createWorld } from './world';

/** Bornes techniques uniformes, pour isoler la capacité. */
function bounds(value: number): PopulationCounts {
  return Object.fromEntries(Object.keys(NO_FISH).map((id) => [id, value])) as Record<
    SpeciesId,
    number
  >;
}

function readout(overrides: Partial<TankCapacityReadout> = {}): TankCapacityReadout {
  return {
    grossLiters: 288,
    liters: 283.8,
    status: { needLiters: 179.3, occupation: 179.3 / 283.8, over: false },
    decor: false,
    ...overrides,
  };
}

describe('capacité branchée sur les compteurs (#809)', () => {
  it('S3 : 120 L et un poisson rouge, le deuxième est refusé avec la raison OATA', () => {
    const tank = { liters: 120, population: [{ species: 'rouge' as const, count: 1 }] };

    const { limits, reasons } = capacityLimits(tank, ['rouge'], bounds(10));

    expect(limits.rouge).toBe(1);
    expect(reasons.rouge).toBe(
      '120 L : un poisson rouge adulte demande 100 L, puis 50 L par poisson rouge en plus (OATA) ; il faudrait 150 L',
    );
  });

  it('compteurs bornés sur plusieurs espèces : chacune compte avec les autres', () => {
    // Néon 4 cm × 1,5 L/cm = 6 L ; 60 L : 10 néons, ou moins s'il y a déjà des guppys.
    const alone = capacityLimits({ liters: 60, population: [] }, ['neon'], bounds(50));
    const mixed = capacityLimits(
      { liters: 60, population: [{ species: 'guppy', count: 4 }] },
      ['neon', 'guppy'],
      bounds(50),
    );

    expect(alone.limits.neon).toBe(10);
    expect(mixed.limits.neon).toBeLessThan(10);
    expect(mixed.limits.guppy).toBeGreaterThanOrEqual(4);
    expect(mixed.reasons.neon).toContain('60 L');
  });

  it('la borne technique reste à part : jamais dépassée, et sans raison de capacité', () => {
    const { limits, reasons } = capacityLimits(
      { liters: 1000, population: [] },
      ['neon'],
      bounds(3),
    );

    expect(limits.neon).toBe(3);
    expect(reasons.neon).toBeUndefined();
  });

  it('bac trop plein : l’effectif actuel est gardé, aucun ajout', () => {
    const tank = { liters: 120, population: [{ species: 'rouge' as const, count: 4 }] };

    const { limits, reasons } = capacityLimits(tank, ['rouge'], bounds(10));

    expect(limits.rouge).toBe(4);
    expect(reasons.rouge).toContain('il faudrait 300 L');
  });

  it('bac sous le volume minimal : aucun ajout, raison du volume minimal', () => {
    const { limits, reasons } = capacityLimits(
      { liters: 50, population: [] },
      ['rouge'],
      bounds(10),
    );

    expect(limits.rouge).toBe(0);
    expect(reasons.rouge).toContain('demande un bac d’au moins 100 L');
  });

  it('sans eau ou volume non fini : aucun ajout', () => {
    expect(capacityLimits({ liters: 0, population: [] }, ['neon'], bounds(5)).limits.neon).toBe(0);
    expect(
      capacityLimits({ liters: Number.NaN, population: [] }, ['neon'], bounds(5)).limits.neon,
    ).toBe(0);
  });

  it('mode décor : aucune contrainte, les bornes sont rendues telles quelles', () => {
    const tank = { liters: 10, population: [], mode: 'decor' as const };

    const { limits, reasons } = capacityLimits(tank, ['rouge', 'koi'], bounds(7));

    expect(limits.rouge).toBe(7);
    expect(limits.koi).toBe(7);
    expect(reasons).toEqual({});
  });

  it('espèce absente de la liste : sa borne est gardée', () => {
    const { limits } = capacityLimits({ liters: 10, population: [] }, ['neon'], bounds(9));

    expect(limits.koi).toBe(9);
  });
});

describe('capacité lue sur un monde (#809)', () => {
  it('bac tropical par défaut : volume réel décor déduit, dans sa capacité', () => {
    const capacity = tankCapacity(createDefaultWorld(1));

    expect(capacity.grossLiters).toBeCloseTo(288, 6);
    expect(capacity.liters).toBeLessThan(capacity.grossLiters);
    expect(capacity.status.over).toBe(false);
    expect(capacity.decor).toBe(false);
    expect(capacityAlert(capacity)).toBeNull();
  });

  it('sauvegarde trop pleine : alerte, aucun animal retiré', () => {
    const world = createWorld(1, [{ species: 'neon', count: 60 }]);
    const before = JSON.stringify(world);

    const capacity = tankCapacity(world);

    expect(capacity.status.over).toBe(true);
    expect(capacityAlert(capacity)).toMatch(/^Bac au-delà de sa capacité \(\d+ %\)/);
    expect(capacityAlert(capacity)).toContain('Aucun animal n’a été retiré');
    expect(JSON.stringify(world)).toBe(before);
    expect(world.entities).toHaveLength(60);
  });

  it('mode décor : ni alerte ni contrôle, même trop plein', () => {
    const world = createWorld(1, [{ species: 'neon', count: 60 }]);
    setCareModeInPlace(world, 'decor');

    const capacity = tankCapacity(world);

    expect(capacity.decor).toBe(true);
    expect(capacityAlert(capacity)).toBeNull();
    expect(capacityLine(capacity)).toMatch(/^Mode décor : capacité non contrôlée/);
  });
});

describe('textes de la capacité (#809)', () => {
  it('ligne d’occupation : pourcentage, besoin, volume réel et litres bruts', () => {
    expect(capacityLine(readout())).toBe(
      '63 % de la capacité : 179,3 L demandés pour 283,8 L d’eau réelle (288 L bruts, décor déduit)',
    );
  });

  it('bac sans eau avec des animaux : occupation infinie écrite « ∞ % »', () => {
    const line = capacityLine(
      readout({ liters: 0, status: { needLiters: 6, occupation: Infinity, over: true } }),
    );

    expect(line).toMatch(/^∞ % de la capacité/);
  });

  it('alerte seulement au-delà de la capacité', () => {
    expect(capacityAlert(readout())).toBeNull();
    expect(
      capacityAlert(readout({ status: { needLiters: 300, occupation: 300 / 283.8, over: true } })),
    ).toBe(
      'Bac au-delà de sa capacité (106 %) : 300 L demandés pour 283,8 L d’eau réelle. Aucun animal n’a été retiré ; ajouts refusés tant que le bac reste trop plein.',
    );
  });
});
