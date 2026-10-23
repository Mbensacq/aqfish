import { Color } from 'three';

import { anemoneModel, COLUMN_HEIGHT, TENTACLE_PHASE_STEP } from '../sim/anemones';
import { CORAL_COLORS } from './coral-model';
import { ANEMONE_COLORS, anemoneFaceColor, buildAnemoneMesh } from './anemone-model';
import { PALETTE_COLORS } from './palette';

describe('anémone (#150) : maillage et couleurs', () => {
  it('couleurs de la palette commune, aucune partagée avec les coraux', () => {
    const coral = Object.values(CORAL_COLORS).flatMap((c) => [c.side, c.top]);
    for (const hex of Object.values(ANEMONE_COLORS)) {
      expect(PALETTE_COLORS).toContain(hex);
    }
    for (const hex of [ANEMONE_COLORS.tentacle, ANEMONE_COLORS.tip]) {
      expect(coral).not.toContain(hex);
    }
    const base = { i: 0, j: 0, k: 0, strand: 0 };
    expect(anemoneFaceColor({ ...base, part: 'column', tip: false })).toBe(ANEMONE_COLORS.column);
    expect(anemoneFaceColor({ ...base, part: 'tentacle', tip: false })).toBe(
      ANEMONE_COLORS.tentacle,
    );
    expect(anemoneFaceColor({ ...base, part: 'tentacle', tip: true })).toBe(ANEMONE_COLORS.tip);
  });

  it('hauteurs d’ondulation nulles sur le pied, phases propres à chaque tentacule', () => {
    const model = anemoneModel(11, 1.3);
    const mesh = buildAnemoneMesh(model);
    const count = mesh.positions.length / 3;
    expect(mesh.heights.length).toBe(count);
    expect(mesh.rest).toEqual(mesh.positions);
    const c = new Color();
    let tips = 0;
    for (let n = 0; n < count; n++) {
      const cell = model.cells[mesh.vertexCells[n]];
      const y = mesh.positions[3 * n + 1];
      if (cell.part === 'column' || y <= COLUMN_HEIGHT * model.voxelSize + 1e-9) {
        expect(mesh.heights[n]).toBe(0);
      } else {
        expect(mesh.heights[n]).toBeGreaterThan(0);
      }
      expect(mesh.phases[n]).toBeCloseTo(model.phase + TENTACLE_PHASE_STEP * cell.strand, 5);
      const hex = `#${c.setRGB(mesh.colors[3 * n], mesh.colors[3 * n + 1], mesh.colors[3 * n + 2]).getHexString()}`;
      if (hex === ANEMONE_COLORS.tip) {
        tips += 1;
      }
    }
    expect(tips).toBeGreaterThan(0);
  });
});
