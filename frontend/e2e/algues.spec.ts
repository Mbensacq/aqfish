import { expect, test, type Page } from '@playwright/test';

import { ALGAE_PATCH_COUNT } from '../src/app/sim/algae';
import { createDayClock } from '../src/app/sim/daylight';
import { serializeWorld } from '../src/app/sim/save';
import { createDefaultWorld, type MutableWorld } from '../src/app/sim/world';

/**
 * Algues (issue #476) : réglage de l'éclairage dans la section « Eau », alerte du tableau de
 * bord, raclette.
 *
 * Le bac tropical par défaut est importé avec toutes ses plaques d'algues à couverture pleine,
 * simulation en pause (vitesse 0) : rien ne pousse ni ne bouge pendant le test. Raclette en
 * main, des clics sur le bac retirent des plaques une à une, sans changer la population.
 */

const hostEl = (page: Page) => page.locator('app-aquarium-host');
const section = (page: Page) => page.locator('[data-section="eau"]');
const scraper = (page: Page) => section(page).locator('[data-scraper]');

async function open(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  return errors;
}

async function openSettings(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Réglages' }).click();
  await expect(section(page)).toBeVisible();
}

/** Importe le bac tropical par défaut couvert d'algues, simulation en pause, midi figé. */
async function importAlgaeTank(page: Page): Promise<void> {
  const world: MutableWorld = createDefaultWorld(42);
  world.water = { ...world.water, algae: new Array<number>(ALGAE_PATCH_COUNT).fill(1) };
  const text = serializeWorld(world, { speed: 0, clock: createDayClock(12, 1200, true) });
  await page.locator('[data-section="sauvegarde"] input[type="file"]').setInputFiles({
    name: 'algues.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });
  await expect(hostEl(page)).toHaveAttribute('data-aqfish-speed', '0');
}

/** Nombre de plaques visibles (`data-aqfish-algae`, « visibles;couverture;éclairage »). */
async function visiblePatches(page: Page): Promise<number> {
  const raw = (await hostEl(page).getAttribute('data-aqfish-algae')) ?? '';
  return Number(raw.split(';')[0]);
}

test.describe('algues (#476)', () => {
  test('bac par défaut : aucune algue, éclairage de 8 h ; réglage enregistré', async ({ page }) => {
    const errors = await open(page);
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-algae', '0;0;8');
    await openSettings(page);
    const slider = section(page).locator('[data-lighting]');
    await expect(slider).toHaveAttribute('aria-valuetext', '8 h par jour');
    await slider.fill('14');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-algae', /;14$/);
    await expect(slider).toHaveAttribute('aria-valuetext', '14 h par jour');
    expect(errors).toEqual([]);
  });

  test('alerte « algues » au tableau de bord, avec lien vers le wiki', async ({ page }) => {
    const errors = await open(page);
    await openSettings(page);
    await importAlgaeTank(page);
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-algae', `${ALGAE_PATCH_COUNT};100;8`);
    const alert = page.locator('[data-dashboard-status] [data-alert="algae"]');
    await expect(alert).toHaveAttribute('data-severity', 'critique');
    await expect(alert).toContainText('Algues envahissantes');
    // Le panneau ouvert recouvre le tableau de bord : on le referme.
    await page.getByRole('button', { name: 'Réglages' }).click();
    await alert.locator('button').first().click();
    await expect(page.locator('[data-alert-wiki="entretien"]')).toContainText('Wiki : Entretien');
    expect(errors).toEqual([]);
  });

  test('raclette : des clics sur le bac retirent des plaques, sans toucher aux poissons', async ({
    page,
  }) => {
    // Rendu logiciel lent en local : chaque clic attend une image.
    test.setTimeout(300_000);
    const errors = await open(page);
    await openSettings(page);
    await importAlgaeTank(page);
    const population = await hostEl(page).getAttribute('data-aqfish-population');
    await expect(scraper(page)).toHaveAttribute('aria-pressed', 'false');
    await scraper(page).click();
    await expect(scraper(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-scraper', 'true');
    // Le panneau couvre une partie de l'écran : on le referme pour viser le bac.
    await page.getByRole('button', { name: 'Réglages' }).click();
    const box = await page.locator('canvas').first().boundingBox();
    expect(box).not.toBeNull();
    const { x, y, width, height } = box!;
    // Points visés : les plaques du fond et des côtés couvrent une bonne part du bac.
    for (const [fx, fy] of [
      [0.5, 0.5],
      [0.35, 0.55],
      [0.65, 0.5],
      [0.45, 0.45],
      [0.6, 0.6],
    ]) {
      await page.mouse.click(x + fx * width, y + fy * height);
      if ((await visiblePatches(page)) < ALGAE_PATCH_COUNT) {
        break;
      }
    }
    await expect.poll(() => visiblePatches(page)).toBeLessThan(ALGAE_PATCH_COUNT);
    expect(await hostEl(page).getAttribute('data-aqfish-population')).toBe(population);
    expect(errors).toEqual([]);
  });
});
