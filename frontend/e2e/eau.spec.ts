import { expect, test, type Page } from '@playwright/test';

import { createDayClock } from '../src/app/sim/daylight';
import { serializeWorld } from '../src/app/sim/save';
import { sampleWater } from '../src/app/sim/water-quality';
import { createDefaultWorld, type MutableWorld } from '../src/app/sim/world';

/**
 * Eau (issue #207) : section « Eau » du panneau (changement d'eau, chauffage) et, depuis
 * #256, indicateur global en toutes lettres et jauges dans le tableau de bord en bordure ;
 * consigne du chauffage conservée au rechargement.
 *
 * Le bac est importé avec une eau mauvaise (nitrates à 50) et la simulation à l'arrêt
 * (vitesse 0) : les valeurs affichées ne bougent qu'avec les actions du test
 * (`docs/PIEGES.md`, « E2e qui compte un état que la simulation consomme »). Les pages sont
 * ouvertes sans `seed=`, pour que la sauvegarde automatique soit relue au rechargement.
 */

const hostEl = (page: Page) => page.locator('app-aquarium-host');
const section = (page: Page) => page.locator('[data-section="eau"]');
const dashboard = (page: Page) => page.locator('[data-dashboard]');
const quality = (page: Page) => dashboard(page).locator('.dashboard__quality');
const nitrates = (page: Page) => dashboard(page).locator('[data-gauge-value="nitrate"]');
const heater = (page: Page) => page.getByRole('slider', { name: 'Consigne du chauffage' });

async function open(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  return errors;
}

async function openPanel(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Réglages' }).click();
  await expect(section(page)).toBeVisible();
}

/** Importe un bac tropical à l'eau mauvaise, simulation à l'arrêt, heure figée à midi. */
async function importPollutedTank(page: Page): Promise<void> {
  const world: MutableWorld = createDefaultWorld(42);
  world.water = sampleWater('tropical', 'mauvaise');
  const text = serializeWorld(world, { speed: 0, clock: createDayClock(12, 1200, true) });
  await page
    .locator('[data-section="sauvegarde"] input[type="file"]')
    .setInputFiles({ name: 'eau.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  await expect(hostEl(page)).toHaveAttribute('data-aqfish-speed', '0');
}

test.describe('Eau (#207)', () => {
  test('changer l’eau fait baisser les nitrates affichés et l’indicateur suit', async ({
    page,
  }) => {
    const errors = await open(page);
    await openPanel(page);
    await importPollutedTank(page);
    await expect(quality(page)).toHaveText('Mauvaise');
    await expect(nitrates(page)).toHaveText('50,0');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-water', /^mauvaise;.*;50$/);

    await section(page).getByRole('button', { name: 'Changer l’eau' }).click();
    await expect(nitrates(page)).toHaveText('35,0');
    await expect(quality(page)).toHaveText('À surveiller');

    await section(page).getByRole('button', { name: 'Changer l’eau' }).click();
    await expect(nitrates(page)).toHaveText('24,5');
    await section(page).getByRole('button', { name: 'Changer l’eau' }).click();
    // 50 × 0,7³ ≈ 17,15 : sous le seuil de 20.
    await expect(nitrates(page)).toHaveText(/\b17,[12]\b/);
    await expect(quality(page)).toHaveText('Bonne');
    expect(errors).toEqual([]);
  });

  test('la température réglée survit au rechargement', async ({ page }) => {
    const errors = await open(page);
    await openPanel(page);
    await importPollutedTank(page);
    await heater(page).fill('28');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-water', /^[a-z-]+;24;28;/);
    await expect(section(page)).toContainText('28,0 °C');

    // `pagehide` au rechargement : la sauvegarde est écrite avant de quitter.
    await page.reload();
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-water', /^[a-z-]+;24;28;/);
    await openPanel(page);
    await expect(heater(page)).toHaveValue('28');
    await expect(section(page)).toContainText('28,0 °C');
    expect(errors).toEqual([]);
  });

  test('une ancienne sauvegarde à 25 °C sans chauffage se recharge telle quelle, consigne à 24 °C', async ({
    page,
  }) => {
    const errors = await open(page);
    await openPanel(page);
    const world: MutableWorld = createDefaultWorld(42);
    world.water = { ...sampleWater('tropical', 'bonne'), temperature: 25 };
    const text = serializeWorld(world, { speed: 0, clock: createDayClock(12, 1200, true) });
    await page
      .locator('[data-section="sauvegarde"] input[type="file"]')
      .setInputFiles({
        name: 'ancien.json',
        mimeType: 'application/json',
        buffer: Buffer.from(text),
      });
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-speed', '0');

    // L'eau reste à 25 °C (rien n'est réécrit), la consigne proposée est celle du bac : 24 °C.
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-water', /^[a-z-]+;25;24;/);
    await expect(section(page)).toContainText('25,0 °C');
    await expect(heater(page)).toHaveValue('24');
    expect(errors).toEqual([]);
  });

  test('390 × 844 : section lisible, « Changer l’eau » et les jauges dans l’écran', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await open(page);
    // Jauges et indicateur dans le tableau de bord (#256), visibles panneau fermé.
    const meters = await dashboard(page).getByRole('meter').all();
    expect(meters).toHaveLength(5);
    for (const element of [quality(page), ...meters]) {
      await expect(element).toBeInViewport();
      const box = (await element.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(390);
    }
    await openPanel(page);
    await section(page).scrollIntoViewIfNeeded();
    const button = section(page).getByRole('button', { name: 'Changer l’eau' });
    for (const element of [button, heater(page)]) {
      await expect(element).toBeVisible();
      const box = (await element.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(390);
    }
    // Libellés entiers, sur une ligne.
    expect(await button.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(await quality(page).evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
});
