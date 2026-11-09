import { expect, test, type Page } from '@playwright/test';

import { createDayClock } from '../src/app/sim/daylight';
import { serializeWorld } from '../src/app/sim/save';
import { createDefaultWorld, infectWorldInPlace, type MutableWorld } from '../src/app/sim/world';

/**
 * Charbon actif et régulateur de pH (issue #531, ADR 0122), vus par le joueur : l'alerte du
 * tableau de bord quand le charbon côtoie un traitement, et le pH qui bouge d'un cran à la
 * fois. Un seul test, pour ne pas déplacer les limites des parts de la CI (`docs/PIEGES.md`).
 */

const hostEl = (page: Page) => page.locator('app-aquarium-host');
const status = (page: Page) => page.locator('[data-dashboard-status]');
const care = (page: Page) => page.locator('[data-section="soins"]');
const carbon = (page: Page) => page.getByRole('button', { name: 'Charbon actif dans le filtre' });

async function importWorld(page: Page, world: MutableWorld): Promise<void> {
  const text = serializeWorld(world, { speed: 0, clock: createDayClock(12, 1200, true) });
  await page.locator('[data-section="sauvegarde"] input[type="file"]').setInputFiles({
    name: 'charbon.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });
  await expect(hostEl(page)).toHaveAttribute('data-aqfish-speed', '0');
}

test.describe('Charbon actif et régulateur de pH (#531)', () => {
  test('le charbon pendant un traitement alerte, se retire ; le pH bouge d’un cran', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    await page.getByRole('button', { name: 'Réglages' }).click();

    const world: MutableWorld = createDefaultWorld(42);
    infectWorldInPlace(world);
    await importWorld(page, world);
    await care(page).getByRole('button', { name: 'Ajouter 1 dose de médicament' }).click();
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-treatment', /^5;/);
    // Pas de charbon : pas d'alerte « charbon ».
    await expect(status(page).locator('[data-alert="carbon"]')).toHaveCount(0);

    await expect(carbon(page)).toHaveAttribute('aria-pressed', 'false');
    await carbon(page).click();
    await expect(carbon(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(status(page).locator('[data-alert="carbon"]')).toContainText(
      'Charbon actif pendant un traitement',
    );

    await carbon(page).click();
    await expect(carbon(page)).toHaveAttribute('aria-pressed', 'false');
    await expect(status(page).locator('[data-alert="carbon"]')).toHaveCount(0);

    // Régulateur : un cran vers le bas, puis un second aussitôt refusé (pH inchangé).
    const ph = async () => (await hostEl(page).getAttribute('data-aqfish-ph'))!.split(';')[0];
    const before = Number(await ph());
    await page.getByRole('button', { name: 'Baisser le pH d’un cran' }).click();
    await expect.poll(async () => Number(await ph())).toBeLessThan(before);
    const after = Number(await ph());
    expect(before - after).toBeLessThanOrEqual(0.3 + 1e-9);
    await page.getByRole('button', { name: 'Baisser le pH d’un cran' }).click();
    await expect.poll(async () => Number(await ph())).toBe(after);
    expect(errors).toEqual([]);
  });
});
