import { defineConfig } from 'vitest/config';

/** Configuration Vitest autonome, utilisée seulement par StrykerJS (`npm run test:mutation`). */
export default defineConfig({
  test: {
    include: ['src/app/sim/**/*.spec.ts'],
    environment: 'node',
    globals: true,
  },
});
