import { expect, test, type Page } from '@playwright/test';

/**
 * Environnements (issue #87) : choix entre le bac tropical et le bassin dans le panneau de
 * contrôle, au clavier comme à la souris, lisible à 390 px ; `environnement=` en capture.
 */

const hostEl = (page: Page) => page.locator('app-aquarium-host');
const toggle = (page: Page) => page.getByRole('button', { name: 'Réglages' });
const selector = (page: Page) => page.getByRole('combobox', { name: 'Environnement' });

async function open(page: Page, search: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`/${search}`);
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  return errors;
}

/** Altitude (Y) de la caméra exposée par l'hôte. */
async function cameraY(page: Page): Promise<number> {
  const raw = await hostEl(page).getAttribute('data-aqfish-camera');
  return Number(raw!.split(',')[1]);
}

test.describe('Environnement', () => {
  test('au clavier : Tab jusqu’à la liste, choix du bassin vu de dessus, puis retour', async ({
    page,
  }) => {
    const errors = await open(page, '?seed=42');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-environment', 'tropical');
    await toggle(page).focus();
    await page.keyboard.press('Enter');
    await expect(selector(page)).toHaveValue('tropical');
    // Le sélecteur est le premier contrôle du panneau, juste après le bouton « Réglages ».
    await page.keyboard.press('Tab');
    await expect(selector(page)).toBeFocused();
    // Flèche bas sur la liste fermée : option suivante (Chromium), sans souris.
    await page.keyboard.press('ArrowDown');
    await expect(selector(page)).toHaveValue('bassin');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-environment', 'bassin');
    // Le bassin a ses koïs (#88), et seulement eux.
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-population', 'koi:7');
    // Vue par défaut du bassin : de dessus (bouton actif de la barre des vues).
    await expect(page.getByRole('button', { name: /^Vue de dessus/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect.poll(() => cameraY(page)).toBeGreaterThan(1);
    // Le monde tourne toujours, et le retour au bac rend ses poissons.
    const tick = Number(await hostEl(page).getAttribute('data-aqfish-tick'));
    await expect
      .poll(async () => Number(await hostEl(page).getAttribute('data-aqfish-tick')))
      .toBeGreaterThan(tick);
    await selector(page).selectOption('tropical');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-environment', 'tropical');
    await expect(hostEl(page)).toHaveAttribute(
      'data-aqfish-population',
      'neon:12,guppy:6,corydora:6',
    );
    expect(errors).toEqual([]);
  });

  test('à 390 px : liste entière dans le panneau, libellés lisibles', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await open(page, '?seed=42');
    await toggle(page).click();
    const panel = (await page.locator('section.control-panel').boundingBox())!;
    const list = (await selector(page).boundingBox())!;
    expect(list.x).toBeGreaterThanOrEqual(panel.x);
    expect(list.x + list.width).toBeLessThanOrEqual(panel.x + panel.width);
    expect(list.x + list.width).toBeLessThanOrEqual(390);
    expect(list.height).toBeGreaterThanOrEqual(28);
    // Le texte de l'option choisie tient dans la liste (pas de libellé tronqué).
    await selector(page).selectOption('bassin');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-environment', 'bassin');
    await selector(page).selectOption('tropical');
    const fits = await selector(page).evaluate(
      (el) => (el as HTMLSelectElement).scrollWidth <= (el as HTMLSelectElement).clientWidth,
    );
    expect(fits).toBe(true);
    expect(errors).toEqual([]);
  });

  test('capture environnement=bassin : vue de dessus par défaut, sans erreur', async ({ page }) => {
    const errors = await open(page, '?capture=1&seed=42&environnement=bassin');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-environment', 'bassin');
    expect(await cameraY(page)).toBeGreaterThan(1);
    expect(errors).toEqual([]);
  });

  test('bassin : rotation, zoom, préréglages et allers-retours sans erreur (QA)', async ({
    page,
  }) => {
    const errors = await open(page, '?seed=7');
    await toggle(page).click();
    await selector(page).selectOption('bassin');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-environment', 'bassin');
    const canvas = (await page.locator('canvas').first().boundingBox())!;
    const cx = canvas.x + canvas.width / 2;
    const cy = canvas.y + canvas.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 120, cy + 40, { steps: 6 });
    await page.mouse.up();
    await page.mouse.wheel(0, -400);
    await page.mouse.wheel(0, 800);
    for (const key of ['1', '2', '3', '4', '5']) await page.keyboard.press(key);
    await selector(page).selectOption('tropical');
    await selector(page).selectOption('bassin');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-environment', 'bassin');
    expect(errors).toEqual([]);
  });
});
