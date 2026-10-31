import { expect, test, type Page } from '@playwright/test';

import { openScene } from './outils-decor';

/**
 * Mode immersif, lot 1 (issue #345) : entrer depuis « Réglages », taille estimée signalée,
 * étalonner avec une carte ID-1, sortir, sans erreur ; au téléphone (390 px, portrait) et à
 * l'ordinateur. Lot 2 (#346) : parallaxe par orientation synthétique. Les images sont jointes au rapport (`immersif-*.png`).
 */

const overlay = (page: Page) => page.locator('app-immersive-mode');

/** Pose la valeur d'un curseur `range` et émet `input`, comme un glisser. */
async function setRange(page: Page, selector: string, value: number): Promise<void> {
  await page.locator(selector).evaluate((el, v) => {
    const input = el as HTMLInputElement;
    input.value = String(v);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

for (const viewport of [
  { name: 'telephone', width: 390, height: 844 },
  { name: 'ordinateur', width: 1280, height: 720 },
]) {
  test(`mode immersif (#345) : entrer, étalonner, sortir, ${viewport.name}`, async ({
    page,
  }, testInfo) => {
    // Rendu logiciel lent (SwiftShader) : deux parcours complets du mode dans le même test.
    test.setTimeout(240_000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const consoleErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text());
      }
    });
    const errors = await openScene(page);

    await test.step('entrer depuis « Réglages »', async () => {
      await page.getByRole('button', { name: 'Réglages' }).click();
      await page.getByRole('button', { name: 'Mode immersif' }).click();
      await expect(overlay(page)).toBeVisible();
      await expect(page.getByRole('dialog', { name: 'Mode immersif' })).toBeVisible();
      // Les panneaux de l'application sont repliés.
      await expect(page.locator('.control-panel')).toHaveCount(0);
      await expect(overlay(page)).toHaveAttribute('data-immersive-calibrated', 'false');
      await expect(overlay(page)).toHaveAttribute('data-immersive-screen-mm', /^[\d.]+x[\d.]+$/);
      await expect(page.locator('[data-immersive-estimated]')).toBeVisible();
      await expect(page.locator('[data-immersive-note]')).toContainText(
        'pas une simulation réaliste',
      );
      // Le plein cadre couvre toute la fenêtre.
      const box = (await overlay(page).boundingBox())!;
      expect(box.width).toBe(viewport.width);
      expect(box.height).toBe(viewport.height);
      await page.waitForTimeout(500);
      const shotEstime = testInfo.outputPath(`immersif-${viewport.name}-estime.png`);
      await page.screenshot({ path: shotEstime });
      await testInfo.attach(`immersif-${viewport.name}-estime.png`, {
        path: shotEstime,
        contentType: 'image/png',
      });
    });

    await test.step('parallaxe (#346) : une orientation synthétique décale l’œil', async () => {
      // Pas de capteur en e2e. Selon la version de Chromium, l'orientation est écoutée dès
      // l'entrée, ou exige `DeviceOrientationEvent.requestPermission` (accordée ici par le
      // contexte, demandée au premier toucher) : on touche la vitre dans les deux cas.
      await page.context().grantPermissions(['accelerometer', 'gyroscope']);
      await page.mouse.click(viewport.width / 2, viewport.height / 2);
      await expect(overlay(page)).toHaveAttribute('data-immersive-parallax', 'waiting');
      const tilt = (beta: number, gamma: number) =>
        page.evaluate(
          ([b, g]) =>
            window.dispatchEvent(
              new DeviceOrientationEvent('deviceorientation', { beta: b, gamma: g }),
            ),
          [beta, gamma],
        );
      await tilt(60, 0);
      await expect(overlay(page)).toHaveAttribute('data-immersive-parallax', 'on');
      await tilt(60, 10);
      await expect
        .poll(async () =>
          Number((await overlay(page).getAttribute('data-immersive-eye-mm'))?.split(',')[0]),
        )
        .toBeLessThan(-5);
      // Retour à la pose neutre : l'œil revient vers le centre.
      await tilt(60, 0);
      await expect
        .poll(async () =>
          Number((await overlay(page).getAttribute('data-immersive-eye-mm'))?.split(',')[0]),
        )
        .toBeGreaterThan(-5);
    });

    await test.step('étalonner avec la carte', async () => {
      await page.locator('[data-immersive-calibrate]').click();
      await expect(page.getByRole('group', { name: 'Étalonnage de l’écran' })).toBeVisible();
      await setRange(page, '[data-immersive-card-width]', 340);
      await expect(page.locator('[data-immersive-card]')).toHaveCSS('width', '340px');
      await page.locator('[data-immersive-validate]').click();
      await expect(overlay(page)).toHaveAttribute('data-immersive-calibrated', 'true');
      await expect(page.locator('[data-immersive-estimated]')).toHaveCount(0);
      const pxPerMm = 340 / 85.6;
      await expect(overlay(page)).toHaveAttribute(
        'data-immersive-screen-mm',
        `${(viewport.width / pxPerMm).toFixed(1)}x${(viewport.height / pxPerMm).toFixed(1)}`,
      );
      const stored = await page.evaluate(() => localStorage.getItem('aqfish.etalonnage-ecran'));
      expect(JSON.parse(stored!).pxPerMm).toBeCloseTo(pxPerMm, 9);
      await page.waitForTimeout(500);
      const shotEtalonne = testInfo.outputPath(`immersif-${viewport.name}-etalonne.png`);
      await page.screenshot({ path: shotEtalonne });
      await testInfo.attach(`immersif-${viewport.name}-etalonne.png`, {
        path: shotEtalonne,
        contentType: 'image/png',
      });
    });

    await test.step('sortir, puis l’étalonnage est repris', async () => {
      await page.locator('[data-immersive-exit]').click();
      await expect(overlay(page)).toHaveCount(0);
      // Le bac affiché reprend : le tick avance de nouveau.
      const host = page.locator('app-aquarium-host');
      const tick = Number(await host.getAttribute('data-aqfish-tick'));
      await expect
        .poll(async () => Number(await host.getAttribute('data-aqfish-tick')))
        .toBeGreaterThan(tick);
      await page.getByRole('button', { name: 'Réglages' }).click();
      await page.getByRole('button', { name: 'Mode immersif' }).click();
      await expect(overlay(page)).toHaveAttribute('data-immersive-calibrated', 'true');
      await page.keyboard.press('Escape');
      await expect(overlay(page)).toHaveCount(0);
    });

    expect(errors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
}
