// Bilan des exceptions de qualité (`qualite-exceptions.json`, docs/CONVENTIONS.md).
//
// Mesure, pour chaque fichier en exception, la valeur actuelle de chaque limite (lignes du
// fichier, lignes et complexité de la pire fonction, imbrication, paramètres) et la compare à
// la valeur enregistrée et à la limite générale d'`eslint.config.js`.
//
//   node scripts/qualite-bilan.mjs             affiche le bilan
//   node scripts/qualite-bilan.mjs --verifier  échoue si une exception peut être abaissée ou
//                                              supprimée (cliquet : la dette ne remonte pas en
//                                              silence, et chaque progrès est enregistré)
//   node scripts/qualite-bilan.mjs --ecrire    abaisse ou supprime les exceptions dans le fichier
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EXCEPTIONS_FILE = join(ROOT, 'qualite-exceptions.json');

/** Règles mesurées, au seuil 0 : chaque fonction (ou le fichier) produit un message. */
const MEASURE_RULES = {
  'max-lines': ['warn', { max: 0, skipBlankLines: true, skipComments: true }],
  'max-lines-per-function': ['warn', { max: 0, skipBlankLines: true, skipComments: true }],
  complexity: ['warn', 0],
  'max-depth': ['warn', { max: 0 }],
  'max-params': ['warn', { max: 0 }],
};

/**
 * Valeur mesurée dans un message ESLint de l'une des règles ci-dessus (« (123) » ou
 * « complexity of 12 »), ou `null` si le message n'en porte pas.
 */
export function measuredValue(message) {
  const match = /complexity of (\d+)/.exec(message) ?? /\((\d+)\)/.exec(message);
  return match ? Number(match[1]) : null;
}

/**
 * Maxima par règle, à partir des messages ESLint d'un fichier.
 * @param {{ ruleId: string | null, message: string }[]} messages
 */
export function maximaByRule(messages) {
  const maxima = {};
  for (const { ruleId, message } of messages) {
    if (!ruleId || !(ruleId in MEASURE_RULES)) continue;
    const value = measuredValue(message);
    if (value !== null) maxima[ruleId] = Math.max(maxima[ruleId] ?? 0, value);
  }
  return maxima;
}

/**
 * Nouvelle exception d'un fichier : pour chaque règle, la valeur mesurée si elle dépasse
 * encore la limite générale (jamais au-dessus de la valeur enregistrée), rien sinon.
 * Renvoie `null` quand le fichier respecte toutes les limites.
 */
export function tightenedException(recorded, measured, limits) {
  const next = {};
  for (const [rule, value] of Object.entries(recorded)) {
    const current = measured[rule] ?? 0;
    if (current > limits[rule]) next[rule] = Math.min(value, current);
  }
  return Object.keys(next).length > 0 ? next : null;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const { ESLint } = require('eslint');
  const { QUALITY_LIMITS } = await loadLimits();
  const exceptions = JSON.parse(readFileSync(EXCEPTIONS_FILE, 'utf8'));
  const files = Object.keys(exceptions).map((file) => join(ROOT, 'src', 'app', file));
  const eslint = new ESLint({ cwd: ROOT, overrideConfig: [{ rules: MEASURE_RULES }] });
  const results = await eslint.lintFiles(files);

  const next = {};
  const changes = [];
  for (const result of results) {
    const file = relative(join(ROOT, 'src', 'app'), result.filePath).replaceAll('\\', '/');
    const recorded = exceptions[file];
    const measured = maximaByRule(result.messages);
    const tightened = tightenedException(recorded, measured, QUALITY_LIMITS);
    if (tightened) next[file] = tightened;
    for (const rule of Object.keys(recorded)) {
      const before = recorded[rule];
      const after = tightened?.[rule];
      if (after !== before) {
        changes.push(`${file} : ${rule} ${before} → ${after ?? 'sous la limite, à retirer'}`);
      }
    }
  }
  for (const file of Object.keys(exceptions)) {
    if (!results.some((r) => r.filePath.endsWith(file))) {
      changes.push(`${file} : fichier absent, à retirer`);
    }
  }

  const total = Object.values(next).reduce((n, rules) => n + Object.keys(rules).length, 0);
  console.log(`Exceptions de qualité : ${Object.keys(next).length} fichiers, ${total} limites.`);
  if (changes.length === 0) {
    console.log('Aucune exception ne peut être abaissée.');
    return;
  }
  console.log('Exceptions à abaisser ou retirer :');
  for (const line of changes) console.log(`  - ${line}`);
  if (args.has('--ecrire')) {
    const sorted = Object.fromEntries(
      Object.keys(next)
        .sort()
        .map((k) => [k, next[k]]),
    );
    writeFileSync(EXCEPTIONS_FILE, `${JSON.stringify(sorted, null, 2)}\n`);
    console.log('qualite-exceptions.json mis à jour.');
  } else if (args.has('--verifier')) {
    console.error(
      'Des exceptions de qualité sont périmées : lancer `npm run qualite:bilan -- --ecrire` ' +
        'et valider le fichier mis à jour (docs/CONVENTIONS.md).',
    );
    process.exitCode = 1;
  }
}

/** Limites générales, lues dans `eslint.config.js` (source unique). */
async function loadLimits() {
  const config = require(join(ROOT, 'eslint.config.js'));
  const general = config.find(
    (entry) => entry.rules?.complexity && entry.files?.includes('src/**/*.ts'),
  );
  if (!general) throw new Error('limites générales introuvables dans eslint.config.js');
  const QUALITY_LIMITS = {};
  for (const [rule, setting] of Object.entries(general.rules)) {
    const option = setting[1];
    QUALITY_LIMITS[rule] = typeof option === 'number' ? option : option.max;
  }
  return { QUALITY_LIMITS };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
