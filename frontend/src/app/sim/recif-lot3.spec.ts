import { obstacleClearance } from './axolotl';
import { compatibility, mixWarnings, TEMPERAMENTS } from './compatibility';
import { SIM_DT } from './constants';
import { DIURNAL } from './day-rhythm';
import { catchesIch } from './disease';
import { environmentWater, livesIn, REEF, TROPICAL_TANK } from './environment';
import { TAP_REACTIONS } from './glass-tap';
import { immersivePopulation, smallSwimmers } from './immersive-tank';
import { createRoom, findTank, type RoomState } from './room-state';
import { addWarnings, sheetRows, speciesSheet } from './species-sheet';
import { SPECIES_LABELS, speciesCatalog } from './species-catalog';
import { legalStatus } from './species-legal';
import { wikiCare, wikiLists } from './species-wiki';
import {
  BLENNIE,
  CHIRURGIEN,
  CLOWN,
  CREVETTE,
  GOBIE,
  GRAMMA,
  SILHOUETTE_IDS,
  SPECIES,
  validateSpecies,
  type SpeciesColors,
  type SpeciesId,
} from './species';
import { transferFish, transferRefusal } from './tank-transfer';
import { treatmentGroup } from './treatment';
import { WATER_TEMPERATURES } from './water';
import { freshPh, SPECIES_PH } from './water-ph';
import {
  advanceInPlace,
  createDefaultWorld,
  createWorld,
  type MutableWorld,
  type World,
} from './world';

/**
 * Issue #422 : récif, lot 3 (crevette nettoyeuse, blennie bicolore ; gobie et gramma plus
 * lisibles, #405). Graines fixes, temps simulé uniquement.
 */
const NEW: readonly SpeciesId[] = ['crevette', 'blennie'];
const BEFORE: readonly SpeciesId[] = ['clown', 'chirurgien', 'chromis', 'gobie', 'gramma'];
const water = environmentWater('recif');
const waterHeight = water.maxY - water.minY;

function worldOf(room: RoomState, id: number): World {
  return (findTank(room, id) as { world: World }).world;
}

/** Récif peuplé de ses espèces d'origine, du lot 2 et du lot 3. */
function fullReef(seed: number): MutableWorld {
  return createWorld(
    seed,
    [
      { species: 'clown', count: 3 },
      { species: 'chirurgien', count: 4 },
      { species: 'chromis', count: 7 },
      { species: 'gobie', count: 2 },
      { species: 'gramma', count: 2 },
      { species: 'crevette', count: CREVETTE.maxPopulation },
      { species: 'blennie', count: BLENNIE.defaultPopulation },
    ],
    [],
    [],
    'recif',
  ) as MutableWorld;
}

/** Couleurs d'une espèce, œil exclu (noir commun). */
function bodyColors(colors: SpeciesColors): Set<string> {
  return new Set([colors.stripe, colors.accent, colors.back, colors.belly, colors.fin]);
}

describe('récif, lot 3 (#422) : catalogue complet', () => {
  it.each(NEW)('%s : définition valide, silhouette propre, libellés', (id) => {
    const def = SPECIES[id];
    expect(validateSpecies(def)).toEqual([]);
    expect(SILHOUETTE_IDS).toContain(def.silhouette);
    expect(def.silhouette).toBe(id);
    expect(SPECIES_LABELS[id].singular.trim()).not.toBe('');
    expect(SPECIES_LABELS[id].plural).not.toBe(SPECIES_LABELS[id].singular);
    expect(SPECIES_LABELS[id].feminine).toBe(true);
    const others = Object.values(SPECIES)
      .filter((other) => other.id !== id)
      .map((other) => other.silhouette);
    expect(others).not.toContain(def.silhouette);
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
        expect(field.status.reference).toMatch(
          /^https:\/\/(www\.fishbase\.se\/summary\/\d|en\.reeflex\.net\/tiere\/\d)/,
        );
      }
    }
    // Taille adulte et régime toujours sourcés pour ce lot.
    expect(sheet.adultSize.status.kind).toBe('source');
    expect(sheet.diet.status.kind).toBe('source');
    for (const row of sheetRows(id)) {
      expect(row.value.trim(), row.field).not.toBe('');
      expect(row.status.trim(), row.field).not.toBe('');
    }
    expect(sheet.notes.length).toBeGreaterThan(0);
    for (const note of sheet.notes) {
      expect(note.text.trim()).not.toBe('');
      expect(note.status.kind).toBe('source');
    }
    for (const row of wikiCare(id).feeding) {
      expect(row.value.trim(), row.field).not.toBe('');
    }
  });

  it('valeurs sourcées : 6 cm, 22–28 °C et 112 L (crevette) ; 11 cm et herbivore (blennie)', () => {
    const crevette = speciesSheet('crevette');
    expect(crevette.adultSize.value).toBe(6);
    expect(crevette.temperatureTolerated.value).toEqual({ min: 22, max: 28 });
    expect(crevette.minLiters.value).toBe(112);
    expect(crevette.diet.value).toBe('omnivore');
    const blennie = speciesSheet('blennie');
    expect(blennie.adultSize.value).toBe(11);
    expect(blennie.diet.value).toBe('herbivore');
    // FishBase ne donne pas de température : approximation, jamais présentée comme sourcée.
    expect(blennie.temperatureTolerated.status.kind).toBe('approximation');
  });

  it.each(NEW)('%s : statut légal à vérifier (annexe 2 et CITES), jamais confirmé', (id) => {
    const legal = legalStatus(id);
    expect(legal.regime).toBe('a-verifier');
    expect(legal.confidence).toBe('non-verifie');
    expect(legal.confirmed).toBe(false);
    expect(legal.reference.trim()).not.toBe('');
    expect(legal.note).toContain('CITES');
    expect(legal.note).toContain('origine');
    expect(speciesSheet(id).legal.value).toBe(legal);
  });

  it.each(NEW)('%s : plages de température et de pH contenant l’eau du récif', (id) => {
    const sheet = speciesSheet(id);
    const t = WATER_TEMPERATURES.recif;
    const tp = sheet.temperaturePreferred.value;
    const tt = sheet.temperatureTolerated.value;
    expect(tt.min).toBeLessThanOrEqual(tp.min);
    expect(tp.max).toBeLessThanOrEqual(tt.max);
    expect(tp.min).toBeLessThanOrEqual(t);
    expect(t).toBeLessThanOrEqual(tp.max);
    const ph = SPECIES_PH[id];
    expect(ph.tolerated.min).toBeLessThanOrEqual(ph.ideal.min);
    expect(ph.ideal.max).toBeLessThanOrEqual(ph.tolerated.max);
    expect(ph.tolerated.min).toBeLessThanOrEqual(freshPh('recif'));
    expect(freshPh('recif')).toBeLessThanOrEqual(ph.tolerated.max);
    expect(ph.tolerated.min).toBeGreaterThan(freshPh('tropical'));
  });

  it('rythmes et tapotement : blennie diurne qui fuit ; crevette marcheuse, sans réaction', () => {
    expect(DIURNAL.blennie).toBe(true);
    expect(TAP_REACTIONS.blennie).toBe('fuite');
    expect(DIURNAL.crevette).toBe(DIURNAL.axolotl);
    expect(TAP_REACTIONS.crevette).toBeNull();
  });

  it('crevette : invertébré marcheur du fond, au plus deux, hors du mode immersif', () => {
    expect(treatmentGroup('crevette')).toBe('invertebre');
    expect(treatmentGroup('blennie')).toBe('poisson');
    expect(CREVETTE.walker).toBeDefined();
    expect(CREVETTE.walker?.weights.remontee).toBe(0);
    expect(CREVETTE.depth).toBeUndefined();
    expect(CREVETTE.schooling).toBeNull();
    expect(CREVETTE.maxPopulation).toBe(2);
    expect(smallSwimmers('recif')).not.toContain('crevette');
    expect(catchesIch('crevette', 'recif')).toBe(false);
    expect(catchesIch('blennie', 'recif')).toBe(false);
  });

  it('blennie : solitaire, près des roches, au-dessus du gobie et sous le gramma', () => {
    expect(BLENNIE.schooling).toBeNull();
    const band = BLENNIE.depth;
    expect(band).toBeDefined();
    expect(band?.minHeightRatio ?? 0).toBeGreaterThan(0);
    expect(GOBIE.depth?.maxHeightRatio ?? 1).toBeLessThan(band?.maxHeightRatio ?? 0);
    expect(band?.maxHeightRatio ?? 1).toBeLessThan(GRAMMA.depth?.minHeightRatio ?? 0);
    // Plus long que le gramma : hors du trio du mode immersif du récif.
    expect(BLENNIE.bodyLength).toBeGreaterThan(GRAMMA.bodyLength);
  });

  it('mode immersif du récif inchangé : chromis, clown, gramma (ADR 0097, ADR 0103)', () => {
    expect(immersivePopulation('recif').map((p) => p.species)).toEqual([
      'chromis',
      'clown',
      'gramma',
    ]);
    expect(immersivePopulation('tropical').map((p) => p.species)).toEqual([
      'otocinclus',
      'corydora',
      'rasbora',
    ]);
  });
});

describe('récif, lot 3 (#422) : gobie et gramma lisibles (#405)', () => {
  it('gobie et gramma ne partagent plus aucune couleur', () => {
    const gobie = bodyColors(GOBIE.colors);
    for (const color of bodyColors(GRAMMA.colors)) {
      expect(gobie.has(color), color).toBe(false);
    }
  });

  it('gobie agrandi, seul du récif plus long que le chirurgien ; gramma au-dessus des coraux', () => {
    expect(GOBIE.bodyLength).toBeGreaterThan(CHIRURGIEN.bodyLength);
    expect(GOBIE.wallMargin).toBeGreaterThanOrEqual(GOBIE.bodyLength / 2);
    for (const id of REEF.species.filter((s) => s !== 'gobie' && s !== 'crevette')) {
      expect(SPECIES[id].bodyLength, id).toBeLessThanOrEqual(CHIRURGIEN.bodyLength);
    }
    expect(GRAMMA.depth?.minHeightRatio ?? 0).toBeGreaterThanOrEqual(0.25);
  });

  it.each(NEW)('%s : couleurs distinctes de chaque poisson présent avant le lot', (id) => {
    const own = SPECIES[id].colors;
    for (const other of BEFORE) {
      const theirs = SPECIES[other].colors;
      // Couleur dominante (flanc) jamais partagée.
      expect(bodyColors(theirs).has(own.stripe), `${id}/${other}`).toBe(false);
    }
  });
});

describe('récif, lot 3 (#422) : comportement simulé', () => {
  it('hauteurs (graine 42, 120 s) : crevette surtout au sol, blennie basse, gramma plus haut', () => {
    const world = fullReef(42);
    advanceInPlace(world, Math.round(20 / SIM_DT));
    const crevette: number[] = [];
    const blennie: number[] = [];
    const gramma: number[] = [];
    for (let i = 0; i < Math.round(120 / SIM_DT); i++) {
      advanceInPlace(world, 1);
      for (const e of world.entities) {
        const h = (e.y - water.minY) / waterHeight;
        if (e.species === 'crevette') crevette.push(h);
        if (e.species === 'blennie') blennie.push(h);
        if (e.species === 'gramma') gramma.push(h);
      }
    }
    const median = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];
    expect(median(crevette)).toBeLessThan(0.1);
    expect(median(blennie)).toBeLessThan(0.35);
    expect(median(gramma)).toBeGreaterThan(median(blennie));
  }, 30_000);

  it.each([42, 7, 1234])(
    'graine %i : la crevette contourne coraux et rochers (jamais dedans)',
    (seed) => {
      const world = fullReef(seed);
      expect(world.obstacles.length).toBeGreaterThan(0);
      let worst = Number.POSITIVE_INFINITY;
      for (let i = 0; i < Math.round(90 / SIM_DT); i++) {
        advanceInPlace(world, 1);
        for (const e of world.entities) {
          if (e.species === 'crevette') {
            worst = Math.min(worst, obstacleClearance(e.x, e.y, e.z, world.obstacles));
          }
        }
      }
      expect(worst).toBeGreaterThan(0);
    },
    30_000,
  );

  it('sans obstacle, la distance aux obstacles est infinie (marche d’avant inchangée)', () => {
    expect(obstacleClearance(0, 0, 0, [])).toBe(Number.POSITIVE_INFINITY);
  });

  it('même graine, même trajectoire ; autre graine, autre trajectoire', () => {
    const a = fullReef(7);
    const b = fullReef(7);
    const c = fullReef(8);
    for (const w of [a, b, c]) {
      advanceInPlace(w, Math.round(20 / SIM_DT));
    }
    expect(a.entities).toEqual(b.entities);
    expect(a.entities.map((e) => e.x)).not.toEqual(c.entities.map((e) => e.x));
  });

  it('effectifs extrêmes : zéro ou le maximum de chaque espèce, sans sortir de l’eau', () => {
    expect(createWorld(42, [{ species: 'crevette', count: 0 }], [], [], 'recif').entities).toEqual(
      [],
    );
    const full = createWorld(
      3,
      NEW.map((id) => ({ species: id, count: SPECIES[id].maxPopulation })),
      [],
      [],
      'recif',
    ) as MutableWorld;
    expect(full.entities.length).toBe(CREVETTE.maxPopulation + BLENNIE.maxPopulation);
    advanceInPlace(full, Math.round(30 / SIM_DT));
    for (const e of full.entities) {
      expect(Number.isFinite(e.x) && Number.isFinite(e.y) && Number.isFinite(e.z)).toBe(true);
      expect(e.y).toBeGreaterThanOrEqual(water.minY);
      expect(e.y).toBeLessThanOrEqual(water.maxY);
    }
  });
});

describe('récif, lot 3 (#422) : récif, milieu et compatibilité', () => {
  it('proposées au récif après le lot 2, absentes de sa population de départ', () => {
    for (const id of NEW) {
      expect(livesIn('recif', id)).toBe(true);
      expect(livesIn('tropical', id)).toBe(false);
      expect(livesIn('eaufroide', id)).toBe(false);
    }
    expect(REEF.species).toEqual([...BEFORE, ...NEW]);
    expect(REEF.population).toEqual([
      { species: 'clown', count: CLOWN.defaultPopulation },
      { species: 'chirurgien', count: CHIRURGIEN.defaultPopulation },
    ]);
    const catalog = speciesCatalog('recif');
    expect(catalog.filter((e) => NEW.includes(e.species)).map((e) => e.defaultCount)).toEqual([
      0, 0,
    ]);
    expect(
      wikiLists('recif', { clown: 3, chirurgien: 4 })
        .addable.map((e) => e.species)
        .slice(-2),
    ).toEqual(NEW);
  });

  it('récif par défaut (graine 42) inchangé : seules les deux espèces d’origine', () => {
    const world = createDefaultWorld(42, 'recif');
    expect(new Set(world.entities.map((e) => e.species))).toEqual(new Set(['clown', 'chirurgien']));
  });

  it('refusées en eau douce et inversement, avec un message explicite', () => {
    const base = createRoom(42, ['recif', 'tropical']);
    const room: RoomState = {
      ...base,
      tanks: base.tanks.map((t) => (t.id === 0 ? { ...t, world: fullReef(42) } : t)),
    };
    for (const id of NEW) {
      const fish = worldOf(room, 0).entities.find((e) => e.species === id);
      expect(fish, id).toBeDefined();
      if (fish === undefined) return;
      expect(transferRefusal(room, 0, 1, fish.id)).toBe('milieu');
      const result = transferFish(room, 0, 1, fish.id);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe('milieu');
      expect(result.message).toContain(SPECIES_LABELS[id].plural);
      expect(result.message).toContain('ne vivent pas');
      expect(result.message).toContain('Bac tropical');
    }
    const neon = worldOf(room, 1).entities.find((e) => e.species === 'neon');
    if (neon === undefined) throw new Error('aucun néon');
    const back = transferFish(room, 1, 0, neon.id);
    expect(back.ok).toBe(false);
    if (back.ok) return;
    expect(back.reason).toBe('milieu');
    expect(back.message).toContain('Récif');
    expect(
      speciesCatalog('tropical').some((e) => (NEW as readonly string[]).includes(e.species)),
    ).toBe(false);
    expect(TROPICAL_TANK.species.some((id) => NEW.includes(id))).toBe(false);
  });

  it('paires incompatibles nouvelles : blennie avec le gramma et avec le poisson-clown', () => {
    expect(TEMPERAMENTS.blennie).toBe('territorial');
    expect(TEMPERAMENTS.crevette).toBe('paisible');
    expect(compatibility('blennie', 'gramma')).toBe('territorial');
    expect(compatibility('clown', 'blennie')).toBe('territorial');
    expect(mixWarnings(REEF.species, { chirurgien: 4, gramma: 1, blennie: 1 })).toEqual([
      { first: 'gramma', second: 'blennie', reason: 'territorial' },
    ]);
    expect(wikiCare('blennie').cohabitation.avoid.map((e) => e.species)).toEqual(
      expect.arrayContaining(['clown', 'gramma']),
    );
    for (const id of NEW) {
      expect(compatibility('koi', id), id).toBe('predateur');
    }
  });

  it('paires compatibles : crevette avec tout le récif (clown compris), blennie et chirurgien', () => {
    for (const b of REEF.species) {
      expect(compatibility('crevette', b), `crevette/${b}`).toBe('compatible');
    }
    expect(compatibility('crevette', 'clown')).toBe('compatible');
    expect(compatibility('blennie', 'chirurgien')).toBe('compatible');
    expect(compatibility('blennie', 'chromis')).toBe('compatible');
    expect(mixWarnings(REEF.species, { clown: 3, chirurgien: 4, chromis: 7, crevette: 2 })).toEqual(
      [],
    );
  });

  it('avertissements d’ajout : volume de la crevette, blennie seule sans alerte', () => {
    const order = REEF.species;
    expect(addWarnings('crevette', 1, 80, { crevette: 1 }, order)).toEqual([
      { kind: 'volume', species: 'crevette', liters: 80, minLiters: 112 },
    ]);
    expect(addWarnings('blennie', 1, 400, { blennie: 1, chirurgien: 4 }, order)).toEqual([]);
  });
});
