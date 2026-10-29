import { expect, test, type Page } from '@playwright/test';

/**
 * Pièce de N bacs, lot 3b (#316) : tous les bacs vivent. Un néon transféré dans un bac posé
 * a de plus en plus faim, ce que montre la liste des bacs (`data-tank-hunger`) sans afficher
 * ce bac ; renommer un bac puis recharger la page conserve le nom.
 *
 * Pages ouvertes sans `seed=` : la sauvegarde automatique doit être restaurée (l'URL prime).
 */

const hostEl = (page: Page) => page.locator('app-aquarium-host');
const list = (page: Page) => page.locator('[data-section="bacs"]');

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

/** Faim moyenne (en %) du bac `id` lue dans la liste. */
async function hunger(page: Page, id: number): Promise<number> {
  return Number(await list(page).locator(`[data-tank="${id}"]`).getAttribute('data-tank-hunger'));
}

test.describe('Tous les bacs vivants (#316)', () => {
  // La pièce dessinée est lente sous le rendu logiciel des tests (cf. piece-bacs.spec).
  test.setTimeout(300_000);

  test('un néon transféré dans un bac posé a faim avec le temps, vu dans la liste', async ({
    page,
  }) => {
    const errors = await open(page);
    await openPanel(page);
    const speed = page.getByRole('slider', { name: 'Vitesse de la simulation' });
    await speed.fill('0');
    // Un petit bac tropical vide posé au sol (catalogue « Bacs et meubles », #305).
    await page.getByRole('checkbox', { name: 'Afficher la pièce' }).check();
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-room', 'true');
    const catalog = page.locator('[data-section="bacs-meubles"]');
    await catalog.locator('[data-new-tank-size]').selectOption('petit');
    await catalog.getByRole('button', { name: 'Ajouter le bac' }).click();
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-room-tanks', '2');
    await page.getByRole('checkbox', { name: 'Afficher la pièce' }).uncheck();

    await list(page).locator('[data-transfer-species]').selectOption('neon');
    await list(page).locator('[data-transfer-target]').selectOption('1');
    await list(page).getByRole('button', { name: 'Transférer à l’épuisette' }).click();
    await expect(list(page).locator('[data-transfer-notice]')).toContainText('Néon transféré');
    await expect(list(page).locator('[data-tank="1"]')).toContainText('1 animal');
    const before = await hunger(page, 1);
    expect(Number.isFinite(before)).toBe(true);

    // Vitesse maximale : quelques dizaines de secondes simulées suffisent.
    await speed.fill('4');
    await expect
      .poll(() => hunger(page, 1), { timeout: 120_000, intervals: [1000] })
      .toBeGreaterThan(before);
    // Le bac affiché n'a pas changé.
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-selected-tank', '0');
    expect(errors).toEqual([]);
  });

  test('renommer un bac puis recharger conserve le nom', async ({ page }) => {
    const errors = await open(page);
    await openPanel(page);
    const environment = page.getByRole('combobox', { name: 'Environnement', exact: true });
    await environment.selectOption('recif');
    await environment.selectOption('tropical');
    await expect(list(page).locator('[data-tank]')).toHaveCount(2);

    await list(page).locator('[data-rename-tank]').selectOption('1');
    const name = list(page).getByRole('textbox', { name: 'Nouveau nom' });
    await expect(name).toHaveValue('Récif');
    await name.fill('  Récif du salon ');
    await list(page).getByRole('button', { name: 'Renommer' }).click();
    await expect(list(page).locator('[data-tank="1"]')).toContainText('Récif du salon');

    // Un nom vide est refusé, l'ancien reste.
    await name.fill('   ');
    await name.press('Enter');
    await expect(list(page).locator('[data-transfer-notice]')).toContainText('Nom refusé');
    await expect(list(page).locator('[data-tank="1"]')).toContainText('Récif du salon');

    await page.reload();
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    await openPanel(page);
    await expect(list(page).locator('[data-tank="1"]')).toContainText('Récif du salon');
    expect(errors).toEqual([]);
  });
});
