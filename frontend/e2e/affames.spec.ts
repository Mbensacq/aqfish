import { expect, test, type Page } from '@playwright/test';

/**
 * Faim et santé (issue #208), parcours QA : la scène « affamés » et ses variantes de
 * paramètre se chargent sans erreur, quelle que soit la vue, en mode capture comme en direct.
 */

async function open(page: Page, query: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  await page.goto(`/${query}`);
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  return errors;
}

test.describe('Faim et santé (#208)', () => {
  for (const camera of ['front', 'side', 'top', 'bottom']) {
    test(`affames=1, vue ${camera} : rendu sans erreur`, async ({ page }) => {
      const errors = await open(page, `?capture=1&seed=42&time=30&affames=1&camera=${camera}`);
      await expect(page.locator('canvas').first()).toBeVisible();
      expect(errors).toEqual([]);
    });
  }

  test('valeurs inattendues de affames : ignorées, rendu sans erreur', async ({ page }) => {
    for (const value of ['0', 'oui', '', '1e9', '-1']) {
      const errors = await open(page, `?capture=1&seed=42&time=10&affames=${value}`);
      expect(errors, `affames=${value}`).toEqual([]);
    }
  });

  test('en direct, affames est ignoré et la simulation avance sans erreur', async ({ page }) => {
    const errors = await open(page, '?seed=42&affames=1');
    await expect(page.locator('canvas').first()).toBeVisible();
    await page.waitForTimeout(500);
    expect(errors).toEqual([]);
  });
});
