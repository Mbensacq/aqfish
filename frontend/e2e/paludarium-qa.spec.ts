import { expect, test, type Page } from '@playwright/test';

/** QA du paludarium (#129) : interactions à la souris, petit écran, graines et URL extrêmes. */

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

test.describe('Paludarium : parcours utilisateur', () => {
  for (const seed of ['0', '1', '42', '4294967295', '-7']) {
    test(`graine ${seed} : le paludarium démarre sans erreur`, async ({ page }) => {
      const errors = await open(page, `?environnement=paludarium&seed=${seed}`);
      await expect(hostEl(page)).toHaveAttribute('data-aqfish-environment', 'paludarium');
      expect(errors).toEqual([]);
    });
  }

  test('rotation, zoom et préréglages sans erreur ; le monde continue d’avancer', async ({
    page,
  }) => {
    const errors = await open(page, '?environnement=paludarium&seed=42');
    const box = (await hostEl(page).boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 160, cy - 60, { steps: 8 });
    await page.mouse.up();
    await page.mouse.wheel(0, -600);
    await page.mouse.wheel(0, 1200);
    for (const key of ['1', '2', '3', '4', '5']) await page.keyboard.press(key);
    const tick = Number(await hostEl(page).getAttribute('data-aqfish-tick'));
    await expect
      .poll(async () => Number(await hostEl(page).getAttribute('data-aqfish-tick')))
      .toBeGreaterThan(tick);
    expect(errors).toEqual([]);
  });

  test('à 390 × 844 : le paludarium s’affiche, le panneau garde le choix', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await open(page, '?environnement=paludarium');
    await page.getByRole('button', { name: 'Réglages' }).click();
    await expect(page.getByRole('combobox', { name: 'Environnement' })).toHaveValue('paludarium');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);
    expect(errors).toEqual([]);
  });

  test('environnement inconnu en URL : repli sans erreur', async ({ page }) => {
    const errors = await open(page, '?environnement=lagune');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-environment', /^(tropical|bassin)$/);
    expect(errors).toEqual([]);
  });
});
