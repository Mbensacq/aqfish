import { expect, type Page } from '@playwright/test';

import { ALGAE_PATCH_COUNT } from '../src/app/sim/algae';
import { createDayClock } from '../src/app/sim/daylight';
import { landingAge } from '../src/app/sim/food';
import { serializeWorld } from '../src/app/sim/save';
import { createDefaultWorld, feedInPlace, type MutableWorld } from '../src/app/sim/world';

/**
 * Outils communs des e2e de la séance d'entretien guidée (#604, #605, ADR 0138) : import d'un
 * bac sale, ouverture de la séance, glissés à la souris, lecture des attributs de l'hôte. Les
 * tests sont répartis en trois fichiers pour que la CI les place dans des parts différentes
 * (`e2e/durees.json`, #620).
 */
export const hostEl = (page: Page) => page.locator('app-aquarium-host');
export const card = (page: Page) => page.locator('[data-care-session]');

export async function open(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  return errors;
}

/** Importe le bac tropical par défaut couvert d'algues, simulation en pause, midi figé. */
export async function importAlgaeTank(page: Page): Promise<void> {
  const world: MutableWorld = createDefaultWorld(42);
  world.water = { ...world.water, algae: new Array<number>(ALGAE_PATCH_COUNT).fill(1) };
  const text = serializeWorld(world, { speed: 0, clock: createDayClock(12, 1200, true) });
  const settings = page.getByRole('button', { name: 'Réglages' });
  await settings.click();
  await page.locator('[data-section="sauvegarde"] input[type="file"]').setInputFiles({
    name: 'algues.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });
  await expect(hostEl(page)).toHaveAttribute('data-aqfish-speed', '0');
  await settings.click();
}

/**
 * Importe le bac tropical par défaut avec des restes de nourriture posés sur une ligne du sol
 * (z = 0) et des nitrates, simulation en pause, midi figé (siphon et eau neuve, #605).
 */
export async function importDirtyTank(page: Page): Promise<void> {
  const world: MutableWorld = createDefaultWorld(42);
  for (const x of [-0.2, -0.1, 0, 0.1, 0.2]) {
    feedInPlace(world, x, 0);
  }
  world.food = world.food.map((p) => ({ ...p, age: landingAge(p) + 1, y: p.restY, vy: 0 }));
  world.water = { ...world.water, nitrate: 40 };
  const text = serializeWorld(world, { speed: 0, clock: createDayClock(12, 1200, true) });
  const settings = page.getByRole('button', { name: 'Réglages' });
  await settings.click();
  await page.locator('[data-section="sauvegarde"] input[type="file"]').setInputFiles({
    name: 'restes.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });
  await expect(hostEl(page)).toHaveAttribute('data-aqfish-speed', '0');
  await settings.click();
}

export const foodCount = async (page: Page) =>
  Number(await hostEl(page).getAttribute('data-aqfish-food'));
export const nitrate = async (page: Page) =>
  Number(((await hostEl(page).getAttribute('data-aqfish-water')) ?? '').split(';')[5]);
export const siphonPercent = async (page: Page) =>
  Number(await card(page).locator('[data-care-siphon]').getAttribute('data-care-siphon'));

export async function visiblePatches(page: Page): Promise<number> {
  const raw = (await hostEl(page).getAttribute('data-aqfish-algae')) ?? '';
  return Number(raw.split(';')[0]);
}

/** Ouvre le calendrier d'entretien puis la séance. */
export async function openSession(page: Page, tap = false): Promise<void> {
  const chip = page.locator('[data-maintenance]');
  const button = page.locator('[data-care-session-open]');
  if (tap) {
    await chip.tap();
    await button.tap();
  } else {
    await chip.click();
    await button.click();
  }
  await expect(card(page)).toBeVisible();
}

/**
 * Glissé à la souris : lignes horizontales de 20 % à 80 % de la largeur, à la hauteur `rows`
 * (part de l'écran). Chaque pas attend une image sous le rendu logiciel : le moins de lignes
 * possible (docs/PIEGES.md, #620).
 */
export async function sweepMouse(
  page: Page,
  rows: readonly number[] = [0.4, 0.5, 0.6],
): Promise<void> {
  const box = (await page.locator('app-aquarium-host canvas').boundingBox())!;
  for (const row of rows) {
    const y = box.y + box.height * row;
    await page.mouse.move(box.x + box.width * 0.2, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.8, y, { steps: 8 });
    await page.mouse.up();
  }
}
