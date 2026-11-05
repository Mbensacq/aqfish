import { woodModel } from '../sim/wood';
import { PALETTE } from './palette';
import { ROCK_COLORS } from './rock-model';
import { buildWoodMesh, KNOT_SHARE, WOOD_COLORS, woodFaceColor } from './wood-model';

describe('buildWoodMesh : bois flotté en voxels', () => {
  const model = woodModel(7, 1);

  it('tons bruns de la palette, aucun gris de rocher ; roche sombre au seul contact (#180)', () => {
    expect(Object.values(WOOD_COLORS)).toEqual([
      PALETTE.sableClair,
      PALETTE.sableSombre,
      PALETTE.sableOmbre,
      PALETTE.rocheSombre,
    ]);
    expect(Object.values(WOOD_COLORS)).not.toContain(ROCK_COLORS.top);
    for (const cell of model.cells) {
      if (cell.j > 0) {
        expect(woodFaceColor(7, cell, false)).not.toBe(PALETTE.rocheSombre);
      }
    }
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

  it('nœuds (#180) : une part des flancs proche de KNOT_SHARE, sur plusieurs graines', () => {
    let knots = 0;
    let sides = 0;
    for (const seed of [1, 7, 42, 1234]) {
      for (const cell of woodModel(seed, 1).cells) {
        if (cell.j > 0) {
          sides++;
          knots += woodFaceColor(seed, cell, false) === WOOD_COLORS.knot ? 1 : 0;
        }
      }
    }
    expect(sides).toBeGreaterThan(50);
    expect(knots / sides).toBeGreaterThan(KNOT_SHARE / 2);
    expect(knots / sides).toBeLessThan(KNOT_SHARE * 2);
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
