import { readFileSync } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';

import { DEFAULT_SAVE_SETTINGS, serializeWorld } from '../src/app/sim/save';
import { createDefaultWorld } from '../src/app/sim/world';

/**
 * Pièce autour du bac (issue #187) : case « Afficher la pièce » des réglages (bac tropical
 * seulement), enregistrée dans la sauvegarde automatique et dans l'export JSON, relue à
 * l'import ; `piece=1` en capture.
 *
 * Pages ouvertes sans `seed=` quand la sauvegarde doit être restaurée (l'URL prime).
 */

const hostEl = (page: Page) => page.locator('app-aquarium-host');
const toggle = (page: Page) => page.getByRole('button', { name: 'Réglages' });
const roomBox = (page: Page) => page.getByRole('checkbox', { name: 'Afficher la pièce' });
const roomAttr = (page: Page) => hostEl(page).getAttribute('data-aqfish-room');

async function open(page: Page, search = ''): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`/${search}`);
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  return errors;
}

async function openPanel(page: Page): Promise<void> {
  await toggle(page).click();
  await expect(page.locator('section.control-panel')).toBeVisible();
}

async function canvasShot(page: Page): Promise<Buffer> {
  return page.locator('canvas').screenshot({ animations: 'disabled' });
}

test.describe('Pièce autour du bac (#187)', () => {
  test.setTimeout(180_000);

  test('la case affiche la pièce, enregistrée, restaurée, exportée et importée', async ({
    page,
  }) => {
    const errors = await open(page);
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-room', 'false');
    await openPanel(page);
    await expect(roomBox(page)).not.toBeChecked();
    // Vitesse 0 : seule la pièce change l'image entre les deux captures du canvas.
    await page.getByRole('slider', { name: 'Vitesse de la simulation' }).fill('0');
    const before = await canvasShot(page);

    await roomBox(page).check();
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-room', 'true');
    await expect.poll(async () => (await canvasShot(page)).equals(before)).toBe(false);

    // Enregistrée : relue au rechargement.
    await page.reload();
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    expect(await roomAttr(page)).toBe('true');
    await openPanel(page);
    await expect(roomBox(page)).toBeChecked();

    // Export : la pièce est dans les réglages du fichier.
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Exporter' }).click(),
    ]);
    const exported = JSON.parse(readFileSync((await download.path())!, 'utf8'));
    expect(exported.settings.room).toEqual({ shown: true, cabinetHeight: 0.75 });

    // Masquée, puis réaffichée par l'import d'un fichier qui l'affiche.
    await roomBox(page).uncheck();
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-room', 'false');
    const text = serializeWorld(createDefaultWorld(7), {
      ...DEFAULT_SAVE_SETTINGS,
      room: { shown: true, cabinetHeight: 0.9 },
    });
    await page.locator('[data-section="sauvegarde"] input[type="file"]').setInputFiles({
      name: 'piece.json',
      mimeType: 'application/json',
      buffer: Buffer.from(text, 'utf8'),
    });
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-room', 'true');
    await expect(roomBox(page)).toBeChecked();
    expect(errors).toEqual([]);
  });

  test('hors du bac tropical : pas de case, rien n’est dessiné', async ({ page }) => {
    const errors = await open(page, '?seed=42&environnement=bassin');
    await openPanel(page);
    await expect(page.locator('[data-section="environnement"]')).toBeVisible();
    await expect(roomBox(page)).toHaveCount(0);
    expect(await roomAttr(page)).toBe('false');
    expect(errors).toEqual([]);
  });

  test('piece=1 en capture : pièce affichée ; ignoré hors capture', async ({ page }) => {
    await open(page, '?capture=1&seed=42&time=1&piece=1');
    expect(await roomAttr(page)).toBe('true');
    await open(page, '?seed=42&piece=1');
    expect(await roomAttr(page)).toBe('false');
  });
});
