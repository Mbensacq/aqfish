/**
 * Photo de l'aquarium (#479, ADR 0112) : calculs purs, sans Three.js ni WebGL, pour être
 * testés en unitaire. La vue (`render/aquarium-view.ts`, `takePhoto`) relit la cible basse
 * résolution déjà ramenée à la palette ; ce module l'agrandit par un facteur entier, au plus
 * proche voisin (aucun lissage : chaque pixel de scène devient un carré de `factor` × `factor`
 * pixels identiques), et remet les lignes dans l'ordre de l'image (WebGL lit de bas en haut).
 */

/** Côté le plus long visé pour la photo (pixels) : le facteur entier est choisi pour s'en approcher sans le dépasser. */
export const PHOTO_MAX_SIDE = 2048;

/** Message bref affiché quand la photo n'a pas pu être produite ou encodée (#503). */
export const PHOTO_FAILED_MESSAGE = 'Photo impossible : le navigateur n’a pas pu créer l’image.';

/** Durée d'affichage de ce message, en millisecondes. */
export const PHOTO_NOTICE_MS = 4000;

/** Facteur d'agrandissement maximal (une cible minuscule ne donne pas une image floue de pavés géants). */
export const PHOTO_MAX_FACTOR = 8;

/** Pixels bruts relus dans une cible : RGBA 8 bits, lignes de bas en haut (ordre WebGL). */
export interface PhotoPixels {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}

/** Image prête à encoder : RGBA 8 bits, lignes de haut en bas (ordre de `ImageData`). */
export interface PhotoImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

/**
 * Facteur d'agrandissement entier d'une cible de `width` × `height` pixels de scène : le plus
 * grand entier tel que le côté le plus long reste sous `maxSide`, borné à [1, `maxFactor`].
 * Taille nulle, négative ou non finie : 1.
 */
export function photoScale(
  width: number,
  height: number,
  maxSide = PHOTO_MAX_SIDE,
  maxFactor = PHOTO_MAX_FACTOR,
): number {
  const longest = Math.max(width, height);
  if (!Number.isFinite(longest) || longest <= 0 || !Number.isFinite(maxSide)) {
    return 1;
  }
  const limit = Number.isFinite(maxFactor) ? Math.max(1, Math.floor(maxFactor)) : 1;
  return Math.min(limit, Math.max(1, Math.floor(maxSide / longest)));
}

/**
 * Agrandit `pixels` par `factor` (entier ≥ 1) au plus proche voisin et retourne les lignes
 * (bas en haut → haut en bas). L'opacité est forcée à 255 : la passe palette écrit des pixels
 * opaques, mais la photo ne doit jamais hériter d'un fond transparent.
 * @throws RangeError si `factor` n'est pas un entier ≥ 1, si la taille n'est pas entière et
 *   positive, ou si `data` n'a pas `width × height × 4` octets.
 */
export function upscalePhoto(pixels: PhotoPixels, factor: number): PhotoImage {
  const { width, height, data } = pixels;
  if (!Number.isInteger(factor) || factor < 1) {
    throw new RangeError(`facteur d'agrandissement invalide : ${factor}`);
  }
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new RangeError(`taille invalide : ${width} × ${height}`);
  }
  if (data.length !== width * height * 4) {
    throw new RangeError(`${data.length} octets pour ${width} × ${height} pixels`);
  }
  const outWidth = width * factor;
  const outHeight = height * factor;
  const out = new Uint8ClampedArray(outWidth * outHeight * 4);
  const rowBytes = outWidth * 4;
  for (let y = 0; y < height; y++) {
    const source = (height - 1 - y) * width * 4;
    const firstRow = y * factor * rowBytes;
    for (let x = 0; x < width; x++) {
      const s = source + x * 4;
      const r = data[s];
      const g = data[s + 1];
      const b = data[s + 2];
      for (let k = 0; k < factor; k++) {
        const d = firstRow + (x * factor + k) * 4;
        out[d] = r;
        out[d + 1] = g;
        out[d + 2] = b;
        out[d + 3] = 255;
      }
    }
    // Les `factor - 1` lignes suivantes sont la copie de la première.
    for (let k = 1; k < factor; k++) {
      out.copyWithin(firstRow + k * rowBytes, firstRow, firstRow + rowBytes);
    }
  }
  return { width: outWidth, height: outHeight, data: out };
}

/** Nom de fichier daté de la photo, à l'heure locale : `aqfish-AAAA-MM-JJ-HHMMSS.png`. */
export function photoFileName(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `aqfish-${day}-${time}.png`;
}

/** Nom de fichier daté de la photo avant / après d'une séance (#624). */
export function comparisonFileName(date: Date): string {
  return photoFileName(date).replace(/^aqfish-/, 'aqfish-avant-apres-');
}

/**
 * Assemble deux relevés côte à côte (#624, avant / après d'une séance), séparés de `gap`
 * pixels de la couleur `background` (RGB 0 à 255), alignés en haut ; le reste est rempli de
 * `background`. Entrées et sortie dans l'ordre WebGL (lignes de bas en haut), pour passer
 * ensuite par `upscalePhoto`.
 * @throws RangeError si une entrée n'a pas `width × height × 4` octets ou si `gap` n'est pas
 *   un entier ≥ 0.
 */
export function sideBySidePhotos(
  left: PhotoPixels,
  right: PhotoPixels,
  gap: number,
  background: readonly [number, number, number],
): PhotoPixels {
  if (!Number.isInteger(gap) || gap < 0) {
    throw new RangeError(`écart invalide : ${gap}`);
  }
  for (const { width, height, data } of [left, right]) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
      throw new RangeError(`taille invalide : ${width} × ${height}`);
    }
    if (data.length !== width * height * 4) {
      throw new RangeError(`${data.length} octets pour ${width} × ${height} pixels`);
    }
  }
  const width = left.width + gap + right.width;
  const height = Math.max(left.height, right.height);
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = background[0];
    data[i + 1] = background[1];
    data[i + 2] = background[2];
    data[i + 3] = 255;
  }
  const paste = (image: PhotoPixels, x0: number): void => {
    // Alignées en haut : en ordre WebGL, la ligne du bas de l'image monte de l'écart de hauteur.
    const lift = height - image.height;
    for (let y = 0; y < image.height; y++) {
      const source = y * image.width * 4;
      data.set(
        image.data.subarray(source, source + image.width * 4),
        ((y + lift) * width + x0) * 4,
      );
    }
  };
  paste(left, 0);
  paste(right, left.width + gap);
  return { width, height, data };
}
