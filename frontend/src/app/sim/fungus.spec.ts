import { SIM_DT } from './constants';
import { DEFAULT_DAY_LENGTH_SECONDS } from './daylight';
import { ICH_AGGRAVATED_AT, ichDraw } from './disease';
import type { EnvironmentId } from './environment';
import { FIN_ROT_MAX, finRotDraw } from './fin-rot';
import {
  catchesFungus,
  fungusAllInPlace,
  fungusCauses,
  fungusDraw,
  fungusHealthStress,
  fungusSeverity,
  fungusStage,
  FUNGUS_ADVANCED_AT,
  FUNGUS_ADVANCED_HEALTH_STRESS,
  FUNGUS_CURE_DAYS,
  FUNGUS_HEAL_SPEED,
  FUNGUS_MAX,
  FUNGUS_VISIBLE_AT,
  FUNGUS_VISIBLE_HEALTH_STRESS,
  FUNGUS_WEAK_HEALTH,
  FUNGUS_WRONG_TREATMENT,
  isFungusProgress,
  isWounded,
  showsFungus,
  stepFungusInPlace,
  type FungusSubject,
} from './fungus';
import { dashboardAlerts, fungusAlert } from './dashboard-alerts';
import { healthSummary } from './health-summary';
import { parseWorld, serializeWorld } from './save';
import { SPECIES, type SpeciesId } from './species';
import { applyTreatmentInPlace, VELVET_WRONG_TREATMENT } from './treatment';
import { VELVET_MAX, velvetDraw } from './velvet';
import { freshWater, type MutableWaterState } from './water';
import { HEALTH_FLOOR, stepWellbeingInPlace } from './wellbeing';
import {
  advanceInPlace,
  cloneWorld,
  createDefaultWorld,
  createWorld,
  fungusWorldInPlace,
  treatWorldInPlace,
  type MutableWorld,
  type World,
} from './world';

type Subject = FungusSubject & {
  health: number;
  ich?: number;
  finRot?: number;
  velvet?: number;
};

/** Animaux de test : identifiants consécutifs à partir de 0, santé pleine. */
function animals(species: readonly SpeciesId[], extra: Partial<Subject> = {}): Subject[] {
  return species.map((s, id) => ({ id, species: s, health: 1, ...extra }));
}

/** Progressions (`null` : sain), dans l'ordre des animaux. */
function progress(list: readonly { readonly fungus?: number }[]): (number | null)[] {
  return list.map((a) => a.fungus ?? null);
}

/** Fait avancer `list` de `steps` pas. */
function run(
  list: Subject[],
  steps: number,
  options: {
    environment?: EnvironmentId;
    seed?: number;
    treated?: boolean;
    clean?: boolean;
  } = {},
): number {
  const { environment = 'tropical', seed = 42, treated = false, clean = true } = options;
  let healed = 0;
  for (let tick = 1; tick <= steps; tick++) {
    healed += stepFungusInPlace(list, SIM_DT, environment, seed, tick, treated, clean);
  }
  return healed;
}

const neons = (count: number, extra: Partial<Subject> = {}): Subject[] =>
  animals(Array(count).fill('neon'), extra);

describe('catchesFungus', () => {
  it('poissons nageurs d’eau douce seulement', () => {
    expect(catchesFungus('neon', 'tropical')).toBe(true);
    expect(catchesFungus('koi', 'bassin')).toBe(true);
    expect(catchesFungus('axolotl', 'paludarium')).toBe(false);
    expect(catchesFungus('neon', 'recif')).toBe(false);
  });
});

describe('stades, intensité et poids dans la santé', () => {
  it('début sans signe, puis coton, puis stade avancé', () => {
    expect(fungusStage(undefined)).toBeNull();
    expect(fungusStage(0)).toBe('debut');
    expect(fungusStage(FUNGUS_VISIBLE_AT - 0.01)).toBe('debut');
    expect(fungusStage(FUNGUS_VISIBLE_AT)).toBe('coton');
    expect(fungusStage(FUNGUS_ADVANCED_AT)).toBe('avance');
    expect(fungusStage(FUNGUS_MAX)).toBe('avance');
    for (const bad of [-1, FUNGUS_MAX + 1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(fungusStage(bad)).toBeNull();
      expect(isFungusProgress(bad)).toBe(false);
      expect(showsFungus(bad)).toBe(false);
      expect(fungusSeverity(bad)).toBe(0);
    }
  });

  it('intensité 0 au début, linéaire ensuite ; poids dans la santé par stade', () => {
    expect(fungusSeverity(FUNGUS_VISIBLE_AT - 1)).toBe(0);
    expect(fungusSeverity(FUNGUS_VISIBLE_AT)).toBe(0);
    expect(fungusSeverity(FUNGUS_MAX)).toBe(1);
    expect(fungusHealthStress(undefined)).toBe(0);
    expect(fungusHealthStress(10)).toBe(0);
    expect(fungusHealthStress(FUNGUS_VISIBLE_AT)).toBe(FUNGUS_VISIBLE_HEALTH_STRESS);
    expect(fungusHealthStress(FUNGUS_MAX)).toBe(FUNGUS_ADVANCED_HEALTH_STRESS);
  });

  it('tirage : dans [0, 1), déterministe, distinct de ceux des autres maladies', () => {
    const a = fungusDraw(42, 10, 3);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(1);
    expect(fungusDraw(42, 10, 3)).toBe(a);
    expect(fungusDraw(43, 10, 3)).not.toBe(a);
    for (const other of [ichDraw(42, 10, 3), finRotDraw(42, 10, 3), velvetDraw(42, 10, 3)]) {
      expect(other).not.toBe(a);
    }
  });
});

describe('portes d’entrée', () => {
  it('animal sain : aucune ; blessure et affaiblissement comptent chacun pour un', () => {
    expect(fungusCauses({ health: 1 })).toBe(0);
    expect(fungusCauses({ health: FUNGUS_WEAK_HEALTH })).toBe(0);
    expect(fungusCauses({ health: FUNGUS_WEAK_HEALTH - 0.01 })).toBe(1);
    expect(fungusCauses({ health: 1, finRot: FIN_ROT_MAX })).toBe(1);
    expect(fungusCauses({ health: HEALTH_FLOOR, velvet: VELVET_MAX })).toBe(2);
  });

  it('blessure : signes visibles seulement, pas une incubation', () => {
    expect(isWounded({})).toBe(false);
    expect(isWounded({ ich: 0, finRot: 0, velvet: 0 })).toBe(false);
    expect(isWounded({ ich: ICH_AGGRAVATED_AT })).toBe(true);
    expect(isWounded({ finRot: FIN_ROT_MAX })).toBe(true);
    expect(isWounded({ velvet: VELVET_MAX })).toBe(true);
  });

  it('santé non finie : ne compte pas', () => {
    expect(fungusCauses({ health: Number.NaN })).toBe(0);
    expect(fungusCauses({ health: Number.NEGATIVE_INFINITY })).toBe(0);
  });
});

describe('stepFungusInPlace : apparition', () => {
  it('animaux sains en eau propre : aucun cas en 200 000 pas, toutes graines', () => {
    for (const seed of [1, 42, 0xffffffff]) {
      const list = neons(12);
      run(list, 200_000, { seed });
      expect(progress(list).every((p) => p === null)).toBe(true);
    }
  }, 30_000);

  it('animaux blessés : des cas, identiques à graine fixe, autres avec une autre graine', () => {
    const once = (seed: number): (number | null)[] => {
      const list = neons(12, { finRot: FIN_ROT_MAX });
      run(list, 20_000, { seed });
      return progress(list);
    };
    const first = once(42);
    expect(first.some((p) => p !== null)).toBe(true);
    expect(once(42)).toEqual(first);
    expect(once(7)).not.toEqual(first);
  }, 30_000);

  it('animaux affaiblis (santé au plancher) : des cas, même sans blessure', () => {
    const list = neons(12, { health: HEALTH_FLOOR });
    run(list, 20_000);
    expect(progress(list).some((p) => p !== null)).toBe(true);
  }, 30_000);

  it('blessé et affaibli : plus de cas que blessé seulement', () => {
    const count = (extra: Partial<Subject>): number => {
      const list = neons(200, extra);
      run(list, 2_000);
      return progress(list).filter((p) => p !== null).length;
    };
    expect(count({ velvet: VELVET_MAX, health: HEALTH_FLOOR })).toBeGreaterThan(
      count({ velvet: VELVET_MAX }),
    );
  }, 30_000);

  it('seul l’animal blessé l’attrape : pas de contagion à ses voisins sains', () => {
    const list = neons(6);
    list[2].finRot = FIN_ROT_MAX;
    run(list, 50_000);
    expect(list[2].fungus).toBeDefined();
    expect(progress(list).filter((p) => p !== null)).toHaveLength(1);
  }, 30_000);

  it('sous médicament : aucune apparition, même blessé', () => {
    const list = neons(12, { finRot: FIN_ROT_MAX, health: HEALTH_FLOOR });
    run(list, 20_000, { treated: true });
    expect(progress(list).every((p) => p === null)).toBe(true);
  }, 30_000);

  it('amphibiens et récif : jamais touchés, même blessés et affaiblis', () => {
    const palu = animals(['axolotl'], { health: HEALTH_FLOOR });
    run(palu, 20_000, { environment: 'paludarium' });
    expect(progress(palu)).toEqual([null]);
    const reef = animals(['neon'], { health: HEALTH_FLOOR });
    run(reef, 20_000, { environment: 'recif' });
    expect(progress(reef)).toEqual([null]);
  }, 30_000);

  it('pas invalide : lève sans rien changer', () => {
    const list = neons(2, { fungus: 10 });
    for (const dt of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => stepFungusInPlace(list, dt, 'tropical', 42, 1)).toThrow(RangeError);
    }
    expect(progress(list)).toEqual([10, 10]);
  });
});

describe('stepFungusInPlace : maladie, traitement et guérison', () => {
  it('sans traitement : progresse jusqu’au maximum puis s’y arrête, même blessure refermée', () => {
    const list = neons(1, { fungus: 0 });
    run(list, (FUNGUS_MAX + 60) / SIM_DT);
    expect(list[0].fungus).toBe(FUNGUS_MAX);
  });

  it('médicament en eau propre : recule et guérit en FUNGUS_CURE_DAYS jours au plus', () => {
    const list = neons(3, { fungus: FUNGUS_MAX });
    const steps = Math.ceil((FUNGUS_CURE_DAYS * DEFAULT_DAY_LENGTH_SECONDS) / SIM_DT) + 1;
    expect(run(list, steps / 2, { treated: true })).toBe(0);
    expect(list[0].fungus).toBeCloseTo(FUNGUS_MAX / 2, 0);
    expect(run(list, steps, { treated: true })).toBe(3);
    expect(progress(list)).toEqual([null, null, null]);
    expect(FUNGUS_HEAL_SPEED).toBeGreaterThan(0);
  }, 30_000);

  it('médicament en eau chargée : ne progresse plus, ne recule pas', () => {
    const list = neons(1, { fungus: FUNGUS_VISIBLE_AT });
    run(list, 10_000, { treated: true, clean: false });
    expect(list[0].fungus).toBe(FUNGUS_VISIBLE_AT);
  }, 30_000);

  it('eau propre sans médicament : la maladie progresse', () => {
    const list = neons(1, { fungus: FUNGUS_VISIBLE_AT });
    run(list, 600, { clean: true });
    expect(list[0].fungus).toBeGreaterThan(FUNGUS_VISIBLE_AT);
  });

  it('animal au plancher de santé (le jeu ne fait pas mourir) : reste malade, guérit traité', () => {
    const list = neons(1, { fungus: FUNGUS_MAX, health: HEALTH_FLOOR });
    run(list, 2_000);
    expect(list[0].fungus).toBe(FUNGUS_MAX);
    run(list, (FUNGUS_CURE_DAYS * DEFAULT_DAY_LENGTH_SECONDS) / SIM_DT + 2, { treated: true });
    expect(list[0].fungus).toBeUndefined();
  }, 30_000);

  it('progression corrompue, ou portée par un animal qui ne l’attrape pas : effacée', () => {
    const list = animals(['neon', 'axolotl']);
    list[0].fungus = Number.NaN;
    list[1].fungus = 100;
    stepFungusInPlace(list, SIM_DT, 'paludarium', 42, 1);
    expect(progress(list)).toEqual([null, null]);
  });
});

describe('santé et alerte', () => {
  it('baisse au coton, deux fois plus vite au stade avancé, pas au début', () => {
    const at = (fungus: number | undefined): number => {
      const list = [{ species: 'neon' as SpeciesId, hunger: 0, health: 1, fungus }];
      stepWellbeingInPlace(list, 10, false, (s) => SPECIES[s]);
      return 1 - list[0].health;
    };
    expect(at(undefined)).toBe(0);
    expect(at(10)).toBe(0);
    expect(at(FUNGUS_VISIBLE_AT)).toBeGreaterThan(0);
    expect(at(FUNGUS_MAX)).toBeCloseTo(2 * at(FUNGUS_VISIBLE_AT), 6);
  });

  it('synthèse et alerte : coton compté à part, critique au stade avancé', () => {
    const summary = healthSummary([
      { species: 'neon', health: 1, hunger: 0, fungus: FUNGUS_VISIBLE_AT },
      { species: 'neon', health: 1, hunger: 0, fungus: FUNGUS_MAX },
      { species: 'neon', health: 1, hunger: 0, fungus: 0 },
    ]);
    expect(summary.fungus).toBe(2);
    expect(summary.fungusAdvanced).toBe(1);
    expect(summary.diseased).toBe(2);
    expect(summary.velvet).toBe(0);
    const alert = fungusAlert(summary);
    expect(alert?.severity).toBe('critique');
    expect(alert?.wiki).toBe('maladies');
    expect(alert?.action).toContain('Médicament');
    expect(alert?.action).toContain('eau propre');
    expect(fungusAlert(healthSummary([{ species: 'neon', health: 1, hunger: 0 }]))).toBeNull();
  });
});

describe('monde : champignons dans la boucle à pas fixe', () => {
  const tank = (seed = 42): MutableWorld =>
    cloneWorld(createWorld(seed, [{ species: 'neon', count: 12 }]));

  it('bac par défaut : aucun cas tant que les animaux restent en forme', () => {
    const world = cloneWorld(createDefaultWorld(42));
    advanceInPlace(world, 15_000);
    expect(world.entities.every((f) => f.health >= FUNGUS_WEAK_HEALTH)).toBe(true);
    expect(world.entities.every((f) => f.fungus === undefined)).toBe(true);
  }, 60_000);

  it('bac par défaut jamais nourri : les animaux affaiblis par la faim finissent atteints', () => {
    const world = cloneWorld(createDefaultWorld(42));
    advanceInPlace(world, 36_000);
    const sick = world.entities.filter((f) => f.fungus !== undefined);
    expect(sick.length).toBeGreaterThan(0);
    expect(sick.every((f) => f.health < FUNGUS_WEAK_HEALTH)).toBe(true);
  }, 60_000);

  it('poissons blessés (velours) : des cas, identiques d’une exécution à l’autre', () => {
    const once = (): (number | null)[] => {
      const world = tank();
      for (const fish of world.entities) {
        (fish as { velvet?: number }).velvet = VELVET_MAX;
      }
      advanceInPlace(world, 36_000);
      return progress(world.entities);
    };
    const first = once();
    expect(first.some((p) => p !== null)).toBe(true);
    expect(once()).toEqual(first);
  }, 60_000);

  it('médicament en eau propre : guérison ; redosé tous les deux jours', () => {
    const world = tank();
    fungusWorldInPlace(world);
    const outcome = treatWorldInPlace(world, 'medicament', 1);
    expect(outcome.ok).toBe(true);
    expect(outcome.ok && outcome.warning).toBeFalsy();
    const day = DEFAULT_DAY_LENGTH_SECONDS / SIM_DT;
    advanceInPlace(world, 1.5 * day);
    expect(world.entities.every((f) => f.fungus !== undefined)).toBe(true);
    expect(treatWorldInPlace(world, 'medicament', 1).ok).toBe(true);
    advanceInPlace(world, day);
    expect(world.entities.every((f) => f.fungus === undefined)).toBe(true);
  }, 60_000);

  it('double traitement : pas de guérison plus rapide qu’une seule dose', () => {
    const after = (doses: number): (number | null)[] => {
      const world = tank();
      fungusWorldInPlace(world);
      for (let i = 0; i < doses; i++) {
        treatWorldInPlace(world, 'medicament', 1);
      }
      advanceInPlace(world, 600);
      return progress(world.entities);
    };
    expect(after(2)).toEqual(after(1));
  }, 30_000);

  it('eau chargée : le médicament seul ne guérit pas', () => {
    const world = tank();
    fungusWorldInPlace(world);
    (world.water as MutableWaterState).nitrite = 50;
    expect(treatWorldInPlace(world, 'medicament', 1).ok).toBe(true);
    advanceInPlace(world, 600);
    expect(world.entities.every((f) => f.fungus === FUNGUS_MAX)).toBe(true);
  }, 30_000);

  it('erreur de traitement : le sel n’y fait rien et le dit', () => {
    const world = tank();
    fungusWorldInPlace(world);
    const outcome = treatWorldInPlace(world, 'sel', 1);
    expect(outcome.ok).toBe(true);
    expect(outcome.ok ? outcome.warning : '').toContain(FUNGUS_WRONG_TREATMENT);
    advanceInPlace(world, 600);
    expect(world.entities.every((f) => f.fungus === FUNGUS_MAX)).toBe(true);
  }, 30_000);

  it('alerte « Champignons » au tableau de bord d’un bac atteint', () => {
    const world = tank();
    fungusWorldInPlace(world);
    const summary = healthSummary(world.entities);
    expect(summary.fungus).toBe(12);
    expect(summary.ich).toBe(0);
    expect(fungusAlert(summary)?.message).toContain('Champignons');
    expect(typeof dashboardAlerts).toBe('function');
  });

  it('mode décor : maladie en pause', () => {
    const world = tank();
    (world.entities[0] as { fungus?: number }).fungus = 10;
    world.careMode = 'decor';
    advanceInPlace(world, 600);
    expect(world.entities[0].fungus).toBe(10);
  }, 30_000);
});

describe('traitement : contexte du geste', () => {
  it('champignons seuls : le médicament est accepté sans mise en garde', () => {
    const water = freshWater('tropical') as MutableWaterState;
    const outcome = applyTreatmentInPlace(water, 'medicament', 1, {
      environment: 'tropical',
      species: ['neon'],
      infected: 1,
      fungus: 1,
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.ok && outcome.warning).toBeFalsy();
  });

  it('chaleur contre velours et champignons : les deux mises en garde', () => {
    const water = freshWater('tropical') as MutableWaterState;
    const outcome = applyTreatmentInPlace(water, 'chaleur', 1, {
      environment: 'tropical',
      species: ['neon'],
      infected: 2,
      velvet: 1,
      fungus: 1,
    });
    expect(outcome.ok && outcome.warning).toBe(
      `${VELVET_WRONG_TREATMENT} ${FUNGUS_WRONG_TREATMENT}`,
    );
  });
});

describe('sauvegarde', () => {
  const sickWorld = (): World => {
    const world = cloneWorld(createWorld(5, [{ species: 'neon', count: 4 }]));
    (world.entities[1] as { fungus?: number }).fungus = FUNGUS_VISIBLE_AT + 12.5;
    (world.entities[3] as { fungus?: number }).fungus = 0;
    return world;
  };

  it('aller-retour avec une maladie en cours', () => {
    const world = sickWorld();
    const result = parseWorld(serializeWorld(world));
    if (!result.ok) {
      throw new Error(result.error);
    }
    expect(progress(result.world.entities)).toEqual([null, FUNGUS_VISIBLE_AT + 12.5, null, 0]);
    expect(result.world).toEqual(world);
  });

  it('animal sain : aucun champ écrit ; ancienne sauvegarde relue sans maladie', () => {
    const text = serializeWorld(createWorld(5, [{ species: 'neon', count: 4 }]));
    expect(text).not.toContain('"fungus"');
    const result = parseWorld(text);
    expect(result.ok && result.world.entities.every((f) => !('fungus' in f))).toBe(true);
  });

  it('animal qui ne l’attrape pas : progression ignorée à la relecture', () => {
    const world = cloneWorld(createDefaultWorld(42, 'paludarium'));
    const data = JSON.parse(serializeWorld(world)) as { fish: Record<string, unknown>[] };
    for (const fish of data.fish) {
      fish['fungus'] = FUNGUS_VISIBLE_AT;
    }
    const result = parseWorld(JSON.stringify(data));
    if (!result.ok) {
      throw new Error(result.error);
    }
    for (const fish of result.world.entities) {
      expect('fungus' in fish).toBe(catchesFungus(fish.species, 'paludarium'));
    }
  });

  it.each([[-1], [FUNGUS_MAX + 1], ['300'], [null]])('progression invalide %s : refusée', (v) => {
    const data = JSON.parse(serializeWorld(sickWorld())) as { fish: Record<string, unknown>[] };
    data.fish[1]['fungus'] = v;
    const result = parseWorld(JSON.stringify(data));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('fungus');
    }
  });
});

describe('champignons=1 : tous les poissons concernés au maximum', () => {
  it('bac tropical : tous ; paludarium : amphibiens épargnés ; aucun tirage', () => {
    const tropical = neons(3);
    fungusAllInPlace(tropical, 'tropical');
    expect(progress(tropical)).toEqual([FUNGUS_MAX, FUNGUS_MAX, FUNGUS_MAX]);
    const palu = animals(['axolotl']);
    fungusAllInPlace(palu, 'paludarium');
    expect(progress(palu)).toEqual([null]);
  });
});
