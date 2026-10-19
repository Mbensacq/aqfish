/**
 * Préparation des tests sous StrykerJS seulement (chargée par `vitest.mutation.config.ts`,
 * jamais par `ng test`).
 *
 * Certains tests de simulation fixent leur propre délai (`it(nom, fn, 15_000)`), qui prime sur
 * `testTimeout`. Sous le code instrumenté, plusieurs fois plus lent, ces délais sont dépassés
 * à l'exécution à blanc (#66). On multiplie donc ici tout délai numérique explicite par
 * `MUTATION_TIMEOUT_FACTOR`, sans toucher aux assertions ni aux délais de la CI normale.
 */

/** Ralentissement toléré du code instrumenté par rapport au code normal. */
export const MUTATION_TIMEOUT_FACTOR = 10;

type TestFn = (...args: unknown[]) => unknown;

/**
 * Enveloppe une fonction de déclaration de test (`it`, `test`) : le troisième argument, s'il
 * est un nombre (délai en ms), est multiplié par `factor`. La forme tabulée
 * `it.each(table)(nom, fn, délai)` est traitée de même ; les autres propriétés (`skip`,
 * `concurrent`…) restent celles de l'original.
 */
export function scaleExplicitTimeouts<T extends TestFn>(original: T, factor: number): T {
  if (!Number.isFinite(factor) || factor < 1) {
    throw new RangeError(`facteur de délai invalide : ${factor}`);
  }
  const scaleArgs = (args: unknown[]): unknown[] =>
    typeof args[2] === 'number' ? [args[0], args[1], args[2] * factor, ...args.slice(3)] : args;
  const wrap = <F extends TestFn>(fn: F): F =>
    new Proxy(fn, {
      apply: (target, thisArg, args: unknown[]) => Reflect.apply(target, thisArg, scaleArgs(args)),
    });
  return new Proxy(original, {
    apply: (target, thisArg, args: unknown[]) => Reflect.apply(target, thisArg, scaleArgs(args)),
    get(target, property, receiver) {
      const value: unknown = Reflect.get(target, property, receiver);
      if (property !== 'each' || typeof value !== 'function') {
        return value;
      }
      // `it.each(table)` renvoie la fonction de déclaration : c'est elle qui reçoit le délai.
      return (...table: unknown[]) => {
        const declare: unknown = Reflect.apply(value as TestFn, target, table);
        return typeof declare === 'function' ? wrap(declare as TestFn) : declare;
      };
    },
  });
}

const globals = globalThis as unknown as Record<'it' | 'test', TestFn | undefined>;
for (const name of ['it', 'test'] as const) {
  const original = globals[name];
  if (typeof original !== 'function') {
    throw new Error(`« ${name} » global absent : la configuration de mutation exige globals: true`);
  }
  globals[name] = scaleExplicitTimeouts(original, MUTATION_TIMEOUT_FACTOR);
}
