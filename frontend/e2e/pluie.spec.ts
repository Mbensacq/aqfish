import { expect, test, type Page } from '@playwright/test';

import { keyCommand } from '../src/app/core/commands/commands';
import { PALETTE } from '../src/app/render/palette';

/**
 * Pluie dans le bassin (issue #106) : touche `R` et case « Pluie » du panneau, sans effet
 * sur le bac tropical ; `pluie=1` en capture, image déterministe ; aide-mémoire à jour.
 */

async function open(page: Page, search: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`/${search}`);
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  return errors;
}

const host = (page: Page) => page.locator('app-aquarium-host');
const rainBox = (page: Page) =>
  page.locator('.control-panel__check[data-rain]').getByRole('checkbox');

/** Nombre de pixels de la capture d'écran exactement de la couleur `hex`. */
async function countColor(page: Page, png: Buffer, hex: string): Promise<number> {
  return page.evaluate(
    async ({ png, hex }) => {
      const blob = await (await fetch(`data:image/png;base64,${png}`)).blob();
      const bitmap = await createImageBitmap(blob);
      const context = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d');
      if (!context) {
        throw new Error('Contexte 2D indisponible');
      }
      context.drawImage(bitmap, 0, 0);
      const data = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
      const wanted = parseInt(hex.slice(1), 16);
      let count = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]) === wanted) {
          count++;
        }
      }
      return count;
    },
    { png: png.toString('base64'), hex },
  );
}

test.describe('Pluie (#106)', () => {
  test('bassin : touche R et case « Pluie » ; aide-mémoire avec la touche R', async ({ page }) => {
    // `seed=` : monde neuf, sans relire une sauvegarde d'un test précédent (docs/PIEGES.md).
    const errors = await open(page, '?seed=42&environnement=bassin');
    await expect(host(page)).toHaveAttribute('data-aqfish-rain', 'false');
    await page.keyboard.press('r');
    await expect(host(page)).toHaveAttribute('data-aqfish-rain', 'true');
    await page.getByRole('button', { name: 'Réglages' }).click();
    await expect(rainBox(page)).toBeChecked();
    await rainBox(page).uncheck();
    await expect(host(page)).toHaveAttribute('data-aqfish-rain', 'false');
    await rainBox(page).check();
    await expect(host(page)).toHaveAttribute('data-aqfish-rain', 'true');
    // Majuscule aussi, focus hors du panneau (dans une case, la touche est laissée au navigateur).
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('Shift+R');
    await expect(host(page)).toHaveAttribute('data-aqfish-rain', 'false');
    await expect(rainBox(page)).not.toBeChecked();

    const command = keyCommand('pluie');
    const row = page.locator('#aide-commandes [data-command="pluie"]');
    await expect(row.locator('kbd')).toHaveText('R');
    await expect(row.locator('dd')).toHaveText(command.description);
    expect(errors).toEqual([]);
  });

  test('bac tropical : ni case « Pluie », ni effet de la touche R ; pluie=1 identique à l’octet', async ({
    page,
  }) => {
    const errors = await open(page, '?seed=42');
    await page.keyboard.press('r');
    await expect(host(page)).toHaveAttribute('data-aqfish-rain', 'false');
    await page.getByRole('button', { name: 'Réglages' }).click();
    await expect(page.locator('.control-panel')).toBeVisible();
    await expect(rainBox(page)).toHaveCount(0);

    await open(page, '?capture=1&seed=42&time=30');
    const dry = await page.screenshot({ animations: 'disabled' });
    await open(page, '?capture=1&seed=42&time=30&pluie=1');
    await expect(host(page)).toHaveAttribute('data-aqfish-rain', 'false');
    const wet = await page.screenshot({ animations: 'disabled' });
    expect(wet.equals(dry), 'pluie=1 change le bac tropical').toBe(true);
    expect(errors).toEqual([]);
  });

  test('capture pluie=1 : ronds lisibles de dessus, même temps même image, autre temps autre image', async ({
    page,
  }) => {
    const errors = await open(page, '?capture=1&seed=42&time=30&environnement=bassin');
    const dry = await page.screenshot({ animations: 'disabled' });
    const base = '?capture=1&seed=42&environnement=bassin&pluie=1';
    await open(page, `${base}&time=30`);
    await expect(host(page)).toHaveAttribute('data-aqfish-rain', 'true');
    const wet = await page.screenshot({ animations: 'disabled' });
    // Les ronds sont tracés en eau très claire, rare sur le bassin par beau temps.
    const before = await countColor(page, dry, PALETTE.eauTresClaire);
    const after = await countColor(page, wet, PALETTE.eauTresClaire);
    expect(after, `eau très claire : ${before} → ${after}`).toBeGreaterThan(before + 300);

    await open(page, `${base}&time=30`);
    expect((await page.screenshot({ animations: 'disabled' })).equals(wet)).toBe(true);
    await open(page, `${base}&time=30.5`);
    expect((await page.screenshot({ animations: 'disabled' })).equals(wet)).toBe(false);
    expect(errors).toEqual([]);
  });
});
