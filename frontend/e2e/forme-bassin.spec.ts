import { expect, test, type Page } from '@playwright/test';

import { host, openScene } from './outils-decor';
import { fermerReglages, ouvrirReglages } from './outils-panneau';

/**
 * Forme du bassin (issue #190) : liste « Forme du bassin » sur la ligne « Lieu » du panneau,
 * au bassin seulement ; la forme choisie est appliquée tout de suite (`data-aqfish-shape`),
 * enregistrée et retrouvée au rechargement. En capture, `forme=` n'agit qu'au bassin.
 *
 * Saisons du bassin (issue #864), sur la même ligne : case « Saisons », sauvegardée avec le
 * monde ; coupée, plus de saison au tableau de bord et consigne à 18 °C. En capture, `saison=`
 * met l'eau du bassin à la température de la saison dès t = 0. Réunis ici plutôt que dans un
 * fichier à part : un fichier de plus coûte une durée moyenne aux parts de la CI (#600).
 */

const saison = (page: Page) => page.locator('[data-dashboard-season]');
const caseSaisons = (page: Page) => page.getByRole('checkbox', { name: 'Saisons du bassin' });

test.describe('Forme du bassin (#190)', () => {
  test('choisie au panneau, conservée au rechargement', async ({ page }) => {
    const errors = await openScene(page, '?seed=42&environnement=bassin');
    await expect(host(page)).toHaveAttribute('data-aqfish-shape', 'rectangle');
    await ouvrirReglages(page, 'Bac et milieu');
    const select = page.getByRole('combobox', { name: 'Forme du bassin' });
    await expect(select).toBeVisible();
    await select.selectOption('haricot');
    await expect(host(page)).toHaveAttribute('data-aqfish-shape', 'haricot');
    await page.goto('/');
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    await expect(host(page)).toHaveAttribute('data-aqfish-environment', 'bassin');
    await expect(host(page)).toHaveAttribute('data-aqfish-shape', 'haricot');
    expect(errors).toEqual([]);
  });

  test('absente du panneau hors du bassin ; forme= ignoré au bac tropical', async ({ page }) => {
    const errors = await openScene(page, '?capture=1&seed=42&forme=ovale');
    await expect(host(page)).toHaveAttribute('data-aqfish-shape', 'rectangle');
    await page.goto('/?capture=1&seed=42&environnement=bassin&forme=ovale');
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    await expect(host(page)).toHaveAttribute('data-aqfish-shape', 'ovale');
    await openScene(page, '?seed=42');
    await ouvrirReglages(page, 'Bac et milieu');
    await expect(page.getByRole('combobox', { name: 'Environnement' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Forme du bassin' })).toHaveCount(0);
    await expect(caseSaisons(page)).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('forme= inconnue ou vide au bassin : retombe sur le rectangle, sans erreur', async ({
    page,
  }) => {
    for (const valeur of ['triangle', '', 'OVALE%00']) {
      const errors = await openScene(
        page,
        `?capture=1&seed=42&environnement=bassin&forme=${valeur}`,
      );
      await expect(host(page)).toHaveAttribute('data-aqfish-shape', 'rectangle');
      expect(errors).toEqual([]);
    }
  });

  test('saisons (#864) : coupées au panneau, conservées au rechargement, rétablies', async ({
    page,
  }) => {
    const errors = await openScene(page, '?seed=42&environnement=bassin');
    await expect(saison(page)).toHaveAttribute('data-season', 'printemps');
    await ouvrirReglages(page, 'Bac et milieu');
    await expect(caseSaisons(page)).toBeChecked();
    await caseSaisons(page).uncheck();
    await fermerReglages(page);
    await expect(saison(page)).toHaveCount(0);
    // Consigne revenue aux 18 °C fixes du bassin (troisième champ du relevé de l'eau).
    await expect(host(page)).toHaveAttribute('data-aqfish-water', /^[a-z-]+;[\d.]+;18;/);

    await page.goto('/');
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    await expect(host(page)).toHaveAttribute('data-aqfish-environment', 'bassin');
    await expect(saison(page)).toHaveCount(0);
    await ouvrirReglages(page, 'Bac et milieu');
    await expect(caseSaisons(page)).not.toBeChecked();
    await caseSaisons(page).check();
    await fermerReglages(page);
    await expect(saison(page)).toHaveAttribute('data-season', 'printemps');
    expect(errors).toEqual([]);
  });

  test('saison= (#864) : eau d’hiver au bassin en capture, sans effet au bac tropical', async ({
    page,
  }) => {
    // Interface masquée en capture : l'eau se lit sur `data-aqfish-water` (docs/PIEGES.md).
    const errors = await openScene(page, '?capture=1&seed=42&environnement=bassin&saison=hiver');
    await expect(host(page)).toHaveAttribute('data-aqfish-water', /^bonne;4;4;/);
    await openScene(page, '?capture=1&seed=42&saison=hiver');
    await expect(host(page)).toHaveAttribute('data-aqfish-environment', 'tropical');
    await expect(host(page)).not.toHaveAttribute('data-aqfish-water', /^[a-z-]+;4;4;/);
    expect(errors).toEqual([]);
  });
});
