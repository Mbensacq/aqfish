import { compatibility, mixWarnings, TEMPERAMENTS } from './compatibility';
import { SIM_DT } from './constants';
import { DIURNAL } from './day-rhythm';
import { catchesIch } from './disease';
import { environmentWater, livesIn, TROPICAL_TANK } from './environment';
import { TAP_REACTIONS } from './glass-tap';
import { immersivePopulation } from './immersive-tank';
import { addWarnings, sheetRows, speciesSheet } from './species-sheet';
import { SPECIES_LABELS, speciesCatalog } from './species-catalog';
import { legalStatus } from './species-legal';
import { wikiCare, wikiLists } from './species-wiki';
import {
  BRAISE,
  MIEL,
  MOLLY,
  SILHOUETTE_IDS,
  SPECIES,
  validateSpecies,
  type SpeciesId,
} from './species';
import { WATER_TEMPERATURES } from './water';
import { freshPh, SPECIES_PH } from './water-ph';
import { advanceInPlace, createDefaultWorld, createWorld, type MutableWorld } from './world';

/**
 * Issue #391 : eau douce tropicale, lot 3 (tétra braise, molly, gourami miel).
 * Graines fixes, temps simulé uniquement.
 */
const NEW: readonly SpeciesId[] = ['braise', 'molly', 'miel'];
const LOT1: readonly SpeciesId[] = ['rasbora', 'tetra', 'kuhli', 'gourami'];
const LOT2: readonly SpeciesId[] = ['platy', 'danio', 'ancistrus', 'otocinclus'];
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

describe('eau douce, lot 3 (#391) : catalogue complet', () => {
  it.each(NEW)('%s : définition valide, silhouette propre, libellés', (id) => {
    const def = SPECIES[id];
    expect(validateSpecies(def)).toEqual([]);
    expect(SILHOUETTE_IDS).toContain(def.silhouette);
    expect(def.silhouette).toBe(id);
    expect(SPECIES_LABELS[id].singular.trim()).not.toBe('');
    expect(SPECIES_LABELS[id].plural).not.toBe(SPECIES_LABELS[id].singular);
  });

  it('trois silhouettes distinctes de celles des autres espèces', () => {
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
      expect(['source', 'approximation']).toContain(field.status.kind);
      if (field.status.kind === 'source') {
        expect(field.status.reference).toMatch(/^https:\/\/www\.seriouslyfish\.com\/species\/\S/);
      }
    }
    // Taille, températures tolérées et volume : toujours sourcés pour ce lot.
    expect(sheet.adultSize.status.kind).toBe('source');
    expect(sheet.temperatureTolerated.status.kind).toBe('source');
    expect(sheet.minLiters.status.kind).toBe('source');
    for (const row of sheetRows(id)) {
      expect(row.value.trim(), row.field).not.toBe('');
      expect(row.status.trim(), row.field).not.toBe('');
    }
    expect(sheet.notes.length).toBeGreaterThan(0);
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

  it('molly et gourami miel : origine d’élevage au statut légal ; mises en garde du molly', () => {
    expect(legalStatus('molly').note).toContain('élevages');
    expect(legalStatus('miel').note).toContain('élevages');
    const notes = speciesSheet('molly')
      .notes.map((n) => n.text)
      .join(' ');
    expect(notes).toContain('Eau dure');
    expect(notes).toContain('latipinna');
  });

  it.each(NEW)('%s : plages de température et de pH contenant l’eau du bac tropical', (id) => {
    const sheet = speciesSheet(id);
    const t = WATER_TEMPERATURES.tropical;
    expect(t).toBe(24);
    const tp = sheet.temperaturePreferred.value;
    const tt = sheet.temperatureTolerated.value;
    expect(tt.min).toBeLessThanOrEqual(tp.min);
    expect(tp.max).toBeLessThanOrEqual(tt.max);
    expect(tp.min).toBeLessThanOrEqual(t);
    expect(t).toBeLessThanOrEqual(tp.max);
    expect(tt.min).toBeLessThanOrEqual(t);
    expect(t).toBeLessThanOrEqual(tt.max);
    const ph = SPECIES_PH[id];
    expect(ph.tolerated.min).toBeLessThanOrEqual(ph.ideal.min);
    expect(ph.ideal.max).toBeLessThanOrEqual(ph.tolerated.max);
    expect(ph.tolerated.min).toBeLessThanOrEqual(freshPh('tropical'));
    expect(freshPh('tropical')).toBeLessThanOrEqual(ph.tolerated.max);
  });

  it('régimes, rythmes et tapotement : trois espèces diurnes, le molly seul curieux', () => {
    expect(speciesSheet('molly').diet.value).toBe('omnivore');
    expect(speciesSheet('braise').diet.value).toBe('carnivore');
    expect(NEW.every((id) => DIURNAL[id])).toBe(true);
    expect(TAP_REACTIONS.braise).toBe('fuite');
    expect(TAP_REACTIONS.miel).toBe('fuite');
    expect(TAP_REACTIONS.molly).toBe('curiosite');
  });

  it('comportements : braise en banc, plus petit en vrai ; molly le plus long ; miel le plus haut', () => {
    expect(BRAISE.schooling).not.toBeNull();
    expect(MOLLY.schooling).toBeNull();
    expect(MIEL.schooling).toBeNull();
    const tropical = TROPICAL_TANK.species;
    // Le plus petit en vrai (2 cm SL) ; modèle juste au-dessus du rasbora pour ne pas changer
    // la population du mode immersif (ses trois plus petites espèces nageuses).
    expect(speciesSheet('braise').adultSize.value).toBe(
      Math.min(...tropical.map((id) => speciesSheet(id).adultSize.value)),
    );
    expect(BRAISE.bodyLength).toBeGreaterThan(SPECIES.rasbora.bodyLength);
    expect(BRAISE.bodyLength).toBeLessThan(SPECIES.neon.bodyLength);
    expect(immersivePopulation('tropical').map((p) => p.species)).toEqual([
      'otocinclus',
      'corydora',
      'rasbora',
    ]);
    for (const id of tropical.filter((s) => s !== 'molly' && s !== 'ancistrus')) {
      expect(MOLLY.bodyLength, id).toBeGreaterThanOrEqual(SPECIES[id].bodyLength);
    }
    // Zone nouvelle : le gourami miel reste plus haut que toute autre espèce du bac.
    for (const id of tropical.filter((s) => s !== 'miel')) {
      expect(MIEL.depth?.minHeightRatio ?? 0, id).toBeGreaterThan(
        SPECIES[id].depth?.minHeightRatio ?? 0,
      );
    }
    expect(MIEL.depth?.ascentRate).toBeGreaterThan(0);
  });

  it('gourami miel sous la surface, braise et molly dans le haut (graine 42, 60 s)', () => {
    const world = createWorld(
      42,
      [
        { species: 'braise', count: 10 },
        { species: 'molly', count: 3 },
        { species: 'miel', count: 2 },
      ],
      [],
      [],
      'tropical',
    ) as MutableWorld;
    advanceInPlace(world, Math.round(10 / SIM_DT));
    const steps = Math.round(60 / SIM_DT);
    const first = structuredClone(world) as MutableWorld;
    const second = structuredClone(world) as MutableWorld;
    const miel = median(heights(world, 'miel', steps));
    expect(miel).toBeGreaterThan(0.65);
    const braise = median(heights(first, 'braise', steps));
    expect(braise).toBeGreaterThan(0.35);
    expect(braise).toBeLessThan(miel);
    expect(median(heights(second, 'molly', steps))).toBeGreaterThan(0.4);
  });

  it('même graine, même trajectoire ; autre graine, autre trajectoire', () => {
    const make = (seed: number) =>
      createWorld(seed, [{ species: 'braise', count: 10 }], [], [], 'tropical') as MutableWorld;
    const a = make(7);
    const b = make(7);
    const c = make(8);
    for (const w of [a, b, c]) {
      advanceInPlace(w, Math.round(20 / SIM_DT));
    }
    expect(a.entities).toEqual(b.entities);
    expect(a.entities.map((e) => e.x)).not.toEqual(c.entities.map((e) => e.x));
  });

  it('effectifs extrêmes : zéro individu ou le maximum de chaque espèce, sans sortir de l’eau', () => {
    const empty = createWorld(42, [{ species: 'molly', count: 0 }], [], [], 'tropical');
    expect(empty.entities.length).toBe(0);
    const full = createWorld(
      3,
      NEW.map((id) => ({ species: id, count: SPECIES[id].maxPopulation })),
      [],
      [],
      'tropical',
    ) as MutableWorld;
    expect(full.entities.length).toBe(
      BRAISE.maxPopulation + MOLLY.maxPopulation + MIEL.maxPopulation,
    );
    advanceInPlace(full, Math.round(30 / SIM_DT));
    for (const fish of full.entities) {
      expect(Number.isFinite(fish.x) && Number.isFinite(fish.y) && Number.isFinite(fish.z)).toBe(
        true,
      );
      expect(fish.y).toBeGreaterThanOrEqual(water.minY);
      expect(fish.y).toBeLessThanOrEqual(water.maxY);
    }
  });

  it('poissons d’eau douce : sensibles aux points blancs comme les autres', () => {
    for (const id of NEW) {
      expect(catchesIch(id, 'tropical'), id).toBe(true);
    }
  });
});

describe('eau douce, lot 3 (#391) : bac tropical et compatibilité', () => {
  it('proposées au bac tropical après le lot 2, absentes de sa population de départ', () => {
    for (const id of NEW) {
      expect(livesIn('tropical', id)).toBe(true);
      expect(livesIn('recif', id)).toBe(false);
      expect(livesIn('bassin', id)).toBe(false);
    }
    expect(TROPICAL_TANK.species).toEqual([...NATIVE, ...LOT1, ...LOT2, ...NEW]);
    expect(TROPICAL_TANK.population.map((p) => p.species)).toEqual(NATIVE);
    const catalog = speciesCatalog('tropical');
    expect(catalog.filter((e) => NEW.includes(e.species)).map((e) => e.defaultCount)).toEqual([
      0, 0, 0,
    ]);
    expect(
      wikiLists('tropical', { neon: 12, guppy: 6, corydora: 6 })
        .addable.map((e) => e.species)
        .slice(-3),
    ).toEqual(NEW);
  });

  it('monde par défaut (graine 42) inchangé : seules les trois espèces d’avant', () => {
    const world = createDefaultWorld(42);
    expect(new Set(world.entities.map((e) => e.species))).toEqual(new Set(NATIVE));
    expect(world.entities.length).toBe(TROPICAL_TANK.population.reduce((n, p) => n + p.count, 0));
  });

  it('paires incompatibles nouvelles : koï prédateur de chacune, deux gouramis territoriaux', () => {
    for (const id of NEW) {
      expect(compatibility('koi', id), id).toBe('predateur');
      expect(compatibility(id, 'koi'), id).toBe('predateur');
    }
    expect(TEMPERAMENTS.braise).toBe('paisible');
    expect(TEMPERAMENTS.molly).toBe('paisible');
    expect(TEMPERAMENTS.miel).toBe('territorial');
    expect(compatibility('miel', 'gourami')).toBe('territorial');
    expect(compatibility('gourami', 'miel')).toBe('territorial');
    expect(mixWarnings(TROPICAL_TANK.species, { gourami: 2, miel: 2, neon: 12 })).toEqual([
      { first: 'gourami', second: 'miel', reason: 'territorial' },
    ]);
    expect(wikiCare('miel').cohabitation.avoid.map((e) => e.species)).toContain('gourami');
  });

  it('paires compatibles : braise et molly avec tout le bac tropical, miel sauf le gourami nain', () => {
    const all = TROPICAL_TANK.species;
    for (const a of ['braise', 'molly'] as const) {
      for (const b of all) {
        expect(compatibility(a, b), `${a}/${b}`).toBe('compatible');
      }
    }
    for (const b of all.filter((s) => s !== 'gourami')) {
      expect(compatibility('miel', b), `miel/${b}`).toBe('compatible');
    }
    // Le molly, quatre fois plus long, n'est pas un prédateur du tétra braise.
    expect(compatibility('molly', 'braise')).toBe('compatible');
  });

  it('avertissements d’ajout : groupe du tétra braise, volume du molly, couple de gouramis miel', () => {
    const order = TROPICAL_TANK.species;
    expect(addWarnings('braise', 4, 100, { braise: 4 }, order)).toEqual([
      { kind: 'groupe', species: 'braise', count: 4, minGroup: 8 },
    ]);
    expect(addWarnings('molly', 3, 60, { molly: 3 }, order)).toEqual([
      { kind: 'volume', species: 'molly', liters: 60, minLiters: 81 },
    ]);
    expect(addWarnings('miel', 2, 100, { miel: 2, neon: 12 }, order)).toEqual([]);
  });
});
