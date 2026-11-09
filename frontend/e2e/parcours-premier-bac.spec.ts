import { expect, test } from '@playwright/test';

import { createDayClock } from '../src/app/sim/daylight';
import { CYCLE_SECONDS, createFirstTankPath, firstTankFacts } from '../src/app/sim/first-tank-path';
import { serializeWorld } from '../src/app/sim/save';
import { createDefaultWorld, type MutableWorld } from '../src/app/sim/world';

/**
 * Parcours « Mon premier aquarium » (issue #512, ADR 0119) : un bac vide, importé juste avant la
 * fin de l'attente, passe de « cycler » à « premier poisson » en temps accéléré, sans erreur.
 */
test('de la première à la deuxième étape en temps accéléré, sauvegarde relue', async ({
  page,
}, testInfo) => {
  testInfo.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  await page.addInitScript(() => {
    localStorage.setItem('aqfish.guide-debutant.v1', 'vu');
    localStorage.setItem('aqfish.parcours-premier-bac.v1', 'ouvert');
  });
  await page.goto('/?seed=42&vitesse=4');
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');

  // Bac vide, parcours commencé il y a presque toute la durée de l'étape.
  const tick = 60 * (CYCLE_SECONDS + 5);
  const empty: MutableWorld = { ...createDefaultWorld(42), entities: [], tick, time: tick / 60 };
  const world: MutableWorld = {
    ...empty,
    firstTankPath: {
      ...createFirstTankPath(firstTankFacts(empty)),
      startedAt: tick / 60 - CYCLE_SECONDS + 1,
    },
  };
  const text = serializeWorld(world, { speed: 4, clock: createDayClock(12, 1200, true) });
  const settings = page.getByRole('button', { name: 'Réglages' });
  await settings.click();
  await page.locator('[data-section="sauvegarde"] input[type="file"]').setInputFiles({
    name: 'parcours.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });
  await settings.click();

  const path = page.locator('[data-first-tank-path]');
  await expect(path).toHaveAttribute('data-step', 'first-fish', { timeout: 120_000 });
  await expect(path).toHaveAttribute('data-done', '1');
  await expect(page.locator('[data-first-tank-body]')).toContainText('premier poisson');
  const captureDir = process.env['CAPTURE_DIR'];
  if (captureDir) {
    await page.screenshot({ path: `${captureDir}/parcours-premier-bac.png` });
  }

  // Quitter la page enregistre le bac ; sans `seed=`, l'application relit la sauvegarde.
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  await expect(path).toHaveAttribute('data-step', 'first-fish');
  await expect(path).toHaveAttribute('data-done', '1');
  expect(errors).toEqual([]);
});

test('replié par défaut, masquable, repris depuis le guide', async ({ page }, testInfo) => {
  testInfo.setTimeout(120_000);
  await page.addInitScript(() => localStorage.setItem('aqfish.guide-debutant.v1', 'vu'));
  await page.goto('/?seed=42&vitesse=0');
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');

  const toggle = page.locator('[data-first-tank-toggle]');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await page.locator('[data-first-tank-hide]').click();
  await expect(page.locator('[data-first-tank-path]')).toHaveCount(0);
  await page.locator('[data-wiki-toggle]').click();
  await page.locator('[data-wiki-beginner-guide]').click();
  await page.locator('[data-guide-path-resume]').click();
  await expect(page.locator('[data-first-tank-body]')).toBeVisible();
});

test('Réglages ouvert : la languette se masque, revient à la fermeture dans le même état (#527)', async ({
  page,
}, testInfo) => {
  testInfo.setTimeout(120_000);
  await page.addInitScript(() => {
    localStorage.setItem('aqfish.guide-debutant.v1', 'vu');
    localStorage.setItem('aqfish.parcours-premier-bac.v1', 'ouvert');
  });
  await page.goto('/?seed=42&vitesse=0');
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');

  const path = page.locator('[data-first-tank-path]');
  const settings = page.getByRole('button', { name: 'Réglages' });
  await expect(path).toBeVisible();
  await expect(page.locator('[data-first-tank-body]')).toBeVisible();

  await settings.click();
  await expect(path).toHaveCount(0);
  await settings.click();
  await expect(path).toBeVisible();
  await expect(page.locator('[data-first-tank-body]')).toBeVisible();
});

test('390 × 844 : le panneau déplié reste dans l’écran', async ({ page }, testInfo) => {
  testInfo.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem('aqfish.guide-debutant.v1', 'vu');
    localStorage.setItem('aqfish.parcours-premier-bac.v1', 'ouvert');
  });
  await page.goto('/?seed=42&vitesse=0');
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  const box = await page.locator('[data-first-tank-path]').boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  const captureDir = process.env['CAPTURE_DIR'];
  if (captureDir) {
    await page.screenshot({ path: `${captureDir}/parcours-premier-bac-telephone.png` });
  }
});
