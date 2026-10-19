import { expect, test, type Page } from '@playwright/test';

import { PALETTE_COLORS } from '../src/app/render/palette';
import { PIXEL_SIZE } from '../src/app/render/pixel-art';

/**
 * Filtre pixel art désactivable (issue #33) : bouton « Pixel art » et touche `P`, bascule à
 * chaud, mémorisation (`aqfish.filtre`), paramètre d'URL `filtre=pixel|aucun`.
 * L'état est lu sur `data-aqfish-filter`, la caméra sur `data-aqfish-camera` / `-target`
 * et la simulation sur `data-aqfish-tick` / `-seed` (docs/ARCHITECTURE.md).
 */

const host = (page: Page) => page.locator('app-aquarium-host');
const toggle = (page: Page) => page.getByRole('button', { name: /Filtre pixel art/ });

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

async function cameraState(page: Page): Promise<(string | null)[]> {
  return [
    await host(page).getAttribute('data-aqfish-camera'),
    await host(page).getAttribute('data-aqfish-target'),
  ];
}

async function tick(page: Page): Promise<number> {
  return Number(await host(page).getAttribute('data-aqfish-tick'));
}

interface ColorReport {
  colorCount: number;
  offPalette: number;
  /** Pixels qui diffèrent du pixel de référence de leur bloc PIXEL_SIZE × PIXEL_SIZE. */
  blockViolations: number;
}

/**
 * Image 3D (interface masquée) : nombre de couleurs, couleurs hors palette, et pixels qui
 * rompent les blocs de PIXEL_SIZE (alignés en bas à gauche, comme `e2e/pixel-art.spec.ts`).
 */
async function analyseColors(page: Page): Promise<ColorReport> {
  const style = await page.addStyleTag({
    content: 'app-root > :not(app-aquarium-host) { visibility: hidden !important; }',
  });
  const png = (await page.screenshot({ animations: 'disabled' })).toString('base64');
  await style.evaluate((element) => element.remove());
  return page.evaluate(
    async ({ png, palette, blockSize }) => {
      const bitmap = await createImageBitmap(
        await (await fetch(`data:image/png;base64,${png}`)).blob(),
      );
      const context = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d');
      if (!context) {
        throw new Error('Contexte 2D indisponible');
      }
      context.drawImage(bitmap, 0, 0);
      const { width, height } = bitmap;
      const data = context.getImageData(0, 0, width, height).data;
      const rgb = (x: number, y: number) => {
        const i = (y * width + x) * 4;
        return (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
      };
      const colors = new Set<number>();
      for (let i = 0; i < data.length; i += 4) {
        colors.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
      }
      const allowed = new Set(palette.map((hex) => Number.parseInt(hex.slice(1), 16)));
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
      return {
        colorCount: colors.size,
        offPalette: [...colors].filter((c) => !allowed.has(c)).length,
        blockViolations,
      };
    },
    { png, palette: [...PALETTE_COLORS], blockSize: PIXEL_SIZE },
  );
}

test.describe('Filtre pixel art', () => {
  test('pixel art par défaut ; le bouton et la touche P basculent à chaud', async ({ page }) => {
    const errors = await openScene(page, '?camera=front');
    await expect(host(page)).toHaveAttribute('data-aqfish-filter', 'pixel');
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
    const seed = await host(page).getAttribute('data-aqfish-seed');
    const camera = await cameraState(page);
    const tickBefore = await tick(page);

    await toggle(page).click();
    await expect(host(page)).toHaveAttribute('data-aqfish-filter', 'aucun');
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
    // Ni la caméra ni la simulation ne sont réinitialisées : le temps continue de courir.
    expect(await cameraState(page)).toEqual(camera);
    expect(await host(page).getAttribute('data-aqfish-seed')).toBe(seed);
    await expect.poll(() => tick(page)).toBeGreaterThan(tickBefore);

    const tickMiddle = await tick(page);
    await page.keyboard.press('p');
    await expect(host(page)).toHaveAttribute('data-aqfish-filter', 'pixel');
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
    expect(await cameraState(page)).toEqual(camera);
    expect(await tick(page)).toBeGreaterThanOrEqual(tickMiddle);
    // Le préréglage suivi n'est pas perdu.
    await expect(page.getByRole('button', { name: /Vue de face/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await page.keyboard.press('P');
    await expect(host(page)).toHaveAttribute('data-aqfish-filter', 'aucun');
    expect(errors).toEqual([]);
  });

  test('sans filtre, l’image dépasse la palette ; en pixel art, elle y reste', async ({ page }) => {
    const errors = await openScene(page, '?camera=three-quarter');
    const pixel = await analyseColors(page);
    expect(pixel.offPalette).toBe(0);
    expect(pixel.blockViolations).toBe(0);

    await page.keyboard.press('p');
    await expect(host(page)).toHaveAttribute('data-aqfish-filter', 'aucun');
    // Laisser passer au moins une image dans le nouveau mode.
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    // Hors palette et en pleine résolution (les blocs de PIXEL_SIZE sont rompus). La scène est
    // en couleurs plates sans anticrénelage : le nombre de couleurs reste modeste (une
    // vingtaine), mais dépasse celui du pixel art.
    const none = await analyseColors(page);
    expect(none.offPalette).toBeGreaterThan(0);
    expect(none.blockViolations).toBeGreaterThan(0);
    expect(none.colorCount).toBeGreaterThan(pixel.colorCount);

    await page.keyboard.press('p');
    await expect(host(page)).toHaveAttribute('data-aqfish-filter', 'pixel');
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    const back = await analyseColors(page);
    expect(back.offPalette).toBe(0);
    expect(back.blockViolations).toBe(0);
    expect(errors).toEqual([]);
  });

  test('le choix est conservé au rechargement ; filtre= dans l’URL le prime', async ({ page }) => {
    await openScene(page);
    await toggle(page).click();
    await expect(host(page)).toHaveAttribute('data-aqfish-filter', 'aucun');

    await page.reload();
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    await expect(host(page)).toHaveAttribute('data-aqfish-filter', 'aucun');
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');

    await openScene(page, '?filtre=pixel');
    await expect(host(page)).toHaveAttribute('data-aqfish-filter', 'pixel');
    // L'URL ne modifie pas le choix mémorisé.
    expect(await page.evaluate(() => localStorage.getItem('aqfish.filtre'))).toBe('aucun');

    await openScene(page, '?filtre=n-importe-quoi');
    await expect(host(page)).toHaveAttribute('data-aqfish-filter', 'aucun');
  });

  test('mode capture : pixel art sans paramètre (même avec un choix mémorisé), filtre=aucun respecté', async ({
    page,
  }) => {
    await openScene(page);
    await page.evaluate(() => localStorage.setItem('aqfish.filtre', 'aucun'));

    await openScene(page, '?capture=1&camera=three-quarter');
    await expect(host(page)).toHaveAttribute('data-aqfish-filter', 'pixel');
    expect((await analyseColors(page)).offPalette).toBe(0);

    await openScene(page, '?capture=1&camera=three-quarter&filtre=aucun');
    await expect(host(page)).toHaveAttribute('data-aqfish-filter', 'aucun');
    const none = await analyseColors(page);
    expect(none.offPalette).toBeGreaterThan(0);
    expect(none.blockViolations).toBeGreaterThan(0);
    // Contrat de capture : même URL ⇒ même image, y compris sans filtre.
    const first = await page.screenshot({ animations: 'disabled' });
    await openScene(page, '?capture=1&camera=three-quarter&filtre=aucun');
    expect((await page.screenshot({ animations: 'disabled' })).equals(first)).toBe(true);
  });

  test.describe('petit écran (390 × 844)', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('la barre, bouton « Pixel art » compris, tient entière dans la largeur (#22)', async ({
      page,
    }) => {
      const errors = await openScene(page);
      const bar = page.locator('app-view-presets-bar .view-presets-bar');
      const box = (await bar.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(390);
      const buttons = bar.getByRole('button');
      // 5 vues, « Pixel art » et « Nourrir » (#67).
      await expect(buttons).toHaveCount(7);
      const firstHeight = (await buttons.first().boundingBox())!.height;
      for (const button of await buttons.all()) {
        const b = (await button.boundingBox())!;
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.x + b.width).toBeLessThanOrEqual(390);
        // Le libellé n'est ni rogné ni coupé sur deux lignes (même hauteur que « Dessus »).
        expect(await button.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
        expect(b.height).toBe(firstHeight);
      }
      await toggle(page).click();
      await expect(host(page)).toHaveAttribute('data-aqfish-filter', 'aucun');
      expect(errors).toEqual([]);
    });
  });
});
