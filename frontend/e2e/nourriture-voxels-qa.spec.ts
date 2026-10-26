import { expect, test, type Page } from '@playwright/test';

import { FOOD_TONE_COLORS } from '../src/app/render/palette';

/**
 * QA de #226 : les granulés en voxels restent lisibles de nuit et pour d'autres graines, sans
 * liseré sombre propre à la nourriture et sans erreur.
 */

async function countColors(page: Page, hexes: readonly string[]): Promise<number> {
  const png = (await page.screenshot({ animations: 'disabled' })).toString('base64');
  return page.evaluate(
    async ({ png, hexes }) => {
      const bitmap = await createImageBitmap(
        await (await fetch(`data:image/png;base64,${png}`)).blob(),
      );
      const context = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d');
      if (!context) {
        throw new Error('Contexte 2D indisponible');
      }
      context.drawImage(bitmap, 0, 0);
      const d = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
      const wanted = hexes.map((hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)));
      let count = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (wanted.some(([r, g, b]) => d[i] === r && d[i + 1] === g && d[i + 2] === b)) {
          count++;
        }
      }
      return count;
    },
    { png, hexes: [...hexes] },
  );
}

async function openScene(page: Page, search: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`/${search}`);
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  return errors;
}

test.describe('Granulés en voxels (#226, QA)', () => {
  for (const seed of [7, 123]) {
    test(`de nuit, graine ${seed} : tons de la nourriture visibles, sans erreur`, async ({
      page,
    }) => {
      const base = `?capture=1&seed=${seed}&camera=three-quarter&time=30&heure=0&granules=voxels`;
      const errors = await openScene(page, base);
      expect(await countColors(page, FOOD_TONE_COLORS)).toBe(0);

      await openScene(page, `${base}&nourrir=10,25`);
      expect(await countColors(page, FOOD_TONE_COLORS)).toBeGreaterThanOrEqual(3 * 9);
      expect(errors).toEqual([]);
    });
  }
});
