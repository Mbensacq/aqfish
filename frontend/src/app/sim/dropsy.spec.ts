import { SIM_DT } from './constants';
import { DEFAULT_DAY_LENGTH_SECONDS } from './daylight';
import { ichDraw } from './disease';
import type { EnvironmentId } from './environment';
import {
  catchesDropsy,
  dropsyAllInPlace,
  dropsyDraw,
  dropsyHealthStress,
  dropsyScales,
  dropsyStage,
  dropsySwelling,
  DROPSY_ADVANCED_AT,
  DROPSY_ADVANCED_HEALTH_STRESS,
  DROPSY_CURE_DAYS,
  DROPSY_HEAL_SPEED,
  DROPSY_MAX,
  DROPSY_SWOLLEN_HEALTH_STRESS,
  DROPSY_VISIBLE_AT,
  DROPSY_WEAK_HEALTH,
  DROPSY_WRONG_TREATMENT,
  isDropsyProgress,
  isDropsyWeak,
  showsDropsy,
  stepDropsyInPlace,
  type DropsySubject,
} from './dropsy';
import { finRotDraw, FIN_ROT_NITRITE } from './fin-rot';
import { fungusDraw } from './fungus';
import { alertTargets } from './alert-animals';
import { dashboardAlerts, dropsyAlert } from './dashboard-alerts';
import { healthSummary } from './health-summary';
import { sickCount } from './quarantine';
import { parseWorld, serializeWorld } from './save';
import { SPECIES, type SpeciesId } from './species';
import { applyTreatmentInPlace } from './treatment';
import { velvetDraw } from './velvet';
import { freshWater, type MutableWaterState } from './water';
import { HEALTH_FLOOR, stepWellbeingInPlace } from './wellbeing';
import {
  advanceInPlace,
  cloneWorld,
  createDefaultWorld,
  createWorld,
  dropsyWorldInPlace,
  treatWorldInPlace,
  type MutableWorld,
  type World,
} from './world';

type Subject = DropsySubject & { health: number };

/** Animaux de test : identifiants consécutifs à partir de 0, santé pleine. */
function animals(species: readonly SpeciesId[], extra: Partial<Subject> = {}): Subject[] {
  return species.map((s, id) => ({ id, species: s, health: 1, ...extra }));
}

const neons = (count: number, extra: Partial<Subject> = {}): Subject[] =>
  animals(Array(count).fill('neon'), extra);

/** Progressions (`null` : sain), dans l'ordre des animaux. */
function progress(list: readonly { readonly dropsy?: number }[]): (number | null)[] {
  return list.map((a) => a.dropsy ?? null);
}

/** Fait avancer `list` de `steps` pas avec `causes` causes d'eau dégradée. */
function run(
  list: Subject[],
  steps: number,
  causes: number,
  options: { environment?: EnvironmentId; seed?: number; dt?: number } = {},
): number {
  const { environment = 'tropical', seed = 42, dt = SIM_DT } = options;
  let healed = 0;
  for (let tick = 1; tick <= steps; tick++) {
    healed += stepDropsyInPlace(list, dt, causes, environment, seed, tick);
  }
  return healed;
}

/** Pas d'une seconde pour les longues durées d'apparition (tests plus rapides en CI). */
const COARSE = 1;

/** Pas pour `seconds` secondes simulées. */
const steps = (seconds: number): number => Math.round(seconds / SIM_DT);

describe('catchesDropsy', () => {
  it('poissons nageurs d’eau douce seulement', () => {
    expect(catchesDropsy('neon', 'tropical')).toBe(true);
    expect(catchesDropsy('koi', 'bassin')).toBe(true);
    expect(catchesDropsy('axolotl', 'paludarium')).toBe(false);
    expect(catchesDropsy('crevette', 'tropical')).toBe(false);
  });
});

describe('stades, rendu et poids dans la santé', () => {
  it('début sans signe, puis ventre gonflé, puis écailles hérissées', () => {
    expect(dropsyStage(undefined)).toBeNull();
    expect(dropsyStage(0)).toBe('debut');
    expect(dropsyStage(DROPSY_VISIBLE_AT - 0.001)).toBe('debut');
    expect(dropsyStage(DROPSY_VISIBLE_AT)).toBe('gonfle');
    expect(dropsyStage(DROPSY_ADVANCED_AT - 0.001)).toBe('gonfle');
    expect(dropsyStage(DROPSY_ADVANCED_AT)).toBe('herisse');
    expect(dropsyStage(DROPSY_MAX)).toBe('herisse');
    expect(dropsyStage(DROPSY_MAX + 1)).toBeNull();
    expect(dropsyStage(-1)).toBeNull();
    expect(dropsyStage(Number.NaN)).toBeNull();
    expect(showsDropsy(0)).toBe(false);
    expect(showsDropsy(DROPSY_VISIBLE_AT)).toBe(true);
    expect(isDropsyProgress(Number.POSITIVE_INFINITY)).toBe(false);
  });

  it('gonflement puis écailles : 0 au début, croissants, bornés à 1', () => {
    expect(dropsySwelling(undefined)).toBe(0);
    expect(dropsySwelling(DROPSY_VISIBLE_AT - 1)).toBe(0);
    expect(dropsySwelling(DROPSY_VISIBLE_AT)).toBe(0);
    expect(dropsySwelling((DROPSY_VISIBLE_AT + DROPSY_ADVANCED_AT) / 2)).toBeCloseTo(0.5);
    expect(dropsySwelling(DROPSY_ADVANCED_AT)).toBe(1);
    expect(dropsySwelling(DROPSY_MAX)).toBe(1);
    expect(dropsyScales(DROPSY_ADVANCED_AT - 1)).toBe(0);
    expect(dropsyScales(DROPSY_ADVANCED_AT)).toBe(0);
    expect(dropsyScales(DROPSY_MAX)).toBe(1);
    expect(dropsyScales(DROPSY_MAX + 1)).toBe(0);
  });

  it('poids dans la santé par stade, plus lourd au stade avancé', () => {
    expect(dropsyHealthStress(undefined)).toBe(0);
    expect(dropsyHealthStress(0)).toBe(0);
    expect(dropsyHealthStress(DROPSY_VISIBLE_AT)).toBe(DROPSY_SWOLLEN_HEALTH_STRESS);
    expect(dropsyHealthStress(DROPSY_MAX)).toBe(DROPSY_ADVANCED_HEALTH_STRESS);
    expect(DROPSY_ADVANCED_HEALTH_STRESS).toBeGreaterThan(DROPSY_SWOLLEN_HEALTH_STRESS);
  });

  it('tirage : dans [0, 1), déterministe, distinct de ceux des autres maladies', () => {
    const draw = dropsyDraw(42, 7, 3);
    expect(draw).toBeGreaterThanOrEqual(0);
    expect(draw).toBeLessThan(1);
    expect(dropsyDraw(42, 7, 3)).toBe(draw);
    expect(dropsyDraw(43, 7, 3)).not.toBe(draw);
    for (const other of [ichDraw, finRotDraw, velvetDraw, fungusDraw]) {
      expect(other(42, 7, 3)).not.toBe(draw);
    }
  });

  it('affaibli : santé finie sous le seuil seulement', () => {
    expect(isDropsyWeak(1)).toBe(false);
    expect(isDropsyWeak(DROPSY_WEAK_HEALTH)).toBe(false);
    expect(isDropsyWeak(DROPSY_WEAK_HEALTH - 0.01)).toBe(true);
    expect(isDropsyWeak(0)).toBe(true);
    expect(isDropsyWeak(Number.NaN)).toBe(false);
    expect(isDropsyWeak(Number.NEGATIVE_INFINITY)).toBe(false);
  });
});

describe('stepDropsyInPlace : apparition', () => {
  it('eau dégradée, animaux en forme : aucun cas, toutes graines', () => {
    for (const seed of [1, 42, 999]) {
      const list = neons(12);
      run(list, 3 * 3600, 2, { seed, dt: COARSE });
      expect(progress(list).every((p) => p === null)).toBe(true);
    }
  });

  it('eau propre, animaux affaiblis : aucun cas (aucun tirage sans cause)', () => {
    const list = neons(12, { health: HEALTH_FLOOR });
    run(list, 3 * 3600, 0, { dt: COARSE });
    expect(progress(list).every((p) => p === null)).toBe(true);
  });

  it('affaiblis en eau dégradée : des cas, identiques à graine fixe, autres avec une autre graine', () => {
    const once = (seed: number): (number | null)[] => {
      const list = neons(12, { health: HEALTH_FLOOR });
      run(list, 3600, 1, { seed, dt: COARSE });
      return progress(list);
    };
    const first = once(42);
    expect(first.some((p) => p !== null)).toBe(true);
    expect(first.some((p) => p === null)).toBe(true);
    expect(once(42)).toEqual(first);
    expect(once(7)).not.toEqual(first);
  });

  it('deux causes : plus de cas qu’une seule', () => {
    const cases = (causes: number): number => {
      let total = 0;
      for (const seed of [1, 2, 3, 4, 5]) {
        const list = neons(20, { health: HEALTH_FLOOR });
        run(list, 1800, causes, { seed, dt: COARSE });
        total += progress(list).filter((p) => p !== null).length;
      }
      return total;
    };
    expect(cases(2)).toBeGreaterThan(cases(1));
  });

  it('seuls les affaiblis l’attrapent : pas de contagion à leurs voisins en forme', () => {
    const list = [...neons(6, { health: HEALTH_FLOOR }), ...neons(6)].map((a, id) => ({
      ...a,
      id,
    }));
    run(list, 3 * 3600, 2, { dt: COARSE });
    expect(progress(list.slice(6)).every((p) => p === null)).toBe(true);
    expect(progress(list.slice(0, 6)).some((p) => p !== null)).toBe(true);
  });

  it('amphibiens, invertébrés et récif : jamais touchés', () => {
    const palu = animals(['axolotl', 'axolotl'], { health: HEALTH_FLOOR });
    run(palu, 3 * 3600, 2, { environment: 'paludarium', dt: COARSE });
    expect(progress(palu)).toEqual([null, null]);
    const shrimp = animals(['crevette'], { health: HEALTH_FLOOR });
    run(shrimp, 3 * 3600, 2, { dt: COARSE });
    expect(progress(shrimp)).toEqual([null]);
  });

  it('causes non finies ou négatives : comptent pour zéro', () => {
    for (const causes of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      const list = neons(12, { health: HEALTH_FLOOR });
      run(list, 3600, causes, { dt: COARSE });
      expect(progress(list).every((p) => p === null)).toBe(true);
    }
  });

  it('pas invalide : lève sans rien changer', () => {
    const list = neons(2, { dropsy: 10 });
    for (const dt of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => stepDropsyInPlace(list, dt, 1, 'tropical', 42, 1)).toThrow(RangeError);
    }
    expect(progress(list)).toEqual([10, 10]);
  });
});

describe('stepDropsyInPlace : évolution et soins', () => {
  it('eau dégradée : progresse jusqu’au maximum puis s’y arrête', () => {
    const list = neons(1, { dropsy: 0 });
    run(list, steps(DROPSY_MAX + 600), 1);
    expect(progress(list)).toEqual([DROPSY_MAX]);
  });

  it('eau dégradée : la progression ne dépend pas de la santé', () => {
    const fit = neons(1, { dropsy: 100 });
    const weak = neons(1, { dropsy: 100, health: HEALTH_FLOOR });
    run(fit, steps(60), 2);
    run(weak, steps(60), 2);
    expect(progress(fit)).toEqual(progress(weak));
  });

  it('eau propre avant le stade avancé : recule et guérit en DROPSY_CURE_DAYS jours au plus', () => {
    const list = neons(1, { dropsy: DROPSY_ADVANCED_AT - 0.001 });
    const day = DEFAULT_DAY_LENGTH_SECONDS;
    run(list, steps(day), 0);
    const left = list[0].dropsy as number;
    expect(left).toBeGreaterThan(0);
    expect(left).toBeCloseTo(DROPSY_ADVANCED_AT - day * DROPSY_HEAL_SPEED, 0);
    const healed = run(list, steps((DROPSY_CURE_DAYS - 1) * day + 60), 0);
    expect(progress(list)).toEqual([null]);
    expect(healed).toBe(1);
  });

  it('eau propre au stade avancé : ne recule plus (pronostic réservé)', () => {
    for (const start of [DROPSY_ADVANCED_AT, DROPSY_MAX]) {
      const list = neons(1, { dropsy: start });
      const healed = run(list, steps(DEFAULT_DAY_LENGTH_SECONDS), 0);
      expect(progress(list)).toEqual([start]);
      expect(healed).toBe(0);
    }
  });

  it('progression corrompue, ou portée par un animal qui ne l’attrape pas : effacée', () => {
    const list: Subject[] = [
      { id: 0, species: 'neon', health: 1, dropsy: -5 },
      { id: 1, species: 'neon', health: 1, dropsy: Number.NaN },
      { id: 2, species: 'crevette', health: 1, dropsy: 100 },
    ];
    const healed = run(list, 1, 1);
    expect(progress(list)).toEqual([null, null, null]);
    expect(healed).toBe(0);
  });
});

describe('santé, synthèse et alerte', () => {
  it('la santé baisse au ventre gonflé, plus vite au stade avancé, pas au début', () => {
    const after = (dropsy: number | undefined): number => {
      const list = [{ species: 'neon' as SpeciesId, health: 1, hunger: 0, dropsy }];
      stepWellbeingInPlace(list, 10, false, (sp) => SPECIES[sp]);
      return list[0].health;
    };
    expect(after(0)).toBe(after(undefined));
    expect(after(DROPSY_VISIBLE_AT)).toBeLessThan(after(0));
    expect(after(DROPSY_MAX)).toBeLessThan(after(DROPSY_VISIBLE_AT));
  });

  it('synthèse : ventre gonflé compté à part, début non ; alerte critique au stade avancé', () => {
    const base = { species: 'neon' as SpeciesId, health: 1, hunger: 0 };
    const summary = healthSummary([
      { ...base, dropsy: 0 },
      { ...base, dropsy: DROPSY_VISIBLE_AT },
      { ...base, dropsy: DROPSY_MAX },
    ]);
    expect(summary.dropsy).toBe(2);
    expect(summary.dropsyAdvanced).toBe(1);
    expect(summary.diseased).toBe(2);
    expect(summary.sick).toBe(2);
    const alert = dropsyAlert(summary);
    expect(alert?.severity).toBe('critique');
    expect(alert?.message).toContain('écailles hérissées');
    expect(alert?.cause).toContain('2 animaux');
    expect(alert?.cause).toContain('1 au stade avancé');
    expect(alert?.action).toContain('quarantaine');
    expect(alert?.action).toContain('euthanasie sans souffrance');
    expect(alert?.wiki).toBe('maladies');
  });

  it('ventre gonflé seul : alerte « attention », sans conseil d’euthanasie', () => {
    const alert = dropsyAlert(
      healthSummary([{ species: 'neon', health: 1, hunger: 0, dropsy: DROPSY_VISIBLE_AT }]),
    );
    expect(alert?.severity).toBe('attention');
    expect(alert?.message).toContain('ventre gonflé');
    expect(alert?.action).toContain('quarantaine');
    expect(alert?.action).not.toContain('euthanasie');
    expect(dropsyAlert(healthSummary([{ species: 'neon', health: 1, hunger: 0 }]))).toBeNull();
    expect(
      dropsyAlert(healthSummary([{ species: 'neon', health: 1, hunger: 0, dropsy: 0 }])),
    ).toBeNull();
  });

  it('animaux désignés par l’alerte : ceux au ventre gonflé, pas l’alerte de santé', () => {
    const list = [
      { id: 0, species: 'neon' as SpeciesId, health: 0.1, hunger: 0, dropsy: DROPSY_MAX },
      { id: 1, species: 'neon' as SpeciesId, health: 1, hunger: 0 },
    ];
    const targets = alertTargets(list, { temperature: 25, ph: 7, mixes: [] });
    expect(targets.dropsy.ids).toEqual([0]);
    expect(targets.health.ids).toEqual([]);
  });
});

describe('traitement : contexte du geste', () => {
  it('hydropisie avec un autre malade : le médicament est accepté, avec la mise en garde', () => {
    const water = freshWater('tropical') as MutableWaterState;
    const outcome = applyTreatmentInPlace(water, 'medicament', 1, {
      environment: 'tropical',
      species: ['neon', 'neon'],
      infected: 1,
      dropsy: 1,
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.ok ? outcome.warning : '').toContain(DROPSY_WRONG_TREATMENT);
  });

  it('sans hydropisie : pas de mise en garde d’hydropisie', () => {
    const water = freshWater('tropical') as MutableWaterState;
    const outcome = applyTreatmentInPlace(water, 'medicament', 1, {
      environment: 'tropical',
      species: ['neon'],
      infected: 1,
    });
    expect(outcome.ok && outcome.warning).toBeFalsy();
  });
});

describe('monde : hydropisie dans la boucle à pas fixe', () => {
  const tank = (seed = 42): MutableWorld =>
    cloneWorld(createWorld(seed, [{ species: 'neon', count: 12 }]));

  it('bac par défaut : aucun cas (eau propre)', () => {
    const world = cloneWorld(createDefaultWorld(42));
    advanceInPlace(world, 36_000);
    expect(world.entities.every((f) => f.dropsy === undefined)).toBe(true);
  }, 180_000);

  it('eau chargée longtemps : les poissons affaiblis finissent atteints, de façon reproductible', () => {
    const once = (): (number | null)[] => {
      const world = cloneWorld(createWorld(42, [{ species: 'neon', count: 24 }]));
      for (const fish of world.entities) {
        (fish as { health: number }).health = 0.2;
      }
      // Eau entretenue mauvaise (le filtre ferait baisser les nitrites) : remise à chaque minute.
      for (let minute = 0; minute < 10; minute++) {
        (world.water as MutableWaterState).nitrite = 10 * FIN_ROT_NITRITE;
        (world.water as MutableWaterState).ammonia = 10;
        advanceInPlace(world, steps(60));
      }
      return progress(world.entities);
    };
    const first = once();
    expect(first.some((p) => p !== null)).toBe(true);
    expect(once()).toEqual(first);
  }, 180_000);

  it('quarantaine et sauvegarde : compté parmi les malades du bac', () => {
    const world = tank();
    dropsyWorldInPlace(world);
    expect(sickCount({ world })).toBe(12);
  });

  it('le médicament seul est refusé (aucun malade traitable) et n’y change rien', () => {
    const world = tank();
    dropsyWorldInPlace(world, DROPSY_VISIBLE_AT);
    const outcome = treatWorldInPlace(world, 'medicament', 1);
    expect(outcome.ok).toBe(false);
  });

  it('alerte « Hydropisie » au tableau de bord d’un bac atteint', () => {
    const world = tank();
    dropsyWorldInPlace(world);
    const summary = healthSummary(world.entities);
    expect(summary.dropsy).toBe(12);
    expect(summary.dropsyAdvanced).toBe(12);
    expect(dropsyAlert(summary)?.message).toContain('Hydropisie');
    expect(typeof dashboardAlerts).toBe('function');
  });

  it('eau propre : un cas pris tôt guérit, un cas avancé reste', () => {
    const world = tank();
    dropsyWorldInPlace(world, DROPSY_VISIBLE_AT);
    (world.entities[0] as { dropsy?: number }).dropsy = DROPSY_MAX;
    advanceInPlace(world, steps((DROPSY_VISIBLE_AT / DROPSY_HEAL_SPEED) * 1.05));
    expect(world.entities[0].dropsy).toBe(DROPSY_MAX);
    expect(world.entities.slice(1).every((f) => f.dropsy === undefined)).toBe(true);
  }, 180_000);

  it('mode décor : maladie en pause', () => {
    const world = tank();
    (world.entities[0] as { dropsy?: number }).dropsy = 10;
    (world.water as MutableWaterState).nitrite = 50;
    world.careMode = 'decor';
    advanceInPlace(world, 600);
    expect(world.entities[0].dropsy).toBe(10);
  }, 120_000);
});

describe('sauvegarde', () => {
  const sickWorld = (): World => {
    const world = cloneWorld(createWorld(5, [{ species: 'neon', count: 4 }]));
    (world.entities[1] as { dropsy?: number }).dropsy = DROPSY_VISIBLE_AT + 12.5;
    (world.entities[3] as { dropsy?: number }).dropsy = 0;
    return world;
  };

  it('aller-retour avec une maladie en cours', () => {
    const world = sickWorld();
    const result = parseWorld(serializeWorld(world));
    if (!result.ok) {
      throw new Error(result.error);
    }
    expect(progress(result.world.entities)).toEqual([null, DROPSY_VISIBLE_AT + 12.5, null, 0]);
    expect(result.world).toEqual(world);
  });

  it('animal sain : aucun champ écrit ; ancienne sauvegarde relue sans maladie', () => {
    const text = serializeWorld(createWorld(5, [{ species: 'neon', count: 4 }]));
    expect(text).not.toContain('"dropsy"');
    const result = parseWorld(text);
    expect(result.ok && result.world.entities.every((f) => !('dropsy' in f))).toBe(true);
  });

  it.each([[-1], [DROPSY_MAX + 1], ['300'], [null]])('progression invalide %s : refusée', (v) => {
    const data = JSON.parse(serializeWorld(sickWorld())) as { fish: Record<string, unknown>[] };
    data.fish[1]['dropsy'] = v;
    const result = parseWorld(JSON.stringify(data));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('dropsy');
    }
  });
});

describe('hydropisie=1 : tous les poissons concernés', () => {
  it('bac tropical : tous au maximum ; paludarium : amphibiens épargnés ; stade au choix', () => {
    const tropical = neons(3);
    dropsyAllInPlace(tropical, 'tropical');
    expect(progress(tropical)).toEqual([DROPSY_MAX, DROPSY_MAX, DROPSY_MAX]);
    const palu = animals(['axolotl']);
    dropsyAllInPlace(palu, 'paludarium');
    expect(progress(palu)).toEqual([null]);
    const swollen = neons(1);
    dropsyAllInPlace(swollen, 'tropical', DROPSY_ADVANCED_AT - 1);
    expect(dropsyStage(swollen[0].dropsy)).toBe('gonfle');
  });
});
