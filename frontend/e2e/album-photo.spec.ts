import { expect, test, type Page } from '@playwright/test';

/**
 * Album photo du bac (#860) : le bouton « Album » de la barre des vues ouvre une fenêtre qui
 * garde des photos de la vue (sans interface), datées du jour de jeu et nommées par leur
 * milieu ; une photo s'agrandit au clic et se supprime ; l'album survit au rechargement
 * (stockage du navigateur). Lisible à 390 px ; absent en mode capture.
 */

async function open(page: Page, search = '?seed=7&vitesse=0'): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`/${search}`);
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  return errors;
}

const album = (page: Page) => page.locator('[data-photo-album]');
const photos = (page: Page) => page.locator('[data-album-photo]');

test.describe('Album photo du bac (#860)', () => {
  test('prendre deux photos, les voir, en supprimer une, la retrouver après rechargement', async ({
    page,
  }) => {
    const errors = await open(page);
    const toggle = page.locator('[data-album-toggle]');
    await toggle.click();
    await expect(album(page)).toBeVisible();
    await expect(page.locator('[data-album-empty]')).toBeVisible();

    await page.locator('[data-album-add]').click();
    await expect(photos(page)).toHaveCount(1);
    await page.locator('[data-album-add]').click();
    await expect(photos(page)).toHaveCount(2);
    await expect(page.locator('[data-album-count]')).toHaveText('2 / 12');

    // Miniature : vraie image PNG de la scène, légende datée et nommée par le milieu.
    const first = photos(page).first();
    await expect(first).toContainText(/Jour \d+, \d+ h \d{2} · Bac tropical/);
    const size = await first
      .locator('img')
      .evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight]);
    expect(size[0]).toBeGreaterThan(100);
    expect(size[1]).toBeGreaterThan(50);

    // Agrandir, puis revenir (souris), agrandir et revenir (Échap).
    await first.locator('[data-album-open]').click();
    await expect(page.locator('[data-album-enlarged]')).toBeVisible();
    await page.locator('[data-album-back]').click();
    await expect(photos(page)).toHaveCount(2);
    await first.locator('[data-album-open]').click();
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-album-enlarged]')).toHaveCount(0);
    await expect(album(page)).toBeVisible();

    await photos(page).first().locator('[data-album-remove]').click();
    await expect(photos(page)).toHaveCount(1);

    // Échap ferme, le focus revient au bouton « Album ».
    await page.keyboard.press('Escape');
    await expect(album(page)).toHaveCount(0);
    await expect(toggle).toBeFocused();

    await page.reload();
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    await toggle.click();
    await expect(photos(page)).toHaveCount(1);
    expect(errors).toEqual([]);
  });

  test('exclusif : ouvrir l’album replie la pharmacie', async ({ page }) => {
    const errors = await open(page);
    await page.locator('[data-pharmacy-toggle]').click();
    await expect(page.locator('#pharmacie-bac')).toBeVisible();
    await page.locator('[data-album-toggle]').click();
    await expect(album(page)).toBeVisible();
    await expect(page.locator('#pharmacie-bac')).toHaveCount(0);
    await page.locator('[data-album-close]').click();
    await expect(album(page)).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test.describe('téléphone 390 × 844', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('fenêtre entière dans l’écran, deux miniatures par ligne', async ({ page }) => {
      const errors = await open(page);
      await page.locator('[data-album-toggle]').click();
      await page.locator('[data-album-add]').click();
      await page.locator('[data-album-add]').click();
      await expect(photos(page)).toHaveCount(2);
      const box = (await album(page).boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(390);
      expect(box.y + box.height).toBeLessThanOrEqual(844);
      const [a, b] = [
        (await photos(page).nth(0).boundingBox())!,
        (await photos(page).nth(1).boundingBox())!,
      ];
      expect(Math.abs(a.y - b.y)).toBeLessThan(1);
      expect(errors).toEqual([]);
    });
  });

  test('mode capture : ni bouton ni album', async ({ page }) => {
    await open(page, '?capture=1&seed=7');
    await expect(page.locator('[data-album-toggle]')).toHaveCount(0);
    await expect(page.locator('app-photo-album')).toHaveCount(0);
  });
});
