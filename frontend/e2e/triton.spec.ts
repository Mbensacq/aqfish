import { expect, test, type Page } from '@playwright/test';

/**
 * Tritons du paludarium (#133) : deux par défaut, effectif réglable au panneau et par l'URL
 * (borné à 3), absents des autres environnements, simulation qui avance sans erreur.
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

function newtCount(population: string | null): number {
  const match = /triton:(\d+)/.exec(population ?? '');
  return match ? Number(match[1]) : 0;
}

test.describe('Tritons (#133)', () => {
  test('deux par défaut, réglables au panneau, bornés à 3', async ({ page }) => {
    const errors = await open(page, '?environnement=paludarium&seed=42');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-population', /triton:2/);
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-population', /grenouille:3/);
    await page.getByRole('button', { name: 'Réglages' }).click();
    const field = page.getByRole('spinbutton', { name: 'Nombre de tritons à ventre de feu' });
    await expect(field).toHaveValue('2');
    await field.fill('9');
    await field.dispatchEvent('change');
    await expect(field).toHaveValue('3');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-population', /triton:3/);
    await field.fill('0');
    await field.dispatchEvent('change');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-population', /triton:0/);
    // Les grenouilles ne bougent pas.
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-population', /grenouille:3/);
    expect(errors).toEqual([]);
  });

  test('population=triton:N : borné entre 0 et 3, la simulation avance', async ({ page }) => {
    for (const [asked, expected] of [
      ['0', 0],
      ['1', 1],
      ['99', 3],
    ] as const) {
      const errors = await open(
        page,
        `?environnement=paludarium&seed=7&population=triton:${asked}`,
      );
      expect(newtCount(await hostEl(page).getAttribute('data-aqfish-population'))).toBe(expected);
      const tick = Number(await hostEl(page).getAttribute('data-aqfish-tick'));
      await expect
        .poll(async () => Number(await hostEl(page).getAttribute('data-aqfish-tick')))
        .toBeGreaterThan(tick);
      expect(errors).toEqual([]);
    }
  });

  test('mode capture, trois tritons à t = 200 s : rendu sans erreur', async ({ page }) => {
    const errors = await open(
      page,
      '?capture=1&environnement=paludarium&seed=9&population=triton:3&time=200',
    );
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-population', /triton:3/);
    expect(errors).toEqual([]);
  });

  test('bac tropical et bassin : aucun triton', async ({ page }) => {
    for (const environment of ['tropical', 'bassin']) {
      const errors = await open(page, `?environnement=${environment}&seed=42`);
      expect((await hostEl(page).getAttribute('data-aqfish-population')) ?? '').not.toContain(
        'triton',
      );
      expect(errors).toEqual([]);
    }
  });
});
