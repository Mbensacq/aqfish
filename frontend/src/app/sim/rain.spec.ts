import { MAX_SEED } from '../core/random/prng';
import { SIM_DT } from './constants';
import { environmentWater, POND, TROPICAL_TANK } from './environment';
import { lilyPadLayout, lilyPadPose, LILY_PAD_SWAY_ANGLE, type LilyPadPose } from './lily-pads';
import {
  createRainBuffer,
  fillRain,
  MAX_RAIN_DROPS,
  MAX_RIPPLES,
  RAIN_DROP_PERIOD,
  RAIN_FALL_SPEED,
  RAIN_FALL_TIME,
  RAIN_PAD_SHIVER_ANGLE,
  RAIN_START_HEIGHT,
  rainImpact,
  rainImpactTime,
  rainShiver,
  RIPPLE_DURATION,
  RIPPLE_MAX_RADIUS,
  rippleRadius,
  type RainBuffer,
} from './rain';
import { parseWorld, serializeWorld } from './save';
import { createDefaultWorld } from './world';

const POND_WATER = environmentWater('bassin');
const SEEDS = [0, 1, 7, 42, 1234, MAX_SEED];

function rainAt(seed: number, time: number, buffer: RainBuffer = createRainBuffer()): RainBuffer {
  fillRain(seed, time, POND_WATER, buffer);
  return buffer;
}

function snapshot(buffer: RainBuffer): { drops: number[]; ripples: number[] } {
  return {
    drops: Array.from(buffer.drops.subarray(0, 3 * buffer.dropCount)),
    ripples: Array.from(buffer.ripples.subarray(0, 3 * buffer.rippleCount)),
  };
}

describe('pluie : déterminisme (#106)', () => {
  it('même graine et même temps : mêmes gouttes et mêmes ronds, quel que soit le chemin', () => {
    for (const seed of SEEDS) {
      const direct = snapshot(rainAt(seed, 37.5));
      // Même tampon réutilisé après d'autres instants : aucun reste d'un appel précédent.
      const reused = createRainBuffer();
      for (const t of [0, 3, 120, 0.4]) {
        rainAt(seed, t, reused);
      }
      expect(snapshot(rainAt(seed, 37.5, reused))).toEqual(direct);
    }
  });

  it('graines différentes : impacts différents', () => {
    const a = snapshot(rainAt(1, 20));
    const b = snapshot(rainAt(2, 20));
    expect(a.ripples).not.toEqual(b.ripples);
  });

  it('instants des gouttes : naissance à k · période, impact après la durée de chute', () => {
    expect(rainImpactTime(0)).toBeCloseTo(RAIN_FALL_TIME, 12);
    expect(rainImpactTime(60)).toBeCloseTo(60 * RAIN_DROP_PERIOD + RAIN_FALL_TIME, 12);
    expect(RAIN_FALL_TIME).toBeCloseTo(RAIN_START_HEIGHT / RAIN_FALL_SPEED, 12);
  });

  it('t = 0 : une seule goutte, en haut de sa chute, aucun rond', () => {
    const rain = rainAt(42, 0);
    expect(rain.dropCount).toBe(1);
    expect(rain.rippleCount).toBe(0);
    expect(rain.drops[1]).toBeCloseTo(POND_WATER.maxY + RAIN_START_HEIGHT, 12);
  });

  it('une goutte tombe à vitesse constante, à la verticale de son point d’impact', () => {
    const impact = rainImpact(42, 0, POND_WATER, { x: 0, z: 0 });
    const t = RAIN_FALL_TIME / 2;
    // À mi-chute, seules les gouttes 0 à k sont nées ; la goutte 0 est la plus ancienne.
    const rain = rainAt(42, t);
    expect(rain.drops[0]).toBe(impact.x);
    expect(rain.drops[2]).toBe(impact.z);
    expect(rain.drops[1]).toBeCloseTo(
      POND_WATER.maxY + RAIN_START_HEIGHT - RAIN_FALL_SPEED * t,
      12,
    );
  });

  it('le rond naît au point d’impact de sa goutte, à l’instant de l’impact', () => {
    const impact = rainImpact(7, 0, POND_WATER, { x: 0, z: 0 });
    const justBefore = rainAt(7, rainImpactTime(0) - 1e-6);
    // Avant l'impact : la goutte 0 est encore en l'air, au ras de l'eau.
    expect(justBefore.rippleCount).toBe(0);
    expect(justBefore.drops[1] - POND_WATER.maxY).toBeLessThan(1e-4);
    const after = rainAt(7, rainImpactTime(0) + 1e-6);
    expect(after.rippleCount).toBe(1);
    expect(after.ripples[0]).toBe(impact.x);
    expect(after.ripples[1]).toBe(impact.z);
    expect(after.ripples[2]).toBeLessThan(1e-5);
    // Et la goutte 0 n'est plus en l'air.
    expect(Array.from(after.drops.subarray(0, 3 * after.dropCount))).not.toContain(impact.x);
  });

  it('l’état de la pluie n’entre pas dans la sauvegarde (schéma inchangé)', () => {
    const world = createDefaultWorld(42, 'bassin');
    const text = serializeWorld(world);
    expect(text).not.toMatch(/pluie|rain/i);
    expect(parseWorld(text).ok).toBe(true);
  });
});

describe('pluie : bornes (#106)', () => {
  it('au plus MAX_RAIN_DROPS gouttes et MAX_RIPPLES ronds, bornes atteintes', () => {
    let maxDrops = 0;
    let maxRipples = 0;
    // Tampon plus grand que les bornes : la borne est vérifiée, pas imposée par la capacité.
    const buffer = createRainBuffer(MAX_RAIN_DROPS + 5, MAX_RIPPLES + 5);
    for (let step = 0; step < 6000; step++) {
      const t = step * SIM_DT * 0.37;
      rainAt(42, t, buffer);
      maxDrops = Math.max(maxDrops, buffer.dropCount);
      maxRipples = Math.max(maxRipples, buffer.rippleCount);
    }
    expect(maxDrops).toBeLessThanOrEqual(MAX_RAIN_DROPS);
    expect(maxRipples).toBeLessThanOrEqual(MAX_RIPPLES);
    // Les bornes sont serrées : à une unité près, elles sont atteintes.
    expect(maxDrops).toBeGreaterThanOrEqual(MAX_RAIN_DROPS - 1);
    expect(maxRipples).toBeGreaterThanOrEqual(MAX_RIPPLES - 1);
  });

  it('âge des ronds dans [0, RIPPLE_DURATION[ ; gouttes au-dessus de la surface', () => {
    for (const seed of SEEDS) {
      for (const t of [0.05, 1, 10.123, 999.99, 3600]) {
        const rain = rainAt(seed, t);
        for (let i = 0; i < rain.rippleCount; i++) {
          const age = rain.ripples[3 * i + 2];
          expect(age).toBeGreaterThanOrEqual(0);
          expect(age).toBeLessThan(RIPPLE_DURATION);
        }
        for (let i = 0; i < rain.dropCount; i++) {
          const y = rain.drops[3 * i + 1];
          expect(y).toBeGreaterThan(POND_WATER.maxY);
          expect(y).toBeLessThanOrEqual(POND_WATER.maxY + RAIN_START_HEIGHT);
        }
      }
    }
  });

  it('un rond disparaît à RIPPLE_DURATION : absent juste après', () => {
    const end = rainImpactTime(0) + RIPPLE_DURATION;
    const impact = rainImpact(3, 0, POND_WATER, { x: 0, z: 0 });
    const xs = (rain: RainBuffer) =>
      Array.from({ length: rain.rippleCount }, (_, i) => rain.ripples[3 * i]);
    expect(xs(rainAt(3, end - 1e-6))).toContain(impact.x);
    expect(xs(rainAt(3, end + 1e-6))).not.toContain(impact.x);
  });

  it('ronds entièrement dans la surface, quel que soit leur rayon', () => {
    for (const seed of SEEDS) {
      for (let k = 0; k < 500; k++) {
        const p = rainImpact(seed, k, POND_WATER, { x: 0, z: 0 });
        expect(p.x - RIPPLE_MAX_RADIUS).toBeGreaterThanOrEqual(POND_WATER.minX);
        expect(p.x + RIPPLE_MAX_RADIUS).toBeLessThanOrEqual(POND_WATER.maxX);
        expect(p.z - RIPPLE_MAX_RADIUS).toBeGreaterThanOrEqual(POND_WATER.minZ);
        expect(p.z + RIPPLE_MAX_RADIUS).toBeLessThanOrEqual(POND_WATER.maxZ);
      }
    }
  });

  it('surface trop petite pour la marge : impact au centre', () => {
    const tiny = { minX: 0, maxX: 0.05, minY: 0, maxY: 0.1, minZ: -0.02, maxZ: 0.02 };
    expect(rainImpact(5, 9, tiny, { x: 9, z: 9 })).toEqual({ x: 0.025, z: 0 });
  });

  it('capacité réduite : les plus récents sont ignorés, jamais de débordement', () => {
    const small = createRainBuffer(2, 3);
    fillRain(42, 50, POND_WATER, small);
    expect(small.dropCount).toBe(2);
    expect(small.rippleCount).toBe(3);
    const full = rainAt(42, 50);
    expect(Array.from(small.ripples)).toEqual(Array.from(full.ripples.subarray(0, 9)));
  });

  it('rayon : 0 à l’impact, maximal à la fin, croissant, borné hors de la vie', () => {
    expect(rippleRadius(0)).toBe(0);
    expect(rippleRadius(RIPPLE_DURATION)).toBeCloseTo(RIPPLE_MAX_RADIUS, 12);
    expect(rippleRadius(-1)).toBe(0);
    expect(rippleRadius(10)).toBeCloseTo(RIPPLE_MAX_RADIUS, 12);
    let previous = -1;
    for (let a = 0; a <= RIPPLE_DURATION; a += RIPPLE_DURATION / 50) {
      const r = rippleRadius(a);
      expect(r).toBeGreaterThan(previous);
      previous = r;
    }
  });

  it('entrées invalides : RangeError', () => {
    const buffer = createRainBuffer();
    expect(() => fillRain(-1, 1, POND_WATER, buffer)).toThrow(RangeError);
    expect(() => fillRain(1.5, 1, POND_WATER, buffer)).toThrow(RangeError);
    expect(() => fillRain(42, -0.1, POND_WATER, buffer)).toThrow(RangeError);
    expect(() => fillRain(42, Number.NaN, POND_WATER, buffer)).toThrow(RangeError);
    expect(() => fillRain(42, Number.POSITIVE_INFINITY, POND_WATER, buffer)).toThrow(RangeError);
    expect(() => fillRain(42, (MAX_SEED + 2) * RAIN_DROP_PERIOD, POND_WATER, buffer)).toThrow(
      RangeError,
    );
    expect(() => createRainBuffer(-1)).toThrow(RangeError);
    expect(() => createRainBuffer(2, 1.5)).toThrow(RangeError);
  });
});

describe('pluie : nénuphars (#106)', () => {
  it('frémissement borné par RAIN_PAD_SHIVER_ANGLE', () => {
    let max = 0;
    for (let t = 0; t < 10; t += 0.013) {
      const s = rainShiver(t, 1.3);
      expect(Math.abs(s)).toBeLessThanOrEqual(RAIN_PAD_SHIVER_ANGLE);
      max = Math.max(max, Math.abs(s));
    }
    expect(max).toBeGreaterThan(0.9 * RAIN_PAD_SHIVER_ANGLE);
  });

  it('nénuphars : sans pluie, pose identique ; sous la pluie, rotation seule, bornée', () => {
    const pads = lilyPadLayout(42, POND_WATER, POND.lilyPads);
    expect(pads.length).toBeGreaterThan(0);
    const dry: LilyPadPose = { x: 0, z: 0, rotation: 0 };
    const wet: LilyPadPose = { x: 0, z: 0, rotation: 0 };
    let moved = false;
    for (const pad of pads) {
      for (const t of [0, 1.7, 33.3, 600]) {
        lilyPadPose(pad, t, dry);
        expect(lilyPadPose(pad, t, { x: 0, z: 0, rotation: 0 }, 0)).toEqual(dry);
        lilyPadPose(pad, t, wet, 1);
        expect(wet.x).toBe(dry.x);
        expect(wet.z).toBe(dry.z);
        expect(Math.abs(wet.rotation - dry.rotation)).toBeLessThanOrEqual(
          RAIN_PAD_SHIVER_ANGLE + 1e-12,
        );
        expect(Math.abs(wet.rotation - pad.rotation)).toBeLessThanOrEqual(
          LILY_PAD_SWAY_ANGLE + RAIN_PAD_SHIVER_ANGLE + 1e-12,
        );
        moved ||= wet.rotation !== dry.rotation;
      }
    }
    expect(moved).toBe(true);
  });

  it('nénuphars : frémissement hors de [0, 1] refusé', () => {
    const [pad] = lilyPadLayout(42, POND_WATER, POND.lilyPads);
    const out: LilyPadPose = { x: 0, z: 0, rotation: 0 };
    for (const bad of [-0.1, 1.1, Number.NaN]) {
      expect(() => lilyPadPose(pad, 1, out, bad)).toThrow(RangeError);
    }
  });

  it('environnements : pluie possible dans le bassin seulement', () => {
    expect(POND.rain).toBe(true);
    expect(TROPICAL_TANK.rain).toBe(false);
  });
});
