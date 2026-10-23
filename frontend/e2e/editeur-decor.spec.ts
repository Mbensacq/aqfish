import { expect, test, type Page } from '@playwright/test';

import { CAMERA_FOV_DEG } from '../src/app/render/camera-presets';
import { SAVE_STORAGE_KEY } from '../src/app/core/save-storage/save-storage';
import { DEFAULT_DECOR } from '../src/app/sim/decor';
import { DEFAULT_TANK, SAND_THICKNESS } from '../src/app/sim/tank';

/**
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
const FREE_SAND_2 = [0.38, SAND_THICKNESS, 0.17] as const;
/** Hors du bac, à droite, au niveau du sable. */
const OUTSIDE = [DEFAULT_TANK.width / 2 + 0.12, SAND_THICKNESS, 0] as const;
/** Cœur du rocher d'indice 2 du décor par défaut (devant à droite en trois-quarts). */
const ROCK_2 = [DEFAULT_DECOR[2].x, SAND_THICKNESS + 0.03, DEFAULT_DECOR[2].z] as const;

const count = (page: Page) => host(page).getAttribute('data-aqfish-decor-count');

test.describe('Éditeur de décor (#167)', () => {
  // Rendu logiciel lent : chaque clic attend des images ; fenêtre réduite (au-delà de 640 px,
  // « Commandes » reste ouvert) et délai élargi, comme `nourrissage.spec.ts`.
  test.use({ viewport: { width: 800, height: 500 } });
  test.beforeEach(() => {
    test.setTimeout(300_000);
  });

  test('clic sur le sable : ajoute l’élément choisi ; hors du bac : rien', async ({ page }) => {
    const errors = await openScene(page, '?seed=42');
    await expect(host(page)).toHaveAttribute(
      'data-aqfish-decor-count',
      String(DEFAULT_DECOR.length),
    );
    await startEditing(page);
    await clickTank(page, FREE_SAND);
    await expect(host(page)).toHaveAttribute(
      'data-aqfish-decor-count',
      String(DEFAULT_DECOR.length + 1),
    );
    // L'élément posé est sélectionné.
    await expect(host(page)).toHaveAttribute(
      'data-aqfish-decor-selected',
      String(DEFAULT_DECOR.length),
    );
    await page.getByRole('radio', { name: 'Touffe' }).click();
    await expect(page.getByRole('radio', { name: 'Touffe' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await clickTank(page, FREE_SAND_2);
    await expect(host(page)).toHaveAttribute(
      'data-aqfish-decor-count',
      String(DEFAULT_DECOR.length + 2),
    );
    await clickTank(page, OUTSIDE);
    await expect(host(page)).toHaveAttribute('data-aqfish-decor-selected', 'aucun');
    expect(await count(page)).toBe(String(DEFAULT_DECOR.length + 2));
    // En mode édition, un clic ne nourrit pas.
    await expect(host(page)).toHaveAttribute('data-aqfish-food', '0');
    expect(errors).toEqual([]);
  });

  test('clic sur un élément : sélection ; ailleurs : désélection ; Suppr : retrait', async ({
    page,
  }) => {
    const errors = await openScene(page, '?seed=42');
    await startEditing(page);
    await page.getByRole('radio', { name: 'Sélection' }).click();
    await clickTank(page, ROCK_2);
    await expect(host(page)).toHaveAttribute('data-aqfish-decor-selected', '2');
    // Avec l'outil « Sélection », un clic sur le sable libre désélectionne sans rien poser.
    await clickTank(page, FREE_SAND);
    await expect(host(page)).toHaveAttribute('data-aqfish-decor-selected', 'aucun');
    expect(await count(page)).toBe(String(DEFAULT_DECOR.length));
    await clickTank(page, ROCK_2);
    await expect(host(page)).toHaveAttribute('data-aqfish-decor-selected', '2');
    await clickTank(page, OUTSIDE);
    await expect(host(page)).toHaveAttribute('data-aqfish-decor-selected', 'aucun');
    await clickTank(page, ROCK_2);
    await expect(host(page)).toHaveAttribute('data-aqfish-decor-selected', '2');
    await page.keyboard.press('Delete');
    await expect(host(page)).toHaveAttribute(
      'data-aqfish-decor-count',
      String(DEFAULT_DECOR.length - 1),
    );
    await expect(host(page)).toHaveAttribute('data-aqfish-decor-selected', 'aucun');
    // « Terminer » quitte le mode édition ; un clic sur l'eau nourrit de nouveau.
    await page.getByRole('button', { name: 'Terminer' }).click();
    await expect(host(page)).toHaveAttribute('data-aqfish-editing', 'false');
    await expect(page.getByRole('region', { name: 'Éditeur de décor' })).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('le décor édité est restitué après rechargement', async ({ page }) => {
    // Sans `seed=` : la sauvegarde locale est lue au démarrage (#70).
    const errors = await openScene(page);
    await startEditing(page);
    await clickTank(page, FREE_SAND);
    await page.getByRole('radio', { name: 'Sélection' }).click();
    await clickTank(page, ROCK_2);
    await expect(host(page)).toHaveAttribute('data-aqfish-decor-selected', '2');
    await page.keyboard.press('Delete');
    await expect(host(page)).toHaveAttribute(
      'data-aqfish-decor-count',
      String(DEFAULT_DECOR.length),
    );
    await page.reload();
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    await expect(host(page)).toHaveAttribute(
      'data-aqfish-decor-count',
      String(DEFAULT_DECOR.length),
    );
    const text = await page.evaluate((key) => localStorage.getItem(key), SAVE_STORAGE_KEY);
    expect(text).not.toBeNull();
    const decor = (JSON.parse(text!) as { decor: { kind: string; x: number; z: number }[] }).decor;
    // Le rocher d'indice 2 a disparu, le rocher posé est le dernier élément.
    expect(decor.map((i) => i.kind)).toEqual([
      ...DEFAULT_DECOR.filter((_, n) => n !== 2).map((i) => i.kind),
      'rock',
    ]);
    expect(decor.at(-1)!.x).toBeCloseTo(FREE_SAND[0], 2);
    expect(decor.at(-1)!.z).toBeCloseTo(FREE_SAND[2], 2);
    // Et l'élément ajouté se sélectionne après le rechargement.
    await startEditing(page);
    await page.getByRole('radio', { name: 'Sélection' }).click();
    await clickTank(page, [FREE_SAND[0], SAND_THICKNESS + 0.03, FREE_SAND[2]]);
    await expect(host(page)).toHaveAttribute(
      'data-aqfish-decor-selected',
      String(DEFAULT_DECOR.length - 1),
    );
    expect(errors).toEqual([]);
  });

  test('hors du bac tropical, « Éditer le décor » est inactif', async ({ page }) => {
    const errors = await openScene(page, '?seed=42&environnement=bassin');
    await page.getByRole('button', { name: 'Réglages' }).click();
    const button = page.locator('[data-decor-edit]');
    await expect(button).toHaveAttribute('aria-disabled', 'true');
    // Bouton focalisable mais sans effet (`aria-disabled`) : clic envoyé directement.
    await button.dispatchEvent('click');
    await expect(host(page)).toHaveAttribute('data-aqfish-editing', 'false');
    await expect(page.locator('.control-panel')).toBeVisible();
    expect(errors).toEqual([]);
  });
});
