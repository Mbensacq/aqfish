#!/usr/bin/env node
/**
 * Paquet « fond d'écran » (issue #279, ADR 0079) : `npm run paquet-fond`.
 *
 * Produit `dist/fond-ecran/`, un dossier autonome à importer dans Wallpaper Engine :
 * 1. build de production avec chemins relatifs (`--base-href ./`) ;
 * 2. `aqfish-fond.json` : configuration d'exemple (`fond-ecran/aqfish-fond.json`), à
 *    remplacer par un export de l'application ;
 * 3. `aqfish-fond.js` : active la vue fond d'écran sans paramètre d'URL
 *    (`window.aqfishFond`) et embarque la même configuration, lue si `fetch` est refusé ;
 * 4. `index.html` : charge `aqfish-fond.js` avant l'application ;
 * 5. vérification : la page ouverte en `file://` dans Chromium démarre la vue fond d'écran
 *    avec la configuration d'exemple, sans erreur ; `preview.jpg` (image d'aperçu) en est la
 *    capture.
 *
 * Sort en erreur (code 1) si une étape échoue. Options : `--sans-build` (réutilise le build
 * de `dist/fond-ecran-build/`), `--sans-verification`.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BUILD_DIR = join(ROOT, 'dist', 'fond-ecran-build');
const OUT_DIR = join(ROOT, 'dist', 'fond-ecran');
const EXAMPLE = join(ROOT, 'fond-ecran', 'aqfish-fond.json');
const FPS = 30;
const SCRIPT_TAG = '<script src="aqfish-fond.js"></script>';

const args = new Set(process.argv.slice(2));

function fail(message) {
  console.error(`paquet-fond : ${message}`);
  process.exit(1);
}

/** Texte de `aqfish-fond.js` : globale `aqfishFond` avec la configuration `config`. */
function wallpaperScript(config, fps) {
  return (
    "// Vue fond d'écran d'aqfish (#279) : activée par cette globale, sans paramètre d'URL.\n" +
    '// `config` : sauvegarde exportée depuis aqfish, lue si aqfish-fond.json est inaccessible.\n' +
    `window.aqfishFond = { fps: ${fps}, config: ${JSON.stringify(config)} };\n`
  );
}

/** `index.html` avec `aqfish-fond.js` chargé en tête, avant les scripts de l'application. */
function injectScript(html) {
  if (html.includes(SCRIPT_TAG)) {
    return html;
  }
  // La balise remplacée est vérifiée telle quelle : `<head>` nue, unique, avant `</head>`
  // (une `<head lang="…">` ne serait pas remplacée et le script manquerait sans erreur).
  const openings = html.match(/<head(?:\s[^>]*)?>/gi) ?? [];
  if (openings.length !== 1 || openings[0] !== '<head>') {
    throw new Error('index.html sans balise <head> unique et sans attribut');
  }
  const opening = html.indexOf('<head>');
  const closing = html.indexOf('</head>');
  if (closing < opening) {
    throw new Error('index.html sans </head> après <head>');
  }
  return html.replace('<head>', `<head>\n  ${SCRIPT_TAG}`);
}

function build() {
  const result = spawnSync(
    'npx',
    ['ng', 'build', '--base-href', './', '--output-path', BUILD_DIR],
    { cwd: ROOT, stdio: 'inherit' },
  );
  if (result.status !== 0) {
    fail('build en échec');
  }
}

function assemble() {
  const browser = join(BUILD_DIR, 'browser');
  if (!existsSync(join(browser, 'index.html'))) {
    fail(`build introuvable (${browser})`);
  }
  let config;
  try {
    config = JSON.parse(readFileSync(EXAMPLE, 'utf8'));
  } catch (error) {
    fail(`configuration d'exemple illisible (${error.message})`);
  }
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });
  cpSync(browser, OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, 'aqfish-fond.json'), `${JSON.stringify(config, null, 2)}\n`);
  writeFileSync(join(OUT_DIR, 'aqfish-fond.js'), wallpaperScript(config, FPS));
  const indexPath = join(OUT_DIR, 'index.html');
  writeFileSync(indexPath, injectScript(readFileSync(indexPath, 'utf8')));
  return config;
}

/**
 * Ouvre le paquet en `file://` (Chromium de Playwright) : la vue fond d'écran doit démarrer
 * sur la configuration d'exemple (bac tropical), sans interface ni erreur ; capture l'aperçu.
 */
async function verify() {
  const { chromium } = await import('@playwright/test');
  // Chromium refuse par défaut `fetch` et les modules ES entre fichiers `file://` : le
  // drapeau reproduit un hôte qui les autorise (à vérifier dans Wallpaper Engine).
  const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') {
        errors.push(message.text());
      }
    });
    await page.goto(pathToFileURL(join(OUT_DIR, 'index.html')).href);
    await page.waitForSelector('body[data-aqfish-ready="true"]', { timeout: 120_000 });
    const host = page.locator('app-aquarium-host');
    const source = await host.getAttribute('data-aqfish-fond');
    const environment = await host.getAttribute('data-aqfish-environment');
    if (source !== 'fichier' && source !== 'script') {
      throw new Error(`configuration d'exemple non lue (source : ${source})`);
    }
    if (environment !== 'tropical') {
      throw new Error(`environnement inattendu : ${environment}`);
    }
    if ((await page.locator('button, app-control-panel').count()) > 0) {
      throw new Error('interface visible dans la vue fond d’écran');
    }
    await page.waitForTimeout(3000);
    await page.screenshot({ path: join(OUT_DIR, 'preview.jpg'), type: 'jpeg', quality: 85 });
    if (errors.length > 0) {
      throw new Error(`erreurs dans la page : ${errors.join(' | ')}`);
    }
    console.log(`paquet-fond : vérifié en file:// (source « ${source} »), aperçu écrit.`);
  } finally {
    await browser.close();
  }
}

if (!args.has('--sans-build')) {
  build();
}
assemble();
if (!args.has('--sans-verification')) {
  try {
    await verify();
  } catch (error) {
    fail(`vérification en file:// en échec : ${error.message}`);
  }
}
console.log(`paquet-fond : ${OUT_DIR}`);
