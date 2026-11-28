import { expect, test, type Page } from '@playwright/test';

import { host, openScene } from './outils-decor';
import { fermerReglages, ouvrirReglages } from './outils-panneau';

/**
 * Saisons du bassin, option et captures (issue #864) : case « Saisons » sur la ligne « Lieu »
 * du bassin (catégorie « Bac et milieu »), sauvegardée avec le monde et retrouvée au
 * rechargement ; coupée, le tableau de bord n'affiche plus de saison. En capture, `saison=`
 * place le calendrier du bassin au cœur de la saison demandée, eau comprise dès t = 0.
 */

const saison = (page: Page) => page.locator('[data-dashboard-season]');
const caseSaisons = (page: Page) => page.getByRole('checkbox', { name: 'Saisons du bassin' });

test.describe('Saisons du bassin : option (#864)', () => {
  test('coupée au panneau, conservée au rechargement, puis rétablie', async ({ page }) => {
    const errors = await openScene(page, '?seed=42&environnement=bassin');
    await expect(saison(page)).toHaveAttribute('data-season', 'printemps');
    await ouvrirReglages(page, 'Bac et milieu');
    await expect(caseSaisons(page)).toBeChecked();
    await caseSaisons(page).uncheck();
    await expect(caseSaisons(page)).not.toBeChecked();
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

  test('absente du panneau hors du bassin', async ({ page }) => {
    const errors = await openScene(page, '?seed=42');
    await ouvrirReglages(page, 'Bac et milieu');
    await expect(page.getByRole('combobox', { name: 'Environnement' })).toBeVisible();
    await expect(caseSaisons(page)).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});

test.describe('Saisons du bassin : paramètre de capture saison= (#864)', () => {
  // L'interface (tableau de bord compris) est masquée en capture : l'eau se lit sur
  // `data-aqfish-water` (« qualité;température;consigne;… »).
  const eau = (page: Page) => host(page).getAttribute('data-aqfish-water');

  test('hiver et été au bassin ; inconnue ou hors du bassin, sans effet', async ({ page }) => {
    const errors = await openScene(page, '?capture=1&seed=42&environnement=bassin&saison=hiver');
    await expect(host(page)).toHaveAttribute('data-aqfish-water', /^bonne;4;4;/);

    await openScene(page, '?capture=1&seed=42&environnement=bassin&saison=ete');
    await expect(host(page)).toHaveAttribute('data-aqfish-water', /^bonne;24;24;/);

    await openScene(page, '?capture=1&seed=42&environnement=bassin&saison=canicule');
    await expect(host(page)).toHaveAttribute('data-aqfish-water', /^bonne;18;18;/);

    await openScene(page, '?capture=1&seed=42');
    const tropical = await eau(page);
    await openScene(page, '?capture=1&seed=42&saison=hiver');
    await expect(host(page)).toHaveAttribute('data-aqfish-environment', 'tropical');
    expect(await eau(page)).toBe(tropical);
    expect(errors).toEqual([]);
  });
});
