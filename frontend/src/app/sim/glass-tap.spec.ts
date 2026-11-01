import { describe, expect, it } from 'vitest';

import {
  TAP_PITCH_RATIO,
  TAP_RADIUS,
  TAP_REACTIONS,
  glassPoint,
  tapGlassInPlace,
  type GlassPoint,
} from './glass-tap';
import { createImmersiveWorld, immersiveLayout } from './immersive-tank';
import { SPECIES, type SpeciesId } from './species';
import type { Fish } from './swimmer';
import {
  advance,
  advanceInPlace,
  createWorld,
  tapGlassInWorld,
  type MutableWorld,
  type World,
} from './world';

type MutableFish = { -readonly [K in keyof Fish]: Fish[K] };

const LAYOUT = immersiveLayout({ width: 70, height: 150 }, 42);
const DIMS = LAYOUT.dimensions;

function world(seed = 7): MutableWorld {
  return createImmersiveWorld(seed, LAYOUT) as MutableWorld;
}

/** Copie d'un poisson du monde, d'espèce `species`, posée en (x, y, z). */
function fishAt(species: SpeciesId, x: number, y: number, z: number): MutableFish {
  const base = createWorld(3, [{ species, count: 1 }]).entities[0];
  return { ...base, x, y, z, yaw: 0.3, pitch: 0, speed: SPECIES[species].minSpeed };
}

const FRONT: GlassPoint = { x: 0, y: 0.2, z: 0.1 };

describe('glass-tap', () => {
  it('chaque espèce a une réaction ; marcheurs et amphibiens n’en ont aucune', () => {
    for (const def of Object.values(SPECIES)) {
      const reaction = TAP_REACTIONS[def.id];
      if (def.walker !== undefined || def.amphibian !== undefined) {
        expect(reaction).toBeNull();
      } else {
        expect(['fuite', 'curiosite']).toContain(reaction);
      }
    }
    const reactions = new Set(Object.values(TAP_REACTIONS));
    expect(reactions.has('fuite') && reactions.has('curiosite')).toBe(true);
  });

  it('glassPoint : coins de l’écran → coins de la vitre avant, fractions bornées', () => {
    expect(glassPoint(DIMS, 0, 0)).toEqual({
      x: -DIMS.width / 2,
      y: DIMS.height,
      z: DIMS.depth / 2,
    });
    expect(glassPoint(DIMS, 1, 1)).toEqual({ x: DIMS.width / 2, y: 0, z: DIMS.depth / 2 });
    expect(glassPoint(DIMS, 0.5, 0.5)).toEqual({ x: 0, y: DIMS.height / 2, z: DIMS.depth / 2 });
    expect(glassPoint(DIMS, -3, 7)).toEqual(glassPoint(DIMS, 0, 1));
    expect(glassPoint(DIMS, Number.NaN, 0.5)).toBeNull();
    expect(glassPoint(DIMS, 0.5, Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('fuite : cap opposé au point, vitesse maximale, inclinaison bornée', () => {
    const fish = fishAt('neon', 0.05, 0.2, 0.1);
    expect(tapGlassInPlace([fish], FRONT)).toBe(1);
    expect(fish.yaw).toBeCloseTo(0, 12); // direction +x, à l'opposé du point
    expect(fish.speed).toBe(SPECIES.neon.maxSpeed);
    const below = fishAt('neon', 0, 0.1, 0.1 - 1e-3);
    tapGlassInPlace([below], FRONT);
    expect(Math.abs(below.pitch)).toBeLessThanOrEqual(SPECIES.neon.maxPitch * TAP_PITCH_RATIO);
    expect(below.pitch).toBeLessThan(0); // sous le point : il plonge
  });

  it('curiosité : cap vers le point, vitesse de croisière', () => {
    const fish = fishAt('guppy', 0, 0.2, 0.0);
    expect(tapGlassInPlace([fish], FRONT)).toBe(1);
    expect(fish.yaw).toBeCloseTo(Math.PI / 2, 12); // vers +z, la vitre avant
    expect(fish.pitch).toBeCloseTo(0, 12);
    expect(fish.speed).toBe(SPECIES.guppy.cruiseSpeed);
  });

  it('poisson exactement sous le point : la fuite part vers le fond, la curiosité garde son cap', () => {
    const shy = fishAt('neon', FRONT.x, FRONT.y, FRONT.z);
    const bold = fishAt('guppy', FRONT.x, FRONT.y, FRONT.z);
    expect(tapGlassInPlace([shy, bold], FRONT)).toBe(2);
    expect(shy.yaw).toBeCloseTo(-Math.PI / 2, 12);
    expect(Number.isFinite(shy.pitch)).toBe(true);
    expect(bold.yaw).toBe(0.3);
  });

  it('hors de portée, marcheurs et amphibiens : aucune réaction', () => {
    const far = fishAt('neon', FRONT.x + TAP_RADIUS + 1e-3, FRONT.y, FRONT.z);
    const walker = fishAt('axolotl', FRONT.x, FRONT.y, FRONT.z);
    const before = [{ ...far }, { ...walker }];
    expect(tapGlassInPlace([far, walker], FRONT)).toBe(0);
    expect([far, walker]).toEqual(before);
    // Au bord exact de la portée : réagit.
    const edge = fishAt('neon', FRONT.x + TAP_RADIUS, FRONT.y, FRONT.z);
    expect(tapGlassInPlace([edge], FRONT)).toBe(1);
  });

  it('bac vide, point ou portée invalides : aucun effet', () => {
    expect(tapGlassInPlace([], FRONT)).toBe(0);
    const fish = fishAt('neon', FRONT.x, FRONT.y, FRONT.z);
    const before = { ...fish };
    expect(tapGlassInPlace([fish], { x: Number.NaN, y: 0, z: 0 })).toBe(0);
    expect(tapGlassInPlace([fish], FRONT, -1)).toBe(0);
    expect(tapGlassInPlace([fish], FRONT, Number.POSITIVE_INFINITY)).toBe(0);
    expect(tapGlassInPlace([fish], FRONT, 0)).toBe(1); // portée nulle : seulement au point
    expect(before.yaw).toBe(0.3);
  });

  it('aucun tirage : générateurs inchangés, déterministe à graine fixe', () => {
    const a = world(11);
    const b = world(11);
    advanceInPlace(a, 30);
    advanceInPlace(b, 30);
    const tap = glassPoint(DIMS, 0.5, 0.5)!;
    // Toute la vitre à portée : tous les poissons du bac réagissent.
    const reacted = tapGlassInPlace(a.entities as MutableFish[], tap, 10);
    expect(reacted).toBe(a.entities.length);
    tapGlassInPlace(b.entities as MutableFish[], tap, 10);
    expect(a.entities.map((f) => f.rng)).toEqual(b.entities.map((f) => f.rng));
    advanceInPlace(a, 120);
    advanceInPlace(b, 120);
    expect(a).toEqual(b);
  });

  it('un tapotement change la nage ; sans tapotement, le monde avance comme avant', () => {
    const base: World = world(5);
    const plain = advance(base, 60);
    const tapped = world(5);
    tapGlassInPlace(tapped.entities as MutableFish[], glassPoint(DIMS, 0.5, 0.5)!, 10);
    advanceInPlace(tapped, 60);
    expect(tapped.entities).not.toEqual(plain.entities);
    expect(advance(world(5), 60)).toEqual(plain);
  });

  it('tapGlassInWorld (#377) : même effet que tapGlassInPlace sur les poissons du monde', () => {
    const viaWorld = world(9);
    const viaFishes = world(9);
    const tap = glassPoint(DIMS, 0.5, 0.5)!;
    expect(tapGlassInWorld(viaWorld, tap, 10)).toBe(viaWorld.entities.length);
    tapGlassInPlace(viaFishes.entities as MutableFish[], tap, 10);
    expect(viaWorld).toEqual(viaFishes);
    // Portée par défaut : `TAP_RADIUS` ; point invalide : aucun effet.
    const near = world(9);
    const defaultRadius = world(9);
    expect(tapGlassInWorld(near, tap)).toBe(
      tapGlassInPlace(defaultRadius.entities as MutableFish[], tap, TAP_RADIUS),
    );
    expect(near).toEqual(defaultRadius);
    const untouched = world(9);
    expect(tapGlassInWorld(untouched, { x: Number.NaN, y: 0, z: 0 })).toBe(0);
    expect(untouched).toEqual(world(9));
  });
});
