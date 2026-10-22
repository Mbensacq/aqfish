import { expect, test, type Page } from '@playwright/test';

/**
 * Grenouilles du paludarium (#131) : trois par défaut, effectif réglable au panneau et par
 * l'URL (borné à 4), absentes des autres environnements, simulation qui avance sans erreur.
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

function frogCount(population: string | null): number {
  const match = /grenouille:(\d+)/.exec(population ?? '');
  return match ? Number(match[1]) : 0;
}

test.describe('Grenouilles (#131)', () => {
  test('trois par défaut, réglables au panneau, bornées à 4', async ({ page }) => {
    const errors = await open(page, '?environnement=paludarium&seed=42');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-population', /grenouille:3/);
    await page.getByRole('button', { name: 'Réglages' }).click();
    const field = page.getByRole('spinbutton', { name: 'Nombre de grenouilles' });
    await expect(field).toHaveValue('3');
    await field.fill('9');
    await field.dispatchEvent('change');
    await expect(field).toHaveValue('4');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-population', /grenouille:4/);
    await field.fill('0');
    await field.dispatchEvent('change');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-population', /grenouille:0/);
    expect(errors).toEqual([]);
  });

  test('population=grenouille:N : borné entre 0 et 4, la simulation avance', async ({ page }) => {
    for (const [asked, expected] of [
      ['0', 0],
      ['2', 2],
      ['99', 4],
    ] as const) {
      const errors = await open(
        page,
        `?environnement=paludarium&seed=7&population=grenouille:${asked}`,
      );
      expect(frogCount(await hostEl(page).getAttribute('data-aqfish-population'))).toBe(expected);
      const tick = Number(await hostEl(page).getAttribute('data-aqfish-tick'));
      await expect
        .poll(async () => Number(await hostEl(page).getAttribute('data-aqfish-tick')))
        .toBeGreaterThan(tick);
      expect(errors).toEqual([]);
    }
  });

  test('bac tropical et bassin : aucune grenouille', async ({ page }) => {
    for (const environment of ['tropical', 'bassin']) {
      const errors = await open(page, `?environnement=${environment}&seed=42`);
      expect((await hostEl(page).getAttribute('data-aqfish-population')) ?? '').not.toContain(
        'grenouille',
      );
      expect(errors).toEqual([]);
    }
  });
});
