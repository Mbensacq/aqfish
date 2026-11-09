import { SIM_DT } from './constants';
import { setCareModeInPlace } from './care-mode';
import { DEFAULT_DAY_LENGTH_SECONDS } from './daylight';
import { DEFAULT_DECOR, decorElevation, plantBaseY, type DecorItem } from './decor';
import { setDecorInPlace } from './decor-edit';
import { environmentWater } from './environment';
import { plantModel } from './plant';
import {
  growthOf,
  hasPlantGrowth,
  isGrowingPlant,
  MAX_SAVED_PLANT_GROWTH,
  PLANT_GROWTH_VOXELS_PER_DAY,
  PLANT_PRUNE_KEEP,
  PLANT_SHADE_MAX,
  PLANT_SHADE_PER_PLANT,
  PLANT_SURFACE_MARGIN_VOXELS,
  PLANT_VIGOR_MAX,
  PLANT_VIGOR_MIN,
  plantGrowthAt,
  plantGrowthRate,
  plantLimits,
  plantShade,
  prunedGrowth,
  prunePlantInPlace,
  readPlantGrowth,
  shownGrowth,
  stepPlantGrowthInPlace,
  type MutablePlantGrowth,
} from './plant-growth';
import { parseWorld, serializeWorld } from './save';
import { copyWater, readWater } from './water';
import {
  advanceInPlace,
  changeWorldWaterInPlace,
  createDefaultWorld,
  createWorld,
  pruneWorldPlantInPlace,
  worldPlantShade,
  worldShownPlantGrowth,
  type MutableWorld,
} from './world';

const TALL: DecorItem = {
  kind: 'plant',
  form: 'tall',
  x: 0.1,
  z: -0.1,
  rotation: 1.1,
  scale: 1,
  seed: 31,
};
const TUFT: DecorItem = { ...TALL, form: 'tuft', seed: 32 };
const ROCK: DecorItem = { kind: 'rock', x: 0.3, z: 0, rotation: 0, scale: 1, seed: 33 };
const SURFACE = environmentWater('tropical').maxY;
const DAY = DEFAULT_DAY_LENGTH_SECONDS;

/** Bac tropical au décor par défaut, sans animal : avancé vite sur plusieurs jours. */
function emptyTank(): MutableWorld {
  return createWorld(42, [], [], DEFAULT_DECOR, 'tropical') as MutableWorld;
}

describe('pousse des plantes (#477)', () => {
  describe('rythme et hauteur en fonction du temps simulé', () => {
    it('rythme tiré de la graine, dans les bornes de vigueur', () => {
      const min = (PLANT_GROWTH_VOXELS_PER_DAY * PLANT_VIGOR_MIN) / DAY;
      const max = (PLANT_GROWTH_VOXELS_PER_DAY * PLANT_VIGOR_MAX) / DAY;
      const rates = [1, 2, 3, 101, 204, 303, 2 ** 32 - 1, 2 ** 31 - 1].map(plantGrowthRate);
      for (const r of rates) {
        expect(r).toBeGreaterThanOrEqual(min);
        expect(r).toBeLessThanOrEqual(max);
      }
      expect(new Set(rates).size).toBe(rates.length);
      expect(plantGrowthRate(101)).toBe(plantGrowthRate(101));
    });

    it('hauteur nulle au départ, ou pour un temps négatif', () => {
      expect(plantGrowthAt(101, 0, 20)).toBe(0);
      expect(plantGrowthAt(101, -50, 20)).toBe(0);
    });

    it('croît linéairement avec le temps simulé, puis plafonne', () => {
      const r = plantGrowthRate(101);
      expect(plantGrowthAt(101, 100, 20)).toBeCloseTo(100 * r, 12);
      expect(plantGrowthAt(101, 10 * DAY, 20)).toBe(20);
      expect(plantGrowthAt(101, 10 * DAY, 0)).toBe(0);
      expect(plantGrowthAt(101, 10 * DAY, -3)).toBe(0);
    });

    it('même graine, même pousse ; graines différentes, pousses différentes', () => {
      expect(plantGrowthAt(204, 700, 30)).toBe(plantGrowthAt(204, 700, 30));
      expect(plantGrowthAt(204, 700, 30)).not.toBe(plantGrowthAt(303, 700, 30));
    });

    it('à la seconde de capture (30 s), moins d’un voxel : rendu inchangé', () => {
      for (const seed of [1, 101, 204, 303, 171, 272, 373]) {
        expect(plantGrowthAt(seed, 30, 100)).toBeLessThan(1);
      }
    });
  });

  describe('plafond : la pointe reste sous la surface', () => {
    it('pointe au plafond un voxel sous la surface de l’eau', () => {
      const limits = plantLimits(TALL, SURFACE);
      const model = plantModel(TALL.seed, TALL.scale, 'tall');
      const base = plantBaseY(model.voxelSize) + decorElevation(TALL);
      const top = base + (limits.height + limits.cap) * model.voxelSize;
      expect(limits.height).toBe(model.height);
      expect(limits.cap).toBeGreaterThan(0);
      expect(top).toBeLessThanOrEqual(
        SURFACE - PLANT_SURFACE_MARGIN_VOXELS * model.voxelSize + 1e-9,
      );
      expect(top + model.voxelSize).toBeGreaterThan(
        SURFACE - PLANT_SURFACE_MARGIN_VOXELS * model.voxelSize,
      );
    });

    it('plafond nul si la plante touche déjà la surface (eau basse, plante surélevée)', () => {
      expect(plantLimits(TALL, 0.05).cap).toBe(0);
      expect(plantLimits({ ...TALL, elevation: 0.4 }, SURFACE).cap).toBe(0);
    });

    it('cache par élément, recalculé si la surface change', () => {
      expect(plantLimits(TALL, SURFACE)).toBe(plantLimits(TALL, SURFACE));
      expect(plantLimits(TALL, SURFACE - 0.1).cap).toBeLessThan(plantLimits(TALL, SURFACE).cap);
    });

    it('pousse affichée : partie entière, bornée au plafond', () => {
      const cap = plantLimits(TALL, SURFACE).cap;
      expect(shownGrowth(undefined, TALL, SURFACE)).toBe(0);
      expect(shownGrowth({ '31': 2.9 }, TALL, SURFACE)).toBe(2);
      expect(shownGrowth({ '31': cap + 40 }, TALL, SURFACE)).toBe(cap);
    });
  });

  describe('pas de pousse en place', () => {
    it('seules les plantes à tige poussent ; rien n’est créé sans plante à tige', () => {
      expect(isGrowingPlant(TALL)).toBe(true);
      expect(isGrowingPlant(TUFT)).toBe(false);
      expect(isGrowingPlant(ROCK)).toBe(false);
      expect(stepPlantGrowthInPlace(undefined, [TUFT, ROCK], SIM_DT, SURFACE)).toBeUndefined();
      const growth = stepPlantGrowthInPlace(undefined, [TUFT, TALL, ROCK], SIM_DT, SURFACE);
      expect(Object.keys(growth!)).toEqual(['31']);
    });

    it('pas à pas, égale la fonction du temps, sans dépasser le plafond', () => {
      let growth: MutablePlantGrowth | undefined;
      const steps = Math.round(600 / SIM_DT);
      for (let n = 0; n < steps; n++) {
        growth = stepPlantGrowthInPlace(growth, [TALL], SIM_DT, SURFACE);
      }
      expect(growthOf(growth, 31)).toBeCloseTo(plantGrowthAt(31, 600, 100), 6);
      const cap = plantLimits(TALL, SURFACE).cap;
      for (let n = 0; n < 2000; n++) {
        stepPlantGrowthInPlace(growth, [TALL], 60, SURFACE);
      }
      expect(growthOf(growth, 31)).toBe(cap);
    });

    it('refuse un pas de temps invalide', () => {
      expect(() => stepPlantGrowthInPlace(undefined, [TALL], -1, SURFACE)).toThrow(RangeError);
    });
  });

  describe('taille', () => {
    it('ramène la hauteur totale à la hauteur de repli', () => {
      expect(prunedGrowth(30, 20)).toBe(Math.floor(50 * PLANT_PRUNE_KEEP) - 30);
      expect(prunedGrowth(40, 30)).toBe(16);
    });

    it('jamais sous la hauteur d’origine', () => {
      expect(prunedGrowth(40, 5)).toBe(0);
      expect(prunedGrowth(40, 0)).toBe(0);
      expect(prunedGrowth(40, -3)).toBe(0);
      for (let g = 0; g < 60; g++) {
        expect(prunedGrowth(35, g)).toBeGreaterThanOrEqual(0);
        expect(prunedGrowth(35, g)).toBeLessThanOrEqual(g);
      }
    });

    it('en place : raccourcit, retire une pousse nulle, refuse sans pousse visible', () => {
      const growth: MutablePlantGrowth = { '31': 3.5 };
      expect(prunePlantInPlace(growth, TALL, SURFACE)).toBe(true);
      expect(growth).toEqual({});
      expect(prunePlantInPlace(growth, TALL, SURFACE)).toBe(false);
      expect(prunePlantInPlace(undefined, TALL, SURFACE)).toBe(false);
      expect(prunePlantInPlace({ '32': 9 }, TUFT, SURFACE)).toBe(false);
      expect(prunePlantInPlace({ '31': 0.5 }, TALL, SURFACE)).toBe(false);
    });
  });

  describe('ombre du fond', () => {
    it('exactement 1 sans pousse, ou sans plante au plafond', () => {
      expect(plantShade(undefined, DEFAULT_DECOR, SURFACE)).toBe(1);
      expect(plantShade({ '101': 1 }, DEFAULT_DECOR, SURFACE)).toBe(1);
    });

    it('chaque plante au plafond retire un peu de lumière, borné', () => {
      const one: MutablePlantGrowth = { '31': plantLimits(TALL, SURFACE).cap };
      expect(plantShade(one, [TALL], SURFACE)).toBeCloseTo(1 - PLANT_SHADE_PER_PLANT, 12);
      const many = Array.from({ length: 6 }, (_, n) => ({ ...TALL, seed: 40 + n }));
      const full: MutablePlantGrowth = {};
      for (const item of many) {
        full[String(item.seed)] = 1000;
      }
      expect(plantShade(full, many, SURFACE)).toBeCloseTo(1 - PLANT_SHADE_MAX, 12);
    });
  });

  describe('lecture d’une sauvegarde', () => {
    it('accepte des graines et des pousses bornées, omet les pousses nulles', () => {
      expect(readPlantGrowth({ '101': 2.5, '7': 0, '204': MAX_SAVED_PLANT_GROWTH })).toEqual({
        ok: true,
        growth: { '101': 2.5, '204': MAX_SAVED_PLANT_GROWTH },
      });
    });

    it.each([
      ['une liste', [1, 2]],
      ['null', null],
      ['un nombre', 3],
      ['une clé non numérique', { abc: 1 }],
      ['une graine négative', { '-1': 1 }],
      ['une pousse négative', { '1': -1 }],
      ['une pousse trop grande', { '1': MAX_SAVED_PLANT_GROWTH + 1 }],
      ['une pousse non finie', { '1': Number.NaN }],
      ['une pousse texte', { '1': '2' }],
    ])('refuse %s', (_, value) => {
      expect(readPlantGrowth(value).ok).toBe(false);
    });
  });

  describe('dans le monde', () => {
    it('bacs d’eau douce vitrés seulement', () => {
      expect(hasPlantGrowth('tropical')).toBe(true);
      expect(hasPlantGrowth('eaufroide')).toBe(true);
      expect(hasPlantGrowth('bassin')).toBe(false);
      expect(hasPlantGrowth('recif')).toBe(false);
    });

    it('le bac par défaut pousse avec le temps simulé, comme la fonction du temps', () => {
      const world = emptyTank();
      expect(world.water.plantGrowth).toBeUndefined();
      advanceInPlace(world, Math.round(DAY / SIM_DT));
      const tall = DEFAULT_DECOR.filter(isGrowingPlant);
      for (const item of tall) {
        const cap = plantLimits(item, SURFACE).cap;
        expect(growthOf(world.water.plantGrowth, item.seed)).toBeCloseTo(
          plantGrowthAt(item.seed, DAY, cap),
          6,
        );
      }
      expect(Object.keys(world.water.plantGrowth!).sort()).toEqual(
        tall.map((d) => String(d.seed)).sort(),
      );
      const shown = DEFAULT_DECOR.map((_, n) => worldShownPlantGrowth(world, n));
      expect(shown.some((g) => g > 0)).toBe(true);
      expect(shown.filter((_, n) => !isGrowingPlant(DEFAULT_DECOR[n])).every((g) => g === 0)).toBe(
        true,
      );
    });

    it('à 30 s, la pousse affichée du bac par défaut est nulle (captures inchangées)', () => {
      const world = createDefaultWorld(42) as MutableWorld;
      advanceInPlace(world, Math.round(30 / SIM_DT));
      expect(
        DEFAULT_DECOR.map((_, n) => worldShownPlantGrowth(world, n)).every((g) => g === 0),
      ).toBe(true);
      expect(worldPlantShade(world)).toBe(1);
    });

    it('en mode décor, la pousse est en pause', () => {
      const world = emptyTank();
      setCareModeInPlace(world, 'decor');
      advanceInPlace(world, Math.round(600 / SIM_DT));
      expect(world.water.plantGrowth).toBeUndefined();
    });

    it('le bassin et le récif ne poussent pas', () => {
      for (const env of ['bassin', 'recif'] as const) {
        const world = createDefaultWorld(42, env) as MutableWorld;
        advanceInPlace(world, Math.round(120 / SIM_DT));
        expect(world.water.plantGrowth).toBeUndefined();
        expect(worldPlantShade(world)).toBe(1);
        expect(pruneWorldPlantInPlace(world, 0)).toBe(false);
      }
    }, 30_000);

    it('taille d’une plante du monde ; le changement d’eau n’y touche pas', () => {
      const world = emptyTank();
      advanceInPlace(world, Math.round((3 * DAY) / SIM_DT));
      const index = DEFAULT_DECOR.findIndex(isGrowingPlant);
      const before = worldShownPlantGrowth(world, index);
      expect(before).toBeGreaterThan(0);
      changeWorldWaterInPlace(world);
      expect(worldShownPlantGrowth(world, index)).toBe(before);
      expect(pruneWorldPlantInPlace(world, index)).toBe(true);
      expect(worldShownPlantGrowth(world, index)).toBeLessThan(before);
      expect(
        pruneWorldPlantInPlace(
          world,
          DEFAULT_DECOR.findIndex((d) => d.kind === 'rock'),
        ),
      ).toBe(false);
      expect(pruneWorldPlantInPlace(world, 999)).toBe(false);
    });

    it('au plafond, les plantes hautes assombrissent un peu le fond', () => {
      const world = createDefaultWorld(42) as MutableWorld;
      const growth: MutablePlantGrowth = {};
      for (const item of DEFAULT_DECOR.filter(isGrowingPlant)) {
        growth[String(item.seed)] = plantLimits(item, SURFACE).cap;
      }
      world.water = { ...world.water, plantGrowth: growth };
      expect(worldPlantShade(world)).toBeCloseTo(1 - 3 * PLANT_SHADE_PER_PLANT, 12);
    });

    it('une plante retirée du décor ne compte plus, sa pousse est ignorée', () => {
      const world = createDefaultWorld(42) as MutableWorld;
      world.water = { ...world.water, plantGrowth: { '101': 1000 } };
      setDecorInPlace(
        world,
        world.decor.filter((d) => d.seed !== 101),
      );
      expect(worldPlantShade(world)).toBe(1);
    });
  });

  describe('sauvegarde', () => {
    it('aller-retour de la pousse, par l’eau et par la sauvegarde complète', () => {
      const world = emptyTank();
      advanceInPlace(world, Math.round((2 * DAY) / SIM_DT));
      const growth = world.water.plantGrowth!;
      const copy = copyWater(world.water);
      expect(copy.plantGrowth).toEqual(growth);
      expect(copy.plantGrowth).not.toBe(growth);
      const read = readWater(JSON.parse(JSON.stringify(world.water)), 'tropical');
      expect(read.ok && read.water.plantGrowth).toEqual(growth);
      const loaded = parseWorld(serializeWorld(world));
      expect(loaded.ok).toBe(true);
      const restored = loaded.ok ? loaded.world : null;
      expect(restored?.water.plantGrowth).toEqual(growth);
      expect(DEFAULT_DECOR.map((_, n) => worldShownPlantGrowth(restored!, n))).toEqual(
        DEFAULT_DECOR.map((_, n) => worldShownPlantGrowth(world, n)),
      );
    });

    it('ancienne sauvegarde sans pousse : plantes à leur hauteur d’origine', () => {
      const world = createDefaultWorld(42);
      const text = serializeWorld(world);
      expect(text).not.toContain('plantGrowth');
      const loaded = parseWorld(text);
      expect(loaded.ok && loaded.world.water.plantGrowth).toBeUndefined();
    });

    it('refuse une pousse invalide dans l’eau', () => {
      const water = { ...createDefaultWorld(42).water, plantGrowth: { '101': -2 } };
      expect(readWater(JSON.parse(JSON.stringify(water)), 'tropical').ok).toBe(false);
    });
  });
});
