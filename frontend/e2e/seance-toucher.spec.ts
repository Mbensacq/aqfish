import { expect, test } from '@playwright/test';

import { ALGAE_PATCH_COUNT } from '../src/app/sim/algae';
import {
  card,
  open,
  importAlgaeTank,
  siphonPercent,
  visiblePatches,
  openSession,
  swipeTouch,
} from './outils-seance';

/**
 * Séance d'entretien guidée au doigt (#604, #605, #606) : raclette, siphon, éponge du filtre et
 * un seau d'eau neuve par
 * des événements tactiles envoyés en CDP (docs/PIEGES.md).
 */
test.describe('séance d’entretien au toucher (#604)', () => {
  test.use({ hasTouch: true });

  test('au doigt : raclette, siphon, filtre et eau neuve', async ({ page }, testInfo) => {
    testInfo.setTimeout(420_000);
    const errors = await open(page);
    await importAlgaeTank(page);
    await openSession(page, true);
    await expect(card(page)).toHaveAttribute('data-step', 'vitres');
    const box = (await page.locator('app-aquarium-host canvas').boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    // Un seul passage au doigt : il suffit à retirer une plaque (#620).
    await swipeTouch(cdp, box, 0.5, [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]);
    await expect.poll(() => visiblePatches(page)).toBeLessThan(ALGAE_PATCH_COUNT);
    await card(page).locator('[data-care-skip]').tap();
    await expect(card(page)).toHaveAttribute('data-step', 'siphon');
    // Siphon au doigt (#605), puis un seau d'eau neuve jusqu'à l'étape suivante.
    await swipeTouch(cdp, box, 0.5, [0.3, 0.4, 0.5, 0.6, 0.7]);
    await expect.poll(() => siphonPercent(page)).toBeGreaterThan(0);
    await card(page).locator('[data-care-done]').tap();
    // Éponge du filtre au doigt (#606) : rincée dans l'eau du bac, phrase « pourquoi ».
    await expect(card(page)).toHaveAttribute('data-step', 'filtre');
    await card(page).locator('[data-care-rinse="bac"]').tap();
    await expect(card(page).locator('[data-care-rinse-why]')).toContainText('pas de chlore');
    await card(page).locator('[data-care-done]').tap();
    await expect(card(page)).toHaveAttribute('data-step', 'eau');
    await card(page).locator('[data-care-pour]').tap();
    await card(page).locator('[data-care-done]').tap();
    await expect(card(page)).toHaveAttribute('data-step', 'taille');
    expect(errors).toEqual([]);
  });
});
