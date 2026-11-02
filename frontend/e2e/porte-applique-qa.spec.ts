import { expect, test, type Page } from '@playwright/test';

/**
 * Détails de la pièce (#363, ADR 0093), vus de l'extérieur : la porte et l'applique du mur de
 * droite apparaissent en caméra libre, l'applique change l'image entre le jour et la nuit,
 * et rien ne produit d'erreur, y compris en petite fenêtre.
 */

const VERS_LA_PORTE = 'libre=1.2:0.85:3:-55:-8';

async function capture(page: Page, search: string): Promise<Buffer> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(`/${search}`);
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  const png = await page.screenshot({ animations: 'disabled' });
  expect(errors).toEqual([]);
  return png;
}

async function pixelsDifferents(page: Page, a: Buffer, b: Buffer): Promise<number> {
  return page.evaluate(
    async ({ x, y }) => {
      const lire = async (data: string) => {
        const bitmap = await createImageBitmap(
          await (await fetch(`data:image/png;base64,${data}`)).blob(),
        );
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(bitmap, 0, 0);
        return ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
      };
      const [pa, pb] = [await lire(x), await lire(y)];
      let n = 0;
      for (let i = 0; i < pa.length; i += 4) {
        if (pa[i] !== pb[i] || pa[i + 1] !== pb[i + 1] || pa[i + 2] !== pb[i + 2]) n++;
      }
      return n;
    },
    { x: a.toString('base64'), y: b.toString('base64') },
  );
}

test.describe('Porte et applique de la pièce', () => {
  test("l'applique allumée la nuit change l'image par rapport au jour", async ({ page }) => {
    const jour = await capture(page, `?piece=1&heure=12&${VERS_LA_PORTE}`);
    const nuit = await capture(page, `?piece=1&heure=0&${VERS_LA_PORTE}`);
    // Le halo et l'abat-jour allumé couvrent largement plus que du bruit.
    expect(await pixelsDifferents(page, jour, nuit)).toBeGreaterThan(500);
  });

  test("la porte est visible de jour : l'image diffère de celle de la pièce masquée", async ({
    page,
  }) => {
    const avecPiece = await capture(page, `?piece=1&heure=12&${VERS_LA_PORTE}`);
    const sansPiece = await capture(page, `?heure=12&${VERS_LA_PORTE}`);
    expect(await pixelsDifferents(page, avecPiece, sansPiece)).toBeGreaterThan(5000);
  });

  test('petite fenêtre : la pièce se charge sans erreur, de jour comme de nuit', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await capture(page, `?piece=1&heure=12&${VERS_LA_PORTE}`);
    await capture(page, `?piece=1&heure=0&${VERS_LA_PORTE}`);
  });
});
