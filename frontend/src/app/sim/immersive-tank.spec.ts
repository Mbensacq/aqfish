import { describe, expect, it } from 'vitest';
import { isDecorMode } from './care-mode';
import {
  ENVIRONMENT_IDS,
  IMMERSIVE_ENVIRONMENTS,
  isImmersiveEnvironment,
  livesIn,
  type ImmersiveEnvironmentId,
} from './environment';
import {
  IMMERSIVE_DEPTH_MM,
  clampDepthMm,
  createImmersiveWorld,
  defaultDepthMm,
  immersiveLayout,
  immersiveCount,
  immersivePopulation,
  IMMERSIVE_COUNTS,
  smallSwimmers,
} from './immersive-tank';
import { SPECIES } from './species';
import { IMMERSIVE_LIMITS, TANK_LIMITS } from './tank';
import { advance, createWorld } from './world';

const screens = [
  { width: 65, height: 140 }, // téléphone en portrait
  { width: 140, height: 65 }, // téléphone en paysage
  { width: 300, height: 190 }, // ordinateur portable
  { width: 600, height: 340 }, // écran de bureau
  { width: 1200, height: 680 }, // grand téléviseur
];

describe('immersive-tank', () => {
  it('vitre aux proportions exactes de l’écran, dans les bornes immersives', () => {
    for (const screen of screens) {
      const layout = immersiveLayout(screen, defaultDepthMm(screen));
      const d = layout.dimensions;
      expect(layout.aspectClamped).toBe(false);
      expect(d.width / d.height).toBeCloseTo(screen.width / screen.height, 9);
      expect(d.width).toBeCloseTo((screen.width / 1000) * layout.scale, 9);
      for (const key of ['width', 'height', 'depth'] as const) {
        expect(d[key]).toBeGreaterThanOrEqual(IMMERSIVE_LIMITS[key].min);
        expect(d[key]).toBeLessThanOrEqual(IMMERSIVE_LIMITS[key].max);
      }
    }
  });

  it('échelle au plus près du réel : 1 dès que l’écran est assez grand', () => {
    expect(immersiveLayout({ width: 600, height: 400 }, 300).scale).toBe(1);
    expect(immersiveLayout({ width: 65, height: 140 }, 40).scale).toBeCloseTo(0.3 / 0.065, 9);
    expect(immersiveLayout({ width: 4000, height: 2000 }, 300).scale).toBeCloseTo(0.5, 9);
  });

  it('proportions extrêmes : bornées et signalées', () => {
    const layout = immersiveLayout({ width: 10, height: 1000 }, 50);
    expect(layout.aspectClamped).toBe(true);
    expect(layout.dimensions.width).toBe(IMMERSIVE_LIMITS.width.min);
  });

  it('refuse un écran vide ou non fini', () => {
    for (const screen of [
      { width: 0, height: 100 },
      { width: 100, height: -1 },
      { width: Number.NaN, height: 100 },
      { width: 100, height: Number.POSITIVE_INFINITY },
    ]) {
      expect(() => immersiveLayout(screen, 50)).toThrow(RangeError);
    }
  });

  it('profondeur : défaut raisonnable, bornée, non finie ramenée au minimum', () => {
    expect(defaultDepthMm({ width: 300, height: 190 })).toBeCloseTo(114, 9);
    expect(defaultDepthMm({ width: 10, height: 10 })).toBe(IMMERSIVE_DEPTH_MM.min);
    expect(clampDepthMm(1e6)).toBe(IMMERSIVE_DEPTH_MM.max);
    expect(clampDepthMm(Number.NaN)).toBe(IMMERSIVE_DEPTH_MM.min);
    const shallow = immersiveLayout({ width: 600, height: 400 }, 20).dimensions.depth;
    const deep = immersiveLayout({ width: 600, height: 400 }, 500).dimensions.depth;
    expect(shallow).toBe(IMMERSIVE_LIMITS.depth.min);
    expect(deep).toBeCloseTo(0.5, 9);
  });

  it('suit le redimensionnement et l’orientation : portrait et paysage échangent les côtés', () => {
    const portrait = immersiveLayout({ width: 65, height: 140 }, 40).dimensions;
    const landscape = immersiveLayout({ width: 140, height: 65 }, 40).dimensions;
    expect(portrait.width).toBeLessThan(portrait.height);
    expect(landscape.width).toBeGreaterThan(landscape.height);
    expect(landscape.width / landscape.height).toBeCloseTo(portrait.height / portrait.width, 9);
  });

  it('plus petites espèces nageuses d’abord, sans marcheur ni amphibien', () => {
    const ids = smallSwimmers();
    expect(ids.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < ids.length; i++) {
      expect(SPECIES[ids[i]].bodyLength).toBeGreaterThanOrEqual(SPECIES[ids[i - 1]].bodyLength);
    }
    for (const id of ids) {
      expect(SPECIES[id].walker).toBeUndefined();
      expect(SPECIES[id].amphibian).toBeUndefined();
    }
    expect(immersivePopulation().map((e) => e.species)).toEqual(ids.slice(0, 3));
  });

  it('monde en mode décor, hors des bornes du bac réglable, qui nage sans sortir du bac', () => {
    for (const screen of screens) {
      const layout = immersiveLayout(screen, defaultDepthMm(screen));
      const world = createImmersiveWorld(345, layout);
      expect(isDecorMode(world)).toBe(true);
      expect(world.decor).toEqual([]);
      expect(world.dimensions).toEqual(layout.dimensions);
      const later = advance(world, 600);
      const { width, height, depth } = layout.dimensions;
      for (const fish of later.entities) {
        for (const v of [fish.x, fish.y, fish.z]) {
          expect(Number.isFinite(v)).toBe(true);
        }
        expect(Math.abs(fish.x)).toBeLessThanOrEqual(width / 2);
        expect(Math.abs(fish.z)).toBeLessThanOrEqual(depth / 2);
        expect(fish.y).toBeGreaterThanOrEqual(0);
        expect(fish.y).toBeLessThanOrEqual(height);
      }
    }
    // Le téléphone en portrait sort bien des bornes du bac réglable.
    expect(immersiveLayout({ width: 65, height: 140 }, 40).dimensions.width).toBeLessThan(
      TANK_LIMITS.width.min,
    );
  });

  it('déterministe : même graine, même monde', () => {
    const layout = immersiveLayout({ width: 300, height: 190 }, 100);
    expect(advance(createImmersiveWorld(7, layout), 120)).toEqual(
      advance(createImmersiveWorld(7, layout), 120),
    );
  });

  describe('choix du bac (#375)', () => {
    it('propose le bac tropical et le récif, pas les bacs à berge ou à margelle', () => {
      expect([...IMMERSIVE_ENVIRONMENTS]).toEqual(['tropical', 'recif']);
      for (const id of ENVIRONMENT_IDS) {
        expect(isImmersiveEnvironment(id)).toBe(id === 'tropical' || id === 'recif');
      }
      for (const value of ['', 'constructor', null, undefined, 3]) {
        expect(isImmersiveEnvironment(value)).toBe(false);
      }
    });

    it('bac tropical par défaut : population inchangée (eau douce seulement)', () => {
      expect(smallSwimmers()).toEqual(smallSwimmers('tropical'));
      expect(immersivePopulation()).toEqual(immersivePopulation('tropical'));
      expect(immersivePopulation('tropical')).toEqual([
        { species: 'otocinclus', count: 8 },
        { species: 'corydora', count: 5 },
        { species: 'rasbora', count: 3 },
      ]);
    });

    it('population cohérente avec l’environnement : aucune espèce d’ailleurs', () => {
      for (const env of IMMERSIVE_ENVIRONMENTS) {
        const population = immersivePopulation(env);
        expect(population.length).toBeGreaterThan(0);
        for (const { species, count } of population) {
          expect(livesIn(env, species)).toBe(true);
          expect(count).toBeGreaterThan(0);
        }
      }
      // Pas de poisson marin en eau douce, ni l'inverse.
      expect(immersivePopulation('tropical').some((e) => livesIn('recif', e.species))).toBe(false);
      expect(immersivePopulation('recif').some((e) => livesIn('tropical', e.species))).toBe(false);
      // Trois plus petites espèces nageuses du récif depuis son lot 2 (#403, ADR 0097).
      expect(immersivePopulation('recif').map((e) => e.species)).toEqual([
        'chromis',
        'clown',
        'gramma',
      ]);
    });

    it('refuse un environnement sans bac immersif', () => {
      const layout = immersiveLayout({ width: 300, height: 190 }, 100);
      for (const env of ['bassin', 'paludarium', 'eaufroide', 'mer']) {
        expect(() => smallSwimmers(env as ImmersiveEnvironmentId)).toThrow(RangeError);
        expect(() => createImmersiveWorld(1, layout, env as ImmersiveEnvironmentId)).toThrow(
          RangeError,
        );
      }
      expect(() =>
        createWorld(1, [], [], [], {
          environment: 'paludarium',
          dimensions: layout.dimensions,
          immersive: true,
        }),
      ).toThrow(RangeError);
      // Hors mode immersif, le récif ne se redimensionne toujours pas.
      expect(() =>
        createWorld(1, [], [], [], { environment: 'recif', dimensions: layout.dimensions }),
      ).toThrow(RangeError);
    });

    it('récif immersif : aux dimensions de l’écran, en mode décor, nage dans le bac', () => {
      for (const screen of screens) {
        const layout = immersiveLayout(screen, defaultDepthMm(screen));
        const world = createImmersiveWorld(345, layout, 'recif');
        expect(world.environment).toBe('recif');
        expect(world.dimensions).toEqual(layout.dimensions);
        expect(isDecorMode(world)).toBe(true);
        expect(world.entities.every((f) => livesIn('recif', f.species))).toBe(true);
        const later = advance(world, 600);
        const { width, height, depth } = layout.dimensions;
        for (const fish of later.entities) {
          for (const v of [fish.x, fish.y, fish.z]) {
            expect(Number.isFinite(v)).toBe(true);
          }
          expect(Math.abs(fish.x)).toBeLessThanOrEqual(width / 2);
          expect(Math.abs(fish.z)).toBeLessThanOrEqual(depth / 2);
          expect(fish.y).toBeGreaterThanOrEqual(0);
          expect(fish.y).toBeLessThanOrEqual(height);
        }
      }
    });

    it('effectifs selon la vitre (#390) : récif moins dense au téléphone, tropical inchangé', () => {
      const counts = (env: ImmersiveEnvironmentId, screen: { width: number; height: number }) =>
        createImmersiveWorld(7, immersiveLayout(screen, defaultDepthMm(screen)), env).entities
          .length;
      const phone = immersiveLayout({ width: 65, height: 140 }, 40).dimensions;
      // Tropical : effectifs pleins dès le plus petit bac immersif.
      for (const screen of screens) {
        expect(counts('tropical', screen), `${screen.width}`).toBe(8 + 5 + 3);
      }
      expect(immersivePopulation('tropical', phone)).toEqual(immersivePopulation('tropical'));
      // Récif au téléphone : moins de poissons qu'au maximum, au moins un par espèce.
      const reef = immersivePopulation('recif', phone);
      expect(reef.map((e) => e.count)).toEqual([4, 3, 3]);
      expect(counts('recif', { width: 65, height: 140 })).toBe(10);
      // Plus grande vitre (bac simulé), plus de poissons, jamais au-delà des maximums.
      const front = (screen: { width: number; height: number }) => {
        const { width, height } = immersiveLayout(screen, defaultDepthMm(screen)).dimensions;
        return width * height;
      };
      let previous = 0;
      for (const screen of [...screens].sort((a, b) => front(a) - front(b))) {
        const total = counts('recif', screen);
        expect(total).toBeGreaterThanOrEqual(previous);
        expect(total).toBeLessThanOrEqual(8 + 5 + 3);
        previous = total;
      }
      expect(counts('recif', { width: 1200, height: 680 })).toBe(8 + 5 + 3);
    });

    it('immersiveCount : bornes (sans dimensions, bac minuscule, bac immense, non fini)', () => {
      expect(immersiveCount('clown', 1)).toBe(IMMERSIVE_COUNTS[1]);
      expect(immersiveCount('clown', 0, { width: 0.01, height: 0.01, depth: 0.25 })).toBe(1);
      expect(immersiveCount('clown', 0, { width: 2, height: 1.5, depth: 0.9 })).toBe(8);
      expect(immersiveCount('clown', 2, { width: Infinity, height: 1, depth: 1 })).toBe(3);
      expect(immersiveCount('gramma', 0, { width: 0.3, height: 0.4, depth: 0.25 })).toBe(2);
    });

    it('déterministe par environnement : même graine, même monde ; bacs différents', () => {
      const layout = immersiveLayout({ width: 65, height: 140 }, 40);
      expect(advance(createImmersiveWorld(9, layout, 'recif'), 120)).toEqual(
        advance(createImmersiveWorld(9, layout, 'recif'), 120),
      );
      expect(createImmersiveWorld(9, layout, 'recif').entities.map((f) => f.species)).not.toEqual(
        createImmersiveWorld(9, layout, 'tropical').entities.map((f) => f.species),
      );
    });
  });
});
