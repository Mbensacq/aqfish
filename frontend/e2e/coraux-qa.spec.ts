import { expect, test, type Page } from '@playwright/test';

/** QA des coraux du récif (#149) : présence à l'écran, case « Afficher le décor », autres environnements. */

const hostEl = (page: Page) => page.locator('app-aquarium-host');
const toggle = (page: Page) => page.getByRole('button', { name: 'Réglages' });
const speed = (page: Page) => page.getByRole('slider', { name: 'Vitesse de la simulation' });
const decor = (page: Page) => page.getByRole('checkbox', { name: 'Afficher le décor' });

/** Violets du corail (flancs et dessus) : aucune autre entité de la scène n'en porte. */
const VIOLETS = ['#7d4fb8', '#b58be6'];

async function open(page: Page, search: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(`/${search}`);
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  return errors;
}

async function violetPixels(page: Page): Promise<number> {
  const png = (await page.locator('canvas').screenshot({ animations: 'disabled' })).toString(
    'base64',
  );
  return page.evaluate(
    async ({ png, colors }) => {
      const blob = await (await fetch(`data:image/png;base64,${png}`)).blob();
      const bitmap = await createImageBitmap(blob);
      const context = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d');
      if (!context) {
        throw new Error('Contexte 2D indisponible');
      }
      context.drawImage(bitmap, 0, 0);
      const d = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
      const set = new Set(colors);
      let count = 0;
      for (let i = 0; i < d.length; i += 4) {
        const hex =
          '#' + [d[i], d[i + 1], d[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('');
        if (set.has(hex)) count++;
      }
      return count;
    },
    { png, colors: VIOLETS },
  );
}

async function freeze(page: Page): Promise<void> {
  await toggle(page).click();
  await speed(page).fill('0');
  await page.getByRole('button', { name: /vue de face/i }).click();
  await page.waitForTimeout(800);
}

test.describe('Coraux du récif : parcours utilisateur', () => {
  test('récif : des coraux violets sont visibles, la case « décor » les masque puis les rend', async ({
    page,
  }) => {
    const errors = await open(page, '?environnement=recif&seed=42&heure=12');
    await freeze(page);
    const shown = await violetPixels(page);
    expect(shown).toBeGreaterThan(200);
    await decor(page).uncheck();
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-decor', 'false');
    await expect.poll(() => violetPixels(page)).toBeLessThan(shown * 0.01);
    await decor(page).check();
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-decor', 'true');
    await expect.poll(() => violetPixels(page)).toBeGreaterThan(shown * 0.9);
    expect(errors).toEqual([]);
  });

  for (const env of ['tropical', 'bassin', 'paludarium']) {
    test(`${env} : aucun pixel de corail violet`, async ({ page }) => {
      const errors = await open(page, `?environnement=${env}&seed=42&heure=12`);
      expect(await violetPixels(page)).toBe(0);
      expect(errors).toEqual([]);
    });
  }

  test('même graine, même récif (deux pages neuves)', async ({ page, context }) => {
    await open(page, '?environnement=recif&seed=42&heure=12');
    await freeze(page);
    const a = await violetPixels(page);
    expect(a).toBeGreaterThan(200);
    // Un seul rendu logiciel à la fois : la première page est fermée avant d'ouvrir la seconde.
    await page.close();
    const second = await context.newPage();
    await open(second, '?environnement=recif&seed=42&heure=12');
    await freeze(second);
    expect(await violetPixels(second)).toBe(a);
  });

  test('vue de dessous : le récif reste affiché sans erreur', async ({ page }) => {
    const errors = await open(page, '?environnement=recif&seed=7&camera=bottom');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-camera', /.+/);
    await page.mouse.wheel(0, -400);
    expect(errors).toEqual([]);
  });
});
