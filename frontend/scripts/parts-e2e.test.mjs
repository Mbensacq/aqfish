// Tests de la répartition des parts e2e (#281) : `npm run test:outils`.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { distribute, parseListDurations, parseShard } from './parts-e2e.mjs';

test('parseShard : formes =N/M et N/M, autres arguments conservés dans l’ordre', () => {
  assert.deepEqual(parseShard(['--shard=2/6']), { shard: { current: 2, total: 6 }, rest: [] });
  assert.deepEqual(parseShard(['-x', '--shard', '6/6', '--reporter=list']), {
    shard: { current: 6, total: 6 },
    rest: ['-x', '--reporter=list'],
  });
  assert.deepEqual(parseShard([]), { shard: null, rest: [] });
  assert.deepEqual(parseShard(['e2e/vues.spec.ts']), { shard: null, rest: ['e2e/vues.spec.ts'] });
});

test('parseShard : valeurs invalides refusées', () => {
  for (const bad of ['0/6', '7/6', '1/0', 'a/b', '2', '', '-1/6', '1.5/6']) {
    assert.throws(() => parseShard([`--shard=${bad}`]), /--shard invalide/, bad);
  }
  assert.throws(() => parseShard(['--shard']), /--shard invalide/);
});

test('distribute : chaque fichier dans une seule part, parts équilibrées', () => {
  const durations = { a: 300, b: 200, c: 200, d: 100, e: 100, f: 100 };
  const parts = distribute(Object.keys(durations), durations, 3);
  assert.deepEqual(parts.flatMap((p) => p.files).sort(), ['a', 'b', 'c', 'd', 'e', 'f']);
  assert.deepEqual(
    parts.map((p) => p.seconds),
    [400, 300, 300],
  );
  // a (300) d'abord, puis f (100) dans la première des parts à égalité (300).
  assert.deepEqual(parts[0].files, ['a', 'f']);
});

test('distribute : déterministe, indépendant de l’ordre des fichiers et des égalités', () => {
  const durations = { x: 10, y: 10, z: 10, w: 10 };
  const one = distribute(['x', 'y', 'z', 'w'], durations, 2);
  const two = distribute(['w', 'z', 'y', 'x'], { w: 10, z: 10, y: 10, x: 10 }, 2);
  assert.deepEqual(one, two);
  assert.deepEqual(
    one.map((p) => p.files),
    [
      ['w', 'y'],
      ['x', 'z'],
    ],
  );
});

test('distribute : fichier sans durée compté à la moyenne ; aucune durée : 30 s', () => {
  const parts = distribute(['a', 'b', 'nouveau'], { a: 100, b: 50 }, 3);
  assert.equal(parts.find((p) => p.files.includes('nouveau')).seconds, 75);
  const blind = distribute(['a', 'b'], {}, 1);
  assert.equal(blind[0].seconds, 60);
  const invalid = distribute(['a', 'b'], { a: -5, b: Number.NaN }, 1);
  assert.equal(invalid[0].seconds, 60);
});

test('distribute : plus de parts que de fichiers, parts vides ; liste vide ; doublons', () => {
  const parts = distribute(['a', 'b'], { a: 1, b: 2 }, 4);
  assert.equal(parts.length, 4);
  assert.deepEqual(
    parts.map((p) => p.files.length),
    [1, 1, 0, 0],
  );
  assert.deepEqual(distribute([], {}, 2), [
    { files: [], seconds: 0 },
    { files: [], seconds: 0 },
  ]);
  assert.deepEqual(distribute(['a', 'a'], { a: 5 }, 1)[0].files, ['a']);
});

test('parseListDurations : lignes réussies et échouées, unités, tentatives additionnées', () => {
  const log = [
    '2026-11-01T17:40:52Z   ✓   1 [e2e] › e2e/affames.spec.ts:23:9 › Faim › vue front (1.4s)',
    '  ✓   2 [e2e] › e2e/affames.spec.ts:30:7 › Faim › valeurs (4.0s)',
    '  ✘   3 [e2e] › e2e/vues.spec.ts:10:3 › Vues › dessus (2.1m)',
    '  ✓   4 [e2e] › e2e/vues.spec.ts:10:3 › Vues › dessus (retry #1) (300ms)',
    '  -   5 [e2e] › e2e/vues.spec.ts:20:3 › Vues › ignoré',
    '##[notice]  63 passed (28.9m)',
    'Running 63 tests using 1 worker',
  ].join('\r\n');
  assert.deepEqual(parseListDurations(log), { 'affames.spec.ts': 5.4, 'vues.spec.ts': 126.3 });
  assert.deepEqual(parseListDurations(''), {});
});
