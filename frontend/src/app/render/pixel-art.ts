/**
 * Calculs purs du pipeline pixel art (docs/ARCHITECTURE.md, « Rendu pixel art 3D »),
 * sans Three.js ni WebGL pour être testés en unitaire. La passe GLSL
 * (`render/palette-pass.ts`) applique exactement les mêmes formules.
 */

/** Pixels d'affichage (pixels CSS) par pixel de scène. Constante unique du pipeline. */
export const PIXEL_SIZE = 3;

/** Couleur sRGB, composantes dans [0, 1]. */
export type Rgb = readonly [number, number, number];

export interface Size {
  readonly width: number;
  readonly height: number;
}

/**
 * Taille de la cible basse résolution pour une surface d'affichage donnée.
 * Arrondi supérieur : la cible couvre toute la surface (la dernière rangée de pixels de
 * scène est rognée au bord plutôt que d'étirer l'image). Taille minimale 1 × 1, y compris
 * pour une surface nulle, négative ou non finie.
 */
export function lowResolutionSize(width: number, height: number, pixelSize = PIXEL_SIZE): Size {
  const px = Number.isFinite(pixelSize) && pixelSize >= 1 ? pixelSize : 1;
  return { width: scaledDown(width, px), height: scaledDown(height, px) };
}

function scaledDown(length: number, pixelSize: number): number {
  if (!Number.isFinite(length) || length <= 0) {
    return 1;
  }
  return Math.max(1, Math.ceil(length / pixelSize));
}

/** Convertit `#rrggbb` en couleur sRGB normalisée. Lève une erreur sur un format invalide. */
export function hexToRgb(hex: string): Rgb {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) {
    throw new Error(`Couleur invalide : « ${hex} » (format attendu : #rrggbb)`);
  }
  const value = Number.parseInt(match[1], 16);
  return [((value >> 16) & 0xff) / 255, ((value >> 8) & 0xff) / 255, (value & 0xff) / 255];
}

/** Composante linéaire → sRGB (fonction de transfert sRGB standard), bornée à [0, 1]. */
export function linearToSrgb(c: number): number {
  const x = Math.min(Math.max(c, 0), 1);
  return x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
}

/** Carré de la distance euclidienne entre deux couleurs sRGB (métrique de la passe). */
export function colorDistanceSq(a: Rgb, b: Rgb): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

/**
 * Indice de la couleur de `palette` la plus proche de `color` (distance euclidienne en
 * sRGB). En cas d'égalité, la première couleur déclarée l'emporte, comme dans le shader.
 * Lève une erreur si la palette est vide.
 */
export function nearestPaletteIndex(color: Rgb, palette: readonly Rgb[]): number {
  if (palette.length === 0) {
    throw new Error('Palette vide');
  }
  let best = 0;
  let bestDistance = colorDistanceSq(color, palette[0]);
  for (let i = 1; i < palette.length; i++) {
    const d = colorDistanceSq(color, palette[i]);
    if (d < bestDistance) {
      best = i;
      bestDistance = d;
    }
  }
  return best;
}

/** Couleur de `palette` la plus proche de `color` (voir `nearestPaletteIndex`). */
export function nearestPaletteColor(color: Rgb, palette: readonly Rgb[]): Rgb {
  return palette[nearestPaletteIndex(color, palette)];
}

/** Palette à plat (`r, g, b, r, g, b…`), format du tableau uniforme `vec3[]` du shader. */
export function flattenPalette(palette: readonly Rgb[]): Float32Array {
  const data = new Float32Array(palette.length * 3);
  palette.forEach((c, i) => data.set(c, i * 3));
  return data;
}
