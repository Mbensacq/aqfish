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
    baseURL: `http://localhost:${PORT}`,
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
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !isCI,
    timeout: 180_000,
  },
});
