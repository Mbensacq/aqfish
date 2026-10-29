import { expect, test, type Page } from '@playwright/test';

/**
 * Pièce de N bacs, lot 2b (#305) : catalogue « Bacs et meubles » des réglages. Ajouter une
 * commode et un bac posé dessus, recharger, les retrouver ; retirer un bac peuplé demande une
 * confirmation.
 *
 * Pages ouvertes sans `seed=` : la sauvegarde automatique doit être restaurée (l'URL prime).
 */

const hostEl = (page: Page) => page.locator('app-aquarium-host');
const catalog = (page: Page) => page.locator('[data-section="bacs-meubles"]');

async function open(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  return errors;
}

async function openPanel(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Réglages' }).click();
  await expect(page.locator('section.control-panel')).toBeVisible();
}

async function showRoom(page: Page): Promise<void> {
  await page.getByRole('checkbox', { name: 'Afficher la pièce' }).check();
  await expect(hostEl(page)).toHaveAttribute('data-aqfish-room', 'true');
  await expect(catalog(page)).toBeVisible();
}

test.describe('Pièce de N bacs : bacs et meubles (#305)', () => {
  // Pièce dessinée : chaque image est lente sous le rendu logiciel des tests (cf. piece.spec).
  test.setTimeout(300_000);

  test('ajouter une commode et un bac posé dessus, recharger, les retrouver', async ({ page }) => {
    const errors = await open(page);
    await openPanel(page);
    // Vitesse 0 : seuls la commode et le bac changent l'image.
    await page.getByRole('slider', { name: 'Vitesse de la simulation' }).fill('0');
    await showRoom(page);
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-room-tanks', '1');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-room-supports', '0');

    await catalog(page).getByRole('button', { name: 'Commode' }).click();
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-room-supports', '1');
    await catalog(page).locator('[data-new-tank-support]').selectOption({ label: 'Commode 1' });
    await catalog(page).locator('[data-new-tank-size]').selectOption('petit');
    await catalog(page).getByRole('button', { name: 'Ajouter le bac' }).click();
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-room-tanks', '2');
    await expect(catalog(page).locator('[data-room-tank="1"]')).toContainText(
      'posé sur Commode 1, vide',
    );
    // Un meuble qui porte un bac ne se retire pas.
    await expect(catalog(page).locator('[data-room-support="0"] button')).toHaveAttribute(
      'aria-disabled',
      'true',
    );

    await page.reload();
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-room-tanks', '2');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-room-supports', '1');
    await openPanel(page);
    await expect(catalog(page).locator('[data-room-tank="1"]')).toContainText(
      'posé sur Commode 1, vide',
    );
    await expect(catalog(page).locator('[data-room-support="0"]')).toContainText('Commode 1');

    // Bac vide retiré aussitôt, puis la commode libérée aussi.
    await catalog(page).getByRole('button', { name: 'Retirer Bac tropical' }).click();
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-room-tanks', '1');
    await catalog(page).getByRole('button', { name: 'Retirer Commode 1' }).click();
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-room-supports', '0');
    expect(errors).toEqual([]);
  });

  test('retirer un bac peuplé demande une confirmation', async ({ page }) => {
    const errors = await open(page);
    await openPanel(page);
    // Un bac récif peuplé, rangé quand on revient au bac tropical.
    const environment = page.getByRole('combobox', { name: 'Environnement', exact: true });
    await environment.selectOption('recif');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-environment', 'recif');
    await environment.selectOption('tropical');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-environment', 'tropical');
    await showRoom(page);
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-room-tanks', '2');

    const reef = catalog(page).locator('[data-room-tank]').filter({ hasText: 'rangé' });
    await expect(reef).toContainText('animaux');
    await reef.getByRole('button', { name: /^Retirer / }).click();
    // Rien n'est retiré avant la confirmation ; « Garder » l'annule.
    await expect(reef.getByRole('button', { name: /^Retirer avec \d+ animaux$/ })).toBeVisible();
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-room-tanks', '2');
    await reef.getByRole('button', { name: 'Garder' }).click();
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-room-tanks', '2');

    await reef.getByRole('button', { name: /^Retirer / }).click();
    await reef.getByRole('button', { name: /^Retirer avec \d+ animaux$/ }).click();
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-room-tanks', '1');
    expect(errors).toEqual([]);
  });
});
