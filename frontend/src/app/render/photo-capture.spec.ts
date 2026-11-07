import {
  PHOTO_MAX_FACTOR,
  PHOTO_MAX_SIDE,
  photoFileName,
  photoScale,
  upscalePhoto,
  type PhotoPixels,
} from './photo-capture';

/** Cible de 2 × 2 : bas gauche rouge, bas droite vert, haut gauche bleu, haut droite blanc. */
function quad(): PhotoPixels {
  // Ordre WebGL : première ligne = bas de l'image.
  return {
    width: 2,
    height: 2,
    data: new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255]),
  };
}

function pixelAt(image: { width: number; data: Uint8ClampedArray }, x: number, y: number) {
  const i = (y * image.width + x) * 4;
  return Array.from(image.data.slice(i, i + 4));
}

describe('photoScale (#479)', () => {
  it('donne le plus grand entier qui garde le côté long sous la limite', () => {
    expect(photoScale(640, 360)).toBe(3); // 1920 ≤ 2048 < 2560
    expect(photoScale(427, 240)).toBe(4); // 1708 ≤ 2048
    expect(photoScale(360, 640)).toBe(3); // portrait : même règle sur la hauteur
    expect(photoScale(1024, 1)).toBe(2);
  });

  it('renvoie toujours un entier', () => {
    for (const [w, h] of [
      [333, 187],
      [641, 359],
      [97, 1000],
    ]) {
      expect(Number.isInteger(photoScale(w, h))).toBe(true);
    }
  });

  it('vaut au moins 1, même pour une cible plus grande que la limite', () => {
    expect(photoScale(PHOTO_MAX_SIDE + 1, 10)).toBe(1);
    expect(photoScale(10_000, 10_000)).toBe(1);
  });

  it('est borné à PHOTO_MAX_FACTOR pour une cible minuscule', () => {
    expect(photoScale(1, 1)).toBe(PHOTO_MAX_FACTOR);
    expect(photoScale(10, 10, 2048, 5)).toBe(5);
    expect(photoScale(10, 10, 2048, 2.9)).toBe(2);
  });

  it('vaut 1 pour une taille nulle, négative ou non finie', () => {
    expect(photoScale(0, 0)).toBe(1);
    expect(photoScale(-5, -2)).toBe(1);
    expect(photoScale(Number.NaN, 10)).toBe(1);
    expect(photoScale(Number.POSITIVE_INFINITY, 10)).toBe(1);
    expect(photoScale(10, 10, Number.NaN)).toBe(1);
    expect(photoScale(10, 10, 2048, Number.NaN)).toBe(1);
    expect(photoScale(10, 10, 2048, 0)).toBe(1);
  });
});

describe('upscalePhoto (#479)', () => {
  it('facteur 1 : retourne seulement les lignes', () => {
    const image = upscalePhoto(quad(), 1);
    expect(image.width).toBe(2);
    expect(image.height).toBe(2);
    expect(pixelAt(image, 0, 0)).toEqual([0, 0, 255, 255]); // haut gauche : bleu
    expect(pixelAt(image, 1, 0)).toEqual([255, 255, 255, 255]);
    expect(pixelAt(image, 0, 1)).toEqual([255, 0, 0, 255]); // bas gauche : rouge
    expect(pixelAt(image, 1, 1)).toEqual([0, 255, 0, 255]);
  });

  it('chaque pixel de scène devient un carré de factor × factor pixels identiques', () => {
    const factor = 3;
    const image = upscalePhoto(quad(), factor);
    expect(image.width).toBe(6);
    expect(image.height).toBe(6);
    const expected: Record<string, number[]> = {
      '0,0': [0, 0, 255, 255],
      '1,0': [255, 255, 255, 255],
      '0,1': [255, 0, 0, 255],
      '1,1': [0, 255, 0, 255],
    };
    for (let y = 0; y < image.height; y++) {
      for (let x = 0; x < image.width; x++) {
        const key = `${Math.floor(x / factor)},${Math.floor(y / factor)}`;
        expect(pixelAt(image, x, y)).toEqual(expected[key]);
      }
    }
  });

  it("n'introduit aucune couleur absente de la source (aucun lissage)", () => {
    const image = upscalePhoto(quad(), 4);
    const colors = new Set<string>();
    for (let i = 0; i < image.data.length; i += 4) {
      colors.add(Array.from(image.data.slice(i, i + 4)).join(','));
    }
    expect(colors.size).toBe(4);
  });

  it("force l'opacité à 255", () => {
    const pixels: PhotoPixels = { width: 1, height: 1, data: new Uint8Array([10, 20, 30, 0]) };
    expect(Array.from(upscalePhoto(pixels, 2).data)).toEqual([
      10, 20, 30, 255, 10, 20, 30, 255, 10, 20, 30, 255, 10, 20, 30, 255,
    ]);
  });

  it('ne modifie pas les pixels source', () => {
    const pixels = quad();
    const copy = Array.from(pixels.data);
    upscalePhoto(pixels, 2);
    expect(Array.from(pixels.data)).toEqual(copy);
  });

  it('refuse un facteur non entier, nul ou négatif', () => {
    expect(() => upscalePhoto(quad(), 1.5)).toThrow(RangeError);
    expect(() => upscalePhoto(quad(), 0)).toThrow(RangeError);
    expect(() => upscalePhoto(quad(), -2)).toThrow(RangeError);
    expect(() => upscalePhoto(quad(), Number.NaN)).toThrow(RangeError);
  });

  it('refuse une taille invalide ou des données de mauvaise longueur', () => {
    expect(() => upscalePhoto({ width: 0, height: 2, data: new Uint8Array(0) }, 1)).toThrow(
      RangeError,
    );
    expect(() => upscalePhoto({ width: 1.5, height: 2, data: new Uint8Array(12) }, 1)).toThrow(
      RangeError,
    );
    expect(() => upscalePhoto({ width: 2, height: 2, data: new Uint8Array(15) }, 1)).toThrow(
      RangeError,
    );
  });
});

describe('photoFileName (#479)', () => {
  it("date le fichier à l'heure locale, sur deux chiffres", () => {
    expect(photoFileName(new Date(2026, 10, 7, 9, 5, 3))).toBe('aqfish-2026-11-07-090503.png');
    expect(photoFileName(new Date(2027, 0, 31, 23, 59, 59))).toBe('aqfish-2027-01-31-235959.png');
  });
});
