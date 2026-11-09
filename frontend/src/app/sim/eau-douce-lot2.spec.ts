import { compatibility, mixWarnings, TEMPERAMENTS } from './compatibility';
import { SIM_DT } from './constants';
import { DIURNAL } from './day-rhythm';
import { catchesIch } from './disease';
import { environmentWater, livesIn, TROPICAL_TANK } from './environment';
import { addWarnings, sheetRows, speciesSheet } from './species-sheet';
import { SPECIES_LABELS, speciesCatalog } from './species-catalog';
import { legalStatus } from './species-legal';
import { wikiCare, wikiLists } from './species-wiki';
import {
  ANCISTRUS,
  DANIO,
  OTOCINCLUS,
  PLATY,
  SILHOUETTE_IDS,
  SPECIES,
  validateSpecies,
  type SpeciesId,
} from './species';
import { WATER_TEMPERATURES } from './water';
import { freshPh, SPECIES_PH } from './water-ph';
import { advanceInPlace, createDefaultWorld, createWorld, type MutableWorld } from './world';

/**
 * Issue #362 : eau douce tropicale, lot 2 (platy, danio zébré, ancistrus, otocinclus).
 * Graines fixes, temps simulé uniquement.
 */
const NEW: readonly SpeciesId[] = ['platy', 'danio', 'ancistrus', 'otocinclus'];
const LOT1: readonly SpeciesId[] = ['rasbora', 'tetra', 'kuhli', 'gourami'];
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

describe('eau douce, lot 2 (#362) : catalogue complet', () => {
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
        expect(field.status.reference).toMatch(/^https:\/\/www\.seriouslyfish\.com\/species\/\S/);
      }
    }
    for (const row of sheetRows(id)) {
      expect(row.value.trim(), row.field).not.toBe('');
      expect(row.status.trim(), row.field).not.toBe('');
    }
    for (const note of sheet.notes) {
      expect(note.text.trim()).not.toBe('');
    }
  });

  it.each(NEW)('%s : statut légal à vérifier, jamais présenté comme confirmé', (id) => {
    const legal = legalStatus(id);
    expect(legal.regime).toBe('a-verifier');
    expect(legal.confidence).toBe('non-verifie');
    expect(legal.confirmed).toBe(false);
    expect(legal.reference.trim()).not.toBe('');
    expect(speciesSheet(id).legal.value).toBe(legal);
  });

  it('otocinclus : origine sauvage signalée au statut légal et en tête de fiche', () => {
    expect(legalStatus('otocinclus').note).toContain('prélevés dans la nature');
    expect(
      speciesSheet('otocinclus')
        .notes.map((n) => n.text)
        .join(' '),
    ).toContain('bac mûr');
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

  it('régimes et rythmes : otocinclus herbivore, ancistrus nocturne, autres diurnes', () => {
    expect(speciesSheet('otocinclus').diet.value).toBe('herbivore');
    expect(DIURNAL.ancistrus).toBe(false);
    expect(NEW.filter((id) => id !== 'ancistrus').every((id) => DIURNAL[id])).toBe(true);
  });

  it('comportements : danio et otocinclus en banc, platy et ancistrus sans banc, deux de fond', () => {
    expect(DANIO.schooling).not.toBeNull();
    expect(OTOCINCLUS.schooling).not.toBeNull();
    expect(PLATY.schooling).toBeNull();
    expect(ANCISTRUS.schooling).toBeNull();
    expect(ANCISTRUS.depth?.maxHeightRatio).toBeLessThanOrEqual(0.1);
    expect(ANCISTRUS.feeding.maxHeightRatio).toBeLessThanOrEqual(0.1);
    expect(OTOCINCLUS.depth?.maxHeightRatio).toBeLessThanOrEqual(0.35);
    expect(DANIO.depth?.minHeightRatio).toBeGreaterThanOrEqual(0.5);
    // Le danio est le plus rapide du bac tropical.
    for (const id of TROPICAL_TANK.species.filter((s) => s !== 'danio')) {
      expect(DANIO.cruiseSpeed, id).toBeGreaterThan(SPECIES[id].cruiseSpeed);
    }
  });

  it('ancistrus au ras du sable, otocinclus bas, danio dans la moitié haute (graine 42, 60 s)', () => {
    const world = createWorld(
      42,
      [
        { species: 'ancistrus', count: 2 },
        { species: 'otocinclus', count: 6 },
        { species: 'danio', count: 8 },
      ],
      [],
      [],
      'tropical',
    ) as MutableWorld;
    advanceInPlace(world, Math.round(10 / SIM_DT));
    const steps = Math.round(60 / SIM_DT);
    const first = structuredClone(world) as MutableWorld;
    const second = structuredClone(world) as MutableWorld;
    // Même seuil que la loche kuhli (#238) : centre du corps à moins de 12 % de la colonne.
    expect(median(heights(world, 'ancistrus', steps))).toBeLessThan(0.12);
    expect(median(heights(first, 'otocinclus', steps))).toBeLessThan(0.35);
    expect(median(heights(second, 'danio', steps))).toBeGreaterThan(0.5);
  }, 30_000);

  it('même graine, même trajectoire ; autre graine, autre trajectoire', () => {
    const make = (seed: number) =>
      createWorld(seed, [{ species: 'platy', count: 4 }], [], [], 'tropical') as MutableWorld;
    const a = make(7);
    const b = make(7);
    const c = make(8);
    for (const w of [a, b, c]) {
      advanceInPlace(w, Math.round(20 / SIM_DT));
    }
    expect(a.entities).toEqual(b.entities);
    expect(a.entities.map((e) => e.x)).not.toEqual(c.entities.map((e) => e.x));
  });

  it('poissons d’eau douce : sensibles aux points blancs comme les autres', () => {
    for (const id of NEW) {
      expect(catchesIch(id, 'tropical'), id).toBe(true);
    }
  });
});

describe('eau douce, lot 2 (#362) : bac tropical et compatibilité', () => {
  it('proposées au bac tropical après le lot 1, absentes de sa population de départ', () => {
    for (const id of NEW) {
      expect(livesIn('tropical', id)).toBe(true);
      expect(livesIn('recif', id)).toBe(false);
      expect(livesIn('bassin', id)).toBe(false);
    }
    expect(TROPICAL_TANK.species.slice(0, 11)).toEqual([...NATIVE, ...LOT1, ...NEW]);
    expect(TROPICAL_TANK.population.map((p) => p.species)).toEqual(NATIVE);
    const catalog = speciesCatalog('tropical');
    expect(catalog.filter((e) => NEW.includes(e.species)).map((e) => e.defaultCount)).toEqual([
      0, 0, 0, 0,
    ]);
    expect(
      wikiLists('tropical', { neon: 12, guppy: 6, corydora: 6 })
        .addable.map((e) => e.species)
        .slice(-10, -6),
    ).toEqual(NEW);
  });

  it('monde par défaut (graine 42) inchangé : seules les trois espèces d’avant', () => {
    const world = createDefaultWorld(42);
    expect(new Set(world.entities.map((e) => e.species))).toEqual(new Set(NATIVE));
    expect(world.entities.length).toBe(TROPICAL_TANK.population.reduce((n, p) => n + p.count, 0));
  });

  it('paires incompatibles nouvelles : koï prédateur de chacune', () => {
    for (const id of NEW) {
      expect(TEMPERAMENTS[id], id).toBe('paisible');
      expect(compatibility('koi', id), id).toBe('predateur');
      expect(compatibility(id, 'koi'), id).toBe('predateur');
    }
    expect(mixWarnings(['koi', 'otocinclus'], { koi: 1, otocinclus: 6 })).toEqual([
      { first: 'koi', second: 'otocinclus', reason: 'predateur' },
    ]);
    // Paisible : l'ancistrus ne se dispute pas avec le gourami nain territorial.
    expect(compatibility('ancistrus', 'gourami')).toBe('compatible');
  });

  it('compatibles entre elles et avec toutes les espèces du bac tropical', () => {
    const all = TROPICAL_TANK.species;
    for (const a of NEW) {
      for (const b of all) {
        expect(compatibility(a, b), `${a}/${b}`).toBe('compatible');
      }
    }
    const counts = Object.fromEntries(all.map((id) => [id, 4]));
    expect(
      mixWarnings(all, counts).filter((w) => NEW.includes(w.first) || NEW.includes(w.second)),
    ).toEqual([]);
    expect(wikiCare('platy').cohabitation.avoid.map((e) => e.species)).toEqual(['koi', 'axolotl']);
  });

  it('avertissements d’ajout : groupe trop petit, volume du danio, ancistrus seul accepté', () => {
    const order = TROPICAL_TANK.species;
    expect(addWarnings('otocinclus', 2, 100, { otocinclus: 2 }, order)).toEqual([
      { kind: 'groupe', species: 'otocinclus', count: 2, minGroup: 6 },
    ]);
    expect(addWarnings('danio', 8, 60, { danio: 8 }, order)).toEqual([
      { kind: 'volume', species: 'danio', liters: 60, minLiters: 81 },
    ]);
    expect(addWarnings('ancistrus', 1, 100, { ancistrus: 1, neon: 12 }, order)).toEqual([]);
  });
});
