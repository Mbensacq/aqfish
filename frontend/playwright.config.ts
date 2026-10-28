import { defineConfig, devices } from '@playwright/test';

/**
 * Deux projets :
 * - e2e      : tests de bout en bout (npm run e2e)
 * - captures : harnais de captures sous 5 angles (npm run captures), hors e2e
 *
 * Le rendu WebGL fonctionne sans GPU (rendu logiciel SwiftShader) : il est lent,
 * donc les délais sont larges, et les mesures de performance n'ont aucun sens ici.
 */
const PORT = Number(process.env['E2E_PORT'] ?? 4300);
const isCI = !!process.env['CI'];
const BASE_URL = `http://localhost:${PORT}`;

/**
 * Stockage de départ de chaque test (#240, ADR 0072) : « Guide du débutant » déjà vu, pour
 * qu'il ne s'ouvre pas à la première visite par-dessus l'interface. `e2e/guide-debutant.spec.ts`
 * repart d'un stockage vide pour tester cette première visite. Clé et valeur :
 * `BEGINNER_GUIDE_STORAGE_KEY` et `BEGINNER_GUIDE_SEEN` (`ui/beginner-guide`).
 */
const STORAGE_STATE = {
  cookies: [],
  origins: [
    { origin: BASE_URL, localStorage: [{ name: 'aqfish.guide-debutant.v1', value: 'vu' }] },
  ],
};

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 60_000 },
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: BASE_URL,
    storageState: STORAGE_STATE,
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'e2e',
      testIgnore: /captures\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } },
    },
    {
      name: 'captures',
      testMatch: /captures\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } },
    },
  ],
  webServer: {
    command: `npx ng serve --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !isCI,
    timeout: 180_000,
  },
});
