/**
 * Contraste du texte du tableau de bord (issue #256) : couleurs composées comme le fait le
 * navigateur (mélange en sRGB, opacité du groupe par-dessus la scène), puis rapport de
 * contraste WCAG 2. Fonctions pures, testées en unitaire : le cadre s'estompe sans que le
 * texte lu passe sous 4,5:1, quel que soit le fond de la scène.
 */

/** Couleur sRGB, composantes dans [0, 255]. */
export type Rgb = readonly [number, number, number];

/** Couleur `#rrggbb` lue en composantes. @throws Error si le format n'est pas `#rrggbb`. */
export function parseHex(hex: string): Rgb {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) {
    throw new Error(`Couleur « ${hex} » : #rrggbb attendu`);
  }
  const channel = (index: number) => parseInt(match[index] ?? '0', 16);
  return [channel(1), channel(2), channel(3)];
}

/** `top` d'opacité `alpha` (bornée à [0, 1]) posé sur `bottom`. */
export function over(top: Rgb, alpha: number, bottom: Rgb): Rgb {
  const a = Math.min(1, Math.max(0, alpha));
  const mix = (i: 0 | 1 | 2) => top[i] * a + bottom[i] * (1 - a);
  return [mix(0), mix(1), mix(2)];
}

/** Luminance relative WCAG 2 d'une couleur sRGB. */
export function luminance(color: Rgb): number {
  const linear = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(color[0]) + 0.7152 * linear(color[1]) + 0.0722 * linear(color[2]);
}

/** Rapport de contraste WCAG 2 entre deux couleurs, dans [1, 21]. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Contraste d'un texte de couleur `text` (opacité `textAlpha`) sur un fond `background`
 * d'opacité `backgroundAlpha`, le tout estompé à `groupOpacity` par-dessus la scène `scene`.
 */
export function fadedContrast(options: {
  readonly text: Rgb;
  readonly textAlpha?: number;
  readonly background: Rgb;
  readonly backgroundAlpha: number;
  readonly groupOpacity: number;
  readonly scene: Rgb;
}): number {
  const panel = over(options.background, options.backgroundAlpha, options.scene);
  const ink = over(options.text, options.textAlpha ?? 1, panel);
  return contrastRatio(
    over(ink, options.groupOpacity, options.scene),
    over(panel, options.groupOpacity, options.scene),
  );
}
