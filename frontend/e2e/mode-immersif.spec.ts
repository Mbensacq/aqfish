import { expect, test, type Page } from '@playwright/test';

import { openScene } from './outils-decor';

/**
 * Mode immersif, lot 1 (issue #345) : entrer depuis « Réglages », taille estimée signalée,
 * étalonner avec une carte ID-1, sortir, sans erreur ; au téléphone (390 px, portrait) et à
 * l'ordinateur. Lot 2 (#346) : parallaxe par orientation synthétique, nourriture en touchant le
 * haut de l'écran (toucher synthétique), interface par appui long qui se cache seule. Les
 * images sont jointes au rapport (`immersif-*.png`).
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

/** Appui long au point (x, y) : l'interface s'affiche (#346). */
async function longPress(page: Page, x: number, y: number): Promise<void> {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(900);
  await page.mouse.up();
  await expect(overlay(page)).toHaveAttribute('data-immersive-ui', 'visible');
}

/**
 * Rend l'interface si elle s'est cachée seule (après 5 s, vite atteintes en rendu logiciel) :
 * une touche du clavier, sans toucher la vitre.
 */
async function ensureUi(page: Page): Promise<void> {
  await page.keyboard.press('Shift');
  await expect(overlay(page)).toHaveAttribute('data-immersive-ui', 'visible');
}

/** Clique un bouton de l'interface après l'avoir rendue (touche du clavier). */
async function clickInUi(page: Page, selector: string): Promise<void> {
  await ensureUi(page);
  await page.locator(selector).click();
}

/**
 * Toucher synthétique (pointeur `touch`) sur la vitre, au point (x, y). Les deux événements
 * partent dans la même tâche : en rendu logiciel, une image lente entre les deux laisserait
 * passer le délai de l'appui long.
 */
async function touch(page: Page, x: number, y: number): Promise<void> {
  await page.locator('app-immersive-mode canvas').evaluate(
    (canvas, [cx, cy]) => {
      const init = {
        bubbles: true,
        pointerId: 7,
        isPrimary: true,
        pointerType: 'touch',
        clientX: cx,
        clientY: cy,
      };
      canvas.dispatchEvent(new PointerEvent('pointerdown', { ...init, buttons: 1 }));
      canvas.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
    },
    [x, y],
  );
}

for (const viewport of [
  { name: 'telephone', width: 390, height: 844 },
  { name: 'ordinateur', width: 1280, height: 720 },
]) {
  test(`mode immersif (#345) : entrer, étalonner, sortir, ${viewport.name}`, async ({
    page,
  }, testInfo) => {
    // Rendu logiciel lent (SwiftShader) : deux parcours complets du mode dans le même test.
    // Lot 2 (#346) : nourriture et interface ajoutent une vingtaine d'actions, de 2 à 3 s chacune
    // à 1280 × 720.
    test.setTimeout(420_000);
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
      await ensureUi(page);
      await expect(page.locator('[data-immersive-estimated]')).toBeAttached();
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

    await test.step('nourriture (#346) : toucher le haut de l’écran', async () => {
      await expect(overlay(page)).toHaveAttribute('data-immersive-food', '0');
      await touch(page, viewport.width / 2, viewport.height * 0.05);
      await expect
        .poll(async () => Number(await overlay(page).getAttribute('data-immersive-food')))
        .toBeGreaterThan(0);
      // Plus bas, un toucher tapote la vitre : pas de nourriture en plus.
      const food = Number(await overlay(page).getAttribute('data-immersive-food'));
      await touch(page, viewport.width / 2, viewport.height * 0.6);
      await page.waitForTimeout(300);
      expect(Number(await overlay(page).getAttribute('data-immersive-food'))).toBeLessThanOrEqual(
        food,
      );
    });

    await test.step('interface (#346) : cachée seule, rendue par un appui long', async () => {
      // 5 s et 15 images au moins : une image peut durer plusieurs secondes en rendu logiciel.
      await expect(overlay(page)).toHaveAttribute('data-immersive-ui', 'hidden', {
        timeout: 120_000,
      });
      await expect(page.locator('[data-immersive-exit]')).toBeHidden();
      await longPress(page, viewport.width / 2, viewport.height / 2);
      await expect(overlay(page)).not.toHaveClass(/immersive--ui-hidden/);
    });

    await test.step('étalonner avec la carte', async () => {
      await clickInUi(page, '[data-immersive-calibrate]');
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
      await clickInUi(page, '[data-immersive-exit]');
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
