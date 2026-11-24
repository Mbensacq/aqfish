import { describe, expect, it } from 'vitest';

import { SPECIES } from './species';
import { verdict } from './verdict';
import { allPairs, reasonSource, reasonText, verdictMatrixMarkdown } from './verdict-matrix';

const COUNT = Object.keys(SPECIES).length;

describe('matrice des verdicts (#816)', () => {
  it('toutes les paires d’espèces différentes, une seule fois', () => {
    expect(allPairs()).toHaveLength((COUNT * (COUNT - 1)) / 2);
  });

  it('grille : une ligne par espèce, une colonne par espèce', () => {
    const rows = verdictMatrixMarkdown()
      .split('\n')
      .filter((line) => /^\| \d+\. /.test(line));
    expect(rows).toHaveLength(COUNT);
    for (const row of rows) {
      expect(row.split('|').length - 3).toBe(COUNT);
    }
  });

  it('chaque paire défavorable de même eau est détaillée avec la source de chaque raison', () => {
    const markdown = verdictMatrixMarkdown();
    for (const { first, second } of allPairs()) {
      const v = verdict(first, second);
      const sameWater = !v.reasons.some(
        (r) => r.cause === 'salinite' || r.cause === 'classe-thermique',
      );
      for (const r of sameWater ? v.reasons : []) {
        expect(markdown).toContain(`${reasonText(r)} [${reasonSource(r)}]`);
      }
    }
  });

  it('désaccords entre sources affichés', () => {
    expect(verdictMatrixMarkdown()).toMatch(/Désaccords entre sources :\n\n- .*désaccord/);
  });

  it('crevette cerise et poisson rouge : source de la prédation lisible hors du dépôt', () => {
    const predation = verdict('cerise', 'rouge').reasons.find((r) => r.axis === 'predation');
    expect(predation && reasonSource(predation)).toMatch(/^https:\/\/www\.practicalfishkeeping/);
  });
});
