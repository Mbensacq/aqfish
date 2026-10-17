import {
  colorDistanceSq,
  flattenPalette,
  hexToRgb,
  linearToSrgb,
  lowResolutionSize,
  nearestPaletteColor,
  nearestPaletteIndex,
  PIXEL_SIZE,
  type Rgb,
} from './pixel-art';

describe('PIXEL_SIZE', () => {
  it('vaut 3 ou 4 pixels d’affichage par pixel de scène', () => {
    expect([3, 4]).toContain(PIXEL_SIZE);
  });
});

describe('lowResolutionSize', () => {
  it('divise une taille multiple de la taille de pixel', () => {
    expect(lowResolutionSize(1200, 900, 3)).toEqual({ width: 400, height: 300 });
  });

  it('arrondit au supérieur pour couvrir toute la surface', () => {
    expect(lowResolutionSize(1280, 721, 3)).toEqual({ width: 427, height: 241 });
    expect(lowResolutionSize(1001, 1000, 4)).toEqual({ width: 251, height: 250 });
  });

  it('accepte des tailles fractionnaires', () => {
    expect(lowResolutionSize(10.5, 2.2, 3)).toEqual({ width: 4, height: 1 });
  });

  it('garde une taille minimale de 1 × 1', () => {
    expect(lowResolutionSize(1, 2, 3)).toEqual({ width: 1, height: 1 });
    expect(lowResolutionSize(0, 0, 3)).toEqual({ width: 1, height: 1 });
    expect(lowResolutionSize(-50, 600, 3)).toEqual({ width: 1, height: 200 });
    expect(lowResolutionSize(Number.NaN, Number.POSITIVE_INFINITY, 3)).toEqual({
      width: 1,
      height: 1,
    });
  });

  it('utilise PIXEL_SIZE par défaut', () => {
    expect(lowResolutionSize(PIXEL_SIZE * 100, PIXEL_SIZE * 50)).toEqual({
      width: 100,
      height: 50,
    });
  });

  it('traite une taille de pixel invalide comme 1', () => {
    expect(lowResolutionSize(10, 20, 0)).toEqual({ width: 10, height: 20 });
    expect(lowResolutionSize(10, 20, Number.NaN)).toEqual({ width: 10, height: 20 });
  });
});

describe('hexToRgb', () => {
  it('convertit #rrggbb en composantes normalisées', () => {
    expect(hexToRgb('#000000')).toEqual([0, 0, 0]);
    expect(hexToRgb('#ffffff')).toEqual([1, 1, 1]);
    expect(hexToRgb('#FF8000')).toEqual([1, 128 / 255, 0]);
  });

  it('refuse les formats invalides', () => {
    for (const bad of ['', '#fff', 'ffffff', '#gggggg', '#1234567', 'rouge']) {
      expect(() => hexToRgb(bad)).toThrow(/Couleur invalide/);
    }
  });
});

describe('linearToSrgb', () => {
  it('respecte les bornes et la partie linéaire', () => {
    expect(linearToSrgb(0)).toBe(0);
    expect(linearToSrgb(1)).toBeCloseTo(1, 10);
    expect(linearToSrgb(0.002)).toBeCloseTo(0.002 * 12.92, 10);
  });

  it('borne les valeurs hors de [0, 1]', () => {
    expect(linearToSrgb(-0.5)).toBe(0);
    expect(linearToSrgb(3)).toBeCloseTo(1, 10);
  });

  it('suit la courbe sRGB standard (gris moyen)', () => {
    // 0,214 linéaire ≈ 0,5 sRGB.
    expect(linearToSrgb(0.214)).toBeCloseTo(0.5, 2);
  });

  it('est continue au point de raccord', () => {
    expect(linearToSrgb(0.0031308)).toBeCloseTo(linearToSrgb(0.0031309), 5);
  });
});

describe('nearestPaletteIndex', () => {
  const black: Rgb = [0, 0, 0];
  const white: Rgb = [1, 1, 1];
  const red: Rgb = [1, 0, 0];
  const darkGrey: Rgb = [0.2, 0.2, 0.2];
  const palette: Rgb[] = [darkGrey, red, [0.9, 0.9, 0.85]];

  it('renvoie la couleur elle-même quand elle est dans la palette', () => {
    palette.forEach((c, i) => expect(nearestPaletteIndex(c, palette)).toBe(i));
  });

  it('ramène le noir à la couleur la plus sombre et le blanc à la plus claire', () => {
    expect(nearestPaletteIndex(black, palette)).toBe(0);
    expect(nearestPaletteIndex(white, palette)).toBe(2);
  });

  it('à mi-chemin exact, la première couleur déclarée l’emporte', () => {
    const pair: Rgb[] = [black, white];
    expect(nearestPaletteIndex([0.5, 0.5, 0.5], pair)).toBe(0);
    expect(nearestPaletteIndex([0.5, 0.5, 0.5], [white, black])).toBe(0);
  });

  it('juste après le mi-chemin, la couleur la plus proche l’emporte', () => {
    expect(nearestPaletteIndex([0.51, 0.5, 0.5], [black, white])).toBe(1);
    expect(nearestPaletteIndex([0.49, 0.5, 0.5], [black, white])).toBe(0);
  });

  it('fonctionne avec une palette d’une seule couleur', () => {
    expect(nearestPaletteIndex(white, [red])).toBe(0);
  });

  it('refuse une palette vide', () => {
    expect(() => nearestPaletteIndex(white, [])).toThrow(/Palette vide/);
  });

  it('nearestPaletteColor renvoie la couleur correspondante', () => {
    expect(nearestPaletteColor([0.8, 0.1, 0.1], palette)).toBe(red);
  });
});

describe('colorDistanceSq', () => {
  it('est nulle pour deux couleurs identiques et symétrique', () => {
    expect(colorDistanceSq([0.1, 0.2, 0.3], [0.1, 0.2, 0.3])).toBe(0);
    expect(colorDistanceSq([0, 0, 0], [1, 1, 1])).toBe(3);
    expect(colorDistanceSq([1, 0, 0], [0, 1, 0])).toBe(colorDistanceSq([0, 1, 0], [1, 0, 0]));
  });
});

describe('flattenPalette', () => {
  it('met les couleurs à plat dans l’ordre', () => {
    expect(
      Array.from(
        flattenPalette([
          [1, 0, 0],
          [0, 0.5, 1],
        ]),
      ),
    ).toEqual([1, 0, 0, 0, 0.5, 1]);
    expect(flattenPalette([]).length).toBe(0);
  });
});
