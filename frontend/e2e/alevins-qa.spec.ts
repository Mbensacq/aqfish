import { expect, test } from '@playwright/test';

/**
 * Alevins de guppy (issue #459) : en capture avec `alevins=1`, des alevins naissent et
 * peuplent le bac ; la population reste bornée et la page ne lève aucune erreur. Sans le
 * paramètre, le bac par défaut ne compte aucun alevin supplémentaire.
 */

function guppyCount(population: string | null): number {
  const match = /(?:^|,)guppy:(\d+)/.exec(population ?? '');
  return match ? Number(match[1]) : 0;
}

async function open(page: import('@playwright/test').Page, query: string): Promise<string | null> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`/?capture=1&seed=42&camera=three-quarter&time=0${query}`);
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  expect(errors).toEqual([]);
  return page.locator('[data-aqfish-population]').first().getAttribute('data-aqfish-population');
}

test.describe('Alevins de guppy', () => {
  test('alevins=1 : plus de guppys qu’au bac par défaut, sans erreur', async ({ page }) => {
    const base = await open(page, '');
    const withFry = await open(page, '&alevins=1');
    expect(guppyCount(base)).toBeGreaterThan(0);
    expect(guppyCount(withFry)).toBeGreaterThan(guppyCount(base));
  });

  test('alevins=1 : stable en petite fenêtre (390 × 844)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const population = await open(page, '&alevins=1');
    expect(guppyCount(population)).toBeGreaterThan(0);
  });

  for (const camera of ['front', 'top', 'bottom']) {
    test(`alevins=1 : vue « ${camera} » sans erreur, autre graine (#566)`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`/?capture=1&seed=7&camera=${camera}&time=0&alevins=1`);
      await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
      const population = await page
        .locator('[data-aqfish-population]')
        .first()
        .getAttribute('data-aqfish-population');
      expect(guppyCount(population)).toBeGreaterThan(0);
      expect(errors).toEqual([]);
    });
  }
});
