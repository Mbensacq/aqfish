import { expect, test, type Page } from '@playwright/test';

import { PALETTE } from '../src/app/render/palette';

/**
 * Deuxième espèce, le guppy (issue #30) : mâles (caudale orange tachée de rose) et femelles
 * (corps sable, nageoires sable clair) visibles de face, avec les couleurs exactes de la
 * palette. Le sable clair n'apparaît nulle part ailleurs dans la vue de face : il signe les
 * nageoires des femelles.
 */

async function countColors(page: Page, search: string, colors: string[]): Promise<number[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`/${search}`);
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  const png = await page.screenshot({ animations: 'disabled' });
  expect(errors).toEqual([]);
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

const GUPPY_COLORS = [PALETTE.koiOrange, PALETTE.nenupharRose, PALETTE.sableClair];

test.describe('Guppys', () => {
  for (const time of [0, 30]) {
    test(`de face (t = ${time} s) : mâles et femelles visibles, couleurs de la palette`, async ({
      page,
    }) => {
      const [orange, pink, paleSand] = await countColors(
        page,
        `?capture=1&seed=42&camera=front&time=${time}`,
        GUPPY_COLORS,
      );
      // Un pixel de scène = 3 × 3 pixels d'écran.
      expect(orange, 'caudale orange des mâles').toBeGreaterThanOrEqual(9 * 4);
      expect(pink, 'taches roses des mâles').toBeGreaterThanOrEqual(9);
      expect(paleSand, 'nageoires sable clair des femelles').toBeGreaterThanOrEqual(9);
    });
  }

  test('témoin : de dessous, aucune couleur propre au guppy', async ({ page }) => {
    // La vue de dessous cache les poissons derrière le substrat opaque (ADR 0006).
    const counts = await countColors(page, '?capture=1&seed=42&camera=bottom&time=0', GUPPY_COLORS);
    expect(counts).toEqual([0, 0, 0]);
  });
});
