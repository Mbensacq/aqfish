// Vérifie, après `npm run build`, que le moteur physique de l'éditeur (Rapier, issue #170,
// ADR 0046) n'est pas dans le bundle initial : aucun script chargé au démarrage (ceux de
// index.html et leurs imports statiques) ne contient son WebAssembly embarqué, alors qu'un
// fragment chargé à la demande le contient. Affiche la taille du bundle initial.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Début de `\0asm` (en-tête WebAssembly) encodé en base64. */
const WASM_BASE64 = 'AGFzbQ';
const DIST = join(import.meta.dirname, '..', 'dist', 'aqfish', 'browser');

function fail(message) {
  console.error(`verifier-bundle-initial : ${message}`);
  process.exit(1);
}

if (!existsSync(join(DIST, 'index.html'))) {
  fail(`build introuvable (${DIST}/index.html)`);
}
const html = readFileSync(join(DIST, 'index.html'), 'utf8');
const entries = [...html.matchAll(/<(?:script|link)\b[^>]*?(?:src|href)="([^":]+\.js)"/g)].map(
  (m) => m[1],
);
if (entries.length === 0) {
  fail('aucun script dans index.html');
}

// Imports statiques (`import … from "./x.js"`, `import "./x.js"`, `export … from "./x.js"`) ;
// les imports dynamiques `import("./x.js")` ne font pas partie du bundle initial.
const STATIC_IMPORT = /(?:\bfrom\s*|\bimport\s*)["']\.\/([^"']+\.js)["']/g;
const initial = new Set();
const queue = [...entries];
while (queue.length > 0) {
  const file = queue.pop();
  if (initial.has(file)) continue;
  initial.add(file);
  const code = readFileSync(join(DIST, file), 'utf8');
  for (const m of code.matchAll(STATIC_IMPORT)) {
    queue.push(m[1]);
  }
}

let total = 0;
for (const file of initial) {
  const code = readFileSync(join(DIST, file), 'utf8');
  total += Buffer.byteLength(code);
  if (code.includes(WASM_BASE64)) {
    fail(`le moteur physique est dans le bundle initial (${file})`);
  }
}
const lazy = readdirSync(DIST).filter(
  (f) =>
    f.endsWith('.js') &&
    !initial.has(f) &&
    readFileSync(join(DIST, f), 'utf8').includes(WASM_BASE64),
);
if (lazy.length === 0) {
  fail('aucun fragment à la demande ne contient le moteur : marqueur à revoir');
}
console.log(
  `verifier-bundle-initial : ${initial.size} scripts initiaux, ${(total / 1000).toFixed(2)} kB, ` +
    `sans le moteur (chargé à la demande : ${lazy.join(', ')})`,
);
