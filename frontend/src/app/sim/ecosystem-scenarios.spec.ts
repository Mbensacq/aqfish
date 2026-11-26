import { describe, expect, it } from 'vitest';

import { startFilterCyclingInPlace } from './filter-maturation';
import {
  NORMAL_CARE,
  runScenario,
  SCENARIO_DAY_SECONDS,
  type EcosystemScenario,
  type ScenarioCare,
  type ScenarioRecord,
} from './testing/ecosystem-scenario';
import type { MutableWaterState } from './water';
import { COMPOUND_THRESHOLDS } from './water-quality';
import { canAdd, populationOf } from './tank-capacity';
import { ENVIRONMENT_IDS } from './environment';
import {
  advanceInPlace,
  birthYoungInPlace,
  cloneWorld,
  createDefaultWorld,
  createWorld,
  setWorldMortalityInPlace,
} from './world';
import { HEALTH_FLOOR } from './health-scale';
import { sampleAlgae } from './algae';
import { FRY_SAFE_AGE, isFry } from './fry';
import { SIM_DT } from './constants';
import type { Fish } from './swimmer';
import type { World } from './world-types';
import type { DecorItem } from './decor';
import type { SpeciesId } from './species';
import { shrimpPlace } from './shrimp-colony';
import { SPECIES_PH } from './water-ph';
import { TAP_HARDNESS } from './water-hardness';

/**
 * Scénarios de référence de l'écosystème (`docs/ECOSYSTEME.md` § 4, issue #799) : chacun fait
 * tourner un bac des semaines durant à gros pas et vérifie l'issue attendue. Un échec est une
 * **régression de réalisme**. Chaque scénario tourne en bien moins de 5 s en local ; le délai
 * explicite protège d'un runner de CI chargé (`docs/PIEGES.md`, « Délai de 5 s de Vitest », #839).
 */

/**
 * Délai d'un scénario, en millisecondes : bien au-delà des 5 s par défaut de Vitest, qu'un
 * runner chargé a déjà dépassées (S10, #839) sans que le code soit en cause.
 */
const SCENARIO_TIMEOUT_MS = 30_000;

/** Santé en dessous de laquelle un animal est dit malade (moitié de la pleine santé). */
const SICK_HEALTH = 0.5;

function goldfish(filter: number): World {
  const world = cloneWorld(createWorld(1, [{ species: 'rouge', count: 1 }], [], [], 'bassin'));
  (world.water as MutableWaterState).filter = filter;
  return world;
}

/** Volume des scénarios du bac planté (S5, S6, S7). */
const PLANTED_LITERS = 60;

/**
 * Bac des scénarios S5 à S7 (`docs/ECOSYSTEME.md` § 4) : `neons` néons, filtre mûr, et, si
 * `planted`, seize plantes à tige (rapides) sur deux rangs au fond et huit touffes devant.
 */
function plantedTank(neons: number, planted: boolean): World {
  const decor = planted ? plantedDecor() : [];
  return tankWith([{ species: 'neon', count: neons }], decor);
}

/** Plantes des bacs plantés (S5, S7, S8) : seize plantes à tige au fond, huit touffes devant. */
function plantedDecor(): DecorItem[] {
  const decor: DecorItem[] = [];
  for (let i = 0; i < 16; i++) {
    const x = -0.5 + (i % 8) * 0.14;
    decor.push({
      kind: 'plant',
      form: 'tall',
      x,
      z: i < 8 ? -0.17 : -0.07,
      rotation: i,
      scale: 1,
      seed: 1000 + i,
    });
  }
  for (let i = 0; i < 8; i++) {
    const x = -0.5 + i * 0.14;
    decor.push({ kind: 'plant', form: 'tuft', x, z: 0.1, rotation: i, scale: 1, seed: 2000 + i });
  }
  return decor;
}

/** Bac tropical à filtre mûr avec `population` et `decor`. */
function tankWith(population: { species: SpeciesId; count: number }[], decor: DecorItem[]): World {
  const world = cloneWorld(createWorld(1, population, [], decor, 'tropical'));
  (world.water as MutableWaterState).filter = 1;
  return world;
}

/** Roche du scénario S11 (#733), au milieu du bac planté, devant les plantes à tige. */
const S11_ROCK: DecorItem = { kind: 'rock', x: 0.2, z: 0, rotation: 0.5, scale: 1.5, seed: 3100 };

/** Volume du bac à crevettes (S8), en litres. */
const SHRIMP_TANK_LITERS = 30;

/**
 * Nourrissage léger des bacs à crevettes (S8, S9) : un repas « juste ce qu'il faut » toutes les
 * deux minutes simulées, deux fois moins souvent que l'entretien normal
 * (`feedAnimalsInPlace` : rien ne tombe ni ne pourrit), sans changement d'eau.
 */
const LIGHT_CARE: ScenarioCare = { feedEverySeconds: 2 * NORMAL_CARE.feedEverySeconds! };

/** Temps laissé aux néritines affamées pour mourir au pas fin (S10), en secondes simulées. */
const NERITE_DEATH_SECONDS = 3600;

/** Bac du scénario S10 : deux néritines, filtre mûr, algues `algae` (absentes : aucune). */
function neriteTank(algae: number[] | undefined): World {
  const world = cloneWorld(createWorld(3, [{ species: 'neritine', count: 2 }], [], [], 'tropical'));
  const water = world.water as MutableWaterState;
  water.filter = 1;
  if (algae !== undefined) {
    water.algae = algae;
  }
  return world;
}

/** Emplacements des plantes du scénario des alevins (S13), au fond du bac tropical. */
const FRY_SITES: readonly number[] = [-0.4, 0, 0.4];
/** Alevins posés près de chaque emplacement (S13). */
const FRY_PER_SITE = 4;
/** Durée du scénario des alevins, en secondes simulées (bien moins que leur croissance). */
const FRY_SCENARIO_SECONDS = 60;

/**
 * Bac du scénario S13 (#823) : 8 néons (prédateurs), et près de chacun des trois emplacements
 * `FRY_SITES` une touffe d'échelle `tuftScale` et `FRY_PER_SITE` alevins de guppy déjà en âge
 * d'être mangés. À portée égale (mêmes emplacements, même graine), seule la masse change.
 */
function fryTank(seed: number, tuftScale: number): World {
  const decor: DecorItem[] = FRY_SITES.map((x, i) => ({
    kind: 'plant',
    form: 'tuft',
    x,
    z: -0.05,
    rotation: i,
    scale: tuftScale,
    seed: 300 + i,
  }));
  const world = cloneWorld(
    createWorld(seed, [{ species: 'neon', count: 8 }], [], decor, 'tropical'),
  );
  for (const x of FRY_SITES) {
    for (let k = 0; k < FRY_PER_SITE; k++) {
      const fry = birthYoungInPlace(world, 'guppy', { x, y: 0.15, z: -0.05 }) as {
        growth?: number;
      };
      fry.growth = FRY_SAFE_AGE;
    }
  }
  return world;
}

/** Alevins encore là après `FRY_SCENARIO_SECONDS` de nage (pas complet, prédation comprise). */
function fryLeft(world: World): number {
  const run = cloneWorld(world);
  advanceInPlace(run, Math.round(FRY_SCENARIO_SECONDS / SIM_DT));
  return run.entities.filter((fish: Fish) => isFry(fish)).length;
}

/** Entretien des scénarios S5 à S7 : repas normaux, **aucun** changement d'eau. */
const NO_WATER_CHANGE = { feedEverySeconds: NORMAL_CARE.feedEverySeconds };

/** Durée des scénarios « stable » : trois mois de jeu. */
const STABLE_DAYS = 90;

/**
 * Bac stable : l'eau n'est jamais « mauvaise », l'ammoniaque et les nitrites restent sous le
 * seuil « à surveiller », les nitrates sous le seuil « mauvaise », et aucun animal n'est malade.
 */
function expectStable(record: ScenarioRecord): void {
  expect(record.firstBadDay).toBeNull();
  expect(record.ammonia.value).toBeLessThan(COMPOUND_THRESHOLDS.ammonia.watch);
  expect(record.nitrite.value).toBeLessThan(COMPOUND_THRESHOLDS.nitrite.watch);
  expect(record.nitrate.value).toBeLessThan(COMPOUND_THRESHOLDS.nitrate.bad);
  expect(record.minHealth).toBeGreaterThanOrEqual(SICK_HEALTH);
}

describe('scénarios de référence de l’écosystème (#799, #805, #807, #821, #823, #833, #733)', () => {
  it(
    'S1 — bocal de 10 L, un poisson rouge, sans filtre : ammoniaque toxique en quelques jours, poisson malade',
    () => {
      const scenario: EcosystemScenario = {
        world: goldfish(0),
        liters: 10,
        care: { feedEverySeconds: NORMAL_CARE.feedEverySeconds },
        days: 7,
      };

      const record = runScenario(scenario);

      expect(record.firstBadDay).not.toBeNull();
      expect(record.firstBadDay!).toBeLessThanOrEqual(3);
      expect(record.ammonia.value).toBeGreaterThan(COMPOUND_THRESHOLDS.ammonia.bad);
      expect(record.minHealth).toBeLessThan(SICK_HEALTH);
    },
    SCENARIO_TIMEOUT_MS,
  );

  it(
    'S4 — bac neuf non cyclé rempli d’un coup : pic d’ammoniaque, puis de nitrites, puis retour au calme',
    () => {
      const world = cloneWorld(createDefaultWorld(1, 'tropical'));
      startFilterCyclingInPlace(world.water as MutableWaterState);

      const record = runScenario({ world, care: NORMAL_CARE, days: 63 });

      expect(record.ammonia.value).toBeGreaterThan(COMPOUND_THRESHOLDS.ammonia.watch);
      expect(record.nitrite.value).toBeGreaterThan(COMPOUND_THRESHOLDS.nitrite.watch);
      expect(record.ammonia.day).toBeLessThan(record.nitrite.day);
      expect(record.nitrite.day).toBeLessThan(21);
      expect(record.world.water.cycling).toBeUndefined();
      expect(record.world.water.ammonia).toBeLessThan(COMPOUND_THRESHOLDS.ammonia.watch);
      expect(record.world.water.nitrite).toBeLessThan(COMPOUND_THRESHOLDS.nitrite.watch);
    },
    SCENARIO_TIMEOUT_MS,
  );

  it(
    'S2 — 120 L filtré et mûr, un poisson rouge, 25 % d’eau changée par semaine : stable sur 3 mois',
    () => {
      const record = runScenario({
        world: goldfish(1),
        liters: 120,
        care: { ...NORMAL_CARE, waterChangeEveryDays: 7, waterChangeShare: 0.25 },
        days: STABLE_DAYS,
      });

      expectStable(record);
    },
    SCENARIO_TIMEOUT_MS,
  );

  it('S3 — 120 L, un poisson rouge adulte : le deuxième est refusé par la capacité (OATA : 150 L pour deux)', () => {
    const tank = { liters: 120, population: populationOf(goldfish(1)) };

    const first = canAdd({ liters: 120, population: [] }, 'rouge');
    const second = canAdd(tank, 'rouge');

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    expect(second.limit).toBe('capacite');
    expect(second.reason).toBe(
      '120 L : un poisson rouge adulte demande 100 L, puis 50 L par poisson rouge en plus (OATA) ; il faudrait 150 L',
    );
    expect(second.disagreement).toContain('RSPCA');
  });

  it.each(ENVIRONMENT_IDS)(
    'S12 — bac par défaut « %s », entretien normal : stable sur 3 mois',
    (environment) => {
      const record = runScenario({
        world: createDefaultWorld(1, environment),
        care: NORMAL_CARE,
        days: STABLE_DAYS,
      });

      expectStable(record);
    },
    SCENARIO_TIMEOUT_MS,
  );

  it(
    'S5 — 60 L très planté, 10 néons, sans changement d’eau : stable sur 3 mois, nitrates bas, pas d’algues',
    () => {
      const record = runScenario({
        world: plantedTank(10, true),
        liters: PLANTED_LITERS,
        care: NO_WATER_CHANGE,
        days: STABLE_DAYS,
      });

      expectStable(record);
      expect(record.nitrate.value).toBeLessThan(COMPOUND_THRESHOLDS.nitrate.watch / 2);
      expect(record.maxAlgae).toBe(0);
      expect(record.worstQuality).toBe('bonne');
    },
    SCENARIO_TIMEOUT_MS,
  );

  it(
    'S6 — le même sans plantes : nitrates qui montent sans cesse, algues, eau mauvaise en moins de 3 mois',
    () => {
      const record = runScenario({
        world: plantedTank(10, false),
        liters: PLANTED_LITERS,
        care: NO_WATER_CHANGE,
        days: STABLE_DAYS,
      });

      expect(record.firstBadDay).not.toBeNull();
      expect(record.nitrate.value).toBeGreaterThan(COMPOUND_THRESHOLDS.nitrate.bad);
      expect(record.nitrate.day).toBeGreaterThan(record.firstBadDay!);
      expect(record.maxAlgae).toBeGreaterThan(0);
      expect(record.minHealth).toBeLessThan(SICK_HEALTH);
    },
    SCENARIO_TIMEOUT_MS,
  );

  it(
    'S7 — le même bac planté surpeuplé (30 néons, au-delà de la capacité) : algues et nitrates montent malgré les plantes',
    () => {
      const crowded = plantedTank(30, true);
      expect(canAdd({ liters: PLANTED_LITERS, population: populationOf(crowded) }, 'neon').ok).toBe(
        false,
      );

      const record = runScenario({
        world: crowded,
        liters: PLANTED_LITERS,
        care: NO_WATER_CHANGE,
        days: STABLE_DAYS,
      });

      expect(record.nitrate.value).toBeGreaterThan(COMPOUND_THRESHOLDS.nitrate.bad);
      expect(record.maxAlgae).toBeGreaterThan(0);
      expect(record.worstQuality).toBe('mauvaise');
    },
    SCENARIO_TIMEOUT_MS,
  );

  it(
    'S13 — à portée égale, des touffes denses gardent plus d’alevins que des touffes maigres (#823)',
    () => {
      // Même graine, mêmes emplacements : seule la masse des touffes change (graines 1 à 4
      // vérifiées pendant le cycle 297 : 12 contre 5, 12 contre 6, 11 contre 4, 10 contre 2).
      const dense = fryLeft(fryTank(2, 1.8));
      const sparse = fryLeft(fryTank(2, 0.8));
      expect(dense).toBeGreaterThanOrEqual(1.5 * sparse);
      expect(sparse).toBeLessThan(FRY_SITES.length * FRY_PER_SITE);
    },
    SCENARIO_TIMEOUT_MS,
  );

  it(
    'S10 — néritines dans un bac sans algues, jamais nourries : faim, puis mort ; avec des algues, rassasiées',
    () => {
      const bare = neriteTank(undefined);
      const grazed = neriteTank(sampleAlgae(0.6));

      const starving = runScenario({ world: bare, care: {}, days: 1 });
      // Deux néritines mangent environ 6 plaques par jour de jeu : une demi-journée laisse des algues.
      const fed = runScenario({ world: grazed, care: {}, days: 0.5 });

      for (const snail of starving.world.entities) {
        expect(snail.hunger).toBe(1);
        expect(snail.health).toBe(HEALTH_FLOOR);
      }
      expect(fed.minHealth).toBe(1);
      expect(fed.maxAlgae).toBeGreaterThan(0);

      // Mort : la mortalité (option du monde, #582) se joue au pas fin, tirage par animal.
      const dying = cloneWorld(starving.world);
      setWorldMortalityInPlace(dying, true);
      advanceInPlace(dying, Math.round(NERITE_DEATH_SECONDS / SIM_DT));
      expect(dying.entities).toHaveLength(0);
      expect(dying.dead?.map((body) => body.species)).toEqual(['neritine', 'neritine']);
    },
    SCENARIO_TIMEOUT_MS,
  );

  it(
    'S8 — 30 L planté, crevettes cerises et une néritine, nourrissage léger : stable, colonie qui grandit puis se stabilise (#836)',
    () => {
      const world = tankWith(
        [
          { species: 'cerise', count: 4 },
          { species: 'neritine', count: 1 },
        ],
        plantedDecor(),
      );
      const scenario = (days: number): ScenarioRecord =>
        runScenario({ world, liters: SHRIMP_TANK_LITERS, care: LIGHT_CARE, days });
      const shrimps = (record: ScenarioRecord): number =>
        record.world.entities.filter((e) => e.species === 'cerise').length;

      const early = scenario(1.5);
      const settled = scenario(30);
      const later = scenario(60);

      expect(shrimps(early)).toBeGreaterThan(4);
      expect(shrimps(settled)).toBe(shrimpPlace(SHRIMP_TANK_LITERS));
      expect(shrimps(later)).toBe(shrimps(settled));
      expect(later.worstQuality).not.toBe('mauvaise');
      expect(later.minHealth).toBeGreaterThan(SICK_HEALTH);
      expect(later.world.entities.filter((e) => e.species === 'neritine')).toHaveLength(1);
    },
    SCENARIO_TIMEOUT_MS,
  );

  it(
    'S9 — crevettes cerises avec des poissons rouges : les crevettes disparaissent (#836)',
    () => {
      const world = tankWith(
        [
          { species: 'cerise', count: 10 },
          { species: 'rouge', count: 2 },
        ],
        // Sans plantes : un massif dense abrite les jeunes (refuge, #823), voir l'ADR 0180.
        [],
      );

      const record = runScenario({ world, care: LIGHT_CARE, days: 10 });

      expect(record.world.entities.filter((e) => e.species === 'cerise')).toHaveLength(0);
      expect(record.world.entities.filter((e) => e.species === 'rouge')).toHaveLength(2);
    },
    SCENARIO_TIMEOUT_MS,
  );

  it(
    'S11 — roche calcaire dans le bac planté de 10 néons : pH tiré vers 7,6–7,9 en quelques semaines, néons en limite',
    () => {
      const limestone = (material: 'inert' | 'limestone', days: number): ScenarioRecord =>
        runScenario({
          world: tankWith(
            [{ species: 'neon', count: 10 }],
            [...plantedDecor(), { ...S11_ROCK, material }],
          ),
          liters: PLANTED_LITERS,
          care: NO_WATER_CHANGE,
          days,
        });

      const week = limestone('limestone', 7).world.water;
      const record = limestone('limestone', STABLE_DAYS);
      const inert = limestone('inert', STABLE_DAYS).world.water;
      const { ph, kh } = record.world.water;
      const neon = SPECIES_PH.neon;

      // Quelques semaines : pas encore à 7,6 après une semaine.
      expect(week.ph).toBeLessThan(7.6);
      expect(ph).toBeGreaterThanOrEqual(7.6);
      expect(ph).toBeLessThanOrEqual(7.9);
      // Néons en limite : hors de leur plage idéale, encore dans la tolérée.
      expect(ph).toBeGreaterThan(neon.ideal.max);
      expect(ph).toBeLessThanOrEqual(neon.tolerated.max);
      expect(kh).toBeGreaterThan(TAP_HARDNESS.tropical.kh);
      expectStable(record);
      // Témoin : la même roche, inerte, ne relève ni le pH ni la dureté.
      expect(inert.ph).toBeLessThan(neon.ideal.max);
      expect(inert.kh).toBeUndefined();
    },
    SCENARIO_TIMEOUT_MS,
  );

  it(
    'le harnais ne modifie jamais le bac de départ et rend le même relevé deux fois',
    () => {
      const world = goldfish(1);
      const before = JSON.stringify(world);
      const scenario: EcosystemScenario = { world, liters: 120, care: NORMAL_CARE, days: 3 };

      const first = runScenario(scenario);
      const second = runScenario(scenario);

      expect(JSON.stringify(world)).toBe(before);
      expect(JSON.stringify(second)).toBe(JSON.stringify(first));
      expect(first.world.time).toBe(3 * SCENARIO_DAY_SECONDS);
    },
    SCENARIO_TIMEOUT_MS,
  );

  it.each([
    { feedEverySeconds: 7 },
    { feedEverySeconds: -60 },
    { feedEverySeconds: Number.NaN },
    { waterChangeEveryDays: 1e-4 },
    { waterChangeEveryDays: Number.POSITIVE_INFINITY },
  ])('le harnais refuse une période d’entretien qui ne tombe pas sur un pas : %o', (care) => {
    expect(() => runScenario({ world: goldfish(1), care, days: 1 })).toThrow(RangeError);
  });

  it(
    'nourri sans changement d’eau, un bac peuplé finit en eau mauvaise (le harnais voit la dégradation)',
    () => {
      const record = runScenario({
        world: createDefaultWorld(1, 'tropical'),
        care: { feedEverySeconds: NORMAL_CARE.feedEverySeconds },
        days: 60,
      });

      expect(record.worstQuality).toBe('mauvaise');
      expect(record.firstBadDay).toBeGreaterThan(0);
    },
    SCENARIO_TIMEOUT_MS,
  );

  it('le délai des scénarios dépasse nettement les 5 s par défaut de Vitest (#839)', () => {
    expect(SCENARIO_TIMEOUT_MS).toBeGreaterThanOrEqual(30_000);
  });
});
