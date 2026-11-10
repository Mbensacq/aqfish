import { expect, test } from '@playwright/test';

/**
 * Pharmacie du bac (#533) : ouverte au clavier depuis son bouton, conseil selon l'alerte la
 * plus grave (points blancs : le médicament), Tab qui tourne dans le panneau, Échap qui ferme
 * et rend le focus au bouton ; exclusive avec le wiki et « Réglages ». Simulation à l'arrêt.
 */

const toggle = '[data-pharmacy-toggle]';
const panel = '#pharmacie-bac';

test('pharmacie : ouverte et parcourue au clavier, focus rendu à la fermeture', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?seed=42&camera=front&heure=12&vitesse=0&points-blancs=1');
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');

  await page.locator(toggle).focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Pharmacie du bac' });
  await expect(dialog).toBeVisible();
  await expect(page.locator(toggle)).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#pharmacie-bac-titre')).toBeFocused();
  await expect(page.locator('[data-pharmacy-advice]')).toHaveAttribute(
    'data-product',
    'medicament',
  );
  await expect(page.locator('[data-pharmacy-advice]')).toContainText('Points blancs');
  await expect(page.locator('[data-pharmacy-product]')).toHaveCount(7);

  // Tab : « Fermer », puis le lien du wiki, puis retour à « Fermer » (focus gardé).
  await page.keyboard.press('Tab');
  await expect(page.locator('[data-pharmacy-close]')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('[data-pharmacy-wiki]')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('[data-pharmacy-close]')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('[data-pharmacy-wiki]')).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(page.locator(panel)).toHaveCount(0);
  await expect(page.locator(toggle)).toBeFocused();
  await expect(page.locator(toggle)).toHaveAttribute('aria-expanded', 'false');

  // « Fermer » au clavier : même retour du focus.
  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(page.locator(panel)).toHaveCount(0);
  await expect(page.locator(toggle)).toBeFocused();
  expect(errors).toEqual([]);
});

test('pharmacie : exclusive avec le wiki et « Réglages »', async ({ page }) => {
  await page.goto('/?seed=42&camera=front&heure=12&vitesse=0');
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');

  await page.locator(toggle).click();
  await expect(page.locator(panel)).toBeVisible();
  await expect(page.locator('[data-pharmacy-advice]')).toContainText('Aucune alerte');

  // Lien vers « Produits et traitements » : le wiki s'ouvre et la pharmacie se replie.
  await page.locator('[data-pharmacy-wiki]').click();
  await expect(page.locator('#wiki-especes')).toBeVisible();
  await expect(page.locator(panel)).toHaveCount(0);

  await page.locator(toggle).click();
  await expect(page.locator(panel)).toBeVisible();
  await expect(page.locator('#wiki-especes')).toHaveCount(0);

  await page.getByRole('button', { name: 'Réglages' }).click();
  await expect(page.locator('.control-panel')).toBeVisible();
  await expect(page.locator(panel)).toHaveCount(0);
});

test('effets secondaires (#549) : avertissement affiché, lu au clavier avant le geste', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?seed=42&camera=front&heure=12&vitesse=0&points-blancs=1');
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');

  // Pharmacie ouverte au clavier : le conseil (médicament) et ses effets décrivent le dialogue.
  await page.locator(toggle).focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Pharmacie du bac' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAccessibleDescription(
    /Médicament.*Effets secondaires : Filtre : un filtre jeune mûrit 25 % moins vite/,
  );
  await expect(page.locator('[data-pharmacy-advice-warning]')).toBeVisible();
  await expect(page.locator('[data-pharmacy-warning]')).toHaveCount(2);
  await expect(page.locator('[data-pharmacy-product="sel"] [data-pharmacy-warning]')).toContainText(
    'Plantes : pousse ralentie',
  );
  await page.keyboard.press('Escape');
  await expect(page.locator(panel)).toHaveCount(0);

  // Geste dans « Réglages, Soins » : la description du bouton, lue au focus, porte
  // l'avertissement ; rien n'est versé avant la touche Entrée.
  await page.getByRole('button', { name: 'Réglages' }).click();
  const medication = page.locator('[data-treatment="medicament"]');
  await expect(medication).toBeVisible();
  await medication.focus();
  await expect(medication).toBeFocused();
  await expect(medication).toHaveAccessibleDescription(
    /Effets secondaires : Filtre : .* ; Invertébrés : toxique/,
  );
  await expect(page.locator('[data-treatment="chaleur"]')).not.toHaveAccessibleDescription(
    /Effets secondaires/,
  );
  await expect(page.locator('[data-treatment-message]')).toHaveCount(0);
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-treatment-message]')).toBeVisible();
  expect(errors).toEqual([]);
});
