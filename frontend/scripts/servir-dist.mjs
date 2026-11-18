// Serveur statique d'un build de l'application, pour les tests de bout en bout et les captures
// en CI (docs/PIEGES.md, « CI e2e »).
//
// La CI construit l'application une seule fois (`ng build --configuration development` : mode
// développement d'Angular gardé, ses contrôles écrivent dans la console que les tests lisent)
// et chaque part la sert avec ce script, au lieu de recompiler avec `ng serve` sur chaque
// machine.
//
//   node scripts/servir-dist.mjs <dossier> <port>
//
// Toute adresse sans fichier correspondant renvoie `index.html` (application d'une seule page,
// paramètres dans la requête) ; aucun chemin ne sort du dossier servi.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Types MIME des fichiers d'un build Angular. */
export const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

/**
 * Fichier à servir pour le chemin d'URL `urlPath` dans `root`, ou `null` si le chemin sort du
 * dossier. Les segments `..` et les barres obliques inverses sont résolus avant le contrôle.
 */
export function fileFor(root, urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  const base = resolve(root);
  const target = resolve(base, `.${decoded.replaceAll('\\', '/')}`);
  return target === base || target.startsWith(base + sep) ? target : null;
}

/** Type MIME d'un fichier, `application/octet-stream` par défaut. */
export function contentType(file) {
  return CONTENT_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
}

/** Crée le serveur (non démarré) du dossier `root`. */
export function createDistServer(root) {
  const index = join(resolve(root), 'index.html');
  return createServer(async (request, response) => {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname;
    const target = fileFor(root, path);
    if (target === null) {
      response.writeHead(403).end();
      return;
    }
    let file = index;
    try {
      if ((await stat(target)).isFile()) file = target;
    } catch {
      // Pas de fichier à ce chemin : route de l'application.
    }
    try {
      const body = await readFile(file);
      response.writeHead(200, { 'content-type': contentType(file), 'cache-control': 'no-store' });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
}

function main() {
  const [root, port] = process.argv.slice(2);
  const number = Number(port);
  if (!root || !Number.isInteger(number) || number <= 0) {
    console.error('Usage : node scripts/servir-dist.mjs <dossier> <port>');
    process.exitCode = 2;
    return;
  }
  createDistServer(root).listen(number, () => {
    console.log(`Build ${root} servi sur http://localhost:${number}`);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
