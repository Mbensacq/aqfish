import { expect, test, type Page } from '@playwright/test';

import { createDayClock } from '../src/app/sim/daylight';
import { expiryAge, MAX_FOOD, type FoodPellet } from '../src/app/sim/food';
import { serializeWorld } from '../src/app/sim/save';
import { freshWater } from '../src/app/sim/water';
import { createDefaultWorld, feedInPlace, type MutableWorld } from '../src/app/sim/world';
import { fermerReglages, ouvrirReglages } from './outils-panneau';

/**
 * Nourriture non mangée (issue #638) : une surcharge répétée (douze rations, `MAX_FOOD`
 * granulés) laissée au fond se décompose et fait monter l'ammoniaque ; l'alerte « Ammoniaque
 * trop haute » du tableau de bord apparaît. Sans cette nourriture, la même eau n'alerte pas.
 *
 * Le bac est importé par la sauvegarde, granulés déjà posés et arrivés au bout de leur délai :
 * ils se décomposent au premier pas, sans attendre 45 s de rendu logiciel.
 */

const status = (page: Page) => page.locator('[data-dashboard-status]');
const ammoniaAlert = (page: Page) => status(page).locator('[data-alert="ammonia"]');

/** Ammoniaque de départ, en mg/L (#793) : sous le seuil de vigilance (1), au-dessus de l'équilibre du bac. */
const START_AMMONIA = 0.8;

function overfedWorld(withFood: boolean): string {
  const world: MutableWorld = createDefaultWorld(42);
  world.water = { ...freshWater('tropical'), ammonia: START_AMMONIA };
  if (withFood) {
    while (world.food.length < MAX_FOOD) {
      feedInPlace(world, 0, 0);
    }
    world.food = world.food.map((p): FoodPellet => ({
      ...p,
      y: p.restY,
      vy: 0,
      age: expiryAge(p),
    }));
  }
  return serializeWorld(world, { speed: 1, clock: createDayClock(12, 1200, true) });
}

async function importWorld(page: Page, text: string): Promise<void> {
  await ouvrirReglages(page, 'Sauvegarde et partage');
  await page.locator('[data-section="sauvegarde"] input[type="file"]').setInputFiles({
    name: 'surcharge.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });
  await fermerReglages(page);
  await expect(page.locator('.control-panel')).toHaveCount(0);
}

test('surcharge répétée non mangée : l’alerte ammoniaque du tableau de bord apparaît (#638)', async ({
  page,
}, testInfo) => {
  testInfo.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/?seed=42&vitesse=0');
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  const host = page.locator('app-aquarium-host');

  // Témoin : même eau, sans nourriture ; le monde avance, aucune alerte d'ammoniaque.
  await importWorld(page, overfedWorld(false));
  const tick = Number(await host.getAttribute('data-aqfish-tick'));
  await expect
    .poll(async () => Number(await host.getAttribute('data-aqfish-tick')), { timeout: 60_000 })
    .toBeGreaterThan(tick + 5);
  await expect(ammoniaAlert(page)).toHaveCount(0);

  // Surcharge : la nourriture restante se décompose, l'ammoniaque passe le seuil.
  await importWorld(page, overfedWorld(true));
  await expect(ammoniaAlert(page)).toHaveCount(1, { timeout: 60_000 });
  await expect(ammoniaAlert(page)).toContainText('Ammoniaque');
  expect(errors).toEqual([]);
});

test('guide du débutant : « La faim et la nourriture » explique que la nourriture oubliée pollue (#638)', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?vitesse=0');
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  await page.getByRole('button', { name: 'Wiki des espèces' }).click();
  await page.getByRole('button', { name: 'Guide du débutant' }).click();
  const guide = page.getByRole('dialog', { name: 'Guide du débutant' });
  await expect(guide).toBeVisible();
  const toggle = guide.locator('[data-why-toggle="nourriture"]');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const text = guide.locator('[data-why-text]');
  await expect(text).toContainText('se décompose');
  await expect(text).toContainText('l’ammoniaque grimpe');
  await expect(text).toBeInViewport();
  expect(errors).toEqual([]);
});
