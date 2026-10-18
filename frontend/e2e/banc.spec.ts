import { expect, test, type Page } from '@playwright/test';

import { PALETTE } from '../src/app/render/palette';

/**
 * Comportement de banc (issue #27, QA cycle 8), vu comme un utilisateur : de dessus, les
 * néons (pixels bleu et rouge néon de la palette) sont répartis dans tout le bac au départ,
 * puis se regroupent. La mesure est la dispersion (écart quadratique moyen) des pixels
 * néon autour de leur centre de gravité, sur l'image rendue : elle ne dépend pas des
 * détails internes de la simulation, qui est déterministe (même URL ⇒ même image).
 */

async function neonSpread(page: Page, search: string): Promise<{ count: number; spread: number }> {
  const errors: string[] = [];
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
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
      const xs: number[] = [];
      const ys: number[] = [];
      for (let y = 0; y < bitmap.height; y++) {
        for (let x = 0; x < bitmap.width; x++) {
          const i = (y * bitmap.width + x) * 4;
          if (wanted.includes((data[i] << 16) | (data[i + 1] << 8) | data[i + 2])) {
            xs.push(x);
            ys.push(y);
          }
        }
      }
      const n = xs.length;
      const cx = xs.reduce((a, b) => a + b, 0) / n;
      const cy = ys.reduce((a, b) => a + b, 0) / n;
      const variance = xs.reduce((a, x, i) => a + (x - cx) ** 2 + (ys[i] - cy) ** 2, 0) / n;
      return { count: n, spread: Math.sqrt(variance) };
    },
    { png: png.toString('base64'), colors: [PALETTE.neonBleu, PALETTE.neonRouge] },
  );
}

test.describe('Banc de néons', () => {
  for (const seed of [42, 7, 123]) {
    test(`graine ${seed} : de dessus, les néons sont plus groupés après 30 s qu'au départ`, async ({
      page,
    }) => {
      const start = await neonSpread(page, `?capture=1&seed=${seed}&camera=top&time=0`);
      const later = await neonSpread(page, `?capture=1&seed=${seed}&camera=top&time=30`);
      expect(start.count).toBeGreaterThan(0);
      expect(later.count).toBeGreaterThan(0);
      expect(later.spread).toBeLessThan(start.spread);
    });
  }
});
