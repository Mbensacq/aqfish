import { expect, test, type Page } from '@playwright/test';

import { PALETTE } from '../src/app/render/palette';

/**
 * Nénuphars du bassin (issue #103) : feuilles lisibles de dessus avec leurs ombres, posées
 * selon le temps simulé (même temps, même image ; autre temps, feuilles déplacées).
 */

async function open(page: Page, search: string, errors: string[]): Promise<void> {
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`/${search}`);
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
}

/**
 * Pixels de la capture d'écran égaux à l'une des couleurs demandées : nombre par couleur et
 * empreinte des positions (indices des pixels, toutes couleurs confondues).
 */
async function colorPixels(
  page: Page,
  colors: readonly string[],
): Promise<{ counts: number[]; positions: number[] }> {
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
      const counts = wanted.map(() => 0);
      const positions: number[] = [];
      for (let i = 0; i < data.length; i += 4) {
        const index = wanted.indexOf((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
        if (index >= 0) {
          counts[index]++;
          positions.push(i / 4);
        }
      }
      return { counts, positions };
    },
    { png: png.toString('base64'), colors },
  );
}

/**
 * Couleurs des feuilles (cœur et bord) et de leur ombre (`render/lily-pad-model.ts`,
 * `render/lily-pad-layer.ts`), recopiées ici : ces modules importent Three.js.
 */
const LEAF_COLORS = [PALETTE.vegetation, PALETTE.vegetationSombre] as const;
const LILY_PAD_SHADOW_COLOR = PALETTE.eauProfonde;

test.describe('Nénuphars (#103)', () => {
  test('de dessus : feuilles en deux tons et ombres sur le fond ; elles dérivent avec le temps', async ({
    page,
  }) => {
    const errors: string[] = [];
    // Sans koïs : seules les feuilles bougent d'une image à l'autre.
    const url = (time: number) =>
      `?capture=1&seed=42&environnement=bassin&population=koi:0&time=${time}`;
    await open(page, url(20), errors);
    const first = await colorPixels(page, [...LEAF_COLORS, LILY_PAD_SHADOW_COLOR]);
    const [core, rim, shadow] = first.counts;
    // Un pixel de scène = 3 × 3 pixels d'écran ; plusieurs feuilles de 10 pixels de rayon.
    expect(core).toBeGreaterThan(9 * 400);
    expect(rim).toBeGreaterThan(9 * 150);
    expect(shadow).toBeGreaterThan(9 * 100);

    // Même temps : mêmes pixels (contrat de capture).
    await open(page, url(20), errors);
    const again = await colorPixels(page, [...LEAF_COLORS, LILY_PAD_SHADOW_COLOR]);
    expect(again.positions).toEqual(first.positions);

    // Quarante secondes plus tard : feuilles et ombres ont dérivé, en gardant leur taille.
    await open(page, url(60), errors);
    const later = await colorPixels(page, [...LEAF_COLORS, LILY_PAD_SHADOW_COLOR]);
    expect(later.positions).not.toEqual(first.positions);
    const leaves = (counts: number[]) => counts[0] + counts[1];
    expect(Math.abs(leaves(later.counts) - leaves(first.counts))).toBeLessThan(
      leaves(first.counts) * 0.1,
    );
    expect(errors).toEqual([]);
  });

  for (const seed of [0, 4294967295]) {
    test(`graine extrême ${seed}, écran de 390 px : feuilles visibles, aucune erreur`, async ({
      page,
    }) => {
      const errors: string[] = [];
      await page.setViewportSize({ width: 390, height: 844 });
      await open(page, `?capture=1&seed=${seed}&environnement=bassin&population=koi:0`, errors);
      const { counts } = await colorPixels(page, [...LEAF_COLORS]);
      expect(counts[0]).toBeGreaterThan(0);
      expect(counts[1]).toBeGreaterThan(0);
      expect(errors).toEqual([]);
    });
  }

  test('le bac tropical n’a pas d’ombre de nénuphar', async ({ page }) => {
    const errors: string[] = [];
    await open(page, '?capture=1&seed=42&camera=top', errors);
    const { counts } = await colorPixels(page, [LILY_PAD_SHADOW_COLOR]);
    // `eauProfonde` n'apparaît pas de dessus dans le bac : aucune ombre de feuille.
    expect(counts).toEqual([0]);
    expect(errors).toEqual([]);
  });
});
