import { expect, test, type Page } from '@playwright/test';

import { createDayClock } from '../src/app/sim/daylight';
import { saveData } from '../src/app/sim/save';
import { createDefaultWorld } from '../src/app/sim/world';

/**
 * Rendu des granulés (issues #117 et #226) : voxels par défaut, bouton du panneau pour passer
 * aux points et revenir, choix conservé au rechargement (sauvegarde), ancienne sauvegarde
 * sans le réglage acceptée (voxels), `granules=` en capture, bouton lisible à 390 px.
 *
 * Les pages sont ouvertes sans `seed=` : un paramètre de monde dans l'URL désactive la
 * restauration de la sauvegarde.
 */

const hostEl = (page: Page) => page.locator('app-aquarium-host');
const STYLE = 'data-aqfish-food-style';
const foodButton = (page: Page) => page.getByRole('button', { name: /^Granulés : / });

async function open(page: Page, search = ''): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`/${search}`);
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  return errors;
}

async function openPanel(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Réglages' }).click();
  await expect(foodButton(page)).toBeVisible();
}

test.describe('Rendu des granulés (#117)', () => {
  test('voxels par défaut (#226), le bouton alterne avec les points', async ({ page }) => {
    const errors = await open(page);
    await expect(hostEl(page)).toHaveAttribute(STYLE, 'voxels');
    await openPanel(page);
    await expect(foodButton(page)).toHaveText('Granulés : voxels');
    await page.keyboard.press('g');
    await expect(hostEl(page)).not.toHaveAttribute('data-aqfish-food', '0');
    await foodButton(page).click();
    await expect(hostEl(page)).toHaveAttribute(STYLE, 'points');
    await expect(foodButton(page)).toHaveText('Granulés : points');
    await foodButton(page).click();
    await expect(hostEl(page)).toHaveAttribute(STYLE, 'voxels');
    expect(errors).toEqual([]);
  });

  test('choix conservé au rechargement', async ({ page }) => {
    const errors = await open(page);
    await openPanel(page);
    await foodButton(page).click();
    await expect(hostEl(page)).toHaveAttribute(STYLE, 'points');
    await page.reload();
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    await expect(hostEl(page)).toHaveAttribute(STYLE, 'points');
    await openPanel(page);
    await expect(foodButton(page)).toHaveText('Granulés : points');
    expect(errors).toEqual([]);
  });

  test('ancienne sauvegarde sans le réglage : granulés en voxels (#226)', async ({ page }) => {
    const data = structuredClone(
      saveData(createDefaultWorld(5), { speed: 1, clock: createDayClock(12, 1200, false) }),
    ) as unknown as { settings: Record<string, unknown> };
    delete data.settings['foodStyle'];
    await page.addInitScript((text) => {
      window.localStorage.setItem('aqfish.sauvegarde', text);
    }, JSON.stringify(data));
    const errors = await open(page);
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-seed', '5');
    await expect(hostEl(page)).toHaveAttribute(STYLE, 'voxels');
    expect(errors).toEqual([]);
  });

  test('en capture : granules= choisit le rendu, invalide ⇒ voxels', async ({ page }) => {
    await open(page, '?capture=1&seed=42&granules=points&nourrir=0');
    await expect(hostEl(page)).toHaveAttribute(STYLE, 'points');
    await open(page, '?capture=1&seed=42&granules=cubes');
    await expect(hostEl(page)).toHaveAttribute(STYLE, 'voxels');
  });

  test('390 × 844 : bouton atteignable dans le panneau', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page);
    await openPanel(page);
    await foodButton(page).scrollIntoViewIfNeeded();
    const box = await foodButton(page).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    await foodButton(page).click();
    await expect(hostEl(page)).toHaveAttribute(STYLE, 'points');
  });
});
