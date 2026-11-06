import { expect, test, type Page } from '@playwright/test';

/**
 * Courant d'eau (issue #460) : bouton « Courant » de la section « Eau » du panneau
 * « Réglages », qui passe de coupé à doux, fort, puis coupé ; manœuvrable au clavier, lisible
 * à 390 px, enregistré avec le bac (rechargement).
 */

const hostEl = (page: Page) => page.locator('app-aquarium-host');
const button = (page: Page) => page.locator('[data-section="eau"] [data-current]');

async function open(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  await page.getByRole('button', { name: 'Réglages' }).click();
  await expect(button(page)).toBeVisible();
  return errors;
}

test.describe('courant (#460)', () => {
  test('coupé par défaut, puis doux, fort et coupé au clavier ; gardé au rechargement', async ({
    page,
  }) => {
    const errors = await open(page);
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-current', 'coupe');
    await expect(button(page)).toHaveText('Courant : coupé');

    await button(page).focus();
    await page.keyboard.press('Enter');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-current', 'doux');
    await expect(button(page)).toHaveAccessibleName('Courant : doux, changer de force');
    await page.keyboard.press('Space');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-current', 'fort');
    await expect(button(page)).toHaveText('Courant : fort');

    await page.reload();
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-current', 'fort');
    await page.getByRole('button', { name: 'Réglages' }).click();
    await button(page).click();
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-current', 'coupe');
    expect(errors).toEqual([]);
  });

  test.describe('petit écran (390 × 844)', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('le bouton tient dans l’écran et se manœuvre', async ({ page }) => {
      const errors = await open(page);
      await button(page).scrollIntoViewIfNeeded();
      const box = await button(page).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(390);
      await button(page).click();
      await expect(hostEl(page)).toHaveAttribute('data-aqfish-current', 'doux');
      expect(errors).toEqual([]);
    });
  });
});
