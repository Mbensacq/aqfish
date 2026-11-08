import { expect, test } from '@playwright/test';

import { createDayClock } from '../src/app/sim/daylight';
import { setPopulation } from '../src/app/sim/population';
import { serializeWorld } from '../src/app/sim/save';
import { createDefaultWorld } from '../src/app/sim/world';

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
  const settings = page.getByRole('button', { name: 'Réglages' });
  await settings.click();
  await page.locator('[data-section="sauvegarde"] input[type="file"]').setInputFiles({
    name: 'surpeuple.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });
  await settings.click();

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
  const captureDir = process.env['CAPTURE_DIR'];
  if (captureDir) {
    await page.screenshot({ path: `${captureDir}/bilan-390.png` });
  }
});
