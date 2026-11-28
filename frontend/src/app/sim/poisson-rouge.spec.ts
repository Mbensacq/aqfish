import {
  compatibility,
  EXTRA_PREDATORS,
  eaterOf,
  mixWarnings,
  SPARED_PREY,
  TEMPERAMENTS,
  WATER_CLASSES,
} from './compatibility';
import { SIM_DT } from './constants';
import { DIURNAL } from './day-rhythm';
import { environmentWater, ENVIRONMENTS, livesIn, POND } from './environment';
import { populationCounts, setPopulation } from './population';
import { parseWorld, serializeWorld } from './save';
import { cohabitationReason } from './species-care';
import { speciesCatalog, SPECIES_LABELS } from './species-catalog';
import { legalStatus } from './species-legal';
import { sheetRows, speciesSheet } from './species-sheet';
import { addWarnings, addWarningText } from './add-warnings';
import {
  ROUGE,
  SILHOUETTE_IDS,
  SPECIES,
  speciesVariantIndex,
  speciesVariants,
  validateSpecies,
  type SpeciesId,
} from './species';
import { WATER_TEMPERATURES } from './water';
import { freshPh, SPECIES_PH } from './water-ph';
import { advance, advanceInPlace, createDefaultWorld, createWorld } from './world';
import type { MutableWorld } from './world-types';

/**
 * Issue #654 : poisson rouge au bassin d'eau froide. Graines fixes, temps simulé uniquement.
 */
const SOURCE =
  /^https:\/\/(www\.)?(ornamentalfish\.org\/what-we-do\/\S+|fishkeeper\.co\.uk\/fish\/freshwater\/pond-fish\/goldfish-)/;

const TROPICAL_ONLY = (Object.keys(SPECIES) as SpeciesId[]).filter(
  (id) => livesIn('tropical', id) || livesIn('recif', id),
);

function pondWithGoldfish(seed: number, count: number): MutableWorld {
  return createWorld(
    seed,
    [
      { species: 'koi', count: 4 },
      { species: 'rouge', count },
    ],
    [],
    [],
    'bassin',
  ) as MutableWorld;
}

describe('poisson rouge (#654) : espèce et fiche', () => {
  it('dans SPECIES, définition valide, silhouette propre, libellés', () => {
    expect(SPECIES.rouge).toBe(ROUGE);
    expect(validateSpecies(ROUGE)).toEqual([]);
    expect(ROUGE.scientificName).toBe('Carassius auratus');
    expect(SILHOUETTE_IDS).toContain('rouge');
    const others = Object.values(SPECIES)
      .filter((def) => def.id !== 'rouge')
      .flatMap((def) => speciesVariants(def).map((v) => v.silhouette));
    expect(others).not.toContain('rouge');
    expect(SPECIES_LABELS.rouge).toEqual({
      singular: 'poisson rouge',
      plural: 'poissons rouges',
      feminine: false,
    });
    // Plus petit que la koï du jeu, plus grand que l'axolotl.
    expect(ROUGE.bodyLength).toBeLessThan(SPECIES.koi.bodyLength);
    expect(ROUGE.bodyLength).toBeGreaterThan(SPECIES.axolotl.bodyLength);
  });

  it('fiche complète : chaque champ sourcé (OATA, FishKeeper) ou approximation de jeu', () => {
    const sheet = speciesSheet('rouge');
    expect(sheet.species).toBe('rouge');
    for (const [name, field] of Object.entries({
      adultSize: sheet.adultSize,
      temperaturePreferred: sheet.temperaturePreferred,
      temperatureTolerated: sheet.temperatureTolerated,
      phPreferred: sheet.phPreferred,
      phTolerated: sheet.phTolerated,
      diet: sheet.diet,
      temperament: sheet.temperament,
      minGroup: sheet.minGroup,
      minLiters: sheet.minLiters,
      hardness: sheet.hardness,
      lifespan: sheet.lifespan,
      avoid: sheet.avoid,
    })) {
      expect(['source', 'approximation'], name).toContain(field.status.kind);
      if (field.status.kind === 'source') {
        expect(field.status.reference, name).toMatch(SOURCE);
      }
    }
    // Valeurs chiffrées des sources.
    expect(sheet.adultSize).toMatchObject({ value: 25, status: { kind: 'source' } });
    expect(sheet.temperatureTolerated.value).toEqual({ min: 4, max: 25 });
    expect(sheet.temperatureTolerated.status.kind).toBe('source');
    expect(sheet.minLiters).toMatchObject({ value: 100, status: { kind: 'source' } });
    expect(sheet.diet.value).toBe('omnivore');
    // Plage préférée choisie pour le jeu : approximation, comprise dans la tolérée.
    expect(sheet.temperaturePreferred.status.kind).toBe('approximation');
    const tp = sheet.temperaturePreferred.value;
    expect(tp.min).toBeGreaterThanOrEqual(4);
    expect(tp.max).toBeLessThanOrEqual(25);
    for (const row of sheetRows('rouge')) {
      expect(row.value.trim(), row.field).not.toBe('');
      expect(row.status.trim(), row.field).not.toBe('');
    }
    expect(sheet.notes.length).toBeGreaterThan(0);
    for (const note of sheet.notes) {
      expect(note.status.kind).toBe('source');
    }
  });

  it('eau du bassin et du bac d’eau froide dans les plages préférées, eau tropicale hors', () => {
    const sheet = speciesSheet('rouge');
    const tp = sheet.temperaturePreferred.value;
    for (const env of ['bassin', 'eaufroide'] as const) {
      const t = WATER_TEMPERATURES[env];
      expect(t, env).toBeGreaterThanOrEqual(tp.min);
      expect(t, env).toBeLessThanOrEqual(tp.max);
      const ph = SPECIES_PH.rouge;
      expect(freshPh(env)).toBeGreaterThanOrEqual(ph.ideal.min);
      expect(freshPh(env)).toBeLessThanOrEqual(ph.ideal.max);
    }
    for (const env of ['tropical', 'recif'] as const) {
      expect(WATER_TEMPERATURES[env], env).toBeGreaterThan(tp.max);
    }
  });

  it('statut légal à vérifier, jamais présenté comme confirmé ; ne jamais relâcher', () => {
    const legal = legalStatus('rouge');
    expect(legal.regime).toBe('a-verifier');
    expect(legal.confirmed).toBe(false);
    expect(legal.reference.trim()).not.toBe('');
    expect(legal.note).toContain('ne jamais relâcher');
  });

  it('diurne, banc lâche', () => {
    expect(DIURNAL.rouge).toBe(true);
    expect(ROUGE.schooling).not.toBeNull();
    expect(TEMPERAMENTS.rouge).toBe('paisible');
  });
});

describe('poisson rouge (#654) : compatibilité', () => {
  it('incompatible avec toutes les espèces tropicales (bac tropical et récif), symétrique', () => {
    expect(TROPICAL_ONLY.length).toBeGreaterThan(20);
    for (const id of TROPICAL_ONLY) {
      expect(compatibility('rouge', id), id).not.toBe('compatible');
      expect(compatibility(id, 'rouge'), id).toBe(compatibility('rouge', id));
      expect(speciesSheet('rouge').avoid.value, id).toContain(id);
    }
    // Les petites espèces tropicales paisibles : la température seule les sépare.
    for (const id of ['neon', 'guppy', 'xipho', 'molly', 'clown', 'chirurgien'] as const) {
      expect(compatibility('rouge', id), id).toBe('temperature');
    }
    expect(WATER_CLASSES.rouge).toBe('froide');
  });

  it('incompatible avec l’axolotl : il en mordille les branchies', () => {
    expect(EXTRA_PREDATORS.axolotl).toEqual(['rouge']);
    expect(compatibility('rouge', 'axolotl')).toBe('predateur');
    expect(compatibility('axolotl', 'rouge')).toBe('predateur');
    expect(eaterOf('axolotl', 'rouge')).toBe('rouge');
    expect(cohabitationReason('axolotl', 'rouge', 'predateur')).toBe(
      'les poissons rouges mangent ou blessent les axolotls, plus petits',
    );
    expect(mixWarnings(['axolotl', 'rouge'], { axolotl: 1, rouge: 4 })).toEqual([
      { first: 'axolotl', second: 'rouge', reason: 'predateur' },
    ]);
  });

  it('compatible avec les koïs : plage commune (eau froide), proie épargnée', () => {
    expect(SPARED_PREY.rouge).toEqual(['koi']);
    expect(WATER_CLASSES.koi).toBe('froide');
    expect(compatibility('koi', 'rouge')).toBe('compatible');
    expect(compatibility('rouge', 'koi')).toBe('compatible');
    expect(mixWarnings(POND.species, { koi: 7, rouge: 10 })).toEqual([]);
    // La koï reste prédatrice des autres petites espèces.
    expect(compatibility('koi', 'neon')).toBe('predateur');
    expect(compatibility('koi', 'axolotl')).toBe('predateur');
  });

  it('amphibiens du paludarium (eau tempérée) : compatibles', () => {
    for (const id of ['grenouille', 'triton'] as const) {
      expect(WATER_CLASSES[id]).toBe('temperee');
      expect(compatibility('rouge', id), id).toBe('compatible');
    }
  });

  it('texte des avertissements d’ajout : eau froide et eau tropicale', () => {
    const [warning] = addWarnings('rouge', 4, 1000, { rouge: 4, neon: 8 }, ['neon', 'rouge']);
    expect(warning).toEqual({
      kind: 'incompatible',
      species: 'rouge',
      other: 'neon',
      reason: 'temperature',
    });
    expect(addWarningText(warning)).toBe(
      'Poissons rouges déconseillés avec les néons (eau froide et eau tropicale)',
    );
    expect(cohabitationReason('rouge', 'neon', 'temperature')).toContain('eau froide');
  });
});

describe('poisson rouge (#654) : bassin et robes', () => {
  it('proposé au bassin et au bac d’eau froide (#862), absent de leur population de départ', () => {
    expect(POND.species).toEqual(['koi', 'rouge']);
    expect(POND.population.map((p) => p.species)).toEqual(['koi']);
    for (const env of Object.values(ENVIRONMENTS)) {
      expect(livesIn(env.id, 'rouge'), env.id).toBe(env.id === 'bassin' || env.id === 'eaufroide');
      expect(
        env.population.map((p) => p.species),
        env.id,
      ).not.toContain('rouge');
    }
    const entry = speciesCatalog('bassin').find((e) => e.species === 'rouge');
    expect(entry?.defaultCount).toBe(0);
    const world = createDefaultWorld(42, 'bassin');
    expect(world.entities.some((e) => e.species === 'rouge')).toBe(false);
  });

  it('trois robes tirées de la graine : déterministes, toutes présentes dès trois poissons', () => {
    expect(ROUGE.variantDraw).toBe('graine');
    expect(speciesVariants(ROUGE).map((v) => v.id)).toEqual(['commun', 'sarasa', 'jaune']);
    for (const seed of [0, 1, 42, 0xffffffff]) {
      const robes = Array.from({ length: 9 }, (_, id) => speciesVariantIndex(ROUGE, id, seed));
      expect(robes).toEqual(
        Array.from({ length: 9 }, (_, id) => speciesVariantIndex(ROUGE, id, seed)),
      );
      expect(new Set(robes.slice(0, 3))).toEqual(new Set([0, 1, 2]));
    }
    const draws = [1, 2, 3, 4, 5].map((seed) =>
      Array.from({ length: 9 }, (_, id) => speciesVariantIndex(ROUGE, id, seed)).join(''),
    );
    expect(new Set(draws).size).toBeGreaterThan(1);
  });

  it('robes lisibles sur l’eau du bassin : dos clair ou vif, jamais sombre', () => {
    // Luminance relative du dos (vu de dessus) bien au-dessus de celle d'une eau sombre.
    const luminance = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    for (const variant of speciesVariants(ROUGE)) {
      expect(luminance(variant.colors.back), variant.id).toBeGreaterThan(0.3);
    }
  });

  it('population à zéro ou au plafond : dans l’eau, déterministe', () => {
    const empty = pondWithGoldfish(42, 0);
    expect(empty.entities.filter((e) => e.species === 'rouge').length).toBe(0);
    const full = pondWithGoldfish(3, ROUGE.maxPopulation);
    expect(full.entities.filter((e) => e.species === 'rouge').length).toBe(ROUGE.maxPopulation);
    advanceInPlace(full, Math.round(30 / SIM_DT));
    const water = environmentWater('bassin');
    for (const fish of full.entities) {
      expect(Number.isFinite(fish.x) && Number.isFinite(fish.y) && Number.isFinite(fish.z)).toBe(
        true,
      );
      expect(fish.y).toBeGreaterThanOrEqual(water.minY);
      expect(fish.y).toBeLessThanOrEqual(water.maxY);
    }
    // Au-delà du plafond : borné par le réglage de population.
    const capped = setPopulation(createDefaultWorld(5, 'bassin'), 'rouge', 99);
    expect(populationCounts(capped).rouge).toBe(ROUGE.maxPopulation);
  });

  it('même graine, même trajectoire ; autre graine, autre trajectoire', () => {
    const [a, b, c] = [7, 7, 8].map((seed) => pondWithGoldfish(seed, 6));
    for (const w of [a, b, c]) {
      advanceInPlace(w, Math.round(20 / SIM_DT));
    }
    expect(a.entities).toEqual(b.entities);
    expect(a.entities.map((e) => e.x)).not.toEqual(c.entities.map((e) => e.x));
  });

  it('sauvegarde antérieure sans poisson rouge : relue telle quelle', () => {
    const world = advance(createDefaultWorld(1234, 'bassin'), 600);
    const text = serializeWorld(world);
    expect(text).not.toContain('"rouge"');
    const result = parseWorld(text);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.world).toEqual(world);
    expect(populationCounts(result.world).rouge).toBe(0);
    expect(serializeWorld(result.world)).toBe(text);
  });

  it('sauvegarde avec poissons rouges : robes et effectifs restitués', () => {
    const world = setPopulation(advance(createDefaultWorld(1234, 'bassin'), 60), 'rouge', 5);
    const result = parseWorld(serializeWorld(world));
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(populationCounts(result.world)).toEqual(populationCounts(world));
    expect(result.world.entities.map((f) => [f.id, f.species])).toEqual(
      world.entities.map((f) => [f.id, f.species]),
    );
  });
});
