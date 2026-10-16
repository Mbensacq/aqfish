import { expect, test, type Page } from '@playwright/test';

/** Position de la caméra exposée par l'hôte du canvas (attribut `data-aqfish-camera`). */
async function cameraPosition(page: Page): Promise<number[]> {
  const value = await page.locator('app-aquarium-host').getAttribute('data-aqfish-camera');
  expect(value).toMatch(/^[-\d.]+,[-\d.]+,[-\d.]+$/);
  return value!.split(',').map(Number);
}

function distance(a: number[], b: number[]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
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

test.describe('Scène du bac', () => {
  test('affiche un canvas plein écran sans erreur', async ({ page }) => {
    const errors = await openScene(page);
    const box = await page.locator('canvas').boundingBox();
    expect(box).toEqual({ x: 0, y: 0, width: 1280, height: 720 });
    expect(errors).toEqual([]);
  });

  test('tourne autour du bac au clic gauche', async ({ page }) => {
    const errors = await openScene(page);
    const before = await cameraPosition(page);
    const radius = Math.hypot(before[0], before[1] - 0.3, before[2]);

    await page.mouse.move(640, 360);
    await page.mouse.down({ button: 'left' });
    await page.mouse.move(800, 300, { steps: 8 });
    await page.mouse.up({ button: 'left' });

    await expect
      .poll(async () => distance(await cameraPosition(page), before))
      .toBeGreaterThan(0.1);
    // Une rotation garde la distance à la cible (centre du bac à y = 0,3 m).
    const after = await cameraPosition(page);
    expect(Math.hypot(after[0], after[1] - 0.3, after[2])).toBeCloseTo(radius, 2);
    expect(errors).toEqual([]);
  });

  test('zoome à la molette, dans des bornes', async ({ page }) => {
    await openScene(page);
    const before = await cameraPosition(page);
    const radiusOf = (p: number[]) => Math.hypot(p[0], p[1] - 0.3, p[2]);

    await page.mouse.move(640, 360);
    await page.mouse.wheel(0, -300);
    await expect
      .poll(async () => radiusOf(await cameraPosition(page)))
      .toBeLessThan(radiusOf(before));

    // Zoom avant massif : la distance reste bornée (pas de traversée du bac).
    for (let i = 0; i < 12; i++) {
      await page.mouse.wheel(0, -1000);
    }
    await expect.poll(async () => radiusOf(await cameraPosition(page))).toBeGreaterThan(0.4);
  });

  test('se déplace au clic droit', async ({ page }) => {
    await openScene(page);
    const before = await cameraPosition(page);

    await page.mouse.move(640, 360);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(540, 360, { steps: 8 });
    await page.mouse.up({ button: 'right' });

    await expect
      .poll(async () => distance(await cameraPosition(page), before))
      .toBeGreaterThan(0.05);
  });
});

test.describe('Contrat de capture', () => {
  test.use({ deviceScaleFactor: 2 });

  test('force le pixel ratio à 1 et place la caméra sur le préréglage', async ({ page }) => {
    const errors = await openScene(page, '?capture=1&camera=bottom');
    const canvas = page.locator('canvas');
    expect(await canvas.evaluate((c: HTMLCanvasElement) => [c.width, c.height])).toEqual([
      1280, 720,
    ]);
    const [, y] = await cameraPosition(page);
    expect(y).toBeLessThan(0);
    await expect(page.locator('h1')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('ignore la souris en mode capture', async ({ page }) => {
    await openScene(page, '?capture=1&camera=front');
    const before = await cameraPosition(page);
    await page.mouse.move(640, 360);
    await page.mouse.down();
    await page.mouse.move(900, 200, { steps: 5 });
    await page.mouse.up();
    expect(await cameraPosition(page)).toEqual(before);
  });

  test('hors capture, utilise le pixel ratio de l’écran', async ({ page }) => {
    await openScene(page);
    const width = await page.locator('canvas').evaluate((c: HTMLCanvasElement) => c.width);
    expect(width).toBe(2560);
  });
});
