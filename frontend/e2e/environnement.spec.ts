import { expect, test, type Page } from '@playwright/test';

import { FOOD_PER_DROP } from '../src/app/sim/food';

/**
 * Environnements (issue #87) : choix entre le bac tropical, le bassin et le paludarium (#129)
 * dans le panneau de contrôle, au clavier comme à la souris, lisible à 390 px ;
 * `environnement=` en capture.
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

  test('paludarium (#129) : choisi au panneau, deux axolotls (#130), trois grenouilles (#131) et deux tritons (#133), nourri sur l’eau seulement, gardé au rechargement', async ({
    page,
  }) => {
    // Sans `seed=` : la sauvegarde automatique restaure le monde au rechargement.
    const errors = await open(page, '');
    await toggle(page).click();
    await selector(page).selectOption('paludarium');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-environment', 'paludarium');
    await expect(hostEl(page)).toHaveAttribute(
      'data-aqfish-population',
      'axolotl:2,grenouille:3,triton:2',
    );
    await expect(page.getByRole('spinbutton', { name: 'Nombre d’axolotls' })).toHaveValue('2');
    await expect(page.getByRole('spinbutton', { name: 'Nombre de grenouilles' })).toHaveValue('3');
    await expect(page.getByRole('spinbutton', { name: 'Nombre de tritons' })).toHaveValue('2');
    await expect(page.locator('[data-population-empty]')).toHaveCount(0);
    await toggle(page).click();

    // Vue de dessus : la berge à gauche (−X), l'eau à droite (+X).
    await page.keyboard.press('1');
    await expect.poll(() => cameraY(page)).toBeGreaterThan(1);
    await page.waitForTimeout(800); // fin de la transition de caméra (0,5 s)
    const box = (await page.locator('canvas').first().boundingBox())!;
    const y = box.y + box.height / 2;
    await page.mouse.click(box.x + box.width * 0.38, y);
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-food', '0');
    await page.mouse.click(box.x + box.width * 0.62, y);
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-food', String(FOOD_PER_DROP));

    await page.reload();
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-environment', 'paludarium');
    expect(errors).toEqual([]);
  });

  test('capture environnement=paludarium : vue trois-quarts par défaut, sans erreur', async ({
    page,
  }) => {
    const errors = await open(page, '?capture=1&seed=42&environnement=paludarium');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-environment', 'paludarium');
    // Trois-quarts : devant (+Z), à droite (+X), au-dessus du bac.
    const [x, y, z] = (await hostEl(page).getAttribute('data-aqfish-camera'))!
      .split(',')
      .map(Number);
    expect(x).toBeGreaterThan(0);
    expect(y).toBeGreaterThan(0.6);
    expect(z).toBeGreaterThan(x);
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
