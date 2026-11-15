import { expect, test } from '@playwright/test';

import { createDefaultWorld, type MutableWorld } from '../src/app/sim/world';
import { card, hostEl, open, openSession } from './outils-seance';
import {
  caps,
  cutOnePlant,
  growths,
  importTallTank,
  importWorld,
  skipToPrune,
} from './outils-taille';

/**
 * Séance d'entretien guidée, lot 5 (issue #623) : à l'étape « taille », un clic ou un toucher
 * sur une tige trop haute la coupe ; la phrase « pourquoi » est affichée, la taille entre au
 * calendrier à « Étape terminée ». Bac sans plante à tailler : étape sautée d'office.
 */
test.describe('séance d’entretien : taille (#623)', () => {
  test('souris : explication, coupe d’une plante, bilan et calendrier', async ({
    page,
  }, testInfo) => {
    testInfo.setTimeout(300_000);
    const errors = await open(page);
    await importTallTank(page);
    await openSession(page);
    await skipToPrune(page);
    await expect(card(page).locator('.care-session__why')).toContainText('nitrates');
    await expect(card(page).locator('[data-care-hint]')).toContainText('Cliquez ou touchez');
    await expect(card(page).locator('[data-care-done]')).toHaveCount(0);
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-pruner', 'true');
    const captureDir = process.env['CAPTURE_DIR'];
    if (captureDir) {
      await page.screenshot({ path: `${captureDir}/seance-taille-avant.png` });
    }
    const population = await hostEl(page).getAttribute('data-aqfish-population');

    await cutOnePlant(page, false);
    await expect(card(page).locator('[data-care-hint]')).toContainText('Une coupe');
    expect((await growths(page)).filter((g, n) => g < caps[n]!)).toHaveLength(1);
    expect(await hostEl(page).getAttribute('data-aqfish-population')).toBe(population);
    if (captureDir) {
      await page.screenshot({ path: `${captureDir}/seance-taille-apres.png` });
    }

    await card(page).locator('[data-care-done]').click();
    await expect(card(page)).toHaveAttribute('data-step', 'bilan');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-pruner', 'false');
    await expect(card(page).locator('[data-care-summary]')).toContainText('La taille : fait');
    await card(page).locator('[data-care-close]').click();
    await page.locator('[data-maintenance]').click();
    await expect(page.locator('[data-maintenance-log]')).toContainText('Taille des plantes');
    expect(errors).toEqual([]);
  });

  test('bac sans plante à tailler : étape sautée, bilan sans ligne « taille »', async ({
    page,
  }, testInfo) => {
    testInfo.setTimeout(240_000);
    const errors = await open(page);
    await importWorld(page, createDefaultWorld(42, 'recif') as MutableWorld, 'recif.json');
    await openSession(page);
    for (let i = 0; i < 4; i++) {
      await card(page).locator('[data-care-skip]').click();
    }
    await expect(card(page)).toHaveAttribute('data-step', 'bilan');
    await expect(card(page).locator('[data-care-summary] li')).toHaveCount(4);
    await expect(card(page).locator('[data-care-summary]')).not.toContainText('taille');
    expect(errors).toEqual([]);
  });
});
