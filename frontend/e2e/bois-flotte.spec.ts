import { expect, test, type Page } from '@playwright/test';

import { CAMERA_FOV_DEG } from '../src/app/render/camera-presets';
import { SAVE_STORAGE_KEY } from '../src/app/core/save-storage/save-storage';
import { DEFAULT_DECOR } from '../src/app/sim/decor';
import { SAND_THICKNESS } from '../src/app/sim/tank';

/**
 * QA du bois flotté (issue #169), parcours : pose depuis le catalogue de l'éditeur, sauvegarde
 * locale et rechargement, bois mal formés ou hors du bac en mode capture.
 *
 * Reprend les aides de `editeur-decor.spec.ts` (projection d'un point du bac à l'écran).
 * Éditeur de décor (issue #167) : « Réglages » → « Éditer le décor » ouvre le mode édition ;
 * un clic sur le sable pose l'élément choisi, un clic hors du bac n'ajoute rien, un clic sur
 * un élément le sélectionne, un clic ailleurs désélectionne, Suppr le retire ; le décor édité
 * survit au rechargement (sauvegarde locale). L'état est lu sur les attributs de l'hôte
 * (`data-aqfish-decor-count`, `data-aqfish-decor-selected`, `data-aqfish-editing`).
 */

const host = (page: Page) => page.locator('app-aquarium-host');

async function openScene(page: Page, search = ''): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`/${search}`);
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  // Aide-mémoire replié : il ne recouvre pas le bac (clics hors du bac, à droite).
  const fold = page.getByRole('button', { name: /Replier l’aide-mémoire/ });
  if ((await fold.count()) > 0) {
    await fold.click();
  }
  return errors;
}

async function startEditing(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Réglages' }).click();
  await page.getByRole('button', { name: 'Éditer le décor', exact: true }).click();
  await expect(host(page)).toHaveAttribute('data-aqfish-editing', 'true');
  await expect(page.getByRole('region', { name: 'Éditeur de décor' })).toBeVisible();
  // L'éditeur prend la place de « Réglages ».
  await expect(page.locator('.control-panel')).toHaveCount(0);
}

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

async function clickTank(page: Page, point: readonly number[]): Promise<void> {
  const [x, y] = await projectToScreen(page, point);
  await page.mouse.click(x, y);
}

/** Point libre du sable, devant les rochers et plantes par défaut. */
const FREE_SAND = [-0.05, SAND_THICKNESS, 0.17] as const;

interface SavedItem {
  kind: string;
  x: number;
  z: number;
  rotation: number;
  scale: number;
}

/** Décor de la sauvegarde locale (écrite à chaque modification du décor). */
async function savedDecor(page: Page): Promise<SavedItem[]> {
  const text = await page.evaluate((key) => localStorage.getItem(key), SAVE_STORAGE_KEY);
  expect(text).not.toBeNull();
  return (JSON.parse(text!) as { decor: SavedItem[] }).decor;
}

test.describe('Bois flotté (#169), parcours QA', () => {
  test.use({ viewport: { width: 800, height: 500 } });
  test.beforeEach(() => {
    test.setTimeout(300_000);
  });

  test('l’éditeur pose un bois flotté, sauvegardé et conservé au rechargement', async ({
    page,
  }) => {
    const errors = await openScene(page);
    await startEditing(page);
    await page.getByRole('radio', { name: 'Bois flotté' }).click();
    await expect(page.getByRole('radio', { name: 'Bois flotté' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await clickTank(page, FREE_SAND);
    await expect(host(page)).toHaveAttribute(
      'data-aqfish-decor-count',
      String(DEFAULT_DECOR.length + 1),
    );
    const saved = await savedDecor(page);
    expect(saved.at(-1)?.kind).toBe('wood');
    await page.reload();
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    await expect(host(page)).toHaveAttribute(
      'data-aqfish-decor-count',
      String(DEFAULT_DECOR.length + 1),
    );
    expect((await savedDecor(page)).at(-1)?.kind).toBe('wood');
    expect(errors).toEqual([]);
  });

  test('mode capture : bois mal formés, hors du bac ou en surnombre, sans erreur', async ({
    page,
  }) => {
    const queries = [
      'bois=abc',
      'bois=0:0:0:0:7',
      'bois=5:5:0:1:7',
      'bois=0:0:0:1:-1',
      'bois=-0.02:0:-0.2:1.5:7,0.1:0.1:1:1:8,0.2:-0.1:2:1:9,-0.2:0.1:3:1:10,0:0:0:1:11',
    ];
    for (const query of queries) {
      const errors = await openScene(page, `?capture=1&heure=0&seed=42&${query}`);
      expect(errors, query).toEqual([]);
      const decor = Number(await host(page).getAttribute('data-aqfish-decor-count'));
      expect(decor, query).toBeGreaterThanOrEqual(DEFAULT_DECOR.length);
      expect(decor, query).toBeLessThanOrEqual(DEFAULT_DECOR.length + 4);
    }
  });
});
