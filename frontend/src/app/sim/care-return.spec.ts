import { setCareModeInPlace } from './care-mode';
import {
  returnToCareInPlace,
  unsuitableAnimals,
  unsuitableLine,
  unsuitableReasonText,
  type CareReturnTank,
  type UnsuitableAnimal,
} from './care-return';
import { mixWarnings } from './compatibility';
import {
  ENVIRONMENT_IDS,
  environmentById,
  environmentWater,
  type EnvironmentId,
} from './environment';
import { NO_FISH, populationCounts, setPopulationInPlace, SPECIES_IDS } from './population';
import { speciesSheet } from './species-sheet';
import type { SpeciesId } from './species';
import { sampleWater } from './water-quality';
import { WATER_TEMPERATURES, waterLiters } from './water';
import {
  advance,
  cloneWorld,
  createDefaultWorld,
  starveWorld,
  type MutableWorld,
  type World,
} from './world';

/** Bac de l'environnement `environment` peuplé de `counts`, à son eau et son volume. */
function tank(
  environment: EnvironmentId,
  counts: Partial<Record<SpeciesId, number>>,
  overrides: Partial<CareReturnTank> = {},
): CareReturnTank {
  return {
    environment,
    counts: { ...NO_FISH, ...counts },
    liters: waterLiters(environmentWater(environment)),
    temperature: WATER_TEMPERATURES[environment],
    ...overrides,
  };
}

/** Bac par défaut de `environment`, vu par le contrôle. */
function defaultTank(environment: EnvironmentId): CareReturnTank {
  const world = createDefaultWorld(5, environment);
  return {
    environment,
    counts: populationCounts(world),
    liters: waterLiters(environmentWater(world)),
    temperature: world.water.temperature,
  };
}

function species(list: readonly UnsuitableAnimal[]): SpeciesId[] {
  return list.map((entry) => entry.species);
}

/** Bac débarrassé des espèces listées (« Tout retirer »). */
function without(input: CareReturnTank, list: readonly UnsuitableAnimal[]): CareReturnTank {
  const counts = { ...input.counts };
  for (const entry of list) {
    counts[entry.species] = 0;
  }
  return { ...input, counts };
}

/** État de soin : eau, faim et santé de chaque animal, par identifiant. */
function careState(world: World): unknown {
  return {
    water: world.water,
    animals: world.entities.map((fish) => [fish.id, fish.hunger, fish.health]),
  };
}

/** Bac tropical à l'eau dégradée et aux animaux affamés, passé en décor avec deux poissons-clowns. */
function decorWorld(seed = 11): MutableWorld {
  const world = cloneWorld(starveWorld(advance(createDefaultWorld(seed), 120)));
  world.water = sampleWater('tropical', 'mauvaise');
  setCareModeInPlace(world, 'decor');
  setPopulationInPlace(world, 'clown', 2);
  return world;
}

describe('animaux inadaptés au retour en mode soins (#278, lot 2)', () => {
  it('bac vide : aucune liste', () => {
    for (const id of ENVIRONMENT_IDS) {
      expect(unsuitableAnimals(tank(id, {}))).toEqual([]);
    }
  });

  it('population par défaut de chaque environnement : tous adaptés', () => {
    for (const id of ENVIRONMENT_IDS) {
      expect(unsuitableAnimals(defaultTank(id)), id).toEqual([]);
    }
  });

  it('eau de mer avec des espèces d’eau douce : milieu, avec leurs bacs d’origine', () => {
    const list = unsuitableAnimals(tank('recif', { clown: 2, neon: 8, koi: 3 }));
    expect(species(list)).toEqual(['neon', 'koi']);
    expect(list[0]).toEqual({
      species: 'neon',
      count: 8,
      reason: { kind: 'milieu', homes: ['tropical'] },
    });
    expect(list[1].reason).toEqual({ kind: 'milieu', homes: ['bassin'] });
    expect(unsuitableReasonText(list[0])).toBe('Autre milieu : vit dans « Bac tropical »');
    expect(unsuitableLine(list[0])).toBe('Néon (8) : Autre milieu : vit dans « Bac tropical »');
  });

  it('une espèce de plusieurs milieux nomme chacun d’eux', () => {
    const [entry] = unsuitableAnimals(tank('tropical', { axolotl: 1 }));
    expect(entry.reason).toEqual({ kind: 'milieu', homes: ['paludarium', 'eaufroide'] });
    expect(unsuitableReasonText(entry)).toBe(
      `Autre milieu : vit dans « ${environmentById('paludarium').name} » ou « ${environmentById('eaufroide').name} »`,
    );
  });

  it('eau douce avec une espèce d’eau de mer : listée après celles du bac', () => {
    const list = unsuitableAnimals(tank('tropical', { clown: 1, neon: 8 }));
    expect(list).toEqual([
      { species: 'clown', count: 1, reason: { kind: 'milieu', homes: ['recif'] } },
    ]);
  });

  it('trop d’animaux pour le volume : bac trop petit pour l’espèce', () => {
    const minLiters = speciesSheet('neon').minLiters.value;
    const list = unsuitableAnimals(tank('tropical', { neon: 8 }, { liters: minLiters - 1 }));
    expect(list).toEqual([
      {
        species: 'neon',
        count: 8,
        reason: { kind: 'volume', species: 'neon', liters: minLiters - 1, minLiters },
      },
    ]);
    expect(unsuitableReasonText(list[0])).toContain('Bac trop petit pour des néons');
    // Volume exact : rien ; volume inconnu : pas de contrôle.
    expect(unsuitableAnimals(tank('tropical', { neon: 8 }, { liters: minLiters }))).toEqual([]);
    expect(unsuitableAnimals(tank('tropical', { neon: 8 }, { liters: Number.NaN }))).toEqual([]);
    expect(unsuitableAnimals(tank('tropical', { neon: 8 }, { liters: 0 }))).toEqual([]);
  });

  it('groupe trop petit : sous le groupe minimal, pas à sa valeur', () => {
    const minGroup = speciesSheet('neon').minGroup.value;
    expect(minGroup).toBeGreaterThan(1);
    const list = unsuitableAnimals(tank('tropical', { neon: minGroup - 1 }));
    expect(list[0].reason).toEqual({
      kind: 'groupe',
      species: 'neon',
      count: minGroup - 1,
      minGroup,
    });
    expect(unsuitableReasonText(list[0])).toMatch(/^Groupe trop petit/);
    expect(unsuitableAnimals(tank('tropical', { neon: minGroup }))).toEqual([]);
  });

  it('température hors de la plage tolérée, bornes comprises', () => {
    const { min, max } = speciesSheet('neon').temperatureTolerated.value;
    const hot = unsuitableAnimals(tank('tropical', { neon: 8 }, { temperature: max + 0.1 }));
    expect(hot[0].reason).toEqual({
      kind: 'temperature',
      temperature: max + 0.1,
      tolerated: { min, max },
    });
    expect(unsuitableReasonText(hot[0])).toBe(
      `Eau à ${String(Math.round((max + 0.1) * 10) / 10).replace('.', ',')} °C : les néons tolèrent ${min} à ${max} °C`,
    );
    expect(unsuitableAnimals(tank('tropical', { neon: 8 }, { temperature: max }))).toEqual([]);
    expect(unsuitableAnimals(tank('tropical', { neon: 8 }, { temperature: min }))).toEqual([]);
    expect(
      species(unsuitableAnimals(tank('tropical', { neon: 8 }, { temperature: min - 0.1 }))),
    ).toEqual(['neon']);
    expect(
      species(unsuitableAnimals(tank('tropical', { neon: 8 }, { temperature: Number.NaN }))),
    ).toEqual(['neon']);
  });

  it('milieu avant température, température avant volume et groupe', () => {
    const [clown] = unsuitableAnimals(
      tank('tropical', { clown: 1 }, { temperature: 40, liters: 1 }),
    );
    expect(clown.reason.kind).toBe('milieu');
    const [neon] = unsuitableAnimals(tank('tropical', { neon: 1 }, { temperature: 40, liters: 1 }));
    expect(neon.reason.kind).toBe('temperature');
    const [small] = unsuitableAnimals(tank('tropical', { neon: 1 }, { liters: 1 }));
    expect(small.reason.kind).toBe('volume');
  });

  it('compatibilité : de chaque couple déconseillé d’espèces du bac, seule la seconde est listée', () => {
    // Aucun environnement n'a aujourd'hui deux espèces déconseillées ensemble (les mélanges
    // déconseillés viennent d'un autre milieu, listé pour son milieu) : la règle est vérifiée
    // sur chaque couple, pour les espèces à venir.
    for (const environment of ENVIRONMENT_IDS) {
      const order = environmentById(environment).species;
      for (let i = 0; i < order.length; i++) {
        for (let j = i + 1; j < order.length; j++) {
          const [a, b] = [order[i], order[j]];
          const group = Math.max(speciesSheet(a).minGroup.value, speciesSheet(b).minGroup.value);
          const input = tank(environment, { [a]: group, [b]: group }, { liters: 1e6 });
          const conflict = mixWarnings(order, input.counts).length > 0;
          const list = unsuitableAnimals(input).filter(
            (entry) => entry.reason.kind !== 'temperature',
          );
          expect(species(list), `${environment} ${a} ${b}`).toEqual(conflict ? [b] : []);
          if (conflict) {
            expect(list[0].reason).toMatchObject({ kind: 'incompatible', other: a });
          }
        }
      }
    }
  });

  it('une espèce listée pour une autre raison ne rend pas la suivante inadaptée', () => {
    // Le gourami (territorial) n'est pas gardé : le poisson-clown (territorial) n'est listé
    // que pour son milieu, pas pour sa compatibilité.
    const list = unsuitableAnimals(tank('tropical', { gourami: 1, clown: 1 }));
    expect(list.map((entry) => entry.reason.kind)).toEqual(
      list.map((entry) => (entry.species === 'clown' ? 'milieu' : entry.reason.kind)),
    );
    expect(list.find((entry) => entry.species === 'clown')?.reason.kind).toBe('milieu');
  });

  it('effectifs nuls, négatifs ou non finis ignorés', () => {
    expect(
      unsuitableAnimals(tank('tropical', { clown: 0, koi: -2, axolotl: Number.POSITIVE_INFINITY })),
    ).toEqual([]);
  });

  it('retirer les espèces listées laisse une liste vide (graines et mélanges variés)', () => {
    for (const environment of ENVIRONMENT_IDS) {
      for (let seed = 1; seed <= 40; seed++) {
        const counts: Partial<Record<SpeciesId, number>> = {};
        SPECIES_IDS.forEach((id, index) => {
          counts[id] = (seed * (index + 3) * 7) % 9;
        });
        const input = tank(environment, counts, {
          temperature: 14 + (seed % 16),
          liters: seed * 9,
        });
        const list = unsuitableAnimals(input);
        expect(unsuitableAnimals(without(input, list)), `${environment} ${seed}`).toEqual([]);
        for (const entry of list) {
          expect(entry.count).toBe(input.counts[entry.species]);
        }
      }
    }
  });
});

describe('returnToCareInPlace (#278, lot 2)', () => {
  it('« Tout retirer » retire exactement les animaux listés, le reste garde son état', () => {
    const world = decorWorld();
    const before = careState(world);
    const counts = populationCounts(world);
    const list = unsuitableAnimals({
      environment: world.environment,
      counts,
      liters: waterLiters(environmentWater(world)),
      temperature: world.water.temperature,
    });
    expect(species(list)).toEqual(['clown']);
    const kept = world.entities.filter((fish) => fish.species !== 'clown').map((fish) => fish.id);
    expect(returnToCareInPlace(world, species(list))).toBe(2);
    expect(world.careMode).toBe('soins');
    expect(world.entities.map((fish) => fish.id)).toEqual(kept);
    const { animals } = before as { animals: [number, number, number][] };
    expect(careState(world)).toEqual({
      water: (before as { water: unknown }).water,
      animals: animals.filter(([id]) => kept.includes(id)),
    });
  });

  it('« Tout garder » ne retire rien : aller-retour Soins → Décor → Soins, état repris', () => {
    const world = cloneWorld(starveWorld(advance(createDefaultWorld(13), 120)));
    world.water = sampleWater('tropical', 'mauvaise');
    const start = careState(world);
    setCareModeInPlace(world, 'decor');
    setPopulationInPlace(world, 'clown', 1);
    const paused = advance(world, 300) as MutableWorld;
    expect(returnToCareInPlace(paused, [])).toBe(0);
    expect(paused.careMode).toBe('soins');
    const state = careState(paused) as { water: unknown; animals: unknown[] };
    const original = start as { water: unknown; animals: unknown[] };
    expect(state.water).toEqual(original.water);
    expect(state.animals.slice(0, original.animals.length)).toEqual(original.animals);
    expect(populationCounts(paused).clown).toBe(1);
    // Ensuite, la simulation reprend : l'eau et la faim évoluent de nouveau.
    expect(careState(advance(paused, 600))).not.toEqual(careState(paused));
  });

  it('doublons, espèces absentes et inconnues ignorés', () => {
    const world = decorWorld(17);
    const total = world.entities.length;
    expect(returnToCareInPlace(world, ['clown', 'clown', 'koi', 'licorne', '__proto__'])).toBe(2);
    expect(world.entities.length).toBe(total - 2);
    expect(populationCounts(world).clown).toBe(0);
  });
});
