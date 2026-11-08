import { expect, test } from '@playwright/test';

import { createDayClock } from '../src/app/sim/daylight';
import { initialMaintenance, MAINTENANCE_DAY_SECONDS } from '../src/app/sim/maintenance';
import { serializeWorld } from '../src/app/sim/save';
import { createDefaultWorld, type MutableWorld } from '../src/app/sim/world';

/**
 * Calendrier d'entretien (issue #513, ADR 0116) : un bac dont le changement d'eau est échu
 * affiche un rappel, sans alerte ; changer l'eau le remet à zéro et l'inscrit au journal.
 */
test('changement d’eau : rappel remis à zéro, journal rempli, aucune erreur', async ({
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

  const time = 8 * MAINTENANCE_DAY_SECONDS;
  const world: MutableWorld = {
    ...createDefaultWorld(42),
    tick: Math.round(time * 60),
    time,
    maintenance: initialMaintenance(0),
  };
  const text = serializeWorld(world, { speed: 0, clock: createDayClock(12, 1200, true) });
  const settings = page.getByRole('button', { name: 'Réglages' });
  await settings.click();
  await page.locator('[data-section="sauvegarde"] input[type="file"]').setInputFiles({
    name: 'entretien.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });

  await settings.click();
  const chip = page.locator('[data-maintenance]');
  await expect(chip).toHaveAttribute('data-maintenance-due', '2');
  await expect(chip).toContainText('2 tâches à faire');
  await chip.click();
  const water = page.locator('[data-maintenance-task="waterChange"]');
  await expect(water).toHaveAttribute('data-overdue', 'true');
  await expect(water).toContainText('En retard de 1 j');
  await expect(page.locator('[data-maintenance-log]')).toContainText('Aucune action');
  const captureDir = process.env['CAPTURE_DIR'];
  if (captureDir) {
    await page.screenshot({ path: `${captureDir}/entretien-rappel.png` });
  }

  await settings.click();
  await page.locator('[data-water-change]').click();
  await expect(water).toHaveAttribute('data-overdue', 'false');
  await expect(chip).toHaveAttribute('data-maintenance-due', '1');
  await expect(page.locator('[data-maintenance-log]')).toContainText('Jour 9 : Changement d’eau');
  expect(errors).toEqual([]);
});
