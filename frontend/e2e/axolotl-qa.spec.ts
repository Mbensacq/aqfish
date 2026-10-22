import { expect, test, type Page } from '@playwright/test';

/**
 * QA de l'axolotl (#130) : effectifs au panneau, bornes de l'URL, autres environnements
 * sans axolotl, rotation à la souris et petit écran sans erreur.
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

test.describe('Axolotl : parcours utilisateur', () => {
  test('population=axolotl:N : borné entre 0 et 4, sans erreur', async ({ page }) => {
    for (const [asked, expected] of [
      ['0', 0],
      ['1', 1],
      ['4', 4],
      ['99', 4],
    ] as const) {
      const errors = await open(
        page,
        `?environnement=paludarium&seed=42&population=axolotl:${asked}`,
      );
      const population = await hostEl(page).getAttribute('data-aqfish-population');
      const match = /axolotl:(\d+)/.exec(population ?? '');
      expect(match ? Number(match[1]) : 0).toBe(expected);
      expect(errors).toEqual([]);
    }
  });

  test('le panneau ajoute et retire un axolotl, bornes comprises', async ({ page }) => {
    const errors = await open(page, '?environnement=paludarium&seed=42');
    await page.getByRole('button', { name: 'Réglages' }).click();
    const field = page.getByRole('spinbutton', { name: 'Nombre d’axolotls' });
    await expect(field).toHaveValue('2');
    await page.getByRole('button', { name: 'Ajouter un axolotl' }).click();
    await expect(field).toHaveValue('3');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-population', /axolotl:3/);
    await field.fill('4');
    await field.dispatchEvent('change');
    await expect(field).toHaveValue('4');
    // Au maximum : le bouton « Ajouter » ne dépasse pas la borne.
    await page.getByRole('button', { name: 'Ajouter un axolotl' }).click({ force: true });
    await expect(field).toHaveValue('4');
    await field.fill('0');
    await field.dispatchEvent('change');
    await expect(field).toHaveValue('0');
    await page.getByRole('button', { name: 'Retirer un axolotl' }).click({ force: true });
    await expect(field).toHaveValue('0');
    expect(errors).toEqual([]);
  });

  test('bac tropical et bassin : aucun axolotl, aucun champ d’axolotl', async ({ page }) => {
    for (const env of ['tropical', 'bassin']) {
      const errors = await open(page, `?environnement=${env}&seed=42`);
      expect((await hostEl(page).getAttribute('data-aqfish-population')) ?? '').not.toContain(
        'axolotl',
      );
      await page.getByRole('button', { name: 'Réglages' }).click();
      await expect(page.getByRole('spinbutton', { name: 'Nombre d’axolotls' })).toHaveCount(0);
      expect(errors).toEqual([]);
    }
  });

  test('graines extrêmes, quatre axolotls, rotation et préréglages : le monde avance', async ({
    page,
  }) => {
    for (const seed of ['0', '4294967295']) {
      const errors = await open(
        page,
        `?environnement=paludarium&seed=${seed}&population=axolotl:4`,
      );
      const box = (await hostEl(page).boundingBox())!;
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx - 180, cy + 80, { steps: 8 });
      await page.mouse.up();
      for (const key of ['2', '3', '4', '5', '1']) await page.keyboard.press(key);
      const tick = Number(await hostEl(page).getAttribute('data-aqfish-tick'));
      await expect
        .poll(async () => Number(await hostEl(page).getAttribute('data-aqfish-tick')))
        .toBeGreaterThan(tick);
      expect(errors).toEqual([]);
    }
  });

  test('à 390 × 844 : le champ d’axolotls tient dans le panneau, sans débordement', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await open(page, '?environnement=paludarium&seed=7');
    await page.getByRole('button', { name: 'Réglages' }).click();
    const field = page.getByRole('spinbutton', { name: 'Nombre d’axolotls' });
    await field.scrollIntoViewIfNeeded();
    const inside = await field.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.left >= 0 && r.right <= window.innerWidth && r.width > 0;
    });
    expect(inside).toBe(true);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    ).toBe(false);
    expect(errors).toEqual([]);
  });

  test('mêmes graine et temps : les captures du paludarium sont identiques à l’octet', async ({
    page,
  }) => {
    const shots: Buffer[] = [];
    for (let i = 0; i < 2; i++) {
      await open(page, '?capture=1&seed=42&environnement=paludarium&camera=side');
      shots.push(await hostEl(page).screenshot());
    }
    expect(shots[0].equals(shots[1])).toBe(true);
  });
});
