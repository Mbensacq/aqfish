import { expect, test, type Page } from '@playwright/test';

import { openScene } from './outils-decor';

/**
 * Mode immersif, choix du bac (issue #375) : appui long, choix du récif dans l'interface
 * minimale (au clavier puis à la souris), retour au bac tropical, sans erreur. Au téléphone
 * seulement (390 px, portrait) : le parcours complet à l'ordinateur est déjà long en rendu
 * logiciel (`mode-immersif.spec.ts`). L'image du récif est jointe au rapport.
 */

const overlay = (page: Page) => page.locator('app-immersive-mode');

test('mode immersif (#375) : choisir un autre bac, telephone', async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  const errors = await openScene(page);

  await page.getByRole('button', { name: 'Réglages' }).click();
  await page.getByRole('button', { name: 'Mode immersif' }).click();
  await expect(overlay(page)).toHaveAttribute('data-immersive-tank', 'tropical');

  await test.step('appui long : l’interface montre le choix du bac', async () => {
    // L'interface se cache seule (5 s et 15 images) ; l'appui long la rend.
    await expect(overlay(page)).toHaveAttribute('data-immersive-ui', 'hidden', {
      timeout: 120_000,
    });
    await page.mouse.move(195, 422);
    await page.mouse.down();
    await page.waitForTimeout(900);
    await page.mouse.up();
    await expect(overlay(page)).toHaveAttribute('data-immersive-ui', 'visible');
    const group = page.getByRole('group', { name: 'Bac' });
    await expect(group.getByRole('radio', { name: 'Bac tropical' })).toBeChecked();
    await expect(group.getByRole('radio', { name: 'Récif' })).not.toBeChecked();
  });

  await test.step('au clavier : flèche vers le récif', async () => {
    const screenMm = await overlay(page).getAttribute('data-immersive-screen-mm');
    // Toute touche rend l'interface : le choix se fait sans qu'elle se cache.
    await page.keyboard.press('Shift');
    await page.getByRole('radio', { name: 'Bac tropical' }).focus();
    await page.keyboard.press('ArrowDown');
    await expect(overlay(page)).toHaveAttribute('data-immersive-tank', 'recif');
    await expect(page.getByRole('radio', { name: 'Récif' })).toBeChecked();
    await expect(overlay(page)).toHaveAttribute('data-immersive-ui', 'visible');
    // Même écran : même taille, étalonnage inchangé.
    await expect(overlay(page)).toHaveAttribute('data-immersive-screen-mm', screenMm!);
    await page.waitForTimeout(500);
    await page.keyboard.press('Shift');
    const shot = testInfo.outputPath('immersif-telephone-recif.png');
    await page.screenshot({ path: shot });
    await testInfo.attach('immersif-telephone-recif.png', { path: shot, contentType: 'image/png' });
  });

  await test.step('à la souris : retour au bac tropical, puis sortie', async () => {
    await page.keyboard.press('Shift');
    await page.getByRole('radio', { name: 'Bac tropical' }).check();
    await expect(overlay(page)).toHaveAttribute('data-immersive-tank', 'tropical');
    await page.keyboard.press('Escape');
    await expect(overlay(page)).toHaveCount(0);
  });

  expect(errors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
