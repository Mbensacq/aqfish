import { describe, expect, it } from 'vitest';
import { setPopulation } from './population';
import { parseWorld, serializeWorld } from './save';
import type { FieldStatus, SheetField, ValueRange } from './sheet-field';
import type { SpeciesId } from './species';
import { DENSITY_LITERS_PER_CM, SPECIES_ECOLOGY, type SpeciesEcology } from './species-ecology';
import { speciesSheet } from './species-sheet';
import { createDefaultWorld } from './world';

/** Tranche d'eau douce tropicale de #784 (c280). */
const TRANCHE: readonly SpeciesId[] = [
  'neon',
  'guppy',
  'corydora',
  'rasbora',
  'tetra',
  'kuhli',
  'gourami',
  'platy',
  'danio',
  'ancistrus',
  'otocinclus',
  'braise',
  'molly',
  'miel',
  'xipho',
  'cerise',
  'crevette',
  'neritine',
];

const ECOLOGY_FIELDS = [
  'densityClass',
  'extraLitersPerAdult',
  'hardnessTolerated',
  'foods',
  'prey',
  'predators',
  'territorial',
  'finNipper',
  'fastSwimmer',
] as const satisfies readonly (keyof SpeciesEcology)[];

function ecologyOf(id: SpeciesId): SpeciesEcology {
  const ecology = speciesSheet(id).ecology;
  if (!ecology) {
    throw new Error(`${id} : données d’écologie absentes`);
  }
  return ecology;
}

function expectValidStatus(status: FieldStatus, label: string): void {
  expect(['source', 'approximation'], label).toContain(status.kind);
  if (status.kind === 'source') {
    expect(status.reference.trim(), label).not.toBe('');
  }
}

function expectRangeIn(value: ValueRange, min: number, max: number, label: string): void {
  expect(value.min, label).toBeGreaterThanOrEqual(min);
  expect(value.max, label).toBeLessThanOrEqual(max);
  expect(value.min, label).toBeLessThanOrEqual(value.max);
}

function expectContains(outer: ValueRange, inner: ValueRange, label: string): void {
  expect(outer.min, label).toBeLessThanOrEqual(inner.min);
  expect(outer.max, label).toBeGreaterThanOrEqual(inner.max);
}

describe('données d’écologie, eau douce tropicale (#784)', () => {
  it('les 18 espèces de la tranche ont toutes leurs données, chacune avec un statut valable', () => {
    expect(new Set(TRANCHE).size).toBe(18);
    for (const id of TRANCHE) {
      const ecology = ecologyOf(id);
      expect(ecology).toBe(SPECIES_ECOLOGY[id]);
      for (const field of ECOLOGY_FIELDS) {
        const value = ecology[field] as SheetField<unknown>;
        expect(value, `${id}.${field}`).toBeDefined();
        expect(value.value, `${id}.${field}`).not.toBeUndefined();
        expectValidStatus(value.status, `${id}.${field}`);
      }
    }
  });

  it('aucune valeur hors plage physique, données réutilisées de la fiche comprises', () => {
    for (const id of TRANCHE) {
      const sheet = speciesSheet(id);
      const ecology = ecologyOf(id);
      expect(sheet.adultSize.value, `${id} taille`).toBeGreaterThan(0.5);
      expect(sheet.adultSize.value, `${id} taille`).toBeLessThanOrEqual(100);
      expect(sheet.minLiters.value, `${id} volume`).toBeGreaterThan(0);
      expect(sheet.minLiters.value, `${id} volume`).toBeLessThanOrEqual(10_000);
      expect(Number.isInteger(sheet.minGroup.value), `${id} groupe`).toBe(true);
      expect(sheet.minGroup.value, `${id} groupe`).toBeGreaterThanOrEqual(1);
      expect(sheet.minGroup.value, `${id} groupe`).toBeLessThanOrEqual(50);
      expectRangeIn(sheet.temperatureTolerated.value, 0, 40, `${id} température`);
      expectRangeIn(sheet.phTolerated.value, 3, 10, `${id} pH`);
      const hardness = ecology.hardnessTolerated.value;
      expectRangeIn(hardness, 0, hardness.kind === 'gh' ? 40 : 20, `${id} dureté`);
      const extra = ecology.extraLitersPerAdult.value;
      if (extra !== null) {
        expect(extra, `${id} volume par adulte`).toBeGreaterThan(0);
        expect(extra, `${id} volume par adulte`).toBeLessThanOrEqual(1_000);
      }
    }
  });

  it('la plage tolérée contient la préférée : température, pH et dureté', () => {
    for (const id of TRANCHE) {
      const sheet = speciesSheet(id);
      const tolerated = ecologyOf(id).hardnessTolerated.value;
      expectContains(
        sheet.temperatureTolerated.value,
        sheet.temperaturePreferred.value,
        `${id} température`,
      );
      expectContains(sheet.phTolerated.value, sheet.phPreferred.value, `${id} pH`);
      expect(tolerated.kind, `${id} nature de la dureté`).toBe(sheet.hardness.value.kind);
      expectContains(tolerated, sheet.hardness.value, `${id} dureté`);
    }
  });

  it('proies et prédateurs se répondent, sans espèce qui se mange elle-même', () => {
    for (const id of TRANCHE) {
      const ecology = ecologyOf(id);
      for (const prey of ecology.prey.value) {
        expect(prey.species, `${id} mange`).not.toBe(id);
        const preyEcology = SPECIES_ECOLOGY[prey.species];
        if (preyEcology) {
          expect(preyEcology.predators.value, `${prey.species} mangée par ${id}`).toContain(id);
        }
      }
      for (const predator of ecology.predators.value) {
        expect(predator, `${id} mangée par`).not.toBe(id);
        const predatorEcology = SPECIES_ECOLOGY[predator];
        if (predatorEcology) {
          const eaten = predatorEcology.prey.value.map((prey) => prey.species);
          expect(eaten, `${predator} mange ${id}`).toContain(id);
        }
      }
    }
  });

  it('cas connus des sources : crevettes mangées, otocinclus sûr, néritine à 40 L par adulte', () => {
    expect(ecologyOf('cerise').predators.value).toEqual(
      expect.arrayContaining(['guppy', 'corydora', 'rasbora', 'kuhli', 'danio', 'rouge']),
    );
    expect(ecologyOf('otocinclus').prey.value).toEqual([]);
    expect(ecologyOf('otocinclus').foods.value).toContain('algae');
    expect(ecologyOf('neritine').extraLitersPerAdult.value).toBe(40);
    expect(ecologyOf('neritine').foods.value).toEqual(['algae', 'biofilm', 'pellets']);
    expect(ecologyOf('danio').fastSwimmer.value).toBe(true);
    expect(ecologyOf('ancistrus').territorial.value).toBe(true);
    expect(ecologyOf('neon').densityClass.value).toBe('tropical');
    expect(ecologyOf('neon').extraLitersPerAdult.value).toBeNull();
  });

  it('classes de densité : plafond positif sous le conseillé ; tropical et eau froide sourcés', () => {
    for (const [densityClass, field] of Object.entries(DENSITY_LITERS_PER_CM)) {
      expectValidStatus(field.status, densityClass);
      expect(field.value.min, densityClass).toBeGreaterThan(0);
      expect(field.value.min, densityClass).toBeLessThanOrEqual(field.value.max);
    }
    expect(DENSITY_LITERS_PER_CM.tropical.value).toEqual({ min: 1.5, max: 2 });
    expect(DENSITY_LITERS_PER_CM.tropical.status.kind).toBe('source');
    expect(DENSITY_LITERS_PER_CM.coldwater.value.min).toBe(4);
  });

  it('données figées : ni la fiche ni les listes ne se modifient', () => {
    const ecology = ecologyOf('cerise');
    expect(Object.isFrozen(ecology.foods.value)).toBe(true);
    expect(Object.isFrozen(ecology.predators.value)).toBe(true);
    expect(Object.isFrozen(ecologyOf('guppy').prey.value[0])).toBe(true);
  });

  it('les espèces hors tranches n’ont pas encore de données (tranche c283)', () => {
    expect(speciesSheet('axolotl').ecology).toBeUndefined();
  });

  it('les sauvegardes se relisent à l’identique : aucune donnée d’écologie n’y est écrite', () => {
    let world = createDefaultWorld(7);
    for (const id of ['cerise', 'neritine', 'otocinclus'] as const) {
      world = setPopulation(world, id, 2);
    }
    const text = serializeWorld(world);
    expect(text).not.toContain('ecology');
    const back = parseWorld(text);
    expect(back.ok).toBe(true);
    if (back.ok) {
      expect(serializeWorld(back.world)).toBe(text);
    }
  }, 30_000);
});
