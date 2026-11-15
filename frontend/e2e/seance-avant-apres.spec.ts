import { readFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { lowResolutionSize } from '../src/app/render/pixel-art';
import { photoScale } from '../src/app/render/photo-capture';
import { card, importAlgaeTank, open, openSession, sweepMouse } from './outils-seance';
import { decodePng } from './outils-pixels';

/**
 * Séance d'entretien guidée, lot 6 (issue #624) : une image du bac est prise au début de la
 * séance ; le bilan montre l'avant et l'après sous un curseur glissant, qui se prend au clavier
 * comme à la souris, et propose d'enregistrer la photo (les deux côte à côte).
 */
const WIDTH = 1280;
const HEIGHT = 720;

test.describe('séance d’entretien : avant / après (#624)', () => {
  test('bilan : avant et après, curseur au clavier et à la souris, photo enregistrée', async ({
    page,
  }, testInfo) => {
    testInfo.setTimeout(300_000);
    await page.setViewportSize({ width: WIDTH, height: HEIGHT });
    const errors = await open(page);
    await importAlgaeTank(page);
    await openSession(page);
    await expect(card(page)).toHaveAttribute('data-step', 'vitres');
    await sweepMouse(page, [0.45, 0.55]);
    await card(page).locator('[data-care-done]').click();
    for (let i = 0; i < 4 && (await card(page).getAttribute('data-step')) !== 'bilan'; i++) {
      await card(page).locator('[data-care-skip]').click();
    }
    await expect(card(page)).toHaveAttribute('data-step', 'bilan');

    const compare = card(page).locator('[data-care-compare]');
    await expect(compare).toBeVisible();
    const before = await compare.locator('[data-care-before]').getAttribute('src');
    const after = await compare.locator('[data-care-after]').getAttribute('src');
    expect(before).toMatch(/^data:image\/png;base64,/);
    expect(after).toMatch(/^data:image\/png;base64,/);
    // Les algues raclées : l'après n'est pas l'avant.
    expect(after).not.toBe(before);

    // Clavier : flèches, Début et Fin.
    const slider = compare.locator('input[type="range"]');
    await expect(slider).toHaveAttribute('data-care-split', '50');
    await slider.focus();
    await page.keyboard.press('ArrowRight');
    await expect(slider).toHaveAttribute('data-care-split', '55');
    await expect(slider).toHaveAttribute('aria-valuetext', 'Avant 55 %, après 45 %');
    await page.keyboard.press('Home');
    await expect(slider).toHaveAttribute('data-care-split', '0');
    await page.keyboard.press('End');
    await expect(slider).toHaveAttribute('data-care-split', '100');

    // Souris : un clic au quart du curseur l'y amène.
    const box = (await slider.boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.25, box.y + box.height / 2);
    const split = Number(await slider.getAttribute('data-care-split'));
    expect(split).toBeGreaterThanOrEqual(15);
    expect(split).toBeLessThanOrEqual(35);
    await slider.fill('50');
    await expect(slider).toHaveAttribute('data-care-split', '50');
    const captureDir = process.env['CAPTURE_DIR'];
    if (captureDir) {
      await page.screenshot({ path: `${captureDir}/seance-avant-apres.png` });
    }

    // Photo enregistrée : avant et après côte à côte (2 pixels de scène d'écart), agrandis.
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      card(page).locator('[data-care-save-compare]').click(),
    ]);
    expect(download.suggestedFilename()).toMatch(
      /^aqfish-avant-apres-\d{4}-\d{2}-\d{2}-\d{6}\.png$/,
    );
    const png = decodePng(readFileSync((await download.path())!));
    const target = lowResolutionSize(WIDTH, HEIGHT);
    const factor = photoScale(target.width * 2 + 2, target.height);
    expect([png.width, png.height]).toEqual([
      (target.width * 2 + 2) * factor,
      target.height * factor,
    ]);

    // Fin de séance : comparaison oubliée ; la séance suivante repart d'une image neuve.
    await card(page).locator('[data-care-close]').click();
    await expect(card(page)).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
