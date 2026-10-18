import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { expect, test } from '@playwright/test';

/**
 * Harnais de captures (projet Playwright « captures »).
 *
 * Photographie l'application sous les 5 angles du contrat de capture (plus une vue
 * trois-quarts sans filtre pixel art, `filtre=aucun`), avec une
 * graine et un temps de simulation fixes, pour suivre l'évolution visuelle nuit
 * après nuit. Lancer : `npm run captures` (sortie : CAPTURE_DIR, par défaut
 * ../docs/captures/latest).
 *
 * Les angles et paramètres doivent rester alignés avec
 * src/app/core/capture/capture-params.ts et docs/ARCHITECTURE.md.
 */
const CAMERA_PRESETS = ['top', 'bottom', 'front', 'side', 'three-quarter'] as const;
const SEED = Number(process.env['CAPTURE_SEED'] ?? 42);
const TIME_SECONDS = Number(process.env['CAPTURE_TIME'] ?? 30);
const OUTPUT_DIR = resolve(
  process.env['CAPTURE_DIR'] ?? join(__dirname, '..', '..', 'docs', 'captures', 'latest'),
);

test.describe('Captures', () => {
  test.beforeAll(() => {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  for (const camera of CAMERA_PRESETS) {
    test(`angle ${camera}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));

      await page.goto(`/?capture=1&seed=${SEED}&camera=${camera}&time=${TIME_SECONDS}`);
      await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');

      await page.screenshot({ path: join(OUTPUT_DIR, `${camera}.png`), animations: 'disabled' });
      expect(errors).toEqual([]);
    });
  }

  // Filtre désactivé (issue #33) : capture supplémentaire, les 5 angles ci-dessus restent en
  // pixel art et inchangés.
  test('angle three-quarter sans filtre', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto(
      `/?capture=1&seed=${SEED}&camera=three-quarter&time=${TIME_SECONDS}&filtre=aucun`,
    );
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');

    await page.screenshot({
      path: join(OUTPUT_DIR, 'three-quarter-sans-filtre.png'),
      animations: 'disabled',
    });
    expect(errors).toEqual([]);
  });
});
