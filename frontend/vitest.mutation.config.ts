import { defineConfig } from 'vitest/config';

/**
 * Configuration Vitest autonome, utilisée seulement par StrykerJS (`npm run test:mutation`).
 *
 * Le code instrumenté par Stryker est plusieurs fois plus lent que le code normal : un délai
 * par défaut de 5 s fait échouer l'exécution à blanc sur les tests qui simulent plusieurs
 * minutes (#66). Le délai est donc relevé ici, et seulement ici : la CI normale (`ng test`)
 * garde ses délais. Les tests qui fixent leur propre délai (`it(nom, fn, 15_000)`) le voient
 * multiplié par `vitest.mutation.setup.ts`. Stryker applique en plus son propre délai par
 * mutant (`timeoutMS`, `timeoutFactor`) pour classer les boucles infinies en « Timeout ».
 */
export default defineConfig({
  test: {
    include: ['src/app/sim/**/*.spec.ts'],
    environment: 'node',
    globals: true,
    testTimeout: 120_000,
    hookTimeout: 120_000,
    setupFiles: ['./vitest.mutation.setup.ts'],
  },
});
