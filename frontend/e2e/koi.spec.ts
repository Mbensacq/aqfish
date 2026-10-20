import { expect, test, type Page } from '@playwright/test';

import { PALETTE } from '../src/app/render/palette';

/**
 * Koïs, première espèce du bassin (issue #88) : visibles de dessus avec les couleurs de leurs
 * robes, présents seulement dans le bassin, réglables au panneau du bassin seulement.
 */

const host = (page: Page) => page.locator('app-aquarium-host');

async function open(page: Page, search: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`/${search}`);
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  return errors;
}

/** Nombre de pixels de la capture d'écran égaux à chacune des couleurs demandées. */
async function countColors(page: Page, colors: string[]): Promise<number[]> {
  const png = await page.screenshot({ animations: 'disabled' });
  return page.evaluate(
    async ({ png, colors }) => {
      const blob = await (await fetch(`data:image/png;base64,${png}`)).blob();
      const bitmap = await createImageBitmap(blob);
      const context = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d');
      if (!context) {
        throw new Error('Contexte 2D indisponible');
      }
      context.drawImage(bitmap, 0, 0);
      const data = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
      const wanted = colors.map((c) => parseInt(c.slice(1), 16));
      const counts = wanted.map(() => 0);
      for (let i = 0; i < data.length; i += 4) {
        const index = wanted.indexOf((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
        if (index >= 0) {
          counts[index]++;
        }
      }
      return counts;
    },
    { png: png.toString('base64'), colors },
  );
}

const KOI_COLORS = [PALETTE.koiBlanc, PALETTE.koiRouge, PALETTE.koiOrange];

test.describe('Koïs (#88)', () => {
  test('de dessus, le bassin montre des koïs blancs, rouges et orange ; sans koïs, aucun', async ({
    page,
  }) => {
    const errors = await open(page, '?capture=1&seed=42&environnement=bassin&time=20');
    await expect(host(page)).toHaveAttribute('data-aqfish-population', 'koi:7');
    const [white, red, orange] = await countColors(page, KOI_COLORS);
    // Un pixel de scène = 3 × 3 pixels d'écran ; plusieurs koïs de chaque robe.
    expect(white).toBeGreaterThan(9 * 20);
    expect(red).toBeGreaterThan(9 * 10);
    expect(orange).toBeGreaterThan(9 * 10);
    // Témoin : même scène sans koïs, aucune de leurs couleurs.
    const witness = await open(
      page,
      '?capture=1&seed=42&environnement=bassin&time=20&population=koi:0',
    );
    await expect(host(page)).toHaveAttribute('data-aqfish-population', 'koi:0');
    expect(await countColors(page, KOI_COLORS)).toEqual([0, 0, 0]);
    expect([...errors, ...witness]).toEqual([]);
  });

  test('panneau : le bassin ne propose que les koïs, le bac que ses trois espèces', async ({
    page,
  }) => {
    const errors = await open(page, '?seed=42&environnement=bassin');
    await page.getByRole('button', { name: 'Réglages' }).click();
    const rows = page.locator('[data-section="population"] [data-species]');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toHaveAttribute('data-species', 'koi');
    await page.getByRole('button', { name: 'Ajouter un koï' }).click();
    await expect(host(page)).toHaveAttribute('data-aqfish-population', 'koi:8');
    await page.getByRole('combobox', { name: 'Environnement' }).selectOption('tropical');
    await expect(host(page)).toHaveAttribute('data-aqfish-environment', 'tropical');
    await expect(rows).toHaveCount(3);
    await expect(host(page)).toHaveAttribute(
      'data-aqfish-population',
      'neon:12,guppy:6,corydora:6',
    );
    expect(errors).toEqual([]);
  });

  test('population=koi:5 est ignorée dans le bac tropical', async ({ page }) => {
    const errors = await open(page, '?capture=1&seed=42&population=koi:5,neon:3');
    await expect(host(page)).toHaveAttribute('data-aqfish-population', 'neon:3,guppy:6,corydora:6');
    expect(errors).toEqual([]);
  });
});
