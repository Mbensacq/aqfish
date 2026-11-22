import { describe, expect, it } from 'vitest';

import { iconPixels } from '../pixel-icon/pixel-masks';
import {
  TOOLBAR_ICON_GRID,
  TOOLBAR_ICON_MASKS,
  TOOLBAR_ICON_PIXELS,
  type ToolbarIcon,
} from './toolbar-icons';

const ICONS = Object.keys(TOOLBAR_ICON_MASKS) as ToolbarIcon[];

describe('icônes de la barre du bas (#724)', () => {
  it('grille de 12, comme le demande la charte', () => {
    expect(TOOLBAR_ICON_GRID).toBe(12);
  });

  it.each(ICONS)('%s : 12 lignes de 12 cases, pixels dans la grille', (icon) => {
    const mask = TOOLBAR_ICON_MASKS[icon];
    expect(mask).toHaveLength(12);
    for (const row of mask) {
      expect(row).toMatch(/^[#.]{12}$/);
    }
    const pixels = TOOLBAR_ICON_PIXELS[icon];
    expect(pixels.length).toBe(mask.join('').split('#').length - 1);
    for (const [x, y] of pixels) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(12);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThan(12);
      expect(mask[y]![x]).toBe('#');
    }
  });

  it('quatre formes distinctes, aucune vide ni pleine', () => {
    const shapes = new Set(ICONS.map((icon) => TOOLBAR_ICON_MASKS[icon].join('')));
    expect(shapes.size).toBe(ICONS.length);
    for (const icon of ICONS) {
      const count = TOOLBAR_ICON_PIXELS[icon].length;
      expect(count, icon).toBeGreaterThan(12);
      expect(count, icon).toBeLessThan(144);
    }
  });
});

describe('iconPixels (#724)', () => {
  it('lit les pixels pleins ligne par ligne', () => {
    expect(iconPixels(['#.', '.#'], 2)).toEqual([
      [0, 0],
      [1, 1],
    ]);
  });

  it.each([
    ['trop peu de lignes', ['##']],
    ['ligne trop courte', ['##', '#']],
    ['caractère inconnu', ['#x', '..']],
  ])('refuse un masque mal formé : %s', (_, mask) => {
    expect(() => iconPixels(mask, 2)).toThrow(RangeError);
  });

  it('grille vide : aucun pixel', () => {
    expect(iconPixels([], 0)).toEqual([]);
  });
});
