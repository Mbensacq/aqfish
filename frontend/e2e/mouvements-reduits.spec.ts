import { expect, test, type Page } from '@playwright/test';

/**
 * Option « Réduire les mouvements » (#406) : initialisée sur `prefers-reduced-motion`,
 * réglable dans « Réglages » (section « Accessibilité »), mémorisée (`aqfish.mouvements-reduits`).
 * L'état est lu sur `data-aqfish-mouvements-reduits`, la caméra sur `data-aqfish-camera`.
 */

const host = (page: Page) => page.locator('app-aquarium-host');
const settings = (page: Page) => page.getByRole('button', { name: 'Réglages' });
const option = (page: Page) => page.getByRole('checkbox', { name: 'Réduire les mouvements' });

async function openScene(page: Page, search = ''): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`/${search}`);
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  return errors;
}

test.describe('préférence système « réduire les mouvements »', () => {
  // `reducedMotion` n'est pas une option de test : il passe par les options du contexte.
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('option cochée d’emblée, mouvements réduits', async ({ page }) => {
    const errors = await openScene(page);
    await expect(host(page)).toHaveAttribute('data-aqfish-mouvements-reduits', 'true');
    await settings(page).click();
    await expect(option(page)).toBeChecked();
    expect(errors).toEqual([]);
  });
});

test.describe('option des réglages', () => {
  test.use({ contextOptions: { reducedMotion: 'no-preference' } });

  test('décochée par défaut ; cochée, elle est appliquée et mémorisée au rechargement', async ({
    page,
  }) => {
    const errors = await openScene(page);
    await expect(host(page)).toHaveAttribute('data-aqfish-mouvements-reduits', 'false');
    await settings(page).click();
    await expect(option(page)).not.toBeChecked();
    await option(page).check();
    await expect(host(page)).toHaveAttribute('data-aqfish-mouvements-reduits', 'true');
    await page.reload();
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    await expect(host(page)).toHaveAttribute('data-aqfish-mouvements-reduits', 'true');
    await settings(page).click();
    await expect(option(page)).toBeChecked();
    // Décochée : mouvements normaux, choix mémorisé aussi.
    await option(page).uncheck();
    await expect(host(page)).toHaveAttribute('data-aqfish-mouvements-reduits', 'false');
    expect(errors).toEqual([]);
  });

  test('capture : le choix mémorisé est ignoré (images reproductibles)', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('aqfish.mouvements-reduits', 'reduits'));
    const errors = await openScene(page, '?capture=1&camera=front');
    await expect(host(page)).toHaveAttribute('data-aqfish-mouvements-reduits', 'false');
    expect(errors).toEqual([]);
  });
});
