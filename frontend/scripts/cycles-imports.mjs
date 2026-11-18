// Cycles d'import du code de production (docs/CONVENTIONS.md, chantier #686).
//
// Construit le graphe des imports **de valeurs** de `src/app` (les `import type` et les
// spécificateurs `type X` sont ignorés : ils disparaissent à la compilation) et cherche ses
// composantes fortement connexes. Un cycle à l'exécution rend l'ordre d'initialisation des
// modules fragile et empêche de comprendre un module sans les autres.
//
//   node scripts/cycles-imports.mjs   échoue si un cycle n'est pas dans ALLOWED_CYCLES, ou
//                                     si un cycle autorisé a disparu (à retirer de la liste)
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = join(ROOT, 'src', 'app');

/**
 * Cycles connus à l'audit du 2026-11-17, à supprimer (#687). Chaque entrée est la liste triée
 * des modules du cycle, relatifs à `src/app`. N'en ajouter aucun.
 */
export const ALLOWED_CYCLES = [
  [
    'sim/population.ts',
    'sim/species-catalog.ts',
    'sim/species-sheet.ts',
    'sim/treatment.ts',
    'sim/world.ts',
  ],
];

/**
 * Spécificateurs relatifs importés pour leur valeur par un fichier TypeScript : imports et
 * réexports, sauf `import type`, `export type` et les imports dont tous les noms sont `type`.
 */
export function valueImports(ts, fileName, text) {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, false);
  const specifiers = [];
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement)) {
      const clause = statement.importClause;
      if (clause?.isTypeOnly) continue;
      const bindings = clause?.namedBindings;
      const onlyTypes =
        clause !== undefined &&
        clause.name === undefined &&
        bindings !== undefined &&
        ts.isNamedImports(bindings) &&
        bindings.elements.length > 0 &&
        bindings.elements.every((element) => element.isTypeOnly);
      if (onlyTypes) continue;
      specifiers.push(statement.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(statement) && statement.moduleSpecifier) {
      if (statement.isTypeOnly) continue;
      const clause = statement.exportClause;
      if (clause && ts.isNamedExports(clause) && clause.elements.every((e) => e.isTypeOnly)) {
        continue;
      }
      specifiers.push(statement.moduleSpecifier.text);
    }
  }
  return specifiers.filter((specifier) => specifier.startsWith('.'));
}

/** Composantes fortement connexes de plus d'un nœud (ou à boucle sur soi), triées. */
export function stronglyConnected(graph) {
  let index = 0;
  const stack = [];
  const onStack = new Set();
  const indices = new Map();
  const lowlinks = new Map();
  const components = [];
  const visit = (node) => {
    indices.set(node, index);
    lowlinks.set(node, index);
    index++;
    stack.push(node);
    onStack.add(node);
    for (const next of graph.get(node) ?? []) {
      if (!graph.has(next)) continue;
      if (!indices.has(next)) {
        visit(next);
        lowlinks.set(node, Math.min(lowlinks.get(node), lowlinks.get(next)));
      } else if (onStack.has(next)) {
        lowlinks.set(node, Math.min(lowlinks.get(node), indices.get(next)));
      }
    }
    if (lowlinks.get(node) === indices.get(node)) {
      const component = [];
      let member;
      do {
        member = stack.pop();
        onStack.delete(member);
        component.push(member);
      } while (member !== node);
      const selfLoop = component.length === 1 && (graph.get(node) ?? []).includes(node);
      if (component.length > 1 || selfLoop) components.push(component.sort());
    }
  };
  for (const node of [...graph.keys()].sort()) {
    if (!indices.has(node)) visit(node);
  }
  return components.sort((a, b) => a[0].localeCompare(b[0]));
}

/** Cycles trouvés hors de la liste autorisée, et cycles autorisés qui n'existent plus. */
export function compareCycles(found, allowed) {
  const key = (cycle) => cycle.join(' ');
  const allowedKeys = new Set(allowed.map(key));
  const foundKeys = new Set(found.map(key));
  return {
    unexpected: found.filter((cycle) => !allowedKeys.has(key(cycle))),
    resolved: allowed.filter((cycle) => !foundKeys.has(key(cycle))),
  };
}

function productionFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return productionFiles(path);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts') ? [path] : [];
  });
}

function resolveImport(from, specifier, known) {
  const base = resolve(dirname(from), specifier);
  for (const candidate of [`${base}.ts`, join(base, 'index.ts'), base]) {
    if (known.has(candidate)) return candidate;
  }
  return null;
}

function main() {
  const ts = require('typescript');
  const files = productionFiles(APP);
  const known = new Set(files);
  const graph = new Map();
  for (const file of files) {
    const targets = valueImports(ts, file, readFileSync(file, 'utf8'))
      .map((specifier) => resolveImport(file, specifier, known))
      .filter((target) => target !== null)
      .map((target) => relative(APP, target).replaceAll('\\', '/'));
    graph.set(relative(APP, file).replaceAll('\\', '/'), targets);
  }
  const { unexpected, resolved } = compareCycles(stronglyConnected(graph), ALLOWED_CYCLES);
  for (const cycle of unexpected) {
    console.error(`Cycle d'import à l'exécution : ${cycle.join(' ↔ ')}`);
  }
  for (const cycle of resolved) {
    console.error(`Cycle supprimé, à retirer de ALLOWED_CYCLES : ${cycle.join(' ↔ ')}`);
  }
  if (unexpected.length > 0 || resolved.length > 0) {
    console.error('Voir docs/CONVENTIONS.md, « Dépendances entre modules ».');
    process.exitCode = 1;
    return;
  }
  console.log(
    `Cycles d'import : aucun nouveau (${files.length} modules, ${ALLOWED_CYCLES.length} connu).`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
