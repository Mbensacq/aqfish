import { expect, test, type Page } from '@playwright/test';

import { PALETTE_COLORS } from '../src/app/render/palette';

/**
 * Mode sans filtre rendu dans une cible pleine résolution (#40, ADR 0101) : la cible suit la
 * taille de la fenêtre, la scène reste visible après un redimensionnement et un aller-retour
 * avec le pixel art, et la rotation à la souris continue de fonctionner. Les teintes sont
 * couvertes par `filtre.spec.ts` et par les captures `*-sans-filtre*`.
 */

const host = (page: Page) => page.locator('app-aquarium-host');

interface SceneReport {
  colorCount: number;
  offPalette: number;
  /** Part des pixels (en ‰) qui diffèrent de la couleur de fond relevée dans le coin. */
  sceneShare: number;
}

async function openScene(page: Page, search: string): Promise<string[]> {
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

/** Image 3D seule (interface masquée) : couleurs distinctes, hors palette, part de scène. */
async function analyseScene(page: Page): Promise<SceneReport> {
  const style = await page.addStyleTag({
    content: 'app-root > :not(app-aquarium-host) { visibility: hidden !important; }',
  });
  const png = (await page.screenshot({ animations: 'disabled' })).toString('base64');
  await style.evaluate((element) => element.remove());
  return page.evaluate(
    async ({ png, palette }) => {
      const bitmap = await createImageBitmap(
        await (await fetch(`data:image/png;base64,${png}`)).blob(),
      );
      const context = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d');
      if (!context) {
        throw new Error('Contexte 2D indisponible');
      }
      context.drawImage(bitmap, 0, 0);
      const data = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
      const key = (i: number) => (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
      const background = key(0);
      const colors = new Set<number>();
      let scene = 0;
      for (let i = 0; i < data.length; i += 4) {
        const color = key(i);
        colors.add(color);
        if (color !== background) {
          scene++;
        }
      }
      const allowed = new Set(palette.map((hex) => Number.parseInt(hex.slice(1), 16)));
      return {
        colorCount: colors.size,
        offPalette: [...colors].filter((c) => !allowed.has(c)).length,
        sceneShare: Math.round((scene / (data.length / 4)) * 1000),
      };
    },
    { png, palette: [...PALETTE_COLORS] },
  );
}

test.describe('Sans filtre en cible pleine résolution', () => {
  test('redimensionnement : la scène suit la fenêtre, sans erreur', async ({ page }) => {
    const errors = await openScene(page, '?camera=three-quarter&filtre=aucun&vitesse=0');
    await expect(host(page)).toHaveAttribute('data-aqfish-filter', 'aucun');
    const large = await analyseScene(page);
    expect(large.offPalette).toBeGreaterThan(0);
    expect(large.sceneShare).toBeGreaterThan(50);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(async () => (await analyseScene(page)).sceneShare, { message: 'scène en 390 × 844' })
      .toBeGreaterThan(50);
    const small = await analyseScene(page);
    expect(small.offPalette).toBeGreaterThan(0);
    expect(small.colorCount).toBeGreaterThan(40);

    await page.setViewportSize({ width: 1280, height: 720 });
    await expect
      .poll(async () => (await analyseScene(page)).sceneShare, { message: 'retour en 1280 × 720' })
      .toBeGreaterThan(50);
    expect(errors).toEqual([]);
  });

  test('aller-retour avec le pixel art : la palette est retrouvée à l’identique', async ({
    page,
  }) => {
    const errors = await openScene(page, '?camera=front&filtre=pixel&vitesse=0');
    const avant = await analyseScene(page);
    expect(avant.offPalette).toBe(0);

    await page.keyboard.press('p');
    await expect(host(page)).toHaveAttribute('data-aqfish-filter', 'aucun');
    expect((await analyseScene(page)).offPalette).toBeGreaterThan(0);

    await page.keyboard.press('p');
    await expect(host(page)).toHaveAttribute('data-aqfish-filter', 'pixel');
    const apres = await analyseScene(page);
    expect(apres.offPalette).toBe(0);
    expect(apres.colorCount).toBe(avant.colorCount);
    expect(errors).toEqual([]);
  });

  test('rotation à la souris et zoom à la molette en mode sans filtre', async ({ page }) => {
    const errors = await openScene(page, '?camera=three-quarter&filtre=aucun&vitesse=0');
    const before = await host(page).getAttribute('data-aqfish-camera');
    const box = await host(page).boundingBox();
    expect(box).not.toBeNull();
    const cx = (box?.x ?? 0) + (box?.width ?? 0) / 2;
    const cy = (box?.y ?? 0) + (box?.height ?? 0) / 2;

    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 160, cy + 40, { steps: 8 });
    await page.mouse.up();
    await page.mouse.wheel(0, -300);

    await expect.poll(() => host(page).getAttribute('data-aqfish-camera')).not.toBe(before);
    await expect
      .poll(async () => (await analyseScene(page)).sceneShare, { message: 'scène après rotation' })
      .toBeGreaterThan(50);
    expect(errors).toEqual([]);
  });
});
