// Rapporteur Vitest qui liste les tests lents restés sur le délai par défaut (5 s) : piège
// « délai Vitest ≠ borne mesurée » de docs/PIEGES.md (#44, #244). Ne remplace pas `ng test`.
//
// Depuis frontend/ (specs sans Angular : sim, render, core) :
//   npx vitest run --globals --includeTaskLocation src/app/sim \
//     --reporter=./scripts/durees-tests.mjs
// Variables facultatives : SEUIL_MS (400 par défaut), SORTIE (fichier JSON de tous les tests).
import { writeFileSync } from 'node:fs';
import { relative } from 'node:path';

const DEFAULT_TIMEOUT_MS = 5000;
const threshold = Number(process.env.SEUIL_MS ?? 400);

export default class DureesTests {
  onTestRunEnd(testModules) {
    const rows = [];
    for (const module of testModules) {
      for (const test of module.children.allTests()) {
        rows.push({
          file: relative(process.cwd(), module.moduleId),
          line: test.location?.line ?? null,
          name: test.fullName,
          state: test.result().state,
          durationMs: Math.round(test.diagnostic()?.duration ?? 0),
          timeoutMs: test.options.timeout ?? DEFAULT_TIMEOUT_MS,
        });
      }
    }
    if (process.env.SORTIE) {
      writeFileSync(process.env.SORTIE, JSON.stringify(rows, null, 2));
    }
    const slow = rows
      .filter((r) => r.timeoutMs === DEFAULT_TIMEOUT_MS && r.durationMs >= threshold)
      .sort((a, b) => b.durationMs - a.durationMs);
    const failed = rows.filter((r) => r.state === 'failed').length;
    console.log(`${rows.length} tests, ${failed} en échec.`);
    console.log(`${slow.length} test(s) à ${threshold} ms ou plus sur le délai par défaut :`);
    for (const r of slow) {
      console.log(`  ${r.durationMs} ms  ${r.file}:${r.line}  ${r.name}`);
    }
  }
}
