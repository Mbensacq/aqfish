import { MAX_SEED } from '../core/random/prng';
import {
  assertBankDecorSettings,
  BANK_DECOR_GAP,
  bankDecorLayout,
  footprintGap,
  MAX_MOSS_PATCHES,
  MAX_ROOTS,
  ROOT_EDGE_MARGIN,
  ROOT_SEGMENTS,
  ROOT_SINK_RATIO,
  ROOT_TIP_DEPTH,
  rootFootprints,
  type BankDecor,
  type BankDecorSettings,
  type Root,
} from './bank-decor';
import { environmentWater, PALUDARIUM } from './environment';
import type { Box3 } from './tank';
import { terrainAt, terrainHeightAt, type TerrainSettings } from './terrain';

const TERRAIN = PALUDARIUM.terrain as TerrainSettings;
const SETTINGS = PALUDARIUM.bankDecor as BankDecorSettings;
const WATER = environmentWater('paludarium');

/** Points denses d'une racine vue de dessus, avec le rayon local (vérification indépendante). */
function rootSamples(root: Root): { x: number; z: number; r: number }[] {
  const out: { x: number; z: number; r: number }[] = [];
  for (let s = 1; s < root.points.length; s++) {
    const a = root.points[s - 1];
    const b = root.points[s];
    for (let n = 0; n <= 20; n++) {
      const t = n / 20;
      out.push({
        x: a.x + (b.x - a.x) * t,
        z: a.z + (b.z - a.z) * t,
        r: a.radius + (b.radius - a.radius) * t,
      });
    }
  }
  return out;
}

/** Vérifie toutes les bornes promises par `bankDecorLayout`. */
function expectValid(
  decor: BankDecor,
  settings: BankDecorSettings,
  terrain: TerrainSettings,
  water: Box3,
): void {
  expect(decor.roots.length).toBeLessThanOrEqual(settings.roots.count.max);
  expect(decor.mosses.length).toBeLessThanOrEqual(settings.moss.count.max);
  for (const moss of decor.mosses) {
    expect(moss.radius).toBeGreaterThanOrEqual(settings.moss.radius.min);
    expect(moss.radius).toBeLessThanOrEqual(settings.moss.radius.max);
    expect(moss.x - moss.radius).toBeGreaterThanOrEqual(water.minX);
    expect(moss.x + moss.radius).toBeLessThanOrEqual(water.maxX);
    expect(moss.z - moss.radius).toBeGreaterThanOrEqual(water.minZ);
    expect(moss.z + moss.radius).toBeLessThanOrEqual(water.maxZ);
    // Tout le disque sur le sol émergé : centre, bord et rayons intermédiaires.
    for (const f of [0, 0.5, 1]) {
      for (let n = 0; n < 48; n++) {
        const a = (n / 48) * 2 * Math.PI;
        const x = moss.x + f * moss.radius * Math.cos(a);
        const z = moss.z + f * moss.radius * Math.sin(a);
        expect(terrainAt(x, z, terrain, water).submerged).toBe(false);
      }
    }
  }
  for (const root of decor.roots) {
    expect(root.points.length).toBe(ROOT_SEGMENTS + 1);
    const base = root.points[0];
    const tip = root.points[ROOT_SEGMENTS];
    expect(base.radius).toBeGreaterThanOrEqual(settings.roots.radius.min);
    expect(base.radius).toBeLessThanOrEqual(settings.roots.radius.max);
    expect(tip.radius).toBeLessThan(base.radius);
    // Part de la terre, finit sous l'eau.
    expect(terrainAt(base.x, base.z, terrain, water).submerged).toBe(false);
    expect(base.y).toBeGreaterThan(water.maxY);
    expect(terrainAt(tip.x, tip.z, terrain, water).submerged).toBe(true);
    expect(tip.y + tip.radius).toBeLessThanOrEqual(water.maxY - ROOT_TIP_DEPTH + 1e-12);
    for (const p of root.points) {
      expect(p.x - p.radius).toBeGreaterThanOrEqual(water.minX + ROOT_EDGE_MARGIN - 1e-12);
      expect(p.x + p.radius).toBeLessThanOrEqual(water.maxX - ROOT_EDGE_MARGIN + 1e-12);
      expect(p.z - p.radius).toBeGreaterThanOrEqual(water.minZ + ROOT_EDGE_MARGIN - 1e-12);
      expect(p.z + p.radius).toBeLessThanOrEqual(water.maxZ - ROOT_EDGE_MARGIN + 1e-12);
      // Posée sur le sol : enfoncée d'au plus `ROOT_SINK_RATIO` de son rayon.
      const ground = terrainHeightAt(p.x, p.z, terrain, water);
      expect(p.y - ground).toBeGreaterThanOrEqual(p.radius * (1 - ROOT_SINK_RATIO) - 1e-12);
    }
  }
  // Aucun chevauchement, vu de dessus, entre deux éléments quelconques.
  const shapes = [
    ...decor.mosses.map((m) => [{ x: m.x, z: m.z, r: m.radius }]),
    ...decor.roots.map(rootSamples),
  ];
  for (let a = 0; a < shapes.length; a++) {
    for (let b = a + 1; b < shapes.length; b++) {
      let gap = Infinity;
      for (const p of shapes[a]) {
        for (const q of shapes[b]) {
          gap = Math.min(gap, Math.hypot(p.x - q.x, p.z - q.z) - p.r - q.r);
        }
      }
      expect(gap, `éléments ${a} et ${b}`).toBeGreaterThanOrEqual(0);
    }
  }
}

describe('bankDecorLayout (mousses et racines du paludarium, #132)', () => {
  it('paludarium : racines et tapis de mousse en nombre borné, posés selon les règles', () => {
    const decor = bankDecorLayout(SETTINGS, TERRAIN, WATER);
    // Un élément sans place est omis : le nombre visé n'est pas garanti, mais la berge du
    // paludarium porte au moins trois racines et huit tapis.
    expect(decor.roots.length).toBeGreaterThanOrEqual(3);
    expect(decor.mosses.length).toBeGreaterThanOrEqual(8);
    expect(decor.roots.length).toBeLessThanOrEqual(MAX_ROOTS);
    expect(decor.mosses.length).toBeLessThanOrEqual(MAX_MOSS_PATCHES);
    expectValid(decor, SETTINGS, TERRAIN, WATER);
  });

  it('est déterministe : mêmes réglages, même disposition', () => {
    expect(bankDecorLayout(SETTINGS, TERRAIN, WATER)).toEqual(
      bankDecorLayout(SETTINGS, TERRAIN, WATER),
    );
  });

  it('dépend de sa graine, et reste valide pour toute graine', () => {
    const seeds = [0, 1, 7, 42, 132, 999, 123456, MAX_SEED];
    const layouts = seeds.map((seed) => bankDecorLayout({ ...SETTINGS, seed }, TERRAIN, WATER));
    layouts.forEach((decor, n) =>
      expectValid(decor, { ...SETTINGS, seed: seeds[n] }, TERRAIN, WATER),
    );
    const keys = new Set(layouts.map((decor) => JSON.stringify(decor)));
    expect(keys.size).toBe(seeds.length);
  });

  it('suit le sens de l’eau : rivage inversé (waterSide = −1), racines vers −X', () => {
    const terrain: TerrainSettings = { ...TERRAIN, shoreX: 0.02, waterSide: -1 };
    const decor = bankDecorLayout(SETTINGS, terrain, WATER);
    expect(decor.roots.length).toBeGreaterThan(0);
    for (const root of decor.roots) {
      expect(root.points[ROOT_SEGMENTS].x).toBeLessThan(root.points[0].x);
    }
    expectValid(decor, SETTINGS, terrain, WATER);
  });

  it('réglage nul ou effectifs nuls : aucun élément', () => {
    expect(bankDecorLayout(null, TERRAIN, WATER)).toEqual({ roots: [], mosses: [] });
    const none: BankDecorSettings = {
      ...SETTINGS,
      moss: { ...SETTINGS.moss, count: { min: 0, max: 0 } },
      roots: { ...SETTINGS.roots, count: { min: 0, max: 0 } },
    };
    expect(bankDecorLayout(none, TERRAIN, WATER)).toEqual({ roots: [], mosses: [] });
  });

  it('omet les éléments sans place, sans boucler : tapis plus grands que la berge', () => {
    const huge: BankDecorSettings = {
      ...SETTINGS,
      moss: { count: { min: 5, max: 5 }, radius: { min: 0.4, max: 0.45 } },
      roots: { ...SETTINGS.roots, count: { min: 0, max: 0 } },
    };
    expect(bankDecorLayout(huge, TERRAIN, WATER).mosses).toEqual([]);
  });

  it('au plus effectif maximal, même quand tout tient', () => {
    const many: BankDecorSettings = {
      ...SETTINGS,
      moss: {
        count: { min: MAX_MOSS_PATCHES, max: MAX_MOSS_PATCHES },
        radius: { min: 0.01, max: 0.01 },
      },
      roots: { ...SETTINGS.roots, count: { min: MAX_ROOTS, max: MAX_ROOTS } },
    };
    const decor = bankDecorLayout(many, TERRAIN, WATER);
    expect(decor.mosses.length).toBe(MAX_MOSS_PATCHES);
    expect(decor.roots.length).toBeLessThanOrEqual(MAX_ROOTS);
    expectValid(decor, many, TERRAIN, WATER);
  });

  it('jeu entre empreintes : au moins BANK_DECOR_GAP entre deux éléments retenus', () => {
    const decor = bankDecorLayout(SETTINGS, TERRAIN, WATER);
    const prints = [
      ...decor.mosses.map((m) => [{ ax: m.x, az: m.z, bx: m.x, bz: m.z, radius: m.radius }]),
      ...decor.roots.map(rootFootprints),
    ];
    for (let a = 0; a < prints.length; a++) {
      for (let b = a + 1; b < prints.length; b++) {
        for (const p of prints[a]) {
          for (const q of prints[b]) {
            expect(footprintGap(p, q)).toBeGreaterThanOrEqual(BANK_DECOR_GAP - 1e-12);
          }
        }
      }
    }
  });
});

describe('footprintGap', () => {
  const seg = (ax: number, az: number, bx: number, bz: number, radius = 0) => ({
    ax,
    az,
    bx,
    bz,
    radius,
  });

  it('segments qui se croisent : distance nulle, jeu négatif des rayons', () => {
    expect(footprintGap(seg(-1, 0, 1, 0, 0.1), seg(0, -1, 0, 1, 0.2))).toBeCloseTo(-0.3, 12);
  });

  it('segments parallèles : écart moins les rayons', () => {
    expect(footprintGap(seg(0, 0, 1, 0, 0.1), seg(0, 1, 1, 1, 0.1))).toBeCloseTo(0.8, 12);
  });

  it('disque et segment : distance au point le plus proche, bout compris', () => {
    expect(footprintGap(seg(2, 0, 2, 0, 0.5), seg(0, 0, 1, 0))).toBeCloseTo(0.5, 12);
    expect(footprintGap(seg(0.5, 1, 0.5, 1), seg(0, 0, 1, 0))).toBeCloseTo(1, 12);
  });

  it('deux disques confondus', () => {
    expect(footprintGap(seg(0, 0, 0, 0, 1), seg(0, 0, 0, 0, 1))).toBe(-2);
  });
});

describe('assertBankDecorSettings', () => {
  const withMoss = (moss: Partial<BankDecorSettings['moss']>): BankDecorSettings => ({
    ...SETTINGS,
    moss: { ...SETTINGS.moss, ...moss },
  });
  const withRoots = (roots: Partial<BankDecorSettings['roots']>): BankDecorSettings => ({
    ...SETTINGS,
    roots: { ...SETTINGS.roots, ...roots },
  });

  it('accepte le réglage du paludarium et le renvoie', () => {
    expect(assertBankDecorSettings(SETTINGS)).toBe(SETTINGS);
  });

  it('refuse une graine invalide', () => {
    for (const seed of [-1, 1.5, MAX_SEED + 1, Number.NaN]) {
      expect(() => assertBankDecorSettings({ ...SETTINGS, seed })).toThrowError(RangeError);
    }
  });

  it('refuse des effectifs non entiers, négatifs, inversés ou au-delà du maximum', () => {
    const bad = [
      { min: -1, max: 2 },
      { min: 1.5, max: 2 },
      { min: 3, max: 2 },
      { min: 0, max: Number.NaN },
    ];
    for (const count of bad) {
      expect(() => assertBankDecorSettings(withMoss({ count }))).toThrowError(RangeError);
      expect(() => assertBankDecorSettings(withRoots({ count }))).toThrowError(RangeError);
    }
    expect(() =>
      assertBankDecorSettings(withMoss({ count: { min: 0, max: MAX_MOSS_PATCHES + 1 } })),
    ).toThrowError(/14/);
    expect(() =>
      assertBankDecorSettings(withRoots({ count: { min: 0, max: MAX_ROOTS + 1 } })),
    ).toThrowError(/5/);
    expect(() =>
      assertBankDecorSettings(withRoots({ count: { min: MAX_ROOTS, max: MAX_ROOTS } })),
    ).not.toThrow();
  });

  it('refuse des longueurs et rayons nuls, négatifs, inversés ou non finis', () => {
    const bad = [
      { min: 0, max: 0.1 },
      { min: -0.1, max: 0.1 },
      { min: 0.2, max: 0.1 },
      { min: 0.1, max: Number.POSITIVE_INFINITY },
    ];
    for (const range of bad) {
      expect(() => assertBankDecorSettings(withMoss({ radius: range }))).toThrowError(RangeError);
      expect(() => assertBankDecorSettings(withRoots({ length: range }))).toThrowError(RangeError);
      expect(() => assertBankDecorSettings(withRoots({ radius: range }))).toThrowError(RangeError);
    }
  });

  it('bankDecorLayout vérifie le réglage', () => {
    expect(() =>
      bankDecorLayout(withRoots({ count: { min: 0, max: 99 } }), TERRAIN, WATER),
    ).toThrowError(RangeError);
  });
});
