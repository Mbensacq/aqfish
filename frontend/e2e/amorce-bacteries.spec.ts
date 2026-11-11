import { expect, test } from '@playwright/test';

import { createDayClock } from '../src/app/sim/daylight';
import { serializeWorld } from '../src/app/sim/save';
import { createDefaultWorld, type MutableWorld } from '../src/app/sim/world';

/**
 * Amorce de bactéries (issue #529) : le bouton s'atteint au clavier et le geste est annoncé,
 * refusé sur un filtre mûr puis accepté sur un filtre importé plus faible. Le renvoi au wiki
 * du message ouvre la page « Produits et traitements » (#554).
 */
test('amorce de bactéries : clavier et annonce (#529)', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  await page.getByRole('button', { name: 'Réglages' }).click();

  const button = page.locator('[data-bacteria-starter]');
  const message = page.locator('[data-starter-message]');
  await button.focus();
  await expect(button).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(message).toHaveAttribute('role', 'status');
  await expect(message).toContainText('Filtre déjà mûr');
  // Le renvoi au wiki est un lien (#554) : il ouvre la page « Produits et traitements ».
  const link = message.locator('[data-products-link]');
  await expect(link).toHaveText('Produits et traitements');
  await link.click();
  await expect(page.locator('[data-wiki-page-view="produits"]')).toBeVisible();
  await page.getByRole('button', { name: 'Réglages' }).click();

  const world = createDefaultWorld(11, 'tropical') as MutableWorld;
  world.water = { ...world.water, filter: 0.2 };
  await page.locator('[data-section="sauvegarde"] input[type="file"]').setInputFiles({
    name: 'amorce.json',
    mimeType: 'application/json',
    buffer: Buffer.from(serializeWorld(world, { speed: 0, clock: createDayClock(12, 1200, true) })),
  });
  await expect(page.locator('app-aquarium-host')).toHaveAttribute('data-aqfish-speed', '0');

  await button.focus();
  await page.keyboard.press('Enter');
  await expect(message).toContainText('Amorce de bactéries versée');
  // Efficacité du filtre affichée (#538).
  await expect(message).toContainText('efficace à 20 %');
});
