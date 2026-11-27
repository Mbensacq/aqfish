import { expect, test } from '@playwright/test';
import { ouvrirReglages } from './outils-panneau';

/**
 * Vieillissement (issue #857, ADR 0187) : la fiche d'espèce du panneau « Population » et le
 * wiki affichent l'âge des animaux du bac (jours de jeu) et la durée de vie moyenne.
 */
test.describe('Âge et durée de vie (#857)', () => {
  test('fiche du panneau : âge dans le bac et durée de vie moyenne', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/?seed=42&heure=12&vitesse=0');
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    await ouvrirReglages(page, 'Population');
    await page.getByRole('button', { name: 'Fiche : Néon' }).click();
    const sheet = page.locator('[data-species-sheet="neon"]');
    await expect(sheet.locator('[data-sheet-field="age"]')).toContainText(/Âge dans le bac.*\d/);
    await expect(sheet.locator('[data-sheet-field="averageLifespan"]')).toContainText(
      /Durée de vie moyenne\s*4 ans/,
    );
    expect(errors).toEqual([]);
  });

  test('wiki : âge dans le bac et durée de vie moyenne', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/?seed=42&heure=12&vitesse=0');
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    await page.getByRole('button', { name: 'Wiki des espèces' }).click();
    await page.locator('#wiki-especes [data-wiki-species="neon"]').click();
    const wiki = page.locator('[data-wiki-sheet="neon"]');
    await expect(wiki.locator('[data-wiki-age="age"]')).toContainText(/Âge dans le bac.*\d/);
    await expect(wiki.locator('[data-wiki-age="averageLifespan"]')).toContainText('4 ans');
    expect(errors).toEqual([]);
  });
});
