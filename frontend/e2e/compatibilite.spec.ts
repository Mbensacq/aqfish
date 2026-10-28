import { expect, test, type Page } from '@playwright/test';

/**
 * Compatibilité des espèces (issue #209) : le panneau signale chaque mélange déconseillé de
 * la population réelle par un libellé texte, qui suit les effectifs.
 */

const hostEl = (page: Page) => page.locator('app-aquarium-host');
const toggle = (page: Page) => page.getByRole('button', { name: 'Réglages' });
const warnings = (page: Page) => page.locator('[data-section="population"] [data-mix-warning]');
const slider = (page: Page, ofPlural: string) =>
  page.getByRole('slider', { name: `Curseur du nombre ${ofPlural}` });

async function open(page: Page, search: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`/${search}`);
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  return errors;
}

test.describe('Compatibilité des espèces (#209)', () => {
  test('bac tropical par défaut : aucun mélange déconseillé', async ({ page }) => {
    const errors = await open(page, '?seed=42');
    await toggle(page).click();
    await expect(page.locator('[data-section="population"] [data-species]')).toHaveCount(7);
    await expect(warnings(page)).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('paludarium : axolotl déconseillé avec grenouilles et tritons, libellé qui suit les effectifs', async ({
    page,
  }) => {
    // Paludarium mixte d'avant #271 : les axolotls n'y sont plus par défaut, on les ajoute.
    const errors = await open(page, '?seed=42&environnement=paludarium&population=axolotl:2');
    await toggle(page).click();
    await expect(warnings(page)).toHaveText([
      'Mélange déconseillé : axolotls et sonneurs orientaux (prédateur)',
      'Mélange déconseillé : axolotls et tritons à ventre de feu (prédateur)',
    ]);
    // Alerte du tableau de bord (#271), « attention ».
    const alert = page.locator('[data-dashboard-status] [data-alert="mix"]');
    await expect(alert).toHaveAttribute('data-severity', 'attention');
    await expect(alert).toContainText('Mélange déconseillé');

    // Sans tritons : il ne reste que le couple axolotl et grenouille.
    await slider(page, 'de tritons à ventre de feu').fill('0');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-population', /triton:0/);
    await expect(warnings(page)).toHaveText([
      'Mélange déconseillé : axolotls et sonneurs orientaux (prédateur)',
    ]);

    // Sans axolotls : plus aucun mélange déconseillé.
    await slider(page, 'd’axolotls').fill('0');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-population', /axolotl:0/);
    await expect(warnings(page)).toHaveCount(0);
    await expect(alert).toHaveCount(0);

    // Un axolotl de retour : le libellé revient.
    await slider(page, 'd’axolotls').fill('1');
    await expect(warnings(page)).toHaveText([
      'Mélange déconseillé : axolotls et sonneurs orientaux (prédateur)',
    ]);
    expect(errors).toEqual([]);
  });
  for (const environnement of ['tropical', 'bassin', 'recif', 'lagune']) {
    test(`${environnement} à minuit : aucun mélange déconseillé, aucune erreur`, async ({
      page,
    }) => {
      const errors = await open(page, `?seed=42&environnement=${environnement}&heure=0`);
      await toggle(page).click();
      await expect(warnings(page)).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  }
});
