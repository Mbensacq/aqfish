import { expect, test, type Page } from '@playwright/test';

import { count, fenetreReglages, open, ouvrirReglages } from './outils-panneau';

/**
 * Recherche dans les réglages et population en tuiles (#723, `docs/INTERFACE.md` section 2) :
 * chercher « lum », « chauffage », « néon » ; filtrer et trier la population ; ajouter et
 * retirer un animal depuis une tuile.
 */

const search = (page: Page) => fenetreReglages(page).locator('[data-settings-search]');
const results = (page: Page) => fenetreReglages(page).locator('[data-settings-result]');
const tiles = (page: Page) => page.locator('[data-section="population"] [data-species]');
const shownSections = (page: Page) =>
  page
    .locator('[data-section]')
    .evaluateAll((els) =>
      els.filter((el) => !(el as HTMLElement).hidden).map((el) => el.getAttribute('data-section')),
    );

test.describe('recherche des réglages (#723)', () => {
  test('« lum » : éclairage, lampe et heure en tête, réglables sur place', async ({ page }) => {
    const errors = await open(page, '?seed=42&vitesse=0');
    await ouvrirReglages(page, 'Bac et milieu');
    await search(page).fill('lum');
    await expect(results(page).first()).toHaveAttribute('data-settings-result', 'Éclairage');
    await expect(results(page).nth(1)).toHaveAttribute('data-settings-result', 'Lampe');
    await expect(results(page).nth(2)).toHaveAttribute('data-settings-result', 'Heure');
    expect(await shownSections(page)).toEqual(expect.arrayContaining(['eau', 'journee']));
    // Réglable sur place : le curseur de l'heure est visible et répond.
    const hour = page.getByRole('slider', { name: 'Heure de la journée' });
    await expect(hour).toBeVisible();
    await hour.focus();
    await page.keyboard.press('ArrowRight');
    await expect(hour).not.toHaveValue('12');
    expect(errors).toEqual([]);
  });

  test('« chauffage » au clavier : « / », saisie, Entrée ouvre « Eau et matériel »', async ({
    page,
  }) => {
    const errors = await open(page, '?seed=42&vitesse=0');
    await ouvrirReglages(page, 'Population');
    await page.keyboard.press('/');
    await expect(search(page)).toBeFocused();
    await page.keyboard.type('CHAUFFAGE');
    await expect(results(page).first()).toHaveAttribute('data-settings-result', 'Chauffage');
    await page.keyboard.press('Enter');
    await expect(search(page)).toHaveValue('');
    await expect(page.locator('[data-settings-content]')).toHaveAttribute(
      'data-settings-content',
      'eau',
    );
    expect(errors).toEqual([]);
  });

  test('« charbon » et « pluie » : leurs nouvelles catégories (#762)', async ({ page }) => {
    const errors = await open(page, '?seed=42&vitesse=0&environnement=bassin');
    await ouvrirReglages(page, 'Bac et milieu');
    await search(page).fill('charbon');
    await expect(results(page).first()).toHaveAttribute('data-settings-result', 'Charbon');
    expect(await shownSections(page)).toEqual(['produits']);
    await expect(page.getByRole('button', { name: 'Charbon actif dans le filtre' })).toBeVisible();
    await search(page).fill('pluie');
    await expect(results(page).first()).toHaveAttribute('data-settings-result', 'Pluie');
    await search(page).press('Enter');
    await expect(page.locator('[data-settings-content]')).toHaveAttribute(
      'data-settings-content',
      'affichage',
    );
    await expect(page.locator('[data-section="affichage"] [data-rain]')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('« néon » : sa tuile seule ; « + » ajoute un néon au bac', async ({ page }) => {
    const errors = await open(page, '?seed=42&vitesse=0');
    await ouvrirReglages(page, 'Bac et milieu');
    await search(page).fill('néon');
    await expect(results(page).first()).toHaveAttribute('data-settings-result', 'Néon');
    await expect(tiles(page)).toHaveCount(1);
    await expect(tiles(page).first()).toHaveAttribute('data-species', 'neon');
    await tiles(page).first().getByRole('button', { name: 'Ajouter un néon' }).click();
    await expect(count(page, 'néons')).toHaveValue('13');
    expect(errors).toEqual([]);
  });

  test('aucun résultat : un message et les catégories, qui mènent à la leur', async ({ page }) => {
    const errors = await open(page, '?seed=42&vitesse=0');
    await ouvrirReglages(page, 'Bac et milieu');
    await search(page).fill('zzzz');
    await expect(fenetreReglages(page).locator('[data-settings-no-result]')).toContainText(
      '« zzzz »',
    );
    await expect(results(page)).toHaveCount(0);
    await fenetreReglages(page).locator('[data-settings-result-category="son"]').click();
    await expect(page.locator('[data-settings-content]')).toHaveAttribute(
      'data-settings-content',
      'son',
    );
    expect(errors).toEqual([]);
  });
});

test.describe('population en tuiles (#723)', () => {
  test('filtrer, trier, puis ajouter et retirer depuis une tuile', async ({ page }) => {
    const errors = await open(page, '?seed=42&vitesse=0');
    await ouvrirReglages(page, 'Population');
    const summary = page.locator('[data-population-summary]');
    await expect(summary).toHaveText('24 animaux, 3 espèces');
    await expect(tiles(page)).toHaveCount(17);

    await page.locator('[data-population-filter="invertebres"]').click();
    await expect(tiles(page)).toHaveCount(2);
    await page.locator('[data-population-filter="bac"]').click();
    await expect(page.locator('[data-population-filter="bac"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(tiles(page)).toHaveCount(3);

    await page.locator('[data-population-sort]').selectOption('nom');
    const order = () =>
      tiles(page).evaluateAll((els) => els.map((el) => el.getAttribute('data-species')));
    expect(await order()).toEqual(['corydora', 'guppy', 'neon']);

    const guppy = tiles(page).filter({ has: page.locator('[data-sheet-toggle="guppy"]') });
    await guppy.getByRole('button', { name: 'Ajouter un guppy' }).click();
    await guppy.getByRole('button', { name: 'Ajouter un guppy' }).click();
    await expect(count(page, 'guppys')).toHaveValue('8');
    await page.locator('[data-population-sort]').selectOption('nombre');
    await expect.poll(order).toEqual(['neon', 'guppy', 'corydora']);
    await guppy.getByRole('button', { name: 'Retirer un guppy' }).click();
    await expect(count(page, 'guppys')).toHaveValue('7');
    await expect(summary).toHaveText('25 animaux, 3 espèces');
    expect(errors).toEqual([]);
  });
});
