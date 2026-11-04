import { compatibility, mixWarnings, TEMPERAMENTS } from './compatibility';
import { SIM_DT } from './constants';
import { DIURNAL } from './day-rhythm';
import { catchesIch } from './disease';
import { environmentWater, livesIn, REEF, TROPICAL_TANK } from './environment';
import { TAP_REACTIONS } from './glass-tap';
import { immersivePopulation } from './immersive-tank';
import { createRoom, findTank, type RoomState } from './room-state';
import { addWarnings, sheetRows, speciesSheet } from './species-sheet';
import { SPECIES_LABELS, speciesCatalog } from './species-catalog';
import { legalStatus } from './species-legal';
import { wikiCare, wikiLists } from './species-wiki';
import {
  CHIRURGIEN,
  CHROMIS,
  CLOWN,
  GOBIE,
  GRAMMA,
  SILHOUETTE_IDS,
  SPECIES,
  validateSpecies,
  type SpeciesId,
} from './species';
import { transferFish, transferRefusal } from './tank-transfer';
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
 * Issue #403 : récif, lot 2 (chromis vert, gobie à crevette jaune, gramma royal).
 * Graines fixes, temps simulé uniquement.
 */
const NEW: readonly SpeciesId[] = ['chromis', 'gobie', 'gramma'];
const NATIVE: readonly SpeciesId[] = ['clown', 'chirurgien'];
const water = environmentWater('recif');
const waterHeight = water.maxY - water.minY;

/**
 * Hauteurs (fraction de la colonne d'eau) des individus de chaque espèce de `species`, sur
 * `steps` pas, en une seule simulation.
 */
function heights(
  world: MutableWorld,
  species: readonly SpeciesId[],
  steps: number,
): Map<SpeciesId, number[]> {
  const out = new Map<SpeciesId, number[]>(species.map((id) => [id, []]));
  for (let i = 0; i < steps; i++) {
    advanceInPlace(world, 1);
    for (const fish of world.entities) {
      out.get(fish.species)?.push((fish.y - water.minY) / waterHeight);
    }
  }
  return out;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function worldOf(room: RoomState, id: number): World {
  return (findTank(room, id) as { world: World }).world;
}

/** Récif peuplé de ses espèces d'origine et des trois nouvelles. */
function mixedReef(seed: number): MutableWorld {
  return createWorld(
    seed,
    [
      { species: 'clown', count: 3 },
      { species: 'chirurgien', count: 4 },
      { species: 'chromis', count: CHROMIS.defaultPopulation },
      { species: 'gobie', count: GOBIE.defaultPopulation },
      { species: 'gramma', count: GRAMMA.defaultPopulation },
    ],
    [],
    [],
    'recif',
  ) as MutableWorld;
}

describe('récif, lot 2 (#403) : catalogue complet', () => {
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
        expect(field.status.reference).toMatch(
          /^https:\/\/(www\.fishbase\.se\/summary\/\d|en\.wikipedia\.org\/wiki\/\S)/,
        );
      }
    }
    // Taille adulte : toujours sourcée (FishBase) pour ce lot.
    expect(sheet.adultSize.status.kind).toBe('source');
    expect(sheet.adultSize.status).toMatchObject({
      reference: expect.stringContaining('fishbase'),
    });
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

  it.each(NEW)('%s : statut légal à vérifier (annexe 2 et CITES), jamais confirmé', (id) => {
    const legal = legalStatus(id);
    expect(legal.regime).toBe('a-verifier');
    expect(legal.confidence).toBe('non-verifie');
    expect(legal.confirmed).toBe(false);
    expect(legal.reference.trim()).not.toBe('');
    expect(legal.note).toContain('CITES');
    expect(speciesSheet(id).legal.value).toBe(legal);
  });

  it('origine des sujets : gramma élevé en captivité, chromis non vérifiée', () => {
    expect(legalStatus('gramma').note).toContain('captivité');
    expect(legalStatus('gobie').note).toContain('élevage');
    expect(legalStatus('chromis').note).toContain('non vérifiée');
  });

  it.each(NEW)('%s : plages de température et de pH contenant l’eau du récif', (id) => {
    const sheet = speciesSheet(id);
    const t = WATER_TEMPERATURES.recif;
    expect(t).toBe(26);
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
    // Une eau douce neuve (pH 7) est hors de leur tolérance.
    expect(ph.tolerated.min).toBeGreaterThan(freshPh('tropical'));
  });

  it('régimes, rythmes et tapotement : trois espèces diurnes qui fuient', () => {
    expect(speciesSheet('chromis').diet.value).toBe('omnivore');
    expect(speciesSheet('gramma').diet.value).toBe('carnivore');
    expect(NEW.every((id) => DIURNAL[id])).toBe(true);
    expect(NEW.every((id) => TAP_REACTIONS[id] === 'fuite')).toBe(true);
  });

  it('comportements : chromis en banc ; gobie au fond ; gramma dans le bas, sous le chromis', () => {
    expect(CHROMIS.schooling).not.toBeNull();
    expect(GOBIE.schooling).toBeNull();
    expect(GRAMMA.schooling).toBeNull();
    // Gobie : le plus bas du récif, sans hauteur minimale.
    expect(GOBIE.depth?.minHeightRatio).toBeUndefined();
    for (const id of REEF.species.filter((s) => s !== 'gobie')) {
      expect(GOBIE.depth?.maxHeightRatio ?? 1, id).toBeLessThan(
        SPECIES[id].depth?.maxHeightRatio ?? 1,
      );
    }
    expect(GRAMMA.depth?.maxHeightRatio ?? 1).toBeLessThanOrEqual(
      CHROMIS.depth?.minHeightRatio ?? 0,
    );
    // Modèles : chromis le plus petit du récif, aucun plus grand que le chirurgien, sauf le
    // gobie, agrandi pour la lisibilité (#405, ADR 0103).
    for (const id of REEF.species.filter((s) => s !== 'chromis')) {
      expect(CHROMIS.bodyLength, id).toBeLessThan(SPECIES[id].bodyLength);
    }
    for (const id of NEW) {
      expect(SPECIES[id].wallMargin, id).toBeGreaterThanOrEqual(SPECIES[id].bodyLength / 2);
      if (id === 'gobie') continue;
      expect(SPECIES[id].bodyLength, id).toBeLessThan(CHIRURGIEN.bodyLength);
    }
  });

  it('mode immersif du récif : ses trois plus petites espèces nageuses (ADR 0094, ADR 0097)', () => {
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

  it('hauteurs (graine 42, 60 s) : gobie au ras du sable, gramma bas, chromis au-dessus', () => {
    const world = mixedReef(42);
    advanceInPlace(world, Math.round(10 / SIM_DT));
    const seen = heights(world, NEW, Math.round(60 / SIM_DT));
    const gobie = median(seen.get('gobie') ?? []);
    const gramma = median(seen.get('gramma') ?? []);
    const chromis = median(seen.get('chromis') ?? []);
    expect(gobie).toBeLessThan(0.15);
    expect(gramma).toBeGreaterThan(gobie);
    expect(gramma).toBeLessThan(0.55);
    expect(chromis).toBeGreaterThan(0.45);
    expect(chromis).toBeGreaterThan(gramma);
  }, 20_000);

  it('même graine, même trajectoire ; autre graine, autre trajectoire', () => {
    const a = mixedReef(7);
    const b = mixedReef(7);
    const c = mixedReef(8);
    for (const w of [a, b, c]) {
      advanceInPlace(w, Math.round(20 / SIM_DT));
    }
    expect(a.entities).toEqual(b.entities);
    expect(a.entities.map((e) => e.x)).not.toEqual(c.entities.map((e) => e.x));
  });

  it('effectifs extrêmes : zéro individu ou le maximum de chaque espèce, sans sortir de l’eau', () => {
    const empty = createWorld(42, [{ species: 'gobie', count: 0 }], [], [], 'recif');
    expect(empty.entities.length).toBe(0);
    const full = createWorld(
      3,
      NEW.map((id) => ({ species: id, count: SPECIES[id].maxPopulation })),
      [],
      [],
      'recif',
    ) as MutableWorld;
    expect(full.entities.length).toBe(
      CHROMIS.maxPopulation + GOBIE.maxPopulation + GRAMMA.maxPopulation,
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

  it('poissons marins : pas de points blancs d’eau douce', () => {
    for (const id of NEW) {
      expect(catchesIch(id, 'recif'), id).toBe(false);
    }
  });
});

describe('récif, lot 2 (#403) : récif, milieu et compatibilité', () => {
  it('proposées au récif après ses deux espèces, absentes de sa population de départ', () => {
    for (const id of NEW) {
      expect(livesIn('recif', id)).toBe(true);
      expect(livesIn('tropical', id)).toBe(false);
      expect(livesIn('eaufroide', id)).toBe(false);
    }
    // Lot 3 (#422) : ses espèces suivent celles du lot 2.
    expect(REEF.species.slice(0, NATIVE.length + NEW.length)).toEqual([...NATIVE, ...NEW]);
    expect(REEF.population).toEqual([
      { species: 'clown', count: CLOWN.defaultPopulation },
      { species: 'chirurgien', count: CHIRURGIEN.defaultPopulation },
    ]);
    const catalog = speciesCatalog('recif');
    expect(catalog.filter((e) => NEW.includes(e.species)).map((e) => e.defaultCount)).toEqual([
      0, 0, 0,
    ]);
    expect(
      wikiLists('recif', { clown: 3, chirurgien: 4 })
        .addable.map((e) => e.species)
        .filter((id) => NEW.includes(id)),
    ).toEqual(NEW);
  });

  it('récif par défaut (graine 42) inchangé : seules les deux espèces d’avant', () => {
    const world = createDefaultWorld(42, 'recif');
    expect(new Set(world.entities.map((e) => e.species))).toEqual(new Set(NATIVE));
    expect(world.entities.length).toBe(REEF.population.reduce((n, p) => n + p.count, 0));
  });

  it('refusées en eau douce et inversement, avec un message explicite', () => {
    // Bac 0 récif peuplé des trois espèces, bac 1 tropical.
    const base = createRoom(42, ['recif', 'tropical']);
    const room: RoomState = {
      ...base,
      tanks: base.tanks.map((t) => (t.id === 0 ? { ...t, world: mixedReef(42) } : t)),
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
    // Hors du catalogue d'eau douce : jamais proposées au bac tropical.
    expect(
      speciesCatalog('tropical').some((e) => (NEW as readonly string[]).includes(e.species)),
    ).toBe(false);
    expect(TROPICAL_TANK.species.some((id) => NEW.includes(id))).toBe(false);
  });

  it('paire incompatible nouvelle : gramma royal et poisson-clown, territoriaux', () => {
    expect(TEMPERAMENTS.chromis).toBe('paisible');
    expect(TEMPERAMENTS.gobie).toBe('paisible');
    expect(TEMPERAMENTS.gramma).toBe('territorial');
    expect(compatibility('gramma', 'clown')).toBe('territorial');
    expect(compatibility('clown', 'gramma')).toBe('territorial');
    expect(mixWarnings(REEF.species, { clown: 3, chirurgien: 4, gramma: 1 })).toEqual([
      { first: 'clown', second: 'gramma', reason: 'territorial' },
    ]);
    expect(wikiCare('gramma').cohabitation.avoid.map((e) => e.species)).toContain('clown');
    // Koï (eau douce) prédateur de chacune, verdict hors milieu.
    for (const id of NEW) {
      expect(compatibility('koi', id), id).toBe('predateur');
    }
  });

  it('paires compatibles : chromis et gobie avec tout le récif, gramma avec le chirurgien', () => {
    for (const a of ['chromis', 'gobie'] as const) {
      for (const b of REEF.species) {
        expect(compatibility(a, b), `${a}/${b}`).toBe('compatible');
      }
    }
    expect(compatibility('gramma', 'chirurgien')).toBe('compatible');
    expect(compatibility('chromis', 'clown')).toBe('compatible');
    expect(mixWarnings(REEF.species, { clown: 3, chirurgien: 4, chromis: 7, gobie: 1 })).toEqual(
      [],
    );
  });

  it('avertissements d’ajout : groupe du chromis, volume du gramma, gobie seul sans alerte', () => {
    const order = REEF.species;
    expect(addWarnings('chromis', 3, 400, { chromis: 3 }, order)).toEqual([
      { kind: 'groupe', species: 'chromis', count: 3, minGroup: 5 },
    ]);
    expect(addWarnings('gramma', 1, 80, { gramma: 1 }, order)).toEqual([
      { kind: 'volume', species: 'gramma', liters: 80, minLiters: 114 },
    ]);
    expect(addWarnings('gobie', 1, 400, { gobie: 1, chirurgien: 4 }, order)).toEqual([]);
  });
});
