import { expect, test } from '@playwright/test';

import { createDayClock } from '../src/app/sim/daylight';
import { serializeWorld } from '../src/app/sim/save';
import { freshWater } from '../src/app/sim/water';
import {
  WATER_HISTORY_INTERVAL_TICKS as INTERVAL,
  createWaterHistory,
  markWaterChange,
  recordWaterHistory,
  savedWaterHistory,
} from '../src/app/sim/water-history';
import { createDefaultWorld, type MutableWorld } from '../src/app/sim/world';

/**
 * Courbes d'historique de l'eau (issue #511, ADR 0118) : un bac importé montre, dans le détail
 * d'une jauge, ses 24 dernières heures, changement d'eau marqué, sans erreur.
 */
test('bac importé : la jauge dépliée montre sa courbe, au clavier aussi', async ({
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

  const history = createWaterHistory();
  const water = freshWater('tropical');
  const samples = 60;
  for (let i = 0; i < samples; i++) {
    const nitrate = i < 40 ? 5 + i : 8 + (i - 40) / 4;
    recordWaterHistory(history, { ...water, nitrate }, i * INTERVAL);
    if (i === 40) {
      markWaterChange(history, { ...water, nitrate }, i * INTERVAL);
    }
  }
  const tick = (samples - 1) * INTERVAL;
  const world: MutableWorld = {
    ...createDefaultWorld(42),
    tick,
    time: tick / 60,
    waterHistory: savedWaterHistory(history),
  };
  const text = serializeWorld(world, { speed: 0, clock: createDayClock(12, 1200, true) });
  const settings = page.getByRole('button', { name: 'Réglages' });
  await settings.click();
  await page.locator('[data-section="sauvegarde"] input[type="file"]').setInputFiles({
    name: 'courbe.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });
  await settings.click();

  const toggle = page.locator('[data-curve-toggle="nitrate"]');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');

  const curve = page.locator('[data-water-curve]');
  await expect(curve).toHaveAttribute('data-gauge', 'nitrate');
  await expect(curve).toHaveAttribute('data-points', String(samples));
  await expect(curve).toHaveAttribute('data-marks', '1');
  await expect(curve.locator('[data-water-curve-band]')).toHaveCount(1);
  await expect(curve.locator('svg')).toHaveAttribute('aria-label', /1 changement d’eau/);
  const captureDir = process.env['CAPTURE_DIR'];
  if (captureDir) {
    await page.screenshot({ path: `${captureDir}/courbe-eau.png` });
  }
  expect(errors).toEqual([]);
});

test('390 × 844 : la courbe reste dans l’écran', async ({ page }, testInfo) => {
  testInfo.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?seed=42&vitesse=0');
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  await page.locator('[data-curve-toggle="ph"]').click();
  const curve = page.locator('[data-water-curve]');
  await expect(curve).toContainText('pas encore de relevé');
  const box = await curve.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
});
