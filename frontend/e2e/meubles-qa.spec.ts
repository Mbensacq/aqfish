import { expect, test, type Page } from '@playwright/test';

/**
 * Meubles de la pièce (issue #188), parcours QA : mode capture avec `piece=1&meubles=…`.
 * Entrées extrêmes ou mal formées sans erreur, pièce masquée sans effet, petite fenêtre,
 * même URL ⇒ mêmes octets.
 */

const CAM = 'camera=three-quarter';
const SHELF = 'etagere:-1.25:-0.17:0';
const PLANT_ON_SHELF = 'plante-pot:-1.4:-0.17:0';

async function open(page: Page, search: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  await page.goto(`/?capture=1&seed=42&time=1&${search}`);
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  return errors;
}

const shot = (page: Page) => page.locator('canvas').screenshot({ animations: 'disabled' });

test.describe('Meubles de la pièce (#188), parcours QA', () => {
  test.setTimeout(180_000);

  test('même URL ⇒ mêmes octets ; les meubles changent l’image de la pièce', async ({ page }) => {
    const query = `${CAM}&piece=1&meubles=${SHELF},${PLANT_ON_SHELF}`;
    const errors = await open(page, query);
    const first = await shot(page);
    await open(page, query);
    const second = await shot(page);
    expect(second.equals(first)).toBe(true);
    await open(page, `${CAM}&piece=1`);
    expect((await shot(page)).equals(first)).toBe(false);
    expect(errors).toEqual([]);
  });

  test('pièce masquée : meubles= sans effet sur l’image', async ({ page }) => {
    await open(page, CAM);
    const without = await shot(page);
    const errors = await open(page, `${CAM}&meubles=${SHELF}`);
    expect((await shot(page)).equals(without)).toBe(true);
    expect(errors).toEqual([]);
  });

  test('entrées extrêmes, inconnues ou mal formées : aucune erreur', async ({ page }) => {
    const hostile = [
      'inconnu:0:0:0',
      'etagere:abc:0:0',
      'etagere:1e9:0:0',
      'etagere:-99999:99999:0',
      'etagere:0:0:7',
      'etagere:0:0',
      'ETAGERE:0:0:0',
      ',,,',
      Array.from({ length: 200 }, () => 'table-basse:0:0:1').join(','),
    ];
    for (const entry of hostile) {
      const errors = await open(page, `piece=1&meubles=${encodeURIComponent(entry)}`);
      expect(errors, entry.slice(0, 40)).toEqual([]);
    }
  });

  test('petite fenêtre (390 × 844), quatre graines : sans erreur', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const seed of [0, 1, 7, 4294967295]) {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`/?capture=1&seed=${seed}&time=1&piece=1&meubles=${SHELF},${PLANT_ON_SHELF}`);
      await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
      expect(errors, `graine ${seed}`).toEqual([]);
    }
  });
});
