import { SIM_DT } from './constants';
import type { EnvironmentId } from './environment';
import {
  catchesFinRot,
  FIN_ROT_ADVANCED_AT,
  FIN_ROT_ADVANCED_HEALTH_STRESS,
  FIN_ROT_AMMONIA,
  FIN_ROT_HEAL_SPEED,
  FIN_ROT_MAX,
  FIN_ROT_NITRITE,
  FIN_ROT_VISIBLE_AT,
  FIN_ROT_VISIBLE_HEALTH_STRESS,
  finRotCauses,
  finRotDraw,
  finRotHealthStress,
  finRotSeverity,
  finRotStage,
  isFinRotProgress,
  rotAllFinsInPlace,
  showsFinRot,
  stepFinRotInPlace,
  type FinRotSubject,
} from './fin-rot';
import { ichDraw } from './disease';
import { parseWorld, serializeWorld } from './save';
import { SPECIES, type SpeciesId } from './species';
import { ENVIRONMENT_IDS } from './environment';
import { freshWater, type MutableWaterState } from './water';
import { HEALTH_FLOOR, stepWellbeingInPlace } from './wellbeing';
import {
  advanceInPlace,
  cloneWorld,
  createDefaultWorld,
  createWorld,
  rotWorldFinsInPlace,
  type MutableWorld,
  type World,
} from './world';

/** Animaux de test : identifiants consécutifs à partir de 0. */
function animals(species: readonly SpeciesId[]): FinRotSubject[] {
  return species.map((s, id) => ({ id, species: s }));
}

/** Progressions (`null` : sain), dans l'ordre des animaux. */
function progress(list: readonly { readonly finRot?: number }[]): (number | null)[] {
  return list.map((a) => a.finRot ?? null);
}

/** Fait avancer `list` de `steps` pas sous un nombre de causes constant. */
function run(
  list: FinRotSubject[],
  steps: number,
  causes: number,
  environment: EnvironmentId = 'tropical',
  seed = 42,
  firstTick = 1,
): void {
  for (let tick = firstTick; tick < firstTick + steps; tick++) {
    stepFinRotInPlace(list, SIM_DT, causes, environment, seed, tick);
  }
}

const TWELVE_NEONS: readonly SpeciesId[] = Array.from({ length: 12 }, () => 'neon');

describe('catchesFinRot et finRotCauses', () => {
  it('poissons nageurs d’eau douce seulement', () => {
    expect(catchesFinRot('neon', 'tropical')).toBe(true);
    expect(catchesFinRot('koi', 'bassin')).toBe(true);
    expect(catchesFinRot('axolotl', 'paludarium')).toBe(false);
    expect(catchesFinRot('neon', 'recif')).toBe(false);
    for (const id of Object.keys(SPECIES) as SpeciesId[]) {
      if (SPECIES[id].amphibian !== undefined || SPECIES[id].walker !== undefined) {
        expect(catchesFinRot(id, 'tropical'), id).toBe(false);
      }
    }
  });

  it('eau neuve de chaque environnement : aucune cause', () => {
    for (const env of ENVIRONMENT_IDS) {
      expect(finRotCauses(freshWater(env)), env).toBe(0);
    }
  });

  it('compte l’ammoniaque et les nitrites dès le seuil « mauvaise »', () => {
    expect(finRotCauses({ ammonia: FIN_ROT_AMMONIA - 0.01, nitrite: 0 })).toBe(0);
    expect(finRotCauses({ ammonia: FIN_ROT_AMMONIA, nitrite: 0 })).toBe(1);
    expect(finRotCauses({ ammonia: 0, nitrite: FIN_ROT_NITRITE })).toBe(1);
    expect(finRotCauses({ ammonia: FIN_ROT_AMMONIA, nitrite: FIN_ROT_NITRITE })).toBe(2);
  });

  it('valeurs non finies : aucune cause', () => {
    expect(finRotCauses({ ammonia: Number.NaN, nitrite: Number.NaN })).toBe(0);
    expect(finRotCauses({ ammonia: Number.POSITIVE_INFINITY, nitrite: 0 })).toBe(1);
    expect(finRotCauses({ ammonia: Number.NEGATIVE_INFINITY, nitrite: Number.NaN })).toBe(0);
  });
});

describe('stades, intensité et poids dans la santé', () => {
  it('stades selon la progression', () => {
    expect(finRotStage(undefined)).toBeNull();
    expect(finRotStage(0)).toBe('debut');
    expect(finRotStage(FIN_ROT_VISIBLE_AT - 0.1)).toBe('debut');
    expect(finRotStage(FIN_ROT_VISIBLE_AT)).toBe('effilochee');
    expect(finRotStage(FIN_ROT_ADVANCED_AT)).toBe('avancee');
    expect(finRotStage(FIN_ROT_MAX)).toBe('avancee');
    expect(finRotStage(FIN_ROT_MAX + 1)).toBeNull();
    expect(finRotStage(Number.NaN)).toBeNull();
  });

  it('intensité : 0 sans signe, puis de 0 à 1', () => {
    expect(finRotSeverity(undefined)).toBe(0);
    expect(finRotSeverity(FIN_ROT_VISIBLE_AT - 1)).toBe(0);
    expect(finRotSeverity(FIN_ROT_VISIBLE_AT)).toBe(0);
    expect(finRotSeverity(FIN_ROT_MAX)).toBe(1);
    expect(showsFinRot(FIN_ROT_VISIBLE_AT)).toBe(true);
    expect(showsFinRot(-1)).toBe(false);
  });

  it('poids dans la santé', () => {
    expect(finRotHealthStress(undefined)).toBe(0);
    expect(finRotHealthStress(10)).toBe(0);
    expect(finRotHealthStress(FIN_ROT_VISIBLE_AT)).toBe(FIN_ROT_VISIBLE_HEALTH_STRESS);
    expect(finRotHealthStress(FIN_ROT_MAX)).toBe(FIN_ROT_ADVANCED_HEALTH_STRESS);
  });

  it('isFinRotProgress refuse ce qui n’est pas un nombre fini borné', () => {
    expect(isFinRotProgress('3')).toBe(false);
    expect(isFinRotProgress(null)).toBe(false);
    expect(isFinRotProgress(Number.NaN)).toBe(false);
    expect(isFinRotProgress(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isFinRotProgress(0)).toBe(true);
  });

  it('finRotDraw : dans [0, 1), déterministe, distinct du tirage des points blancs', () => {
    const a = finRotDraw(42, 10, 3);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(1);
    expect(finRotDraw(42, 10, 3)).toBe(a);
    expect(finRotDraw(42, 10, 4)).not.toBe(a);
    expect(finRotDraw(42, 11, 3)).not.toBe(a);
    expect(ichDraw(42, 10, 3)).not.toBe(a);
  });
});

describe('stepFinRotInPlace : apparition', () => {
  it('eau bonne, 100 000 pas : aucun cas', () => {
    const list = animals(TWELVE_NEONS);
    run(list, 100_000, 0);
    expect(list.every((a) => a.finRot === undefined)).toBe(true);
  });

  it('eau chargée : des cas, déterministes à graine fixe ; autre graine, autre déroulé', () => {
    const once = (seed: number): (number | null)[] => {
      const list = animals(TWELVE_NEONS);
      run(list, 60_000, 1, 'tropical', seed);
      return progress(list);
    };
    const first = once(42);
    expect(first.some((p) => p !== null)).toBe(true);
    expect(once(42)).toEqual(first);
    expect(once(7)).not.toEqual(first);
  });

  it('deux causes : plus de cas qu’une seule', () => {
    const count = (causes: number): number => {
      const list = animals(Array.from({ length: 200 }, () => 'neon' as const));
      run(list, 600, causes);
      return list.filter((a) => a.finRot !== undefined).length;
    };
    expect(count(2)).toBeGreaterThan(count(1));
  });

  it('causes non finies ou négatives : comptées nulles', () => {
    for (const causes of [Number.NaN, Number.POSITIVE_INFINITY, -2]) {
      const list = animals(TWELVE_NEONS);
      run(list, 3000, causes);
      expect(
        list.every((a) => a.finRot === undefined),
        String(causes),
      ).toBe(true);
    }
  });

  it('bac vide : sans effet ; pas invalide : lève sans rien changer', () => {
    expect(() => stepFinRotInPlace([], SIM_DT, 2, 'tropical', 42, 1)).not.toThrow();
    const list: FinRotSubject[] = [{ id: 0, species: 'neon', finRot: 100 }];
    expect(() => stepFinRotInPlace(list, 0, 1, 'tropical', 42, 1)).toThrow(RangeError);
    expect(() => stepFinRotInPlace(list, Number.NaN, 1, 'tropical', 42, 1)).toThrow(RangeError);
    expect(list[0].finRot).toBe(100);
  });

  it('amphibiens et bac de récif : jamais touchés', () => {
    const list = animals(['axolotl', 'grenouille', 'triton']);
    run(list, 5000, 2, 'paludarium');
    expect(list.every((a) => a.finRot === undefined)).toBe(true);
    const reef = animals(['clown', 'clown', 'clown']);
    run(reef, 5000, 2, 'recif');
    expect(reef.every((a) => a.finRot === undefined)).toBe(true);
  });
});

describe('stepFinRotInPlace : évolution et guérison', () => {
  it('eau chargée : progresse jusqu’au maximum, puis s’y arrête', () => {
    const list: FinRotSubject[] = [{ id: 0, species: 'neon', finRot: 0 }];
    run(list, Math.round(FIN_ROT_MAX / SIM_DT) + 50, 1);
    expect(list[0].finRot).toBe(FIN_ROT_MAX);
  });

  it('eau corrigée : guérit en FIN_ROT_MAX / FIN_ROT_HEAL_SPEED secondes, sans bouton', () => {
    const list: FinRotSubject[] = [{ id: 0, species: 'neon', finRot: FIN_ROT_MAX }];
    const healSteps = Math.round(FIN_ROT_MAX / FIN_ROT_HEAL_SPEED / SIM_DT);
    run(list, healSteps - 10, 0);
    expect(list[0].finRot).toBeGreaterThan(0);
    expect(finRotStage(list[0].finRot)).toBe('debut');
    run(list, 20, 0);
    expect('finRot' in list[0]).toBe(false);
  });

  it('eau rechargée pendant la guérison : la maladie repart', () => {
    const list: FinRotSubject[] = [{ id: 0, species: 'neon', finRot: 600 }];
    run(list, 600, 0);
    const healed = list[0].finRot as number;
    expect(healed).toBeLessThan(600);
    run(list, 600, 1);
    expect(list[0].finRot as number).toBeGreaterThan(healed);
  });

  it('progression corrompue, ou animal qui ne l’attrape pas : effacée', () => {
    const list: FinRotSubject[] = [
      { id: 0, species: 'neon', finRot: Number.NaN },
      { id: 1, species: 'neon', finRot: -5 },
      { id: 2, species: 'axolotl', finRot: 100 },
    ];
    stepFinRotInPlace(list, SIM_DT, 0, 'paludarium', 42, 1);
    expect(list.every((a) => !('finRot' in a))).toBe(true);
  });
});

describe('santé', () => {
  it('nageoires effilochées : la santé baisse en eau par ailleurs bonne, plus vite au stade avancé', () => {
    const subject = (finRot?: number) => ({
      species: 'neon' as const,
      hunger: 0,
      health: 1,
      finRot,
    });
    const healthy = subject();
    const early = subject(10);
    const frayed = subject(FIN_ROT_VISIBLE_AT);
    const advanced = subject(FIN_ROT_MAX);
    const list = [healthy, early, frayed, advanced];
    for (let i = 0; i < 600; i++) {
      stepWellbeingInPlace(list, SIM_DT, false, (id) => SPECIES[id]);
    }
    expect(healthy.health).toBe(1);
    expect(early.health).toBe(1);
    expect(frayed.health).toBeLessThan(1);
    expect(advanced.health).toBeLessThan(frayed.health);
    expect(advanced.health).toBeGreaterThanOrEqual(HEALTH_FLOOR);
  });
});

describe('monde : pourriture des nageoires dans la boucle à pas fixe', () => {
  const neons = (seed = 42): MutableWorld =>
    cloneWorld(createWorld(seed, [{ species: 'neon', count: 12 }]));

  it('bac par défaut à l’eau bonne : aucun cas en 10 minutes simulées', () => {
    const world = cloneWorld(createDefaultWorld(42));
    advanceInPlace(world, 36_000);
    expect(world.entities.every((f) => f.finRot === undefined)).toBe(true);
  }, 60_000);

  it('ammoniaque haute (filtre arrêté) : des cas, identiques d’une exécution à l’autre', () => {
    const once = (): (number | null)[] => {
      const world = neons(7);
      const water = world.water as MutableWaterState;
      water.filter = 0;
      water.ammonia = 3 * FIN_ROT_AMMONIA;
      advanceInPlace(world, 36_000);
      return progress(world.entities);
    };
    const first = once();
    expect(first.some((p) => p !== null)).toBe(true);
    expect(once()).toEqual(first);
  }, 60_000);

  it('pourriture=1 puis eau bonne : tous guéris en une journée de jeu', () => {
    const world = neons();
    rotWorldFinsInPlace(world);
    expect(world.entities.every((f) => f.finRot === FIN_ROT_MAX)).toBe(true);
    advanceInPlace(world, Math.round(FIN_ROT_MAX / FIN_ROT_HEAL_SPEED / SIM_DT) + 10);
    expect(world.entities.every((f) => f.finRot === undefined)).toBe(true);
  }, 60_000);

  it('mode décor : maladie en pause', () => {
    const world = neons();
    (world.entities[0] as { finRot?: number }).finRot = 300;
    world.careMode = 'decor';
    advanceInPlace(world, 600);
    expect(world.entities[0].finRot).toBe(300);
  });
});

describe('rotAllFinsInPlace (pourriture=1)', () => {
  it('paludarium : amphibiens épargnés ; liste vide : sans effet', () => {
    const world = cloneWorld(createDefaultWorld(42, 'paludarium'));
    rotWorldFinsInPlace(world);
    for (const fish of world.entities) {
      expect(fish.finRot, fish.species).toBe(
        catchesFinRot(fish.species, 'paludarium') ? FIN_ROT_MAX : undefined,
      );
    }
    expect(() => rotAllFinsInPlace([], 'tropical')).not.toThrow();
  });
});

describe('sauvegarde', () => {
  const sickWorld = (): World => {
    const world = cloneWorld(createWorld(5, [{ species: 'neon', count: 4 }]));
    (world.entities[1] as { finRot?: number }).finRot = FIN_ROT_VISIBLE_AT + 12.5;
    (world.entities[3] as { finRot?: number }).finRot = 0;
    return world;
  };

  it('aller-retour avec une maladie en cours', () => {
    const world = sickWorld();
    const result = parseWorld(serializeWorld(world));
    if (!result.ok) {
      throw new Error(result.error);
    }
    expect(progress(result.world.entities)).toEqual([null, FIN_ROT_VISIBLE_AT + 12.5, null, 0]);
    expect(result.world).toEqual(world);
  });

  it('animal sain : aucun champ écrit ; ancienne sauvegarde relue sans maladie', () => {
    const text = serializeWorld(createWorld(5, [{ species: 'neon', count: 4 }]));
    expect(text).not.toContain('"finRot"');
    const result = parseWorld(text);
    if (!result.ok) {
      throw new Error(result.error);
    }
    expect(result.world.entities.every((f) => !('finRot' in f))).toBe(true);
  });

  it('animal qui ne l’attrape pas : progression ignorée à la relecture', () => {
    const world = cloneWorld(createDefaultWorld(42, 'paludarium'));
    const data = JSON.parse(serializeWorld(world)) as { fish: Record<string, unknown>[] };
    for (const fish of data.fish) {
      fish['finRot'] = FIN_ROT_VISIBLE_AT;
    }
    const result = parseWorld(JSON.stringify(data));
    if (!result.ok) {
      throw new Error(result.error);
    }
    for (const fish of result.world.entities) {
      expect(fish.finRot, fish.species).toBe(
        catchesFinRot(fish.species, 'paludarium') ? FIN_ROT_VISIBLE_AT : undefined,
      );
    }
  });

  it.each([[-1], [FIN_ROT_MAX + 1], ['300'], [null]])('progression invalide %s : refusée', (v) => {
    const data = JSON.parse(serializeWorld(sickWorld())) as { fish: Record<string, unknown>[] };
    data.fish[1]['finRot'] = v;
    const result = parseWorld(JSON.stringify(data));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('finRot');
    }
  });
});
