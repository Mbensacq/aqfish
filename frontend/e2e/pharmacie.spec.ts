import { expect, test } from '@playwright/test';

/**
 * Pharmacie du bac (#533) : ouverte au clavier depuis son bouton, conseil selon l'alerte la
 * plus grave (points blancs : le médicament), Tab qui tourne dans le panneau, Échap qui ferme
 * et rend le focus au bouton ; exclusive avec le wiki et « Réglages ». Simulation à l'arrêt.
 */

const toggle = '[data-pharmacy-toggle]';
const panel = '#pharmacie-bac';

test('pharmacie : ouverte et parcourue au clavier, focus rendu à la fermeture', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?seed=42&camera=front&heure=12&vitesse=0&points-blancs=1');
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');

  await page.locator(toggle).focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Pharmacie du bac' });
  await expect(dialog).toBeVisible();
  await expect(page.locator(toggle)).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#pharmacie-bac-titre')).toBeFocused();
  await expect(page.locator('[data-pharmacy-advice]')).toHaveAttribute(
    'data-product',
    'medicament',
  );
  await expect(page.locator('[data-pharmacy-advice]')).toContainText('Points blancs');
  await expect(page.locator('[data-pharmacy-product]')).toHaveCount(7);

  // Tab : « Fermer », puis le lien du wiki, puis retour à « Fermer » (focus gardé).
  await page.keyboard.press('Tab');
  await expect(page.locator('[data-pharmacy-close]')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('[data-pharmacy-wiki]')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('[data-pharmacy-close]')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('[data-pharmacy-wiki]')).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(page.locator(panel)).toHaveCount(0);
  await expect(page.locator(toggle)).toBeFocused();
  await expect(page.locator(toggle)).toHaveAttribute('aria-expanded', 'false');

  // « Fermer » au clavier : même retour du focus.
  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(page.locator(panel)).toHaveCount(0);
  await expect(page.locator(toggle)).toBeFocused();
  expect(errors).toEqual([]);
});

test('pharmacie : exclusive avec le wiki et « Réglages »', async ({ page }) => {
  await page.goto('/?seed=42&camera=front&heure=12&vitesse=0');
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');

  await page.locator(toggle).click();
  await expect(page.locator(panel)).toBeVisible();
  await expect(page.locator('[data-pharmacy-advice]')).toContainText('Aucune alerte');

  // Lien vers « Produits et traitements » : le wiki s'ouvre et la pharmacie se replie.
  await page.locator('[data-pharmacy-wiki]').click();
  await expect(page.locator('#wiki-especes')).toBeVisible();
  await expect(page.locator(panel)).toHaveCount(0);

  await page.locator(toggle).click();
  await expect(page.locator(panel)).toBeVisible();
  await expect(page.locator('#wiki-especes')).toHaveCount(0);

  await page.getByRole('button', { name: 'Réglages' }).click();
  await expect(page.locator('.control-panel')).toBeVisible();
  await expect(page.locator(panel)).toHaveCount(0);
});
