import { expect, test, type Page } from '@playwright/test';

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
