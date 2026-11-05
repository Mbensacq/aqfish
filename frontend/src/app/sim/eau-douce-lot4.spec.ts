import { compatibility, EXTRA_PREDATORS, mixWarnings, TEMPERAMENTS } from './compatibility';
import { SIM_DT } from './constants';
import { DIURNAL } from './day-rhythm';
import { catchesIch } from './disease';
import { environmentWater, IMMERSIVE_ENVIRONMENTS, livesIn, TROPICAL_TANK } from './environment';
import { TAP_REACTIONS } from './glass-tap';
import { immersivePopulation } from './immersive-tank';
import { addWarnings, sheetRows, speciesSheet } from './species-sheet';
import { SPECIES_LABELS, speciesCatalog } from './species-catalog';
import { legalStatus } from './species-legal';
import { wikiCare, wikiLists } from './species-wiki';
import {
  CERISE,
  NERITINE,
  SILHOUETTE_IDS,
  SPECIES,
  validateSpecies,
  XIPHO,
  type SpeciesId,
} from './species';
import { INVERTEBRATES, treatmentGroup } from './treatment';
import { WATER_TEMPERATURES } from './water';
import { freshPh, SPECIES_PH } from './water-ph';
import { advanceInPlace, createDefaultWorld, createWorld, type MutableWorld } from './world';

/**
 * Issue #425 : eau douce tropicale, lot 4 (xipho, crevette cerise, néritine zèbre).
 * Graines fixes, temps simulé uniquement.
 */
const NEW: readonly SpeciesId[] = ['xipho', 'cerise', 'neritine'];
const WALKERS: readonly SpeciesId[] = ['cerise', 'neritine'];
const NATIVE: readonly SpeciesId[] = ['neon', 'guppy', 'corydora'];
const BEFORE: readonly SpeciesId[] = [
  ...NATIVE,
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
];
const water = environmentWater('tropical');
const waterHeight = water.maxY - water.minY;

/** Sources acceptées pour ce lot : FishBase et FishKeeper. */
const SOURCE = /^https:\/\/(www\.)?(fishbase\.org\/summary\/\d+|fishkeeper\.co\.uk\/fish\/\S+)/;

function mixed(seed: number): MutableWorld {
  return createWorld(
    seed,
    [
      { species: 'neon', count: 8 },
      { species: 'xipho', count: 3 },
      { species: 'cerise', count: 8 },
      { species: 'neritine', count: 3 },
    ],
    [],
    [],
    'tropical',
  ) as MutableWorld;
}

describe('eau douce, lot 4 (#425) : catalogue complet', () => {
  it.each(NEW)('%s : définition valide, silhouette propre, libellés', (id) => {
    const def = SPECIES[id];
    expect(validateSpecies(def)).toEqual([]);
    expect(SILHOUETTE_IDS).toContain(def.silhouette);
    expect(def.silhouette).toBe(id);
    expect(SPECIES_LABELS[id].singular.trim()).not.toBe('');
    expect(SPECIES_LABELS[id].plural).not.toBe(SPECIES_LABELS[id].singular);
  });

  it('silhouettes absentes des espèces d’eau douce d’avant', () => {
    const others = Object.values(SPECIES)
      .filter((def) => !NEW.includes(def.id))
      .map((def) => def.silhouette);
    for (const id of NEW) {
      expect(others).not.toContain(SPECIES[id].silhouette);
    }
    const freshwater = Object.values(SPECIES).filter(
      (def) => !NEW.includes(def.id) && !livesIn('recif', def.id),
    );
    // 15 poissons (bac tropical et koï) et 3 amphibiens.
    expect(freshwater.length).toBe(18);
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
        expect(field.status.reference).toMatch(SOURCE);
      }
    }
    // Taille, températures tolérées et régime : toujours sourcés pour ce lot ; aucun volume
    // chiffré dans les sources lues (approximation).
    expect(sheet.adultSize.status.kind).toBe('source');
    expect(sheet.temperatureTolerated.status.kind).toBe('source');
    expect(sheet.diet.status.kind).toBe('source');
    expect(sheet.minLiters.status.kind).toBe('approximation');
    for (const row of sheetRows(id)) {
      expect(row.value.trim(), row.field).not.toBe('');
      expect(row.status.trim(), row.field).not.toBe('');
    }
    expect(sheet.notes.length).toBeGreaterThan(0);
    for (const note of sheet.notes) {
      expect(note.text.trim()).not.toBe('');
      expect(note.status.kind).toBe('source');
    }
  });

  it.each(NEW)('%s : statut légal à vérifier, jamais présenté comme confirmé', (id) => {
    const legal = legalStatus(id);
    expect(legal.regime).toBe('a-verifier');
    expect(legal.confidence).toBe('non-verifie');
    expect(legal.confirmed).toBe(false);
    expect(legal.reference.trim()).not.toBe('');
    // Liste des espèces exotiques envahissantes de l'Union : dite non relue.
    expect(legal.note).toContain('liste de l’Union');
    expect(speciesSheet(id).legal.value).toBe(legal);
  });

  it('xipho et crevette cerise : ne jamais relâcher ; néritine : sujets sauvages probables', () => {
    expect(legalStatus('xipho').note).toContain('ne jamais relâcher');
    expect(legalStatus('cerise').note).toContain('ne jamais relâcher');
    expect(legalStatus('neritine').note).toContain('sauvages');
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

  it('régimes, rythmes et tapotement', () => {
    expect(speciesSheet('xipho').diet.value).toBe('omnivore');
    expect(speciesSheet('cerise').diet.value).toBe('omnivore');
    expect(speciesSheet('neritine').diet.value).toBe('herbivore');
    expect(DIURNAL.xipho).toBe(true);
    expect(DIURNAL.cerise).toBe(false);
    expect(DIURNAL.neritine).toBe(false);
    expect(TAP_REACTIONS.xipho).toBe('fuite');
    expect(TAP_REACTIONS.cerise).toBeNull();
    expect(TAP_REACTIONS.neritine).toBeNull();
  });

  it('invertébrés : groupe des traitements, ni points blancs ni banc', () => {
    for (const id of WALKERS) {
      expect(INVERTEBRATES.has(id), id).toBe(true);
      expect(treatmentGroup(id), id).toBe('invertebre');
      expect(catchesIch(id, 'tropical'), id).toBe(false);
      expect(SPECIES[id].schooling, id).toBeNull();
      expect(SPECIES[id].walker?.avoidsObstacles, id).toBe(true);
    }
    expect(treatmentGroup('xipho')).toBe('poisson');
    expect(catchesIch('xipho', 'tropical')).toBe(true);
    // La néritine ne nage jamais ; la crevette cerise nage brièvement, sans remonter.
    expect(NERITINE.walker?.weights).toEqual({ marche: 1, nage: 0, remontee: 0 });
    expect(CERISE.walker?.weights.remontee).toBe(0);
    expect(CERISE.walker?.weights.nage).toBeGreaterThan(0);
    expect(NERITINE.walker!.walkSpeed).toBeLessThan(CERISE.walker!.walkSpeed);
  });

  it('modèles agrandis pour la vue de face, mode immersif inchangé', () => {
    // Lisibles sans zoom : au moins deux fois la taille réelle (cm → m) pour les invertébrés.
    for (const def of [CERISE, NERITINE]) {
      expect(def.bodyLength, def.id).toBeGreaterThanOrEqual(
        (2 * speciesSheet(def.id).adultSize.value) / 100,
      );
    }
    // Le xipho, aussi long que le molly, reste plus court que le koï.
    expect(XIPHO.bodyLength).toBe(SPECIES.molly.bodyLength);
    expect(XIPHO.bodyLength).toBeLessThan(SPECIES.koi.bodyLength);
    for (const def of NEW.map((id) => SPECIES[id])) {
      expect(def.wallMargin, def.id).toBeGreaterThanOrEqual(def.bodyLength / 2);
    }
    expect(immersivePopulation('tropical').map((p) => p.species)).toEqual([
      'otocinclus',
      'corydora',
      'rasbora',
    ]);
    for (const env of IMMERSIVE_ENVIRONMENTS) {
      const species = immersivePopulation(env).map((e) => e.species);
      for (const id of NEW) {
        expect(species, `${env}/${id}`).not.toContain(id);
      }
    }
  });

  it('xipho en pleine eau, invertébrés sur le fond (graine 42, 60 s)', () => {
    const world = mixed(42);
    advanceInPlace(world, Math.round(10 / SIM_DT));
    const heights: Record<string, number[]> = { xipho: [], cerise: [], neritine: [] };
    for (let i = 0; i < Math.round(60 / SIM_DT); i += 10) {
      advanceInPlace(world, 10);
      for (const fish of world.entities) {
        heights[fish.species]?.push((fish.y - water.minY) / waterHeight);
      }
    }
    const median = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];
    expect(median(heights['xipho'])).toBeGreaterThan(0.3);
    expect(median(heights['cerise'])).toBeLessThan(0.15);
    // La néritine ne quitte jamais le fond.
    expect(Math.max(...heights['neritine'])).toBeLessThan(0.15);
  });

  it('même graine, même trajectoire ; autre graine, autre trajectoire', () => {
    const a = mixed(7);
    const b = mixed(7);
    const c = mixed(8);
    for (const w of [a, b, c]) {
      advanceInPlace(w, Math.round(20 / SIM_DT));
    }
    expect(a.entities).toEqual(b.entities);
    expect(a.entities.map((e) => e.x)).not.toEqual(c.entities.map((e) => e.x));
  });

  it('effectifs extrêmes : zéro individu ou le maximum de chaque espèce, sans sortir de l’eau', () => {
    const empty = createWorld(42, [{ species: 'cerise', count: 0 }], [], [], 'tropical');
    expect(empty.entities.length).toBe(0);
    const full = createWorld(
      3,
      NEW.map((id) => ({ species: id, count: SPECIES[id].maxPopulation })),
      [],
      [],
      'tropical',
    ) as MutableWorld;
    expect(full.entities.length).toBe(
      XIPHO.maxPopulation + CERISE.maxPopulation + NERITINE.maxPopulation,
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
});

describe('eau douce, lot 4 (#425) : bac tropical et compatibilité', () => {
  it('proposées au bac tropical après le lot 3, absentes de sa population de départ', () => {
    for (const id of NEW) {
      expect(livesIn('tropical', id)).toBe(true);
      expect(livesIn('recif', id)).toBe(false);
      expect(livesIn('bassin', id)).toBe(false);
    }
    expect(TROPICAL_TANK.species).toEqual([...BEFORE, ...NEW]);
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

  it('paire incompatible nouvelle : le xipho mange la crevette cerise (symétrique)', () => {
    expect(TEMPERAMENTS.xipho).toBe('paisible');
    expect(EXTRA_PREDATORS.cerise).toEqual(['xipho', 'molly']);
    expect(compatibility('xipho', 'cerise')).toBe('predateur');
    expect(compatibility('cerise', 'xipho')).toBe('predateur');
    expect(mixWarnings(TROPICAL_TANK.species, { neon: 8, xipho: 3, cerise: 8 })).toEqual([
      { first: 'xipho', second: 'cerise', reason: 'predateur' },
    ]);
    expect(wikiCare('cerise').cohabitation.avoid.map((e) => e.species)).toContain('xipho');
    // Le koï, prédateur plus grand, mange chacune.
    for (const id of NEW) {
      expect(compatibility('koi', id), id).toBe('predateur');
    }
  });

  it('molly et gouramis face à la crevette cerise (#429) : le molly la mange, pas les gouramis', () => {
    expect(TEMPERAMENTS.molly).toBe('paisible');
    expect(compatibility('molly', 'cerise')).toBe('predateur');
    expect(compatibility('cerise', 'molly')).toBe('predateur');
    for (const gourami of ['gourami', 'miel'] as const) {
      expect(compatibility('cerise', gourami), gourami).toBe('compatible');
      expect(compatibility(gourami, 'cerise'), gourami).toBe('compatible');
    }
    expect(mixWarnings(TROPICAL_TANK.species, { molly: 3, cerise: 8 })).toEqual([
      { first: 'molly', second: 'cerise', reason: 'predateur' },
    ]);
    expect(mixWarnings(TROPICAL_TANK.species, { gourami: 2, cerise: 8 })).toEqual([]);
    expect(mixWarnings(TROPICAL_TANK.species, { miel: 4, cerise: 8 })).toEqual([]);
    // Le molly reste compatible avec les poissons du bac.
    for (const b of TROPICAL_TANK.species.filter((s) => s !== 'cerise')) {
      expect(compatibility('molly', b), `molly/${b}`).toBe('compatible');
    }
  });

  it('paires compatibles : crevette cerise avec les petits poissons, néritine avec tous', () => {
    for (const fish of ['neon', 'rasbora', 'braise', 'otocinclus', 'corydora'] as const) {
      expect(compatibility('cerise', fish), fish).toBe('compatible');
    }
    for (const b of TROPICAL_TANK.species) {
      expect(compatibility('neritine', b), `neritine/${b}`).toBe('compatible');
    }
    for (const b of TROPICAL_TANK.species.filter((s) => s !== 'cerise')) {
      expect(compatibility('xipho', b), `xipho/${b}`).toBe('compatible');
    }
    expect(mixWarnings(TROPICAL_TANK.species, { neon: 8, cerise: 10, neritine: 2 })).toEqual([]);
  });

  it('avertissements d’ajout : groupe de crevettes, volume du xipho', () => {
    const order = TROPICAL_TANK.species;
    expect(addWarnings('cerise', 3, 100, { cerise: 3 }, order)).toEqual([
      { kind: 'groupe', species: 'cerise', count: 3, minGroup: 6 },
    ]);
    expect(addWarnings('xipho', 3, 60, { xipho: 3 }, order)).toEqual([
      { kind: 'volume', species: 'xipho', liters: 60, minLiters: 100 },
    ]);
    expect(addWarnings('neritine', 2, 100, { neritine: 2, neon: 12 }, order)).toEqual([]);
  });
});
