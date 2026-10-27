import { ENVIRONMENT_IDS, environmentById, type EnvironmentId } from './environment';
import { MAX_TOTAL_FISH, populationCounts, setPopulation, SPECIES_IDS } from './population';
import { parseWorld, serializeWorld } from './save';
import {
  applySpeciesCounts,
  applySpeciesCountsInPlace,
  normalizedCount,
  SPECIES_LABELS,
  speciesCatalog,
} from './species-catalog';
import { SPECIES } from './species';
import { advance, cloneWorld, createDefaultWorld, type World } from './world';

const ids = (env: EnvironmentId) => speciesCatalog(env).map((entry) => entry.species);

describe('catalogue d’espèces (#189)', () => {
  it('liste les espèces de chaque environnement, dans l’ordre du panneau', () => {
    expect(ids('tropical')).toEqual(['neon', 'guppy', 'corydora']);
    expect(ids('bassin')).toEqual(['koi']);
    expect(ids('paludarium')).toEqual(['axolotl', 'grenouille', 'triton']);
    expect(ids('recif')).toEqual(['clown', 'chirurgien']);
    for (const env of ENVIRONMENT_IDS) {
      expect(ids(env)).toEqual(environmentById(env).species);
    }
  });

  it('chaque entrée porte nom, nom scientifique, libellés, effectif par défaut et maximum', () => {
    for (const env of ENVIRONMENT_IDS) {
      const population = environmentById(env).population;
      for (const entry of speciesCatalog(env)) {
        const def = SPECIES[entry.species];
        expect(entry.name).toBe(def.name);
        expect(entry.scientificName).toBe(def.scientificName);
        expect(entry.labels).toBe(SPECIES_LABELS[entry.species]);
        expect(entry.maxCount).toBe(def.maxPopulation);
        expect(entry.defaultCount).toBe(
          population.find((p) => p.species === entry.species)?.count ?? 0,
        );
        expect(entry.defaultCount).toBeLessThanOrEqual(entry.maxCount);
      }
    }
  });

  it('résultat figé et partagé ; environnement inconnu refusé', () => {
    const catalog = speciesCatalog('tropical');
    expect(speciesCatalog('tropical')).toBe(catalog);
    expect(Object.isFrozen(catalog)).toBe(true);
    expect(Object.isFrozen(catalog[0])).toBe(true);
    expect(() => speciesCatalog('desert' as EnvironmentId)).toThrow(RangeError);
    expect(() => speciesCatalog('constructor' as EnvironmentId)).toThrow(RangeError);
  });

  it('libellés : une entrée par espèce, minuscules, genre et pluriels irréguliers', () => {
    expect(Object.keys(SPECIES_LABELS).sort()).toEqual([...SPECIES_IDS].sort());
    for (const id of SPECIES_IDS) {
      const labels = SPECIES_LABELS[id];
      expect(labels.singular).toBe(SPECIES[id].name.toLowerCase());
      expect(labels.plural).toBe(labels.plural.toLowerCase());
      expect(labels.plural).not.toBe(labels.singular);
    }
    // Plus aucune espèce au nom féminin depuis #270 (« grenouille » → sonneur oriental).
    expect(SPECIES_LABELS.grenouille).toEqual({
      singular: 'sonneur oriental',
      plural: 'sonneurs orientaux',
      feminine: false,
    });
    expect(SPECIES_LABELS.triton.plural).toBe('tritons à ventre de feu');
    expect(SPECIES_LABELS.clown.plural).toBe('poissons-clowns');
    expect(SPECIES_LABELS.chirurgien.plural).toBe('chirurgiens bleus');
  });

  it('normalizedCount : arrondi, 0 au moins, null si non fini', () => {
    expect(normalizedCount(0)).toBe(0);
    expect(normalizedCount(7)).toBe(7);
    expect(normalizedCount(2.4)).toBe(2);
    expect(normalizedCount(2.6)).toBe(3);
    expect(normalizedCount(-5)).toBe(0);
    expect(normalizedCount(1e9)).toBe(1e9);
    for (const value of [Number.NaN, Infinity, -Infinity, '3' as unknown as number]) {
      expect(normalizedCount(value)).toBeNull();
    }
  });
});

describe('applySpeciesCounts (#189)', () => {
  it('effectif 0 : l’espèce disparaît, les autres sont intactes', () => {
    const world = createDefaultWorld(42);
    const next = applySpeciesCounts(world, [{ species: 'neon', count: 0 }]);
    expect(populationCounts(next).neon).toBe(0);
    expect(next.entities).toEqual(world.entities.filter((e) => e.species !== 'neon'));
  });

  it('au-delà du maximum : ramené au maximum de l’espèce', () => {
    const next = applySpeciesCounts(createDefaultWorld(42), [{ species: 'corydora', count: 999 }]);
    expect(populationCounts(next).corydora).toBe(SPECIES.corydora.maxPopulation);
  });

  it('total borné à MAX_TOTAL_FISH, dans l’ordre de la demande', () => {
    const world = createDefaultWorld(42);
    const applied = applySpeciesCountsInPlace(world, [
      { species: 'neon', count: 999 },
      { species: 'guppy', count: 999 },
      { species: 'corydora', count: 999 },
    ]);
    const counts = populationCounts(world);
    expect(counts.neon + counts.guppy + counts.corydora).toBe(MAX_TOTAL_FISH);
    expect(counts.neon).toBe(SPECIES.neon.maxPopulation);
    expect(applied).toEqual([
      { species: 'neon', count: counts.neon },
      { species: 'guppy', count: counts.guppy },
      { species: 'corydora', count: counts.corydora },
    ]);
  });

  it('espèce inconnue, hors de l’environnement ou nombre non fini : ignorée sans erreur', () => {
    const world = createDefaultWorld(42);
    const before = cloneWorld(world);
    const applied = applySpeciesCountsInPlace(world, [
      { species: 'requin', count: 3 },
      { species: 'constructor', count: 3 },
      { species: '__proto__', count: 3 },
      { species: 'koi', count: 3 },
      { species: 'neon', count: Number.NaN },
      { species: 'guppy', count: Infinity },
    ]);
    expect(applied).toEqual([]);
    expect(world).toEqual(before);
  });

  it('nombre négatif ou décimal : arrondi et ramené à 0 au moins', () => {
    const next = applySpeciesCounts(createDefaultWorld(42), [
      { species: 'neon', count: -4 },
      { species: 'guppy', count: 3.6 },
    ]);
    expect(populationCounts(next).neon).toBe(0);
    expect(populationCounts(next).guppy).toBe(4);
  });

  it('pure : le monde d’origine n’est pas modifié', () => {
    const world = createDefaultWorld(7, 'recif');
    const before = cloneWorld(world);
    applySpeciesCounts(world, [{ species: 'clown', count: 0 }]);
    expect(world).toEqual(before);
  });

  it('équivaut à setPopulation appliqué dans le même ordre', () => {
    const world = createDefaultWorld(42);
    expect(
      applySpeciesCounts(world, [
        { species: 'corydora', count: 12 },
        { species: 'neon', count: 5 },
      ]),
    ).toEqual(setPopulation(setPopulation(world, 'corydora', 12), 'neon', 5));
  });

  it('même graine et mêmes effectifs : même simulation ; autre graine : autre simulation', () => {
    const run = (seed: number): World =>
      advance(
        applySpeciesCounts(createDefaultWorld(seed), [
          { species: 'corydora', count: 12 },
          { species: 'neon', count: 5 },
        ]),
        5,
      );
    expect(run(42)).toEqual(run(42));
    expect(run(43).entities).not.toEqual(run(42).entities);
  });

  it('effectifs par défaut redemandés : monde inchangé', () => {
    for (const env of ENVIRONMENT_IDS) {
      const world = createDefaultWorld(42, env);
      const requests = speciesCatalog(env).map((e) => ({
        species: e.species,
        count: e.defaultCount,
      }));
      expect(applySpeciesCounts(world, requests)).toEqual(world);
    }
  });
});

describe('effectifs et sauvegarde (#189)', () => {
  it('aller-retour export / import : effectifs et poissons conservés', () => {
    const world = advance(
      applySpeciesCounts(createDefaultWorld(42), [
        { species: 'corydora', count: 14 },
        { species: 'neon', count: 6 },
        { species: 'guppy', count: 0 },
      ]),
      3,
    );
    const result = parseWorld(serializeWorld(world));
    if (!result.ok) {
      throw new Error(result.error);
    }
    expect(populationCounts(result.world)).toEqual(populationCounts(world));
    expect(result.world.entities).toEqual(world.entities);
    expect(result.world.nextFishId).toBe(world.nextFishId);
  });

  it('ancienne sauvegarde (sans rendu des granulés ni pièce) : acceptée, effectifs relus', () => {
    const world = applySpeciesCounts(createDefaultWorld(42), [{ species: 'corydora', count: 9 }]);
    const data = JSON.parse(serializeWorld(world)) as { settings: Record<string, unknown> };
    delete data.settings['foodStyle'];
    delete data.settings['room'];
    const result = parseWorld(JSON.stringify(data));
    if (!result.ok) {
      throw new Error(result.error);
    }
    expect(populationCounts(result.world)).toEqual(populationCounts(world));
    expect(populationCounts(result.world).corydora).toBe(9);
  });
});
