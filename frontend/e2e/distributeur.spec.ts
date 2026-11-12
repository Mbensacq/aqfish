import { expect, test, type Page } from '@playwright/test';

/**
 * Distributeur de nourriture automatique (issue #583) : posé, réglé et retiré depuis le
 * calendrier d'entretien du tableau de bord, lisible sans débordement à 1280 × 720 et à
 * 390 × 844 ; état exposé par `data-aqfish-feeder` (`aucun`, ou « réserve;heures »).
 *
 * Bac par défaut : aucun distributeur.
 */

const hostEl = (page: Page) => page.locator('app-aquarium-host');
const feederPanel = (page: Page) => page.locator('[data-feeder-panel]');

async function openCalendar(page: Page, search = '?seed=42&vitesse=0'): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`/${search}`);
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  await page.locator('[data-maintenance]').click();
  await expect(page.locator('[data-maintenance-detail]')).toBeVisible();
  return errors;
}

/** Vrai si la boîte de `selector` tient dans la fenêtre et si la page ne défile pas en largeur. */
async function fitsInViewport(page: Page, selector: string): Promise<boolean> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el === null) {
      return false;
    }
    const box = el.getBoundingClientRect();
    const root = document.documentElement;
    return (
      box.left >= 0 &&
      box.top >= 0 &&
      box.right <= window.innerWidth &&
      box.bottom <= window.innerHeight &&
      el.scrollWidth <= el.clientWidth + 1 &&
      root.scrollWidth <= root.clientWidth
    );
  }, selector);
}

test.describe('distributeur automatique (#583)', () => {
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 390, height: 844 },
  ]) {
    test(`poser, régler, retirer : lisible à ${viewport.width} × ${viewport.height}`, async ({
      page,
    }, testInfo) => {
      testInfo.setTimeout(120_000);
      await page.setViewportSize(viewport);
      const errors = await openCalendar(page);
      await expect(hostEl(page)).toHaveAttribute('data-aqfish-feeder', 'aucun');
      await expect(feederPanel(page)).toContainText('Distributeur : aucun');

      await page.locator('[data-feeder-install]').click();
      await expect(hostEl(page)).toHaveAttribute('data-aqfish-feeder', '14;9');
      await expect(feederPanel(page)).toContainText('14 / 14 rations');

      // Deux rations par jour : 9 h et 18 h proposées, puis la seconde déplacée à 20 h.
      await page.locator('[data-feeder-count]').selectOption('2');
      await expect(hostEl(page)).toHaveAttribute('data-aqfish-feeder', '14;9,18');
      await expect(page.locator('[data-feeder-hour]')).toHaveCount(2);
      await page.locator('[data-feeder-hour="1"]').selectOption('20');
      await expect(hostEl(page)).toHaveAttribute('data-aqfish-feeder', '14;9,20');
      // Quatre rations : le panneau le plus large.
      await page.locator('[data-feeder-count]').selectOption('4');
      await expect(page.locator('[data-feeder-hour]')).toHaveCount(4);
      await feederPanel(page).scrollIntoViewIfNeeded();
      await expect(page.locator('[data-feeder-refill]')).toBeInViewport();
      expect(await fitsInViewport(page, '[data-feeder-panel]')).toBe(true);
      expect(await fitsInViewport(page, '[data-maintenance-detail]')).toBe(true);
      const captureDir = process.env['CAPTURE_DIR'];
      if (captureDir) {
        await page.screenshot({ path: `${captureDir}/distributeur-${viewport.width}.png` });
      }

      await page.locator('[data-feeder-remove]').click();
      await expect(hostEl(page)).toHaveAttribute('data-aqfish-feeder', 'aucun');
      expect(errors).toEqual([]);
    });
  }

  test('enregistré avec le bac : retrouvé au rechargement', async ({ page }, testInfo) => {
    testInfo.setTimeout(120_000);
    // Sans graine dans l'adresse : le bac enregistré est repris au rechargement.
    const errors = await openCalendar(page, '');
    await page.locator('[data-feeder-install]').click();
    await page.locator('[data-feeder-count]').selectOption('3');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-feeder', '14;8,13,18');
    await page.reload();
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-feeder', '14;8,13,18');
    expect(errors).toEqual([]);
  });
});
