import { woodModel } from '../sim/wood';
import { PALETTE } from './palette';
import { ROCK_COLORS } from './rock-model';
import { buildWoodMesh, WOOD_COLORS, woodFaceColor } from './wood-model';

describe('buildWoodMesh : bois flotté en voxels', () => {
  const model = woodModel(7, 1);

  it('trois tons bruns de la palette, aucun gris de rocher', () => {
    expect(Object.values(WOOD_COLORS)).toEqual([
      PALETTE.sableSombre,
      PALETTE.sableOmbre,
      PALETTE.rocheSombre,
    ]);
    expect(Object.values(WOOD_COLORS)).not.toContain(ROCK_COLORS.top);
    const used = new Set<string>();
    for (const cell of model.cells) {
      used.add(woodFaceColor(7, cell, true));
      used.add(woodFaceColor(7, cell, false));
    }
    expect(used).toEqual(new Set(Object.values(WOOD_COLORS)));
  });

  it('dessus clair ; rangée posée sur le sable dans le ton d’ombre', () => {
    for (const cell of model.cells) {
      expect(woodFaceColor(7, cell, true)).toBe(WOOD_COLORS.top);
      if (cell.j === 0) {
        expect(woodFaceColor(7, cell, false)).toBe(WOOD_COLORS.shade);
      }
    }
  });

  // Délai explicite (#244, docs/PIEGES.md) : ≈ 0,4 s en local, bien plus en CI lente.
  it('même graine, même maillage ; faces cachées omises, dessous enterré omis', () => {
    const a = buildWoodMesh(model, 7);
    expect(buildWoodMesh(model, 7)).toEqual(a);
    expect(a.quads).toBeGreaterThan(0);
    // Au plus 6 faces par voxel, moins les faces partagées entre voxels voisins.
    expect(a.quads).toBeLessThan(model.cells.length * 6);
    expect(a.positions.length).toBe(a.quads * 6 * 3);
    // Aucun sommet sous la base (Y = 0).
    for (let n = 1; n < a.positions.length; n += 3) {
      expect(a.positions[n]).toBeGreaterThanOrEqual(0);
    }
  }, 15_000);
});
