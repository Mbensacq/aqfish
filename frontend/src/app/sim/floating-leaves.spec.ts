import { MAX_SEED } from '../core/random/prng';
import { environmentWater, POND, TROPICAL_TANK } from './environment';
import {
  createFloatingLeafBuffer,
  fillFloatingLeaves,
  floatingLeafInset,
  LEAF_BIRTH_JITTER,
  LEAF_DRIFT_SPEED,
  LEAF_EDGE_MARGIN,
  LEAF_LENGTH,
  LEAF_LIFETIME,
  LEAF_OCHRE_SHARE,
  LEAF_SETTLE_TIME,
  LEAF_SHAPE_COUNT,
  LEAF_SINK_TIME,
  LEAF_SLOT_PERIOD,
  LEAF_STRIDE,
  LEAF_WAVE_SLOTS,
  LEAF_WOBBLE,
  leafWave,
  MAX_FLOATING_LEAVES,
  type FloatingLeafBuffer,
} from './floating-leaves';
import { parseWorld, serializeWorld } from './save';
import type { Box3 } from './tank';
import { createDefaultWorld } from './world';

const POND_WATER = environmentWater('bassin');
const SEEDS = [0, 1, 7, 42, 1234, MAX_SEED];

function leavesAt(
  seed: number,
  time: number,
  water: Box3 = POND_WATER,
  buffer: FloatingLeafBuffer = createFloatingLeafBuffer(),
): number[][] {
  const count = fillFloatingLeaves(seed, time, water, buffer);
  return Array.from({ length: count }, (_, i) =>
    Array.from(buffer.leaves.subarray(i * LEAF_STRIDE, (i + 1) * LEAF_STRIDE)),
  );
}

describe('feuilles mortes : déterminisme (#107)', () => {
  it('même graine et même temps : mêmes feuilles, quel que soit le chemin', () => {
    for (const seed of SEEDS) {
      const direct = leavesAt(seed, 95.5);
      const reused = createFloatingLeafBuffer();
      for (const t of [0, 400, 12, 95.4]) {
        fillFloatingLeaves(seed, t, POND_WATER, reused);
      }
      expect(leavesAt(seed, 95.5, POND_WATER, reused)).toEqual(direct);
    }
  });

  it('graines différentes : feuilles différentes', () => {
    const sample = (seed: number) =>
      [20, 80, 140, 200, 260].flatMap((t) => leavesAt(seed, t)).flat();
    expect(sample(1)).not.toEqual(sample(2));
  });

  it('graine 42 des captures : des feuilles posées à t = 30 s, dont une de pleine taille', () => {
    const leaves = leavesAt(42, 30);
    expect(leaves.length).toBeGreaterThanOrEqual(2);
    expect(leaves.some((leaf) => leaf[3] >= LEAF_LENGTH.min)).toBe(true);
  });

  it('aucune feuille à t = 0 ; apparition, trajectoire continue, puis disparition', () => {
    for (const seed of SEEDS) {
      expect(leavesAt(seed, 0)).toEqual([]);
    }
    // Suivre la première feuille de la graine 42 image par image : elle grandit à la pose,
    // dérive sans saut et rapetisse avant de disparaître.
    const dt = 1 / 30;
    let tracked: number[] | null = null;
    let born = -1;
    let gone = -1;
    let grown = 0;
    for (let t = 0; t < 120 && gone < 0; t += dt) {
      const leaves = leavesAt(42, t);
      if (!tracked) {
        if (leaves.length > 0) {
          born = t;
          tracked = leaves[0];
          // Elle se pose : à peine visible à sa première image.
          expect(tracked[3]).toBeLessThan((LEAF_LENGTH.max * 2 * dt) / LEAF_SETTLE_TIME);
        }
        continue;
      }
      const previous: number[] = tracked;
      const next = leaves.find(
        (leaf) =>
          leaf[4] === previous[4] &&
          leaf[5] === previous[5] &&
          Math.hypot(leaf[0] - previous[0], leaf[1] - previous[1]) < 0.002 &&
          Math.abs(leaf[3] - previous[3]) < 0.003,
      );
      if (!next) {
        gone = t;
        // Juste avant de disparaître, elle avait presque fini de couler.
        expect(previous[3]).toBeLessThan((LEAF_LENGTH.max * 2 * dt) / LEAF_SINK_TIME);
      } else {
        grown = Math.max(grown, next[3]);
        tracked = next;
      }
    }
    expect(born).toBeGreaterThanOrEqual(0);
    expect(gone - born).toBeCloseTo(LEAF_LIFETIME, 0);
    expect(grown).toBeGreaterThanOrEqual(LEAF_LENGTH.min);
  });

  it('longueur affichée dans [0, longueur maximale], pose et descente plus courtes que la vie', () => {
    const buffer = createFloatingLeafBuffer();
    let checked = 0;
    for (let t = 0; t < 600; t += 0.25) {
      fillFloatingLeaves(7, t, POND_WATER, buffer);
      for (let i = 0; i < buffer.count; i++) {
        const length = buffer.leaves[i * LEAF_STRIDE + 3];
        expect(length).toBeGreaterThanOrEqual(0);
        expect(length).toBeLessThanOrEqual(LEAF_LENGTH.max);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(100);
    expect(LEAF_SETTLE_TIME + LEAF_SINK_TIME).toBeLessThan(LEAF_LIFETIME);
  });

  it('formes et teintes entières dans leurs plages', () => {
    const seen = new Set<string>();
    for (const seed of SEEDS) {
      for (let t = 0; t < 900; t += 13) {
        for (const leaf of leavesAt(seed, t)) {
          expect(Number.isInteger(leaf[4]) && leaf[4] >= 0 && leaf[4] < LEAF_SHAPE_COUNT).toBe(
            true,
          );
          expect([0, 1]).toContain(leaf[5]);
          seen.add(`${leaf[4]}:${leaf[5]}`);
        }
      }
    }
    // Les deux teintes et plusieurs formes apparaissent.
    expect(seen.size).toBeGreaterThanOrEqual(6);
  });

  it('teinte ocre la plus fréquente (#138), proche de LEAF_OCHRE_SHARE', () => {
    let ochre = 0;
    let total = 0;
    for (const seed of SEEDS) {
      for (let t = 0; t < 1800; t += 7) {
        for (const leaf of leavesAt(seed, t)) {
          total++;
          ochre += leaf[5] === 1 ? 1 : 0;
        }
      }
    }
    expect(total).toBeGreaterThan(200);
    expect(ochre / total).toBeGreaterThan(LEAF_OCHRE_SHARE - 0.15);
    expect(ochre / total).toBeLessThan(LEAF_OCHRE_SHARE + 0.15);
    expect(LEAF_OCHRE_SHARE).toBeGreaterThan(0.5);
    expect(LEAF_OCHRE_SHARE).toBeLessThan(1);
  });
});

describe('feuilles mortes : bornes (#107)', () => {
  it(`jamais plus de ${MAX_FLOATING_LEAVES} feuilles ; souvent peu, parfois aucune`, () => {
    let max = 0;
    let sum = 0;
    let empty = 0;
    let samples = 0;
    for (const seed of [...SEEDS, 3, 99, 2024, 77777]) {
      for (let t = 0; t < 1500; t += 2.9) {
        const count = fillFloatingLeaves(seed, t, POND_WATER, createFloatingLeafBuffer());
        max = Math.max(max, count);
        sum += count;
        empty += count === 0 ? 1 : 0;
        samples++;
      }
    }
    expect(max).toBeLessThanOrEqual(MAX_FLOATING_LEAVES);
    expect(MAX_FLOATING_LEAVES).toBe(8);
    expect(sum / samples).toBeGreaterThan(0.5);
    expect(sum / samples).toBeLessThan(3.5);
    expect(empty).toBeGreaterThan(0);
  });

  it('borne exacte : la capacité théorique suffit à toute vague', () => {
    // Pire cas : toutes les feuilles nées au plus tard dans leur créneau, vivantes ensemble.
    const alive = Math.floor(LEAF_LIFETIME / LEAF_SLOT_PERIOD + LEAF_BIRTH_JITTER) + 1;
    expect(MAX_FLOATING_LEAVES).toBe(alive);
  });

  // Délai explicite (#244, docs/PIEGES.md) : ≈ 1,1 s en local, bien plus en CI lente.
  it('les feuilles restent dans le bassin, à distance de la bordure, même contre le bord', () => {
    const half = LEAF_LENGTH.max / 2;
    let atEdge = 0;
    const inset = floatingLeafInset();
    for (const seed of SEEDS) {
      for (let t = 0; t < 2000; t += 1.7) {
        for (const [x, z, , length] of leavesAt(seed, t)) {
          expect(length).toBeLessThanOrEqual(LEAF_LENGTH.max);
          expect(x - half).toBeGreaterThanOrEqual(POND_WATER.minX + LEAF_EDGE_MARGIN - 1e-9);
          expect(x + half).toBeLessThanOrEqual(POND_WATER.maxX - LEAF_EDGE_MARGIN + 1e-9);
          expect(z - half).toBeGreaterThanOrEqual(POND_WATER.minZ + LEAF_EDGE_MARGIN - 1e-9);
          expect(z + half).toBeLessThanOrEqual(POND_WATER.maxZ - LEAF_EDGE_MARGIN + 1e-9);
          if (
            Math.min(
              x - POND_WATER.minX,
              POND_WATER.maxX - x,
              z - POND_WATER.minZ,
              POND_WATER.maxZ - z,
            ) <
            inset + LEAF_WOBBLE + 1e-6
          ) {
            atEdge++;
          }
        }
      }
    }
    // Certaines feuilles atteignent le bord et s'y arrêtent : le cas est bien exercé.
    expect(atEdge).toBeGreaterThan(0);
  }, 30_000);

  it('dérive lente : au plus la vitesse maximale plus le balancement', () => {
    const buffer = createFloatingLeafBuffer();
    for (const seed of [42, 7]) {
      let previous = leavesAt(seed, 100, POND_WATER, buffer);
      for (let t = 101; t < 160; t++) {
        const current = leavesAt(seed, t, POND_WATER, buffer);
        // Même feuille si même rang et même forme (aucune naissance au milieu).
        if (current.length === previous.length) {
          current.forEach((leaf, i) => {
            const step = Math.hypot(leaf[0] - previous[i][0], leaf[1] - previous[i][1]);
            expect(step).toBeLessThan(
              LEAF_DRIFT_SPEED.max + (2 * Math.PI * LEAF_WOBBLE) / 9 + 1e-9,
            );
          });
        }
        previous = current;
      }
    }
  });

  it('bassin minuscule : feuilles près du centre, jamais hors de l’eau, sans erreur', () => {
    const tiny: Box3 = { minX: -0.01, maxX: 0.01, minY: 0, maxY: 0.1, minZ: -0.02, maxZ: 0.02 };
    let seen = 0;
    for (let t = 0; t < 600; t += 3) {
      for (const [x, z] of leavesAt(1, t, tiny)) {
        expect(Math.abs(x)).toBeLessThanOrEqual(0.01);
        expect(Math.abs(z)).toBeLessThanOrEqual(0.02);
        seen++;
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('tampon trop petit : les plus récentes sont ignorées ; capacité invalide refusée', () => {
    const time = Array.from({ length: 200 }, (_, i) => 5 * i).find(
      (t) => leavesAt(123, t).length > 1,
    )!;
    const full = leavesAt(123, time);
    expect(full.length).toBeGreaterThan(1);
    const small = createFloatingLeafBuffer(1);
    expect(fillFloatingLeaves(123, time, POND_WATER, small)).toBe(1);
    expect(Array.from(small.leaves)).toEqual(full[0]);
    expect(fillFloatingLeaves(123, time, POND_WATER, createFloatingLeafBuffer(0))).toBe(0);
    for (const bad of [-1, 1.5, NaN]) {
      expect(() => createFloatingLeafBuffer(bad)).toThrow(RangeError);
    }
    expect(() => createFloatingLeafBuffer(-1)).toThrow('capacité invalide : -1');
    expect(() => createFloatingLeafBuffer(1.5)).toThrow('capacité invalide : 1.5');
  });

  it('refuse une graine invalide, un temps négatif, non fini ou trop grand', () => {
    const buffer = createFloatingLeafBuffer();
    expect(() => fillFloatingLeaves(-1, 0, POND_WATER, buffer)).toThrow(RangeError);
    expect(() => fillFloatingLeaves(1.5, 0, POND_WATER, buffer)).toThrow(RangeError);
    for (const bad of [-0.1, NaN, Infinity]) {
      expect(() => fillFloatingLeaves(1, bad, POND_WATER, buffer)).toThrow(
        `time doit être un réel positif ou nul (reçu : ${bad})`,
      );
    }
    expect(() =>
      fillFloatingLeaves(1, (MAX_SEED + 2) * LEAF_SLOT_PERIOD, POND_WATER, buffer),
    ).toThrow(`time trop grand pour numéroter les créneaux (reçu : ${(MAX_SEED + 2) * 7})`);
    // Le dernier créneau représentable passe.
    expect(() =>
      fillFloatingLeaves(1, MAX_SEED * LEAF_SLOT_PERIOD, POND_WATER, buffer),
    ).not.toThrow();
  });
});

describe('feuilles mortes : vagues (#107)', () => {
  it('intensité dans [0, 1[, déterministe, différente d’une vague à l’autre', () => {
    const values = Array.from({ length: 50 }, (_, w) => leafWave(42, w));
    for (const wave of values) {
      expect(wave.intensity).toBeGreaterThanOrEqual(0);
      expect(wave.intensity).toBeLessThan(1);
      expect(wave.breeze).toBeGreaterThanOrEqual(0);
      expect(wave.breeze).toBeLessThan(2 * Math.PI);
    }
    expect(leafWave(42, 3)).toEqual(values[3]);
    expect(new Set(values.map((w) => w.intensity)).size).toBe(50);
    // Vagues le plus souvent faibles (carré d'un tirage uniforme : médiane 0,25).
    const weak = values.filter((w) => w.intensity < 0.5).length;
    expect(weak).toBeGreaterThan(25);
  });

  it('une vague nulle ne donne aucune feuille', () => {
    // Vague très faible : aucune feuille n'y naît.
    const feeble = Array.from({ length: 400 }, (_, w) => w).find(
      (w) => leafWave(7, w).intensity < 0.002,
    );
    expect(feeble).toBeDefined();
    const start = feeble! * LEAF_WAVE_SLOTS * LEAF_SLOT_PERIOD;
    const before = leavesAt(7, start).length;
    // Fin de la vague : seules les feuilles nées avant elle peuvent encore flotter.
    const end = start + LEAF_WAVE_SLOTS * LEAF_SLOT_PERIOD - 0.01;
    expect(leavesAt(7, end).length).toBeLessThanOrEqual(before);
  });
});

describe('feuilles mortes : environnements et sauvegarde (#107)', () => {
  it('le bassin en a, le bac tropical non', () => {
    expect(POND.floatingLeaves).toBe(true);
    expect(TROPICAL_TANK.floatingLeaves).toBe(false);
  });

  it('rien de nouveau dans la sauvegarde : le monde ne porte aucune feuille', () => {
    const world = createDefaultWorld(42);
    const text = serializeWorld(world);
    expect(text).not.toMatch(/feuille|leaf/i);
    expect(parseWorld(text).ok).toBe(true);
  });
});

describe('feuilles mortes : valeurs figées (#699)', () => {
  /** Feuilles de la graine 42 au millionième : x, z, rotation, longueur, forme, teinte. */
  const fixed = (time: number, water: Box3 = POND_WATER, currentX = 0, currentZ = 0) => {
    const buffer = createFloatingLeafBuffer();
    const count = fillFloatingLeaves(42, time, water, buffer, currentX, currentZ);
    return Array.from({ length: count }, (_, i) =>
      Array.from(buffer.leaves.subarray(i * LEAF_STRIDE, (i + 1) * LEAF_STRIDE)).map(
        (v) => Math.round(v * 1e6) / 1e6,
      ),
    );
  };

  it('marge de la surface : bordure, demi-feuille la plus longue et balancement', () => {
    expect(floatingLeafInset()).toBeCloseTo(
      LEAF_EDGE_MARGIN + LEAF_LENGTH.max / 2 + LEAF_WOBBLE,
      12,
    );
    expect(floatingLeafInset()).toBeCloseTo(0.105, 12);
  });

  it('vagues : intensité et cap de la brise', () => {
    expect(
      [0, 1, 2].map((k) => {
        const wave = leafWave(42, k);
        return [Math.round(wave.intensity * 1e6) / 1e6, Math.round(wave.breeze * 1e6) / 1e6];
      }),
    ).toEqual([
      [0.978152, 0.31575],
      [0.318438, 3.092128],
      [0.003408, 0.011572],
    ]);
  });

  it('eau calme : position, rotation, taille, forme et teinte', () => {
    expect(fixed(30)).toEqual([
      [-0.235163, 0.175989, 7.088585, 0.095174, 4, 1],
      [-0.741604, -0.336205, 2.0788, 0.104624, 3, 1],
      [-0.337991, -0.389705, 3.477618, 0.014766, 5, 0],
    ]);
    expect(fixed(250)).toEqual([
      [0.236029, -0.009459, 4.718311, 0.103538, 2, 1],
      [-0.325195, 0.19439, -0.110969, 0.125446, 1, 0],
      [0.408325, 0.351181, 6.966826, 0.118429, 0, 1],
      [0.570679, -0.553842, 1.393594, 0.110749, 1, 1],
    ]);
  });

  it('courant selon X, selon Z, ou les deux : dérive ajoutée à la brise (#460)', () => {
    expect(fixed(250, POND_WATER, 0.004, -0.003)).toEqual([
      [0.397807, -0.124019, 4.718311, 0.103538, 2, 1],
      [-0.196187, 0.094063, -0.110969, 0.125446, 1, 0],
      [0.467509, 0.302182, 6.966826, 0.118429, 0, 1],
      [0.592108, -0.559938, 1.393594, 0.110749, 1, 1],
    ]);
    expect(fixed(250, POND_WATER, 0.004, 0)).toEqual([
      [0.395075, -0.007559, 4.718311, 0.103538, 2, 1],
      [-0.195311, 0.192962, -0.110969, 0.125446, 1, 0],
      [0.470652, 0.350469, 6.966826, 0.118429, 0, 1],
      [0.588658, -0.550166, 1.393594, 0.110749, 1, 1],
    ]);
    expect(fixed(250, POND_WATER, 0, -0.003)).toEqual([
      [0.239365, -0.124586, 4.718311, 0.103538, 2, 1],
      [-0.325712, 0.095371, -0.110969, 0.125446, 1, 0],
      [0.402104, 0.302463, 6.966826, 0.118429, 0, 1],
      [0.574122, -0.561107, 1.393594, 0.110749, 1, 1],
    ]);
  });

  it('courant fort, dans un sens puis dans l’autre : les feuilles s’arrêtent au bord', () => {
    expect(fixed(1000, POND_WATER, 0.05, 0.02)).toEqual([
      [-0.572108, 0.598684, 6.126862, 0.107062, 4, 1],
      [0.899108, 0.135996, 2.374629, 0.125171, 4, 1],
      [0.898407, 0.558305, 3.820595, 0.096441, 3, 1],
      [-0.106526, 0.278659, 5.159424, 0.118349, 4, 1],
    ]);
    expect(fixed(1000, POND_WATER, -0.05, -0.02)).toEqual([
      [-0.893611, 0.460057, 6.126862, 0.107062, 4, 1],
      [-0.898322, -0.558818, 2.374629, 0.125171, 4, 1],
      [0.234045, 0.301201, 3.820595, 0.096441, 3, 1],
      [-0.383641, 0.160945, 5.159424, 0.118349, 4, 1],
    ]);
  });

  it('bassin plus étroit que deux marges, décentré : feuilles sur la ligne médiane', () => {
    const narrowX: Box3 = { minX: 1, maxX: 1.1, minY: 0, maxY: 0.3, minZ: -0.5, maxZ: 0.5 };
    const narrowZ: Box3 = { minX: -0.5, maxX: 0.5, minY: 0, maxY: 0.3, minZ: 2, maxZ: 2.1 };
    expect(fixed(250, narrowX)).toEqual([
      [1.052568, 0.021686, 7.154066, 0.103538, 2, 1],
      [1.048232, -0.200132, 6.682411, 0.125446, 1, 0],
      [1.057605, 0.147318, 2.113686, 0.118429, 0, 1],
      [1.05015, 0.253377, 5.490451, 0.110749, 1, 1],
    ]);
    expect(fixed(250, narrowZ)).toEqual([
      [0.033799, 2.040455, 7.154066, 0.103538, 2, 1],
      [-0.205994, 2.054095, 6.682411, 0.125446, 1, 0],
      [0.161029, 2.043894, 2.113686, 0.118429, 0, 1],
      [0.252627, 2.0509, 5.490451, 0.110749, 1, 1],
    ]);
  });
});
