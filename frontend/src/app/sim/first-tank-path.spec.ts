import { describe, expect, it } from 'vitest';

import { freshWater } from './water';
import { createDefaultWorld } from './world';
import { serializeWorld, parseWorld } from './save';
import { createDayClock } from './daylight';
import {
  advanceFirstTankPath,
  createFirstTankPath,
  CYCLE_SECONDS,
  firstTankFacts,
  firstTankPathAvailable,
  firstTankPathView,
  FIRST_TANK_PATH_VERSION,
  FIRST_TANK_STEPS,
  isWaterCycled,
  readFirstTankPath,
  type FirstTankFacts,
  type FirstTankPathState,
} from './first-tank-path';

const facts = (over: Partial<FirstTankFacts> = {}): FirstTankFacts => ({
  time: 0,
  animals: 0,
  foodDropped: 0,
  waterCycled: true,
  log: [],
  ...over,
});
const start = (): FirstTankPathState => createFirstTankPath(facts({ time: 100, foodDropped: 3 }));

describe('parcours « Mon premier aquarium » (#512)', () => {
  it('a au moins cinq étapes, chacune avec texte, pourquoi et renvoi', () => {
    expect(FIRST_TANK_STEPS.length).toBeGreaterThanOrEqual(5);
    expect(new Set(FIRST_TANK_STEPS.map((step) => step.id)).size).toBe(FIRST_TANK_STEPS.length);
    for (const step of FIRST_TANK_STEPS) {
      expect(step.title && step.action && step.why && step.link.label).toBeTruthy();
    }
  });

  it('commence à la première étape, au temps du bac', () => {
    const state = start();
    expect(state).toEqual({
      version: FIRST_TANK_PATH_VERSION,
      startedAt: 100,
      foodAtStart: 3,
      done: [],
    });
    expect(firstTankPathView(state).current?.id).toBe('cycle');
    expect(firstTankPathView(state).doneCount).toBe(0);
  });

  describe('transitions', () => {
    it('cycler : ni une seconde trop tôt, ni avec une eau mauvaise', () => {
      const state = start();
      const at = (time: number, waterCycled = true) =>
        advanceFirstTankPath(state, facts({ time, foodDropped: 3, waterCycled })).done;
      expect(at(100 + CYCLE_SECONDS - 0.01)).toEqual([]);
      expect(at(100 + CYCLE_SECONDS)).toEqual(['cycle']);
      expect(at(100 + CYCLE_SECONDS, false)).toEqual([]);
    });

    it('premier poisson : dès un animal', () => {
      expect(advanceFirstTankPath(start(), facts({ time: 100, foodDropped: 3 })).done).toEqual([]);
      expect(
        advanceFirstTankPath(start(), facts({ time: 100, foodDropped: 3, animals: 1 })).done,
      ).toEqual(['first-fish']);
    });

    it('nourrir : un granulé de plus qu’au départ, et un animal pour le manger', () => {
      const fed = (animals: number, foodDropped: number) =>
        advanceFirstTankPath(start(), facts({ time: 100, foodDropped, animals })).done;
      expect(fed(1, 3)).not.toContain('feed');
      expect(fed(0, 4)).not.toContain('feed');
      expect(fed(1, 4)).toContain('feed');
    });

    it.each([
      ['waterTest', 'test-water'],
      ['waterChange', 'change-water'],
    ] as const)('%s au journal valide %s, seulement depuis le début du parcours', (task, id) => {
      const logged = (time: number) =>
        advanceFirstTankPath(start(), facts({ time: 200, foodDropped: 3, log: [{ task, time }] }))
          .done;
      expect(logged(99)).toEqual([]);
      expect(logged(100)).toEqual([id]);
      expect(logged(150)).toEqual([id]);
    });

    it('une tâche sans rapport ne valide rien', () => {
      const log = [{ task: 'filter', time: 150 }] as const;
      expect(advanceFirstTankPath(start(), facts({ time: 200, foodDropped: 3, log })).done).toEqual(
        [],
      );
    });

    it('avance étape par étape jusqu’à la fin', () => {
      let state = start();
      const steps: FirstTankFacts[] = [
        facts({ time: 100 + CYCLE_SECONDS, foodDropped: 3 }),
        facts({ time: 500, foodDropped: 3, animals: 2 }),
        facts({ time: 501, foodDropped: 4, animals: 2 }),
        facts({
          time: 502,
          foodDropped: 4,
          animals: 2,
          log: [{ task: 'waterTest', time: 502 }],
        }),
        facts({
          time: 503,
          foodDropped: 4,
          animals: 2,
          log: [{ task: 'waterChange', time: 503 }],
        }),
      ];
      const order: (string | undefined)[] = [];
      for (const snapshot of steps) {
        order.push(firstTankPathView(state).current?.id);
        state = advanceFirstTankPath(state, snapshot);
      }
      expect(order).toEqual(FIRST_TANK_STEPS.map((step) => step.id));
      expect(firstTankPathView(state)).toEqual({
        current: null,
        currentNumber: 0,
        doneCount: 5,
        total: 5,
      });
    });
  });

  describe('cas limites', () => {
    it('étape sautée : faite avant son tour, comptée, et rangée dans l’ordre du parcours', () => {
      const state = advanceFirstTankPath(
        start(),
        facts({
          time: 101,
          foodDropped: 3,
          log: [{ task: 'waterChange', time: 101 }],
        }),
      );
      expect(state.done).toEqual(['change-water']);
      expect(firstTankPathView(state).current?.id).toBe('cycle');
      expect(firstTankPathView(state).currentNumber).toBe(1);
      const next = advanceFirstTankPath(state, facts({ time: 102, foodDropped: 3, animals: 1 }));
      expect(next.done).toEqual(['first-fish', 'change-water']);
    });

    it('bac modifié en cours de route : retirer les poissons ne défait pas l’étape', () => {
      const withFish = advanceFirstTankPath(
        start(),
        facts({ time: 101, foodDropped: 3, animals: 3 }),
      );
      const empty = advanceFirstTankPath(
        withFish,
        facts({ time: 102, foodDropped: 3, animals: 0 }),
      );
      expect(empty.done).toEqual(['first-fish']);
    });

    it('bac remplacé (temps ou granulés en arrière) : le parcours repart de zéro', () => {
      const state = advanceFirstTankPath(start(), facts({ time: 101, foodDropped: 3, animals: 1 }));
      expect(advanceFirstTankPath(state, facts({ time: 5, foodDropped: 9, animals: 1 }))).toEqual({
        version: 1,
        startedAt: 5,
        foodAtStart: 9,
        done: [],
      });
      expect(
        advanceFirstTankPath(state, facts({ time: 200, foodDropped: 1, animals: 1 })).startedAt,
      ).toBe(200);
    });

    it.each([
      ['temps NaN', { time: Number.NaN }],
      ['temps infini', { time: Number.POSITIVE_INFINITY }],
      ['temps négatif', { time: -1 }],
      ['animaux NaN', { animals: Number.NaN }],
      ['granulés infinis', { foodDropped: Number.POSITIVE_INFINITY }],
    ])('état non fini (%s) : parcours inchangé', (_name, over) => {
      const state = start();
      expect(advanceFirstTankPath(state, facts({ animals: 1, ...over }))).toBe(state);
    });

    it('un parcours créé sur un instantané non fini part de zéro', () => {
      expect(createFirstTankPath(facts({ time: Number.NaN, foodDropped: 7 }))).toMatchObject({
        startedAt: 0,
        foodAtStart: 0,
      });
    });

    it('rend le même objet si rien ne change', () => {
      const state = start();
      expect(advanceFirstTankPath(state, facts({ time: 101, foodDropped: 3 }))).toBe(state);
    });
  });

  it('eau cyclée : ammoniaque, nitrites, filtre', () => {
    const water = freshWater('tropical');
    expect(isWaterCycled(water)).toBe(true);
    expect(isWaterCycled({ ...water, ammonia: 5 })).toBe(false);
    expect(isWaterCycled({ ...water, nitrite: 5 })).toBe(false);
    expect(isWaterCycled({ ...water, filter: 0.49 })).toBe(false);
    expect(isWaterCycled({ ...water, filter: Number.NaN })).toBe(false);
  });

  it('lit le monde sans le modifier', () => {
    const world = createDefaultWorld(42);
    const before = serializeWorld(world, { speed: 1, clock: createDayClock(12, 1200, true) });
    const read = firstTankFacts(world);
    expect(read.animals).toBe(world.entities.length);
    expect(read.foodDropped).toBe(world.nextFoodId);
    expect(read.log).toEqual([]);
    expect(serializeWorld(world, { speed: 1, clock: createDayClock(12, 1200, true) })).toBe(before);
  });

  it('n’est pas proposé pour le récif ni le paludarium', () => {
    expect(firstTankPathAvailable('tropical')).toBe(true);
    expect(firstTankPathAvailable('bassin')).toBe(true);
    expect(firstTankPathAvailable('recif')).toBe(false);
    expect(firstTankPathAvailable('paludarium')).toBe(false);
  });

  describe('sauvegarde', () => {
    const settings = { speed: 1, clock: createDayClock(12, 1200, true) } as const;
    const valid: FirstTankPathState = {
      version: 1,
      startedAt: 12,
      foodAtStart: 2,
      done: ['first-fish', 'feed'],
    };

    it('relit un état valide, étapes dans l’ordre du parcours', () => {
      const problems: string[] = [];
      expect(readFirstTankPath(valid, problems)).toEqual(valid);
      expect(readFirstTankPath({ ...valid, done: ['feed', 'cycle'] }, problems)?.done).toEqual([
        'cycle',
        'feed',
      ]);
      expect(problems).toEqual([]);
    });

    it.each([
      ['pas un objet', 3],
      ['liste', []],
      ['nul', null],
      ['version inconnue', { ...valid, version: 2 }],
      ['version absente', { ...valid, version: undefined }],
      ['temps négatif', { ...valid, startedAt: -1 }],
      ['temps non fini', { ...valid, startedAt: Number.POSITIVE_INFINITY }],
      ['granulés décimaux', { ...valid, foodAtStart: 1.5 }],
      ['étape inconnue', { ...valid, done: ['cycle', 'dormir'] }],
      ['étape en double', { ...valid, done: ['cycle', 'cycle'] }],
      ['done absent', { ...valid, done: undefined }],
    ])('refuse : %s', (_name, value) => {
      const problems: string[] = [];
      expect(readFirstTankPath(value, problems)).toBeNull();
      expect(problems).toHaveLength(1);
    });

    it('fait l’aller-retour dans la sauvegarde d’un bac', () => {
      const world = { ...createDefaultWorld(42), firstTankPath: valid };
      const back = parseWorld(serializeWorld(world, settings));
      expect(back.ok && back.world.firstTankPath).toEqual(valid);
    });

    it('migration : une sauvegarde antérieure se lit sans parcours', () => {
      const back = parseWorld(serializeWorld(createDefaultWorld(42), settings));
      expect(back.ok).toBe(true);
      expect(back.ok && back.world.firstTankPath).toBeUndefined();
    });

    it('refuse une sauvegarde dont le parcours est invalide', () => {
      const text = serializeWorld({ ...createDefaultWorld(42), firstTankPath: valid }, settings);
      const broken = text.replace('"version":1,"startedAt"', '"version":9,"startedAt"');
      expect(broken).not.toBe(text);
      expect(parseWorld(broken).ok).toBe(false);
    });
  });
});
