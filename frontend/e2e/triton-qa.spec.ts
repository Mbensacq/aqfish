import { expect, test, type Page } from '@playwright/test';

/**
 * QA des tritons (#133) : parcours complémentaires à `triton.spec.ts` — petite fenêtre,
 * graines variées, rotation et zoom, rechargement avec un effectif donné par l'URL.
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

test.describe('Tritons, parcours QA (#133)', () => {
  test('petite fenêtre : quatre graines, la simulation avance sans erreur', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const seed of ['1', '42', '2024', '4294967295']) {
      const errors = await open(page, `?environnement=paludarium&seed=${seed}`);
      await expect(hostEl(page)).toHaveAttribute('data-aqfish-population', /triton:2/);
      const tick = Number(await hostEl(page).getAttribute('data-aqfish-tick'));
      await expect
        .poll(async () => Number(await hostEl(page).getAttribute('data-aqfish-tick')))
        .toBeGreaterThan(tick);
      expect(errors).toEqual([]);
    }
  });

  test('rotation à la souris et zoom à la molette : effectif et rendu stables', async ({
    page,
  }) => {
    const errors = await open(page, '?environnement=paludarium&seed=42');
    const box = await page.locator('canvas').first().boundingBox();
    if (!box) throw new Error('canvas introuvable');
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 120, cy - 40, { steps: 8 });
    await page.mouse.up();
    await page.mouse.wheel(0, -400);
    await page.mouse.wheel(0, 800);
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-population', /triton:2/);
    expect(errors).toEqual([]);
  });

  test('l’effectif de l’URL est conservé après rechargement', async ({ page }) => {
    const errors = await open(page, '?environnement=paludarium&seed=5&population=triton:1');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-population', /triton:1/);
    await page.reload();
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-population', /triton:1/);
    expect(errors).toEqual([]);
  });
});
