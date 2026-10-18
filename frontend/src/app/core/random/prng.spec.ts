import {
  assertSeed,
  createEntityPrng,
  createPrng,
  deriveSeed,
  MAX_SEED,
  prngNextState,
  prngOutput,
} from './prng';

function take(next: () => number, n: number): number[] {
  return Array.from({ length: n }, () => next());
}

describe('createPrng (mulberry32)', () => {
  it('même graine ⇒ même suite', () => {
    const a = createPrng(42);
    const b = createPrng(42);
    expect(take(a.next, 1000)).toEqual(take(b.next, 1000));
  });

  it('reproduit les valeurs de référence de mulberry32 (non-régression)', () => {
    // Valeurs de l'implémentation de référence de mulberry32 (Tommy Ettinger, version JS
    // répandue de bryc) : toute modification de l'algorithme changerait toutes les captures.
    expect(take(createPrng(0).nextUint32, 3)).toEqual([1144304738, 1416247, 958946056]);
    expect(take(createPrng(42).nextUint32, 3)).toEqual([2581720956, 1925393290, 3661312704]);
  });

  it('graines différentes ⇒ suites différentes', () => {
    const seeds = [0, 1, 2, 42, 43, 0x7fffffff, MAX_SEED];
    const suites = seeds.map((seed) => take(createPrng(seed).next, 8).join(','));
    expect(new Set(suites).size).toBe(seeds.length);
  });

  it('renvoie des réels dans [0, 1) et des entiers dans [0, 2^32)', () => {
    for (const seed of [0, 1, 42, MAX_SEED]) {
      const prng = createPrng(seed);
      for (let i = 0; i < 2000; i++) {
        const x = prng.next();
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThan(1);
        const u = prng.nextUint32();
        expect(Number.isInteger(u)).toBe(true);
        expect(u).toBeGreaterThanOrEqual(0);
        expect(u).toBeLessThanOrEqual(MAX_SEED);
      }
    }
  });

  it('a une distribution grossièrement uniforme (10 classes)', () => {
    const prng = createPrng(12345);
    const n = 20000;
    const bins = new Array<number>(10).fill(0);
    for (let i = 0; i < n; i++) {
      bins[Math.floor(prng.next() * 10)]++;
    }
    for (const count of bins) {
      expect(count).toBeGreaterThan(n / 10 - 300);
      expect(count).toBeLessThan(n / 10 + 300);
    }
  });

  it.each([-1, 1.5, MAX_SEED + 1, Number.NaN, Number.POSITIVE_INFINITY])(
    'refuse la graine invalide %s',
    (seed) => {
      expect(() => createPrng(seed)).toThrow(RangeError);
    },
  );
});

describe('prngNextState / prngOutput (état explicite)', () => {
  it.each([0, 1, 42, MAX_SEED])('même suite que createPrng(%s)', (seed) => {
    const expected = take(createPrng(seed).nextUint32, 100);
    let state = seed;
    const actual = take(() => {
      state = prngNextState(state);
      return prngOutput(state);
    }, 100);
    expect(actual).toEqual(expected);
  });

  it('l’état reste un entier 32 bits non signé (débordement compris)', () => {
    const state = prngNextState(MAX_SEED);
    expect(Number.isInteger(state)).toBe(true);
    expect(state).toBeGreaterThanOrEqual(0);
    expect(state).toBeLessThanOrEqual(MAX_SEED);
  });
});

describe('deriveSeed / createEntityPrng', () => {
  it('est déterministe et renvoie un entier 32 bits non signé', () => {
    for (const [seed, id] of [
      [0, 0],
      [42, 1],
      [MAX_SEED, MAX_SEED],
    ]) {
      const derived = deriveSeed(seed, id);
      expect(derived).toBe(deriveSeed(seed, id));
      expect(assertSeed(derived)).toBe(derived);
    }
  });

  it('reproduit les vecteurs de test publics de murmur3_32 (clé de 4 octets, petit-boutiste)', () => {
    expect(deriveSeed(0, 0)).toBe(0x2362f9de); // clé 00 00 00 00
    expect(deriveSeed(0, 0x87654321)).toBe(0xf55b516b); // clé 21 43 65 87
    expect(deriveSeed(0x5082edee, 0x87654321)).toBe(0x2362f9de);
    expect(deriveSeed(0, 0xffffffff)).toBe(0x76293b50);
  });

  it('identifiants voisins ⇒ graines et suites différentes', () => {
    const ids = Array.from({ length: 1000 }, (_, i) => i);
    const seeds = new Set(ids.map((id) => deriveSeed(42, id)));
    expect(seeds.size).toBe(ids.length);
    expect(take(createEntityPrng(42, 1).next, 5)).not.toEqual(
      take(createEntityPrng(42, 2).next, 5),
    );
  });

  it('graines de monde différentes ⇒ sous-générateurs différents pour une même entité', () => {
    expect(deriveSeed(42, 7)).not.toBe(deriveSeed(43, 7));
  });

  it("ne renvoie pas la graine du monde telle quelle (l'entité 0 a son propre hasard)", () => {
    expect(deriveSeed(42, 0)).not.toBe(42);
    expect(take(createEntityPrng(42, 0).next, 5)).not.toEqual(take(createPrng(42).next, 5));
  });

  it("ajouter une entité ne change pas la suite des autres, quel que soit l'ordre des tirages", () => {
    // Monde à deux entités, tirages entrelacés.
    const a1 = createEntityPrng(42, 1);
    const a2 = createEntityPrng(42, 2);
    const before1: number[] = [];
    const before2: number[] = [];
    for (let i = 0; i < 50; i++) {
      before1.push(a1.next());
      before2.push(a2.next());
    }

    // Même monde avec une troisième entité qui tire entre les deux autres.
    const b1 = createEntityPrng(42, 1);
    const b2 = createEntityPrng(42, 2);
    const b3 = createEntityPrng(42, 3);
    const after1: number[] = [];
    const after2: number[] = [];
    for (let i = 0; i < 50; i++) {
      after1.push(b1.next());
      b3.next();
      b3.next();
      after2.push(b2.next());
    }

    expect(after1).toEqual(before1);
    expect(after2).toEqual(before2);
  });

  it.each([
    [-1, 0],
    [0, -1],
    [0, 0.5],
    [0, MAX_SEED + 1],
  ])('refuse graine %s / identifiant %s', (seed, id) => {
    expect(() => deriveSeed(seed, id)).toThrow(RangeError);
  });
});
