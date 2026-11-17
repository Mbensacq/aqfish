import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { maximaByRule, measuredValue, tightenedException } from './qualite-bilan.mjs';

const LIMITS = {
  'max-lines': 600,
  'max-lines-per-function': 80,
  complexity: 15,
  'max-depth': 4,
  'max-params': 5,
};

describe('qualite-bilan : lecture des messages ESLint', () => {
  it('lit la valeur des messages de chaque règle', () => {
    assert.equal(measuredValue("Function 'f' has a complexity of 23. Maximum allowed is 0."), 23);
    assert.equal(measuredValue('File has too many lines (812). Maximum allowed is 0.'), 812);
    assert.equal(measuredValue('Blocks are nested too deeply (5). Maximum allowed is 0.'), 5);
    assert.equal(measuredValue('message sans valeur'), null);
  });

  it('garde le maximum par règle et ignore les autres règles', () => {
    const maxima = maximaByRule([
      { ruleId: 'complexity', message: 'has a complexity of 4.' },
      { ruleId: 'complexity', message: 'has a complexity of 19.' },
      { ruleId: 'max-params', message: 'has too many parameters (7).' },
      { ruleId: 'no-console', message: 'Unexpected console (3).' },
      { ruleId: null, message: 'Parsing error (1).' },
    ]);
    assert.deepEqual(maxima, { complexity: 19, 'max-params': 7 });
  });
});

describe('qualite-bilan : cliquet des exceptions', () => {
  it('abaisse une exception à la valeur mesurée', () => {
    assert.deepEqual(tightenedException({ complexity: 30 }, { complexity: 22 }, LIMITS), {
      complexity: 22,
    });
  });

  it('retire une règle repassée sous la limite, et le fichier quand plus rien ne dépasse', () => {
    assert.deepEqual(
      tightenedException(
        { complexity: 30, 'max-lines': 900 },
        { complexity: 12, 'max-lines': 700 },
        LIMITS,
      ),
      { 'max-lines': 700 },
    );
    assert.equal(tightenedException({ complexity: 30 }, { complexity: 15 }, LIMITS), null);
  });

  it('ne relève jamais une exception', () => {
    assert.deepEqual(tightenedException({ complexity: 20 }, { complexity: 25 }, LIMITS), {
      complexity: 20,
    });
  });
});
