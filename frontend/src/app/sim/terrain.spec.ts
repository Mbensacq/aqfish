import { environmentWater, PALUDARIUM } from './environment';
import type { Box3 } from './tank';
import {
  assertTerrainSettings,
  ROCK_MIN_HEIGHT,
  shoreLineX,
  terrainAt,
  terrainMaxRise,
  type TerrainSettings,
} from './terrain';

const SETTINGS = PALUDARIUM.terrain as TerrainSettings;
const WATER: Box3 = environmentWater('paludarium');
const LEVEL = WATER.maxY;

/** Points d'une grille régulière couvrant le fond du bac, bords compris. */
function gridPoints(n: number, water: Box3 = WATER): [number, number][] {
  const points: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= n; j++) {
      points.push([
        water.minX + (i / n) * (water.maxX - water.minX),
        water.minZ + (j / n) * (water.maxZ - water.minZ),
      ]);
    }
  }
  return points;
}

describe('terrainAt (sol du paludarium, #129)', () => {
  it('est déterministe : même graine, même sol ; autre graine, autre rivage', () => {
    const copy: TerrainSettings = { ...SETTINGS, rock: { ...SETTINGS.rock } };
    const other: TerrainSettings = { ...SETTINGS, seed: SETTINGS.seed + 1 };
    let differs = false;
    for (const [x, z] of gridPoints(20)) {
      expect(terrainAt(x, z, copy, WATER)).toEqual(terrainAt(x, z, SETTINGS, WATER));
      differs ||= terrainAt(x, z, other, WATER).height !== terrainAt(x, z, SETTINGS, WATER).height;
    }
    expect(differs).toBe(true);
    expect(shoreLineX(0.1, other)).not.toBe(shoreLineX(0.1, SETTINGS));
  });

  it('est borné au bac : un point hors du bac vaut le point du bord le plus proche', () => {
    const corners: [number, number][] = [
      [WATER.minX, WATER.minZ],
      [WATER.minX, WATER.maxZ],
      [WATER.maxX, WATER.minZ],
      [WATER.maxX, WATER.maxZ],
    ];
    for (const [x, z] of corners) {
      const sx = Math.sign(x);
      const sz = Math.sign(z);
      expect(terrainAt(x + sx * 3, z + sz * 3, SETTINGS, WATER)).toEqual(
        terrainAt(x, z, SETTINGS, WATER),
      );
      expect(terrainAt(x + sx * Infinity, z, SETTINGS, WATER)).toEqual(
        terrainAt(x, z, SETTINGS, WATER),
      );
    }
    // Coins côté terre (−X) émergés, côté eau (+X) au fond.
    expect(terrainAt(WATER.minX, WATER.minZ, SETTINGS, WATER).submerged).toBe(false);
    expect(terrainAt(WATER.minX, WATER.maxZ, SETTINGS, WATER).submerged).toBe(false);
    expect(terrainAt(WATER.maxX, WATER.minZ, SETTINGS, WATER).height).toBe(SETTINGS.bedHeight);
    expect(terrainAt(WATER.maxX, WATER.maxZ, SETTINGS, WATER).height).toBe(SETTINGS.bedHeight);
    // Valeur non numérique : centre du bac, sans NaN.
    const center = terrainAt(Number.NaN, Number.NaN, SETTINGS, WATER);
    expect(center).toEqual(terrainAt(0, 0, SETTINGS, WATER));
    expect(Number.isFinite(center.height)).toBe(true);
  });

  it('hauteur entre le fond et le haut de la berge, partout', () => {
    for (const [x, z] of gridPoints(60)) {
      const { height } = terrainAt(x, z, SETTINGS, WATER);
      expect(height).toBeGreaterThanOrEqual(SETTINGS.bedHeight);
      expect(height).toBeLessThanOrEqual(LEVEL + terrainMaxRise(SETTINGS));
    }
  });

  it('immergé si et seulement si sous la surface ; le fond est immergé, terre et roche émergées', () => {
    let kinds = new Set<string>();
    for (const [x, z] of gridPoints(60)) {
      const sample = terrainAt(x, z, SETTINGS, WATER);
      expect(sample.submerged).toBe(sample.height < LEVEL);
      expect(sample.submerged).toBe(sample.kind === 'fond');
      kinds = kinds.add(sample.kind);
    }
    // Le paludarium a du fond, de la terre et au moins une bosse de roche.
    expect([...kinds].sort()).toEqual(['fond', 'roche', 'terre']);
  });

  it('rivage net : au niveau de l’eau sur la ligne, dessous juste côté eau, dessus côté terre', () => {
    for (const z of [WATER.minZ, -0.17, -0.05, 0, 0.08, 0.21, WATER.maxZ]) {
      const shore = shoreLineX(z, SETTINGS);
      expect(shore).toBeGreaterThan(WATER.minX);
      expect(shore).toBeLessThan(WATER.maxX);
      expect(Math.abs(shore - SETTINGS.shoreX)).toBeLessThanOrEqual(SETTINGS.shoreWave + 1e-12);
      const on = terrainAt(shore, z, SETTINGS, WATER);
      expect(on.height).toBe(LEVEL);
      expect(on.submerged).toBe(false);
      const wet = terrainAt(shore + 1e-9, z, SETTINGS, WATER);
      expect(wet.submerged).toBe(true);
      expect(wet.height).toBeLessThan(LEVEL);
      expect(wet.height).toBeGreaterThan(LEVEL - 0.001);
      const dry = terrainAt(shore - 1e-6, z, SETTINGS, WATER);
      expect(dry.submerged).toBe(false);
      expect(dry.height).toBeGreaterThan(LEVEL);
      expect(dry.height).toBeLessThan(LEVEL + 0.001);
    }
  });

  it('pente douce : le fond descend sans remonter du rivage au fond plat, la berge monte', () => {
    const z = 0.03;
    const shore = shoreLineX(z, SETTINGS);
    let previous = LEVEL;
    for (let k = 1; k <= 60; k++) {
      const x = shore + (k / 60) * SETTINGS.underwaterSlope;
      const { height } = terrainAt(x, z, SETTINGS, WATER);
      expect(height).toBeLessThanOrEqual(previous);
      previous = height;
    }
    expect(previous).toBeCloseTo(SETTINGS.bedHeight, 12);
    // Côté terre, sans roche ni relief : montée régulière jusqu'au plateau.
    const smooth: TerrainSettings = { ...SETTINGS, relief: 0, rock: { threshold: 0.5, height: 0 } };
    let last = LEVEL;
    for (let k = 1; k <= 60; k++) {
      const x = shore - (k / 60) * SETTINGS.landSlope;
      const { height, kind } = terrainAt(x, z, smooth, WATER);
      expect(height).toBeGreaterThan(last);
      expect(kind).toBe('terre');
      last = height;
    }
    expect(last).toBeCloseTo(LEVEL + SETTINGS.landRise, 12);
    // Pente maximale (au rivage, côté eau) : (niveau − fond) × 2 / largeur ; bornée.
    const steepest = ((LEVEL - SETTINGS.bedHeight) * 2) / SETTINGS.underwaterSlope;
    expect(steepest).toBeLessThan(2);
  });

  it('roche : seulement là où la bosse dépasse ROCK_MIN_HEIGHT, sur la terre', () => {
    const noRock: TerrainSettings = { ...SETTINGS, rock: { threshold: 0.55, height: 0 } };
    for (const [x, z] of gridPoints(40)) {
      const withRock = terrainAt(x, z, SETTINGS, WATER);
      const without = terrainAt(x, z, noRock, WATER);
      expect(without.kind).not.toBe('roche');
      const bump = withRock.height - without.height;
      expect(bump).toBeGreaterThanOrEqual(0);
      if (withRock.kind === 'roche') {
        expect(bump).toBeGreaterThanOrEqual(ROCK_MIN_HEIGHT - 1e-12);
      }
    }
  });

  it('un fond réglé plus haut que l’eau reste immergé, sous la surface', () => {
    const high: TerrainSettings = { ...SETTINGS, bedHeight: 1 };
    const sample = terrainAt(WATER.maxX, 0, high, WATER);
    expect(sample.submerged).toBe(true);
    expect(sample.height).toBeLessThan(LEVEL);
  });
});

describe('assertTerrainSettings', () => {
  it('accepte les réglages du paludarium', () => {
    expect(assertTerrainSettings(SETTINGS)).toBe(SETTINGS);
  });

  it.each([
    ['graine négative', { seed: -1 }],
    ['graine non entière', { seed: 1.5 }],
    ['rivage infini', { shoreX: Infinity }],
    ['fond NaN', { bedHeight: Number.NaN }],
    ['pente immergée nulle', { underwaterSlope: 0 }],
    ['berge négative', { landSlope: -0.1 }],
    ['plateau nul', { landRise: 0 }],
    ['ondulation négative', { shoreWave: -0.01 }],
    ['relief infini', { relief: Infinity }],
    ['seuil de roche à 1', { rock: { threshold: 1, height: 0.02 } }],
    ['seuil de roche négatif', { rock: { threshold: -0.1, height: 0.02 } }],
    ['roche négative', { rock: { threshold: 0.5, height: -0.02 } }],
  ])('refuse : %s', (_name, patch) => {
    expect(() => assertTerrainSettings({ ...SETTINGS, ...patch } as TerrainSettings)).toThrow(
      RangeError,
    );
  });
});
