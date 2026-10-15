import { expect, test } from '@playwright/test';

test.describe('Démarrage', () => {
  test("l'application se charge sans erreur dans la console", async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') {
        errors.push(message.text());
      }
    });
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/');

    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    await expect(page).toHaveTitle(/aqfish/i);
    expect(errors).toEqual([]);
  });
});
