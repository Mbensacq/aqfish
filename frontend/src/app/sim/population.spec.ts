import { DEFAULT_DECOR } from './decor';
import { obstacleDistance } from './obstacles';
import {
  isSpeciesId,
  MAX_TOTAL_FISH,
  NO_FISH,
  populationCounts,
  populationLimit,
  populationLimits,
  setPopulation,
  setPopulationInPlace,
  SPECIES_IDS,
} from './population';
import {
  AXOLOTL,
  CHIRURGIEN,
  CLOWN,
  CORYDORA,
  GRENOUILLE,
  TRITON,
  GUPPY,
  KOI,
  NEON,
  SPECIES,
  type SpeciesId,
  GOURAMI,
  KUHLI,
  RASBORA,
  TETRA,
} from './species';
import { waterVolume } from './tank';
import {
  advance,
  boundsFor,
  cloneWorld,
  createDefaultWorld,
  createWorld,
  feed,
  type World,
} from './world';

const of = (world: World, species: SpeciesId) =>
  world.entities.filter((e) => e.species === species);

describe('bornes de population', () => {
  it('chaque espèce a un maximum entier, au moins égal à sa population par défaut', () => {
    for (const def of Object.values(SPECIES)) {
      expect(Number.isInteger(def.maxPopulation)).toBe(true);
      expect(def.maxPopulation).toBeGreaterThanOrEqual(def.defaultPopulation);
    }
  });

  it('la population par défaut tient sous le total maximal', () => {
    expect(createDefaultWorld(42).entities.length).toBeLessThanOrEqual(MAX_TOTAL_FISH);
  });

  it('SPECIES_IDS suit l’ordre de SPECIES', () => {
    expect(SPECIES_IDS).toEqual([
      'neon',
      'guppy',
      'corydora',
      'koi',
      'axolotl',
      'grenouille',
      'triton',
      'clown',
      'chirurgien',
      'rasbora',
      'tetra',
      'kuhli',
      'gourami',
    ]);
  });

  it.each(['neon', 'guppy', 'corydora'])('isSpeciesId accepte %s', (id) => {
    expect(isSpeciesId(id)).toBe(true);
  });

  it.each(['requin', '', 'constructor', 'toString', 42, null, undefined])(
    'isSpeciesId refuse %s',
    (id) => {
      expect(isSpeciesId(id)).toBe(false);
    },
  );

  it('populationCounts compte chaque espèce, zéro compris', () => {
    expect(populationCounts(createDefaultWorld(42))).toEqual({
      neon: NEON.defaultPopulation,
      guppy: GUPPY.defaultPopulation,
      corydora: CORYDORA.defaultPopulation,
      koi: 0,
      axolotl: 0,
      grenouille: 0,
      triton: 0,
      clown: 0,
      chirurgien: 0,
      rasbora: 0,
      tetra: 0,
      kuhli: 0,
      gourami: 0,
    });
    expect(populationCounts(createWorld(42))).toEqual({
      neon: 0,
      guppy: 0,
      corydora: 0,
      koi: 0,
      axolotl: 0,
      grenouille: 0,
      triton: 0,
      clown: 0,
      chirurgien: 0,
      rasbora: 0,
      tetra: 0,
      kuhli: 0,
      gourami: 0,
    });
    expect(populationCounts(createWorld(42))).toEqual(NO_FISH);
  });

  it('populationLimit : maximum de l’espèce dans un bac peu peuplé', () => {
    expect(populationLimits(createDefaultWorld(42))).toEqual({
      neon: NEON.maxPopulation,
      guppy: GUPPY.maxPopulation,
      corydora: CORYDORA.maxPopulation,
      koi: KOI.maxPopulation,
      axolotl: AXOLOTL.maxPopulation,
      grenouille: GRENOUILLE.maxPopulation,
      triton: TRITON.maxPopulation,
      clown: CLOWN.maxPopulation,
      chirurgien: CHIRURGIEN.maxPopulation,
      rasbora: RASBORA.maxPopulation,
      tetra: TETRA.maxPopulation,
      kuhli: KUHLI.maxPopulation,
      gourami: GOURAMI.maxPopulation,
    });
  });

  it('populationLimit : place laissée par les autres espèces sous le total maximal', () => {
    let world = setPopulation(createWorld(42, [], [], DEFAULT_DECOR), 'neon', NEON.maxPopulation);
    world = setPopulation(world, 'corydora', CORYDORA.maxPopulation);
    expect(populationLimit(world, 'guppy')).toBe(
      MAX_TOTAL_FISH - NEON.maxPopulation - CORYDORA.maxPopulation,
    );
  });

  it('populationLimit n’est jamais négatif, même au-delà du total (monde créé à la main)', () => {
    const world = createWorld(42, [{ species: 'neon', count: MAX_TOTAL_FISH + 5 }]);
    expect(populationLimit(world, 'guppy')).toBe(0);
  });

  it('populationLimit refuse une espèce inconnue', () => {
    expect(() => populationLimit(createWorld(42), 'requin' as SpeciesId)).toThrow(RangeError);
  });
});

describe('setPopulation', () => {
  it('ajoute des poissons de l’espèce, avec des identifiants neufs, en fin de tableau', () => {
    const world = createDefaultWorld(42);
    const next = setPopulation(world, 'neon', NEON.defaultPopulation + 3);
    expect(populationCounts(next).neon).toBe(NEON.defaultPopulation + 3);
    const added = next.entities.slice(world.entities.length);
    expect(added.map((e) => [e.id, e.species])).toEqual([
      [world.entities.length, 'neon'],
      [world.entities.length + 1, 'neon'],
      [world.entities.length + 2, 'neon'],
    ]);
    expect(next.nextFishId).toBe(world.entities.length + 3);
    // Les poissons déjà là sont inchangés.
    expect(next.entities.slice(0, world.entities.length)).toEqual(world.entities);
  });

  it('ne modifie jamais le monde d’origine', () => {
    const world = createDefaultWorld(42);
    const copy = structuredClone(world);
    setPopulation(world, 'neon', 30);
    setPopulation(world, 'guppy', 0);
    expect(world).toEqual(copy);
  });

  it('retire les poissons les plus récents de l’espèce, sans toucher aux autres', () => {
    const world = advance(createDefaultWorld(42), 120);
    const next = setPopulation(world, 'guppy', 2);
    const guppies = of(world, 'guppy');
    expect(of(next, 'guppy')).toEqual(guppies.slice(0, 2));
    expect(of(next, 'neon')).toEqual(of(world, 'neon'));
    expect(of(next, 'corydora')).toEqual(of(world, 'corydora'));
    expect(next.nextFishId).toBe(world.nextFishId);
  });

  it('zéro poisson : retire toute l’espèce, puis la repeuple avec des identifiants neufs', () => {
    const world = createDefaultWorld(42);
    const empty = setPopulation(world, 'corydora', 0);
    expect(of(empty, 'corydora')).toEqual([]);
    expect(empty.entities.length).toBe(world.entities.length - CORYDORA.defaultPopulation);
    const again = setPopulation(empty, 'corydora', 1);
    expect(of(again, 'corydora').map((e) => e.id)).toEqual([world.entities.length]);
  });

  it('bac vide : tout retirer puis ajouter fonctionne', () => {
    let world: World = createDefaultWorld(7);
    for (const id of SPECIES_IDS) {
      world = setPopulation(world, id, 0);
    }
    expect(world.entities).toEqual([]);
    world = setPopulation(world, 'guppy', 3);
    expect(populationCounts(world)).toEqual({
      neon: 0,
      guppy: 3,
      corydora: 0,
      koi: 0,
      axolotl: 0,
      grenouille: 0,
      triton: 0,
      clown: 0,
      chirurgien: 0,
      rasbora: 0,
      tetra: 0,
      kuhli: 0,
      gourami: 0,
    });
  });

  it('même effectif : monde inchangé', () => {
    const world = createDefaultWorld(42);
    expect(setPopulation(world, 'neon', NEON.defaultPopulation)).toEqual(world);
  });

  it.each(SPECIES_IDS)('maximum de %s : une demande au-delà est ramenée à la borne', (id) => {
    const max = SPECIES[id].maxPopulation;
    const world = setPopulation(createWorld(42, [], [], DEFAULT_DECOR), id, max + 100);
    expect(populationCounts(world)[id]).toBe(max);
    expect(populationCounts(setPopulation(world, id, Number.MAX_SAFE_INTEGER))[id]).toBe(max);
  });

  it('total borné : l’ajout s’arrête à MAX_TOTAL_FISH, selon l’ordre des réglages', () => {
    const base = createDefaultWorld(42);
    let world = setPopulation(base, 'neon', NEON.maxPopulation);
    world = setPopulation(world, 'guppy', GUPPY.maxPopulation);
    world = setPopulation(world, 'corydora', CORYDORA.maxPopulation);
    expect(world.entities.length).toBe(MAX_TOTAL_FISH);
    expect(populationCounts(world)).toEqual({
      neon: NEON.maxPopulation,
      guppy: MAX_TOTAL_FISH - NEON.maxPopulation - CORYDORA.defaultPopulation,
      corydora: CORYDORA.defaultPopulation,
      koi: 0,
      axolotl: 0,
      grenouille: 0,
      triton: 0,
      clown: 0,
      chirurgien: 0,
      rasbora: 0,
      tetra: 0,
      kuhli: 0,
      gourami: 0,
    });
    // Bac plein : plus aucun ajout possible, quelle que soit l'espèce.
    for (const id of SPECIES_IDS) {
      expect(populationLimit(world, id)).toBe(populationCounts(world)[id]);
    }
  });

  it.each([1.5, -1, -0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'refuse l’effectif invalide %s, monde inchangé',
    (count) => {
      const world = createDefaultWorld(42);
      const copy = structuredClone(world);
      const mutable = cloneWorld(world);
      expect(() => setPopulation(world, 'neon', count)).toThrow(RangeError);
      expect(() => setPopulationInPlace(mutable, 'neon', count)).toThrow(RangeError);
      expect(mutable).toEqual(copy);
    },
  );

  it.each(['requin', 'constructor'])('refuse l’espèce inconnue %s, monde inchangé', (id) => {
    const mutable = cloneWorld(createDefaultWorld(42));
    const copy = structuredClone(mutable);
    expect(() => setPopulationInPlace(mutable, id as SpeciesId, 3)).toThrow(RangeError);
    expect(mutable).toEqual(copy);
  });

  it('setPopulationInPlace renvoie l’effectif obtenu (borné)', () => {
    const world = cloneWorld(createDefaultWorld(42));
    expect(setPopulationInPlace(world, 'guppy', 999)).toBe(GUPPY.maxPopulation);
    expect(setPopulationInPlace(world, 'guppy', 0)).toBe(0);
    expect(setPopulationInPlace(world, 'neon', 13)).toBe(13);
  });

  it('ne remet pas la simulation à zéro : temps, décor, obstacles et nourriture conservés', () => {
    const world = advance(feed(createDefaultWorld(42), 0, 0), 300);
    const next = setPopulation(setPopulation(world, 'neon', 30), 'corydora', 0);
    expect(next.tick).toBe(world.tick);
    expect(next.time).toBe(world.time);
    expect(next.seed).toBe(world.seed);
    expect(next.decor).toEqual(world.decor);
    expect(next.obstacles).toEqual(world.obstacles);
    expect(next.food).toEqual(world.food);
    expect(next.nextFoodId).toBe(world.nextFoodId);
  });
});

describe('naissance des poissons ajoutés', () => {
  // Graines variées, population maximale de chaque espèce : aucun poisson dans un rocher ni
  // dans une plante, tous dans leur zone de naissance (profondeur préférée comprise).
  it.each([1, 42, 7, 2024, 99999, 0xffffffff])('graine %s : position valide', (seed) => {
    for (const id of SPECIES_IDS) {
      const base = createDefaultWorld(seed);
      const world = setPopulation(setPopulation(base, id, 0), id, SPECIES[id].maxPopulation);
      const { spawn } = boundsFor(id);
      const added = of(world, id);
      expect(added.length).toBe(SPECIES[id].maxPopulation);
      for (const fish of added) {
        expect(fish.x).toBeGreaterThanOrEqual(spawn.minX);
        expect(fish.x).toBeLessThanOrEqual(spawn.maxX);
        expect(fish.y).toBeGreaterThanOrEqual(spawn.minY);
        expect(fish.y).toBeLessThanOrEqual(spawn.maxY);
        expect(fish.z).toBeGreaterThanOrEqual(spawn.minZ);
        expect(fish.z).toBeLessThanOrEqual(spawn.maxZ);
        for (const o of world.obstacles) {
          const d = obstacleDistance(o, fish.x, fish.y, fish.z, { x: 0, y: 0, z: 0 });
          expect(d).toBeGreaterThanOrEqual(0);
        }
        // Pas de saut d'interpolation à la première image : pose précédente = pose courante.
        expect([fish.px, fish.py, fish.pz]).toEqual([fish.x, fish.y, fish.z]);
      }
    }
  });

  it('les corydoras ajoutés naissent près du fond (profondeur préférée)', () => {
    const world = setPopulation(createDefaultWorld(42), 'corydora', CORYDORA.maxPopulation);
    const preferred = boundsFor('corydora').preferredMaxY;
    expect(Number.isFinite(preferred)).toBe(true);
    for (const fish of of(world, 'corydora')) {
      expect(fish.y).toBeLessThanOrEqual(preferred);
    }
  });
});

describe('déterminisme', () => {
  function scenario(seed: number): World {
    let world: World = createDefaultWorld(seed);
    world = setPopulation(world, 'neon', 20);
    world = setPopulation(world, 'guppy', 0);
    world = advance(world, 120);
    world = setPopulation(world, 'corydora', 10);
    world = setPopulation(world, 'neon', 5);
    world = setPopulation(world, 'guppy', 4);
    return advance(world, 120);
  }

  it('même graine et même séquence de réglages : même monde', () => {
    expect(JSON.stringify(scenario(42))).toBe(JSON.stringify(scenario(42)));
  });

  it('graines différentes : mondes différents', () => {
    expect(JSON.stringify(scenario(42))).not.toBe(JSON.stringify(scenario(43)));
  });

  it('identifiants jamais réutilisés après un retrait', () => {
    const world = scenario(42);
    const ids = world.entities.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort((a, b) => a - b)).toEqual(ids);
    expect(Math.max(...ids)).toBeLessThan(world.nextFishId);
  });

  it('ajouter ou retirer une autre espèce ne change pas la trajectoire des néons (à l’identique)', () => {
    const start = advance(createDefaultWorld(42), 300);
    const untouched = advance(start, 600);
    let changed = setPopulation(start, 'corydora', CORYDORA.maxPopulation);
    changed = setPopulation(changed, 'guppy', 0);
    changed = advance(changed, 300);
    changed = setPopulation(changed, 'guppy', GUPPY.maxPopulation);
    changed = advance(changed, 300);
    expect(of(changed, 'neon')).toEqual(of(untouched, 'neon'));
  });

  it('ajouter des néons ne change pas la trajectoire des guppys ni des corydoras', () => {
    const start = advance(createDefaultWorld(42), 300);
    const untouched = advance(start, 300);
    const changed = advance(setPopulation(start, 'neon', NEON.maxPopulation), 300);
    expect(of(changed, 'guppy')).toEqual(of(untouched, 'guppy'));
    expect(of(changed, 'corydora')).toEqual(of(untouched, 'corydora'));
  });

  it('population maximale : 600 pas sans sortir de l’eau', () => {
    let world: World = createDefaultWorld(42);
    for (const id of SPECIES_IDS) {
      world = setPopulation(world, id, SPECIES[id].maxPopulation);
    }
    expect(world.entities.length).toBe(MAX_TOTAL_FISH);
    world = advance(world, 600);
    const water = waterVolume();
    for (const fish of world.entities) {
      expect(fish.x).toBeGreaterThanOrEqual(water.minX);
      expect(fish.x).toBeLessThanOrEqual(water.maxX);
      expect(fish.y).toBeGreaterThanOrEqual(water.minY);
      expect(fish.y).toBeLessThanOrEqual(water.maxY);
    }
    // Délai explicite (docs/PIEGES.md, « délai Vitest ») : aucune borne de durée mesurée.
  }, 15_000);
});
