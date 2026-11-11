import { expect, test } from '@playwright/test';

/**
 * Filtre d'un bac ajouté (issues #538 et #553) : ajouter un bac ne touche pas le filtre mûr du
 * bac de départ ; le bac ajouté (posé) reste non sélectionnable, mais son filtre neuf s'amorce
 * depuis la liste des bacs (groupe « Quarantaine »). La maturation elle-même est couverte par
 * `sim/filter-maturation.spec.ts`, l'amorce d'un bac posé par `sim/quarantine.spec.ts`.
 */
test('bac ajouté : filtre neuf amorcé depuis la liste, bac de départ inchangé (#538, #553)', async ({
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

  // Un bac posé figure dans la liste sans être sélectionnable (ADR 0075) ; son filtre neuf
  // s'amorce d'ici (#553), sans toucher au filtre mûr du bac de départ.
  const list = page.locator('[data-section="bacs"]');
  await expect(list.locator('[data-tank="1"] button')).toBeDisabled();
  await expect(list.locator('[data-quarantine-filter]')).toContainText(
    'Filtre neuf : efficace à 5 %',
  );
  const starter = list.locator('[data-quarantine-starter]');
  const notice = list.locator('[data-transfer-notice]');
  await starter.click();
  await expect(notice).toContainText('Amorce de bactéries versée');
  await starter.click();
  await expect(notice).toContainText('Amorce encore active');
  await button.click();
  await expect(message).toContainText('Filtre déjà mûr');
  expect(errors).toEqual([]);
});
