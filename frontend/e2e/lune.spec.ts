import { expect, test } from '@playwright/test';
import { ouvrirReglages } from './outils-panneau';

/**
 * Option « Lune » (#856) : case de la section « Affichage », cochée par défaut, choix mémorisé
 * à part de la sauvegarde du monde (`aqfish.lune`) et relu au rechargement.
 */
test('case « Lune » d’« Affichage » : cochée par défaut, choix gardé au rechargement', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  await ouvrirReglages(page, 'Affichage');
  const moon = page.getByRole('checkbox', { name: 'Lune' });
  await expect(moon).toBeChecked();
  await moon.uncheck();
  expect(await page.evaluate(() => localStorage.getItem('aqfish.lune'))).toBe('coupee');

  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  await ouvrirReglages(page, 'Affichage');
  await expect(page.getByRole('checkbox', { name: 'Lune' })).not.toBeChecked();
  expect(errors).toEqual([]);
});
