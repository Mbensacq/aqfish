import { readFileSync } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';

import { createDayClock } from '../src/app/sim/daylight';
import { serializeWorld } from '../src/app/sim/save';
import { freshWater } from '../src/app/sim/water';
import { createDefaultWorld, type MutableWorld } from '../src/app/sim/world';
import { selectedTankWorld } from './outils-sauvegarde';

/**
 * Feuilles de catappa (issue #239) : ajout et retrait depuis la section « Eau », note de
 * simplification, jauge pH qui réagit.
 *
 * Le bac tropical est importé **sans habitant** (aucune dérive organique du pH) avec une eau
 * à pH 6,96, affichée « 7,0 », simulation en marche (vitesse 4) : sans feuille, le pH ne
 * bouge pas ; une feuille le fait passer sous 6,95 en quelques secondes simulées.
 */

const hostEl = (page: Page) => page.locator('app-aquarium-host');
const section = (page: Page) => page.locator('[data-section="eau"]');
const phValue = (page: Page) => page.locator('[data-dashboard] [data-gauge-value="ph"]');
const addLeaf = (page: Page) =>
  section(page).getByRole('button', { name: 'Ajouter une feuille de catappa' });
const removeLeaf = (page: Page) =>
  section(page).getByRole('button', { name: 'Retirer une feuille de catappa' });

async function open(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  await page.getByRole('button', { name: 'Réglages' }).click();
  await expect(section(page)).toBeVisible();
  return errors;
}

/** Importe le bac tropical vide, pH 6,96, simulation à la vitesse `speed`, midi figé. */
async function importEmptyTank(page: Page, speed: number): Promise<void> {
  const world: MutableWorld = createDefaultWorld(42);
  world.entities = [];
  world.water = { ...freshWater('tropical'), ph: 6.96 };
  const text = serializeWorld(world, { speed, clock: createDayClock(12, 1200, true) });
  await page.locator('[data-section="sauvegarde"] input[type="file"]').setInputFiles({
    name: 'catappa.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });
  await expect(hostEl(page)).toHaveAttribute('data-aqfish-speed', String(speed));
}

test.describe('feuilles de catappa (#239)', () => {
  test('ajouter puis retirer une feuille ; le pH baisse avec la feuille', async ({ page }) => {
    const errors = await open(page);
    await expect(section(page).locator('[data-catappa-note]')).toContainText(
      'ne remplace pas un test de pH',
    );
    await importEmptyTank(page, 4);
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-catappa', '0;0');
    await expect(phValue(page)).toHaveText('7,0');
    await expect(removeLeaf(page)).toHaveAttribute('aria-disabled', 'true');

    await addLeaf(page).click();
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-catappa', '1;1');
    await expect(section(page).locator('[data-catappa-count]')).toHaveText('1');
    // Une feuille neuve dans 288 L : 6,96 → sous 6,95 en ~8 s simulées (2 s à la vitesse 4).
    await expect(phValue(page)).toHaveText('6,9', { timeout: 30_000 });

    await removeLeaf(page).click();
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-catappa', '0;0');
    await expect(section(page).locator('[data-catappa-count]')).toHaveText('0');
    expect(errors).toEqual([]);
  });

  test('cinq feuilles au plus ; enregistrées dans l’export', async ({ page }) => {
    const errors = await open(page);
    await importEmptyTank(page, 0);
    for (let i = 1; i <= 5; i++) {
      await addLeaf(page).click();
      await expect(hostEl(page)).toHaveAttribute('data-aqfish-catappa', `${i};1`);
    }
    await expect(addLeaf(page)).toHaveAttribute('aria-disabled', 'true');
    await addLeaf(page).click();
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-catappa', '5;1');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('[data-section="sauvegarde"]').getByRole('button', { name: 'Exporter' }).click(),
    ]);
    const exported = selectedTankWorld<{ water: { catappa?: number[] } }>(
      readFileSync((await download.path())!, 'utf8'),
    );
    expect(exported.water.catappa).toEqual([1, 1, 1, 1, 1]);
    expect(errors).toEqual([]);
  });
});
