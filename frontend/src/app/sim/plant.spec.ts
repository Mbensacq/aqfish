import { SIM_DT } from './constants';
import {
  DEFAULT_DECOR,
  decorObstacles,
  decorToTank,
  parseDecorItems,
  plantBaseY,
  plantSpheres,
  validateDecorItem,
  type DecorItem,
} from './decor';
import type { Vec3 } from './flocking';
import { obstacleDistance, validateObstacle } from './obstacles';
import {
  PLANT_SWAY_RATIO,
  PLANT_VOXEL_SIZE,
  plantCollision,
  plantModel,
  STRAND_PHASE_STEP,
  type PlantModel,
} from './plant';
import { plantSway } from './plant-sway';
import { SAND_THICKNESS } from './tank';
import { advanceInPlace, createDefaultWorld, type MutableWorld } from './world';

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
const DEFAULT_PLANTS = DEFAULT_DECOR.filter((d) => d.kind === 'plant');

function vec(): Vec3 {
  return { x: 0, y: 0, z: 0 };
}

function keys(model: PlantModel): string[] {
  return model.cells.map((c) => `${c.i},${c.j},${c.k},${c.part},${c.strand},${c.tip}`);
}

describe('DecorItem plante : données validées', () => {
  it('une plante valide passe la validation et survit à un aller-retour JSON', () => {
    expect(validateDecorItem(TALL)).toEqual([]);
    expect(validateDecorItem(TUFT)).toEqual([]);
    expect(parseDecorItems(JSON.parse(JSON.stringify([TALL, TUFT])))).toEqual([TALL, TUFT]);
  });

  it.each([
    ['une plante sans forme', { ...TALL, form: undefined }, /form doit être tall ou tuft/],
    ['une forme inconnue', { ...TALL, form: 'tree' }, /form doit être tall ou tuft/],
    ['une forme sur un rocher', { ...TALL, kind: 'rock' }, /form est réservée aux plantes/],
  ])('refuse %s', (_, value, message) => {
    expect(validateDecorItem(value).join(' ; ')).toMatch(message);
    expect(() => parseDecorItems([value])).toThrow(RangeError);
  });

  it('un rocher copié ne gagne pas de clé form', () => {
    const rock = parseDecorItems([{ kind: 'rock', x: 0, z: 0, rotation: 0, scale: 1, seed: 1 }]);
    expect('form' in rock[0]).toBe(false);
  });

  it('décor par défaut : des plantes des deux formes', () => {
    expect(DEFAULT_PLANTS.filter((p) => p.form === 'tall').length).toBeGreaterThanOrEqual(1);
    expect(DEFAULT_PLANTS.filter((p) => p.form === 'tuft').length).toBeGreaterThanOrEqual(1);
  });
});

describe('plantModel : plantes voxel générées depuis la graine', () => {
  it('même graine, même plante ; autre graine, autre plante', () => {
    for (const form of ['tall', 'tuft'] as const) {
      const a = plantModel(5, 1, form);
      expect(keys(plantModel(5, 1, form))).toEqual(keys(a));
      expect(plantModel(5, 1, form).phase).toBe(a.phase);
      expect(keys(plantModel(6, 1, form))).not.toEqual(keys(a));
    }
  });

  it('deux formes distinctes : longues tiges à feuilles, touffe basse sans tige', () => {
    for (let seed = 0; seed < 20; seed++) {
      const tall = plantModel(seed, 1, 'tall');
      const tuft = plantModel(seed, 1, 'tuft');
      const stems = tall.cells.filter((c) => c.part === 'stem' && c.j === 0);
      expect(stems.length).toBe(tall.strands);
      expect(tall.strands).toBeGreaterThanOrEqual(2);
      expect(tall.strands).toBeLessThanOrEqual(4);
      expect(tall.cells.some((c) => c.part === 'leaf')).toBe(true);
      expect(tall.height).toBeGreaterThanOrEqual(30);
      expect(tuft.cells.every((c) => c.part === 'leaf')).toBe(true);
      expect(tuft.height).toBeLessThanOrEqual(12);
      expect(tuft.height).toBeLessThan(tall.height / 2);
      expect(tuft.strands).toBeGreaterThanOrEqual(6);
    }
  });

  it('voxels triés, sans doublon, au-dessus de la racine ; tiges continues', () => {
    for (const form of ['tall', 'tuft'] as const) {
      const model = plantModel(77, 1.3, form);
      const set = new Set(model.cells.map((c) => `${c.i},${c.j},${c.k}`));
      expect(set.size).toBe(model.cells.length);
      expect(model.cells.every((c) => c.j >= 0 && c.j < model.height)).toBe(true);
      const sorted = [...model.cells].sort((a, b) => a.j - b.j || a.i - b.i || a.k - b.k);
      expect(model.cells).toEqual(sorted);
    }
    const tall = plantModel(77, 1, 'tall');
    for (const base of tall.cells.filter((c) => c.part === 'stem' && c.j === 0)) {
      const column = tall.cells.filter(
        (c) => c.part === 'stem' && c.i === base.i && c.k === base.k,
      );
      expect(column.map((c) => c.j)).toEqual(column.map((_, j) => j));
      expect(column.at(-1)?.tip).toBe(true);
    }
  });

  it('échelle : taille des voxels et amplitude proportionnelles, forme inchangée', () => {
    const a = plantModel(9, 1, 'tall');
    const b = plantModel(9, 2, 'tall');
    expect(keys(b)).toEqual(keys(a));
    expect(a.voxelSize).toBe(PLANT_VOXEL_SIZE);
    expect(b.voxelSize).toBe(2 * PLANT_VOXEL_SIZE);
    expect(a.amplitude).toBeCloseTo(PLANT_SWAY_RATIO * a.height * a.voxelSize, 12);
    expect(b.amplitude).toBeCloseTo(2 * a.amplitude, 12);
  });

  it('phase dans [0, 2π), différente d’une plante à l’autre du décor par défaut', () => {
    const phases = DEFAULT_PLANTS.map((p) => plantModel(p.seed, p.scale, p.form!).phase);
    for (const phase of phases) {
      expect(phase).toBeGreaterThanOrEqual(0);
      expect(phase).toBeLessThan(2 * Math.PI);
    }
    for (let a = 0; a < phases.length; a++) {
      for (let b = a + 1; b < phases.length; b++) {
        // Écart de phase circulaire d'au moins 0,2 rad : jamais à l'unisson.
        const d = Math.abs(phases[a] - phases[b]) % (2 * Math.PI);
        expect(Math.min(d, 2 * Math.PI - d)).toBeGreaterThan(0.2);
      }
    }
  });

  it('deux plantes de phases différentes ne bougent pas à l’unisson', () => {
    const [p, q] = DEFAULT_PLANTS.filter((d) => d.form === 'tall');
    const a = plantModel(p.seed, 1, 'tall');
    const b = plantModel(q.seed, 1, 'tall');
    const oa = { x: 0, z: 0 };
    const ob = { x: 0, z: 0 };
    let apart = 0;
    for (let n = 0; n < 60; n++) {
      plantSway(1, n * 0.25, a.phase, 1, oa);
      plantSway(1, n * 0.25, b.phase, 1, ob);
      if (Math.hypot(oa.x - ob.x, oa.z - ob.z) > 0.1) {
        apart++;
      }
    }
    expect(apart).toBeGreaterThan(30);
    expect(STRAND_PHASE_STEP).toBeGreaterThan(0);
  });

  it.each([
    ['une échelle nulle', 0],
    ['une échelle négative', -1],
    ['une échelle non finie', Infinity],
  ])('refuse %s', (_, scale) => {
    expect(() => plantModel(1, scale, 'tall')).toThrow(RangeError);
  });

  it('refuse une forme inconnue', () => {
    expect(() => plantModel(1, 1, 'tree' as 'tall')).toThrow(/forme de plante inconnue/);
  });
});

describe('forme de collision des plantes', () => {
  it('plantes enracinées : racine sous la surface du sable, d’un voxel', () => {
    for (const p of DEFAULT_PLANTS) {
      const v = plantModel(p.seed, p.scale, p.form!).voxelSize;
      expect(plantBaseY(v)).toBeLessThan(SAND_THICKNESS);
      expect(plantBaseY(v)).toBeCloseTo(SAND_THICKNESS - v, 12);
    }
  });

  it('obstacles valides ; touffe : une petite sphère au collet', () => {
    for (const o of decorObstacles([TALL, TUFT, ...DEFAULT_PLANTS])) {
      expect(validateObstacle(o)).toEqual([]);
    }
    expect(plantSpheres(TUFT).length).toBe(1);
    expect(plantSpheres(TALL).length).toBeGreaterThan(10);
  });

  it.each([TALL, { ...TALL, seed: 4, scale: 1.7, rotation: 4 }, ...DEFAULT_PLANTS])(
    'tige contenue dans sa forme à toute ondulation (plante %#)',
    (item) => {
      const model = plantModel(item.seed, item.scale, item.form!);
      const obstacle = decorObstacles([item])[0];
      const v = model.voxelSize;
      const baseY = plantBaseY(v);
      const p = vec();
      const n = vec();
      for (const c of model.cells.filter((cell) => cell.part === 'stem')) {
        for (let corner = 0; corner < 8; corner++) {
          const ly = (c.j + ((corner >> 1) & 1)) * v;
          decorToTank(
            item,
            baseY,
            (c.i + (corner & 1)) * v,
            ly,
            (c.k + ((corner >> 2) & 1)) * v,
            p,
          );
          // Déplacement maximal (borne de l'ondulation) dans 8 directions.
          const h = Math.min(1, ly / (model.height * v));
          const reach = model.amplitude * h * h;
          for (let d = 0; d < 8; d++) {
            const angle = (d * Math.PI) / 4;
            const x = p.x + Math.cos(angle) * reach;
            const z = p.z + Math.sin(angle) * reach;
            expect(obstacleDistance(obstacle, x, p.y, z, n)).toBeLessThanOrEqual(1e-9);
          }
        }
      }
    },
  );

  it('le feuillage dépasse de la forme : il reste traversable', () => {
    const model = plantModel(TALL.seed, 1, 'tall');
    const obstacle = decorObstacles([TALL])[0];
    const v = model.voxelSize;
    const p = vec();
    const n = vec();
    const outside = model.cells.filter((c) => {
      if (c.part !== 'leaf' || !c.tip) {
        return false;
      }
      decorToTank(TALL, plantBaseY(v), (c.i + 0.5) * v, (c.j + 0.5) * v, (c.k + 0.5) * v, p);
      return obstacleDistance(obstacle, p.x, p.y, p.z, n) > 0;
    });
    expect(outside.length).toBeGreaterThan(0);
  });

  it('les sphères sont fixes : la forme ne dépend que des données', () => {
    expect(plantCollision(plantModel(31, 1, 'tall'))).toEqual(
      plantCollision(plantModel(31, 1, 'tall')),
    );
  });
});

describe('poissons et plantes', () => {
  it.each([1, 42, 0xffffffff])(
    'graine %s, 60 s simulées dans le monde par défaut : aucun poisson dans une tige',
    (seed) => {
      const world = createDefaultWorld(seed) as MutableWorld;
      const plantIds = new Set(
        DEFAULT_DECOR.flatMap((d, i) => (d.kind === 'plant' ? [i] : [])).map(
          (i) => world.obstacles.length - DEFAULT_DECOR.length + i,
        ),
      );
      const stems = world.obstacles.filter((o) => plantIds.has(o.id));
      expect(stems.length).toBe(DEFAULT_PLANTS.length);
      const n = vec();
      let minDistance = Infinity;
      for (let i = 0; i < 60 / SIM_DT; i++) {
        advanceInPlace(world, 1);
        for (const f of world.entities) {
          for (const stem of stems) {
            minDistance = Math.min(minDistance, obstacleDistance(stem, f.x, f.y, f.z, n));
          }
        }
      }
      expect(minDistance).toBeGreaterThanOrEqual(0);
    },
    15_000,
  );
});
