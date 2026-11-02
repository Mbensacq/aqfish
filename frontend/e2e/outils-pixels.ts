import { inflateSync } from 'node:zlib';

import type { Page } from '@playwright/test';

/**
 * Outils de pixels des e2e (#394) : capture du canevas et comptage de couleurs exactes, sans
 * repasser par le navigateur.
 *
 * En rendu logiciel, le fil principal de la page passe ~0,6 s par image : un
 * `locator('canvas').screenshot()` (vérifications de stabilité de l'élément) prenait ~14 s et
 * un décodage dans la page (`page.evaluate` + `createImageBitmap`) ~7 s, chaque étape
 * asynchrone attendant une image. `page.screenshot({ clip })` sur la boîte du canevas donne les
 * mêmes pixels (une capture d'élément est un découpage de la page) en ~5 s, et le décodage PNG
 * se fait ici, dans Node, en quelques dizaines de millisecondes.
 */

/** Capture de la zone du canevas (mêmes pixels que `locator('canvas').screenshot()`). */
export async function canvasShot(page: Page): Promise<Buffer> {
  const box = await page.locator('canvas').boundingBox();
  if (!box || box.width <= 0 || box.height <= 0) {
    throw new Error('Canevas absent ou de taille nulle');
  }
  return page.screenshot({ clip: box, animations: 'disabled' });
}

/** Image décodée : `rgba` de `width × height × 4` octets. */
export interface DecodedPng {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
}

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Décode un PNG 8 bits par canal, non entrelacé, RVB (type 2) ou RVBA (type 6), seuls formats
 * des captures de Chromium. Tout autre format lève une erreur plutôt que de mal compter.
 */
export function decodePng(png: Buffer): DecodedPng {
  if (png.length < 8 || SIGNATURE.some((byte, i) => png[i] !== byte)) {
    throw new Error('Pas un fichier PNG');
  }
  let width = 0;
  let height = 0;
  let channels = 0;
  const data: Buffer[] = [];
  let offset = 8;
  while (offset + 8 <= png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('latin1', offset + 4, offset + 8);
    const body = png.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      const [depth, colorType, , , interlace] = [body[8], body[9], body[10], body[11], body[12]];
      if (depth !== 8 || interlace !== 0 || (colorType !== 2 && colorType !== 6)) {
        throw new Error(`PNG non pris en charge (profondeur ${depth}, type ${colorType})`);
      }
      channels = colorType === 6 ? 4 : 3;
    } else if (type === 'IDAT') {
      data.push(body);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }
  if (width === 0 || height === 0 || channels === 0) {
    throw new Error('PNG sans en-tête IHDR valide');
  }
  const raw = inflateSync(Buffer.concat(data));
  const stride = width * channels;
  if (raw.length < height * (stride + 1)) {
    throw new Error('PNG tronqué');
  }
  const rgba = new Uint8Array(width * height * 4);
  let previous = new Uint8Array(stride);
  let line = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const start = y * (stride + 1);
    const filter = raw[start];
    for (let x = 0; x < stride; x++) {
      const value = raw[start + 1 + x];
      const left = x >= channels ? line[x - channels] : 0;
      const up = previous[x];
      const upLeft = x >= channels ? previous[x - channels] : 0;
      let predicted: number;
      switch (filter) {
        case 0:
          predicted = 0;
          break;
        case 1:
          predicted = left;
          break;
        case 2:
          predicted = up;
          break;
        case 3:
          predicted = (left + up) >> 1;
          break;
        case 4: {
          const p = left + up - upLeft;
          const pa = Math.abs(p - left);
          const pb = Math.abs(p - up);
          const pc = Math.abs(p - upLeft);
          predicted = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
          break;
        }
        default:
          throw new Error(`Filtre PNG inconnu : ${filter}`);
      }
      line[x] = (value + predicted) & 0xff;
    }
    for (let x = 0; x < width; x++) {
      const target = (y * width + x) * 4;
      const source = x * channels;
      rgba[target] = line[source];
      rgba[target + 1] = line[source + 1];
      rgba[target + 2] = line[source + 2];
      rgba[target + 3] = channels === 4 ? line[source + 3] : 255;
    }
    [previous, line] = [line, previous];
  }
  return { width, height, rgba };
}

/** Nombre de pixels de l'image pour chaque couleur exacte demandée (`#rrggbb`, sans l'alpha). */
export function countColors(png: Buffer, colors: readonly string[]): number[] {
  const wanted = colors.map((color) => {
    if (!/^#[0-9a-f]{6}$/i.test(color)) {
      throw new Error(`Couleur invalide : ${color}`);
    }
    return parseInt(color.slice(1), 16);
  });
  const counts = wanted.map(() => 0);
  const { rgba } = decodePng(png);
  for (let i = 0; i < rgba.length; i += 4) {
    const index = wanted.indexOf((rgba[i] << 16) | (rgba[i + 1] << 8) | rgba[i + 2]);
    if (index >= 0) {
      counts[index]++;
    }
  }
  return counts;
}
