import { expect, test, type Page } from '@playwright/test';

import { PALETTE } from '../src/app/render/palette';

/**
 * Première espèce qui nage, le néon (issue #8) : les poissons sont visibles avec leurs
 * couleurs de la palette, ondulent avec le temps de simulation, et une même URL de capture
 * donne toujours la même image.
 */

async function captureScreen(page: Page, search: string): Promise<Buffer> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`/${search}`);
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
        const rgb = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
        const index = wanted.indexOf(rgb);
        if (index >= 0) {
          counts[index]++;
        }
      }
      return counts;
    },
    { png: png.toString('base64'), colors },
  );
}

test.describe('Néons', () => {
  test('visibles de face avec le bleu et le rouge néon de la palette', async ({ page }) => {
    const png = await captureScreen(page, '?capture=1&seed=42&camera=front&time=30');
    const [blue, red] = await countColors(page, png, [PALETTE.neonBleu, PALETTE.neonRouge]);
    // Un pixel de scène = 3 × 3 pixels d'écran ; plusieurs poissons visibles.
    expect(blue).toBeGreaterThan(9 * 10);
    expect(red).toBeGreaterThan(9 * 10);
  });

  test('même URL de capture ⇒ image identique', async ({ page }) => {
    const url = '?capture=1&seed=7&camera=three-quarter&time=12';
    const first = await captureScreen(page, url);
    const second = await captureScreen(page, url);
    expect(second.equals(first)).toBe(true);
  });

  test('temps de simulation différent ⇒ image différente (nage et ondulation)', async ({
    page,
  }) => {
    const a = await captureScreen(page, '?capture=1&seed=7&camera=front&time=12');
    const b = await captureScreen(page, '?capture=1&seed=7&camera=front&time=12.1');
    expect(b.equals(a)).toBe(false);
  });

  test('sans néons, la scène ne contient pas leurs couleurs (témoin)', async ({ page }) => {
    // Témoin du premier test : la vue de dessous cache les poissons derrière le substrat
    // opaque (ADR 0006) ; ni bleu ni rouge néon ne doivent apparaître ailleurs.
    const png = await captureScreen(page, '?capture=1&seed=42&camera=bottom&time=0');
    const [blue, red] = await countColors(page, png, [PALETTE.neonBleu, PALETTE.neonRouge]);
    expect(blue + red).toBeLessThan(9 * 10);
  });
});
