import { expect, test, type Page } from '@playwright/test';

import { createDayClock } from '../src/app/sim/daylight';
import { DEFAULT_DECOR } from '../src/app/sim/decor';
import { environmentWater } from '../src/app/sim/environment';
import { isGrowingPlant, plantLimits } from '../src/app/sim/plant-growth';
import { serializeWorld } from '../src/app/sim/save';
import { createDefaultWorld, type MutableWorld } from '../src/app/sim/world';

/**
 * Plantes qui poussent et se taillent (issue #477) : le bac tropical par défaut est importé
 * avec ses plantes à tige à leur plafond (sous la surface), simulation en pause. Le fond est un
 * peu assombri ; sécateur en main, des clics sur le bac taillent une plante, sans changer la
 * population.
 */

const hostEl = (page: Page) => page.locator('app-aquarium-host');
const section = (page: Page) => page.locator('[data-section="eau"]');
const pruner = (page: Page) => section(page).locator('[data-pruner]');

/** Pousses affichées (`data-aqfish-plants`, « p1,p2,…;lumière du fond en % »). */
async function growths(page: Page): Promise<number[]> {
  const raw = (await hostEl(page).getAttribute('data-aqfish-plants')) ?? '';
  return raw
    .split(';')[0]
    .split(',')
    .filter((g) => g !== '')
    .map(Number);
}

test.describe('plantes qui poussent (#477)', () => {
  test('plantes au plafond taillées au sécateur, sans toucher aux poissons', async ({ page }) => {
    // Rendu logiciel lent en local : chaque clic attend une image.
    test.setTimeout(300_000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-plants', '0,0,0;100');

    const surface = environmentWater('tropical').maxY;
    const tall = DEFAULT_DECOR.filter(isGrowingPlant);
    const caps = tall.map((item) => plantLimits(item, surface).cap);
    const world: MutableWorld = createDefaultWorld(42);
    world.water = {
      ...world.water,
      plantGrowth: Object.fromEntries(tall.map((item, n) => [String(item.seed), caps[n]])),
    };
    const text = serializeWorld(world, { speed: 0, clock: createDayClock(12, 1200, true) });
    await page.getByRole('button', { name: 'Réglages' }).click();
    await page.locator('[data-section="sauvegarde"] input[type="file"]').setInputFiles({
      name: 'plantes.json',
      mimeType: 'application/json',
      buffer: Buffer.from(text),
    });
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-speed', '0');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-plants', `${caps.join(',')};88`);
    const population = await hostEl(page).getAttribute('data-aqfish-population');

    await expect(pruner(page)).toHaveAttribute('aria-pressed', 'false');
    await pruner(page).click();
    await expect(pruner(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-pruner', 'true');
    // Le panneau couvre une partie de l'écran : on le referme pour viser le bac.
    await page.getByRole('button', { name: 'Réglages' }).click();
    const box = await page.locator('canvas').first().boundingBox();
    expect(box).not.toBeNull();
    const { x, y, width, height } = box!;
    const pruned = async (): Promise<boolean> => (await growths(page)).some((g, n) => g < caps[n]);
    // Points visés : tiges des deux grandes plantes du fond en vue trois-quarts (1280 × 720).
    for (const [fx, fy] of [
      [0.414, 0.42],
      [0.58, 0.47],
      [0.412, 0.36],
      [0.575, 0.55],
      [0.42, 0.48],
      [0.585, 0.4],
    ]) {
      await page.mouse.click(x + fx * width, y + fy * height);
      if (await pruned()) {
        break;
      }
    }
    await expect.poll(pruned).toBe(true);
    await expect(hostEl(page)).not.toHaveAttribute('data-aqfish-plants', /;88$/);
    expect(await hostEl(page).getAttribute('data-aqfish-population')).toBe(population);
    expect(errors).toEqual([]);
  });
});
