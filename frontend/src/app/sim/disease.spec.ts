import {
  catchesIch,
  ICH_AGGRAVATED_AT,
  ICH_AGGRAVATED_HEALTH_STRESS,
  ICH_AMMONIA,
  ICH_NITRITE,
  ICH_VISIBLE_AT,
  ICH_VISIBLE_HEALTH_STRESS,
  ichDraw,
  ichHealthStress,
  ichSeverity,
  ichStage,
  ichStress,
  isIchAge,
  infectAllInPlace,
  isIchContagious,
  stepIchInPlace,
  type IchSubject,
} from './disease';
import { SIM_DT } from './constants';
import type { EnvironmentId } from './environment';
import { parseWorld, serializeWorld } from './save';
import type { SpeciesId } from './species';
import { freshWater, type MutableWaterState, type WaterState } from './water';
import { HEALTH_FLOOR, stepWellbeingInPlace } from './wellbeing';
import { SPECIES } from './species';
import {
  advanceInPlace,
  cloneWorld,
  createDefaultWorld,
  createWorld,
  infectWorldInPlace,
  setWorldHeaterInPlace,
  type MutableWorld,
  type World,
} from './world';

/** Animaux de test : identifiants consécutifs à partir de 0. */
function animals(species: readonly SpeciesId[]): IchSubject[] {
  return species.map((s, id) => ({ id, species: s }));
}

/** Âges d'infection (`null` : sain), dans l'ordre des animaux. */
function ages(list: readonly { readonly ich?: number }[]): (number | null)[] {
  return list.map((a) => a.ich ?? null);
}

/** Fait avancer `list` de `steps` pas sous un stress constant. */
function run(
  list: IchSubject[],
  steps: number,
  stress: number,
  environment: EnvironmentId = 'tropical',
  seed = 42,
): void {
  for (let tick = 1; tick <= steps; tick++) {
    stepIchInPlace(list, SIM_DT, stress, environment, seed, tick);
  }
}

const TWELVE_NEONS: readonly SpeciesId[] = Array.from({ length: 12 }, () => 'neon');

describe('catchesIch', () => {
  it.each([
    ['neon', 'tropical', true],
    ['guppy', 'tropical', true],
    ['corydora', 'tropical', true],
    ['koi', 'bassin', true],
    ['axolotl', 'eaufroide', false],
    ['axolotl', 'paludarium', false],
    ['grenouille', 'paludarium', false],
    ['triton', 'paludarium', false],
    ['clown', 'recif', false],
    ['chirurgien', 'recif', false],
    ['neon', 'recif', false],
  ] as const)('%s dans %s : %s', (species, environment, expected) => {
    expect(catchesIch(species, environment)).toBe(expected);
  });

  it('seules les espèces nageuses d’eau douce sont concernées', () => {
    for (const def of Object.values(SPECIES)) {
      if (def.walker !== undefined || def.amphibian !== undefined) {
        expect(catchesIch(def.id, 'tropical')).toBe(false);
      }
    }
  });
});

describe('ichStress', () => {
  const water = (patch: Partial<MutableWaterState>): WaterState => ({
    ...freshWater('tropical'),
    ...patch,
  });

  it('eau neuve de chaque environnement : aucun stress', () => {
    for (const env of ['tropical', 'bassin', 'paludarium', 'recif', 'eaufroide'] as const) {
      expect(ichStress(freshWater(env), env)).toBe(0);
    }
  });

  it('compte chaque cause dès son seuil', () => {
    expect(ichStress(water({ ammonia: ICH_AMMONIA - 0.01 }), 'tropical')).toBe(0);
    expect(ichStress(water({ ammonia: ICH_AMMONIA }), 'tropical')).toBe(1);
    expect(ichStress(water({ nitrite: ICH_NITRITE }), 'tropical')).toBe(1);
    // Nitrates : pas une cause (eau vieillie, mais pas un choc).
    expect(ichStress(water({ nitrate: 100 }), 'tropical')).toBe(0);
  });

  it('écart de température durable : une cause ; changement brusque : une autre', () => {
    // Eau à 30 °C, chauffage à 30 °C : écart de 6 °C à l'environnement, pas de choc.
    expect(ichStress(water({ temperature: 30, heater: 30 }), 'tropical')).toBe(1);
    // Chauffage tout juste monté à 27 °C : l'eau est encore à 24 °C (choc seul).
    expect(ichStress(water({ heater: 27 }), 'tropical')).toBe(1);
    expect(ichStress(water({ heater: 26.9 }), 'tropical')).toBe(0);
    // Eau à 32 °C qui redescend vers une consigne de 24 °C : les deux.
    expect(ichStress(water({ temperature: 32, heater: 24 }), 'tropical')).toBe(2);
    expect(
      ichStress(water({ temperature: 32, heater: 24, ammonia: 50, nitrite: 50 }), 'tropical'),
    ).toBe(4);
  });

  it('valeurs non finies : aucune cause', () => {
    expect(
      ichStress(
        water({
          temperature: Number.NaN,
          ammonia: Number.NaN,
          nitrite: Number.POSITIVE_INFINITY * 0,
        }),
        'tropical',
      ),
    ).toBe(0);
  });
});

describe('stades, intensité et poids dans la santé', () => {
  it.each([
    [undefined, null, 0, 0, false],
    [0, 'incubation', 0, 0, false],
    [ICH_VISIBLE_AT - 0.001, 'incubation', 0, 0, false],
    [ICH_VISIBLE_AT, 'visible', 0, ICH_VISIBLE_HEALTH_STRESS, true],
    [(ICH_VISIBLE_AT + ICH_AGGRAVATED_AT) / 2, 'visible', 0.5, ICH_VISIBLE_HEALTH_STRESS, true],
    [ICH_AGGRAVATED_AT, 'aggravee', 1, ICH_AGGRAVATED_HEALTH_STRESS, true],
    [Number.NaN, null, 0, 0, false],
    [-1, null, 0, 0, false],
    [ICH_AGGRAVATED_AT + 1, null, 0, 0, false],
    [Infinity, null, 0, 0, false],
  ] as const)('âge %s : %s', (age, stage, severity, stress, contagious) => {
    expect(ichStage(age)).toBe(stage);
    expect(ichSeverity(age)).toBe(severity);
    expect(ichHealthStress(age)).toBe(stress);
    expect(isIchContagious(age)).toBe(contagious);
  });

  it('isIchAge refuse ce qui n’est pas un nombre', () => {
    expect(isIchAge('300')).toBe(false);
    expect(isIchAge(null)).toBe(false);
    expect(isIchAge(0)).toBe(true);
  });

  it('ichDraw : dans [0, 1), déterministe, propre à chaque animal et à chaque pas', () => {
    const a = ichDraw(42, 10, 3);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(1);
    expect(ichDraw(42, 10, 3)).toBe(a);
    expect(ichDraw(42, 10, 4)).not.toBe(a);
    expect(ichDraw(42, 11, 3)).not.toBe(a);
    expect(ichDraw(43, 10, 3)).not.toBe(a);
    // Compteur de pas au-delà de 2³² : ramené sans lever.
    expect(ichDraw(42, 2 ** 32 + 10, 3)).toBe(a);
  });
});

describe('stepIchInPlace : apparition', () => {
  it('bac stable à 24 °C, eau propre, 200 000 pas : aucun cas', () => {
    const water = freshWater('tropical');
    const list = animals(TWELVE_NEONS);
    const stress = ichStress(water, 'tropical');
    expect(stress).toBe(0);
    run(list, 200_000, stress);
    expect(ages(list).every((a) => a === null)).toBe(true);
  });

  it('bac stressé : au moins un cas, déterministe à graine fixe', () => {
    const first = animals(TWELVE_NEONS);
    const second = animals(TWELVE_NEONS);
    run(first, 36_000, 1);
    run(second, 36_000, 1);
    expect(ages(first).filter((a) => a !== null).length).toBeGreaterThan(0);
    expect(ages(second)).toEqual(ages(first));
  });

  it('autre graine : autre déroulé', () => {
    const a = animals(TWELVE_NEONS);
    const b = animals(TWELVE_NEONS);
    run(a, 36_000, 1, 'tropical', 42);
    run(b, 36_000, 1, 'tropical', 7);
    expect(ages(b)).not.toEqual(ages(a));
  });

  it('plus de causes, plus de cas', () => {
    const counts = [1, 4].map((stress) => {
      let total = 0;
      for (let seed = 0; seed < 20; seed++) {
        const list = animals(TWELVE_NEONS);
        run(list, 3_000, stress, 'tropical', seed);
        total += ages(list).filter((a) => a !== null).length;
      }
      return total;
    });
    expect(counts[1]).toBeGreaterThan(counts[0]);
  });

  it('stress non fini ou négatif : compté nul', () => {
    for (const stress of [Number.NaN, -3, -Infinity]) {
      const list = animals(TWELVE_NEONS);
      run(list, 6_000, stress);
      expect(ages(list).every((a) => a === null)).toBe(true);
    }
  });

  it('pas invalide : lève sans rien changer', () => {
    const list = animals(['neon']);
    list[0].ich = 10;
    for (const dt of [0, -1, Number.NaN, Infinity]) {
      expect(() => stepIchInPlace(list, dt, 1, 'tropical', 42, 1)).toThrow(RangeError);
    }
    expect(list[0].ich).toBe(10);
  });
});

describe('stepIchInPlace : cycle et contagion', () => {
  it('l’infection vieillit jusqu’à l’aggravation, puis s’y arrête (bac à un seul poisson)', () => {
    const list = animals(['neon']);
    list[0].ich = 0;
    run(list, Math.round(ICH_VISIBLE_AT / SIM_DT), 0);
    expect(ichStage(list[0].ich)).toBe('visible');
    run(list, Math.round((2 * ICH_AGGRAVATED_AT) / SIM_DT), 0);
    expect(list[0].ich).toBe(ICH_AGGRAVATED_AT);
    expect(ichStage(list[0].ich)).toBe('aggravee');
  });

  it('un malade contagieux contamine son bac, pas le bac voisin', () => {
    const sick = animals(TWELVE_NEONS);
    sick[0].ich = ICH_VISIBLE_AT;
    const neighbour = animals(TWELVE_NEONS);
    for (let tick = 1; tick <= 36_000; tick++) {
      stepIchInPlace(sick, SIM_DT, 0, 'tropical', 42, tick);
      stepIchInPlace(neighbour, SIM_DT, 0, 'tropical', 42, tick);
    }
    expect(ages(sick).filter((a) => a !== null).length).toBeGreaterThan(1);
    expect(ages(neighbour).every((a) => a === null)).toBe(true);
  });

  it('en incubation, un malade ne contamine personne', () => {
    const list = animals(TWELVE_NEONS);
    list[0].ich = 0;
    run(list, Math.round(ICH_VISIBLE_AT / SIM_DT) - 1, 0);
    expect(
      ages(list)
        .slice(1)
        .every((a) => a === null),
    ).toBe(true);
  });

  it('amphibiens et espèces de récif jamais touchés, même stressés au milieu de malades', () => {
    const list = animals(['neon', 'neon', 'axolotl', 'grenouille', 'triton', 'clown']);
    list[0].ich = ICH_AGGRAVATED_AT;
    list[1].ich = ICH_AGGRAVATED_AT;
    run(list, 36_000, 4, 'paludarium');
    expect(ages(list).slice(2)).toEqual([null, null, null, null]);
  });

  it('bac de récif : aucun cas, même stressé', () => {
    const list = animals(['clown', 'clown', 'chirurgien']);
    run(list, 36_000, 4, 'recif');
    expect(ages(list).every((a) => a === null)).toBe(true);
  });

  it('âge corrompu : effacé, sans contamination', () => {
    const list = animals(['neon', 'neon', 'neon']);
    list[0].ich = Number.NaN;
    list[1].ich = -5;
    list[2].ich = ICH_AGGRAVATED_AT + 1;
    stepIchInPlace(list, SIM_DT, 0, 'tropical', 42, 1);
    expect(list.every((a) => !('ich' in a))).toBe(true);
  });
});

describe('santé sans traitement', () => {
  interface Animal {
    readonly id: number;
    readonly species: SpeciesId;
    hunger: number;
    health: number;
    ich?: number;
  }
  const neon = (ich: number | undefined, health = 1): Animal => ({
    id: 0,
    species: 'neon',
    hunger: 0,
    health,
    ...(ich === undefined ? {} : { ich }),
  });
  const wellbeing = (list: Animal[], seconds: number): void => {
    for (let i = 0; i < Math.round(seconds / SIM_DT); i++) {
      stepWellbeingInPlace(list, SIM_DT, false, (s) => SPECIES[s]);
    }
  };

  it('la santé baisse aux stades visibles, plus vite à l’aggravation, pas en incubation', () => {
    const list = [neon(undefined), neon(0), neon(ICH_VISIBLE_AT), neon(ICH_AGGRAVATED_AT)];
    wellbeing(list, 60);
    const [healthy, incubating, visible, aggravated] = list.map((a) => a.health);
    expect(healthy).toBe(1);
    expect(incubating).toBe(1);
    expect(visible).toBeLessThan(1);
    expect(aggravated).toBeLessThan(visible);
    expect(1 - aggravated).toBeCloseTo(2 * (1 - visible), 10);
  });

  it('santé au plancher (ou nulle) : reste au plancher', () => {
    const list = [neon(ICH_AGGRAVATED_AT, HEALTH_FLOOR), neon(ICH_AGGRAVATED_AT, 0)];
    wellbeing(list, 60);
    expect(list.map((a) => a.health)).toEqual([HEALTH_FLOOR, HEALTH_FLOOR]);
  });
});

describe('monde : points blancs dans la boucle à pas fixe', () => {
  const neons = (seed = 42): MutableWorld =>
    cloneWorld(createWorld(seed, [{ species: 'neon', count: 12 }]));

  it('bac par défaut sans stress : aucun cas en 10 minutes simulées', () => {
    const world = cloneWorld(createDefaultWorld(42));
    advanceInPlace(world, 36_000);
    expect(world.entities.every((f) => f.ich === undefined)).toBe(true);
  }, 60_000);

  it('choc de température (chauffage à 32 °C) : des cas, identiques d’une exécution à l’autre', () => {
    const run = (): (number | null)[] => {
      const world = neons();
      setWorldHeaterInPlace(world, 32);
      advanceInPlace(world, 36_000);
      return ages(world.entities);
    };
    const first = run();
    expect(first.filter((a) => a !== null).length).toBeGreaterThan(0);
    expect(run()).toEqual(first);
  }, 60_000);

  it('ammoniaque haute (filtre arrêté) : des cas', () => {
    const world = neons(7);
    const water = world.water as MutableWaterState;
    water.filter = 0;
    water.ammonia = 3 * ICH_AMMONIA;
    advanceInPlace(world, 36_000);
    expect(world.entities.some((f) => f.ich !== undefined)).toBe(true);
  }, 60_000);

  it('mode décor : maladie en pause', () => {
    const world = neons();
    (world.entities[0] as { ich?: number }).ich = 10;
    world.careMode = 'decor';
    advanceInPlace(world, 600);
    expect(world.entities[0].ich).toBe(10);
  });
});

describe('sauvegarde', () => {
  const sickWorld = (): World => {
    const world = cloneWorld(createWorld(5, [{ species: 'neon', count: 4 }]));
    (world.entities[1] as { ich?: number }).ich = ICH_VISIBLE_AT + 12.5;
    (world.entities[3] as { ich?: number }).ich = 0;
    return world;
  };

  it('aller-retour avec une maladie en cours', () => {
    const world = sickWorld();
    const result = parseWorld(serializeWorld(world));
    if (!result.ok) {
      throw new Error(result.error);
    }
    expect(ages(result.world.entities)).toEqual([null, ICH_VISIBLE_AT + 12.5, null, 0]);
    expect(result.world).toEqual(world);
  });

  it('animal sain : aucun champ écrit ; ancienne sauvegarde relue sans maladie', () => {
    const text = serializeWorld(createWorld(5, [{ species: 'neon', count: 4 }]));
    expect(text).not.toContain('"ich"');
    const result = parseWorld(text);
    if (!result.ok) {
      throw new Error(result.error);
    }
    expect(result.world.entities.every((f) => !('ich' in f))).toBe(true);
  });

  it.each([[-1], [ICH_AGGRAVATED_AT + 1], ['300'], [null]])('âge invalide %s : refusé', (ich) => {
    const data = JSON.parse(serializeWorld(sickWorld())) as { fish: Record<string, unknown>[] };
    data.fish[1]['ich'] = ich;
    const result = parseWorld(JSON.stringify(data));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('ich');
    }
  });
});

describe('points-blancs=1 : tous les poissons concernés au stade aggravé (#366)', () => {
  it('bac tropical : tous les poissons, au stade aggravé ; aucun tirage', () => {
    const world = cloneWorld(createDefaultWorld(42));
    const before = world.entities.map((f) => f.rng);
    infectWorldInPlace(world);
    expect(world.entities.length).toBeGreaterThan(0);
    expect(world.entities.every((f) => f.ich === ICH_AGGRAVATED_AT)).toBe(true);
    expect(world.entities.map((f) => f.rng)).toEqual(before);
  });

  it('paludarium et récif : amphibiens et espèces de récif épargnés', () => {
    for (const environment of ['paludarium', 'recif', 'eaufroide', 'bassin'] as const) {
      const world = cloneWorld(createDefaultWorld(42, environment));
      infectWorldInPlace(world);
      for (const fish of world.entities) {
        const expected = catchesIch(fish.species, environment) ? ICH_AGGRAVATED_AT : undefined;
        expect(fish.ich, `${environment} ${fish.species}`).toBe(expected);
      }
    }
  });

  it('liste vide : sans effet', () => {
    const list: IchSubject[] = [];
    infectAllInPlace(list, 'tropical');
    expect(list).toEqual([]);
  });
});
