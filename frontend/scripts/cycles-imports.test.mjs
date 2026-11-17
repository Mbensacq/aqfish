import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';

import { compareCycles, stronglyConnected, valueImports } from './cycles-imports.mjs';

const ts = createRequire(import.meta.url)('typescript');

describe('cycles-imports : imports de valeurs', () => {
  it('garde les imports et réexports de valeurs relatifs', () => {
    const text = [
      "import { a } from './a';",
      "import * as b from './b';",
      "import c from '../c';",
      "import './effet';",
      "export { d } from './d';",
      "export * from './e';",
      "import { Vector3 } from 'three';",
    ].join('\n');
    assert.deepEqual(valueImports(ts, 'x.ts', text), [
      './a',
      './b',
      '../c',
      './effet',
      './d',
      './e',
    ]);
  });

  it('ignore les imports et réexports de types seuls', () => {
    const text = [
      "import type { A } from './a';",
      "import { type B, type C } from './b';",
      "export type { D } from './d';",
      "export { type E } from './e';",
      "import { type F, g } from './g';",
    ].join('\n');
    assert.deepEqual(valueImports(ts, 'x.ts', text), ['./g']);
  });
});

describe('cycles-imports : composantes fortement connexes', () => {
  it('trouve un cycle, ignore les chaînes et les cibles inconnues', () => {
    const graph = new Map([
      ['a.ts', ['b.ts']],
      ['b.ts', ['c.ts', 'externe.ts']],
      ['c.ts', ['a.ts']],
      ['d.ts', ['a.ts']],
    ]);
    assert.deepEqual(stronglyConnected(graph), [['a.ts', 'b.ts', 'c.ts']]);
  });

  it('signale une boucle sur soi-même', () => {
    assert.deepEqual(stronglyConnected(new Map([['a.ts', ['a.ts']]])), [['a.ts']]);
  });

  it('aucun cycle dans un graphe sans retour', () => {
    const graph = new Map([
      ['a.ts', ['b.ts']],
      ['b.ts', []],
    ]);
    assert.deepEqual(stronglyConnected(graph), []);
  });
});

describe('cycles-imports : comparaison à la liste autorisée', () => {
  it('sépare les nouveaux cycles et les cycles supprimés', () => {
    const found = [
      ['a.ts', 'b.ts'],
      ['x.ts', 'y.ts'],
    ];
    const allowed = [
      ['a.ts', 'b.ts'],
      ['m.ts', 'n.ts'],
    ];
    assert.deepEqual(compareCycles(found, allowed), {
      unexpected: [['x.ts', 'y.ts']],
      resolved: [['m.ts', 'n.ts']],
    });
  });
});
