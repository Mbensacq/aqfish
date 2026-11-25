import { expect, test, type Page } from '@playwright/test';

import { CAMERA_FOV_DEG } from '../src/app/render/camera-presets';
import { SAVE_STORAGE_KEY } from '../src/app/core/save-storage/save-storage';
import { DEFAULT_DECOR } from '../src/app/sim/decor';
import { SAND_THICKNESS } from '../src/app/sim/tank';
import { selectedTankWorld } from './outils-sauvegarde';
import { ouvrirReglages } from './outils-panneau';

/**
 * Roche calcaire (issue #733) : posée depuis le catalogue de l'éditeur de décor, avec sa
 * consigne (effet sur l'eau, source), sauvegardée avec sa matière et conservée au
 * rechargement. Photo de la roche posée quand `CAPTURE_DIR` est défini. Aides reprises de
 * `bois-flotte.spec.ts` (projection d'un point du bac à l'écran).
 */

const host = (page: Page) => page.locator('app-aquarium-host');

async function vec3Attribute(page: Page, name: string): Promise<number[]> {
  const value = await host(page).getAttribute(name);
  expect(value).toMatch(/^[-\d.]+,[-\d.]+,[-\d.]+$/);
  return value!.split(',').map(Number);
}

/** Position à l'écran (pixels CSS) d'un point du bac (projection perspective, sans Three.js). */
async function projectToScreen(page: Page, point: readonly number[]): Promise<[number, number]> {
  const eye = await vec3Attribute(page, 'data-aqfish-camera');
  const target = await vec3Attribute(page, 'data-aqfish-target');
  const box = (await page.locator('app-aquarium-host canvas').boundingBox())!;
  const sub = (a: readonly number[], b: readonly number[]) => a.map((v, i) => v - b[i]);
  const dot = (a: readonly number[], b: readonly number[]) =>
    a.reduce((s, v, i) => s + v * b[i], 0);
  const norm = (a: readonly number[]) => a.map((v) => v / Math.hypot(...a));
  const cross = (a: readonly number[], b: readonly number[]) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const forward = norm(sub(target, eye));
  const right = norm(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const d = sub(point, eye);
  const tan = Math.tan((CAMERA_FOV_DEG * Math.PI) / 360);
  const ndcX = dot(d, right) / (dot(d, forward) * tan * (box.width / box.height));
  const ndcY = dot(d, up) / (dot(d, forward) * tan);
  return [box.x + ((ndcX + 1) / 2) * box.width, box.y + ((1 - ndcY) / 2) * box.height];
}

/** Point libre du sable, devant les rochers et plantes par défaut. */
const FREE_SAND = [-0.05, SAND_THICKNESS, 0.17] as const;

/** Dernier élément du décor de la sauvegarde locale (écrite à chaque modification). */
async function lastSavedItem(page: Page): Promise<Record<string, unknown> | undefined> {
  const text = await page.evaluate((key) => localStorage.getItem(key), SAVE_STORAGE_KEY);
  expect(text).not.toBeNull();
  return selectedTankWorld<{ decor: Record<string, unknown>[] }>(text!).decor.at(-1);
}

test.describe('Roche calcaire (#733)', () => {
  test.use({ viewport: { width: 800, height: 500 } });
  test.beforeEach(() => {
    test.setTimeout(300_000);
  });

  test('l’éditeur pose une roche calcaire, sauvegardée avec sa matière et conservée', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    const fold = page.getByRole('button', { name: /Replier l’aide-mémoire/ });
    if ((await fold.count()) > 0) {
      await fold.click();
    }
    await ouvrirReglages(page, 'Décor');
    await page.getByRole('button', { name: 'Éditer le décor', exact: true }).click();
    await expect(host(page)).toHaveAttribute('data-aqfish-editing', 'true');
    const editor = page.getByRole('region', { name: 'Éditeur de décor' });
    await page.getByRole('radio', { name: 'Roche calcaire' }).click();
    await expect(editor).toContainText('tire le pH vers 7,8');
    await expect(editor).toContainText('aquariumscience.org');

    const [x, y] = await projectToScreen(page, FREE_SAND);
    await page.mouse.click(x, y);
    await expect(host(page)).toHaveAttribute(
      'data-aqfish-decor-count',
      String(DEFAULT_DECOR.length + 1),
    );
    expect(await lastSavedItem(page)).toMatchObject({ kind: 'rock', material: 'limestone' });
    if (process.env['CAPTURE_DIR']) {
      await page.screenshot({ path: `${process.env['CAPTURE_DIR']}/roche-calcaire.png` });
    }

    await page.reload();
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    await expect(host(page)).toHaveAttribute(
      'data-aqfish-decor-count',
      String(DEFAULT_DECOR.length + 1),
    );
    expect(await lastSavedItem(page)).toMatchObject({ kind: 'rock', material: 'limestone' });
    expect(errors).toEqual([]);
  });
});
