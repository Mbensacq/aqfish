import { expect, test, type Page } from '@playwright/test';

import { panTargetRadius, tankCenter } from '../src/app/render/camera-presets';
import { DEFAULT_TANK } from '../src/app/sim/tank';

/**
 * Barre des préréglages de vue et raccourcis clavier `1` à `5` (issue #7).
 * La position de la caméra est lue sur `data-aqfish-camera` (docs/ARCHITECTURE.md).
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

async function cameraPosition(page: Page): Promise<number[]> {
  const value = await page.locator('app-aquarium-host').getAttribute('data-aqfish-camera');
  expect(value).toMatch(/^[-\d.]+,[-\d.]+,[-\d.]+$/);
  return value!.split(',').map(Number);
}

async function cameraTarget(page: Page): Promise<number[]> {
  const value = await page.locator('app-aquarium-host').getAttribute('data-aqfish-target');
  expect(value).toMatch(/^[-\d.]+,[-\d.]+,[-\d.]+$/);
  return value!.split(',').map(Number);
}

/** Part des pixels de l'écran (interface masquée) d'une autre couleur que le fond `#141418`. */
async function nonBackgroundRatio(page: Page): Promise<number> {
  await page.addStyleTag({
    content: 'app-root > :not(app-aquarium-host) { visibility: hidden !important; }',
  });
  const png = (await page.screenshot({ animations: 'disabled' })).toString('base64');
  return page.evaluate(async (png) => {
    const bitmap = await createImageBitmap(
      await (await fetch(`data:image/png;base64,${png}`)).blob(),
    );
    const context = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d');
    if (!context) {
      throw new Error('Contexte 2D indisponible');
    }
    context.drawImage(bitmap, 0, 0);
    const data = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
    let other = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] !== 0x14 || data[i + 1] !== 0x14 || data[i + 2] !== 0x18) {
        other++;
      }
    }
    return other / (data.length / 4);
  }, png);
}

/** Position de référence d'un préréglage : celle d'une page ouverte directement dessus. */
async function presetPosition(page: Page, camera: string): Promise<number[]> {
  await openScene(page, `?camera=${camera}`);
  return cameraPosition(page);
}

function distance(a: number[], b: number[]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

test.describe('Préréglages de vue', () => {
  test('la barre propose 5 vues accessibles', async ({ page }) => {
    const errors = await openScene(page);
    const toolbar = page.getByRole('toolbar', { name: 'Préréglages de vue' });
    await expect(toolbar).toBeVisible();
    await expect(toolbar.getByRole('button')).toHaveCount(5);
    for (const name of ['Vue de dessus', 'Vue de dessous', 'Vue de face', 'Vue de côté']) {
      await expect(toolbar.getByRole('button', { name: new RegExp(name) })).toBeVisible();
    }
    await expect(toolbar.getByRole('button', { name: /Vue trois-quarts/ })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('la touche 1 amène la caméra sur la vue de dessus, par une transition courte', async ({
    page,
  }) => {
    const top = await presetPosition(page, 'top');
    const errors = await openScene(page, '?camera=front');
    await page.keyboard.press('1');
    // Transition ≤ 0,6 s ; rendu logiciel lent : marge large pour l'attente.
    await expect.poll(async () => distance(await cameraPosition(page), top)).toBeLessThan(0.01);
    expect(errors).toEqual([]);
  });

  test('un clic sur « Côté » amène la caméra sur la vue de côté', async ({ page }) => {
    const side = await presetPosition(page, 'side');
    await openScene(page, '?camera=top');
    await page.getByRole('button', { name: /Vue de côté/ }).click();
    await expect.poll(async () => distance(await cameraPosition(page), side)).toBeLessThan(0.01);
    await expect(page.getByRole('button', { name: /Vue de côté/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('après un déplacement au clic droit, une touche ramène la caméra sur le bac (#10)', async ({
    page,
  }) => {
    const front = await presetPosition(page, 'front');
    await openScene(page, '?camera=front');
    await page.mouse.move(640, 360);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(900, 200, { steps: 8 });
    await page.mouse.up({ button: 'right' });
    await expect.poll(async () => distance(await cameraPosition(page), front)).toBeGreaterThan(0.1);

    await page.keyboard.press('3');
    await expect.poll(async () => distance(await cameraPosition(page), front)).toBeLessThan(0.01);
  });

  test('le déplacement au clic droit est borné : le bac reste visible (#10)', async ({ page }) => {
    const errors = await openScene(page);
    const center = tankCenter(DEFAULT_TANK);
    const limit = panTargetRadius(DEFAULT_TANK);
    // Scénario du bug : glissers droits de (100, 360) à (1200, 360), puis verticaux. Sans
    // borne, 5 glissers emmènent déjà la cible à plus de 10 unités du bac.
    for (const [from, to] of [
      [
        [100, 360],
        [1200, 360],
      ],
      [
        [640, 100],
        [640, 700],
      ],
    ]) {
      for (let i = 0; i < 5; i++) {
        await page.mouse.move(from[0], from[1]);
        await page.mouse.down({ button: 'right' });
        await page.mouse.move(to[0], to[1], { steps: 2 });
        await page.mouse.up({ button: 'right' });
      }
      const target = await cameraTarget(page);
      // Arrondi à 3 décimales dans l'attribut : tolérance de 1e-3.
      expect(distance(target, [...center])).toBeLessThanOrEqual(limit + 1e-3);
    }
    // La cible a bien bougé (le geste a eu lieu), mais le bac reste à l'écran.
    expect(distance(await cameraTarget(page), [...center])).toBeGreaterThan(limit / 2);
    expect(await nonBackgroundRatio(page)).toBeGreaterThan(0.01);
    expect(errors).toEqual([]);
  });

  test('les touches sont ignorées avec Ctrl', async ({ page }) => {
    await openScene(page, '?camera=front');
    const before = await cameraPosition(page);
    await page.keyboard.press('Control+1');
    // Laisser passer plus que la durée d'une transition.
    await page.waitForTimeout(1000);
    expect(distance(await cameraPosition(page), before)).toBeLessThan(1e-3);
  });

  test('le bouton actif suit la touche pressée ; les touches hors 1 à 5 sont ignorées', async ({
    page,
  }) => {
    await openScene(page, '?camera=front');
    const toolbar = page.getByRole('toolbar', { name: 'Préréglages de vue' });
    const top = toolbar.getByRole('button', { name: /Vue de dessus/ });
    await page.keyboard.press('1');
    await expect(top).toHaveAttribute('aria-pressed', 'true');
    // Laisser finir la transition, puis mémoriser la pose d'arrivée.
    await page.waitForTimeout(1000);
    const arrival = await cameraPosition(page);
    for (const key of ['6', '0', 'a']) {
      await page.keyboard.press(key);
    }
    await page.waitForTimeout(1000);
    await expect(top).toHaveAttribute('aria-pressed', 'true');
    expect(distance(await cameraPosition(page), arrival)).toBeLessThan(1e-3);
  });

  test('mode capture : aucune barre, touches sans effet', async ({ page }) => {
    const errors = await openScene(page, '?capture=1&camera=front');
    await expect(page.locator('app-view-presets-bar')).toHaveCount(0);
    await expect(page.getByRole('toolbar')).toHaveCount(0);
    const before = await cameraPosition(page);
    await page.keyboard.press('1');
    await page.waitForTimeout(1000);
    expect(distance(await cameraPosition(page), before)).toBeLessThan(1e-3);
    expect(errors).toEqual([]);
  });
});
