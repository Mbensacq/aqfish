import { expect, test, type Page } from '@playwright/test';

/**
 * QA des grenouilles (#131) : temps extrêmes en mode capture, déterminisme de l'image,
 * interactions et nourrissage avec l'effectif maximal, petit écran, aller-retour d'environnement.
 */

const hostEl = (page: Page) => page.locator('app-aquarium-host');

async function open(page: Page, search: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(`/${search}`);
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  return errors;
}

test.describe('Grenouilles : parcours utilisateur (QA)', () => {
  for (const time of ['0', '7.3', '600', '1e9']) {
    test(`mode capture, quatre grenouilles, time=${time} : rendu sans erreur`, async ({ page }) => {
      const errors = await open(
        page,
        `?capture=1&environnement=paludarium&seed=9&population=grenouille:4&time=${time}`,
      );
      await expect(hostEl(page)).toHaveAttribute('data-aqfish-population', /grenouille:4/);
      expect(errors).toEqual([]);
    });
  }

  test('même URL de capture ⇒ même image, grenouilles comprises', async ({ page }) => {
    const url = '?capture=1&environnement=paludarium&seed=123&population=grenouille:4&time=41.5';
    const shoot = async (): Promise<Buffer> => {
      const errors = await open(page, url);
      expect(errors).toEqual([]);
      return page.locator('canvas').first().screenshot();
    };
    const first = await shoot();
    const second = await shoot();
    expect(second.equals(first)).toBe(true);
  });

  test('quatre grenouilles : rotation, zoom, nourrissage et préréglages sans erreur', async ({
    page,
  }) => {
    const errors = await open(page, '?environnement=paludarium&seed=3&population=grenouille:4');
    const box = (await hostEl(page).boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx - 200, cy + 40, { steps: 10 });
    await page.mouse.up();
    await page.mouse.wheel(0, -900);
    await page.keyboard.press('g');
    for (const key of ['1', '2', '3', '4', '5']) await page.keyboard.press(key);
    const tick = Number(await hostEl(page).getAttribute('data-aqfish-tick'));
    await expect
      .poll(async () => Number(await hostEl(page).getAttribute('data-aqfish-tick')))
      .toBeGreaterThan(tick + 30);
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-population', /grenouille:4/);
    expect(errors).toEqual([]);
  });

  test('à 390 × 844 : le réglage des grenouilles reste accessible et dans la fenêtre', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await open(page, '?environnement=paludarium&seed=42');
    await page.getByRole('button', { name: 'Réglages' }).click();
    const field = page.getByRole('spinbutton', { name: 'Nombre de grenouilles' });
    await field.scrollIntoViewIfNeeded();
    await expect(field).toBeInViewport();
    await field.fill('1');
    await field.dispatchEvent('change');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-population', /grenouille:1/);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);
    expect(errors).toEqual([]);
  });

  test('paludarium → bac tropical → paludarium : les grenouilles reviennent sans erreur', async ({
    page,
  }) => {
    const errors = await open(page, '?environnement=paludarium&seed=42');
    await page.getByRole('button', { name: 'Réglages' }).click();
    const place = page.getByRole('combobox', { name: 'Environnement' });
    await place.selectOption('tropical');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-environment', 'tropical');
    expect((await hostEl(page).getAttribute('data-aqfish-population')) ?? '').not.toContain(
      'grenouille',
    );
    await place.selectOption('paludarium');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-environment', 'paludarium');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-population', /grenouille:[1-4]/);
    expect(errors).toEqual([]);
  });
});
