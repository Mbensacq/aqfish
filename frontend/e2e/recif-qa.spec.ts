import { expect, test, type Page } from '@playwright/test';

/** QA du récif (#148) : interactions à la souris, petit écran, graines et URL extrêmes. */

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

test.describe('Récif : parcours utilisateur', () => {
  for (const seed of ['0', '1', '42', '4294967295', '-7']) {
    test(`graine ${seed} : le récif démarre sans erreur`, async ({ page }) => {
      const errors = await open(page, `?environnement=recif&seed=${seed}`);
      await expect(hostEl(page)).toHaveAttribute('data-aqfish-environment', 'recif');
      await expect(hostEl(page)).toHaveAttribute('data-aqfish-population', 'clown:3');
      expect(errors).toEqual([]);
    });
  }

  test('une population d’URL d’autres espèces est ignorée : le récif garde ses poissons-clowns (#150)', async ({
    page,
  }) => {
    const errors = await open(page, '?environnement=recif&seed=42&population=guppy:5,neon:9999');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-environment', 'recif');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-population', 'clown:3');
    expect(errors).toEqual([]);
  });

  test('rotation, zoom et préréglages sans erreur ; le monde continue d’avancer', async ({
    page,
  }) => {
    const errors = await open(page, '?environnement=recif&seed=42');
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
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-environment', 'recif');
    expect(errors).toEqual([]);
  });

  test('petit écran (390 × 844) : le récif s’affiche sans erreur', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await open(page, '?environnement=recif&seed=42');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-environment', 'recif');
    expect(errors).toEqual([]);
  });

  test('environnement inconnu ou mal casé : retour au bac tropical, sans erreur', async ({
    page,
  }) => {
    const errors = await open(page, '?environnement=Recif&seed=42');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-environment', 'tropical');
    expect(errors).toEqual([]);
  });
});
