import { decorToTank, type DecorItem } from '../sim/decor';
import { plantModel, STRAND_PHASE_STEP } from '../sim/plant';
import { plantSway } from '../sim/plant-sway';
import { PALETTE, PALETTE_COLORS } from './palette';
import { applyPlantSway, buildPlantMesh, plantFaceColor } from './plant-model';

describe('buildPlantMesh', () => {
  for (const form of ['tall', 'tuft'] as const) {
    it(`${form} : couleurs de végétation de la palette, hauteurs et phases par sommet`, () => {
      const model = plantModel(12, 1, form);
      const mesh = buildPlantMesh(model, 12);
      const count = mesh.positions.length / 3;
      expect(count).toBe(mesh.quads * 6);
      expect(mesh.heights.length).toBe(count);
      expect(mesh.phases.length).toBe(count);
      expect(mesh.rest).toEqual(mesh.positions);
      expect(mesh.rest).not.toBe(mesh.positions);
      const top = model.height * model.voxelSize;
      for (let n = 0; n < count; n++) {
        expect(mesh.heights[n]).toBeCloseTo(mesh.positions[3 * n + 1] / top, 6);
        const strand = model.cells[mesh.vertexCells[n]].strand;
        expect(mesh.phases[n]).toBeCloseTo(model.phase + STRAND_PHASE_STEP * strand, 5);
      }
      expect(Math.min(...mesh.heights)).toBe(0);
      expect(Math.max(...mesh.heights)).toBeCloseTo(1, 6);
    });
  }

  it('toutes les couleurs de face viennent de la végétation de la palette', () => {
    const vegetation = [
      PALETTE.vegetationOmbre,
      PALETTE.vegetationSombre,
      PALETTE.vegetation,
      PALETTE.vegetationClaire,
      PALETTE.vegetationLumineuse,
    ];
    for (const form of ['tall', 'tuft'] as const) {
      const model = plantModel(3, 1, form);
      for (const cell of model.cells) {
        for (const up of [false, true]) {
          const color = plantFaceColor(3, cell, up);
          expect(vegetation).toContain(color);
          expect(PALETTE_COLORS).toContain(color);
        }
      }
    }
  });

  it('collet sombre, bouts de feuilles lumineux', () => {
    const leafTip = { i: 2, j: 10, k: 0, part: 'leaf', strand: 0, tip: true } as const;
    const collar = { ...leafTip, j: 1, tip: false };
    expect(plantFaceColor(1, collar, true)).toBe(PALETTE.vegetationOmbre);
    expect(plantFaceColor(1, leafTip, true)).toBe(PALETTE.vegetationLumineuse);
    expect(plantFaceColor(1, { ...leafTip, part: 'stem' }, false)).toBe(PALETTE.vegetationClaire);
  });
});

describe('applyPlantSway', () => {
  const ITEM: DecorItem = {
    kind: 'plant',
    form: 'tall',
    x: 0.2,
    z: -0.1,
    rotation: 2.3,
    scale: 1,
    seed: 8,
  };

  it('déplacement local qui, une fois tourné, donne plantSway dans le repère du bac', () => {
    const model = plantModel(ITEM.seed, ITEM.scale, 'tall');
    const mesh = buildPlantMesh(model, ITEM.seed);
    const out = new Float32Array(mesh.positions.length);
    const time = 7.3;
    applyPlantSway(mesh, model.amplitude, ITEM.rotation, time, out);
    const rest = { x: 0, y: 0, z: 0 };
    const moved = { x: 0, y: 0, z: 0 };
    const expected = { x: 0, z: 0 };
    for (let n = 0; n < mesh.heights.length; n += 7) {
      const p = 3 * n;
      decorToTank(ITEM, 0, mesh.rest[p], mesh.rest[p + 1], mesh.rest[p + 2], rest);
      decorToTank(ITEM, 0, out[p], out[p + 1], out[p + 2], moved);
      plantSway(mesh.heights[n], time, mesh.phases[n], model.amplitude, expected);
      expect(moved.x - rest.x).toBeCloseTo(expected.x, 6);
      expect(moved.z - rest.z).toBeCloseTo(expected.z, 6);
      expect(out[p + 1]).toBe(mesh.rest[p + 1]);
    }
  });

  it('racine immobile ; même temps, même pose ; temps différents, poses différentes', () => {
    const model = plantModel(ITEM.seed, ITEM.scale, 'tall');
    const mesh = buildPlantMesh(model, ITEM.seed);
    const a = new Float32Array(mesh.positions.length);
    const b = new Float32Array(mesh.positions.length);
    applyPlantSway(mesh, model.amplitude, ITEM.rotation, 3, a);
    applyPlantSway(mesh, model.amplitude, ITEM.rotation, 3, b);
    expect(b).toEqual(a);
    applyPlantSway(mesh, model.amplitude, ITEM.rotation, 4, b);
    expect(b).not.toEqual(a);
    for (let n = 0; n < mesh.heights.length; n++) {
      if (mesh.heights[n] === 0) {
        expect(a[3 * n]).toBe(mesh.rest[3 * n]);
        expect(a[3 * n + 2]).toBe(mesh.rest[3 * n + 2]);
      }
    }
  });
});
