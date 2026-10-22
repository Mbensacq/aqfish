import { expect, test, type Page } from '@playwright/test';

import { PALETTE } from '../src/app/render/palette';

/**
 * Feuilles mortes du bassin (issue #107) : visibles de dessus et en trois-quarts au temps
 * des captures, absentes à t = 0, stables d'une image à la suivante (aucun scintillement).
 */

async function open(page: Page, search: string, errors: string[]): Promise<void> {
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`/${search}`);
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
}

/** Indices des pixels de la capture d'écran égaux à l'une des couleurs demandées. */
async function colorPositions(page: Page, colors: readonly string[]): Promise<number[]> {
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
      const positions: number[] = [];
      for (let i = 0; i < data.length; i += 4) {
        if (wanted.includes((data[i] << 16) | (data[i + 1] << 8) | data[i + 2])) {
          positions.push(i / 4);
        }
      }
      return positions;
    },
    { png: png.toString('base64'), colors },
  );
}

/**
 * Tons clairs du dessus des feuilles (`render/floating-leaf-model.ts`, recopiés : le module
 * importe Three.js). Ni les nénuphars, ni l'eau, ni les koïs ne les emploient ; la margelle et
 * les rochers peuvent, mais ils ne bougent pas.
 */
const LEAF_COLORS = [PALETTE.sableSombre, PALETTE.tritonOrange] as const;

/** Sans koïs : seules les feuilles et les nénuphars bougent d'une image à l'autre. */
const url = (camera: string, time: number) =>
  `?capture=1&seed=42&environnement=bassin&population=koi:0&camera=${camera}&time=${time}`;

/** Nombre de pixels qui changent entre deux ensembles de positions. */
function changed(a: readonly number[], b: readonly number[]): number {
  const first = new Set(a);
  const second = new Set(b);
  return a.filter((p) => !second.has(p)).length + b.filter((p) => !first.has(p)).length;
}

test.describe('Feuilles mortes (#107)', () => {
  for (const camera of ['top', 'three-quarter'] as const) {
    test(`${camera} : absentes à t = 0, posées à 30 s, stables d'une image à la suivante`, async ({
      page,
    }) => {
      const errors: string[] = [];
      await open(page, url(camera, 0), errors);
      const empty = await colorPositions(page, LEAF_COLORS);

      await open(page, url(camera, 30), errors);
      const leaves = await colorPositions(page, LEAF_COLORS);
      // Un pixel de scène = 3 × 3 pixels d'écran ; deux feuilles posées (moins de pixels en
      // trois-quarts, vues de biais) : 10 pixels de scène de plus en trois-quarts à la graine
      // 42, une trentaine de dessus.
      expect(leaves.length - empty.length).toBeGreaterThanOrEqual(9 * (camera === 'top' ? 20 : 8));

      // Même temps : mêmes pixels (contrat de capture).
      await open(page, url(camera, 30), errors);
      expect(await colorPositions(page, LEAF_COLORS)).toEqual(leaves);

      // Image suivante (1/60 s) : une feuille dérive de quelques dixièmes de millimètre ; au
      // plus quelques pixels de scène changent, jamais une feuille qui clignote.
      await open(page, url(camera, 30 + 1 / 60), errors);
      const next = await colorPositions(page, LEAF_COLORS);
      expect(changed(leaves, next)).toBeLessThanOrEqual(9 * 4);
      expect(errors).toEqual([]);
    });
  }
});
