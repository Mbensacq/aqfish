import { expect, test, type Page } from '@playwright/test';

import { FOOD_COLOR } from '../src/app/render/food-layer';
import { CAMERA_FOV_DEG } from '../src/app/render/camera-presets';
import { FOOD_PER_DROP, MAX_FOOD } from '../src/app/sim/food';
import { advanceToWithFeedings, createDefaultWorld } from '../src/app/sim/world';
import { waterVolume } from '../src/app/sim/tank';

/**
 * Nourrissage au clic (issue #67) : un clic sur l'eau dépose des granulés, un glisser de
 * caméra ou un clic hors du bac ne dépose rien, la touche `G` et le bouton « Nourrir » font
 * de même au clavier. Le nombre de granulés du monde est lu sur `data-aqfish-food`.
 */

async function openScene(page: Page, search = ''): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`/${search}`);
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  return errors;
}

const host = (page: Page) => page.locator('app-aquarium-host');

async function foodCount(page: Page): Promise<number> {
  return Number(await host(page).getAttribute('data-aqfish-food'));
}

/** Rectangle du canvas, en pixels CSS. */
async function canvasBox(page: Page): Promise<{ x: number; y: number; w: number; h: number }> {
  const box = await page.locator('app-aquarium-host canvas').boundingBox();
  expect(box).not.toBeNull();
  return { x: box!.x, y: box!.y, w: box!.width, h: box!.height };
}

async function vec3Attribute(page: Page, name: string): Promise<number[]> {
  const value = await host(page).getAttribute(name);
  expect(value).toMatch(/^[-\d.]+,[-\d.]+,[-\d.]+$/);
  return value!.split(',').map(Number);
}

/**
 * Position à l'écran (pixels CSS) d'un point du bac, d'après la position et la cible de la
 * caméra exposées (`data-aqfish-camera`, `data-aqfish-target`) : projection perspective
 * (`CAMERA_FOV_DEG` vertical, rapport d'aspect du canvas), sans Three.js.
 */
async function projectToScreen(page: Page, point: readonly number[]): Promise<[number, number]> {
  const eye = await vec3Attribute(page, 'data-aqfish-camera');
  const target = await vec3Attribute(page, 'data-aqfish-target');
  const box = await canvasBox(page);
  const sub = (a: readonly number[], b: readonly number[]) => a.map((v, i) => v - b[i]);
  const dot = (a: readonly number[], b: readonly number[]) =>
    a.reduce((s, v, i) => s + v * b[i], 0);
  const norm = (a: readonly number[]) => a.map((v) => v / Math.hypot(...a));
  const cross = (a: readonly number[], b: readonly number[]) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const forward = norm(sub(target, eye));
  const right = norm(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const d = sub(point, eye);
  const tan = Math.tan((CAMERA_FOV_DEG * Math.PI) / 360);
  const ndcX = dot(d, right) / (dot(d, forward) * tan * (box.w / box.h));
  const ndcY = dot(d, up) / (dot(d, forward) * tan);
  return [box.x + ((ndcX + 1) / 2) * box.w, box.y + ((1 - ndcY) / 2) * box.h];
}

/**
 * Nombre de pixels d'une couleur exacte dans une capture (interface masquée : la barre et
 * l'aide-mémoire ne sont pas en pixel art).
 */
async function countColor(page: Page, hex: string): Promise<number> {
  const png = (await page.screenshot({ animations: 'disabled' })).toString('base64');
  return page.evaluate(
    async ({ png, hex }) => {
      const bitmap = await createImageBitmap(
        await (await fetch(`data:image/png;base64,${png}`)).blob(),
      );
      const context = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d');
      if (!context) {
        throw new Error('Contexte 2D indisponible');
      }
      context.drawImage(bitmap, 0, 0);
      const d = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      let count = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] === r && d[i + 1] === g && d[i + 2] === b) {
          count++;
        }
      }
      return count;
    },
    { png, hex },
  );
}

test.describe('Nourrissage (#67)', () => {
  test('vue de dessus : un clic sur l’eau dépose des granulés, un clic à côté du bac rien', async ({
    page,
  }) => {
    const errors = await openScene(page, '?camera=top');
    await page.keyboard.press('1');
    expect(await foodCount(page)).toBe(0);
    const box = await canvasBox(page);
    // À côté du bac : bord gauche, à mi-hauteur (la vue de dessus cadre le bac au centre).
    await page.mouse.click(box.x + 4, box.y + box.h / 2);
    expect(await foodCount(page)).toBe(0);
    await page.mouse.click(box.x + box.w / 2, box.y + box.h / 2);
    await expect(host(page)).toHaveAttribute('data-aqfish-food', String(FOOD_PER_DROP));
    expect(errors).toEqual([]);
  });

  test('vue trois-quarts : un clic sur la surface dépose, un glisser de caméra ne dépose rien', async ({
    page,
  }) => {
    const errors = await openScene(page);
    const box = await canvasBox(page);
    // Centre de la surface de l'eau, projeté à l'écran depuis la caméra trois-quarts.
    const [sx, sy] = await projectToScreen(page, [0, waterVolume().maxY, 0]);
    await page.mouse.click(sx, sy);
    await expect(host(page)).toHaveAttribute('data-aqfish-food', String(FOOD_PER_DROP));

    // Glisser (rotation) depuis le même point : la caméra bouge, aucun granulé de plus.
    const cameraBefore = await host(page).getAttribute('data-aqfish-camera');
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    await page.mouse.move(sx + 60, sy + 10, { steps: 4 });
    await page.mouse.move(sx + 120, sy + 20, { steps: 4 });
    await page.mouse.up();
    await expect(host(page)).not.toHaveAttribute('data-aqfish-camera', cameraBefore!);
    expect(await foodCount(page)).toBe(FOOD_PER_DROP);

    // Clic droit (déplacement de la vue) : rien non plus.
    await page.mouse.click(box.x + box.w / 2, box.y + box.h / 2, { button: 'right' });
    expect(await foodCount(page)).toBe(FOOD_PER_DROP);
    expect(errors).toEqual([]);
  });

  test('au clavier : touche G et bouton « Nourrir » nommé', async ({ page }) => {
    const errors = await openScene(page);
    await page.keyboard.press('g');
    await expect(host(page)).toHaveAttribute('data-aqfish-food', String(FOOD_PER_DROP));
    const button = page.getByRole('button', { name: /Nourrir.*touche G/ });
    await expect(button).toBeVisible();
    await button.click();
    await expect(host(page)).toHaveAttribute('data-aqfish-food', String(2 * FOOD_PER_DROP));
    // La touche est documentée dans l'aide-mémoire.
    await expect(page.locator('#aide-commandes')).toContainText('Nourrir');
    expect(errors).toEqual([]);
  });

  test('capture : nourrir= dépose des granulés visibles, image déterministe', async ({ page }) => {
    const query = '?capture=1&seed=42&camera=three-quarter&time=30';
    await openScene(page, query);
    const without = await countColor(page, FOOD_COLOR);

    await openScene(page, `${query}&nourrir=10,25`);
    // Les poissons mangent (#68) : le compte attendu est celui de la simulation pure, avec les
    // mêmes dépôts (5 : le dépôt de 10 s est mangé, celui de 25 s coule encore).
    const expected = advanceToWithFeedings(createDefaultWorld(42), 30, [
      { time: 10, x: 0, z: 0 },
      { time: 25, x: 0, z: 0 },
    ]).food.length;
    expect(expected).toBeGreaterThanOrEqual(FOOD_PER_DROP);
    await expect(host(page)).toHaveAttribute('data-aqfish-food', String(expected));
    const first = await page.screenshot({ animations: 'disabled' });
    const withFood = await countColor(page, FOOD_COLOR);
    // Au moins quelques granulés de 2 × 2 pixels de scène (3 pixels CSS par pixel de scène).
    expect(withFood - without).toBeGreaterThanOrEqual(4 * 9);

    await openScene(page, `${query}&nourrir=10,25`);
    expect((await page.screenshot({ animations: 'disabled' })).equals(first)).toBe(true);
  });
  for (const seed of [7, 123]) {
    test(`capture : les poissons mangent un dépôt, graine ${seed}, sans erreur (QA)`, async ({
      page,
    }) => {
      const errors = await openScene(page, `?capture=1&seed=${seed}&camera=top&time=40&nourrir=0`);
      const expected = advanceToWithFeedings(createDefaultWorld(seed), 40, [
        { time: 0, x: 0, z: 0 },
      ]).food.length;
      // Le dépôt a été entamé par les poissons : moins de granulés que déposés (#68).
      expect(expected).toBeLessThan(FOOD_PER_DROP);
      await expect(host(page)).toHaveAttribute('data-aqfish-food', String(expected));
      expect(errors).toEqual([]);
    });
  }

  test('le nombre de granulés reste borné quand on nourrit sans cesse (QA)', async ({ page }) => {
    const errors = await openScene(page);
    for (let i = 0; i < MAX_FOOD / FOOD_PER_DROP + 4; i++) {
      await page.keyboard.press('g');
    }
    await expect(host(page)).toHaveAttribute('data-aqfish-food', String(MAX_FOOD));
    expect(errors).toEqual([]);
  });

  test('petit écran (390 × 844) : le bouton « Nourrir » dépose des granulés (QA)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await openScene(page);
    const button = page.getByRole('button', { name: /Nourrir.*touche G/ });
    await expect(button).toBeVisible();
    const box = await button.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    await button.click();
    await expect(host(page)).toHaveAttribute('data-aqfish-food', String(FOOD_PER_DROP));
    expect(errors).toEqual([]);
  });
});
