import { expect, test, type Page } from '@playwright/test';

/**
 * Indicateur du moment de la journée (issue #73) : icône soleil / lune en pixel art, nom
 * accessible qui suit l'heure, lisible sur petit écran, absent en mode capture.
 */

const indicator = (page: Page) => page.getByRole('img', { name: /Moment de la journée/ });

async function open(page: Page, search: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`/${search}`);
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  return errors;
}

test.describe('Indicateur du moment de la journée', () => {
  test('suit l’heure : jour à midi, nuit avec N, jour avec J, crépuscule à 18 h', async ({
    page,
  }) => {
    const errors = await open(page, '');
    await expect(indicator(page)).toHaveAccessibleName('Moment de la journée : jour');
    await expect(indicator(page)).toHaveAttribute('data-phase', 'jour');
    await page.keyboard.press('n');
    await expect(indicator(page)).toHaveAccessibleName('Moment de la journée : nuit');
    await page.keyboard.press('j');
    await expect(indicator(page)).toHaveAccessibleName('Moment de la journée : jour');
    await open(page, '?heure=18');
    await expect(indicator(page)).toHaveAccessibleName('Moment de la journée : crépuscule');
    await open(page, '?heure=6');
    await expect(indicator(page)).toHaveAccessibleName('Moment de la journée : aube');
    expect(errors).toEqual([]);
  });

  test('à 390 px : visible, entier, sans chevaucher l’aide-mémoire', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, '?heure=0');
    const box = await indicator(page).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    // Assez grand pour être lu : au moins 27 px de côté (icône 9 × 9 à 3 px par pixel).
    expect(box!.width).toBeGreaterThanOrEqual(27);
    const help = await page.locator('app-commands-help button').first().boundingBox();
    expect(help).not.toBeNull();
    const overlaps =
      box!.x < help!.x + help!.width &&
      help!.x < box!.x + box!.width &&
      box!.y < help!.y + help!.height &&
      help!.y < box!.y + box!.height;
    expect(overlaps).toBe(false);
  });

  test('mode capture : aucun indicateur', async ({ page }) => {
    await open(page, '?capture=1&heure=0');
    await expect(page.locator('app-day-indicator')).toHaveCount(0);
  });
});
