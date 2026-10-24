import { MAX_SEED } from '../core/random/prng';
import {
  BUBBLE_EMIT_PERIOD,
  BUBBLE_LARGE_RATIO,
  BUBBLE_MAX_LIFETIME,
  BUBBLE_MAX_SPEED,
  BUBBLE_MAX_SPREAD,
  BUBBLE_MIN_SPEED,
  BUBBLE_START_Y,
  bubblePosition,
  bubbleTraits,
  createBubbleBuffer,
  DEFAULT_BUBBLE_SOURCE,
  fillBubbles,
  MAX_BUBBLES,
  type BubbleBuffer,
  type BubbleTraits,
} from './bubbles';
import { MAX_TANK, waterVolume } from './tank';
import { advance, createDefaultWorld, worldBubbles } from './world';

const WATER = waterVolume();

function traits(seed: number, index: number): BubbleTraits {
  return bubbleTraits(seed, index, {
    speed: 0,
    wobble: 0,
    wobbleRate: 0,
    driftX: 0,
    driftZ: 0,
    jitterX: 0,
    jitterZ: 0,
    size: 1,
  });
}

function snapshot(buffer: BubbleBuffer): number[] {
  return Array.from(buffer.positions.subarray(0, buffer.count * 3));
}

describe('bulles : paramètres tirés', () => {
  it('même graine et même numéro ⇒ mêmes paramètres ; numéros voisins ⇒ différents', () => {
    expect(traits(42, 7)).toEqual(traits(42, 7));
    expect(traits(42, 7)).not.toEqual(traits(42, 8));
    expect(traits(42, 7)).not.toEqual(traits(43, 7));
  });

  it('restent dans leurs intervalles, sur toutes les graines extrêmes', () => {
    let large = 0;
    const n = 2000;
    for (const seed of [0, 1, 42, MAX_SEED]) {
      for (let k = 0; k < n / 4; k++) {
        const t = traits(seed, k);
        expect(t.speed).toBeGreaterThanOrEqual(BUBBLE_MIN_SPEED);
        expect(t.speed).toBeLessThan(BUBBLE_MAX_SPEED);
        expect([1, 2]).toContain(t.size);
        large += t.size === 2 ? 1 : 0;
      }
    }
    // Environ 30 % de grosses bulles.
    expect(large / n).toBeGreaterThan(BUBBLE_LARGE_RATIO - 0.05);
    expect(large / n).toBeLessThan(BUBBLE_LARGE_RATIO + 0.05);
  });

  it('refuse un numéro ou une graine invalides', () => {
    expect(() => traits(42, -1)).toThrow(RangeError);
    expect(() => traits(42, 0.5)).toThrow(RangeError);
    expect(() => traits(-1, 0)).toThrow(RangeError);
  });
});

describe('bulles : trajectoire', () => {
  it('naît exactement sur le point d’émission, puis monte à vitesse constante', () => {
    const t = traits(42, 3);
    const p = bubblePosition(t, 0, DEFAULT_BUBBLE_SOURCE, { x: 0, y: 0, z: 0 });
    expect(p).toEqual({
      x: DEFAULT_BUBBLE_SOURCE.x + t.jitterX,
      y: BUBBLE_START_Y,
      z: DEFAULT_BUBBLE_SOURCE.z + t.jitterZ,
    });
    const q = bubblePosition(t, 2, DEFAULT_BUBBLE_SOURCE, { x: 0, y: 0, z: 0 });
    expect(q.y).toBe(BUBBLE_START_Y + t.speed * 2);
  });

  it('zigzague : l’écart selon X change de signe au cours de la montée', () => {
    const t = traits(42, 5);
    const center = (age: number) => DEFAULT_BUBBLE_SOURCE.x + t.jitterX + t.driftX * age;
    const signs = new Set<number>();
    for (let age = 0.05; age < 2; age += 0.05) {
      const p = bubblePosition(t, age, DEFAULT_BUBBLE_SOURCE, { x: 0, y: 0, z: 0 });
      signs.add(Math.sign(p.x - center(age)));
    }
    expect(signs).toEqual(new Set([-1, 1]));
  });

  it('reste à moins de BUBBLE_MAX_SPREAD de la verticale du diffuseur, et dans l’eau', () => {
    const buffer = createBubbleBuffer();
    for (const seed of [0, 42, MAX_SEED]) {
      for (let time = 0; time < 30; time += 0.37) {
        fillBubbles(seed, time, buffer);
        for (let i = 0; i < buffer.count; i++) {
          const [x, y, z] = buffer.positions.subarray(3 * i, 3 * i + 3);
          expect(Math.abs(x - DEFAULT_BUBBLE_SOURCE.x)).toBeLessThanOrEqual(BUBBLE_MAX_SPREAD);
          expect(Math.abs(z - DEFAULT_BUBBLE_SOURCE.z)).toBeLessThanOrEqual(BUBBLE_MAX_SPREAD);
          expect(y).toBeGreaterThanOrEqual(BUBBLE_START_Y);
          expect(y).toBeLessThan(WATER.maxY);
        }
      }
    }
    // L'écart reste discret : moins de 5 cm.
    expect(BUBBLE_MAX_SPREAD).toBeLessThan(0.05);
  });
});

describe('bulles : émission et fin à la surface', () => {
  it('t = 0 : une seule bulle, sur le diffuseur', () => {
    const buffer = createBubbleBuffer();
    expect(fillBubbles(42, 0, buffer)).toBe(1);
    const t = traits(42, 0);
    expect(snapshot(buffer)).toEqual([
      DEFAULT_BUBBLE_SOURCE.x + t.jitterX,
      BUBBLE_START_Y,
      DEFAULT_BUBBLE_SOURCE.z + t.jitterZ,
    ]);
    expect(buffer.sizes[0]).toBe(t.size);
  });

  it('cadence fixe : une bulle de plus à chaque période tant qu’aucune n’a éclaté', () => {
    const buffer = createBubbleBuffer();
    for (let k = 0; k < 10; k++) {
      // Juste avant et juste à la k-ième émission (temps exact, puis juste en dessous).
      expect(fillBubbles(42, k * BUBBLE_EMIT_PERIOD, buffer)).toBe(k + 1);
      if (k > 0) {
        expect(fillBubbles(42, k * BUBBLE_EMIT_PERIOD - 1e-6, buffer)).toBe(k);
      }
    }
  });

  it('valeurs exactes à t = 1 s : 5 bulles, de la plus ancienne à la plus récente', () => {
    const buffer = createBubbleBuffer();
    expect(fillBubbles(42, 1, buffer)).toBe(5);
    for (let k = 0; k < 5; k++) {
      const t = traits(42, k);
      const age = 1 - k * BUBBLE_EMIT_PERIOD;
      const p = bubblePosition(t, age, DEFAULT_BUBBLE_SOURCE, { x: 0, y: 0, z: 0 });
      expect(Array.from(buffer.positions.subarray(3 * k, 3 * k + 3))).toEqual([p.x, p.y, p.z]);
      expect(buffer.sizes[k]).toBe(t.size);
    }
  });

  it('une bulle disparaît dès qu’elle atteint la surface', () => {
    const t = traits(42, 0);
    const lifetime = (WATER.maxY - BUBBLE_START_Y) / t.speed;
    const buffer = createBubbleBuffer();
    fillBubbles(42, lifetime - 1e-3, buffer);
    // La bulle 0 est la plus ancienne : en tête de liste, juste sous la surface.
    expect(buffer.positions[1]).toBeLessThan(WATER.maxY);
    expect(buffer.positions[1]).toBeGreaterThan(WATER.maxY - 0.001);
    const before = buffer.count;
    fillBubbles(42, lifetime + 1e-3, buffer);
    const alive = Array.from({ length: buffer.count }, (_, i) => buffer.positions[3 * i + 1]);
    expect(alive.every((y) => y < WATER.maxY)).toBe(true);
    // Une bulle de plus éclatée au moins, une de plus émise au plus.
    expect(buffer.count).toBeLessThanOrEqual(before);
  });

  it('régime établi : le nombre de bulles reste borné par MAX_BUBBLES, sur toutes les graines', () => {
    // Tampon dimensionné pour le plus haut des bacs réglables (#171), donc au moins celui du
    // bac par défaut.
    expect(MAX_BUBBLES).toBe(
      Math.floor(
        (waterVolume(MAX_TANK).maxY - BUBBLE_START_Y) / BUBBLE_MIN_SPEED / BUBBLE_EMIT_PERIOD,
      ) + 1,
    );
    expect(MAX_BUBBLES).toBeGreaterThanOrEqual(
      Math.floor(BUBBLE_MAX_LIFETIME / BUBBLE_EMIT_PERIOD) + 1,
    );
    expect(MAX_BUBBLES).toBeLessThanOrEqual(32);
    const buffer = createBubbleBuffer(MAX_BUBBLES + 10);
    let maxSeen = 0;
    for (const seed of [0, 1, 42, MAX_SEED]) {
      for (let time = 0; time < 120; time += 0.1) {
        maxSeen = Math.max(maxSeen, fillBubbles(seed, time, buffer));
      }
    }
    expect(maxSeen).toBeLessThanOrEqual(MAX_BUBBLES);
    // Débit moyen ÷ vitesse moyenne : une douzaine de bulles en même temps.
    expect(maxSeen).toBeGreaterThanOrEqual(10);
  });

  it('écrit en place dans le tampon fourni, sans le réallouer', () => {
    const buffer = createBubbleBuffer();
    const { positions, sizes } = buffer;
    for (let time = 0; time < 20; time += 0.5) {
      fillBubbles(7, time, buffer);
    }
    expect(buffer.positions).toBe(positions);
    expect(buffer.sizes).toBe(sizes);
    expect(positions.length).toBe(MAX_BUBBLES * 3);
  });

  it('tampon trop petit : tronqué à sa capacité, sans écrire au-delà', () => {
    const buffer = createBubbleBuffer(2);
    expect(fillBubbles(42, 10, buffer)).toBe(2);
    expect(createBubbleBuffer(0).sizes.length).toBe(0);
    expect(fillBubbles(42, 10, createBubbleBuffer(0))).toBe(0);
    expect(() => createBubbleBuffer(-1)).toThrow(RangeError);
    expect(() => createBubbleBuffer(1.5)).toThrow(RangeError);
  });

  it('même graine et même temps ⇒ mêmes bulles ; autre graine ⇒ autres bulles', () => {
    const a = createBubbleBuffer();
    const b = createBubbleBuffer();
    fillBubbles(42, 12.3, a);
    fillBubbles(42, 12.3, b);
    expect(snapshot(a)).toEqual(snapshot(b));
    fillBubbles(43, 12.3, b);
    expect(snapshot(a)).not.toEqual(snapshot(b));
  });

  it('autre diffuseur : même nuage translaté', () => {
    const a = createBubbleBuffer();
    const b = createBubbleBuffer();
    fillBubbles(42, 9, a);
    fillBubbles(42, 9, b, { x: DEFAULT_BUBBLE_SOURCE.x + 0.1, z: DEFAULT_BUBBLE_SOURCE.z });
    expect(b.count).toBe(a.count);
    for (let i = 0; i < a.count; i++) {
      expect(b.positions[3 * i]).toBeCloseTo(a.positions[3 * i] + 0.1, 12);
      expect(b.positions[3 * i + 1]).toBe(a.positions[3 * i + 1]);
    }
  });

  it('eau plus basse que le diffuseur : aucune bulle', () => {
    const buffer = createBubbleBuffer();
    const shallow = { ...WATER, maxY: BUBBLE_START_Y };
    expect(fillBubbles(42, 5, buffer, DEFAULT_BUBBLE_SOURCE, shallow)).toBe(0);
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])('refuse le temps %s', (time) => {
    expect(() => fillBubbles(42, time, createBubbleBuffer())).toThrow(RangeError);
  });

  it('refuse un temps au-delà du dernier numéro de bulle, accepte un temps très long', () => {
    const buffer = createBubbleBuffer();
    expect(fillBubbles(42, 30 * 24 * 3600, buffer)).toBeGreaterThan(0);
    expect(() => fillBubbles(42, (MAX_SEED + 2) * BUBBLE_EMIT_PERIOD, buffer)).toThrow(RangeError);
  });
});

describe('bulles du monde', () => {
  it('dépendent du temps du monde, pas du chemin suivi : 600 pas d’un coup ou en 3 fois', () => {
    const world = createDefaultWorld(42);
    const direct = advance(world, 600);
    const stepped = advance(advance(advance(world, 200), 150), 250);
    const a = createBubbleBuffer();
    const b = createBubbleBuffer();
    worldBubbles(direct, a);
    worldBubbles(stepped, b);
    expect(a.count).toBeGreaterThan(0);
    expect(snapshot(a)).toEqual(snapshot(b));
  });

  it('ne changent pas les poissons : le monde est le même avec ou sans lecture des bulles', () => {
    const buffer = createBubbleBuffer();
    const read = createDefaultWorld(42);
    let w = read;
    for (let i = 0; i < 5; i++) {
      w = advance(w, 60);
      worldBubbles(w, buffer);
    }
    expect(w).toEqual(advance(createDefaultWorld(42), 300));
  });
});
