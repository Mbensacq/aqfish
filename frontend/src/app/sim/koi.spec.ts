import {
  CORYDORA,
  GUPPY,
  KOI,
  NEON,
  SPECIES,
  speciesVariantIndex,
  validateSpecies,
} from './species';
import { POND, TROPICAL_TANK, livesIn } from './environment';
import { obstacleDistance } from './obstacles';
import {
  boundsFor,
  createDefaultWorld,
  createWorld,
  advanceInPlace,
  type MutableWorld,
} from './world';
import { DEFAULT_DECOR } from './decor';
import type { Vec3 } from './flocking';

/** Robe (indice d'apparence) de chaque koï du monde. */
function robes(world: { seed: number; entities: readonly { id: number; species: string }[] }) {
  return world.entities
    .filter((f) => f.species === 'koi')
    .map((f) => speciesVariantIndex(KOI, f.id, world.seed));
}

describe('koï (#88)', () => {
  it('définition enregistrée et valide, silhouette propre', () => {
    expect(SPECIES.koi).toBe(KOI);
    expect(validateSpecies(KOI)).toEqual([]);
    expect(KOI.silhouette).toBe('koi');
    expect(KOI.schooling).not.toBeNull();
    expect(KOI.depth).toBeUndefined();
  });

  it('réutilise le banc avec des paramètres plus calmes que les espèces du bac', () => {
    for (const other of [NEON, GUPPY]) {
      expect(KOI.wanderTurnRate).toBeLessThan(other.wanderTurnRate);
      expect(KOI.schooling!.turnRate).toBeLessThan(other.schooling!.turnRate);
      expect(KOI.schooling!.cohesionWeight).toBeLessThan(other.schooling!.cohesionWeight);
      expect(KOI.tailBeatFrequency).toBeLessThan(other.tailBeatFrequency);
      expect(KOI.maxPitch).toBeLessThan(other.maxPitch);
    }
    // Plus grand que tous, donc plus lent en longueurs de corps par seconde.
    for (const other of [NEON, GUPPY, CORYDORA]) {
      expect(KOI.bodyLength).toBeGreaterThan(other.bodyLength);
      expect(KOI.cruiseSpeed / KOI.bodyLength).toBeLessThan(other.cruiseSpeed / other.bodyLength);
    }
  });

  it('au moins 3 robes distinctes, aux couleurs de la palette « Koïs »', () => {
    const variants = KOI.variants!;
    expect(variants.length).toBeGreaterThanOrEqual(3);
    expect(new Set(variants.map((v) => v.id)).size).toBe(variants.length);
    const looks = variants.map((v) => JSON.stringify(v.colors));
    expect(new Set(looks).size).toBe(variants.length);
    const koiPalette = ['#d94a3a', '#f2ead8', '#1c1c22', '#f08a2c', '#f2c14e'];
    for (const v of variants) {
      for (const color of Object.values(v.colors)) {
        expect(koiPalette).toContain(color);
      }
    }
    expect(KOI.variantDraw).toBe('graine');
  });

  it('robes déterministes : même graine, mêmes robes', () => {
    for (const seed of [0, 1, 42, 4294967295]) {
      const a = robes(createDefaultWorld(seed, 'bassin'));
      expect(a).toHaveLength(KOI.defaultPopulation);
      expect(robes(createDefaultWorld(seed, 'bassin'))).toEqual(a);
      for (const robe of a) {
        expect(robe).toBeGreaterThanOrEqual(0);
        expect(robe).toBeLessThan(KOI.variants!.length);
      }
    }
  });

  it('toutes les robes présentes dès qu’il y a autant de koïs que de robes', () => {
    const count = KOI.variants!.length;
    for (let seed = 0; seed < 50; seed++) {
      for (let block = 0; block < 4; block++) {
        const ids = Array.from({ length: count }, (_, i) => block * count + i);
        const drawn = new Set(ids.map((id) => speciesVariantIndex(KOI, id, seed)));
        expect(drawn.size).toBe(count);
      }
    }
  });

  it('les robes dépendent de la graine (pas seulement de l’identifiant)', () => {
    const signatures = new Set<string>();
    for (let seed = 0; seed < 20; seed++) {
      signatures.add(
        Array.from({ length: 12 }, (_, id) => speciesVariantIndex(KOI, id, seed)).join(''),
      );
    }
    expect(signatures.size).toBeGreaterThan(10);
  });

  it('les autres espèces gardent l’alternance par identifiant, quelle que soit la graine', () => {
    for (const id of [0, 1, 2, 3, 17]) {
      for (const seed of [0, 42, 4294967295]) {
        expect(speciesVariantIndex(GUPPY, id, seed)).toBe(id % 2);
        expect(speciesVariantIndex(NEON, id, seed)).toBe(0);
      }
    }
  });

  it('refuse une graine invalide pour une espèce à robes tirées de la graine', () => {
    for (const seed of [-1, 1.5, 2 ** 32, Number.NaN]) {
      expect(() => speciesVariantIndex(KOI, 0, seed)).toThrow(RangeError);
    }
    expect(() => speciesVariantIndex(KOI, -1, 0)).toThrow(RangeError);
  });

  it('validateSpecies signale un mode de répartition inconnu', () => {
    const bad = { ...KOI, variantDraw: 'hasard' as unknown as 'graine' };
    expect(validateSpecies(bad).join(' ')).toContain('variantDraw');
  });

  it('vivent dans le bassin seulement ; le bac tropical garde ses trois espèces', () => {
    expect(POND.species).toEqual(['koi']);
    expect(POND.population).toEqual([{ species: 'koi', count: KOI.defaultPopulation }]);
    expect(TROPICAL_TANK.species).toEqual(['neon', 'guppy', 'corydora']);
    expect(livesIn('bassin', 'koi')).toBe(true);
    expect(livesIn('tropical', 'koi')).toBe(false);
    expect(livesIn('bassin', 'neon')).toBe(false);
    // Monde tropical identique à celui d'avant les koïs (même graine, mêmes tirages).
    expect(createDefaultWorld(42)).toEqual(
      createWorld(
        42,
        [NEON, GUPPY, CORYDORA].map((d) => ({ species: d.id, count: d.defaultPopulation })),
        [],
        DEFAULT_DECOR,
      ),
    );
  });

  it.each([7, 2024])(
    'graine %i : sur 10 000 pas, aucun koï ne sort du bassin ni n’entre dans une pierre',
    (seed) => {
      const world = createDefaultWorld(seed, 'bassin') as MutableWorld;
      const hard = boundsFor('koi', 'bassin').hard;
      const normal: Vec3 = { x: 0, y: 0, z: 0 };
      const eps = 1e-9;
      let outside = 0;
      let inside = 0;
      for (let i = 0; i < 10_000; i++) {
        advanceInPlace(world, 1);
        for (const f of world.entities) {
          if (
            f.x < hard.minX - eps ||
            f.x > hard.maxX + eps ||
            f.y < hard.minY - eps ||
            f.y > hard.maxY + eps ||
            f.z < hard.minZ - eps ||
            f.z > hard.maxZ + eps
          ) {
            outside++;
          }
          for (const o of world.obstacles) {
            if (obstacleDistance(o, f.x, f.y, f.z, normal) <= 0) {
              inside++;
            }
          }
        }
      }
      expect(world.entities).toHaveLength(KOI.defaultPopulation);
      expect(world.obstacles.length).toBeGreaterThan(0);
      expect(outside).toBe(0);
      expect(inside).toBe(0);
    },
    15_000,
  );
});
