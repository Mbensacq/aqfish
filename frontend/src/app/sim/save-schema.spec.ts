import {
  describe as describeValue,
  field,
  finiteNumber,
  firstProblemOf,
  integerIn,
  numberIn,
  optional,
  problemsOf,
  readList,
  uint32,
  type FieldRule,
  type ListRule,
} from './save-schema';

describe('save-schema : validateurs composables (#686, lot 5)', () => {
  it('finiteNumber refuse NaN, les infinis et les autres types', () => {
    expect([0, -0, 1.5, -1e300].map(finiteNumber)).toEqual([true, true, true, true]);
    expect([NaN, Infinity, -Infinity, '1', null, undefined, true].map(finiteNumber)).toEqual(
      Array(7).fill(false),
    );
  });

  it('numberIn : bornes comprises, tolérance de part et d’autre', () => {
    const unit = numberIn(0, 1);
    expect([0, -0, 1, 0.5].map(unit)).toEqual([true, true, true, true]);
    expect([-1e-15, 1 + 1e-15, NaN, Infinity, '0.5'].map(unit)).toEqual(Array(5).fill(false));
    const tolerant = numberIn(-Math.PI, Math.PI, 1e-12);
    expect(tolerant(Math.PI + 1e-13)).toBe(true);
    expect(tolerant(-Math.PI - 1e-13)).toBe(true);
    expect(tolerant(Math.PI + 1e-11)).toBe(false);
  });

  it('integerIn et uint32 : entiers seulement, bornes comprises', () => {
    const quarter = integerIn(0, 3);
    expect([0, 3, -0].map(quarter)).toEqual([true, true, true]);
    expect([-1, 4, 1.5, NaN, '1'].map(quarter)).toEqual(Array(5).fill(false));
    expect([0, 2 ** 32 - 1].map(uint32)).toEqual([true, true]);
    expect([-1, 2 ** 32, 0.5, null].map(uint32)).toEqual(Array(4).fill(false));
  });

  it('optional accepte l’absence seulement (null n’est pas absent)', () => {
    const maybe = optional(finiteNumber);
    expect(maybe(undefined)).toBe(true);
    expect(maybe(2)).toBe(true);
    expect(maybe(null)).toBe(false);
    expect(maybe('2')).toBe(false);
  });

  it('field lit une propriété propre : les clés héritées valent absentes', () => {
    const rule = field('x', finiteNumber, 'x doit être un nombre fini');
    expect(rule.valid({ x: 1 })).toBe(true);
    expect(rule.valid(Object.create({ x: 1 }) as Record<string, unknown>)).toBe(false);
    const prototypeKey = field('constructor', optional(finiteNumber), 'jamais');
    expect(prototypeKey.valid({})).toBe(true);
  });

  it('message fixe ou calculé à partir de la valeur reçue', () => {
    const rules: FieldRule[] = [
      field('a', finiteNumber, 'a invalide'),
      field('b', finiteNumber, (v) => `b invalide (${describeValue(v)})`),
    ];
    expect(problemsOf({ a: 'x', b: 'texte' }, rules)).toEqual([
      'a invalide',
      'b invalide (« texte »)',
    ]);
    expect(problemsOf({ a: 1, b: 2 }, rules)).toEqual([]);
  });

  it('problemsOf relève tout dans l’ordre ; firstProblemOf s’arrête au premier', () => {
    const seen: string[] = [];
    const watched = (key: string): FieldRule => ({
      valid: () => {
        seen.push(key);
        return false;
      },
      message: key,
    });
    const rules = [watched('a'), watched('b'), watched('c')];
    expect(problemsOf({}, rules)).toEqual(['a', 'b', 'c']);
    seen.length = 0;
    expect(firstProblemOf({}, rules)).toBe('a');
    expect(seen).toEqual(['a']);
    expect(firstProblemOf({}, [])).toBeNull();
  });

  it('readList : liste bornée, sinon un seul problème et null', () => {
    const rule: ListRule = {
      key: 'tanks',
      min: 1,
      max: 2,
      countMessage: (count) => `effectif ${count}`,
    };
    const problems: string[] = [];
    expect(readList([1], rule, problems)).toEqual([1]);
    expect(readList([1, 2], rule, problems)).toEqual([1, 2]);
    expect(problems).toEqual([]);
    expect(readList([], rule, problems)).toBeNull();
    expect(readList([1, 2, 3], rule, problems)).toBeNull();
    expect(readList({ length: 1 }, rule, problems)).toBeNull();
    expect(readList(undefined, rule, problems)).toBeNull();
    expect(problems).toEqual([
      'effectif 0',
      'effectif 3',
      'tanks doit être une liste',
      'tanks doit être une liste',
    ]);
    expect(readList([], { key: 'food', max: 0, countMessage: () => 'x' }, problems)).toEqual([]);
  });

  it('describe : texte tronqué à 20 caractères, type pour les objets', () => {
    expect(describeValue('x'.repeat(21))).toBe(`« ${'x'.repeat(20)}… »`);
    expect(describeValue('court')).toBe('« court »');
    expect(describeValue(-0)).toBe('0');
    expect(describeValue(false)).toBe('false');
    expect(describeValue(undefined)).toBe('absente');
    expect(describeValue(null)).toBe('object');
    expect(describeValue([])).toBe('object');
  });
});
