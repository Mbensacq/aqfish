import { expect, test, type Page } from '@playwright/test';

/**
 * Caméra libre dans la pièce (issue #343) : bouton « Libre » et touche `L` de la barre des
 * vues, pièce affichée seulement ; déplacement aux touches tenues, orientation au glisser,
 * retour à l'orbite sur la pose d'avant, sans erreur dans la console.
 */

const hostEl = (page: Page) => page.locator('app-aquarium-host');
const freeButton = (page: Page) => page.locator('[data-action="camera-libre"]');

async function open(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  await page.goto('/?seed=8&camera=three-quarter&vitesse=0');
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  return errors;
}

async function camera(page: Page): Promise<number[]> {
  return ((await hostEl(page).getAttribute('data-aqfish-camera')) ?? '').split(',').map(Number);
}

test.describe('Caméra libre dans la pièce (#343)', () => {
  test.setTimeout(180_000);

  test('entrer, se déplacer, s’orienter, sortir : pose d’avant rendue, aucune erreur', async ({
    page,
  }) => {
    const errors = await open(page);

    await test.step('sans pièce : ni bouton, ni effet de la touche L', async () => {
      await expect(freeButton(page)).toHaveCount(0);
      const before = await camera(page);
      await page.keyboard.press('l');
      await expect(hostEl(page)).toHaveAttribute('data-aqfish-camera-libre', 'false');
      expect(await camera(page)).toEqual(before);
    });

    await page.getByRole('button', { name: 'Réglages' }).click();
    await page.getByRole('checkbox', { name: 'Afficher la pièce' }).check();
    await page.getByRole('button', { name: 'Réglages' }).click();
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-room', 'true');
    const orbit = await camera(page);

    await test.step('entrer à la touche L, avancer à la touche tenue', async () => {
      await expect(freeButton(page)).toBeVisible();
      await page.locator('canvas').focus();
      await page.keyboard.press('l');
      await expect(hostEl(page)).toHaveAttribute('data-aqfish-camera-libre', 'true');
      await expect(freeButton(page)).toHaveAttribute('aria-pressed', 'true');
      await page.keyboard.down('ArrowUp');
      await expect.poll(async () => (await camera(page))[2]).toBeLessThan(orbit[2] - 0.1);
      await page.keyboard.up('ArrowUp');
      await page.keyboard.down('e');
      await expect.poll(async () => (await camera(page))[1]).toBeGreaterThan(orbit[1] + 0.05);
      await page.keyboard.up('e');
    });

    await test.step('glisser oriente la vue sans déplacer la caméra', async () => {
      // Attendre l'arrêt (vitesse amortie) avant de comparer.
      await expect
        .poll(async () => {
          const a = await camera(page);
          await page.waitForTimeout(300);
          return (await camera(page)).join() === a.join();
        })
        .toBe(true);
      const position = await camera(page);
      const target = await hostEl(page).getAttribute('data-aqfish-target');
      const box = (await page.locator('canvas').boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2, { steps: 4 });
      await page.mouse.up();
      await expect.poll(() => hostEl(page).getAttribute('data-aqfish-target')).not.toBe(target);
      expect(await camera(page)).toEqual(position);
    });

    await test.step('sortir au bouton : pose orbitale d’avant, préréglage actif', async () => {
      await freeButton(page).click();
      await expect(hostEl(page)).toHaveAttribute('data-aqfish-camera-libre', 'false');
      const back = await camera(page);
      back.forEach((value, i) => expect(value).toBeCloseTo(orbit[i], 2));
      await expect(page.locator('[data-preset="three-quarter"]')).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });

    expect(errors).toEqual([]);
  });
});
