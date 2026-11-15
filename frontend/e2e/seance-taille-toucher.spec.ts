import { expect, test } from '@playwright/test';

import { card, open, openSession } from './outils-seance';
import { cutOnePlant, importTallTank, skipToPrune } from './outils-taille';

/**
 * Séance d'entretien guidée, lot 5 (issue #623) au doigt : à l'étape « taille », un toucher sur
 * une tige trop haute la coupe (`page.touchscreen.tap`, événements tactiles de Chromium).
 */
test.describe('séance d’entretien : taille au toucher (#623)', () => {
  test.use({ hasTouch: true });

  test('au doigt : une tige coupée, étape terminée', async ({ page }, testInfo) => {
    testInfo.setTimeout(300_000);
    const errors = await open(page);
    await importTallTank(page);
    await openSession(page, true);
    await skipToPrune(page, true);
    await expect(card(page).locator('.care-session__why')).toContainText('abîmées');
    await cutOnePlant(page, true);
    await expect(card(page).locator('[data-care-hint]')).toContainText('Une coupe');
    await card(page).locator('[data-care-done]').tap();
    await expect(card(page).locator('[data-care-summary]')).toContainText('La taille : fait');
    expect(errors).toEqual([]);
  });
});
