import {
  ALGAE_BAD_COVERAGE,
  ALGAE_FULL_DAYS,
  ALGAE_NITRATE_FULL,
  ALGAE_NITRATE_LIMIT,
  ALGAE_PATCH_COUNT,
  ALGAE_VIGOR_MAX,
  ALGAE_VIGOR_MIN,
  ALGAE_WATCH_COVERAGE,
  algaeCoverage,
  algaeGrowth,
  algaeLevel,
  algaePatches,
  cachedAlgaePatches,
  DEFAULT_LIGHTING_HOURS,
  hasAlgae,
  lightingOf,
  readAlgae,
  sampleAlgae,
  scrapeAlgaeInPlace,
  scrapedPatch,
  setLightingInPlace,
  stepAlgaeInPlace,
  type AlgaeWater,
} from './algae';
import { SIM_DT } from './constants';
import { DEFAULT_DAY_LENGTH_SECONDS } from './daylight';
import { environmentWater } from './environment';
import { COMPOUND_THRESHOLDS, GAUGE_MAX } from './water-quality';
import { freshWater, readWater, copyWater } from './water';
import {
  advance,
  createDefaultWorld,
  scrapeWorldAlgaeInPlace,
  setWorldLightingInPlace,
  worldAlgaePatches,
  type MutableWorld,
} from './world';

const WATER = environmentWater({ environment: 'tropical' });
const DAY = DEFAULT_DAY_LENGTH_SECONDS;

describe('algues (#476)', () => {
  describe('seuils', () => {
    it('les seuils des nitrates suivent la jauge', () => {
      expect(ALGAE_NITRATE_LIMIT).toBe(COMPOUND_THRESHOLDS.nitrate.watch);
      expect(ALGAE_NITRATE_FULL).toBe(GAUGE_MAX.nitrate);
    });

    it('poussent dans les bacs vitrés d’eau douce seulement', () => {
      expect(hasAlgae('tropical')).toBe(true);
      expect(hasAlgae('eaufroide')).toBe(true);
      expect(hasAlgae('paludarium')).toBe(true);
      expect(hasAlgae('recif')).toBe(false);
      expect(hasAlgae('bassin')).toBe(false);
    });
  });

  describe('algaeGrowth', () => {
    it('nulle sans lumière, même avec des nitrates au plafond', () => {
      expect(algaeGrowth(0, 100)).toBe(0);
    });

    it('nulle à éclairage normal et eau propre, jusqu’aux seuils compris', () => {
      expect(algaeGrowth(DEFAULT_LIGHTING_HOURS, 0)).toBe(0);
      expect(algaeGrowth(10, ALGAE_NITRATE_LIMIT)).toBe(0);
    });

    it('croît avec l’éclairage au-delà de 10 h, pleine à 24 h', () => {
      expect(algaeGrowth(12, 0)).toBeGreaterThan(0);
      expect(algaeGrowth(18, 0)).toBeGreaterThan(algaeGrowth(12, 0));
      expect(algaeGrowth(24, 0)).toBe(1);
    });

    it('croît avec les nitrates au-delà du seuil, pleine au plein de la jauge', () => {
      expect(algaeGrowth(8, 30)).toBeGreaterThan(0);
      expect(algaeGrowth(8, 50)).toBeGreaterThan(algaeGrowth(8, 30));
      expect(algaeGrowth(8, ALGAE_NITRATE_FULL)).toBe(1);
      expect(algaeGrowth(8, 100)).toBe(1);
    });

    it('un éclairage court freine la pousse due aux nitrates', () => {
      expect(algaeGrowth(4, 100)).toBeCloseTo(0.5, 12);
    });

    it('valeurs non finies ou négatives : aucune pousse fantôme', () => {
      expect(algaeGrowth(Number.NaN, 100)).toBe(0);
      expect(algaeGrowth(-3, 100)).toBe(0);
      expect(algaeGrowth(8, Number.NaN)).toBe(0);
      expect(algaeGrowth(8, Number.POSITIVE_INFINITY)).toBe(0);
    });
  });

  describe('algaePatches', () => {
    it('déterministes : même graine, mêmes plaques ; autre graine, autres plaques', () => {
      expect(algaePatches(42, WATER)).toEqual(algaePatches(42, WATER));
      expect(algaePatches(43, WATER)).not.toEqual(algaePatches(42, WATER));
      expect(cachedAlgaePatches(42, WATER)).toEqual(algaePatches(42, WATER));
      expect(cachedAlgaePatches(42, WATER)).toBe(cachedAlgaePatches(42, { ...WATER }));
    });

    it('graine invalide : refusée', () => {
      expect(() => algaePatches(-1, WATER)).toThrow(RangeError);
      expect(() => algaePatches(1.5, WATER)).toThrow(RangeError);
    });

    it('chaque plaque tient sur sa vitre, sous la surface et au-dessus du sable', () => {
      for (const seed of [0, 1, 42, 4294967295]) {
        const patches = algaePatches(seed, WATER);
        expect(patches).toHaveLength(ALGAE_PATCH_COUNT);
        for (const p of patches) {
          expect(p.y - p.radius).toBeGreaterThanOrEqual(WATER.minY - 1e-12);
          expect(p.y + p.radius).toBeLessThanOrEqual(WATER.maxY + 1e-12);
          expect(p.vigor).toBeGreaterThanOrEqual(ALGAE_VIGOR_MIN);
          expect(p.vigor).toBeLessThanOrEqual(ALGAE_VIGOR_MAX);
          if (p.wall === 'fond' || p.wall === 'devant') {
            expect(p.z).toBe(p.wall === 'fond' ? WATER.minZ : WATER.maxZ);
            expect(p.x - p.radius).toBeGreaterThanOrEqual(WATER.minX - 1e-12);
            expect(p.x + p.radius).toBeLessThanOrEqual(WATER.maxX + 1e-12);
          } else {
            expect(p.x).toBe(p.wall === 'gauche' ? WATER.minX : WATER.maxX);
            expect(p.z - p.radius).toBeGreaterThanOrEqual(WATER.minZ - 1e-12);
            expect(p.z + p.radius).toBeLessThanOrEqual(WATER.maxZ + 1e-12);
          }
          if (p.wall === 'devant') {
            // Devant : dans le tiers bas, pour ne pas masquer le bac de face.
            expect(p.y).toBeLessThanOrEqual(
              WATER.minY + Math.max(p.radius, (WATER.maxY - WATER.minY) / 3) + 1e-9,
            );
          }
        }
      }
    });

    it('bac très bas : rayon ramené à la demi-hauteur d’eau', () => {
      const flat = { ...WATER, maxY: WATER.minY + 0.04 };
      for (const p of algaePatches(7, flat)) {
        expect(p.radius).toBeLessThanOrEqual(0.02 + 1e-12);
      }
    });
  });

  describe('stepAlgaeInPlace', () => {
    const patches = algaePatches(42, WATER);

    it('eau propre, éclairage normal : rien n’est écrit', () => {
      const water: AlgaeWater = { nitrate: 0 };
      stepAlgaeInPlace(water, SIM_DT, patches);
      expect(water).toEqual({ nitrate: 0 });
    });

    it('éclairage nul : rien ne pousse, même avec des nitrates au plafond', () => {
      const water: AlgaeWater = { nitrate: 100, lighting: 0 };
      for (let i = 0; i < 1000; i++) {
        stepAlgaeInPlace(water, 1, patches);
      }
      expect(water.algae).toBeUndefined();
    });

    it('pousse à la vitesse prévue, selon la vigueur de chaque plaque', () => {
      const water: AlgaeWater = { nitrate: 100, lighting: 24 };
      stepAlgaeInPlace(water, 10, patches);
      const rate = 10 / (ALGAE_FULL_DAYS * DAY);
      water.algae!.forEach((c, i) => expect(c).toBeCloseTo(rate * patches[i].vigor, 12));
    });

    it('plafond de couverture : jamais au-delà de 1', () => {
      const water: AlgaeWater = { nitrate: 100, lighting: 24 };
      const steps = Math.ceil((ALGAE_FULL_DAYS * DAY) / ALGAE_VIGOR_MIN / 60) + 5;
      for (let i = 0; i < steps; i++) {
        stepAlgaeInPlace(water, 60, patches);
      }
      expect(water.algae).toEqual(new Array(ALGAE_PATCH_COUNT).fill(1));
      expect(algaeCoverage(water.algae)).toBe(1);
    });

    it('pas invalide : refusé', () => {
      expect(() => stepAlgaeInPlace({ nitrate: 100 }, -1, patches)).toThrow(RangeError);
      expect(() => stepAlgaeInPlace({ nitrate: 100 }, Number.NaN, patches)).toThrow(RangeError);
    });
  });

  describe('couverture et niveau', () => {
    it('moyenne des plaques ; aucune algue : 0', () => {
      expect(algaeCoverage(undefined)).toBe(0);
      expect(algaeCoverage([])).toBe(0);
      expect(algaeCoverage(new Array(ALGAE_PATCH_COUNT).fill(0.5))).toBeCloseTo(0.5, 12);
      const mixed = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
      expect(algaeCoverage(mixed)).toBeCloseTo(0.45, 12);
    });

    it('sauvegarde courte (#488) : divisée par le nombre de plaques, pas par sa longueur', () => {
      // Une seule plaque pleine : 1/8 du bac, pas un bac entier.
      expect(algaeCoverage([1])).toBeCloseTo(1 / ALGAE_PATCH_COUNT, 12);
      expect(algaeCoverage([0.2, 0.4])).toBeCloseTo(0.6 / ALGAE_PATCH_COUNT, 12);
      // Sous le seuil de prolifération, alors que l'ancienne moyenne (1) était « grave ».
      expect(algaeLevel(algaeCoverage([1]))).toBe('aucune');
      // Relue d'une sauvegarde : même règle.
      const read = readAlgae([1, 1]);
      expect(read.ok).toBe(true);
      expect(algaeCoverage(read.ok ? read.algae : undefined)).toBeCloseTo(0.25, 12);
    });

    it('valeurs au-delà du nombre de plaques ignorées ; couverture jamais au-dessus de 1', () => {
      const long = new Array(ALGAE_PATCH_COUNT + 4).fill(1);
      expect(algaeCoverage(long)).toBe(1);
      expect(algaeCoverage([...new Array(ALGAE_PATCH_COUNT).fill(0), 1, 1])).toBe(0);
    });

    it('valeur non finie : couverture non finie (jamais rassurante)', () => {
      expect(algaeCoverage([Number.NaN])).toBeNaN();
    });

    it('niveaux aux seuils, non fini grave', () => {
      expect(algaeLevel(0)).toBe('aucune');
      expect(algaeLevel(ALGAE_WATCH_COVERAGE - 1e-9)).toBe('aucune');
      expect(algaeLevel(ALGAE_WATCH_COVERAGE)).toBe('proliferation');
      expect(algaeLevel(ALGAE_BAD_COVERAGE)).toBe('grave');
      expect(algaeLevel(Number.NaN)).toBe('grave');
    });
  });

  describe('raclette', () => {
    const patches = algaePatches(42, WATER);
    const full = () => new Array<number>(ALGAE_PATCH_COUNT).fill(1);

    it('vise la plaque la plus proche sur le rayon', () => {
      const back = patches.findIndex((p) => p.wall === 'fond');
      const p = patches[back];
      // Rayon depuis le devant, droit sur le centre de la plaque du fond.
      const origin = [p.x, p.y, 2] as const;
      const hit = scrapedPatch(patches, full(), origin, [0, 0, -1]);
      // Une plaque de devant sur le chemin l'emporterait (la plus proche de l'origine).
      const front = patches.findIndex(
        (q) => q.wall === 'devant' && Math.hypot(q.x - p.x, q.y - p.y) <= q.radius + 0.02,
      );
      expect(hit).toBe(front >= 0 ? front : back);
    });

    it('rien sous le rayon, plaques invisibles ou rayon nul : aucune', () => {
      expect(scrapedPatch(patches, full(), [0, 5, 0], [0, 1, 0])).toBe(-1);
      expect(scrapedPatch(patches, undefined, [0, 0.3, 2], [0, 0, -1])).toBe(-1);
      expect(
        scrapedPatch(patches, new Array(ALGAE_PATCH_COUNT).fill(0.01), [0, 0.3, 2], [0, 0, -1]),
      ).toBe(-1);
      expect(scrapedPatch(patches, full(), [0, 0.3, 2], [0, 0, 0])).toBe(-1);
    });

    it('retire la plaque touchée ; plus aucune algue : champ retiré', () => {
      const water: AlgaeWater = { nitrate: 5, algae: [0.5, 0, 0, 0, 0, 0, 0, 0.2] };
      expect(scrapeAlgaeInPlace(water, 0)).toBe(true);
      expect(water.algae).toEqual([0, 0, 0, 0, 0, 0, 0, 0.2]);
      expect(scrapeAlgaeInPlace(water, 0)).toBe(false);
      expect(scrapeAlgaeInPlace(water, 7)).toBe(true);
      expect(water.algae).toBeUndefined();
      expect(water.nitrate).toBe(5);
      expect(scrapeAlgaeInPlace(water, 7)).toBe(false);
      expect(scrapeAlgaeInPlace({ nitrate: 0, algae: [1] }, 0.5)).toBe(false);
    });

    it('sur le monde : retire la plaque visée sans toucher aux poissons', () => {
      const world = advance(createDefaultWorld(42), 30) as MutableWorld;
      (world as { water: AlgaeWater }).water = { ...world.water, algae: full() };
      const fishes = JSON.stringify(world.entities);
      const p = worldAlgaePatches(world)[0];
      const origin: [number, number, number] =
        p.wall === 'gauche' ? [-3, p.y, p.z] : p.wall === 'droite' ? [3, p.y, p.z] : [p.x, p.y, 3];
      const direction: [number, number, number] =
        p.wall === 'gauche' ? [1, 0, 0] : p.wall === 'droite' ? [-1, 0, 0] : [0, 0, -1];
      const index = scrapeWorldAlgaeInPlace(world, origin, direction);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(world.water.algae![index]).toBe(0);
      expect(algaeCoverage(world.water.algae)).toBeLessThan(1);
      expect(JSON.stringify(world.entities)).toBe(fishes);
      expect(scrapeWorldAlgaeInPlace(world, [0, 9, 0], [0, 1, 0])).toBe(-1);
    });

    it('hors des bacs à algues : aucune plaque', () => {
      expect(worldAlgaePatches(createDefaultWorld(42, 'recif'))).toEqual([]);
    });
  });

  describe('éclairage', () => {
    it('défaut 8 h, non écrit ; arrondi à l’heure ; bornes 0 et 24', () => {
      const water: AlgaeWater = { nitrate: 0 };
      expect(lightingOf(water)).toBe(DEFAULT_LIGHTING_HOURS);
      expect(setLightingInPlace(water, 11.6)).toBe(true);
      expect(water.lighting).toBe(12);
      expect(setLightingInPlace(water, 0)).toBe(true);
      expect(lightingOf(water)).toBe(0);
      expect(setLightingInPlace(water, 24)).toBe(true);
      expect(setLightingInPlace(water, 8)).toBe(true);
      expect(water).toEqual({ nitrate: 0 });
      for (const bad of [-1, 25, Number.NaN]) {
        expect(setLightingInPlace(water, bad)).toBe(false);
      }
      expect(water).toEqual({ nitrate: 0 });
    });
  });

  describe('dans le monde', () => {
    it('bac par défaut, éclairage normal, eau propre : aucune algue', () => {
      // Une minute simulée : les nitrates restent bien sous le seuil (~25 unités par heure).
      const later = advance(createDefaultWorld(42), Math.round(60 / SIM_DT));
      expect(later.water.nitrate).toBeLessThan(ALGAE_NITRATE_LIMIT);
      expect(later.water.algae).toBeUndefined();
    }, 30_000);

    it('éclairage de 24 h : les algues poussent, de façon déterministe', () => {
      const run = () => {
        const world = createDefaultWorld(42) as MutableWorld;
        setWorldLightingInPlace(world, 24);
        return advance(world, Math.round(30 / SIM_DT));
      };
      const a = run();
      expect(algaeCoverage(a.water.algae)).toBeGreaterThan(0);
      expect(run().water.algae).toEqual(a.water.algae);
    });

    it('graines différentes : vigueurs différentes, donc couvertures différentes', () => {
      const run = (seed: number) => {
        const world = createDefaultWorld(seed) as MutableWorld;
        setWorldLightingInPlace(world, 24);
        return advance(world, Math.round(20 / SIM_DT)).water.algae;
      };
      expect(run(1)).not.toEqual(run(2));
    });

    it('mode décor : les algues sont en pause', () => {
      const world = createDefaultWorld(42) as MutableWorld;
      setWorldLightingInPlace(world, 24);
      world.careMode = 'decor';
      expect(advance(world, 600).water.algae).toBeUndefined();
    });

    it('récif : aucune algue même à 24 h', () => {
      const world = createDefaultWorld(42, 'recif') as MutableWorld;
      setWorldLightingInPlace(world, 24);
      expect(advance(world, 600).water.algae).toBeUndefined();
    });
  });

  describe('sauvegarde', () => {
    it('aller-retour de l’eau : éclairage et algues conservés', () => {
      const water = { ...freshWater('tropical'), lighting: 14, algae: [0.1, 0, 0.5, 1] };
      const read = readWater(JSON.parse(JSON.stringify(water)), 'tropical');
      expect(read).toEqual({ ok: true, water });
    });

    it('eau sans algues : aucun champ ajouté ; algues toutes nulles : retirées', () => {
      const fresh = freshWater('tropical');
      expect(readWater(fresh, 'tropical')).toEqual({ ok: true, water: fresh });
      expect(readWater({ ...fresh, algae: [0, 0] }, 'tropical')).toEqual({
        ok: true,
        water: fresh,
      });
    });

    it('valeurs abîmées : refusées', () => {
      const fresh = freshWater('tropical');
      for (const bad of [
        { lighting: 25 },
        { lighting: 7.5 },
        { lighting: '8' },
        { algae: [1.2] },
        { algae: [-0.1] },
        { algae: 'x' },
        { algae: new Array(ALGAE_PATCH_COUNT + 1).fill(0.1) },
      ]) {
        expect(readWater({ ...fresh, ...bad }, 'tropical').ok).toBe(false);
      }
      expect(readAlgae([Number.NaN]).ok).toBe(false);
    });

    it('copie de l’eau : les algues ne sont pas partagées', () => {
      const water = { ...freshWater('tropical'), algae: [0.5] };
      const copy = copyWater(water);
      (copy.algae as number[])[0] = 0;
      expect(water.algae[0]).toBe(0.5);
    });
  });

  describe('sampleAlgae', () => {
    it('toutes les plaques à la couverture demandée, bornée ; nulle : aucune', () => {
      expect(sampleAlgae(0.7)).toEqual(new Array(ALGAE_PATCH_COUNT).fill(0.7));
      expect(sampleAlgae(3)).toEqual(new Array(ALGAE_PATCH_COUNT).fill(1));
      expect(sampleAlgae(0)).toBeUndefined();
      expect(sampleAlgae(Number.NaN)).toBeUndefined();
      expect(sampleAlgae(-1)).toBeUndefined();
    });
  });
});
