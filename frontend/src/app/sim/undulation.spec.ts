import { SIM_DT } from './constants';
import { NEON } from './species';
import type { Fish } from './swimmer';
import {
  BODY_SWAY,
  MAX_AMPLITUDE_SCALE,
  MIN_AMPLITUDE_SCALE,
  TAIL_LAG,
  TAIL_SWING,
  tailBeatRate,
  undulationAt,
  undulationScale,
  type Undulation,
} from './undulation';
import { advance, createDefaultWorld, createWorld, type World } from './world';

const TWO_PI = Math.PI * 2;

function undulation(): Undulation {
  return { bodySway: 0, tailSwing: 0 };
}

describe('tailBeatRate', () => {
  it('2π · fréquence à la vitesse de croisière, proportionnelle à la vitesse', () => {
    expect(tailBeatRate(NEON, NEON.cruiseSpeed)).toBeCloseTo(TWO_PI * 2.5, 12);
    expect(tailBeatRate(NEON, NEON.maxSpeed)).toBeCloseTo(TWO_PI * 5, 12);
    expect(tailBeatRate(NEON, NEON.minSpeed)).toBeCloseTo(TWO_PI * 1.25, 12);
  });

  it('nulle à l’arrêt ou à vitesse négative', () => {
    expect(tailBeatRate(NEON, 0)).toBe(0);
    expect(tailBeatRate(NEON, -0.1)).toBe(0);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY])('refuse la vitesse %s', (speed) => {
    expect(() => tailBeatRate(NEON, speed)).toThrow(RangeError);
  });
});

describe('undulationScale', () => {
  it('vaut exactement 1 à la vitesse de croisière', () => {
    expect(undulationScale(NEON, NEON.cruiseSpeed)).toBe(1);
  });

  it('croît avec la vitesse : 0,75 à la moitié de la croisière, 1,25 à une fois et demie', () => {
    expect(undulationScale(NEON, NEON.cruiseSpeed / 2)).toBeCloseTo(0.75, 12);
    expect(undulationScale(NEON, NEON.cruiseSpeed * 1.5)).toBeCloseTo(1.25, 12);
  });

  it('bornée aux extrêmes (arrêt, vitesse maximale et au-delà)', () => {
    expect(undulationScale(NEON, 0)).toBe(MIN_AMPLITUDE_SCALE);
    expect(undulationScale(NEON, -1)).toBe(MIN_AMPLITUDE_SCALE);
    expect(undulationScale(NEON, NEON.maxSpeed)).toBe(MAX_AMPLITUDE_SCALE);
    expect(undulationScale(NEON, 1e9)).toBe(MAX_AMPLITUDE_SCALE);
  });

  it.each([Number.NaN, Number.NEGATIVE_INFINITY])('refuse la vitesse %s', (speed) => {
    expect(() => undulationScale(NEON, speed)).toThrow(RangeError);
  });
});

describe('undulationAt', () => {
  it('phase 0 : corps droit, queue en retard de TAIL_LAG', () => {
    const u = undulationAt(0, 1, undulation());
    expect(u.bodySway).toBe(0);
    expect(u.tailSwing).toBeCloseTo(Math.sin(-TAIL_LAG) * TAIL_SWING, 12);
  });

  it('phase π/2 : lacet maximal du corps ; phase π/2 + TAIL_LAG : battement maximal', () => {
    expect(undulationAt(Math.PI / 2, 1, undulation()).bodySway).toBeCloseTo(BODY_SWAY, 12);
    expect(undulationAt(Math.PI / 2 + TAIL_LAG, 1, undulation()).tailSwing).toBeCloseTo(
      TAIL_SWING,
      12,
    );
  });

  it('amplitudes proportionnelles au facteur ; facteur nul : aucune ondulation', () => {
    const one = undulationAt(1.3, 1, undulation());
    const twice = undulationAt(1.3, 2, undulation());
    expect(twice.bodySway).toBeCloseTo(2 * one.bodySway, 12);
    expect(twice.tailSwing).toBeCloseTo(2 * one.tailSwing, 12);
    const none = undulationAt(1.3, 0, undulation());
    expect(Math.abs(none.bodySway)).toBe(0);
    expect(Math.abs(none.tailSwing)).toBe(0);
  });

  it('périodique de période 2π, et opposée à une demi-période', () => {
    const a = undulationAt(0.7, 1, undulation());
    const b = undulationAt(0.7 + TWO_PI, 1, undulation());
    const c = undulationAt(0.7 + Math.PI, 1, undulation());
    expect(b.bodySway).toBeCloseTo(a.bodySway, 12);
    expect(b.tailSwing).toBeCloseTo(a.tailSwing, 12);
    expect(c.bodySway).toBeCloseTo(-a.bodySway, 12);
    expect(c.tailSwing).toBeCloseTo(-a.tailSwing, 12);
  });

  it('écrit dans out et le renvoie (aucune allocation)', () => {
    const out = undulation();
    expect(undulationAt(2, 1, out)).toBe(out);
  });
});

describe('déphasage individuel', () => {
  const world = createDefaultWorld(42);
  const phases = world.entities.map((f) => f.phase);

  it('chaque poisson a sa propre phase initiale, dans [0, 2π)', () => {
    expect(phases.length).toBeGreaterThan(1);
    expect(new Set(phases).size).toBe(phases.length);
    for (const phase of phases) {
      expect(phase).toBeGreaterThanOrEqual(0);
      expect(phase).toBeLessThan(TWO_PI);
    }
    // Réparties sur le cercle, pas regroupées : au moins un écart de plus de π/2.
    expect(Math.max(...phases) - Math.min(...phases)).toBeGreaterThan(Math.PI / 2);
  });

  it('tirée du générateur à graine : même graine, mêmes phases ; autre graine, autres phases', () => {
    expect(createDefaultWorld(42).entities.map((f) => f.phase)).toEqual(phases);
    expect(createDefaultWorld(43).entities.map((f) => f.phase)).not.toEqual(phases);
  });
});

describe('l’ondulation n’influence pas la simulation', () => {
  type MutableFish = { -readonly [K in keyof Fish]: Fish[K] };

  function trajectory(world: World): unknown[] {
    return world.entities.map(({ x, y, z, yaw, pitch, speed, turn, pitchTarget, rng }) => ({
      x,
      y,
      z,
      yaw,
      pitch,
      speed,
      turn,
      pitchTarget,
      rng,
    }));
  }

  function withPhases(world: World, phaseOf: (fish: Fish) => number): World {
    const copy = JSON.parse(JSON.stringify(world)) as World;
    for (const fish of copy.entities as MutableFish[]) {
      fish.phase = phaseOf(fish);
      fish.pphase = fish.phase;
    }
    return copy;
  }

  it('changer les phases ne change ni positions, ni caps, ni vitesses, ni générateur', () => {
    const start = advance(createDefaultWorld(42), 30);
    const reference = advance(start, 600);
    for (const phaseOf of [() => 0, (f: Fish) => (f.phase + Math.PI) % TWO_PI]) {
      const shifted = advance(withPhases(start, phaseOf), 600);
      expect(trajectory(shifted)).toEqual(trajectory(reference));
      expect(shifted.entities.map((f) => f.phase)).not.toEqual(
        reference.entities.map((f) => f.phase),
      );
    }
  });

  it('la phase avance à tailBeatRate (vitesse courante) et reste dans [0, 2π)', () => {
    const start = createWorld(7, [{ species: 'neon', count: 4 }]);
    const next = advance(start, 1);
    for (let i = 0; i < next.entities.length; i++) {
      const fish = next.entities[i];
      const expected = (start.entities[i].phase + tailBeatRate(NEON, fish.speed) * SIM_DT) % TWO_PI;
      expect(fish.phase).toBeCloseTo(expected, 12);
    }
    for (const fish of advance(start, 900).entities) {
      expect(fish.phase).toBeGreaterThanOrEqual(0);
      expect(fish.phase).toBeLessThan(TWO_PI);
    }
  });
});
