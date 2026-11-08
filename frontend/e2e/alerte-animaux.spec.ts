import { expect, test } from '@playwright/test';

import { createDayClock } from '../src/app/sim/daylight';
import { serializeWorld } from '../src/app/sim/save';
import { freshWater } from '../src/app/sim/water';
import { createDefaultWorld, starveWorldInPlace, type MutableWorld } from '../src/app/sim/world';

/**
 * Animaux concernés par une alerte (issue #483, ADR 0115) : le détail nomme les espèces, le
 * bouton « Montrer les animaux » les met en évidence dans la scène quelques secondes. Pages
 * ouvertes avec `vitesse=0` : le monde reste figé, seule la mise en évidence change.
 */
test('alerte dépliée : espèces nommées, animaux mis en évidence puis repère retiré', async ({
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
  // Capture de contrôle (`CAPTURE_DIR`) : rendu logiciel trop lent pour 6 s, le délai est allongé.
  const captureDir = process.env['CAPTURE_DIR'];
  if (captureDir) {
    await page.addInitScript(() => {
      const original = window.setTimeout;
      window.setTimeout = ((handler: TimerHandler, delay?: number, ...rest: unknown[]) =>
        original(handler, delay === 6000 ? 600_000 : delay, ...rest)) as typeof window.setTimeout;
    });
  }
  await page.goto('/?seed=42&vitesse=0');
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  const host = page.locator('app-aquarium-host');
  // Aucune mise en évidence par défaut.
  await expect(host).not.toHaveAttribute('data-aqfish-animaux-signales');

  const world: MutableWorld = createDefaultWorld(42);
  world.water = { ...freshWater('tropical'), ammonia: 6, nitrite: 2.5, nitrate: 50 };
  starveWorldInPlace(world);
  const text = serializeWorld(world, { speed: 0, clock: createDayClock(12, 1200, true) });
  const settings = page.getByRole('button', { name: 'Réglages' });
  await settings.click();
  await page.locator('[data-section="sauvegarde"] input[type="file"]').setInputFiles({
    name: 'alertes.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });
  const status = page.locator('[data-dashboard-status]');
  await expect(status.locator('[data-alert]')).toHaveCount(3);
  await settings.click();
  await expect(page.locator('.control-panel')).toHaveCount(0);

  await status.locator('[data-alert="hunger"] .status__chip').click();
  await expect(status.locator('[data-alert-animals="hunger"]')).toContainText(/\d+ néons/);
  const show = status.locator('[data-alert-show="hunger"]');
  await expect(show).toHaveText('Montrer les animaux');
  // Au clavier : le bouton est natif, Entrée l'active.
  await show.focus();
  await page.keyboard.press('Enter');
  await expect(host).toHaveAttribute('data-aqfish-animaux-signales', /^[1-9]\d*$/);
  await expect(status.locator('[data-alert-highlight-announcement]')).toContainText(
    'mis en évidence',
  );
  if (captureDir) {
    await page.waitForTimeout(4000);
    await page.screenshot({ path: `${captureDir}/alerte-animaux.png` });
    return;
  }
  await expect(host).not.toHaveAttribute('data-aqfish-animaux-signales', /./, { timeout: 15_000 });
  await expect(status.locator('[data-alert-highlight-announcement]')).toHaveText('');
  expect(errors).toEqual([]);
});
