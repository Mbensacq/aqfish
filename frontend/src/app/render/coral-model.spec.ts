import { Color } from 'three';

import { CORAL_FORMS, CORAL_HUES, coralModel, type CoralCell } from '../sim/corals';
import { REEF } from '../sim/environment';
import { buildCoralMesh, CORAL_COLORS, coralFaceColor } from './coral-model';
import { ENVIRONMENT_TONES, PALETTE_COLORS } from './palette';

/** Couleurs (`#rrggbb`) des sommets d'un maillage. */
function vertexHexes(colors: Float32Array): Set<string> {
  const out = new Set<string>();
  const c = new Color();
  for (let n = 0; n < colors.length; n += 3) {
    out.add(`#${c.setRGB(colors[n], colors[n + 1], colors[n + 2]).getHexString()}`);
  }
  return out;
}

describe('couleurs des coraux (#149)', () => {
  it('quatre teintes distinctes, chacune en deux couleurs de la palette ou des tons du récif', () => {
    const allowed = [
      ...PALETTE_COLORS,
      ...REEF.tones.map((t) => ENVIRONMENT_TONES[t as keyof typeof ENVIRONMENT_TONES]),
    ];
    const all = CORAL_HUES.flatMap((hue) => [CORAL_COLORS[hue].side, CORAL_COLORS[hue].top]);
    expect(new Set(all).size).toBe(2 * CORAL_HUES.length);
    for (const hex of all) {
      expect(allowed).toContain(hex);
    }
    // Le violet est un ton du récif : absent de la palette commune.
    expect(PALETTE_COLORS).not.toContain(CORAL_COLORS.violet.side);
    expect(REEF.tones).toContain('corailViolet');
    expect(REEF.tones).toContain('corailVioletClair');
  });

  it('flancs foncés, dessus et bouts clairs ; rebord de table foncé ; polypes des dômes', () => {
    const cell = (j: number, tip = false): CoralCell => ({ i: 0, j, k: 0, tip });
    const table = coralModel('table', 3, 1);
    const { side, top } = CORAL_COLORS.rose;
    expect(coralFaceColor('branchu', 'rose', table, 1, cell(2), false)).toBe(side);
    expect(coralFaceColor('branchu', 'rose', table, 1, cell(2), true)).toBe(top);
    expect(coralFaceColor('branchu', 'rose', table, 1, cell(2, true), false)).toBe(top);
    expect(coralFaceColor('table', 'rose', table, 1, cell(table.maxJ - 1), true)).toBe(side);
    expect(coralFaceColor('table', 'rose', table, 1, cell(table.maxJ - 2), true)).toBe(top);
    const dome = coralModel('dome', 3, 1);
    const tops = dome.cells.map((c) => coralFaceColor('dome', 'jaune', dome, 3, c, true));
    const speckled = tops.filter((hex) => hex === CORAL_COLORS.jaune.side).length;
    expect(speckled).toBeGreaterThan(0);
    expect(speckled).toBeLessThan(tops.length / 2);
  });

  // Délai explicite (#244, docs/PIEGES.md) : ≈ 0,5 s en local, bien plus en CI lente.
  it.each(CORAL_FORMS)(
    '%s : maillage aux seules couleurs de sa teinte, déterministe',
    (form) => {
      const model = coralModel(form, 11, 1.2);
      for (const hue of CORAL_HUES) {
        const mesh = buildCoralMesh(form, model, hue, 11);
        expect(mesh.quads).toBeGreaterThan(0);
        expect(vertexHexes(mesh.colors)).toEqual(
          new Set([CORAL_COLORS[hue].side, CORAL_COLORS[hue].top]),
        );
        expect(buildCoralMesh(form, model, hue, 11)).toEqual(mesh);
      }
    },
    15_000,
  );
});
