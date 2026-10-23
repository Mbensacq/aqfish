import { expect, test, type Page } from '@playwright/test';

import { ENVIRONMENT_TONES, PALETTE } from '../src/app/render/palette';

/**
 * Chirurgiens bleus du récif (#151) : leur bleu survit à la passe palette (ni ramené sur
 * l'eau du récif, ni sur le bleu néon), n'apparaît que là où ils nagent, et la population
 * se règle par l'URL.
 */

const BLUE = ENVIRONMENT_TONES.chirurgienBleu;
const WATER = [ENVIRONMENT_TONES.eauRecif, ENVIRONMENT_TONES.eauRecifClaire];

async function capture(page: Page, search: string): Promise<Buffer> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`/?capture=1&seed=42&time=30&${search}`);
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  const png = await page.screenshot({ animations: 'disabled' });
  expect(errors).toEqual([]);
  return png;
}

/** Nombre de pixels de l'image égaux à chacune des couleurs demandées. */
async function countColors(page: Page, png: Buffer, colors: string[]): Promise<number[]> {
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

test.describe('Chirurgiens bleus (#151)', () => {
  for (const camera of ['side', 'front', 'three-quarter']) {
    test(`récif, vue ${camera} : bleu du chirurgien distinct de l’eau et du bleu néon`, async ({
      page,
    }) => {
      const png = await capture(page, `environnement=recif&camera=${camera}`);
      const [blue, neon, water, clear] = await countColors(page, png, [
        BLUE,
        PALETTE.neonBleu,
        ...WATER,
      ]);
      // Un pixel de scène = 3 × 3 pixels d'écran ; quatre chirurgiens d'au moins
      // quelques pixels de scène chacun (mesuré : 744 à 1 305 pixels selon la vue).
      expect(blue).toBeGreaterThan(9 * 30);
      // L'eau garde ses deux bleus, et aucun pixel ne retombe sur le bleu néon.
      expect(water + clear).toBeGreaterThan(blue * 10);
      expect(neon).toBe(0);
    });
  }

  test('témoin : sans chirurgiens, leur bleu est absent du récif', async ({ page }) => {
    const png = await capture(page, 'environnement=recif&camera=side&population=chirurgien:0');
    const [blue] = await countColors(page, png, [BLUE]);
    expect(blue).toBe(0);
  });

  test('bac tropical : aucun pixel de leur bleu (ton propre au récif)', async ({ page }) => {
    const png = await capture(page, 'camera=front');
    const [blue] = await countColors(page, png, [BLUE]);
    expect(blue).toBe(0);
  });
});
