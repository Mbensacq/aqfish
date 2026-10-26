import { readFileSync } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';

import { createDayClock } from '../src/app/sim/daylight';
import { serializeWorld } from '../src/app/sim/save';
import { freshWater } from '../src/app/sim/water';
import { createDefaultWorld, type MutableWorld } from '../src/app/sim/world';

/**
 * pH (issue #236) : jauge « pH » (dans le tableau de bord en bordure depuis #256), zone selon
 * les espèces présentes, remontée vers l'eau neuve au changement d'eau (section « Eau »).
 *
 * Le bac tropical par défaut (néons, guppys, corydoras) est importé avec une eau acide
 * (pH 6,0, sous la tolérance des guppys) et la simulation à l'arrêt (vitesse 0) : la valeur
 * affichée ne bouge qu'avec les actions du test (`docs/PIEGES.md`, « E2e qui compte un état
 * que la simulation consomme »).
 */

const hostEl = (page: Page) => page.locator('app-aquarium-host');
const section = (page: Page) => page.locator('[data-section="eau"]');
const gauge = (page: Page) => page.locator('[data-dashboard] [data-gauge="ph"]');
const value = (page: Page) => gauge(page).locator('[data-gauge-value="ph"]');
const meter = (page: Page) => gauge(page).getByRole('meter', { name: 'pH' });

async function open(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  await page.getByRole('button', { name: 'Réglages' }).click();
  await expect(section(page)).toBeVisible();
  return errors;
}

/** Importe le bac tropical par défaut à l'eau acide, simulation à l'arrêt, midi figé. */
async function importAcidTank(page: Page): Promise<void> {
  const world: MutableWorld = createDefaultWorld(42);
  world.water = { ...freshWater('tropical'), ph: 6 };
  const text = serializeWorld(world, { speed: 0, clock: createDayClock(12, 1200, true) });
  await page
    .locator('[data-section="sauvegarde"] input[type="file"]')
    .setInputFiles({ name: 'ph.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  await expect(hostEl(page)).toHaveAttribute('data-aqfish-speed', '0');
}

test.describe('pH (#236)', () => {
  test('la jauge « pH » apparaît dans le tableau de bord et suit le changement d’eau', async ({
    page,
  }) => {
    const errors = await open(page);
    // Eau neuve du bac tropical : pH 7,0, idéal commun des trois espèces.
    await expect(gauge(page)).toBeVisible();
    await expect(meter(page)).toBeVisible();
    await expect(value(page)).toHaveText('7,0');

    await importAcidTank(page);
    await expect(value(page)).toHaveText('6,0');
    await expect(gauge(page)).toHaveAttribute('data-level', 'rouge');
    await expect(meter(page)).toHaveAttribute('aria-valuetext', 'pH : 6,0, hors plage, stable');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-ph', '6;hors-plage');

    await section(page).getByRole('button', { name: 'Changer l’eau' }).click();
    // 6 + 0,3 × (7 − 6) = 6,3.
    await expect(value(page)).toHaveText('6,3');
    await section(page).getByRole('button', { name: 'Changer l’eau' }).click();
    // 6,3 + 0,3 × 0,7 = 6,51 : toléré par les guppys.
    await expect(value(page)).toHaveText('6,5');
    await expect(gauge(page)).toHaveAttribute('data-level', 'orange');
    await expect(meter(page)).toHaveAttribute('aria-valuetext', 'pH : 6,5, toléré, stable');
    expect(errors).toEqual([]);
  });

  test('390 × 844 : la jauge « pH » et sa valeur tiennent dans l’écran', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await open(page);
    await section(page).scrollIntoViewIfNeeded();
    for (const element of [meter(page), value(page)]) {
      await expect(element).toBeInViewport();
      const box = await element.boundingBox();
      expect(box?.width ?? 0).toBeGreaterThan(8);
    }
    expect(errors).toEqual([]);
  });

  // QA (cycle 78) : le pH suit l'environnement et la sauvegarde.
  test('récif à pH 7,0 : hors plage ; ancienne sauvegarde sans pH : eau neuve du bassin', async ({
    page,
  }) => {
    const errors = await open(page);
    const input = page.locator('[data-section="sauvegarde"] input[type="file"]');
    const clock = createDayClock(12, 1200, true);

    // Récif (poissons-clowns, chirurgiens : tolérance 7,8 à 8,6) importé à pH 7,0.
    const reef: MutableWorld = createDefaultWorld(42, 'recif');
    reef.water = { ...freshWater('recif'), ph: 7 };
    await input.setInputFiles({
      name: 'recif.json',
      mimeType: 'application/json',
      buffer: Buffer.from(serializeWorld(reef, { speed: 0, clock })),
    });
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-environment', 'recif');
    await expect(value(page)).toHaveText('7,0');
    await expect(gauge(page)).toHaveAttribute('data-level', 'rouge');

    // Ancienne sauvegarde : le champ `ph` est retiré de l'eau.
    const pond = JSON.parse(
      serializeWorld(createDefaultWorld(7, 'bassin'), { speed: 0, clock }),
    ) as { water?: Record<string, unknown> };
    expect(pond.water).toBeDefined();
    delete pond.water?.['ph'];
    await input.setInputFiles({
      name: 'ancien.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(pond)),
    });
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-environment', 'bassin');
    await expect(value(page)).toHaveText('7,5');
    await expect(gauge(page)).toHaveAttribute('data-level', 'vert');

    // Un pH hors bornes est refusé, le bac reste inchangé.
    pond.water!['ph'] = 12;
    await input.setInputFiles({
      name: 'hors-bornes.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(pond)),
    });
    await expect(page.getByRole('alert')).toContainText('ph');
    await expect(value(page)).toHaveText('7,5');
    expect(errors).toEqual([]);
  });

  test('l’export de la sauvegarde contient le pH affiché', async ({ page }) => {
    const errors = await open(page);
    await importAcidTank(page);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('[data-section="sauvegarde"]').getByRole('button', { name: 'Exporter' }).click(),
    ]);
    const exported = JSON.parse(readFileSync((await download.path())!, 'utf8')) as {
      water: { ph: number };
    };
    expect(exported.water.ph).toBe(6);
    expect(errors).toEqual([]);
  });
});
