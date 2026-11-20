// Génère l'icône du site et le logo (#721, docs/INTERFACE.md, « Identité ») à partir d'un seul
// dessin de 16 × 16 pixels : `public/favicon.ico` (16, 32 et 48 px, agrandis sans lissage),
// `public/icone-32.png`, `public/icone-180.png` (écran d'accueil) et `public/logo.svg`.
// Aucune dépendance : PNG et ICO écrits à la main (zlib de Node). Usage, depuis `frontend/` :
//   node scripts/generer-icone.mjs
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

/** Couleurs de la charte (`src/app/ui/_panel-layout.scss`) et deux tons du laiton. */
const COLORS = {
  '.': null, // transparent
  s: [0x14, 0x14, 0x18], // salle
  B: [0xd1, 0xa6, 0x5c], // laiton
  L: [0xe6, 0xc4, 0x8a], // laiton clair (ventre)
  d: [0x9c, 0x7a, 0x3e], // laiton sombre (nageoires, queue)
  k: [0x14, 0x14, 0x18], // œil
  w: [0xeb, 0xe7, 0xde], // reflet de l'œil
};

/** Le poisson, tourné vers la gauche, sur un carreau de la couleur de la salle. */
export const FISH = [
  'ssssssssssssssss',
  'ssssssssssssssss',
  'ssssssssssssssss',
  'sssssssddsssssss',
  'sssssBBBBBssssss',
  'sssBBBBBBBBsssdd',
  'ssBBBBBBBBBBsddd',
  'sBwBBBBBBBBBBdds',
  'sBkBBBBBBBBBBdss',
  'sBBBBBBBBBBBBdds',
  'ssLLLLLLLLLLsddd',
  'sssLLLLLLLLsssdd',
  'sssssLLLLLssssss',
  'sssssssddsssssss',
  'ssssssssssssssss',
  'ssssssssssssssss',
];

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

/** PNG RGBA du dessin agrandi `scale` fois, pixel pour pixel (sans lissage). */
export function png(drawing, scale) {
  const size = drawing.length * scale;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    for (let x = 0; x < size; x++) {
      const color = COLORS[drawing[Math.floor(y / scale)][Math.floor(x / scale)]];
      const at = row + 1 + x * 4;
      if (color) {
        raw.set([...color, 255], at);
      }
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8 bits, RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Fichier ICO contenant des PNG (format admis par tous les navigateurs actuels). */
export function ico(images) {
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, data }, i) => {
    const at = 6 + i * 16;
    header.writeUInt8(size % 256, at);
    header.writeUInt8(size % 256, at + 1);
    header.writeUInt16LE(1, at + 4);
    header.writeUInt16LE(32, at + 6);
    header.writeUInt32LE(data.length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map((image) => image.data)]);
}

const hex = (rgb) => `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`;

/** Logo : le poisson (sans son carreau) en rectangles, puis le mot « aqfish ». */
export function logoSvg(drawing) {
  const rects = [];
  drawing.forEach((line, y) => {
    [...line].forEach((key, x) => {
      const color = key === 's' ? null : COLORS[key];
      if (color) rects.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${hex(color)}"/>`);
    });
  });
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 2 64 12" width="128" height="24"' +
    ' shape-rendering="crispEdges" role="img" aria-label="aqfish">' +
    `<g>${rects.join('')}</g>` +
    `<text x="18" y="11.5" fill="${hex([0xeb, 0xe7, 0xde])}" font-size="10" font-weight="700"` +
    ` font-family="'Atkinson Hyperlegible Next Variable', system-ui, sans-serif">aqfish</text>` +
    '</svg>\n'
  );
}

const PUBLIC = join(import.meta.dirname, '..', 'public');
if (process.argv[1] === import.meta.filename) {
  writeFileSync(
    join(PUBLIC, 'favicon.ico'),
    ico([16, 32, 48].map((size) => ({ size, data: png(FISH, size / 16) }))),
  );
  writeFileSync(join(PUBLIC, 'icone-32.png'), png(FISH, 2));
  writeFileSync(join(PUBLIC, 'icone-180.png'), png(FISH, 12));
  writeFileSync(join(PUBLIC, 'logo.svg'), logoSvg(FISH));
  console.log('generer-icone : favicon.ico, icone-32.png, icone-180.png, logo.svg écrits');
}
