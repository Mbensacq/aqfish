import { SIM_DT } from './constants';
import { ichDraw, ichStress, ICH_AGGRAVATED_AT } from './disease';
import type { EnvironmentId } from './environment';
import { finRotDraw } from './fin-rot';
import { healthSummary } from './health-summary';
import { parseWorld, serializeWorld } from './save';
import { SPECIES, type SpeciesId } from './species';
import { applyTreatmentInPlace, MEDICATION_EFFECTIVE, VELVET_WRONG_TREATMENT } from './treatment';
import {
  catchesVelvet,
  isVelvetProgress,
  showsVelvet,
  stepVelvetInPlace,
  velvetAllInPlace,
  velvetDraw,
  velvetHealthStress,
  velvetSeverity,
  velvetStage,
  VELVET_ADVANCED_AT,
  VELVET_ADVANCED_HEALTH_STRESS,
  VELVET_CURE_DAYS,
  VELVET_HEAL_SPEED,
  VELVET_MAX,
  VELVET_VISIBLE_AT,
  VELVET_VISIBLE_HEALTH_STRESS,
  type VelvetSubject,
} from './velvet';
import { DEFAULT_DAY_LENGTH_SECONDS } from './daylight';
import { freshWater, type MutableWaterState } from './water';
import { HEALTH_FLOOR, stepWellbeingInPlace } from './wellbeing';
import {
  advanceInPlace,
  cloneWorld,
  createDefaultWorld,
  createWorld,
  setWorldHeaterInPlace,
  treatWorldInPlace,
  velvetWorldInPlace,
  type MutableWorld,
  type World,
} from './world';

/** Animaux de test : identifiants consécutifs à partir de 0. */
function animals(species: readonly SpeciesId[]): VelvetSubject[] {
  return species.map((s, id) => ({ id, species: s }));
}

/** Progressions (`null` : sain), dans l'ordre des animaux. */
function progress(list: readonly { readonly velvet?: number }[]): (number | null)[] {
  return list.map((a) => a.velvet ?? null);
}

/** Fait avancer `list` de `steps` pas sous un stress constant. */
function run(
  list: VelvetSubject[],
  steps: number,
  stress: number,
  options: { environment?: EnvironmentId; seed?: number; treated?: boolean } = {},
): number {
  const { environment = 'tropical', seed = 42, treated = false } = options;
  let healed = 0;
  for (let tick = 1; tick <= steps; tick++) {
    healed += stepVelvetInPlace(list, SIM_DT, stress, environment, seed, tick, treated);
  }
  return healed;
}

const neons = (count: number): VelvetSubject[] => animals(Array(count).fill('neon'));

describe('catchesVelvet', () => {
  it('poissons nageurs d’eau douce seulement', () => {
    expect(catchesVelvet('neon', 'tropical')).toBe(true);
    expect(catchesVelvet('koi', 'bassin')).toBe(true);
    expect(catchesVelvet('axolotl', 'paludarium')).toBe(false);
    expect(catchesVelvet('neon', 'recif')).toBe(false);
  });
});

describe('stades, intensité et poids dans la santé', () => {
  it('incubation sans signe, puis voile, puis stade avancé', () => {
    expect(velvetStage(undefined)).toBeNull();
    expect(velvetStage(0)).toBe('incubation');
    expect(velvetStage(VELVET_VISIBLE_AT)).toBe('voile');
    expect(velvetStage(VELVET_ADVANCED_AT)).toBe('avance');
    expect(velvetStage(VELVET_MAX)).toBe('avance');
    expect(showsVelvet(VELVET_VISIBLE_AT - 1)).toBe(false);
    expect(showsVelvet(VELVET_VISIBLE_AT)).toBe(true);
    expect(velvetSeverity(0)).toBe(0);
    expect(velvetSeverity(VELVET_VISIBLE_AT)).toBe(0);
    expect(velvetSeverity(VELVET_MAX)).toBe(1);
    expect(velvetHealthStress(0)).toBe(0);
    expect(velvetHealthStress(VELVET_VISIBLE_AT)).toBe(VELVET_VISIBLE_HEALTH_STRESS);
    expect(velvetHealthStress(VELVET_MAX)).toBe(VELVET_ADVANCED_HEALTH_STRESS);
  });

  it.each([[-1], [VELVET_MAX + 1], [Number.NaN], [Number.POSITIVE_INFINITY], ['300'], [null]])(
    'progression invalide %s : saine',
    (value) => {
      expect(isVelvetProgress(value)).toBe(false);
      expect(velvetStage(value as number)).toBeNull();
      expect(velvetSeverity(value as number)).toBe(0);
    },
  );

  it('tirage : dans [0, 1), déterministe, distinct de ceux des autres maladies', () => {
    const draw = velvetDraw(42, 7, 3);
    expect(draw).toBeGreaterThanOrEqual(0);
    expect(draw).toBeLessThan(1);
    expect(velvetDraw(42, 7, 3)).toBe(draw);
    expect(velvetDraw(43, 7, 3)).not.toBe(draw);
    expect(velvetDraw(42, 8, 3)).not.toBe(draw);
    expect(ichDraw(42, 7, 3)).not.toBe(draw);
    expect(finRotDraw(42, 7, 3)).not.toBe(draw);
  });
});

describe('stepVelvetInPlace : apparition', () => {
  it('bac sain, sans stress : aucun cas en 200 000 pas', () => {
    const list = neons(12);
    run(list, 200_000, 0);
    expect(progress(list).every((p) => p === null)).toBe(true);
  });

  it('bac stressé : des cas, identiques à graine fixe, autres avec une autre graine', () => {
    const once = (seed: number): (number | null)[] => {
      const list = neons(12);
      run(list, 36_000, 2, { seed });
      return progress(list);
    };
    const first = once(42);
    expect(first.some((p) => p !== null)).toBe(true);
    expect(once(42)).toEqual(first);
    expect(once(7)).not.toEqual(first);
  });

  it('plus de stress, plus de cas', () => {
    const cases = (stress: number): number => {
      let total = 0;
      for (const seed of [1, 2, 3, 4, 5]) {
        const list = neons(12);
        run(list, 6_000, stress, { seed });
        total += progress(list).filter((p) => p !== null).length;
      }
      return total;
    };
    expect(cases(4)).toBeGreaterThan(cases(1));
  });

  it('stress non fini ou négatif : compté nul', () => {
    for (const stress of [Number.NaN, Number.POSITIVE_INFINITY, -3]) {
      const list = neons(12);
      run(list, 20_000, stress);
      expect(
        progress(list).every((p) => p === null),
        String(stress),
      ).toBe(true);
    }
  });

  it('pas invalide : lève sans rien changer', () => {
    const list = neons(2);
    list[0].velvet = 100;
    for (const dt of [0, -1, Number.NaN]) {
      expect(() => stepVelvetInPlace(list, dt, 4, 'tropical', 42, 1)).toThrow(RangeError);
    }
    expect(progress(list)).toEqual([100, null]);
  });

  it('amphibiens et récif : jamais touchés, même stressés', () => {
    const palu = animals(['axolotl', 'grenouille']);
    run(palu, 20_000, 4, { environment: 'paludarium' });
    expect(progress(palu)).toEqual([null, null]);
    const reef = neons(4);
    run(reef, 20_000, 4, { environment: 'recif' });
    expect(progress(reef).every((p) => p === null)).toBe(true);
  });
});

describe('stepVelvetInPlace : maladie et contagion', () => {
  it('sans traitement : progresse jusqu’au maximum puis s’y arrête', () => {
    const list = neons(1);
    list[0].velvet = 0;
    run(list, Math.round((VELVET_MAX + 120) / SIM_DT), 0);
    expect(list[0].velvet).toBe(VELVET_MAX);
  });

  it('contagion : un malade au voile visible contamine son bac, lentement', () => {
    const list = neons(12);
    list[0].velvet = VELVET_MAX;
    run(list, 600 / SIM_DT, 0);
    const after10min = progress(list).filter((p) => p !== null).length;
    expect(after10min).toBeGreaterThan(1);
    // Contagion lente : en 10 minutes simulées, le bac n'est pas entièrement atteint.
    expect(after10min).toBeLessThan(12);
  });

  it('en incubation, un malade ne contamine personne', () => {
    const list = neons(12);
    list[0].velvet = 0;
    run(list, Math.round((VELVET_VISIBLE_AT - 10) / SIM_DT), 0);
    expect(
      progress(list)
        .slice(1)
        .every((p) => p === null),
    ).toBe(true);
  });

  it('progression corrompue, ou portée par un animal qui ne l’attrape pas : effacée', () => {
    const list = animals(['neon', 'axolotl']);
    list[0].velvet = Number.NaN;
    list[1].velvet = VELVET_MAX;
    stepVelvetInPlace(list, SIM_DT, 0, 'tropical', 42, 1);
    expect(progress(list)).toEqual([null, null]);
  });
});

describe('stepVelvetInPlace : traitement et guérison', () => {
  it('sous médicament : recule et guérit en VELVET_CURE_DAYS jours au plus, sans contagion', () => {
    const list = neons(12);
    list[0].velvet = VELVET_MAX;
    const steps = Math.ceil(VELVET_MAX / VELVET_HEAL_SPEED / SIM_DT);
    const healed = run(list, steps, 4, { treated: true });
    expect(healed).toBe(1);
    expect(progress(list).every((p) => p === null)).toBe(true);
    expect(steps * SIM_DT).toBeLessThanOrEqual(VELVET_CURE_DAYS * DEFAULT_DAY_LENGTH_SECONDS + 1);
  });

  it('traitement arrêté trop tôt : la maladie reprend là où elle en est', () => {
    const list = neons(1);
    list[0].velvet = VELVET_MAX;
    run(list, 600, 0, { treated: true });
    const partway = list[0].velvet as number;
    expect(partway).toBeLessThan(VELVET_MAX);
    expect(partway).toBeGreaterThan(0);
    run(list, 60, 0);
    expect(list[0].velvet).toBeCloseTo(partway + 60 * SIM_DT, 6);
  });

  it('bac traité sans malade : aucun tirage, aucun cas', () => {
    const list = neons(12);
    run(list, 20_000, 4, { treated: true });
    expect(progress(list).every((p) => p === null)).toBe(true);
  });
});

describe('santé', () => {
  it('baisse au voile, deux fois plus vite au stade avancé, pas en incubation', () => {
    const list = [0, VELVET_VISIBLE_AT, VELVET_MAX].map((velvet, id) => ({
      id,
      species: 'neon' as SpeciesId,
      hunger: 0,
      health: 1,
      velvet,
    }));
    for (let i = 0; i < 60 / SIM_DT; i++) {
      stepWellbeingInPlace(list, SIM_DT, false, (s) => SPECIES[s]);
    }
    const [incubating, veiled, advanced] = list.map((a) => a.health);
    expect(incubating).toBe(1);
    expect(veiled).toBeLessThan(1);
    expect(1 - advanced).toBeCloseTo(2 * (1 - veiled), 10);
    expect(advanced).toBeGreaterThanOrEqual(HEALTH_FLOOR);
  });

  it('synthèse : voile compté comme maladie, à part des points blancs', () => {
    const summary = healthSummary([
      { species: 'neon', hunger: 0, health: 1, velvet: VELVET_VISIBLE_AT },
      { species: 'neon', hunger: 0, health: 1, velvet: VELVET_MAX },
      { species: 'neon', hunger: 0, health: 1, velvet: 0 },
    ]);
    expect(summary.velvet).toBe(2);
    expect(summary.velvetAdvanced).toBe(1);
    expect(summary.ich).toBe(0);
    expect(summary.diseased).toBe(2);
  });
});

describe('monde : velours dans la boucle à pas fixe', () => {
  const tank = (seed = 42): MutableWorld =>
    cloneWorld(createWorld(seed, [{ species: 'neon', count: 12 }]));

  it('bac par défaut sain : aucun cas en 10 minutes simulées', () => {
    const world = cloneWorld(createDefaultWorld(42));
    advanceInPlace(world, 36_000);
    expect(world.entities.every((f) => f.velvet === undefined)).toBe(true);
  }, 60_000);

  it('choc de température : des cas, identiques d’une exécution à l’autre', () => {
    const once = (): (number | null)[] => {
      const world = tank();
      setWorldHeaterInPlace(world, 32);
      advanceInPlace(world, 36_000);
      return progress(world.entities);
    };
    const first = once();
    expect(first.some((p) => p !== null)).toBe(true);
    expect(once()).toEqual(first);
  }, 60_000);

  it('médicament donné au bon moment : guérison ; redosé tous les deux jours', () => {
    const world = tank();
    velvetWorldInPlace(world);
    const outcome = treatWorldInPlace(world, 'medicament', 1);
    expect(outcome.ok).toBe(true);
    expect(outcome.ok && outcome.warning).toBeFalsy();
    const day = DEFAULT_DAY_LENGTH_SECONDS / SIM_DT;
    advanceInPlace(world, 1.5 * day);
    expect(world.entities.every((f) => f.velvet !== undefined)).toBe(true);
    expect(treatWorldInPlace(world, 'medicament', 1).ok).toBe(true);
    advanceInPlace(world, day);
    expect(world.entities.every((f) => f.velvet === undefined)).toBe(true);
  }, 60_000);

  it('erreur de traitement : le sel (remède des points blancs) n’y fait rien et le dit', () => {
    const world = tank();
    velvetWorldInPlace(world);
    const outcome = treatWorldInPlace(world, 'sel', 1);
    expect(outcome.ok).toBe(true);
    expect(outcome.ok ? outcome.warning : '').toContain(VELVET_WRONG_TREATMENT);
    (world.water as MutableWaterState).salt = 5;
    setWorldHeaterInPlace(world, 26);
    advanceInPlace(world, 1200 / SIM_DT);
    expect(world.entities.every((f) => f.velvet === VELVET_MAX)).toBe(true);
  }, 60_000);

  it('non-confusion : le velours ne donne pas de points blancs, ni l’inverse', () => {
    const world = tank();
    velvetWorldInPlace(world);
    expect(world.entities.every((f) => f.ich === undefined)).toBe(true);
    const summary = healthSummary(world.entities);
    expect(summary.ich).toBe(0);
    expect(summary.velvet).toBe(12);
    const ill = tank();
    for (const fish of ill.entities) {
      (fish as { ich?: number }).ich = ICH_AGGRAVATED_AT;
    }
    advanceInPlace(ill, 600);
    expect(ill.entities.every((f) => f.velvet === undefined)).toBe(true);
  });

  it('mode décor : maladie en pause', () => {
    const world = tank();
    (world.entities[0] as { velvet?: number }).velvet = 10;
    world.careMode = 'decor';
    advanceInPlace(world, 600);
    expect(world.entities[0].velvet).toBe(10);
  });
});

describe('traitement : contexte du geste', () => {
  it('aucun malade de velours ni de points blancs : refusé', () => {
    const water = freshWater('tropical') as MutableWaterState;
    const outcome = applyTreatmentInPlace(water, 'medicament', 1, {
      environment: 'tropical',
      species: ['neon'],
      infected: 0,
    });
    expect(outcome.ok).toBe(false);
  });

  it('velours seul : le médicament protège dès la dose', () => {
    const water = freshWater('tropical') as MutableWaterState;
    const outcome = applyTreatmentInPlace(water, 'medicament', 1, {
      environment: 'tropical',
      species: ['neon'],
      infected: 1,
      velvet: 1,
    });
    expect(outcome.ok).toBe(true);
    expect(water.medication).toBeGreaterThanOrEqual(MEDICATION_EFFECTIVE);
  });

  it('chaleur contre le velours : acceptée avec la mise en garde', () => {
    const water = freshWater('tropical') as MutableWaterState;
    const outcome = applyTreatmentInPlace(water, 'chaleur', 1, {
      environment: 'tropical',
      species: ['neon'],
      infected: 1,
      velvet: 1,
    });
    expect(outcome.ok && outcome.warning).toBe(VELVET_WRONG_TREATMENT);
  });
});

describe('sauvegarde', () => {
  const sickWorld = (): World => {
    const world = cloneWorld(createWorld(5, [{ species: 'neon', count: 4 }]));
    (world.entities[1] as { velvet?: number }).velvet = VELVET_VISIBLE_AT + 12.5;
    (world.entities[3] as { velvet?: number }).velvet = 0;
    return world;
  };

  it('aller-retour avec une maladie en cours', () => {
    const world = sickWorld();
    const result = parseWorld(serializeWorld(world));
    if (!result.ok) {
      throw new Error(result.error);
    }
    expect(progress(result.world.entities)).toEqual([null, VELVET_VISIBLE_AT + 12.5, null, 0]);
    expect(result.world).toEqual(world);
  });

  it('animal sain : aucun champ écrit ; ancienne sauvegarde relue sans maladie', () => {
    const text = serializeWorld(createWorld(5, [{ species: 'neon', count: 4 }]));
    expect(text).not.toContain('"velvet"');
    const result = parseWorld(text);
    expect(result.ok && result.world.entities.every((f) => !('velvet' in f))).toBe(true);
  });

  it('animal qui ne l’attrape pas : progression ignorée à la relecture', () => {
    const world = cloneWorld(createDefaultWorld(42, 'paludarium'));
    const data = JSON.parse(serializeWorld(world)) as { fish: Record<string, unknown>[] };
    for (const fish of data.fish) {
      fish['velvet'] = VELVET_VISIBLE_AT;
    }
    const result = parseWorld(JSON.stringify(data));
    if (!result.ok) {
      throw new Error(result.error);
    }
    for (const fish of result.world.entities) {
      expect('velvet' in fish).toBe(catchesVelvet(fish.species, 'paludarium'));
    }
  });

  it.each([[-1], [VELVET_MAX + 1], ['300'], [null]])('progression invalide %s : refusée', (v) => {
    const data = JSON.parse(serializeWorld(sickWorld())) as { fish: Record<string, unknown>[] };
    data.fish[1]['velvet'] = v;
    const result = parseWorld(JSON.stringify(data));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('velvet');
    }
  });
});

describe('velours=1 : tous les poissons concernés au maximum', () => {
  it('bac tropical : tous ; paludarium : amphibiens épargnés ; aucun tirage', () => {
    const tropical = neons(3);
    velvetAllInPlace(tropical, 'tropical');
    expect(progress(tropical)).toEqual([VELVET_MAX, VELVET_MAX, VELVET_MAX]);
    const palu = animals(['axolotl']);
    velvetAllInPlace(palu, 'paludarium');
    expect(progress(palu)).toEqual([null]);
  });

  it('le stress du bac par défaut est nul (velours absent par défaut)', () => {
    const world = createDefaultWorld(42);
    expect(ichStress(world.water, world.environment)).toBe(0);
  });
});
