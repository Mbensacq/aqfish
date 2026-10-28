import { compatibility, mixWarnings, TEMPERAMENTS } from './compatibility';
import { SIM_DT } from './constants';
import { DIURNAL } from './day-rhythm';
import { environmentWater, livesIn, TROPICAL_TANK } from './environment';
import { addWarnings, sheetRows, speciesSheet } from './species-sheet';
import { SPECIES_LABELS, speciesCatalog } from './species-catalog';
import { legalStatus } from './species-legal';
import { wikiCare, wikiLists } from './species-wiki';
import {
  GOURAMI,
  KUHLI,
  RASBORA,
  SILHOUETTE_IDS,
  SPECIES,
  TETRA,
  validateSpecies,
  type SpeciesId,
} from './species';
import { WATER_TEMPERATURES } from './water';
import { freshPh, SPECIES_PH } from './water-ph';
import { advanceInPlace, createDefaultWorld, createWorld, type MutableWorld } from './world';

/**
 * Issue #238 : eau douce tropicale, lot 1 (rasbora arlequin, tétra citron, loche kuhli,
 * gourami nain). Graines fixes, temps simulé uniquement.
 */
const NEW: readonly SpeciesId[] = ['rasbora', 'tetra', 'kuhli', 'gourami'];
const NATIVE: readonly SpeciesId[] = ['neon', 'guppy', 'corydora'];
const water = environmentWater('tropical');
const waterHeight = water.maxY - water.minY;

/** Hauteurs (fraction de la colonne d'eau) des individus de `species`, sur `steps` pas. */
function heights(world: MutableWorld, species: SpeciesId, steps: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < steps; i++) {
    advanceInPlace(world, 1);
    for (const fish of world.entities) {
      if (fish.species === species) {
        out.push((fish.y - water.minY) / waterHeight);
      }
    }
  }
  return out;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

describe('eau douce, lot 1 (#238) : catalogue complet', () => {
  it.each(NEW)('%s : définition valide, silhouette propre, libellés', (id) => {
    const def = SPECIES[id];
    expect(validateSpecies(def)).toEqual([]);
    expect(SILHOUETTE_IDS).toContain(def.silhouette);
    expect(def.silhouette).toBe(id);
    expect(SPECIES_LABELS[id].singular.trim()).not.toBe('');
    expect(SPECIES_LABELS[id].plural.trim()).not.toBe('');
  });

  it('quatre silhouettes distinctes de celles des autres espèces', () => {
    const others = Object.values(SPECIES)
      .filter((def) => !NEW.includes(def.id))
      .map((def) => def.silhouette);
    for (const id of NEW) {
      expect(others).not.toContain(SPECIES[id].silhouette);
    }
  });

  it.each(NEW)('%s : fiche complète, chaque champ sourcé ou approximation', (id) => {
    const sheet = speciesSheet(id);
    expect(sheet.species).toBe(id);
    expect(sheet.adultSize.value).toBeGreaterThan(0);
    expect(sheet.minLiters.value).toBeGreaterThan(0);
    expect(sheet.minGroup.value).toBeGreaterThanOrEqual(1);
    for (const field of [
      sheet.adultSize,
      sheet.temperaturePreferred,
      sheet.temperatureTolerated,
      sheet.diet,
      sheet.minGroup,
      sheet.minLiters,
    ]) {
      if (field.status.kind === 'source') {
        expect(field.status.reference.trim()).not.toBe('');
      }
    }
    for (const row of sheetRows(id)) {
      expect(row.value.trim(), row.field).not.toBe('');
      expect(row.status.trim(), row.field).not.toBe('');
    }
    expect(legalStatus(id).reference.trim()).not.toBe('');
    expect(legalStatus(id).confirmed).toBe(false);
  });

  it.each(NEW)('%s : plages de température et de pH contenant l’eau du bac tropical', (id) => {
    const sheet = speciesSheet(id);
    const t = WATER_TEMPERATURES.tropical;
    const tp = sheet.temperaturePreferred.value;
    const tt = sheet.temperatureTolerated.value;
    expect(tt.min).toBeLessThanOrEqual(tp.min);
    expect(tp.max).toBeLessThanOrEqual(tt.max);
    expect(tp.min).toBeLessThanOrEqual(t);
    expect(t).toBeLessThanOrEqual(tp.max);
    const ph = SPECIES_PH[id];
    expect(ph.tolerated.min).toBeLessThanOrEqual(ph.ideal.min);
    expect(ph.ideal.max).toBeLessThanOrEqual(ph.tolerated.max);
    expect(ph.tolerated.min).toBeLessThanOrEqual(freshPh('tropical'));
    expect(freshPh('tropical')).toBeLessThanOrEqual(ph.tolerated.max);
  });

  it('comportements : deux bancs, une loche de fond nocturne, un gourami de surface', () => {
    expect(RASBORA.schooling).not.toBeNull();
    expect(TETRA.schooling).not.toBeNull();
    expect(KUHLI.schooling).toBeNull();
    expect(GOURAMI.schooling).toBeNull();
    expect(KUHLI.depth?.maxHeightRatio).toBeLessThanOrEqual(0.1);
    expect(KUHLI.feeding.maxHeightRatio).toBeLessThanOrEqual(0.1);
    expect(GOURAMI.depth?.minHeightRatio).toBeGreaterThanOrEqual(0.5);
    expect(DIURNAL.kuhli).toBe(false);
    expect(NEW.filter((id) => id !== 'kuhli').every((id) => DIURNAL[id])).toBe(true);
  });

  it('loche kuhli au ras du sable, gourami dans la moitié haute (graine 42, 60 s)', () => {
    const world = createWorld(
      42,
      [
        { species: 'kuhli', count: 6 },
        { species: 'gourami', count: 2 },
      ],
      [],
      [],
      'tropical',
    ) as MutableWorld;
    advanceInPlace(world, Math.round(10 / SIM_DT));
    const steps = Math.round(60 / SIM_DT);
    const snapshot = structuredClone(world) as MutableWorld;
    expect(median(heights(world, 'kuhli', steps))).toBeLessThan(0.12);
    expect(median(heights(snapshot, 'gourami', steps))).toBeGreaterThan(0.5);
  });
});

describe('eau douce, lot 1 (#238) : bac tropical et compatibilité', () => {
  it('proposées au bac tropical, absentes de sa population de départ', () => {
    for (const id of NEW) {
      expect(livesIn('tropical', id)).toBe(true);
      expect(livesIn('recif', id)).toBe(false);
      expect(livesIn('bassin', id)).toBe(false);
    }
    expect(TROPICAL_TANK.population.map((p) => p.species)).toEqual(NATIVE);
    const catalog = speciesCatalog('tropical');
    expect(catalog.filter((e) => NEW.includes(e.species)).map((e) => e.defaultCount)).toEqual([
      0, 0, 0, 0,
    ]);
    expect(
      wikiLists('tropical', { neon: 12, guppy: 6, corydora: 6 }).addable.map((e) => e.species),
    ).toEqual(NEW);
  });

  it('monde par défaut (graine 42) inchangé : seules les trois espèces d’avant', () => {
    const world = createDefaultWorld(42);
    expect(new Set(world.entities.map((e) => e.species))).toEqual(new Set(NATIVE));
    expect(world.entities.length).toBe(TROPICAL_TANK.population.reduce((n, p) => n + p.count, 0));
  });

  it('paires incompatibles nouvelles : koï prédateur, gourami et clown territoriaux', () => {
    for (const id of NEW) {
      expect(compatibility('koi', id), id).toBe('predateur');
      expect(compatibility(id, 'koi'), id).toBe('predateur');
    }
    expect(TEMPERAMENTS.gourami).toBe('territorial');
    expect(compatibility('gourami', 'clown')).toBe('territorial');
    expect(compatibility('clown', 'gourami')).toBe('territorial');
    expect(speciesSheet('gourami').avoid.value).toEqual(
      expect.arrayContaining(['koi', 'axolotl', 'clown']),
    );
    expect(mixWarnings(['koi', 'rasbora'], { koi: 1, rasbora: 8 }).map((w) => w.reason)).toEqual([
      'predateur',
    ]);
  });

  it('compatibles entre elles et avec les espèces du bac tropical', () => {
    for (const a of [...NEW, ...NATIVE]) {
      for (const b of [...NEW, ...NATIVE]) {
        expect(compatibility(a, b), `${a}/${b}`).toBe('compatible');
      }
    }
    const order = TROPICAL_TANK.species;
    const counts = { neon: 12, guppy: 6, corydora: 6, rasbora: 8, tetra: 8, kuhli: 6, gourami: 2 };
    expect(mixWarnings(order, counts)).toEqual([]);
    expect(wikiCare('gourami').cohabitation.avoid.map((e) => e.species)).toEqual([
      'koi',
      'axolotl',
      'clown',
    ]);
  });

  it('avertissements d’ajout : groupe trop petit (féminin pour la loche), volume', () => {
    const order = TROPICAL_TANK.species;
    expect(addWarnings('kuhli', 2, 100, { kuhli: 2 }, order)).toEqual([
      { kind: 'groupe', species: 'kuhli', count: 2, minGroup: 5 },
    ]);
    expect(addWarnings('rasbora', 8, 40, { rasbora: 8 }, order)).toEqual([
      { kind: 'volume', species: 'rasbora', liters: 40, minLiters: 54 },
    ]);
    expect(addWarnings('gourami', 2, 100, { gourami: 2, neon: 12 }, order)).toEqual([]);
  });
});
