import { expect, test } from '@playwright/test';

import { ALGAE_PATCH_COUNT } from '../src/app/sim/algae';
import {
  card,
  open,
  importAlgaeTank,
  siphonPercent,
  visiblePatches,
  openSession,
} from './outils-seance';

/**
 * Séance d'entretien guidée au doigt (#604, #605) : raclette, siphon et un seau d'eau neuve par
 * des événements tactiles envoyés en CDP (docs/PIEGES.md).
 */
test.describe('séance d’entretien au toucher (#604)', () => {
  test.use({ hasTouch: true });

  test('au doigt : raclette, siphon et eau neuve', async ({ page }, testInfo) => {
    testInfo.setTimeout(420_000);
    const errors = await open(page);
    await importAlgaeTank(page);
    await openSession(page, true);
    await expect(card(page)).toHaveAttribute('data-step', 'vitres');
    const box = (await page.locator('app-aquarium-host canvas').boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    // Un seul passage au doigt : il suffit à retirer une plaque (#620).
    for (const row of [0.5]) {
      const y = box.y + box.height * row;
      const at = (x: number) => [{ x: box.x + box.width * x, y, id: 1 }];
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(0.2) });
      for (const x of [0.3, 0.4, 0.5, 0.6, 0.7, 0.8]) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(x) });
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }
    await expect.poll(() => visiblePatches(page)).toBeLessThan(ALGAE_PATCH_COUNT);
    await card(page).locator('[data-care-skip]').tap();
    await expect(card(page)).toHaveAttribute('data-step', 'siphon');
    // Siphon au doigt (#605), puis un seau d'eau neuve jusqu'à l'étape suivante.
    const y = box.y + box.height * 0.5;
    const at = (x: number) => [{ x: box.x + box.width * x, y, id: 1 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(0.3) });
    for (const x of [0.4, 0.5, 0.6, 0.7]) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(x) });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(() => siphonPercent(page)).toBeGreaterThan(0);
    await card(page).locator('[data-care-done]').tap();
    await card(page).locator('[data-care-skip]').tap();
    await expect(card(page)).toHaveAttribute('data-step', 'eau');
    await card(page).locator('[data-care-pour]').tap();
    await card(page).locator('[data-care-done]').tap();
    await expect(card(page)).toHaveAttribute('data-step', 'taille');
    expect(errors).toEqual([]);
  });
});
