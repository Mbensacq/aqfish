import { MAX_CAPTURE_TIME_SECONDS } from '../core/capture/capture-params';
import { MAX_SEED } from '../core/random/prng';
import { SIM_DT } from './constants';
import { advance, advanceTo, createWorld, step, ticksFor, type World } from './world';

describe('createWorld', () => {
  it('crée un monde vide à t = 0 avec la graine donnée', () => {
    expect(createWorld(42)).toEqual({ seed: 42, tick: 0, time: 0, entities: [] });
  });

  it.each([0, MAX_SEED])('accepte la graine limite %s', (seed) => {
    expect(createWorld(seed).seed).toBe(seed);
  });

  it.each([-1, 0.5, MAX_SEED + 1, Number.NaN])('refuse la graine %s', (seed) => {
    expect(() => createWorld(seed)).toThrow(RangeError);
  });
});

describe('sérialisation', () => {
  it('aller-retour JSON identique, avant et après des pas', () => {
    for (const world of [createWorld(42), advance(createWorld(7), 123)]) {
      const copy = JSON.parse(JSON.stringify(world)) as World;
      expect(copy).toEqual(world);
      expect(JSON.stringify(copy)).toBe(JSON.stringify(world));
    }
  });
});

describe('step', () => {
  it('avance le temps de dt et le compteur de pas de 1', () => {
    const next = step(createWorld(42), SIM_DT);
    expect(next.tick).toBe(1);
    expect(next.time).toBe(SIM_DT);
    expect(next.seed).toBe(42);
    expect(next.entities).toEqual([]);
  });

  it('utilise SIM_DT par défaut', () => {
    expect(step(createWorld(1))).toEqual(step(createWorld(1), SIM_DT));
  });

  it('ne modifie jamais son entrée', () => {
    const world = Object.freeze({ ...createWorld(42), entities: Object.freeze([]) });
    const snapshot = JSON.stringify(world);
    const next = step(world); // lèverait une TypeError en mode strict si world était muté
    expect(JSON.stringify(world)).toBe(snapshot);
    expect(next).not.toBe(world);
    expect(next.entities).not.toBe(world.entities);
  });

  it('est déterministe', () => {
    let a = createWorld(42);
    let b = createWorld(42);
    for (let i = 0; i < 100; i++) {
      a = step(a);
      b = step(b);
    }
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it.each([0, -SIM_DT, Number.NaN, Number.POSITIVE_INFINITY])('refuse dt = %s', (dt) => {
    expect(() => step(createWorld(42), dt)).toThrow(RangeError);
  });
});

describe('advance', () => {
  it('équivaut à n appels de step', () => {
    let stepped = createWorld(3);
    for (let i = 0; i < 37; i++) {
      stepped = step(stepped);
    }
    expect(advance(createWorld(3), 37)).toEqual(stepped);
  });

  it('0 pas : renvoie le monde tel quel', () => {
    const world = createWorld(42);
    expect(advance(world, 0)).toBe(world);
  });

  it('ne modifie pas son entrée', () => {
    const world = createWorld(42);
    advance(world, 10);
    expect(world).toEqual(createWorld(42));
  });

  it.each([-1, 1.5, Number.NaN])('refuse %s pas', (steps) => {
    expect(() => advance(createWorld(42), steps)).toThrow(RangeError);
  });
});

describe('ticksFor / advanceTo (mode capture)', () => {
  it.each([
    [0, 0],
    [SIM_DT, 1],
    [1, 60],
    [30, 1800],
    [0.5 * SIM_DT, 1], // arrondi au plus proche
    [0.49 * SIM_DT, 0],
    [MAX_CAPTURE_TIME_SECONDS, MAX_CAPTURE_TIME_SECONDS * 60],
  ])('temps %s s ⇒ %s pas', (time, ticks) => {
    expect(ticksFor(time)).toBe(ticks);
    expect(advanceTo(createWorld(42), time).tick).toBe(ticks);
  });

  it('atteint le temps demandé à un pas près', () => {
    const world = advanceTo(createWorld(42), 30);
    expect(world.time).toBeCloseTo(30, 9);
  });

  it('ne fait que les pas manquants depuis un monde déjà avancé', () => {
    const halfway = advance(createWorld(42), 30);
    expect(advanceTo(halfway, 1)).toEqual(advanceTo(createWorld(42), 1));
  });

  it('ne revient pas en arrière', () => {
    const world = advance(createWorld(42), 120);
    expect(advanceTo(world, 1)).toBe(world);
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])('refuse le temps %s', (time) => {
    expect(() => ticksFor(time)).toThrow(RangeError);
    expect(() => advanceTo(createWorld(42), time)).toThrow(RangeError);
  });
});
