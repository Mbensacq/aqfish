import {
  plantSway,
  plantSwayBound,
  SWAY_PERIOD,
  SWAY_SECONDARY_PERIOD_RATIO,
  SWAY_WAVE_LAG,
  SWAY_WEIGHT_X,
  SWAY_WEIGHT_Z,
  type SwayOffset,
} from './plant-sway';

function sway(h: number, time: number, phase: number, amplitude: number): SwayOffset {
  return plantSway(h, time, phase, amplitude, { x: 0, z: 0 });
}

describe('plantSway : ondulation des plantes', () => {
  const A = 0.02;

  it('nulle à la racine, à tout instant et pour toute phase', () => {
    for (const time of [0, 0.37, 2.5, 1000]) {
      for (const phase of [0, 1, 5.9]) {
        const o = sway(0, time, phase, A);
        expect(Math.abs(o.x)).toBe(0);
        expect(Math.abs(o.z)).toBe(0);
      }
    }
  });

  it('valeurs exactes : pointe au maximum de l’onde principale', () => {
    // h = 1, t = 0 : phase − lag = π/2 ⇒ x = A · 0,8 ; z = A · 0,6 · sin(1,7 · phase − lag).
    const phase = Math.PI / 2 + SWAY_WAVE_LAG;
    const o = sway(1, 0, phase, A);
    expect(o.x).toBeCloseTo(A * SWAY_WEIGHT_X, 12);
    expect(o.z).toBeCloseTo(A * SWAY_WEIGHT_Z * Math.sin(1.7 * phase - SWAY_WAVE_LAG), 12);
  });

  it('valeurs exactes : mi-hauteur, quart de période ⇒ amplitude · h² · 0,8', () => {
    // h = 0,5 : lag = 0,6 ; t = T/4 : ωt = π/2 ; phase = 0,6 ⇒ sin(π/2) = 1.
    const o = sway(0.5, SWAY_PERIOD / 4, 0.6, A);
    expect(o.x).toBeCloseTo(A * 0.25 * SWAY_WEIGHT_X, 12);
    const omegaZ = (2 * Math.PI) / (SWAY_PERIOD * SWAY_SECONDARY_PERIOD_RATIO);
    expect(o.z).toBeCloseTo(
      A * 0.25 * SWAY_WEIGHT_Z * Math.sin((omegaZ * SWAY_PERIOD) / 4 + 1.7 * 0.6 - 0.6),
      12,
    );
  });

  it('périodique : même pose une période principale plus tard selon X', () => {
    const a = sway(0.8, 3.1, 2, A);
    const b = sway(0.8, 3.1 + SWAY_PERIOD, 2, A);
    expect(b.x).toBeCloseTo(a.x, 12);
  });

  it('croissante vers la pointe et bornée par amplitude · h² (balayage)', () => {
    expect(SWAY_WEIGHT_X ** 2 + SWAY_WEIGHT_Z ** 2).toBeCloseTo(1, 12);
    let maxTip = 0;
    for (let n = 0; n <= 400; n++) {
      const time = n * 0.137;
      for (const h of [0, 0.1, 0.25, 0.5, 0.75, 1]) {
        const o = sway(h, time, 1.3, A);
        const norm = Math.hypot(o.x, o.z);
        expect(norm).toBeLessThanOrEqual(plantSwayBound(h, A) + 1e-15);
        if (h === 1) {
          maxTip = Math.max(maxTip, norm);
        }
      }
    }
    // La borne est presque atteinte à la pointe : l'ondulation est visible.
    expect(maxTip).toBeGreaterThan(0.75 * A);
    expect(plantSwayBound(0.5, A)).toBeCloseTo(A / 4, 15);
    expect(plantSwayBound(1, A)).toBe(A);
  });

  it('hauteur hors de [0, 1] ramenée aux bornes', () => {
    expect(sway(-3, 1, 1, A)).toEqual(sway(0, 1, 1, A));
    expect(sway(7, 1, 1, A)).toEqual(sway(1, 1, 1, A));
    expect(plantSwayBound(2, A)).toBe(A);
    expect(plantSwayBound(-1, A)).toBe(0);
  });

  it('amplitude nulle : aucun déplacement', () => {
    const o = sway(1, 4.2, 0.3, 0);
    expect(Math.abs(o.x)).toBe(0);
    expect(Math.abs(o.z)).toBe(0);
  });

  it('deux phases différentes ⇒ pas à l’unisson', () => {
    let differ = 0;
    for (let n = 0; n < 50; n++) {
      const a = sway(1, n * 0.2, 0.4, A);
      const b = sway(1, n * 0.2, 2.9, A);
      if (Math.abs(a.x - b.x) > A * 0.05) {
        differ++;
      }
    }
    expect(differ).toBeGreaterThan(40);
  });

  it('mouvement lent : déplacement de la pointe en 1/60 s petit devant l’amplitude', () => {
    for (let n = 0; n < 300; n++) {
      const t = n * 0.05;
      const a = sway(1, t, 1, A);
      const b = sway(1, t + 1 / 60, 1, A);
      expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeLessThan(0.03 * A);
    }
  });

  it('écrit dans out et le renvoie', () => {
    const out = { x: 9, z: 9 };
    expect(plantSway(0.5, 1, 1, A, out)).toBe(out);
  });

  it.each([
    ['un temps non fini', Number.NaN, 0, A],
    ['un temps infini', Infinity, 0, A],
    ['une phase non finie', 1, Number.NaN, A],
    ['une amplitude négative', 1, 0, -0.01],
    ['une amplitude non finie', 1, 0, Infinity],
  ])('refuse %s', (_, time, phase, amplitude) => {
    expect(() => sway(0.5, time, phase, amplitude)).toThrow(RangeError);
  });
});
