import { expect, test, type Page } from '@playwright/test';

import { createDayClock } from '../src/app/sim/daylight';
import { serializeWorld } from '../src/app/sim/save';
import { freshWater } from '../src/app/sim/water';
import { createDefaultWorld, starveWorldInPlace, type MutableWorld } from '../src/app/sim/world';

/**
 * Aides pour débutant (issue #240, ADR 0072) : « Guide du débutant » en dialogue modal,
 * ouvert à la première visite, depuis le wiki et par « Pourquoi ? » sous une alerte.
 *
 * Les autres fichiers démarrent avec le guide déjà vu (`playwright.config.ts`) ; celui-ci
 * repart d'un stockage vide là où il teste la première visite.
 *
 * `GUIDE_SHOTS=<dossier>` : copie des captures dans ce dossier (pour les regarder).
 */

const guide = (page: Page) => page.getByRole('dialog', { name: 'Guide du débutant' });

async function open(page: Page, search = '?vitesse=0'): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`/${search}`);
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  return errors;
}

/**
 * Bac à l'eau mauvaise (ammoniaque 6, nitrites 2,5, nitrates 50) aux animaux affamés : des
 * alertes dès le démarrage. Posé dans la sauvegarde automatique avant le chargement.
 */
async function withAlerts(page: Page): Promise<void> {
  const world: MutableWorld = createDefaultWorld(42);
  world.water = { ...freshWater('tropical'), ammonia: 6, nitrite: 2.5, nitrate: 50 };
  starveWorldInPlace(world);
  const text = serializeWorld(world, { speed: 0, clock: createDayClock(12, 1200, true) });
  await page.addInitScript((saved) => {
    window.localStorage.setItem('aqfish.sauvegarde', saved);
  }, text);
}

async function shot(page: Page, name: string): Promise<void> {
  const path = test.info().outputPath(`${name}.png`);
  await page.screenshot({ path });
  await test.info().attach(name, { path, contentType: 'image/png' });
  const dir = process.env['GUIDE_SHOTS'];
  if (dir) {
    await page.screenshot({ path: `${dir}/${name}.png` });
  }
}

test.describe('première visite (#240)', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('le guide s’ouvre une fois, se ferme au clavier, puis ne revient plus', async ({ page }) => {
    const errors = await open(page);
    await expect(guide(page)).toBeVisible();
    await expect(guide(page)).toHaveAttribute('aria-modal', 'true');
    await expect(guide(page).locator('[data-guide-step]')).toHaveCount(5);
    // Focus dans le dialogue dès l'ouverture : Échap le ferme.
    await expect(guide(page)).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(guide(page)).toHaveCount(0);

    await page.reload();
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    await expect(page.getByRole('button', { name: 'Wiki des espèces' })).toBeVisible();
    await expect(guide(page)).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('jamais en mode capture', async ({ page }) => {
    const errors = await open(page, '?capture=1&seed=42&camera=top');
    await expect(guide(page)).toHaveCount(0);
    expect(
      await page.evaluate(() => window.localStorage.getItem('aqfish.guide-debutant.v1')),
    ).toBeNull();
    expect(errors).toEqual([]);
  });
});

test.describe('guide ouvert à la demande (#240)', () => {
  test('depuis le wiki, au clavier : Tab reste dans le dialogue, Échap rend le focus', async ({
    page,
  }) => {
    const errors = await open(page);
    await expect(guide(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Wiki des espèces' }).click();
    const entry = page.getByRole('button', { name: 'Guide du débutant' });
    await entry.focus();
    await page.keyboard.press('Enter');
    await expect(guide(page)).toBeVisible();
    await expect(guide(page)).toBeFocused();

    // Un tour complet de Tab, puis Maj+Tab : le focus ne sort jamais du dialogue.
    const inDialog = () =>
      page.evaluate(() => document.activeElement?.closest('[role="dialog"]') !== null);
    const count = await guide(page).locator('button').count();
    for (let i = 0; i <= count; i++) {
      await page.keyboard.press('Tab');
    }
    expect(await inDialog()).toBe(true);
    await expect(guide(page).locator('[data-guide-close]')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    expect(await inDialog()).toBe(true);

    // « Pourquoi ? » au clavier : Entrée déplie l'explication.
    const why = guide(page).locator('[data-why-toggle="acclimatation"]');
    await why.focus();
    await page.keyboard.press('Enter');
    await expect(why).toHaveAttribute('aria-expanded', 'true');
    await expect(guide(page).locator('[data-why-text]')).toContainText('peu à peu');

    await page.keyboard.press('Escape');
    await expect(guide(page)).toHaveCount(0);
    await expect(entry).toBeFocused();
    // Échap consommé par le guide : le wiki reste ouvert.
    await expect(page.locator('#wiki-especes')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('« Pourquoi ? » sous une alerte ouvre l’explication liée', async ({ page }) => {
    await withAlerts(page);
    const errors = await open(page);
    const alert = page.locator('[data-alert="ammonia"] button');
    await alert.click();
    await page.locator('[data-alert-why="ammonia"]').click();
    await expect(guide(page)).toBeVisible();
    const toggle = guide(page).locator('[data-why-toggle="azote"]');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(toggle).toBeFocused();
    await guide(page).getByRole('button', { name: 'Fermer' }).click();
    await expect(guide(page)).toHaveCount(0);
    await expect(page.locator('[data-alert-why="ammonia"]')).toBeFocused();
    expect(errors).toEqual([]);
  });
});

test.describe('téléphone 390 × 844 (#240)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('alerte dépliée, puis guide : tout tient dans l’écran', async ({ page }) => {
    await withAlerts(page);
    const errors = await open(page);
    await page.locator('[data-alert="ammonia"] button').click();
    await expect(page.locator('[data-alert-why="ammonia"]')).toBeVisible();
    await shot(page, 'telephone-alerte');

    await page.locator('[data-alert-why="ammonia"]').click();
    await expect(guide(page)).toBeVisible();
    // L'explication demandée se lit sans défiler.
    await expect(guide(page).locator('[data-why-text]')).toBeInViewport();
    const box = (await guide(page).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(box.y + box.height).toBeLessThanOrEqual(844);
    await shot(page, 'telephone-guide');
    await page.getByRole('button', { name: 'Fermer' }).click();
    await guide(page).waitFor({ state: 'detached' });
    await page.locator('[data-wiki-toggle]').click();
    await page.locator('[data-wiki-beginner-guide]').click();
    await expect(guide(page)).toBeVisible();
    await shot(page, 'telephone-guide-etapes');
    expect(errors).toEqual([]);
  });
});
