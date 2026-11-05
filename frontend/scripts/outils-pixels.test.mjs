// Tests unitaires du décodeur PNG des e2e (`e2e/outils-pixels.ts`, #384) : jusqu'ici vérifié
// seulement à travers les e2e. Node lit le TypeScript directement (types effacés).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deflateSync } from 'node:zlib';

import { countColors, decodePng } from '../e2e/outils-pixels.ts';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function chunk(type, body) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, 'latin1');
  // CRC laissé à zéro : le décodeur ne le lit pas.
  return Buffer.concat([head, body, Buffer.alloc(4)]);
}

function ihdr(width, height, { depth = 8, colorType = 6, interlace = 0 } = {}) {
  const body = Buffer.alloc(13);
  body.writeUInt32BE(width, 0);
  body.writeUInt32BE(height, 4);
  body[8] = depth;
  body[9] = colorType;
  body[12] = interlace;
  return chunk('IHDR', body);
}

/** Prédicteur de Paeth, écrit d'après la spécification PNG (§ 9.4). */
function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/**
 * Encode `pixels` (lignes de valeurs de canaux) en PNG 8 bits, chaque ligne avec le filtre
 * `filters[y]`, données IDAT coupées en deux morceaux (le décodeur doit les recoller).
 */
function encode(width, channels, rows, filters) {
  const stride = width * channels;
  const lines = [];
  let previous = new Array(stride).fill(0);
  rows.forEach((row, y) => {
    const filter = filters[y % filters.length];
    const out = [filter];
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? row[x - channels] : 0;
      const b = previous[x];
      const c = x >= channels ? previous[x - channels] : 0;
      const predicted = [0, a, b, (a + b) >> 1, paeth(a, b, c)][filter];
      out.push((row[x] - predicted + 256) & 0xff);
    }
    lines.push(Buffer.from(out));
    previous = row;
  });
  const data = deflateSync(Buffer.concat(lines));
  const cut = Math.floor(data.length / 2);
  return Buffer.concat([
    SIGNATURE,
    ihdr(width, rows.length, { colorType: channels === 4 ? 6 : 2 }),
    chunk('tEXt', Buffer.from('Comment\0ignoré', 'latin1')),
    chunk('IDAT', data.subarray(0, cut)),
    chunk('IDAT', data.subarray(cut)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Image de test : valeurs variées, dont des sommes qui dépassent 255 (modulo). */
function sampleRows(width, height, channels) {
  return Array.from({ length: height }, (_, y) =>
    Array.from(
      { length: width * channels },
      (_, x) => (x * 37 + y * 91 + ((x * y) % 7) * 50) % 256,
    ),
  );
}

function expectedRgba(rows, channels) {
  const out = [];
  for (const row of rows) {
    for (let x = 0; x < row.length; x += channels) {
      out.push(row[x], row[x + 1], row[x + 2], channels === 4 ? row[x + 3] : 255);
    }
  }
  return Uint8Array.from(out);
}

test('decodePng : chaque filtre 0 à 4, seul ou mélangé, en RVB et en RVBA', () => {
  for (const channels of [3, 4]) {
    const rows = sampleRows(5, 6, channels);
    for (const filters of [[0], [1], [2], [3], [4], [0, 1, 2, 3, 4, 2]]) {
      const decoded = decodePng(encode(5, channels, rows, filters));
      assert.equal(decoded.width, 5);
      assert.equal(decoded.height, 6);
      assert.deepEqual(
        decoded.rgba,
        expectedRgba(rows, channels),
        `${channels} canaux, ${filters}`,
      );
    }
  }
});

test('decodePng : octets calculés à la main (filtre 1 : somme modulo 256)', () => {
  const line = Buffer.from([1, 10, 20, 30, 250, 5, 5]);
  const png = Buffer.concat([
    SIGNATURE,
    ihdr(2, 1, { colorType: 2 }),
    chunk('IDAT', deflateSync(line)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  assert.deepEqual(decodePng(png).rgba, Uint8Array.from([10, 20, 30, 255, 4, 25, 35, 255]));
});

test('decodePng : formats refusés plutôt que mal comptés', () => {
  const rows = sampleRows(2, 2, 4);
  const good = encode(2, 4, rows, [0]);
  assert.throws(() => decodePng(Buffer.from('pas un png')), /Pas un fichier PNG/);
  assert.throws(() => decodePng(Buffer.alloc(4)), /Pas un fichier PNG/);
  for (const options of [
    { depth: 16 },
    { colorType: 3 },
    { colorType: 0 },
    { colorType: 4 },
    { interlace: 1 },
  ]) {
    const png = Buffer.concat([SIGNATURE, ihdr(2, 2, options), good.subarray(8 + 25)]);
    assert.throws(() => decodePng(png), /non pris en charge/, JSON.stringify(options));
  }
  assert.throws(
    () => decodePng(Buffer.concat([SIGNATURE, chunk('IEND', Buffer.alloc(0))])),
    /sans en-tête IHDR/,
  );
  const short = Buffer.concat([
    SIGNATURE,
    ihdr(2, 2),
    chunk('IDAT', deflateSync(Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8]))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  assert.throws(() => decodePng(short), /tronqué/);
  const badFilter = Buffer.concat([
    SIGNATURE,
    ihdr(1, 1, { colorType: 2 }),
    chunk('IDAT', deflateSync(Buffer.from([5, 1, 2, 3]))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  assert.throws(() => decodePng(badFilter), /Filtre PNG inconnu : 5/);
});

test('countColors : pixels de chaque couleur exacte, alpha ignoré, casse indifférente', () => {
  // 3 × 2 en RVBA : deux rouges (dont un transparent), un vert, trois autres.
  const rows = [
    [255, 0, 0, 255, 0, 255, 0, 255, 1, 2, 3, 255],
    [255, 0, 0, 0, 10, 10, 10, 255, 254, 0, 0, 255],
  ];
  const png = encode(3, 4, rows, [4]);
  assert.deepEqual(countColors(png, ['#ff0000', '#00FF00', '#0a0a0a', '#123456']), [2, 1, 1, 0]);
  assert.deepEqual(countColors(png, []), []);
  // RVB : l'alpha implicite ne change rien.
  assert.deepEqual(countColors(encode(1, 3, [[1, 2, 3]], [0]), ['#010203']), [1]);
  assert.throws(() => countColors(png, ['ff0000']), /Couleur invalide : ff0000/);
  assert.throws(() => countColors(png, ['#f00']), /Couleur invalide/);
});
