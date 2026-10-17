import { PALETTE, PALETTE_COLORS } from './palette';
import { colorDistanceSq, hexToRgb } from './pixel-art';

describe('PALETTE', () => {
  const names = Object.keys(PALETTE);

  it('déclare entre 32 et 48 couleurs', () => {
    expect(names.length).toBeGreaterThanOrEqual(32);
    expect(names.length).toBeLessThanOrEqual(48);
    expect(PALETTE_COLORS.length).toBe(names.length);
  });

  it('a des noms uniques en camelCase', () => {
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) {
      expect(name).toMatch(/^[a-z][a-zA-Z]*$/);
    }
  });

  it('ne contient que des couleurs #rrggbb valides', () => {
    for (const hex of PALETTE_COLORS) {
      expect(hex).toMatch(/^#[0-9a-f]{6}$/);
      expect(() => hexToRgb(hex)).not.toThrow();
    }
  });

  it('a des couleurs distinctes, assez éloignées pour être discernées', () => {
    expect(new Set(PALETTE_COLORS).size).toBe(PALETTE_COLORS.length);
    const rgb = PALETTE_COLORS.map(hexToRgb);
    // Distance minimale : environ 8 niveaux sur 255 par composante.
    const minDistanceSq = 3 * (8 / 255) ** 2;
    for (let i = 0; i < rgb.length; i++) {
      for (let j = i + 1; j < rgb.length; j++) {
        expect(colorDistanceSq(rgb[i], rgb[j]), `${names[i]} / ${names[j]}`).toBeGreaterThan(
          minDistanceSq,
        );
      }
    }
  });

  it('reprend la palette de départ de docs/DA.md', () => {
    const fromDa = [
      '#0d3b3f', '#1b5e5a', '#2e8b7a', '#5fbfa3', '#a8e6cf',
      '#e3cf9e', '#c9b38a', '#a8916a', '#6e6a63', '#45423e',
      '#163d22', '#1f4d2b', '#2f6b3a', '#4e9a4a', '#8fd16a',
      '#d94a3a', '#f2ead8', '#1c1c22', '#f08a2c', '#f2c14e',
      '#3fa9f5', '#e63946', '#ffd166', '#f4978e',
      '#f7b2bd', '#7bc950', '#e07a2f',
      '#f06a9b', '#ffb703',
      '#141418', '#e8e6e3',
    ]; // prettier-ignore
    for (const hex of fromDa) {
      expect(PALETTE_COLORS).toContain(hex);
    }
  });

  it('garde les entrées utilisées par la scène', () => {
    expect(PALETTE.fondScene).toBe('#141418');
    expect(PALETTE.eauMoyenne).toBe('#2e8b7a');
    expect(PALETTE.sableClair).toBe('#e3cf9e');
  });
});
