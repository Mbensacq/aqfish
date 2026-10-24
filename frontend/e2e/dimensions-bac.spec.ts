import { expect, test, type Page } from '@playwright/test';

import { CAMERA_PRESETS } from '../src/app/core/capture/capture-params';
import { tankCenter } from '../src/app/render/camera-presets';
import { DEFAULT_TANK, TANK_LIMITS, type TankDimensions } from '../src/app/sim/tank';
import {
  host,
  openScene,
  projectToScreen,
  savedDecor,
  startEditing,
  vec3Attribute,
} from './outils-decor';

/**
 * Dimensions réglables du bac (issue #171) : trois curseurs de l'éditeur de décor ; changer
 * une dimension reconstruit le bac et recadre la caméra, dont les cinq préréglages montrent le
 * bac entier ; les dimensions survivent au rechargement. L'état est lu sur l'attribut
 * `data-aqfish-tank` (`longueur:hauteur:profondeur`, mètres).
 */

const SMALL: TankDimensions = { width: 0.6, height: 0.5, depth: 0.3 };
const LARGE: TankDimensions = {
  width: TANK_LIMITS.width.max,
  height: TANK_LIMITS.height.max,
  depth: TANK_LIMITS.depth.max,
};

const tankAttribute = (dims: TankDimensions) => `${dims.width}:${dims.height}:${dims.depth}`;

/** Règle les trois curseurs (centimètres) ; chaque curseur relâché applique sa dimension. */
async function setTank(page: Page, dims: TankDimensions): Promise<void> {
  for (const key of ['width', 'depth', 'height'] as const) {
    await page.locator(`[data-dimension="${key}"]`).fill(String(Math.round(dims[key] * 100)));
  }
  await expect(host(page)).toHaveAttribute('data-aqfish-tank', tankAttribute(dims));
}

/** Les huit coins du bac sont à l'écran, et la caméra vise le centre du bac. */
async function expectTankFramed(page: Page, dims: TankDimensions): Promise<void> {
  await expect
    .poll(async () => {
      const target = await vec3Attribute(page, 'data-aqfish-target');
      return Math.max(...target.map((v, i) => Math.abs(v - tankCenter(dims)[i])));
    })
    .toBeLessThan(1e-3);
  const box = (await page.locator('app-aquarium-host canvas').boundingBox())!;
  for (const x of [-dims.width / 2, dims.width / 2]) {
    for (const y of [0, dims.height]) {
      for (const z of [-dims.depth / 2, dims.depth / 2]) {
        const [sx, sy] = await projectToScreen(page, [x, y, z]);
        expect(sx).toBeGreaterThanOrEqual(box.x - 1);
        expect(sx).toBeLessThanOrEqual(box.x + box.width + 1);
        expect(sy).toBeGreaterThanOrEqual(box.y - 1);
        expect(sy).toBeLessThanOrEqual(box.y + box.height + 1);
      }
    }
  }
}

test.describe('Dimensions du bac (#171)', () => {
  // Rendu logiciel lent : chaque changement de dimensions recrée la vue (~20 s) ; fenêtre
  // réduite et délai élargi, comme `editeur-decor.spec.ts`.
  test.use({ viewport: { width: 800, height: 500 } });
  test.beforeEach(() => {
    test.setTimeout(600_000);
  });

  test('curseurs : bornes, valeurs par défaut, petit et grand bac recadrés sous les 5 angles', async ({
    page,
  }) => {
    const errors = await openScene(page, '?seed=42');
    await expect(host(page)).toHaveAttribute('data-aqfish-tank', tankAttribute(DEFAULT_TANK));
    await startEditing(page);
    for (const key of ['width', 'height', 'depth'] as const) {
      const slider = page.locator(`[data-dimension="${key}"]`);
      await expect(slider).toHaveValue(String(Math.round(DEFAULT_TANK[key] * 100)));
      await expect(slider).toHaveAttribute('min', String(Math.round(TANK_LIMITS[key].min * 100)));
      await expect(slider).toHaveAttribute('max', String(Math.round(TANK_LIMITS[key].max * 100)));
    }
    for (const dims of [SMALL, LARGE]) {
      await setTank(page, dims);
      // Toujours en mode édition, la population est conservée.
      await expect(host(page)).toHaveAttribute('data-aqfish-editing', 'true');
      for (const preset of CAMERA_PRESETS) {
        await page.locator(`[data-preset="${preset}"]`).click();
        await expectTankFramed(page, dims);
      }
    }
    expect(errors).toEqual([]);
  });

  test('le décor reste dans le bac réduit ; les dimensions survivent au rechargement', async ({
    page,
  }) => {
    // Sans `seed=` : la sauvegarde locale est lue au démarrage (#70, contexte neuf).
    const errors = await openScene(page);
    const population = await host(page).getAttribute('data-aqfish-population');
    await startEditing(page);
    await setTank(page, SMALL);
    for (const item of await savedDecor(page)) {
      expect(Math.abs(item.x)).toBeLessThan(SMALL.width / 2);
      expect(Math.abs(item.z)).toBeLessThan(SMALL.depth / 2);
    }
    await expect(host(page)).toHaveAttribute('data-aqfish-population', population!);
    await page.reload();
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    await expect(host(page)).toHaveAttribute('data-aqfish-tank', tankAttribute(SMALL));
    await expect(host(page)).toHaveAttribute('data-aqfish-population', population!);
    expect(errors).toEqual([]);
  });

  test('capture bac= : bornée ; sans bac=, dimensions par défaut ; ignorée au bassin', async ({
    page,
  }) => {
    const errors = await openScene(page, '?capture=1&seed=42&bac=5:0.1:0.45');
    await expect(host(page)).toHaveAttribute('data-aqfish-tank', '2:0.5:0.45');
    await openScene(page, '?capture=1&seed=42');
    await expect(host(page)).toHaveAttribute('data-aqfish-tank', tankAttribute(DEFAULT_TANK));
    await openScene(page, '?capture=1&seed=42&environnement=bassin&bac=0.6:0.4:0.3');
    await expect(host(page)).toHaveAttribute('data-aqfish-tank', '2:0.4:1.4');
    expect(errors).toEqual([]);
  });
});
