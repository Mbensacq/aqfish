import { contrastRatio, fadedContrast, luminance, over, parseHex } from './contrast';

describe('contraste (#256)', () => {
  it('parseHex : #rrggbb, sinon erreur', () => {
    expect(parseHex('#141418')).toEqual([20, 20, 24]);
    expect(parseHex('#FFFFFF')).toEqual([255, 255, 255]);
    expect(() => parseHex('#fff')).toThrow(/#rrggbb/);
    expect(() => parseHex('rouge')).toThrow();
  });

  it('valeurs de référence WCAG : noir sur blanc 21:1, identiques 1:1', () => {
    expect(luminance([255, 255, 255])).toBeCloseTo(1, 6);
    expect(luminance([0, 0, 0])).toBe(0);
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 6);
    expect(contrastRatio([255, 255, 255], [0, 0, 0])).toBeCloseTo(21, 6);
    expect(contrastRatio([90, 90, 90], [90, 90, 90])).toBe(1);
    // #767676 sur blanc : 4,54:1, valeur de référence courante.
    expect(contrastRatio(parseHex('#767676'), [255, 255, 255])).toBeCloseTo(4.54, 2);
  });

  it('over : mélange, opacité bornée', () => {
    expect(over([255, 0, 0], 0.5, [0, 0, 255])).toEqual([127.5, 0, 127.5]);
    expect(over([255, 0, 0], 2, [0, 0, 0])).toEqual([255, 0, 0]);
    expect(over([255, 0, 0], -1, [0, 0, 0])).toEqual([0, 0, 0]);
  });

  it('fadedContrast : estomper le groupe réduit le contraste, jusqu’à 1:1', () => {
    const base = {
      text: [232, 230, 227] as const,
      background: [20, 20, 24] as const,
      backgroundAlpha: 0.88,
      scene: [255, 255, 255] as const,
    };
    const full = fadedContrast({ ...base, groupOpacity: 1 });
    const faded = fadedContrast({ ...base, groupOpacity: 0.5 });
    expect(full).toBeGreaterThan(faded);
    expect(fadedContrast({ ...base, groupOpacity: 0 })).toBe(1);
  });
});
