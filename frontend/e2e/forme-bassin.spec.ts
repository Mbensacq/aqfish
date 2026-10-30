import { expect, test } from '@playwright/test';

import { host, openScene } from './outils-decor';

/**
 * Forme du bassin (issue #190) : liste « Forme du bassin » sur la ligne « Lieu » du panneau,
 * au bassin seulement ; la forme choisie est appliquée tout de suite (`data-aqfish-shape`),
 * enregistrée et retrouvée au rechargement. En capture, `forme=` n'agit qu'au bassin.
 */

test.describe('Forme du bassin (#190)', () => {
  test('choisie au panneau, conservée au rechargement', async ({ page }) => {
    const errors = await openScene(page, '?seed=42&environnement=bassin');
    await expect(host(page)).toHaveAttribute('data-aqfish-shape', 'rectangle');
    await page.getByRole('button', { name: 'Réglages' }).click();
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
    await page.getByRole('button', { name: 'Réglages' }).click();
    await expect(page.getByRole('combobox', { name: 'Environnement' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Forme du bassin' })).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
