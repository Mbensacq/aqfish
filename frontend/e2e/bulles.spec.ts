import { expect, test, type Page } from '@playwright/test';

import { PALETTE, PALETTE_COLORS } from '../src/app/render/palette';
import { MAX_BUBBLES } from '../src/app/sim/bubbles';

/**
 * Bulles, caustiques et reflet de surface (issue #50), vus depuis l'application réelle.
 *
 * Signatures de couleur (relevées sur les captures) : les caustiques sont les seuls pixels
 * `sableClair` de la vue de dessus (avant elles, le sable vu à travers l'eau y était
 * `sable`) ; le reflet de surface donne des pixels `eauClaire` en vue de dessus comme de
 * dessous, couleur absente de ces deux vues sans lui.
 */
async function shoot(page: Page, camera: string, time: number, seed = 42): Promise<string> {
  await page.goto(`/?capture=1&seed=${seed}&camera=${camera}&time=${time}`);
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  return (await page.screenshot({ animations: 'disabled' })).toString('base64');
}

/** Histogramme des couleurs (`#rrggbb`) d'une capture, et pixels d'une couleur donnée. */
async function analyse(
  page: Page,
  png: string,
  marked: string,
): Promise<{ histogram: Record<string, number>; markedPixels: number[] }> {
  return page.evaluate(
    async ({ png, marked }) => {
      const blob = await (await fetch(`data:image/png;base64,${png}`)).blob();
      const bitmap = await createImageBitmap(blob);
      const context = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d');
      if (!context) {
        throw new Error('Contexte 2D indisponible');
      }
      context.drawImage(bitmap, 0, 0);
      const d = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
      const histogram: Record<string, number> = {};
      const markedPixels: number[] = [];
      for (let i = 0; i < d.length; i += 4) {
        const hex =
          '#' + [d[i], d[i + 1], d[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('');
        histogram[hex] = (histogram[hex] ?? 0) + 1;
        if (hex === marked) {
          markedPixels.push(i / 4);
        }
      }
      return { histogram, markedPixels };
    },
    { png, marked },
  );
}

test.describe('Bulles, caustiques et reflet de surface', () => {
  test('captures déterministes : même graine, même temps ⇒ mêmes octets (3 angles)', async ({
    page,
  }) => {
    for (const camera of ['front', 'top', 'bottom']) {
      const a = await shoot(page, camera, 17.3);
      const b = await shoot(page, camera, 17.3);
      expect(a === b, camera).toBe(true);
    }
  });

  test('des bulles montent du diffuseur, en nombre borné, sans erreur', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    for (const seed of [0, 42, 4294967295]) {
      await shoot(page, 'front', 30, seed);
      const count = await page.evaluate((): number => {
        const debug = (window as unknown as { ng?: { getComponent(el: Element): unknown } }).ng;
        const host = document.querySelector('app-aquarium-host');
        const component = debug && host ? debug.getComponent(host) : null;
        return (component as { bubbleCount?: number } | null)?.bubbleCount ?? -1;
      });
      expect(count, `graine ${seed}`).toBeGreaterThanOrEqual(8);
      expect(count, `graine ${seed}`).toBeLessThanOrEqual(MAX_BUBBLES);
    }
    expect(errors).toEqual([]);
  });

  test('vue de dessus : caustiques animées et reflet, uniquement des couleurs de la palette', async ({
    page,
  }) => {
    const palette = new Set(PALETTE_COLORS);
    const first = await analyse(page, await shoot(page, 'top', 12), PALETTE.sableClair);
    const later = await analyse(page, await shoot(page, 'top', 14), PALETTE.sableClair);
    for (const { histogram } of [first, later]) {
      const outside = Object.keys(histogram).filter((c) => !palette.has(c));
      expect(outside).toEqual([]);
      expect(histogram[PALETTE.eauClaire] ?? 0).toBeGreaterThan(500);
    }
    // Caustiques présentes…
    expect(first.markedPixels.length).toBeGreaterThan(2000);
    // … et qui glissent : en 2 s, une bonne part des pixels allumés a changé.
    const lit = new Set(later.markedPixels);
    const kept = first.markedPixels.filter((p) => lit.has(p)).length;
    expect(kept / first.markedPixels.length).toBeLessThan(0.7);
  });

  test('vue de dessous : le reflet de surface est visible', async ({ page }) => {
    const { histogram } = await analyse(page, await shoot(page, 'bottom', 12), PALETTE.eauClaire);
    expect(histogram[PALETTE.eauClaire] ?? 0).toBeGreaterThan(500);
  });
});
