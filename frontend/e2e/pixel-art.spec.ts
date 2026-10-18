import { expect, test, type Page } from '@playwright/test';

import { PALETTE_COLORS } from '../src/app/render/palette';
import { PIXEL_SIZE } from '../src/app/render/pixel-art';

/**
 * Pipeline pixel art vu de l'écran (QA, nuit 2026-10-17, issue #6) : chaque pixel affiché
 * appartient à la palette et chaque pixel de scène couvre un bloc uniforme de
 * PIXEL_SIZE × PIXEL_SIZE pixels CSS, quels que soient le zoom, la taille de la fenêtre
 * et la densité de l'écran.
 *
 * L'analyse se fait sur la capture d'écran réelle (ce que voit l'utilisateur), décodée dans
 * le navigateur. Les blocs sont alignés sur le coin inférieur gauche du canvas
 * (`gl_FragCoord`) : la rangée du haut peut être rognée.
 */

interface PixelReport {
  width: number;
  height: number;
  colorCount: number;
  offPalette: string[];
  /** Pixels qui diffèrent du pixel de référence de leur bloc. */
  blockViolations: number;
}

async function openScene(page: Page, search = ''): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`/${search}`);
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  return errors;
}

async function cameraOf(page: Page): Promise<string | null> {
  return page.locator('app-aquarium-host').getAttribute('data-aqfish-camera');
}

/** Analyse la capture d'écran : couleurs hors palette et blocs non uniformes. */
async function analyseScreen(page: Page, blockSize: number): Promise<PixelReport> {
  const png = (await page.screenshot({ animations: 'disabled' })).toString('base64');
  return page.evaluate(
    async ({ png, blockSize, palette }) => {
      const blob = await (await fetch(`data:image/png;base64,${png}`)).blob();
      const bitmap = await createImageBitmap(blob);
      const { width, height } = bitmap;
      const context = new OffscreenCanvas(width, height).getContext('2d');
      if (!context) {
        throw new Error('Contexte 2D indisponible');
      }
      context.drawImage(bitmap, 0, 0);
      const data = context.getImageData(0, 0, width, height).data;
      const rgb = (x: number, y: number) => {
        const i = (y * width + x) * 4;
        return (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
      };

      const allowed = new Set(palette.map((hex) => Number.parseInt(hex.slice(1), 16)));
      const colors = new Set<number>();
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          colors.add(rgb(x, y));
        }
      }
      const offPalette = [...colors]
        .filter((c) => !allowed.has(c))
        .map((c) => `#${c.toString(16).padStart(6, '0')}`);

      let blockViolations = 0;
      const topOffset = height % blockSize;
      for (let top = topOffset > 0 ? topOffset - blockSize : 0; top < height; top += blockSize) {
        const y0 = Math.max(top, 0);
        const y1 = Math.min(top + blockSize, height);
        for (let x0 = 0; x0 < width; x0 += blockSize) {
          const x1 = Math.min(x0 + blockSize, width);
          const reference = rgb(x0, y0);
          for (let y = y0; y < y1; y++) {
            for (let x = x0; x < x1; x++) {
              if (rgb(x, y) !== reference) {
                blockViolations++;
              }
            }
          }
        }
      }
      return { width, height, colorCount: colors.size, offPalette, blockViolations };
    },
    { png, blockSize, palette: [...PALETTE_COLORS] },
  );
}

function expectPixelArt(report: PixelReport, width: number, height: number): void {
  expect(report.width).toBe(width);
  expect(report.height).toBe(height);
  expect(report.offPalette).toEqual([]);
  expect(report.blockViolations).toBe(0);
  // Le bac est visible : fond, eau, sable et verre au minimum.
  expect(report.colorCount).toBeGreaterThanOrEqual(4);
}

test.describe('Pipeline pixel art', () => {
  test('mode capture : uniquement des couleurs de la palette, en blocs de PIXEL_SIZE', async ({
    page,
  }) => {
    const errors = await openScene(page, '?capture=1&camera=three-quarter');
    expectPixelArt(await analyseScreen(page, PIXEL_SIZE), 1280, 720);
    expect(errors).toEqual([]);
  });

  test('après zoom et rotation, la taille des pixels de scène ne change pas', async ({ page }) => {
    const errors = await openScene(page);
    const before = await cameraOf(page);

    await page.mouse.move(640, 360);
    await page.mouse.wheel(0, -600);
    await page.mouse.down({ button: 'left' });
    await page.mouse.move(780, 300, { steps: 8 });
    await page.mouse.up({ button: 'left' });
    await expect.poll(() => cameraOf(page)).not.toEqual(before);

    expectPixelArt(await analyseScreen(page, PIXEL_SIZE), 1280, 720);
    expect(errors).toEqual([]);
  });

  test('fenêtre aux dimensions non multiples de PIXEL_SIZE, puis redimensionnée', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1001, height: 701 });
    const errors = await openScene(page, '?capture=1&camera=front');
    expectPixelArt(await analyseScreen(page, PIXEL_SIZE), 1001, 701);

    await page.setViewportSize({ width: 778, height: 556 });
    await expect
      .poll(() => page.locator('canvas').evaluate((c: HTMLCanvasElement) => c.width))
      .toBe(778);
    expectPixelArt(await analyseScreen(page, PIXEL_SIZE), 778, 556);
    expect(errors).toEqual([]);
  });

  test.describe('petit écran (390 × 844)', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('les pixels de scène restent nets et dans la palette', async ({ page }) => {
      const errors = await openScene(page, '?capture=1&camera=bottom');
      expectPixelArt(await analyseScreen(page, PIXEL_SIZE), 390, 844);
      expect(errors).toEqual([]);
    });
  });

  test.describe('écran haute densité (pixel ratio 2)', () => {
    test.use({ deviceScaleFactor: 2 });

    test('un pixel de scène couvre PIXEL_SIZE pixels CSS, soit 2 × PIXEL_SIZE pixels physiques', async ({
      page,
    }) => {
      const errors = await openScene(page);
      expectPixelArt(await analyseScreen(page, 2 * PIXEL_SIZE), 2560, 1440);
      expect(errors).toEqual([]);
    });
  });
});
