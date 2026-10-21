import { expect, test, type Page } from '@playwright/test';

import { PALETTE } from '../src/app/render/palette';

/**
 * Fleurs des nénuphars et lotus (issue #104) : roses à cœur jaune de jour, refermées la nuit,
 * sans effet sur le bac tropical, sans erreur sur les graines extrêmes ni sur petit écran.
 */

async function open(page: Page, search: string, errors: string[]): Promise<void> {
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`/${search}`);
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
}

/** Nombre de pixels de la capture d'écran égaux à chacune des couleurs demandées. */
async function countColors(page: Page, colors: readonly string[]): Promise<number[]> {
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

const FLOWER_COLORS = [PALETTE.nenupharRose, PALETTE.coeurFleur] as const;

test.describe('Fleurs de nénuphar (#104)', () => {
  test('de dessus à midi : pétales roses et cœur jaune lisibles ; la scène change à minuit', async ({
    page,
  }) => {
    const errors: string[] = [];
    const url = (hour: number) =>
      `?capture=1&seed=42&environnement=bassin&camera=top&population=koi:0&heure=${hour}`;
    await open(page, url(12), errors);
    const noon = await countColors(page, FLOWER_COLORS);
    // Un pixel de scène = 3 × 3 pixels d'écran.
    expect(noon[0]).toBeGreaterThan(9 * 15);
    expect(noon[1]).toBeGreaterThan(0);

    // Même heure : mêmes comptes (contrat de capture).
    await open(page, url(12), errors);
    expect(await countColors(page, FLOWER_COLORS)).toEqual(noon);

    // À minuit, les fleurs sont fermées : bien moins de rose pur qu'à midi.
    await open(page, url(0), errors);
    const midnight = await countColors(page, FLOWER_COLORS);
    expect(midnight[0]).toBeLessThan(noon[0]);
    expect(errors).toEqual([]);
  });

  for (const seed of [0, 1, 4294967295]) {
    test(`graine ${seed}, écran de 390 px, à midi : aucune erreur`, async ({ page }) => {
      const errors: string[] = [];
      await page.setViewportSize({ width: 390, height: 844 });
      await open(page, `?capture=1&seed=${seed}&environnement=bassin&heure=12`, errors);
      expect(await countColors(page, FLOWER_COLORS)).toHaveLength(2);
      expect(errors).toEqual([]);
    });
  }
});
