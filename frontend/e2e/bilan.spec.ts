import { expect, test } from '@playwright/test';

import { createDayClock } from '../src/app/sim/daylight';
import { setPopulation } from '../src/app/sim/population';
import { serializeWorld } from '../src/app/sim/save';
import {
  birthYoungInPlace,
  cloneWorld,
  createDefaultWorld,
  createWorld,
} from '../src/app/sim/world';
import { fermerReglages, ouvrirReglages } from './outils-panneau';

/**
 * Bilan du bac (issue #514, ADR 0117) : jamais affiché sans demande ; un bac surpeuplé importé
 * donne la densité en premier point, sans erreur console.
 */
test('bac surpeuplé importé : bilan à la demande, densité en premier', async ({
  page,
}, testInfo) => {
  testInfo.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  await page.goto('/?seed=42&vitesse=0');
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');

  const packed = setPopulation(setPopulation(createDefaultWorld(42), 'neon', 40), 'guppy', 20);
  const text = serializeWorld(packed, { speed: 0, clock: createDayClock(12, 1200, true) });
  await ouvrirReglages(page, 'Sauvegarde et partage');
  await page.locator('[data-section="sauvegarde"] input[type="file"]').setInputFiles({
    name: 'surpeuple.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });
  await fermerReglages(page);

  await expect(page.locator('[data-review-detail]')).toHaveCount(0);
  const button = page.getByRole('button', { name: 'Bilan du bac' });
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  await button.focus();
  await page.keyboard.press('Enter');
  await expect(button).toHaveAttribute('aria-expanded', 'true');

  const points = page.locator('[data-review-point]');
  await expect(points.first()).toHaveAttribute('data-review-point', 'density');
  await expect(points.first()).toContainText('60 animaux dans 288 L');
  await expect(points.first()).toContainText('À faire');
  const captureDir = process.env['CAPTURE_DIR'];
  if (captureDir) {
    await page.screenshot({ path: `${captureDir}/bilan.png` });
  }
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-review-detail]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('390 × 844 : le bouton reste dans la marge et le bilan se déplie', async ({
  page,
}, testInfo) => {
  testInfo.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?seed=42&vitesse=0');
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  const button = page.locator('[data-review]');
  const box = await button.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(390 * 0.8);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  await button.click();
  await expect(page.locator('[data-review-empty]')).toBeVisible();
  // Doyen du bac (#877) : une ligne lisible, entière dans la largeur de l'écran.
  const eldest = page.locator('[data-review-eldest]');
  await expect(eldest).toHaveText(/^Doyen du bac : .+, .+\.$/);
  const line = await eldest.boundingBox();
  expect(line!.x).toBeGreaterThanOrEqual(0);
  expect(line!.x + line!.width).toBeLessThanOrEqual(390);
  const captureDir = process.env['CAPTURE_DIR'];
  if (captureDir) {
    await page.screenshot({ path: `${captureDir}/bilan-390.png` });
  }
});

test('alevins sans plante importés : le bilan dit que leur refuge ne suffit pas (#823)', async ({
  page,
}, testInfo) => {
  testInfo.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?seed=42&vitesse=0');
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');

  const bare = cloneWorld(createWorld(42, [{ species: 'guppy', count: 4 }], [], [], 'tropical'));
  for (let i = 0; i < 3; i++) {
    birthYoungInPlace(bare, 'guppy', { x: 0, y: 0.15, z: 0 });
  }
  const text = serializeWorld(bare, { speed: 0, clock: createDayClock(12, 1200, true) });
  await ouvrirReglages(page, 'Sauvegarde et partage');
  await page.locator('[data-section="sauvegarde"] input[type="file"]').setInputFiles({
    name: 'alevins-sans-plante.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });
  await fermerReglages(page);

  await page.getByRole('button', { name: 'Bilan du bac' }).click();
  const point = page.locator('[data-review-point="fry"]');
  await expect(point).toContainText('Alevins sans refuge suffisant');
  await expect(point).toContainText('0 alevin sur 3 à l’abri des plantes');
  await expect(point).toContainText('approximation de jeu');
  const captureDir = process.env['CAPTURE_DIR'];
  if (captureDir) {
    await page.screenshot({ path: `${captureDir}/bilan-alevins.png` });
  }
  expect(errors).toEqual([]);
});
