import { SIM_DT } from './constants';
import { environmentWater, REEF } from './environment';
import { obstacleDistance } from './obstacles';
import { populationCounts, populationLimit, setPopulation } from './population';
import { CHIRURGIEN, CLOWN, CORYDORA, NEON, SPECIES, validateSpecies } from './species';
import { createFish, stepFish, swimBounds, type Fish } from './swimmer';
import {
  advanceInPlace,
  cloneWorld,
  createDefaultWorld,
  createWorld,
  type MutableWorld,
  type World,
} from './world';

/**
 * Issue #151 : chirurgiens bleus du récif, en banc lâche à mi-hauteur. Mesures en temps
 * simulé uniquement (graines fixes, aucune horloge murale).
 */
const water = environmentWater('recif');
const waterHeight = water.maxY - water.minY;
const SCRATCH = { x: 0, y: 0, z: 0 };

function surgeons(world: World): readonly Fish[] {
  return world.entities.filter((e) => e.species === 'chirurgien');
}

/** Hauteur de chaque chirurgien en fraction de la colonne d'eau, à chaque pas, sur `steps` pas. */
function heightRatios(world: MutableWorld, steps: number): number[] {
  const ratios: number[] = [];
  for (let i = 0; i < steps; i++) {
    advanceInPlace(world, 1);
    for (const f of surgeons(world)) {
      ratios.push((f.y - water.minY) / waterHeight);
    }
  }
  return ratios;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

describe('chirurgien bleu (#151)', () => {
  it('espèce déclarée, valide, propre au récif, avec sa population par défaut', () => {
    expect(SPECIES.chirurgien).toBe(CHIRURGIEN);
    expect(validateSpecies(CHIRURGIEN)).toEqual([]);
    expect(CHIRURGIEN.defaultPopulation).toBeGreaterThanOrEqual(3);
    expect(CHIRURGIEN.defaultPopulation).toBeLessThanOrEqual(5);
    expect(CHIRURGIEN.schooling).not.toBeNull();
    expect(CHIRURGIEN.anemone).toBeUndefined();
    expect(REEF.species).toContain('chirurgien');
    expect(populationCounts(createDefaultWorld(42, 'recif')).chirurgien).toBe(
      CHIRURGIEN.defaultPopulation,
    );
    expect(populationCounts(createDefaultWorld(42)).chirurgien).toBe(0);
  });

  it('plus grand et plus rapide que le poisson-clown', () => {
    expect(CHIRURGIEN.bodyLength).toBeGreaterThan(CLOWN.bodyLength);
    expect(CHIRURGIEN.cruiseSpeed).toBeGreaterThan(CLOWN.cruiseSpeed);
    expect(CHIRURGIEN.maxSpeed).toBeGreaterThan(CLOWN.maxSpeed);
  });

  it('population réglable de 0 à son maximum, sans toucher aux clowns', () => {
    const base = createDefaultWorld(42, 'recif');
    const none = setPopulation(base, 'chirurgien', 0);
    expect(populationCounts(none).chirurgien).toBe(0);
    expect(populationCounts(none).clown).toBe(CLOWN.defaultPopulation);
    expect(populationLimit(base, 'chirurgien')).toBe(CHIRURGIEN.maxPopulation);
    const full = setPopulation(base, 'chirurgien', CHIRURGIEN.maxPopulation + 5);
    expect(populationCounts(full).chirurgien).toBe(CHIRURGIEN.maxPopulation);
    // Les clowns (créés avant) gardent leur état à l'octet.
    expect(full.entities.filter((e) => e.species === 'clown')).toEqual(
      base.entities.filter((e) => e.species === 'clown'),
    );
  });

  it('bornes de mi-hauteur : naissance entre 40 % et 60 % de la colonne d’eau', () => {
    const bounds = swimBounds(CHIRURGIEN, water);
    expect(bounds.preferredMinY).toBeCloseTo(water.minY + 0.4 * waterHeight, 10);
    expect(bounds.preferredMaxY).toBeCloseTo(water.minY + 0.6 * waterHeight, 10);
    expect(bounds.spawn.minY).toBe(bounds.preferredMinY);
    expect(bounds.spawn.maxY).toBe(bounds.preferredMaxY);
    // Les autres espèces : aucune borne basse (identiques à avant #151).
    for (const def of [NEON, CORYDORA, CLOWN]) {
      expect(swimBounds(def, water).preferredMinY).toBe(Number.NEGATIVE_INFINITY);
    }
    for (const seed of [0, 7, 42]) {
      for (const f of surgeons(createDefaultWorld(seed, 'recif'))) {
        expect(f.y).toBeGreaterThanOrEqual(bounds.preferredMinY);
        expect(f.y).toBeLessThanOrEqual(bounds.preferredMaxY);
      }
    }
  });

  it.each([0, 42, 123, 4294967295])(
    'graine %i : médiane de la hauteur entre 35 % et 65 % de la colonne d’eau sur 60 s',
    (seed) => {
      const world = cloneWorld(createDefaultWorld(seed, 'recif'));
      const ratios = heightRatios(world, Math.round(60 / SIM_DT));
      const m = median(ratios);
      expect(m).toBeGreaterThanOrEqual(0.35);
      expect(m).toBeLessThanOrEqual(0.65);
      // Ni collés au sable ni à la surface : 90 % du temps entre 20 % et 80 %.
      const inside = ratios.filter((r) => r >= 0.2 && r <= 0.8).length / ratios.length;
      expect(inside).toBeGreaterThanOrEqual(0.9);
    },
    20_000,
  );

  it('sous la hauteur minimale, le chirurgien remonte ; un néon au même endroit, non', () => {
    const bounds = swimBounds(CHIRURGIEN, water);
    const low = water.minY + 0.2 * waterHeight;
    for (const seed of [1, 2, 3]) {
      const fish = {
        ...createFish(seed, 0, 'chirurgien', bounds),
        y: low,
        pitch: 0,
        pitchTarget: 0,
      };
      for (let i = 0; i < Math.round(3 / SIM_DT); i++) {
        stepFish(fish, SIM_DT, bounds);
      }
      // 3 s à ~6 cm/s, inclinaison jusqu'à 0,28 rad : plusieurs centimètres de montée.
      expect(fish.y).toBeGreaterThan(low + 0.03);
    }
    // Sans borne basse (néon), rien ne tire vers le haut : la borne vaut −∞.
    expect(swimBounds(NEON, water).preferredMinY).toBe(Number.NEGATIVE_INFINITY);
  });

  it.each([42, 7])(
    'graine %i : aucun chirurgien ne traverse un corail ni une anémone sur 120 s',
    (seed) => {
      const world = cloneWorld(setPopulation(createDefaultWorld(seed, 'recif'), 'chirurgien', 8));
      expect(world.obstacles.length).toBeGreaterThan(0);
      const steps = Math.round(120 / SIM_DT);
      let worst = Number.POSITIVE_INFINITY;
      for (let i = 0; i < steps; i++) {
        advanceInPlace(world, 1);
        for (const f of surgeons(world)) {
          for (const o of world.obstacles) {
            worst = Math.min(worst, obstacleDistance(o, f.x, f.y, f.z, SCRATCH));
          }
        }
      }
      // Distance signée du centre à la surface de l'obstacle : jamais à l'intérieur.
      expect(worst).toBeGreaterThanOrEqual(0);
    },
    60_000,
  );

  it('hors du récif : aucune incidence (un bac tropical peuplé à la main reste valide)', () => {
    const world = createWorld(42, [{ species: 'neon', count: 3 }]);
    expect(surgeons(world)).toHaveLength(0);
  });
});
