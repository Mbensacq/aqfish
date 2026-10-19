import { SIM_DT } from './constants';
import { CORYDORA, NEON, SPECIES } from './species';
import { swimBounds, type Fish } from './swimmer';
import { waterVolume } from './tank';
import {
  advance,
  advanceInPlace,
  createDefaultWorld,
  createWorld,
  type MutableWorld,
} from './world';

/**
 * Issue #31 : corydora, poisson de fond. Mesures en temps simulé uniquement (graines fixes,
 * pas de `SIM_DT`, aucune horloge murale).
 */
const water = waterVolume();
const waterHeight = water.maxY - water.minY;
/** Critère : sous 25 % de la hauteur d'eau. */
const LOW_LIMIT = water.minY + 0.25 * waterHeight;
const SIXTY_SECONDS = Math.round(60 / SIM_DT);

/** Demi-hauteur du modèle voxel (gabarit `CORYDORA_FISH` : 6 rangées de 0,75 voxel). */
const HALF_HEIGHT = (CORYDORA.bodyLength / 9) * 0.75 * 3;

interface DepthStats {
  /** Fraction des échantillons (poisson × pas) sous `LOW_LIMIT`. */
  readonly lowFraction: number;
  readonly minY: number;
  readonly maxY: number;
  /** Nombre de remontées commencées. */
  readonly ascents: number;
}

function corydoraStats(world: MutableWorld, steps: number): DepthStats {
  let low = 0;
  let samples = 0;
  let minY = Infinity;
  let maxY = -Infinity;
  let ascents = 0;
  const corys = (): Fish[] => world.entities.filter((e) => e.species === 'corydora');
  const ascending = new Map<number, boolean>(corys().map((f) => [f.id, f.ascent > 0]));
  for (let i = 0; i < steps; i++) {
    advanceInPlace(world, 1);
    for (const f of corys()) {
      samples++;
      if (f.y < LOW_LIMIT) {
        low++;
      }
      minY = Math.min(minY, f.y);
      maxY = Math.max(maxY, f.y);
      const now = f.ascent > 0;
      if (now && !ascending.get(f.id)) {
        ascents++;
      }
      ascending.set(f.id, now);
    }
  }
  return { lowFraction: low / samples, minY, maxY, ascents };
}

describe('corydora : nage de fond (#31)', () => {
  it.each([1, 42, 0xffffffff])(
    'graine %s, monde par défaut, 60 s : plus de 80 % du temps sous 25 % de la hauteur d’eau, jamais dans le sable',
    (seed) => {
      const stats = corydoraStats(createDefaultWorld(seed) as MutableWorld, SIXTY_SECONDS);
      expect(stats.lowFraction).toBeGreaterThan(0.8);
      expect(stats.minY).toBeGreaterThanOrEqual(water.minY + HALF_HEIGHT);
    },
  );

  it.each([7, 42, 2026])(
    'graine %s, monde par défaut, 60 s : jamais plaqués contre une vitre (limite de nage)',
    (seed) => {
      const hard = swimBounds(CORYDORA, water).hard;
      const world = createDefaultWorld(seed) as MutableWorld;
      let contacts = 0;
      for (let i = 0; i < SIXTY_SECONDS; i++) {
        advanceInPlace(world, 1);
        for (const f of world.entities) {
          if (
            f.species === 'corydora' &&
            (f.x <= hard.minX || f.x >= hard.maxX || f.z <= hard.minZ || f.z >= hard.maxZ)
          ) {
            contacts++;
          }
        }
      }
      expect(contacts).toBe(0);
    },
  );

  it('naissent dans la zone basse, au-dessus du sable', () => {
    for (const seed of [0, 7, 2026]) {
      for (const f of createDefaultWorld(seed).entities.filter((e) => e.species === 'corydora')) {
        expect(f.y).toBeLessThan(LOW_LIMIT);
        expect(f.y).toBeGreaterThanOrEqual(water.minY + CORYDORA.wallMargin);
        expect(f.ascent).toBe(0);
      }
    }
  });

  it('remontent parfois brièvement vers la surface, puis redescendent', () => {
    // 20 corydoras, 120 s : ≈ 16 remontées attendues (1 / 150 s par poisson).
    const world = createWorld(3, [{ species: 'corydora', count: 20 }]) as MutableWorld;
    const stats = corydoraStats(world, Math.round(120 / SIM_DT));
    expect(stats.ascents).toBeGreaterThan(3);
    expect(stats.maxY).toBeGreaterThan(water.minY + 0.5 * waterHeight);
    expect(stats.lowFraction).toBeGreaterThan(0.8);
  });

  // Le pas qui déclenche la remontée compte déjà : au plus `ascentDuration` + un pas.
  it('une remontée dure au plus `ascentDuration` (à un pas près)', () => {
    const world = createWorld(9, [{ species: 'corydora', count: 20 }]) as MutableWorld;
    const longest = new Map<number, number>();
    const current = new Map<number, number>();
    for (let i = 0; i < Math.round(120 / SIM_DT); i++) {
      advanceInPlace(world, 1);
      for (const f of world.entities) {
        const run = f.ascent > 0 ? (current.get(f.id) ?? 0) + SIM_DT : 0;
        current.set(f.id, run);
        longest.set(f.id, Math.max(longest.get(f.id) ?? 0, run));
      }
    }
    expect(Math.max(...longest.values())).toBeGreaterThan(0);
    expect(Math.max(...longest.values())).toBeLessThanOrEqual(
      CORYDORA.depth!.ascentDuration + SIM_DT + 1e-9,
    );
  });

  it('même graine ⇒ mêmes corydoras', () => {
    const a = advance(createDefaultWorld(5), 900);
    const b = advance(createDefaultWorld(5), 900);
    expect(b).toEqual(a);
  });

  it('les corydoras ne changent pas la trajectoire des néons', () => {
    const alone = advance(
      createWorld(42, [{ species: 'neon', count: NEON.defaultPopulation }]),
      600,
    );
    const mixed = advance(createDefaultWorld(42), 600);
    expect(mixed.entities.filter((e) => e.species === 'neon')).toEqual(alone.entities);
  });
});

describe('swimBounds d’une espèce de fond', () => {
  const bounds = swimBounds(CORYDORA, water);

  it('hauteur préférée : 12 % de la hauteur d’eau au-dessus du sable', () => {
    expect(bounds.preferredMaxY).toBeCloseTo(water.minY + 0.12 * waterHeight, 12);
  });

  it('naissance dans la tranche basse de `hard`', () => {
    expect(bounds.spawn.minY).toBe(bounds.hard.minY);
    expect(bounds.spawn.maxY).toBe(bounds.preferredMaxY);
    expect(bounds.spawn.minX).toBeGreaterThanOrEqual(bounds.hard.minX);
    expect(bounds.spawn.maxZ).toBeLessThanOrEqual(bounds.hard.maxZ);
  });

  it('fond de la boîte d’évitement abaissé : portée effective `floorZone`', () => {
    expect(bounds.avoid.maxY).toBe(bounds.hard.maxY);
    expect(bounds.avoid.minX).toBe(bounds.hard.minX);
    expect(bounds.hard.minY - bounds.avoid.minY).toBeCloseTo(0.07 - CORYDORA.depth!.floorZone, 12);
  });

  it('espèce sans préférence : `avoid` est `hard`, hauteur préférée infinie', () => {
    for (const def of Object.values(SPECIES).filter((d) => d.depth === undefined)) {
      const b = swimBounds(def, water);
      expect(b.avoid).toBe(b.hard);
      expect(b.preferredMaxY).toBe(Number.POSITIVE_INFINITY);
    }
  });

  it('volume d’eau très bas : hauteur préférée ramenée dans `hard`', () => {
    const shallow = { ...water, maxY: water.minY + 0.05 };
    const b = swimBounds(CORYDORA, shallow);
    expect(b.preferredMaxY).toBeGreaterThanOrEqual(b.hard.minY);
    expect(b.preferredMaxY).toBeLessThanOrEqual(b.hard.maxY);
    expect(b.spawn.minY).toBeLessThanOrEqual(b.spawn.maxY);
  });
});
