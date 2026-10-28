import { expect, type Page } from '@playwright/test';

import { CAMERA_FOV_DEG } from '../src/app/render/camera-presets';
import { SAVE_STORAGE_KEY } from '../src/app/core/save-storage/save-storage';
import { DEFAULT_DECOR } from '../src/app/sim/decor';
import { DEFAULT_TANK, SAND_THICKNESS } from '../src/app/sim/tank';
import { selectedTankWorld } from './outils-sauvegarde';

/**
 * Outils communs des e2e de l'éditeur de décor (#167, #168, #170) : ouverture de la scène et
 * de l'éditeur, projection d'un point du bac à l'écran, clics et glissements, sauvegarde.
 */

export const host = (page: Page) => page.locator('app-aquarium-host');

export async function openScene(page: Page, search = ''): Promise<string[]> {
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

export async function startEditing(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Réglages' }).click();
  await page.getByRole('button', { name: 'Éditer le décor', exact: true }).click();
  await expect(host(page)).toHaveAttribute('data-aqfish-editing', 'true');
  await expect(page.getByRole('region', { name: 'Éditeur de décor' })).toBeVisible();
  // L'éditeur prend la place de « Réglages ».
  await expect(page.locator('.control-panel')).toHaveCount(0);
}

export async function vec3Attribute(page: Page, name: string): Promise<number[]> {
  const value = await host(page).getAttribute(name);
  expect(value).toMatch(/^[-\d.]+,[-\d.]+,[-\d.]+$/);
  return value!.split(',').map(Number);
}

/** Position à l'écran (pixels CSS) d'un point du bac (projection perspective, sans Three.js). */
export async function projectToScreen(
  page: Page,
  point: readonly number[],
): Promise<[number, number]> {
  return (await screenProjector(page))(point);
}

/**
 * Projection à l'écran (pixels CSS) des points du bac pour la caméra courante, lue une fois :
 * pour projeter beaucoup de points sans aller-retour avec la page.
 */
export async function screenProjector(
  page: Page,
): Promise<(point: readonly number[]) => [number, number]> {
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
  const tan = Math.tan((CAMERA_FOV_DEG * Math.PI) / 360);
  return (point) => {
    const d = sub(point, eye);
    const ndcX = dot(d, right) / (dot(d, forward) * tan * (box.width / box.height));
    const ndcY = dot(d, up) / (dot(d, forward) * tan);
    return [box.x + ((ndcX + 1) / 2) * box.width, box.y + ((1 - ndcY) / 2) * box.height];
  };
}

export async function clickTank(page: Page, point: readonly number[]): Promise<void> {
  const [x, y] = await projectToScreen(page, point);
  await page.mouse.click(x, y);
}

/** Point libre du sable, devant les rochers et plantes par défaut. */
export const FREE_SAND = [-0.05, SAND_THICKNESS, 0.17] as const;
export const FREE_SAND_2 = [0.38, SAND_THICKNESS, 0.17] as const;
/** Hors du bac, à droite, au niveau du sable. */
export const OUTSIDE = [DEFAULT_TANK.width / 2 + 0.12, SAND_THICKNESS, 0] as const;
/** Cœur du rocher d'indice 2 du décor par défaut (devant à droite en trois-quarts). */
export const ROCK_2 = [DEFAULT_DECOR[2].x, SAND_THICKNESS + 0.03, DEFAULT_DECOR[2].z] as const;

export const count = (page: Page) => host(page).getAttribute('data-aqfish-decor-count');

export interface SavedItem {
  kind: string;
  x: number;
  z: number;
  rotation: number;
  scale: number;
  seed: number;
  form?: 'tall' | 'tuft';
  elevation?: number;
}

/** Décor de la sauvegarde locale (écrite à chaque modification du décor). */
export async function savedDecor(page: Page): Promise<SavedItem[]> {
  const text = await page.evaluate((key) => localStorage.getItem(key), SAVE_STORAGE_KEY);
  expect(text).not.toBeNull();
  return selectedTankWorld<{ decor: SavedItem[] }>(text!).decor;
}

/** Glisser à la souris de `from` à `to` (points du bac), en plusieurs pas. */
export async function dragTank(
  page: Page,
  from: readonly number[],
  to: readonly number[],
): Promise<void> {
  const [x0, y0] = await projectToScreen(page, from);
  const [x1, y1] = await projectToScreen(page, to);
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.mouse.move(x1, y1, { steps: 6 });
  await page.mouse.up();
}

/**
 * Glisser au doigt : événements pointeur tactiles envoyés au canvas (le toucher de Playwright
 * ne sait que taper).
 */
export async function touchDragTank(
  page: Page,
  from: readonly number[],
  to: readonly number[],
): Promise<void> {
  const [x0, y0] = await projectToScreen(page, from);
  const [x1, y1] = await projectToScreen(page, to);
  await page.locator('app-aquarium-host canvas').evaluate(
    (canvas, [ax, ay, bx, by]) => {
      const fire = (type: string, x: number, y: number) =>
        canvas.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 7,
            pointerType: 'touch',
            isPrimary: true,
            button: type === 'pointermove' ? -1 : 0,
            buttons: type === 'pointerup' ? 0 : 1,
            clientX: x,
            clientY: y,
            bubbles: true,
          }),
        );
      fire('pointerdown', ax, ay);
      for (let n = 1; n <= 6; n++) {
        fire('pointermove', ax + ((bx - ax) * n) / 6, ay + ((by - ay) * n) / 6);
      }
      fire('pointerup', bx, by);
    },
    [x0, y0, x1, y1],
  );
}

/**
 * Début de `\0asm` (en-tête WebAssembly) en base64 : marque le fragment du moteur de chute
 * (Rapier, WebAssembly embarqué, #170).
 */
export const ENGINE_MARKER = 'AGFzbQ';

/** Coupe l'accès au moteur de chute (hors ligne) : tout script qui le contient est refusé. */
export async function blockEngine(page: Page): Promise<void> {
  await page.route(/\.m?js(\?|$)/, async (route) => {
    const response = await route.fetch();
    if ((await response.text()).includes(ENGINE_MARKER)) {
      await route.abort('internetdisconnected');
    } else {
      await route.fulfill({ response });
    }
  });
}
