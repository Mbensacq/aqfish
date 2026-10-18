import { expect, test, type Page } from '@playwright/test';

/**
 * Parcours de robustesse de la scène du bac (QA, nuit 2026-10-15) : petit écran,
 * redimensionnement, paramètres d'URL invalides ou extrêmes.
 */

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

async function canvasSize(page: Page): Promise<number[]> {
  return page.locator('canvas').evaluate((c: HTMLCanvasElement) => [c.width, c.height]);
}

test.describe('Petit écran (390 × 844)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('le canvas occupe tout l’écran, sans défilement ni erreur', async ({ page }) => {
    const errors = await openScene(page);
    expect(await page.locator('canvas').boundingBox()).toEqual({
      x: 0,
      y: 0,
      width: 390,
      height: 844,
    });
    const scroll = await page.evaluate(() => [
      document.documentElement.scrollWidth,
      document.documentElement.scrollHeight,
    ]);
    expect(scroll).toEqual([390, 844]);
    expect(errors).toEqual([]);
  });

  test('la barre des préréglages tient entière dans la largeur (#22)', async ({ page }) => {
    const errors = await openScene(page);
    const toolbar = page.getByRole('toolbar', { name: 'Préréglages de vue' });
    const box = await toolbar.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    // Chaque bouton est entièrement visible, donc cliquable.
    const buttons = toolbar.getByRole('button');
    await expect(buttons).toHaveCount(5);
    for (const button of await buttons.all()) {
      const b = (await button.boundingBox())!;
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(390);
    }
    await buttons.first().click();
    await expect(buttons.first()).toHaveAttribute('aria-pressed', 'true');
    expect(errors).toEqual([]);
  });

  test('le contrat de capture fonctionne en portrait', async ({ page }) => {
    const errors = await openScene(page, '?capture=1&camera=front');
    expect(await canvasSize(page)).toEqual([390, 844]);
    await expect(page.locator('h1')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});

test.describe('Redimensionnement', () => {
  test('en mode capture, l’image suit la nouvelle taille de la fenêtre', async ({ page }) => {
    await openScene(page, '?capture=1&camera=front');
    const before = await cameraOf(page);

    await page.setViewportSize({ width: 600, height: 900 });

    await expect.poll(() => canvasSize(page)).toEqual([600, 900]);
    // Le préréglage est recadré pour le nouveau rapport d'aspect (la caméra recule).
    await expect.poll(() => cameraOf(page)).not.toEqual(before);
  });

  test('hors capture, le canvas suit la fenêtre', async ({ page }) => {
    const errors = await openScene(page);
    await page.setViewportSize({ width: 800, height: 500 });
    await expect.poll(() => canvasSize(page)).toEqual([800, 500]);
    expect(errors).toEqual([]);
  });
});

test.describe('Paramètres d’URL', () => {
  test('un préréglage inconnu retombe sur la vue trois-quarts par défaut', async ({ page }) => {
    await openScene(page, '?capture=1&camera=three-quarter');
    const reference = await cameraOf(page);

    for (const search of [
      '?capture=1&camera=nope',
      '?capture=1&camera=TOP',
      '?capture=1&camera=',
      '?capture=1&seed=-1&time=99999&camera=%00',
    ]) {
      const errors = await openScene(page, search);
      expect(await cameraOf(page), search).toEqual(reference);
      expect(errors, search).toEqual([]);
    }
  });

  test('seul capture=1 active le mode capture', async ({ page }) => {
    for (const search of ['?capture=true&camera=top', '?capture=0&camera=top']) {
      await openScene(page, search);
      await expect(page.locator('h1'), search).toHaveCount(1);
    }
  });

  test('le préréglage s’applique aussi hors capture', async ({ page }) => {
    await openScene(page, '?camera=top');
    const [x, y, z] = (await cameraOf(page))!.split(',').map(Number);
    // Vue de dessus : caméra au-dessus du bac, à l'aplomb de son centre.
    expect(y).toBeGreaterThan(1);
    expect(Math.abs(x)).toBeLessThan(0.01);
    expect(Math.abs(z)).toBeLessThan(0.01);
  });

  test('les 5 préréglages donnent 5 positions de caméra distinctes', async ({ page }) => {
    const positions = new Set<string | null>();
    for (const preset of ['top', 'bottom', 'front', 'side', 'three-quarter']) {
      await openScene(page, `?capture=1&camera=${preset}`);
      positions.add(await cameraOf(page));
    }
    expect(positions.size).toBe(5);
  });
});
