import { expect, test, type Page } from '@playwright/test';

import { SIM_DT } from '../src/app/sim/constants';
import { createDayClock, DEFAULT_DAY_LENGTH_SECONDS } from '../src/app/sim/daylight';
import { landingAge } from '../src/app/sim/food';
import { foulingLevel } from '../src/app/sim/fouling';
import { initialMaintenance } from '../src/app/sim/maintenance';
import { serializeWorld } from '../src/app/sim/save';
import { createDefaultWorld, feedInPlace, type MutableWorld } from '../src/app/sim/world';
import { card, hostEl, open, openSession, sweepMouse } from './outils-seance';
import { fermerReglages, ouvrirReglages } from './outils-panneau';

/**
 * Encrassement visible (issue #607, ADR 0141) : un bac tropical sans entretien depuis 20 jours
 * de jeu porte un voile sur les vitres et sur le sol (`data-aqfish-fouling`, « vitres;sol »
 * en %) ; « Étape terminée » aux vitres efface celui des vitres, le siphon celui du sol. Mode
 * décor : aucun voile. `data-aqfish-fouling-cells` (« vitres;sol » en cases dessinées) vérifie
 * le voile réellement rendu, sol compris.
 */
const ELAPSED = 20 * DEFAULT_DAY_LENGTH_SECONDS;
const fouling = (page: Page) => hostEl(page).getAttribute('data-aqfish-fouling');

/** Cases du voile dessinées : `[vitres, sol]`. */
async function drawnCells(page: Page): Promise<[number, number]> {
  const raw = (await hostEl(page).getAttribute('data-aqfish-fouling-cells')) ?? '';
  const [glass, floor] = raw.split(';').map(Number);
  return [glass, floor];
}

async function importOldTank(page: Page): Promise<void> {
  const world: MutableWorld = createDefaultWorld(42);
  world.tick = Math.round(ELAPSED / SIM_DT);
  world.time = world.tick * SIM_DT;
  world.maintenance = initialMaintenance(0);
  // Restes de nourriture sur une ligne du sol (z = 0), pour le siphon.
  for (const x of [-0.2, -0.1, 0, 0.1, 0.2]) {
    feedInPlace(world, x, 0);
  }
  world.food = world.food.map((p) => ({ ...p, age: landingAge(p) + 1, y: p.restY, vy: 0 }));
  const text = serializeWorld(world, { speed: 0, clock: createDayClock(12, 1200, true) });
  await ouvrirReglages(page, 'Sauvegarde et partage');
  await page.locator('[data-section="sauvegarde"] input[type="file"]').setInputFiles({
    name: 'encrasse.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });
  await expect(hostEl(page)).toHaveAttribute('data-aqfish-speed', '0');
  await fermerReglages(page);
}

test.describe('encrassement visible (#607)', () => {
  test('voile après 20 jours, effacé par la raclette puis par le siphon', async ({
    page,
  }, testInfo) => {
    testInfo.setTimeout(300_000);
    const errors = await open(page);
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-fouling', '0;0');
    await importOldTank(page);
    const level = Math.round(foulingLevel(ELAPSED, 0) * 100);
    expect(level).toBeGreaterThan(0);
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-fouling', `${level};${level}`);
    const [glass, floor] = await drawnCells(page);
    expect(glass).toBeGreaterThan(0);
    expect(floor).toBeGreaterThan(0);

    await openSession(page);
    await expect(card(page)).toHaveAttribute('data-step', 'vitres');
    await card(page).locator('[data-care-done]').click();
    await expect(card(page)).toHaveAttribute('data-step', 'siphon');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-fouling', `0;${level}`);
    expect(await drawnCells(page)).toEqual([0, floor]);

    await page.locator('[data-preset="top"]').click();
    await sweepMouse(page, [0.5]);
    await card(page).locator('[data-care-done]').click();
    await expect(card(page)).toHaveAttribute('data-step', 'filtre');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-fouling', '0;0');
    expect(await fouling(page)).toBe('0;0');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-fouling-cells', '0;0');
    expect(errors).toEqual([]);
  });

  test('mode décor : aucun voile', async ({ page }, testInfo) => {
    testInfo.setTimeout(180_000);
    const errors = await open(page);
    await importOldTank(page);
    await expect(hostEl(page)).not.toHaveAttribute('data-aqfish-fouling', '0;0');
    await ouvrirReglages(page, 'Bac et milieu');
    await page.locator('[data-section="bacs"] [data-care-mode-toggle]').click();
    await page
      .locator('[data-care-mode-confirm]')
      .getByRole('button', { name: 'Passer en mode décor' })
      .click();
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-mode', 'decor');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-fouling', '0;0');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-fouling-cells', '0;0');
    expect(errors).toEqual([]);
  });
});
