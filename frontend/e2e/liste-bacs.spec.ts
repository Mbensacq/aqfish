import { expect, test, type Page } from '@playwright/test';

/**
 * Pièce de N bacs, lot 3 (#306) : liste des bacs des réglages. Sélectionner un autre bac
 * change le tableau de bord, la sélection survit au rechargement ; transférer un poisson vers
 * un bac posé, et refus clair vers un bac d'eau de mer.
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

/** Effectif d'une espèce lu dans `data-aqfish-population` (« neon:8;guppy:6… »). */
async function count(page: Page, species: string): Promise<number> {
  const raw = (await hostEl(page).getAttribute('data-aqfish-population')) ?? '';
  const entry = raw.split(/[;,]/).find((part) => part.startsWith(`${species}`));
  return Number(entry?.split(/[:=]/)[1] ?? NaN);
}

test.describe('Liste des bacs : sélection et transfert (#306)', () => {
  // La pièce dessinée est lente sous le rendu logiciel des tests (cf. piece-bacs.spec).
  test.setTimeout(300_000);

  test('sélectionner un autre bac change le tableau de bord, et la sélection survit au rechargement', async ({
    page,
  }) => {
    const errors = await open(page);
    await openPanel(page);
    const environment = page.getByRole('combobox', { name: 'Environnement', exact: true });
    await environment.selectOption('recif');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-environment', 'recif');
    await environment.selectOption('tropical');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-environment', 'tropical');
    await expect(list(page).locator('[data-tank]')).toHaveCount(2);
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-selected-tank', '0');
    const status = page.locator('[data-dashboard-status]');
    const population = await hostEl(page).getAttribute('data-aqfish-population');

    const reef = list(page).locator('[data-tank="1"] button');
    await expect(reef).toHaveAttribute('aria-pressed', 'false');
    await reef.click();
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-selected-tank', '1');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-environment', 'recif');
    await expect(reef).toHaveAttribute('aria-pressed', 'true');
    expect(await hostEl(page).getAttribute('data-aqfish-population')).not.toBe(population);
    // Le tableau de bord décrit le récif : santé des animaux du récif, combobox à jour.
    await expect(status).toBeVisible();
    await expect(environment).toHaveValue('recif');

    await page.reload();
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-selected-tank', '1');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-environment', 'recif');
    await openPanel(page);
    await expect(list(page).locator('[data-tank="1"] button')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(errors).toEqual([]);
  });

  test('transférer un néon vers un bac posé ; refus vers le récif', async ({ page }) => {
    const errors = await open(page);
    await openPanel(page);
    await page.getByRole('slider', { name: 'Vitesse de la simulation' }).fill('0');
    const environment = page.getByRole('combobox', { name: 'Environnement', exact: true });
    await environment.selectOption('recif');
    await environment.selectOption('tropical');
    // Un petit bac tropical vide posé au sol (catalogue « Bacs et meubles », #305).
    await page.getByRole('checkbox', { name: 'Afficher la pièce' }).check();
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-room', 'true');
    const catalog = page.locator('[data-section="bacs-meubles"]');
    await catalog.locator('[data-new-tank-size]').selectOption('petit');
    await catalog.getByRole('button', { name: 'Ajouter le bac' }).click();
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-room-tanks', '3');
    await page.getByRole('checkbox', { name: 'Afficher la pièce' }).uncheck();
    await expect(list(page).locator('[data-tank]')).toHaveCount(3);
    await expect(list(page).locator('[data-tank="2"]')).toContainText('vide');

    // Refus : un néon ne vit pas en eau de mer.
    await list(page).locator('[data-transfer-species]').selectOption('neon');
    await list(page).locator('[data-transfer-target]').selectOption('1');
    await list(page).getByRole('button', { name: 'Transférer à l’épuisette' }).click();
    await expect(list(page).locator('[data-transfer-notice]')).toContainText(
      'Les néons ne vivent pas',
    );

    // Accepté vers le bac posé.
    const before = await count(page, 'neon');
    await list(page).locator('[data-transfer-target]').selectOption('2');
    await list(page).getByRole('button', { name: 'Transférer à l’épuisette' }).click();
    await expect(list(page).locator('[data-transfer-notice]')).toContainText(
      'Néon transféré dans « Bac tropical »',
    );
    await expect.poll(() => count(page, 'neon')).toBe(before - 1);
    await expect(list(page).locator('[data-tank="2"]')).toContainText('1 animal');

    // Le transfert est enregistré.
    await page.reload();
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    expect(await count(page, 'neon')).toBe(before - 1);
    await openPanel(page);
    await expect(list(page).locator('[data-tank="2"]')).toContainText('1 animal');
    expect(errors).toEqual([]);
  });
});
