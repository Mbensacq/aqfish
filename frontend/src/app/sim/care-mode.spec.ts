import {
  acceptsSavedSpecies,
  acceptsSpecies,
  careModeOf,
  isCareMode,
  setCareModeInPlace,
  speciesShownIn,
  type CareMode,
} from './care-mode';
import { ENVIRONMENT_IDS, environmentById, type EnvironmentId } from './environment';
import { isSpeciesId, MAX_TOTAL_FISH, NO_FISH, populationCounts, SPECIES_IDS } from './population';
import { createRoom, stepRoom } from './room-state';
import { parseSave, serializeRoom } from './room-save';
import { parseWorld, serializeWorld } from './save';
import { applySpeciesCounts, decorCatalog, speciesCatalog } from './species-catalog';
import { isExcluded } from './species-legal';
import { SPECIES } from './species';
import { worstAlert } from './tank-list';
import { sampleWater } from './water-quality';
import {
  advance,
  boundsFor,
  cloneWorld,
  createDefaultWorld,
  feed,
  starveWorld,
  type MutableWorld,
  type World,
} from './world';

/** Monde de `world` au mode `mode` (copie). */
function withMode(world: World, mode: CareMode): MutableWorld {
  const next = cloneWorld(world);
  setCareModeInPlace(next, mode);
  return next;
}

/** État de soin d'un monde : eau, faim et santé de chaque animal. */
function careState(world: World): unknown {
  return {
    water: world.water,
    animals: world.entities.map((fish) => [fish.id, fish.hunger, fish.health]),
  };
}

/** Bac tropical à l'eau dégradée et aux animaux affamés : tout y évolue en mode soins. */
function troubledWorld(seed = 7): World {
  const world = cloneWorld(starveWorld(advance(createDefaultWorld(seed), 120)));
  world.water = sampleWater('tropical', 'mauvaise');
  return world;
}

describe('mode du bac (#278)', () => {
  it('reconnaît les modes, soins par défaut', () => {
    expect(isCareMode('soins')).toBe(true);
    expect(isCareMode('decor')).toBe(true);
    expect(isCareMode('Décor')).toBe(false);
    expect(isCareMode(undefined)).toBe(false);
    expect(careModeOf(createDefaultWorld(1))).toBe('soins');
    expect(createDefaultWorld(1).careMode).toBeUndefined();
  });

  it('setCareModeInPlace : soins sans champ tant que le bac n’est pas passé par le décor', () => {
    const world = cloneWorld(createDefaultWorld(3));
    setCareModeInPlace(world, 'soins');
    expect(world.careMode).toBeUndefined();
    setCareModeInPlace(world, 'decor');
    expect(world.careMode).toBe('decor');
    setCareModeInPlace(world, 'soins');
    expect(world.careMode).toBe('soins');
    expect(() => setCareModeInPlace(world, 'aquarium' as CareMode)).toThrow(RangeError);
    expect(world.careMode).toBe('soins');
  });

  it('en mode décor, l’eau, la faim et la santé n’évoluent pas ; les animaux nagent', () => {
    const start = withMode(troubledWorld(), 'decor');
    const later = advance(start, 600);
    expect(careState(later)).toEqual(careState(start));
    expect(later.tick).toBe(start.tick + 600);
    expect(later.entities.map((fish) => fish.x)).not.toEqual(start.entities.map((fish) => fish.x));
    // En mode soins, le même bac évolue (sinon le test ne prouverait rien).
    expect(careState(advance(troubledWorld(), 600))).not.toEqual(careState(troubledWorld()));
  });

  it('en mode décor, aucune alerte, même eau mauvaise et animaux affamés', () => {
    expect(worstAlert(troubledWorld())).not.toBeNull();
    expect(worstAlert(withMode(troubledWorld(), 'decor'))).toBeNull();
  });

  it('en mode décor, la nourriture reste visuelle : la faim ne baisse pas', () => {
    const start = withMode(troubledWorld(), 'decor');
    const fed = advance(feed(start, 0, 0), 400);
    expect(fed.entities.map((fish) => fish.hunger)).toEqual(
      start.entities.map((fish) => fish.hunger),
    );
  });

  it('aller-retour Soins → Décor → Soins : l’état de soin reprend où il était', () => {
    const before = troubledWorld(11);
    const paused = advance(withMode(before, 'decor'), 900);
    const back = withMode(paused, 'soins');
    expect(back.careMode).toBe('soins');
    expect(careState(back)).toEqual(careState(before));
    // Puis le bac évolue de nouveau, comme le bac qui n’est jamais passé par le décor.
    const resumed = advance(back, 300);
    expect(careState(resumed)).not.toEqual(careState(before));
    expect(resumed.water).toEqual(advance(before, 300).water);
  });

  it('déterminisme : même graine, même découpage indifférent, en mode décor', () => {
    const start = withMode(createDefaultWorld(5, 'recif'), 'decor');
    const once = advance(start, 500);
    expect(advance(start, 500)).toEqual(once);
    expect(advance(advance(start, 123), 377)).toEqual(once);
  });

  it('mode soins explicite : le bac avance exactement comme sans champ', () => {
    const plain = troubledWorld(13);
    const explicit = withMode(withMode(plain, 'decor'), 'soins');
    const a = advance(plain, 400);
    const b = advance(explicit, 400);
    expect({ ...b, careMode: undefined }).toEqual({ ...a, careMode: undefined });
  });

  it('acceptsSpecies : toute espèce en décor, celles de l’environnement en soins', () => {
    for (const environment of ENVIRONMENT_IDS) {
      const world = createDefaultWorld(1, environment);
      const decor = withMode(world, 'decor');
      for (const species of SPECIES_IDS) {
        expect(acceptsSpecies(decor, species)).toBe(true);
        expect(acceptsSpecies(world, species)).toBe(
          environmentById(environment).species.includes(species),
        );
      }
    }
    expect(acceptsSavedSpecies('recif', undefined, 'koi')).toBe(false);
    expect(acceptsSavedSpecies('recif', 'soins', 'koi')).toBe(true);
  });

  it('en mode décor, une espèce d’eau douce s’ajoute au récif ; refusée en mode soins', () => {
    const reef = createDefaultWorld(2, 'recif');
    const request = [{ species: 'koi', count: 2 }];
    expect(populationCounts(applySpeciesCounts(reef, request)).koi).toBe(0);
    const decor = applySpeciesCounts(withMode(reef, 'decor'), request);
    expect(populationCounts(decor).koi).toBe(2);
    expect(speciesShownIn(environmentById('recif').species, populationCounts(decor))).toEqual([
      ...environmentById('recif').species,
      'koi',
    ]);
  });

  it('en mode décor, chaque espèce vit dans chaque bac, vide au départ ou non', () => {
    for (const environment of ENVIRONMENT_IDS) {
      const empty = cloneWorld(createDefaultWorld(9, environment));
      empty.entities = [];
      const decor = applySpeciesCounts(
        withMode(empty, 'decor'),
        SPECIES_IDS.map((species) => ({ species, count: 1 })),
      );
      expect(decor.entities).toHaveLength(Math.min(SPECIES_IDS.length, MAX_TOTAL_FISH));
      const later = advance(decor, 300);
      for (const fish of later.entities) {
        const hard = boundsFor(fish.species, later).hard;
        expect([fish.x, fish.y, fish.z].every(Number.isFinite)).toBe(true);
        expect(fish.x).toBeGreaterThanOrEqual(hard.minX - 1e-6);
        expect(fish.x).toBeLessThanOrEqual(hard.maxX + 1e-6);
        expect(fish.y).toBeGreaterThanOrEqual(hard.minY - 1e-6);
        expect(fish.y).toBeLessThanOrEqual(hard.maxY + 1e-6);
      }
    }
  });

  it('catalogue du décor : toutes les espèces, celles du bac d’abord, aucune exclue (#262)', () => {
    for (const environment of ENVIRONMENT_IDS) {
      const catalog = decorCatalog(environment);
      const own = speciesCatalog(environment);
      expect(catalog.slice(0, own.length)).toEqual(own);
      expect(new Set(catalog.map((entry) => entry.species))).toEqual(new Set(SPECIES_IDS));
      expect(catalog.every((entry) => isSpeciesId(entry.species))).toBe(true);
      expect(catalog.some((entry) => isExcluded(entry.scientificName))).toBe(false);
      expect(decorCatalog(environment)).toBe(catalog);
    }
    expect(Object.values(SPECIES).some((def) => isExcluded(def.scientificName))).toBe(false);
  });

  it('speciesShownIn : celles de l’environnement sans animal d’un autre milieu', () => {
    const own = environmentById('tropical').species;
    expect(speciesShownIn(own, NO_FISH)).toBe(own);
  });
});

describe('sauvegarde du mode (#278)', () => {
  const decorReef = (): World =>
    applySpeciesCounts(withMode(createDefaultWorld(4, 'recif'), 'decor'), [
      { species: 'koi', count: 1 },
      { species: 'neon', count: 3 },
    ]);

  it('schéma 1 : aller-retour d’un bac en mode décor avec des espèces d’eau douce', () => {
    const world = decorReef();
    const text = serializeWorld(world);
    const back = parseWorld(text);
    expect(back.ok).toBe(true);
    if (back.ok) {
      expect(back.world.careMode).toBe('decor');
      expect(back.world).toEqual(world);
      expect(serializeWorld(back.world)).toBe(text);
    }
  });

  it('ancienne sauvegarde sans mode : mode soins, champ absent, validation stricte', () => {
    const text = serializeWorld(createDefaultWorld(4));
    expect(text).not.toContain('careMode');
    const back = parseWorld(text);
    expect(back.ok && back.world.careMode).toBe(undefined);
  });

  it('retour en mode soins : les animaux d’un autre milieu sont gardés et relus', () => {
    const world = withMode(decorReef(), 'soins');
    const back = parseWorld(serializeWorld(world));
    expect(back.ok).toBe(true);
    if (back.ok) {
      expect(back.world.careMode).toBe('soins');
      expect(populationCounts(back.world).koi).toBe(1);
    }
  });

  it('refuse un mode inconnu', () => {
    const data = JSON.parse(serializeWorld(decorReef())) as Record<string, unknown>;
    data['careMode'] = 'jardin';
    const back = parseWorld(JSON.stringify(data));
    expect(back.ok).toBe(false);
    if (!back.ok) {
      expect(back.error).toMatch(/mode de bac inconnu/);
    }
  });

  it('schéma 2 : chaque bac de la pièce garde son mode', () => {
    const environments: EnvironmentId[] = ['tropical', 'recif'];
    const room = createRoom(21, environments);
    const tanks = room.tanks.map((tank) =>
      tank.id === 1 ? { ...tank, world: withMode(tank.world, 'decor') } : tank,
    );
    const mixed = stepRoom({ ...room, tanks }, 50);
    const text = serializeRoom(mixed, 0);
    const back = parseSave(text);
    expect(back.ok).toBe(true);
    if (back.ok) {
      expect(back.room.tanks.map((tank) => careModeOf(tank.world))).toEqual(['soins', 'decor']);
      expect(back.room.tanks[0]?.world.careMode).toBeUndefined();
      expect(serializeRoom(back.room, 0)).toBe(text);
    }
    // Le bac en décor n’a pas bougé en soin, l’autre si.
    expect(careState(mixed.tanks[1]!.world)).toEqual(careState(tanks[1]!.world));
  });
});
