import { describe, expect, it } from 'vitest';
import { setPopulation } from './population';
import { parseWorld, serializeWorld } from './save';
import type { FieldStatus, SheetField, ValueRange } from './sheet-field';
import type { SpeciesId } from './species';
import { SPECIES_ECOLOGY, type SpeciesEcology } from './species-ecology';
import { speciesSheet } from './species-sheet';
import { createDefaultWorld } from './world';

/** Tranche mer et eau froide de #785 (c281). */
const MER: readonly SpeciesId[] = ['clown', 'chirurgien', 'chromis', 'gobie', 'gramma', 'blennie'];
const EAU_FROIDE: readonly SpeciesId[] = ['koi', 'rouge'];
const TRANCHE: readonly SpeciesId[] = [...MER, ...EAU_FROIDE];

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

function expectContains(outer: ValueRange, inner: ValueRange, label: string): void {
  expect(outer.min, label).toBeLessThanOrEqual(inner.min);
  expect(outer.max, label).toBeGreaterThanOrEqual(inner.max);
}

/** Volume demandé pour `adults` adultes : celui de la fiche, puis le volume par adulte en plus. */
function litersFor(id: SpeciesId, adults: number): number {
  const extra = ecologyOf(id).extraLitersPerAdult.value;
  if (extra === null) {
    throw new Error(`${id} : pas de volume par adulte supplémentaire`);
  }
  return speciesSheet(id).minLiters.value + (adults - 1) * extra;
}

describe('données d’écologie, mer et eau froide (#785)', () => {
  it('les 8 espèces ont toutes leurs données, chacune sourcée ou en approximation', () => {
    expect(new Set(TRANCHE).size).toBe(8);
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

  it('la plage tolérée contient la préférée ; KH en mer, GH en eau froide', () => {
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
      expect(tolerated.kind, `${id} nature attendue`).toBe(MER.includes(id) ? 'kh' : 'gh');
      expectContains(tolerated, sheet.hardness.value, `${id} dureté`);
      expect(tolerated.min, `${id} dureté`).toBeGreaterThanOrEqual(0);
      expect(tolerated.max, `${id} dureté`).toBeLessThanOrEqual(tolerated.kind === 'kh' ? 20 : 40);
    }
  });

  it('classes de densité : récif en mer, eau froide pour la koï et le poisson rouge', () => {
    for (const id of MER) {
      expect(ecologyOf(id).densityClass.value, id).toBe('marine');
    }
    for (const id of EAU_FROIDE) {
      expect(ecologyOf(id).densityClass.value, id).toBe('coldwater');
    }
    expect(ecologyOf('rouge').densityClass.status.kind).toBe('source');
  });

  it('poisson rouge : 100 L pour le premier adulte, puis 50 L par adulte (OATA)', () => {
    expect(litersFor('rouge', 1)).toBe(100);
    expect(litersFor('rouge', 2)).toBe(150);
    expect(litersFor('rouge', 4)).toBe(250);
    const status = ecologyOf('rouge').extraLitersPerAdult.status;
    expect(status.kind).toBe('source');
    expect(speciesSheet('rouge').minLiters.status.kind).toBe('source');
  });

  it('poisson rouge : le désaccord de la RSPCA (60 L chacun) est écrit dans la fiche', () => {
    const status = ecologyOf('rouge').extraLitersPerAdult.status;
    if (status.kind !== 'source') {
      throw new Error('volume par adulte du poisson rouge non sourcé');
    }
    expect(status.reference).toContain('ornamentalfish.org');
    expect(status.reference).toContain('désaccord');
    expect(status.reference).toContain('RSPCA');
    expect(status.reference).toContain('60 L');
  });

  it('koï : volume du bassin et volume par adulte restent des approximations de jeu', () => {
    expect(speciesSheet('koi').minLiters.status.kind).toBe('approximation');
    expect(ecologyOf('koi').extraLitersPerAdult.value).toBeNull();
    expect(ecologyOf('koi').extraLitersPerAdult.status.kind).toBe('approximation');
  });

  it('le poisson rouge mange les crevettes cerises adultes, qui le comptent parmi leurs prédateurs', () => {
    expect(ecologyOf('rouge').prey.value).toEqual([{ species: 'cerise', stage: 'adult' }]);
    expect(ecologyOf('cerise').predators.value).toContain('rouge');
    for (const id of TRANCHE) {
      for (const prey of ecologyOf(id).prey.value) {
        expect(prey.species, `${id} mange`).not.toBe(id);
        expect(ecologyOf(prey.species).predators.value, `${prey.species}`).toContain(id);
      }
    }
  });

  it('cas sourcés des fiches : gramma territorial, blennie mangeuse d’algues', () => {
    expect(ecologyOf('gramma').territorial).toMatchObject({
      value: true,
      status: { kind: 'source' },
    });
    expect(ecologyOf('blennie').foods.value).toContain('algae');
    expect(ecologyOf('blennie').foods.status.kind).toBe('source');
    for (const id of TRANCHE) {
      expect(ecologyOf(id).finNipper.value, id).toBe(false);
    }
  });

  it('données figées', () => {
    expect(Object.isFrozen(ecologyOf('clown'))).toBe(true);
    expect(Object.isFrozen(ecologyOf('rouge').prey.value)).toBe(true);
    expect(Object.isFrozen(ecologyOf('rouge').prey.value[0])).toBe(true);
  });

  it('les sauvegardes se relisent à l’identique : aucune donnée d’écologie n’y est écrite', () => {
    const cases = [
      ['bassin', ['koi', 'rouge']],
      ['recif', ['clown', 'gramma']],
    ] as const;
    for (const [environment, species] of cases) {
      let world = createDefaultWorld(11, environment);
      for (const id of species) {
        world = setPopulation(world, id, 2);
      }
      const text = serializeWorld(world);
      expect(text, environment).not.toContain('ecology');
      const back = parseWorld(text);
      expect(back.ok, environment).toBe(true);
      if (back.ok) {
        expect(serializeWorld(back.world), environment).toBe(text);
      }
    }
  }, 30_000);
});
