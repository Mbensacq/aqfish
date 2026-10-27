import { expect, test, type Page } from '@playwright/test';

/**
 * Fiches d'espèces (issue #237) : bouton « Fiche » de chaque espèce du panneau « Population »,
 * ouverture et fermeture à la souris et au clavier, avertissement d'ajout. Simulation à
 * l'arrêt dès t = 0 (`vitesse=0`) : rien ne change sans action du test. Tests courts (#248).
 */

const section = (page: Page) => page.locator('[data-section="population"]');
const sheet = (page: Page) => section(page).getByRole('region', { name: /^Fiche : / });
const toggleOf = (page: Page, name: string) =>
  section(page).getByRole('button', { name: `Fiche : ${name}` });

async function open(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  await page.goto('/?seed=42&vitesse=0');
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  await page.getByRole('button', { name: 'Réglages' }).click();
  await expect(section(page)).toBeVisible();
  return errors;
}

test.describe('Fiches d’espèces (#237)', () => {
  test('à la souris : « Fiche » ouvre, « Fermer la fiche » referme', async ({ page }) => {
    const errors = await open(page);
    const neon = toggleOf(page, 'Néon');
    await expect(neon).toHaveAttribute('aria-expanded', 'false');
    await neon.click();
    await expect(sheet(page)).toHaveAccessibleName(/Fiche : Néon/);
    await expect(neon).toHaveAttribute('aria-expanded', 'true');
    await expect(sheet(page).locator('[data-sheet-field]')).toHaveCount(11);
    await expect(sheet(page).locator('[data-sheet-status]').first()).toHaveText(
      'Approximation de jeu',
    );
    await sheet(page).getByRole('button', { name: 'Fermer la fiche' }).click();
    await expect(sheet(page)).toHaveCount(0);
    await expect(neon).toBeFocused();
    expect(errors).toEqual([]);
  });

  test('au clavier : Entrée ouvre, Échap referme et rend le focus', async ({ page }) => {
    const errors = await open(page);
    const guppy = toggleOf(page, 'Guppy');
    await guppy.focus();
    await page.keyboard.press('Enter');
    await expect(sheet(page)).toHaveAccessibleName(/Fiche : Guppy/);
    // Échap dans la fiche (sur « Fermer la fiche ») : fermée, focus rendu au bouton.
    await sheet(page).getByRole('button', { name: 'Fermer la fiche' }).focus();
    await page.keyboard.press('Escape');
    await expect(sheet(page)).toHaveCount(0);
    await expect(guppy).toBeFocused();
    // Espace rouvre (disclosure), Échap sur le bouton referme.
    await page.keyboard.press('Space');
    await expect(sheet(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sheet(page)).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('ajouter un néon à un banc vide : avertissement « groupe trop petit »', async ({ page }) => {
    const errors = await open(page);
    const slider = page.getByRole('slider', { name: 'Curseur du nombre de néons' });
    await slider.fill('0');
    await expect(page.locator('app-aquarium-host')).toHaveAttribute(
      'data-aqfish-population',
      /^neon:0,/,
    );
    await expect(section(page).locator('[data-add-warning]')).toHaveCount(0);
    await section(page).getByRole('button', { name: 'Ajouter un néon' }).click();
    await expect(section(page).locator('[data-add-warning]')).toHaveText(
      'Groupe trop petit : 1 néon, 6 au moins conseillés',
    );
    expect(errors).toEqual([]);
  });

  test('téléphone 390 px : la fiche tient dans l’écran, sans défilement horizontal', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await open(page);
    await toggleOf(page, 'Corydora').click();
    const box = await sheet(page).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    // Une seule fiche à la fois : ouvrir celle d'une autre espèce remplace la première.
    await toggleOf(page, 'Guppy').click();
    await expect(sheet(page)).toHaveCount(1);
    await expect(sheet(page)).toHaveAccessibleName(/Fiche : Guppy/);
    expect(errors).toEqual([]);
  });
});
