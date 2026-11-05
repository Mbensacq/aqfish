// Parts de la CI e2e équilibrées en durée (#281, docs/PIEGES.md).
//
// `playwright test --shard=N/M` coupe la liste des tests en tranches contiguës de même
// NOMBRE de tests : les fichiers lents regroupés (caméra libre, décor, dimensions du bac…)
// donnaient une part de 37 min et une autre de 12. Ce script remplace la tranche de
// Playwright par une répartition des FICHIERS selon leur durée mesurée (`e2e/durees.json`),
// toujours la même pour une même liste de fichiers : chaque part la recalcule seule.
//
//   node scripts/parts-e2e.mjs [options Playwright]         (npm run e2e)
//     avec --shard=N/M : lance les seuls fichiers de la part N ; sans : Playwright tel quel.
//   node scripts/parts-e2e.mjs --mesurer journal1.txt …      (journaux du rapporteur `list`)
//     réécrit e2e/durees.json à partir des journaux des parts de la CI (plusieurs séries :
//     moyenne par fichier).
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const E2E_DIR = join(ROOT, 'e2e');
const DURATIONS_FILE = join(E2E_DIR, 'durees.json');
/** Hors du projet `e2e` (projet `captures` de playwright.config.ts). */
const EXCLUDED = new Set(['captures.spec.ts']);

/**
 * Analyse `--shard=N/M` ou `--shard N/M`. Retourne `null` sans option, lève une erreur si
 * elle est mal formée. `rest` : les autres arguments, dans l'ordre.
 */
export function parseShard(args) {
  const rest = [];
  let shard = null;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    let value = null;
    if (arg.startsWith('--shard=')) {
      value = arg.slice('--shard='.length);
    } else if (arg === '--shard') {
      value = args[++i] ?? '';
    } else {
      rest.push(arg);
      continue;
    }
    const match = /^(\d+)\/(\d+)$/.exec(value);
    const current = match ? Number(match[1]) : NaN;
    const total = match ? Number(match[2]) : NaN;
    if (!match || total < 1 || current < 1 || current > total) {
      throw new Error(`--shard invalide : « ${value} » (attendu N/M, 1 ≤ N ≤ M)`);
    }
    shard = { current, total };
  }
  return { shard, rest };
}

/**
 * Répartit les fichiers en `total` parts de durées voisines (plus longue durée d'abord, dans
 * la part la moins chargée ; égalités départagées par le nom puis l'indice de part). Un
 * fichier sans durée mesurée compte pour la moyenne des durées connues (30 s s'il n'y en a
 * aucune). Déterministe : ne dépend ni de l'ordre de `files` ni de celui de `durations`.
 */
export function distribute(files, durations, total) {
  const known = files.map((f) => durations[f]).filter((d) => Number.isFinite(d) && d >= 0);
  const fallback = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 30;
  const weighted = [...new Set(files)]
    .map((file) => {
      const d = durations[file];
      return { file, seconds: Number.isFinite(d) && d >= 0 ? d : fallback };
    })
    .sort((a, b) => b.seconds - a.seconds || (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
  const parts = Array.from({ length: total }, () => ({ files: [], seconds: 0 }));
  for (const { file, seconds } of weighted) {
    let target = parts[0];
    for (const part of parts) {
      if (part.seconds < target.seconds) {
        target = part;
      }
    }
    target.files.push(file);
    target.seconds += seconds;
  }
  for (const part of parts) {
    part.files.sort();
  }
  return parts;
}

/**
 * Options de `playwright test` suivies d'une valeur en deux mots (`--grep vue`) : la valeur
 * n'est pas un fichier choisi (#384). Les options à valeur facultative (`--update-snapshots`,
 * `--only-changed`) n'en font pas partie : leur écrire `--option=valeur`.
 */
const VALUE_OPTIONS = new Set([
  '-c',
  '--config',
  '-g',
  '--grep',
  '-gv',
  '--grep-invert',
  '-j',
  '--workers',
  '--global-timeout',
  '--max-failures',
  '--output',
  '--project',
  '--repeat-each',
  '--reporter',
  '--retries',
  '--test-list',
  '--test-list-invert',
  '--timeout',
  '--trace',
  '--tsconfig',
  '--ui-host',
  '--ui-port',
  '--update-source-method',
]);

/**
 * Vrai si `args` (sans `--shard`) désigne des fichiers ou des filtres de fichiers choisis à la
 * main : un argument qui n'est ni une option ni la valeur d'une option de `VALUE_OPTIONS`.
 */
export function hasChosenFiles(args) {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (VALUE_OPTIONS.has(arg)) {
      i++;
    } else if (!arg.startsWith('-')) {
      return true;
    }
  }
  return false;
}

const LIST_LINE =
  /[✓✘]\s+\d+ \[e2e\] › e2e\/([\w.-]+\.spec\.ts):\d+:\d+ › .* \((\d+(?:\.\d+)?)(ms|s|m)\)\s*$/;

/**
 * Additionne, par fichier, les durées des lignes du rapporteur `list` de Playwright
 * (`✓  12 [e2e] › e2e/x.spec.ts:10:3 › titre (35.2s)`). Une nouvelle tentative (`retries`)
 * compte aussi : c'est du temps passé par la part. Secondes arrondies au dixième.
 */
export function parseListDurations(text) {
  const totals = {};
  for (const line of text.split(/\r?\n/)) {
    const match = LIST_LINE.exec(line);
    if (!match) {
      continue;
    }
    const value = Number(match[2]);
    const seconds = match[3] === 'm' ? value * 60 : match[3] === 'ms' ? value / 1000 : value;
    totals[match[1]] = (totals[match[1]] ?? 0) + seconds;
  }
  const sorted = {};
  for (const file of Object.keys(totals).sort()) {
    sorted[file] = Math.round(totals[file] * 10) / 10;
  }
  return sorted;
}

/**
 * Moyenne, par fichier, des durées de plusieurs journaux (un journal = une part d'une série) :
 * un fichier mesuré dans deux séries compte pour la moyenne des deux, ce qui lisse l'écart
 * entre machines de la CI (±30 %). Secondes arrondies au dixième, clés triées.
 */
export function averageDurations(measures) {
  const sums = {};
  const counts = {};
  for (const measure of measures) {
    for (const [file, seconds] of Object.entries(measure)) {
      sums[file] = (sums[file] ?? 0) + seconds;
      counts[file] = (counts[file] ?? 0) + 1;
    }
  }
  const average = {};
  for (const file of Object.keys(sums).sort()) {
    average[file] = Math.round((sums[file] / counts[file]) * 10) / 10;
  }
  return average;
}

function e2eFiles() {
  return readdirSync(E2E_DIR)
    .filter((f) => f.endsWith('.spec.ts') && !EXCLUDED.has(f))
    .sort();
}

function readDurations() {
  try {
    return JSON.parse(readFileSync(DURATIONS_FILE, 'utf8'));
  } catch (error) {
    console.warn(`parts-e2e : ${DURATIONS_FILE} illisible (${error.message}), durées égales.`);
    return {};
  }
}

/** Filtre de fichier exact pour Playwright (`/…/` : expression sans le drapeau `g`). */
const fileFilter = (file) => `/e2e\\/${file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$/`;

function runPlaywright(args) {
  const result = spawnSync('npx', ['playwright', 'test', '--project=e2e', ...args], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  if (result.error) {
    throw result.error;
  }
  return result.status ?? 1;
}

function main(argv) {
  if (argv[0] === '--mesurer') {
    const durations = averageDurations(
      argv.slice(1).map((f) => parseListDurations(readFileSync(f, 'utf8'))),
    );
    const count = Object.keys(durations).length;
    if (count === 0) {
      throw new Error('aucune ligne du rapporteur `list` trouvée dans les journaux');
    }
    writeFileSync(DURATIONS_FILE, `${JSON.stringify(durations, null, 2)}\n`);
    console.log(`parts-e2e : ${count} fichiers mesurés → e2e/durees.json`);
    return 0;
  }
  const { shard, rest } = parseShard(argv);
  // Sans part, ou avec des fichiers choisis à la main : Playwright tel quel.
  if (!shard || hasChosenFiles(rest)) {
    return runPlaywright(argv);
  }
  const parts = distribute(e2eFiles(), readDurations(), shard.total);
  const part = parts[shard.current - 1];
  console.log(
    `parts-e2e : part ${shard.current}/${shard.total}, ${part.files.length} fichiers, ` +
      `~${(part.seconds / 60).toFixed(1)} min estimées : ${part.files.join(' ')}`,
  );
  if (part.files.length === 0) {
    console.log('parts-e2e : part vide, rien à lancer.');
    return 0;
  }
  return runPlaywright([...rest, ...part.files.map(fileFilter)]);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(`parts-e2e : ${error.message}`);
    process.exitCode = 1;
  }
}
