import { expect, test, type Locator, type Page } from '@playwright/test';

import { SETTINGS_CATEGORIES } from '../src/app/ui/settings-window/settings-categories';
import { fenetreReglages, fermerReglages, open, ouvrirReglages, toggle } from './outils-panneau';

/**
 * Réglages sur téléphone (#722, tranche 3, `docs/INTERFACE.md` section 2) : sous 640 px, la
 * fenêtre devient un panneau qui monte du bas (environ 75 % de la hauteur) ; la liste des
 * catégories montre leur valeur résumée ; une catégorie ouvre son contenu dans le même
 * panneau, avec « Retour » ; cibles tactiles de 44 px au moins ; Échap, « Fermer » et le fond
 * ferment, le focus revient au bouton « Réglages ». Au-delà de 639 px, rien ne change.
 */

const PHONE = { width: 390, height: 844 } as const;

const list = (page: Page) => fenetreReglages(page).locator('[data-settings-list]');
const content = (page: Page) => page.locator('[data-settings-content]');
const back = (page: Page) => fenetreReglages(page).locator('[data-settings-back]');
const category = (page: Page, id: string) =>
  fenetreReglages(page).locator(`[data-settings-category="${id}"]`);

async function size(locator: Locator): Promise<{ width: number; height: number }> {
  const box = await locator.boundingBox();
  expect(box, 'élément visible').not.toBeNull();
  return { width: box!.width, height: box!.height };
}

/** Ouvre la fenêtre au bouton « Réglages » (liste des catégories sur téléphone). */
async function openWindow(page: Page): Promise<void> {
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
}

test.describe('téléphone 390 × 844 (#722, tranche 3)', () => {
  test.use({ viewport: PHONE });

  test('panneau du bas, liste des catégories avec leur valeur résumée', async ({ page }) => {
    const errors = await open(page);
    await openWindow(page);
    const sheet = fenetreReglages(page);
    await expect(sheet).toHaveAttribute('data-settings-layout', 'telephone');
    const box = (await sheet.boundingBox())!;
    // Monte du bas : collé au bas de l'écran, d'un bord à l'autre, ~75 % de la hauteur.
    expect(box.x).toBeCloseTo(0, 0);
    expect(box.width).toBeCloseTo(PHONE.width, 0);
    expect(box.y + box.height).toBeCloseTo(PHONE.height, 0);
    expect(box.height / PHONE.height).toBeGreaterThan(0.7);
    expect(box.height / PHONE.height).toBeLessThan(0.8);
    // Liste d'abord, contenu masqué ; focus sur la catégorie ouverte (« Bac et milieu »).
    await expect(list(page)).toBeVisible();
    await expect(content(page)).toBeHidden();
    await expect(category(page, 'bac')).toBeFocused();
    // Une valeur résumée sous chaque titre, lue comme description du bouton.
    for (const entry of SETTINGS_CATEGORIES) {
      const button = category(page, entry.id);
      await expect(button).toHaveAccessibleName(entry.title);
      const summary = button.locator('[data-settings-summary]');
      await expect(summary).toBeVisible();
      await expect(summary).not.toHaveText('');
      await expect(button).toHaveAccessibleDescription(/\S/);
    }
    await expect(category(page, 'population').locator('[data-settings-summary]')).toHaveText(
      /\d+ animaux|1 animal|Aucun animal/,
    );
    await expect(category(page, 'sauvegarde').locator('[data-settings-summary]')).toHaveText(
      'Enregistré automatiquement',
    );
    expect(errors).toEqual([]);
  });

  test('une catégorie s’ouvre dans le panneau, « Retour » rend la liste', async ({ page }) => {
    const errors = await open(page);
    await openWindow(page);
    await category(page, 'eau').click();
    await expect(content(page)).toHaveAttribute('data-settings-content', 'eau');
    await expect(content(page)).toBeVisible();
    await expect(list(page)).toBeHidden();
    await expect(back(page)).toBeFocused();
    await expect(page.getByRole('button', { name: 'Changer l’eau' })).toBeVisible();
    // Le contenu tient dans le panneau, sans débord horizontal.
    expect(await content(page).evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await back(page).click();
    await expect(list(page)).toBeVisible();
    await expect(content(page)).toBeHidden();
    await expect(category(page, 'eau')).toBeFocused();
    // `ouvrirReglages` passe d'une catégorie à l'autre, aussi sur téléphone (par « Retour »).
    await ouvrirReglages(page, 'Son');
    await ouvrirReglages(page, 'Population');
    await expect(content(page)).toHaveAttribute('data-settings-content', 'population');
    expect(errors).toEqual([]);
  });

  test('cibles tactiles de 44 px au moins', async ({ page }) => {
    const errors = await open(page);
    await openWindow(page);
    const close = fenetreReglages(page).locator('[data-settings-close]');
    for (const target of [close, ...SETTINGS_CATEGORIES.map((c) => category(page, c.id))]) {
      const { width, height } = await size(target);
      expect(width).toBeGreaterThanOrEqual(44);
      expect(height).toBeGreaterThanOrEqual(44);
    }
    await category(page, 'temps').click();
    for (const target of [back(page), close]) {
      const { width, height } = await size(target);
      expect(width).toBeGreaterThanOrEqual(44);
      expect(height).toBeGreaterThanOrEqual(44);
    }
    expect(errors).toEqual([]);
  });

  test('fermeture par Échap, « Fermer » et le fond ; focus rendu à « Réglages »', async ({
    page,
  }) => {
    const errors = await open(page);
    // Échap depuis le contenu d'une catégorie.
    await ouvrirReglages(page, 'Décor');
    await page.keyboard.press('Escape');
    await expect(fenetreReglages(page)).toHaveCount(0);
    await expect(toggle(page)).toBeFocused();
    // « Fermer » depuis la liste.
    await openWindow(page);
    await fermerReglages(page);
    await expect(fenetreReglages(page)).toHaveCount(0);
    await expect(toggle(page)).toBeFocused();
    // Fond assombri : le haut de l'écran, au-dessus du panneau.
    await openWindow(page);
    await page.mouse.click(PHONE.width / 2, 40);
    await expect(fenetreReglages(page)).toHaveCount(0);
    await expect(toggle(page)).toBeFocused();
    // Rouverte : la liste revient, sur la dernière catégorie ouverte (retenue).
    await openWindow(page);
    await expect(list(page)).toBeVisible();
    await expect(category(page, 'decor')).toBeFocused();
    expect(errors).toEqual([]);
  });

  test('focus piégé dans le panneau, liste comme contenu', async ({ page }) => {
    const errors = await open(page);
    await openWindow(page);
    const inside = () =>
      page.evaluate(() => {
        const dialog = document.querySelector('[data-settings-window]');
        const active = document.activeElement;
        return dialog !== null && active !== null && dialog.contains(active);
      });
    for (let i = 0; i < 14; i++) {
      await page.keyboard.press('Tab');
      expect(await inside(), `Tab ${i + 1} dans la liste`).toBe(true);
    }
    await category(page, 'accessibilite').click();
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Shift+Tab');
      expect(await inside(), `Maj+Tab ${i + 1} dans le contenu`).toBe(true);
    }
    expect(errors).toEqual([]);
  });
});

test.describe('au-delà de 639 px (#722, tranche 3)', () => {
  test.use({ viewport: { width: 640, height: 800 } });

  test('fenêtre de bureau : catégories et contenu côte à côte, sans « Retour »', async ({
    page,
  }) => {
    const errors = await open(page);
    await ouvrirReglages(page, 'Population');
    await expect(fenetreReglages(page)).toHaveAttribute('data-settings-layout', 'bureau');
    await expect(list(page)).toBeVisible();
    await expect(content(page)).toBeVisible();
    await expect(back(page)).toHaveCount(0);
    await expect(fenetreReglages(page).locator('[data-settings-summary]')).toHaveCount(0);
    const nav = (await list(page).boundingBox())!;
    const body = (await content(page).boundingBox())!;
    expect(body.x).toBeGreaterThanOrEqual(nav.x + nav.width);
    expect(errors).toEqual([]);
  });
});
