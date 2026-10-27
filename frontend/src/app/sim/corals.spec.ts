import { SIM_DT } from './constants';
import {
  assertCoralSettings,
  CORAL_EDGE_MARGIN,
  CORAL_FORMS,
  CORAL_GAP,
  CORAL_HUES,
  coralBaseY,
  coralBox,
  coralFootprint,
  coralLayout,
  coralModel,
  coralObstacles,
  MAX_CORALS,
  rectCircleGap,
  rectGap,
  type CoralColony,
  type CoralForm,
  type CoralModel,
  type CoralSettings,
} from './corals';
import { decorObstacles, decorToTank } from './decor';
import { environmentWater, REEF } from './environment';
import type { Vec3 } from './flocking';
import { obstacleDistance, validateObstacle, type BoxObstacle } from './obstacles';
import { NEON } from './species';
import { createFish, stepFish, swimBounds, type Fish } from './swimmer';
import { waterVolume } from './tank';
import {
  advanceInPlace,
  createDefaultWorld,
  createWorld,
  seededFeatures,
  type MutableWorld,
} from './world';

type MutableFish = { -readonly [K in keyof Fish]: Fish[K] };

const SETTINGS = REEF.corals as CoralSettings;
const SEEDS = Array.from({ length: 300 }, (_, n) => (n * 2654435761) >>> 0);

function layout(seed: number): CoralColony[] {
  return coralLayout(seed, REEF.dimensions, SETTINGS, REEF.decor);
}

/** Largeur (X), hauteur (Y) et profondeur (Z) d'un modèle, en voxels. */
function extent(m: CoralModel): { w: number; h: number; d: number } {
  return { w: m.maxI - m.minI, h: m.maxJ, d: m.maxK - m.minK };
}

/** Part des colonnes (i, k) de la boîte englobante occupées par au moins un voxel. */
function topCoverage(m: CoralModel): number {
  const columns = new Set(m.cells.map((c) => `${c.i},${c.k}`));
  const { w, d } = extent(m);
  return columns.size / (w * d);
}

describe('assertCoralSettings', () => {
  it('accepte le réglage du récif et le renvoie', () => {
    expect(assertCoralSettings(SETTINGS)).toBe(SETTINGS);
    expect(SETTINGS.count.max).toBeLessThanOrEqual(MAX_CORALS);
  });

  it.each([
    [
      { min: -1, max: 2 },
      { min: 1, max: 1 },
    ],
    [
      { min: 1.5, max: 2 },
      { min: 1, max: 1 },
    ],
    [
      { min: 3, max: 2 },
      { min: 1, max: 1 },
    ],
    [
      { min: 0, max: MAX_CORALS + 1 },
      { min: 1, max: 1 },
    ],
    [
      { min: 1, max: 2 },
      { min: 0.1, max: 1 },
    ],
    [
      { min: 1, max: 2 },
      { min: 1, max: 5 },
    ],
    [
      { min: 1, max: 2 },
      { min: 1.4, max: 1.2 },
    ],
    [
      { min: 1, max: 2 },
      { min: Number.NaN, max: 1 },
    ],
  ])('refuse un réglage invalide (%j, %j)', (count, scale) => {
    expect(() => assertCoralSettings({ count, scale })).toThrow(RangeError);
  });
});

describe('coralModel', () => {
  it.each(CORAL_FORMS)('%s : même graine ⇒ même modèle ; autre graine ⇒ autre modèle', (form) => {
    expect(coralModel(form, 7, 1)).toEqual(coralModel(form, 7, 1));
    expect(coralModel(form, 8, 1).cells).not.toEqual(coralModel(form, 7, 1).cells);
  });

  it.each(CORAL_FORMS)(
    '%s : voxels triés, uniques, au-dessus de la base, bornes exactes',
    (form) => {
      for (const seed of [0, 1, 2, 4294967295]) {
        const m = coralModel(form, seed, 1.2);
        const keys = m.cells.map((c) => `${c.i},${c.j},${c.k}`);
        expect(new Set(keys).size).toBe(keys.length);
        for (let n = 1; n < m.cells.length; n++) {
          const [a, b] = [m.cells[n - 1], m.cells[n]];
          expect(a.j - b.j || a.i - b.i || a.k - b.k).toBeLessThan(0);
        }
        expect(Math.min(...m.cells.map((c) => c.j))).toBe(0);
        expect(m.minI).toBe(Math.min(...m.cells.map((c) => c.i)));
        expect(m.maxI).toBe(Math.max(...m.cells.map((c) => c.i)) + 1);
        expect(m.maxJ).toBe(Math.max(...m.cells.map((c) => c.j)) + 1);
        expect(m.minK).toBe(Math.min(...m.cells.map((c) => c.k)));
        expect(m.maxK).toBe(Math.max(...m.cells.map((c) => c.k)) + 1);
        expect(m.voxelSize).toBeCloseTo(0.012 * 1.2, 12);
      }
    },
  );

  it('refuse une graine ou une échelle invalides', () => {
    expect(() => coralModel('dome', -1, 1)).toThrow(RangeError);
    expect(() => coralModel('dome', 1.5, 1)).toThrow(RangeError);
    expect(() => coralModel('table', 1, 0.2)).toThrow(RangeError);
    expect(() => coralModel('branchu', 1, 3)).toThrow(RangeError);
    expect(() => coralModel('branchu', 1, Number.NaN)).toThrow(RangeError);
  });

  // Formes distinguables, sur 50 graines : de profil (hauteur et largeur, porte-à-faux) et de
  // dessus (part des colonnes occupées).
  const shapes = (form: CoralForm): CoralModel[] =>
    Array.from({ length: 50 }, (_, seed) => coralModel(form, seed, 1));

  it('dôme : plein, plus large que haut, couvre presque toute son emprise de dessus', () => {
    for (const m of shapes('dome')) {
      const { w, h, d } = extent(m);
      expect(h).toBeLessThan(0.7 * Math.max(w, d));
      expect(h).toBeGreaterThanOrEqual(0.3 * Math.max(w, d));
      expect(topCoverage(m)).toBeGreaterThan(0.65);
      // Plein : toute colonne occupée l'est depuis la base.
      expect(m.cells.filter((c) => c.j === 0).length).toBe(
        new Set(m.cells.map((c) => `${c.i},${c.k}`)).size,
      );
    }
  });

  it('table : plateau en porte-à-faux, au moins trois fois plus large que son pied', () => {
    for (const m of shapes('table')) {
      const foot = m.cells.filter((c) => c.j === 0).length;
      const plate = new Set(m.cells.map((c) => `${c.i},${c.k}`)).size;
      expect(foot).toBe(4);
      expect(plate).toBeGreaterThan(9 * foot);
      expect(extent(m).h).toBeLessThan(0.7 * Math.max(extent(m).w, extent(m).d));
      expect(topCoverage(m)).toBeGreaterThan(0.65);
    }
  });

  it('branchu : au moins aussi haut que large, clairsemé de dessus, bouts de branches marqués', () => {
    for (const m of shapes('branchu')) {
      const { w, h, d } = extent(m);
      // Haut : au moins aussi haut que large (dôme et table : moins de 0,7).
      expect(h).toBeGreaterThanOrEqual(Math.max(w, d));
      expect(topCoverage(m)).toBeLessThan(0.55);
      expect(m.cells.filter((c) => c.tip).length).toBeGreaterThanOrEqual(4);
    }
  });
});

describe('coralLayout', () => {
  it('même graine ⇒ même disposition ; autre graine ⇒ autre disposition', () => {
    expect(layout(42)).toEqual(layout(42));
    expect(layout(43)).not.toEqual(layout(42));
    expect(JSON.parse(JSON.stringify(layout(42)))).toEqual(layout(42));
  });

  it('aucun réglage (bac, bassin, paludarium) ou effectif nul : aucun corail', () => {
    expect(coralLayout(42, REEF.dimensions, null)).toEqual([]);
    expect(
      coralLayout(42, REEF.dimensions, { count: { min: 0, max: 0 }, scale: SETTINGS.scale }),
    ).toEqual([]);
  });

  it('refuse une graine ou un réglage invalides', () => {
    expect(() => coralLayout(-1, REEF.dimensions, SETTINGS)).toThrow(RangeError);
    expect(() => coralLayout(-1, REEF.dimensions, null)).toThrow(RangeError);
    const bad = { count: { min: 2, max: 1 }, scale: SETTINGS.scale };
    expect(() => coralLayout(1, REEF.dimensions, bad)).toThrow(RangeError);
  });

  it('bac trop petit : colonies omises, sans boucle infinie', () => {
    const tiny = { width: 0.1, height: 0.3, depth: 0.1 };
    expect(coralLayout(42, tiny, SETTINGS)).toEqual([]);
  });

  // Délai explicite (#244, docs/PIEGES.md) : ≈ 0,6 s en local, bien plus en CI lente.
  it('300 graines : de 4 colonies à count.max, les trois formes et les quatre teintes', () => {
    for (const seed of SEEDS) {
      const colonies = layout(seed);
      expect(colonies.length).toBeGreaterThanOrEqual(4);
      expect(colonies.length).toBeLessThanOrEqual(SETTINGS.count.max);
      expect(new Set(colonies.map((c) => c.form)).size).toBe(CORAL_FORMS.length);
      expect(new Set(colonies.map((c) => c.hue)).size).toBe(CORAL_HUES.length);
      colonies.forEach((c, n) => expect(c.id).toBe(n));
    }
  }, 15_000);

  // Délai explicite (#244, docs/PIEGES.md) : ≈ 1,2 s en local, bien plus en CI lente.
  it('300 graines : dans le bac, sous la surface, sans chevauchement ni contact avec un rocher', () => {
    const halfW = REEF.dimensions.width / 2 - CORAL_EDGE_MARGIN;
    const halfD = REEF.dimensions.depth / 2 - CORAL_EDGE_MARGIN;
    const surface = environmentWater('recif').maxY;
    const rocks = decorObstacles(REEF.decor).flatMap((o) => o.spheres);
    for (const seed of SEEDS) {
      const colonies = layout(seed);
      const prints = colonies.map((c) =>
        coralFootprint(coralModel(c.form, c.seed, c.scale), c.x, c.z, c.quarterTurns),
      );
      prints.forEach((f, n) => {
        expect(f.minX).toBeGreaterThanOrEqual(-halfW);
        expect(f.maxX).toBeLessThanOrEqual(halfW);
        expect(f.minZ).toBeGreaterThanOrEqual(-halfD);
        expect(f.maxZ).toBeLessThanOrEqual(halfD);
        for (let m = 0; m < n; m++) {
          expect(rectGap(f, prints[m])).toBeGreaterThanOrEqual(CORAL_GAP);
        }
        for (const s of rocks) {
          expect(rectCircleGap(f, s.x, s.z, s.radius)).toBeGreaterThanOrEqual(CORAL_GAP);
        }
        const box = coralBox(colonies[n], 0);
        expect(box.y + box.halfY).toBeLessThan(surface - 0.1);
      });
    }
  }, 30_000);

  it('écarts : rectangles disjoints, en contact ou imbriqués ; disque dehors ou dedans', () => {
    const a = { minX: 0, maxX: 1, minZ: 0, maxZ: 1 };
    expect(rectGap(a, { minX: 4, maxX: 5, minZ: 5, maxZ: 6 })).toBeCloseTo(5, 12);
    expect(rectGap(a, { minX: 1, maxX: 2, minZ: 0, maxZ: 1 })).toBe(0);
    expect(rectGap(a, { minX: 0.2, maxX: 0.4, minZ: 0.2, maxZ: 0.4 })).toBe(0);
    expect(rectCircleGap(a, 4, 0.5, 1)).toBeCloseTo(2, 12);
    expect(rectCircleGap(a, 0.5, 0.5, 0.1)).toBeCloseTo(-0.1, 12);
  });
});

describe('coralBox : obstacle d’une colonie', () => {
  const n: Vec3 = { x: 0, y: 0, z: 0 };

  it.each([0, 1, 2, 3] as const)(
    'quart de tour %s : boîte valide, contenant tous les voxels, touchant chaque face',
    (quarterTurns) => {
      for (const form of CORAL_FORMS) {
        const colony: CoralColony = {
          id: 0,
          form,
          hue: 'rose',
          x: 0.2,
          z: -0.05,
          quarterTurns,
          scale: 1.3,
          seed: 9,
        };
        const box = coralBox(colony, 4);
        expect(validateObstacle(box)).toEqual([]);
        expect(box.id).toBe(4);
        const m = coralModel(form, 9, 1.3);
        const v = m.voxelSize;
        const item = {
          kind: 'rock' as const,
          x: 0.2,
          z: -0.05,
          rotation: (quarterTurns * Math.PI) / 2,
          scale: 1,
          seed: 0,
        };
        const p = { x: 0, y: 0, z: 0 };
        let maxDistance = -Infinity;
        const touched = new Set<string>();
        for (const c of m.cells) {
          for (const [di, dj, dk] of [
            [0, 0, 0],
            [1, 1, 1],
            [1, 0, 0],
            [0, 1, 1],
          ]) {
            decorToTank(item, coralBaseY(v), (c.i + di) * v, (c.j + dj) * v, (c.k + dk) * v, p);
            maxDistance = Math.max(maxDistance, obstacleDistance(box, p.x, p.y, p.z, n));
            const eps = 1e-9;
            if (Math.abs(p.x - (box.x - box.halfX)) < eps) touched.add('-x');
            if (Math.abs(p.x - (box.x + box.halfX)) < eps) touched.add('+x');
            if (Math.abs(p.z - (box.z - box.halfZ)) < eps) touched.add('-z');
            if (Math.abs(p.z - (box.z + box.halfZ)) < eps) touched.add('+z');
            if (Math.abs(p.y - (box.y + box.halfY)) < eps) touched.add('+y');
          }
        }
        expect(maxDistance).toBeLessThanOrEqual(1e-9);
        expect(touched.size).toBe(5);
        expect(box.y - box.halfY).toBeCloseTo(coralBaseY(v), 12);
      }
    },
  );

  it('identifiants consécutifs à partir de firstId, dans l’ordre des colonies', () => {
    const colonies = layout(42);
    const boxes = coralObstacles(colonies, 10);
    expect(boxes.map((b) => b.id)).toEqual(colonies.map((_, k) => 10 + k));
    expect(coralObstacles([])).toEqual([]);
  });
});

describe('coraux dans le monde', () => {
  const n: Vec3 = { x: 0, y: 0, z: 0 };

  it('récif : boîtes des coraux après le décor ; autres environnements sans corail', () => {
    const world = createDefaultWorld(42, 'recif');
    // Les coraux du monde évitent les anémones (#150, ADR 0041), dont les boîtes les suivent.
    const colonies = seededFeatures(42, 'recif', world.decor).corals;
    expect(colonies.length).toBeGreaterThanOrEqual(4);
    expect(world.obstacles.length).toBeGreaterThan(REEF.decor.length + colonies.length);
    expect(world.obstacles.slice(REEF.decor.length, REEF.decor.length + colonies.length)).toEqual(
      coralObstacles(colonies, REEF.decor.length),
    );
    for (const env of ['tropical', 'bassin', 'paludarium'] as const) {
      const other = createDefaultWorld(42, env);
      expect(other.obstacles.length).toBe(other.decor.length);
    }
  });

  it('un néon lancé droit sur une colonie la contourne sans entrer dans sa boîte', () => {
    // Grand bac : seule la colonie compte. Boîte de 12 × 12 × 12 cm, centre à 0,9 m.
    const open = swimBounds(NEON, waterVolume({ width: 3, height: 2, depth: 3 }));
    const box: BoxObstacle = {
      id: 0,
      shape: 'box',
      x: 0,
      y: 0.9,
      z: 0,
      halfX: 0.06,
      halfY: 0.06,
      halfZ: 0.06,
    };
    for (const [id, offset] of [
      [0, 0],
      [1, 0.02],
      [2, -0.03],
      [3, 0.05],
    ]) {
      const f = createFish(42, id, 'neon', open) as MutableFish;
      Object.assign(f, {
        x: -0.3,
        y: 0.9,
        z: offset,
        yaw: 0,
        pitch: 0,
        turn: 0,
        pitchTarget: 0,
        speed: 0.06,
      });
      let minClearance = Infinity;
      let passed = false;
      for (let i = 0; i < 1800 && !passed; i++) {
        f.turn = 0;
        stepFish(f, SIM_DT, open, 0, 0, 0, [box]);
        minClearance = Math.min(minClearance, obstacleDistance(box, f.x, f.y, f.z, n));
        passed = f.x > box.x;
      }
      expect(passed).toBe(true);
      expect(minClearance).toBeGreaterThan(0);
    }
    // Témoin : la ligne droite traverse la boîte.
    expect(obstacleDistance(box, 0, 0.9, 0, n)).toBeLessThan(0);
  });

  it('20 néons dans le récif, 30 s simulées : aucun centre dans une boîte de corail', () => {
    const world = createWorld(
      42,
      [{ species: 'neon', count: 20 }],
      [],
      REEF.decor,
      'recif',
    ) as MutableWorld;
    const boxes = world.obstacles.slice(REEF.decor.length);
    expect(boxes.length).toBeGreaterThanOrEqual(4);
    let minClearance = Infinity;
    for (let s = 0; s < Math.round(30 / SIM_DT); s++) {
      advanceInPlace(world, 1);
      for (const fish of world.entities) {
        for (const b of boxes) {
          minClearance = Math.min(minClearance, obstacleDistance(b, fish.x, fish.y, fish.z, n));
        }
      }
    }
    expect(minClearance).toBeGreaterThanOrEqual(0);
  }, 15_000);
});
