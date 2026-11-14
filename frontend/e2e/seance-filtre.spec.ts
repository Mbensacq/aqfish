import { expect, test, type Page } from '@playwright/test';

import { TAP_RINSE_LOSS } from '../src/app/sim/filter-rinse';
import { hostEl, card, open, importAlgaeTank, openSession } from './outils-seance';

const bacteria = async (page: Page) =>
  Number(await hostEl(page).getAttribute('data-aqfish-bacteries'));

/**
 * Séance d'entretien guidée, lot 3 (issue #606, ADR 0140) : rinçage de l'éponge du filtre à la
 * souris, dans l'eau du bac ou au robinet, avec la phrase « pourquoi » ; au robinet, les
 * bactéries du filtre baissent ; nettoyage du filtre au calendrier.
 */
test.describe('séance d’entretien : éponge du filtre (#606)', () => {
  test('souris : choix de l’eau de rinçage, explication, bactéries et calendrier', async ({
    page,
  }, testInfo) => {
    testInfo.setTimeout(240_000);
    const errors = await open(page);
    await importAlgaeTank(page);
    expect(await bacteria(page)).toBe(100);
    await openSession(page);
    await card(page).locator('[data-care-skip]').click();
    await card(page).locator('[data-care-skip]').click();
    await expect(card(page)).toHaveAttribute('data-step', 'filtre');
    await expect(card(page).locator('[data-care-hint]')).toContainText(
      'Bactéries du filtre : 100 %',
    );
    await expect(card(page).locator('[data-care-done]')).toHaveCount(0);

    await card(page).locator('[data-care-rinse="bac"]').click();
    await expect(card(page).locator('[data-care-rinse-why]')).toContainText('pas de chlore');
    await card(page).locator('[data-care-rinse="robinet"]').click();
    await expect(card(page).locator('[data-care-rinse="robinet"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(card(page).locator('[data-care-rinse-why]')).toContainText('chlore du robinet');
    // Rien n'est appliqué avant « Étape terminée ».
    expect(await bacteria(page)).toBe(100);
    const captureDir = process.env['CAPTURE_DIR'];
    if (captureDir) {
      await page.screenshot({ path: `${captureDir}/seance-filtre.png` });
    }

    await card(page).locator('[data-care-done]').click();
    await expect(card(page)).toHaveAttribute('data-step', 'eau');
    await expect.poll(() => bacteria(page)).toBe(Math.round(100 * (1 - TAP_RINSE_LOSS)));
    await card(page).locator('[data-care-skip]').click();
    await card(page).locator('[data-care-skip]').click();
    await expect(card(page).locator('[data-care-summary]')).toContainText('Le filtre : fait');
    await card(page).locator('[data-care-close]').click();

    await page.locator('[data-maintenance]').click();
    await expect(page.locator('[data-maintenance-task="filter"]')).toContainText(
      'Nettoyage du filtre : Dans 30 j',
    );
    await expect(page.locator('[data-maintenance-log]')).toContainText('Nettoyage du filtre');
    expect(errors).toEqual([]);
  });
});
