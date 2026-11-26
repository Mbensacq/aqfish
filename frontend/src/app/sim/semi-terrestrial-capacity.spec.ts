import { describe, expect, it } from 'vitest';

import { SEMI_TERRESTRIAL_NEEDS } from './semi-terrestrial-needs';
import { capacityLine, type TankCapacityReadout } from './tank-capacity-limits';
import {
  canAdd,
  capacityProfile,
  capacityStatus,
  populationLoad,
  populationNeedLiters,
  referenceLiters,
  speciesNeedLiters,
} from './tank-capacity';

/**
 * Amphibiens semi-terrestres comptés sur le volume du milieu (issue #813, ADR 0177) : sonneur
 * (`grenouille`) et triton ; l'axolotl reste compté sur l'eau réelle.
 */
describe('capacité : amphibiens semi-terrestres sur le milieu (#813)', () => {
  it('références : sonneur et triton sur le milieu, axolotl et poissons sur l’eau', () => {
    expect(capacityProfile('grenouille').reference).toBe('milieu');
    expect(capacityProfile('triton').reference).toBe('milieu');
    expect(capacityProfile('axolotl').reference).toBe('eau');
    expect(capacityProfile('neon').reference).toBe('eau');
    expect(capacityProfile('neon').firstAdultLiters).toBeNull();
  });

  it('valeurs sourcées (PetMD, Reptiles Magazine), aucune approximation', () => {
    for (const need of Object.values(SEMI_TERRESTRIAL_NEEDS)) {
      expect(need.firstAdultLiters.status.kind).toBe('source');
      expect(need.extraLitersPerAdult.status.kind).toBe('source');
      expect(need.minLiters.status.kind).toBe('source');
    }
  });

  it('triton : 56,8 L pour le premier, puis 18,9 L par adulte (PetMD)', () => {
    const triton = capacityProfile('triton');
    expect(speciesNeedLiters(triton, 0)).toBe(0);
    expect(speciesNeedLiters(triton, 1)).toBeCloseTo(56.8, 9);
    expect(speciesNeedLiters(triton, 2)).toBeCloseTo(75.7, 9);
    expect(speciesNeedLiters(triton, 3)).toBeCloseTo(94.6, 9);
  });

  it('sonneur : le couple est l’unité de la source, 18,9 L par adulte dès le premier', () => {
    const sonneur = capacityProfile('grenouille');
    expect(speciesNeedLiters(sonneur, 1)).toBeCloseTo(18.9, 9);
    expect(speciesNeedLiters(sonneur, 2)).toBeCloseTo(37.8, 9);
    expect(speciesNeedLiters(sonneur, -3)).toBe(0);
    expect(speciesNeedLiters(sonneur, Number.NaN)).toBe(0);
  });

  it('besoin par référence : seules les espèces de la référence demandée comptent', () => {
    const population = [
      { species: 'grenouille' as const, count: 2 },
      { species: 'axolotl' as const, count: 1 },
    ];
    expect(populationNeedLiters(population, 'plafond', 'milieu')).toBeCloseTo(37.8, 9);
    expect(populationNeedLiters(population, 'plafond', 'eau')).toBeCloseTo(75, 9);
    expect(populationNeedLiters(population)).toBeCloseTo(112.8, 9);
  });

  it('occupation : somme des fractions de l’eau réelle et du milieu', () => {
    const tank = { liters: 50, milieuLiters: 100, population: [] };
    const population = [
      { species: 'triton' as const, count: 1 },
      { species: 'neon' as const, count: 10 },
    ];
    // Néons : 10 × 3 cm × 1,5 L = 45 L sur 50 L ; triton : 56,8 L sur 100 L.
    const neon = speciesNeedLiters(capacityProfile('neon'), 10);
    expect(populationLoad(tank, population)).toBeCloseTo(neon / 50 + 0.568, 9);
  });

  it('milieu absent : l’eau réelle sert de milieu ; milieu nul : occupation infinie', () => {
    const population = [{ species: 'triton' as const, count: 1 }];
    expect(referenceLiters({ liters: 80, population }, 'milieu')).toBe(80);
    expect(referenceLiters({ liters: 80, milieuLiters: Number.NaN, population }, 'milieu')).toBe(0);
    expect(populationLoad({ liters: 80, milieuLiters: 0, population }, population)).toBe(
      Number.POSITIVE_INFINITY,
    );
  });

  it('volume minimal comparé au milieu, pas à l’eau : 45,7 L d’eau dans 105 L suffisent', () => {
    const tank = { liters: 45.7, milieuLiters: 105, population: [] };
    expect(canAdd(tank, 'triton').ok).toBe(true);
    const small = canAdd({ liters: 30, milieuLiters: 37, population: [] }, 'grenouille');
    expect(small.ok).toBe(false);
    expect(small.limit).toBe('volume-minimal');
    expect(small.reason).toBe(
      '37 L de milieu : un sonneur oriental demande un milieu d’au moins 37,9 L (Reptiles Magazine)',
    );
  });

  it('refus de capacité : désaccord sur le sonneur affiché', () => {
    const full = {
      liters: 45.7,
      milieuLiters: 105,
      population: [{ species: 'grenouille' as const, count: 5 }],
    };
    const verdict = canAdd(full, 'grenouille');
    expect(verdict.ok).toBe(false);
    expect(verdict.limit).toBe('capacite');
    expect(verdict.reason).toMatch(/^105 L de milieu : un sonneur oriental adulte demande 18,9 L/);
    expect(verdict.reason).toContain('il faudrait 113,4 L');
    expect(verdict.disagreement).toContain('15 gallons pour cinq adultes');
  });

  it('état et ligne de capacité : part du milieu écrite à part', () => {
    const status = capacityStatus({
      liters: 45.7,
      milieuLiters: 105,
      population: [{ species: 'grenouille', count: 2 }],
    });
    expect(status.needLiters).toBe(0);
    expect(status.milieuNeedLiters).toBeCloseTo(37.8, 9);
    expect(status.over).toBe(false);
    const readout: TankCapacityReadout = { grossLiters: 105, liters: 45.7, status, decor: false };
    expect(capacityLine(readout)).toBe(
      '36 % de la capacité : 0 L demandés pour 45,7 L d’eau réelle (105 L bruts, décor déduit) ; et 37,8 L pour 105 L de milieu (berge comprise)',
    );
  });
});
