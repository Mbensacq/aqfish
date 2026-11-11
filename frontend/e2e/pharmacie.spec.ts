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

  // Tab : « Fermer », les cinq kits de test de l'eau (#564), le lien du wiki, puis retour à
  // « Fermer » (focus gardé).
  await page.keyboard.press('Tab');
  await expect(page.locator('[data-pharmacy-close]')).toBeFocused();
  for (const kit of ['ph', 'ammoniaque', 'nitrites', 'nitrates', 'durete']) {
    await page.keyboard.press('Tab');
    await expect(page.locator(`[data-water-kit="${kit}"]`)).toBeFocused();
  }
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

test('kit de test de l’eau (#564) : résultat arrondi après le délai, avec le conseil', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // Simulation à ×4 : les 10 s simulées du test passent en 2,5 s environ.
  await page.goto('/?seed=42&camera=front&heure=12&vitesse=4');
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');

  await page.locator(toggle).click();
  const result = page.locator('[data-water-test]');
  await expect(result).toHaveAttribute('data-state', 'aucun');
  await expect(page.locator('[data-water-test-guide]')).toContainText('salicylate');

  await page.locator('[data-water-kit="ammoniaque"]').click();
  await expect(result).toHaveAttribute('data-state', 'en-cours');
  await expect(result).toHaveAttribute('data-kit', 'ammoniaque');
  await expect(result).toContainText('en cours');
  // Un seul test à la fois : les kits attendent le résultat.
  await expect(page.locator('[data-water-kit="ph"]')).toBeDisabled();

  await expect(result).toHaveAttribute('data-state', 'termine', { timeout: 15_000 });
  await expect(page.locator('[data-water-result]')).toHaveText('NH₃/NH₄⁺ ≈ 0 u.');
  await expect(page.locator('[data-water-test-advice]')).toContainText('Rien à signaler');
  await expect(page.locator('[data-water-test-guide]')).toContainText('salicylate');
  await expect(page.locator('[data-water-kit="ph"]')).toBeEnabled();

  // Nouveau test : la dureté se lit en gouttes (GH et KH).
  await page.locator('[data-water-kit="durete"]').click();
  await expect(result).toHaveAttribute('data-state', 'termine', { timeout: 15_000 });
  await expect(page.locator('[data-water-result]')).toHaveCount(2);
  await expect(page.locator('[data-water-result]').first()).toContainText('gouttes');
  expect(errors).toEqual([]);
});

test('kit de test de l’eau : simulation à l’arrêt, le test n’avance pas', async ({ page }) => {
  await page.goto('/?seed=42&camera=front&heure=12&vitesse=0');
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  await page.locator(toggle).click();
  await page.locator('[data-water-kit="ph"]').click();
  const result = page.locator('[data-water-test]');
  await expect(result).toContainText('résultat dans 10 s');
  await page.waitForTimeout(1000);
  await expect(result).toHaveAttribute('data-state', 'en-cours');
  await expect(result).toContainText('résultat dans 10 s');
});

test('kit de test de l’eau : `test-eau=` donne un résultat prêt au chargement', async ({
  page,
}) => {
  await page.goto('/?seed=42&camera=front&heure=12&vitesse=0&test-eau=ph');
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  await page.locator(toggle).click();
  await expect(page.locator('[data-water-test]')).toHaveAttribute('data-state', 'termine');
  await expect(page.locator('[data-water-result]')).toHaveText(/^pH ≈ \d,?\d?$/);
});

test('kit de dureté à 1280 × 720 : GH et KH séparés, chacun d’un tenant (#574)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/?seed=42&vitesse=0&test-eau=durete');
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  await page.locator(toggle).click();
  const values = page.locator('[data-water-result]');
  await expect(values).toHaveCount(2);
  await expect(page.locator('[data-water-test] p').first()).toContainText(/gouttes · KH ≈/);
  const lineHeight = await values.first().evaluate((e) => e.getClientRects()[0].height);
  for (const value of await values.all()) {
    // Une seule boîte de ligne par valeur : « KH ≈ 6 gouttes » n'est jamais coupé.
    expect(await value.evaluate((e) => e.getClientRects().length)).toBe(1);
    expect((await value.boundingBox())!.height).toBeLessThanOrEqual(lineHeight + 1);
  }
  // Panneau sans débord horizontal.
  const overflow = await page
    .locator('#pharmacie-bac')
    .evaluate((e) => e.scrollWidth - e.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('kit de test de l’eau : téléphone (390 × 844), dureté lue sans débordement', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?seed=42&vitesse=0&test-eau=durete');
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  await page.locator(toggle).click();
  await expect(page.locator('[data-water-test]')).toHaveAttribute('data-state', 'termine');
  await expect(page.locator('[data-water-result]')).toHaveCount(2);
  // GH et KH séparés (#574) : « GH ≈ … · KH ≈ … », le point entre les deux valeurs.
  await expect(page.locator('[data-water-test] p').first()).toContainText(/gouttes · KH ≈/);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  // Un kit inconnu dans l’URL est ignoré : aucun résultat, aucune erreur.
  await page.goto('/?seed=42&vitesse=0&test-eau=nimporte');
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  await page.locator(toggle).click();
  await expect(page.locator('[data-water-test]')).toHaveAttribute('data-state', 'aucun');
  expect(errors).toEqual([]);
});
