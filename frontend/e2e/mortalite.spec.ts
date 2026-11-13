import { expect, test } from '@playwright/test';

import { createDefaultWorld } from '../src/app/sim/world';
import { host, openScene, projectToScreen } from './outils-decor';

/**
 * Mortalité et épuisette (issue #582, ADR 0137) : `mort=1` active la mortalité et fait mourir
 * le premier animal à t = 0 ; `vitesse=0` fige le monde, le corps reste donc à la position du
 * néon d'identifiant 0 du monde par défaut de graine 42 (calculée ici, sans la page). Un clic
 * sur le corps le retire (`data-aqfish-morts` disparaît) sans déposer de nourriture.
 */
test.describe('mortalité et épuisette (#582)', () => {
  test('sans `mort=1` : aucun corps', async ({ page }) => {
    const errors = await openScene(page, '?seed=42&vitesse=0');
    await expect(host(page)).not.toHaveAttribute('data-aqfish-morts');
    expect(errors).toEqual([]);
  });

  test('clic sur le corps : retiré, effectif inchangé, aucun granulé', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = await openScene(page, '?seed=42&vitesse=0&mort=1&camera=top');
    await expect(host(page)).toHaveAttribute('data-aqfish-morts', '1');
    const population = await host(page).getAttribute('data-aqfish-population');
    const body = createDefaultWorld(42).entities[0];
    const [x, y] = await projectToScreen(page, [body.x, body.y, body.z]);
    await page.mouse.click(x, y);
    await expect(host(page)).not.toHaveAttribute('data-aqfish-morts');
    expect(await host(page).getAttribute('data-aqfish-population')).toBe(population);
    expect(await host(page).getAttribute('data-aqfish-food')).toBe('0');
    expect(errors).toEqual([]);
  });

  test('clic loin du corps : il reste, et le clic nourrit comme avant', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = await openScene(page, '?seed=42&vitesse=0&mort=1&camera=top');
    await expect(host(page)).toHaveAttribute('data-aqfish-morts', '1');
    const body = createDefaultWorld(42).entities[0];
    // Point de l'eau à l'opposé du corps, à mi-chemin du bord.
    const [x, y] = await projectToScreen(page, [-body.x / 2 - 0.1 * Math.sign(body.x), 0.1, 0]);
    await page.mouse.click(x, y);
    await expect(host(page)).toHaveAttribute('data-aqfish-morts', '1');
    await expect
      .poll(async () => Number(await host(page).getAttribute('data-aqfish-food')))
      .toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });
});
