import { expect, test, type Page } from '@playwright/test';

import { ALGAE_PATCH_COUNT } from '../src/app/sim/algae';
import { createDayClock } from '../src/app/sim/daylight';
import { serializeWorld } from '../src/app/sim/save';
import { createDefaultWorld, type MutableWorld } from '../src/app/sim/world';

/**
 * Séance d'entretien guidée, lot 1 (issue #604, ADR 0138) : « Entretenir le bac » dans le
 * calendrier d'entretien ouvre la séance à l'étape « vitres » ; glisser la raclette sur le bac
 * retire les plaques d'algues là où elle passe ; « Étape terminée » inscrit les vitres au
 * calendrier ; chaque étape se passe ; « Plus tard » interrompt, la séance reprend à son étape,
 * même après un rechargement. Bac tropical couvert d'algues, simulation en pause.
 */

const hostEl = (page: Page) => page.locator('app-aquarium-host');
const card = (page: Page) => page.locator('[data-care-session]');

async function open(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  return errors;
}

/** Importe le bac tropical par défaut couvert d'algues, simulation en pause, midi figé. */
async function importAlgaeTank(page: Page): Promise<void> {
  const world: MutableWorld = createDefaultWorld(42);
  world.water = { ...world.water, algae: new Array<number>(ALGAE_PATCH_COUNT).fill(1) };
  const text = serializeWorld(world, { speed: 0, clock: createDayClock(12, 1200, true) });
  const settings = page.getByRole('button', { name: 'Réglages' });
  await settings.click();
  await page.locator('[data-section="sauvegarde"] input[type="file"]').setInputFiles({
    name: 'algues.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });
  await expect(hostEl(page)).toHaveAttribute('data-aqfish-speed', '0');
  await settings.click();
}

async function visiblePatches(page: Page): Promise<number> {
  const raw = (await hostEl(page).getAttribute('data-aqfish-algae')) ?? '';
  return Number(raw.split(';')[0]);
}

/** Ouvre le calendrier d'entretien puis la séance. */
async function openSession(page: Page, tap = false): Promise<void> {
  const chip = page.locator('[data-maintenance]');
  const button = page.locator('[data-care-session-open]');
  if (tap) {
    await chip.tap();
    await button.tap();
  } else {
    await chip.click();
    await button.click();
  }
  await expect(card(page)).toBeVisible();
}

/** Balayage de la raclette à la souris : lignes horizontales sur le milieu de l'écran. */
async function sweepMouse(page: Page): Promise<void> {
  const box = (await page.locator('app-aquarium-host canvas').boundingBox())!;
  for (const row of [0.4, 0.5, 0.6]) {
    const y = box.y + box.height * row;
    await page.mouse.move(box.x + box.width * 0.2, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.8, y, { steps: 8 });
    await page.mouse.up();
  }
}

test.describe('séance d’entretien (#604)', () => {
  test('souris : raclette, étape terminée au calendrier, étapes passées, bilan', async ({
    page,
  }, testInfo) => {
    testInfo.setTimeout(420_000);
    const errors = await open(page);
    await importAlgaeTank(page);
    expect(await visiblePatches(page)).toBe(ALGAE_PATCH_COUNT);
    const captureDir = process.env['CAPTURE_DIR'];
    await openSession(page);
    await expect(card(page)).toHaveAttribute('data-step', 'vitres');
    await expect(card(page)).toContainText('Les vitres');
    await expect(card(page)).toContainText(`${ALGAE_PATCH_COUNT} taches vertes`);
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-care-session', 'vitres');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-scraper', 'true');
    const population = await hostEl(page).getAttribute('data-aqfish-population');
    if (captureDir) {
      await page.screenshot({ path: `${captureDir}/seance-vitres-avant.png` });
    }

    await sweepMouse(page);
    await expect.poll(() => visiblePatches(page)).toBeLessThan(ALGAE_PATCH_COUNT);
    await expect(card(page)).not.toContainText(`${ALGAE_PATCH_COUNT} taches vertes`);
    // La raclette ne touche pas aux animaux.
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-population', population!);
    if (captureDir) {
      await page.screenshot({ path: `${captureDir}/seance-vitres-apres.png` });
    }

    await card(page).locator('[data-care-done]').click();
    await expect(card(page)).toHaveAttribute('data-step', 'siphon');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-scraper', 'false');
    for (const step of ['filtre', 'eau', 'taille', 'bilan']) {
      await card(page).locator('[data-care-skip]').click();
      await expect(card(page)).toHaveAttribute('data-step', step);
    }
    await expect(card(page).locator('[data-care-summary]')).toContainText('Les vitres : fait');
    await expect(card(page).locator('[data-care-summary]')).toContainText('Le siphon : passé');
    await card(page).locator('[data-care-close]').click();
    await expect(card(page)).toHaveCount(0);
    await expect(hostEl(page)).not.toHaveAttribute('data-aqfish-care-session', /.*/);

    // Les vitres sont au calendrier d'entretien et au journal.
    await page.locator('[data-maintenance]').click();
    await expect(page.locator('[data-maintenance-task="glass"]')).toContainText(
      'Nettoyage des vitres : Dans 14 j',
    );
    await expect(page.locator('[data-maintenance-log]')).toContainText('Nettoyage des vitres');
    // Séance finie : la suivante repart des vitres.
    await page.locator('[data-care-session-open]').click();
    await expect(card(page)).toHaveAttribute('data-step', 'vitres');
    expect(errors).toEqual([]);
  });

  test('interrompue : reprise à la même étape, aussi après un rechargement', async ({
    page,
  }, testInfo) => {
    testInfo.setTimeout(300_000);
    const errors = await open(page);
    await openSession(page);
    // Bac par défaut, sans algues : rien à racler.
    await expect(card(page)).toContainText('rien à racler');
    await card(page).locator('[data-care-skip]').click();
    await expect(card(page)).toHaveAttribute('data-step', 'siphon');
    await card(page).locator('[data-care-close]').click();
    await expect(card(page)).toHaveCount(0);
    await openSession(page);
    await expect(card(page)).toHaveAttribute('data-step', 'siphon');
    await card(page).locator('[data-care-close]').click();
    await page.reload();
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    await openSession(page);
    await expect(card(page)).toHaveAttribute('data-step', 'siphon');
    expect(errors).toEqual([]);
  });

  test('mode décor : aucun bouton de séance', async ({ page }) => {
    await page.goto('/?mode=decor');
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    await expect(page.locator('[data-maintenance]')).toHaveCount(0);
    await expect(page.locator('[data-care-session-open]')).toHaveCount(0);
  });
});

test.describe('séance d’entretien au toucher (#604)', () => {
  test.use({ hasTouch: true });

  test('au doigt : raclette sur la vitre, étape passée', async ({ page }, testInfo) => {
    testInfo.setTimeout(300_000);
    const errors = await open(page);
    await importAlgaeTank(page);
    await openSession(page, true);
    await expect(card(page)).toHaveAttribute('data-step', 'vitres');
    const box = (await page.locator('app-aquarium-host canvas').boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    for (const row of [0.4, 0.5, 0.6]) {
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
    expect(errors).toEqual([]);
  });
});
