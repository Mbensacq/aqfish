import { expect, test } from '@playwright/test';

/**
 * Filtre d'un bac ajouté (issue #538) : ajouter un bac ne touche pas le filtre mûr du bac de
 * départ, et le bac ajouté (posé) reste non sélectionnable. Le filtre neuf lui-même est couvert
 * par `sim/filter-maturation.spec.ts`.
 */
test('bac ajouté : bac de départ inchangé, bac posé non sélectionnable (#538)', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  await page.getByRole('button', { name: 'Réglages' }).click();
  await page.getByRole('slider', { name: 'Vitesse de la simulation' }).fill('0');

  const button = page.locator('[data-bacteria-starter]');
  const message = page.locator('[data-starter-message]');
  // Bac de départ : filtre mûr.
  await button.click();
  await expect(message).toContainText('Filtre déjà mûr');

  await page.getByRole('checkbox', { name: 'Afficher la pièce' }).check();
  const catalog = page.locator('[data-section="bacs-meubles"]');
  await expect(catalog).toBeVisible();
  await catalog.getByRole('button', { name: 'Ajouter le bac' }).click();
  const host = page.locator('app-aquarium-host');
  await expect(host).toHaveAttribute('data-aqfish-room-tanks', '2');

  // Un bac posé figure dans la liste mais n'est pas sélectionnable (ADR 0075) : son filtre neuf
  // n'est donc pas encore observable par l'amorce ; le bac de départ garde son filtre mûr.
  await expect(page.locator('[data-section="bacs"] [data-tank="1"] button')).toBeDisabled();
  await button.click();
  await expect(message).toContainText('Filtre déjà mûr');
  expect(errors).toEqual([]);
});
