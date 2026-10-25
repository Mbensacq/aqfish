import { expect, test, type Page } from '@playwright/test';

import { SAVE_STORAGE_KEY } from '../src/app/core/save-storage/save-storage';
import { DEFAULT_ROOM } from '../src/app/sim/room';
import { dragTank, host, openScene, projectToScreen, screenProjector } from './outils-decor';

/**
 * Éditeur de la pièce (issue #188) : en mode édition, pièce affichée, un élément du
 * catalogue posé d'un clic sur le parquet, déplacé en le glissant, puis restitué au
 * rechargement (sauvegarde automatique).
 */

interface SavedRoomItem {
  kind: string;
  x: number;
  z: number;
  quarter: number;
  elevation?: number;
}

/** Hauteur du parquet dans le repère du bac (meuble par défaut). */
const FLOOR_Y = -DEFAULT_ROOM.cabinetHeight;
/** Hauteur de la table basse (cm 40). */
const TABLE_HEIGHT = 0.4;

/**
 * Point libre du parquet devant le bac, à droite, visible à l'écran hors du panneau de
 * l'éditeur avec de la marge pour le glisser (le cadrage dépend de la fenêtre) : la table
 * basse (1 × 0,5 m) y tient sans toucher le meuble.
 */
async function visibleFloor(page: Page, minZ = -0.05): Promise<number[]> {
  const project = await screenProjector(page);
  for (let x = 1.2; x <= 2.6; x += 0.05) {
    for (let z = minZ; z <= 1.6; z += 0.05) {
      const point = [Math.round(x * 100) / 100, FLOOR_Y, Math.round(z * 100) / 100];
      const [sx, sy] = project(point);
      if (sx > 700 && sx < 1100 && sy > 450 && sy < 650) {
        return point;
      }
    }
  }
  throw new Error(
    `aucun point du parquet visible à droite du meuble : ${JSON.stringify(
      [
        [1.2, 0.6],
        [1.5, 1],
        [2, 1.6],
        [2.6, 0.6],
      ].map(([x, z]) => project([x, FLOOR_Y, z])),
    )}`,
  );
}

async function savedRoomItems(page: Page): Promise<SavedRoomItem[]> {
  const text = await page.evaluate((key) => localStorage.getItem(key), SAVE_STORAGE_KEY);
  expect(text).not.toBeNull();
  const data = JSON.parse(text!) as { settings: { room?: { items?: SavedRoomItem[] } } };
  return data.settings.room?.items ?? [];
}

test.describe('Éditeur de la pièce (#188)', () => {
  // Chaque clic sur le canvas coûte plusieurs secondes en rendu logiciel.
  test.setTimeout(300_000);

  test('ajouter un meuble, le déplacer, recharger : il est restitué', async ({ page }) => {
    const errors = await openScene(page);
    await page.getByRole('button', { name: 'Réglages' }).click();
    await page.getByRole('checkbox', { name: 'Afficher la pièce' }).check();
    await expect(host(page)).toHaveAttribute('data-aqfish-room', 'true');
    await page.getByRole('button', { name: 'Éditer le décor', exact: true }).click();
    await expect(host(page)).toHaveAttribute('data-aqfish-editing', 'true');
    const editor = page.getByRole('region', { name: 'Éditeur de décor' });
    await expect(editor.locator('[data-room-count]')).toContainText('0 /');

    // Recul de la caméra (molette, à droite du panneau) : le parquet devant le bac à l'écran.
    const camera = await host(page).getAttribute('data-aqfish-camera');
    await page.mouse.move(1000, 400);
    for (let i = 0; i < 8; i++) {
      await page.mouse.wheel(0, 600);
    }
    await expect(host(page)).not.toHaveAttribute('data-aqfish-camera', camera!);
    await page.waitForTimeout(500);

    // Ajouter : outil « Table basse », clic sur le parquet.
    await editor.getByRole('radio', { name: 'Table basse' }).click();
    const floor = await visibleFloor(page);
    const [x, y] = await projectToScreen(page, floor);
    await page.mouse.click(x, y);
    await expect(host(page)).toHaveAttribute('data-aqfish-room-count', '1');
    await expect(host(page)).toHaveAttribute('data-aqfish-room-selected', '0');
    const added = await savedRoomItems(page);
    expect(added).toHaveLength(1);
    expect(added[0].kind).toBe('table-basse');
    expect(added[0].x).toBeCloseTo(floor[0], 1);
    expect(added[0].z).toBeCloseTo(floor[2], 1);

    // Déplacer : glisser la table par son plateau, de 30 cm vers la droite.
    const top = [added[0].x, FLOOR_Y + TABLE_HEIGHT, added[0].z];
    await dragTank(page, top, [top[0] + 0.3, top[1], top[2]]);
    await expect
      .poll(async () => (await savedRoomItems(page))[0]?.x)
      .toBeGreaterThan(added[0].x + 0.1);
    const moved = await savedRoomItems(page);
    expect(moved).toHaveLength(1);
    expect(moved[0].z).toBeCloseTo(added[0].z, 1);

    // Recharger : la table est restituée à sa nouvelle place.
    await page.reload();
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    await expect(host(page)).toHaveAttribute('data-aqfish-room', 'true');
    await expect(host(page)).toHaveAttribute('data-aqfish-room-count', '1');
    expect(await savedRoomItems(page)).toEqual(moved);
    expect(errors).toEqual([]);
  });

  test('tourner puis supprimer un meuble : la sauvegarde suit, le rechargement le confirme', async ({
    page,
  }) => {
    const errors = await openScene(page);
    await page.getByRole('button', { name: 'Réglages' }).click();
    await page.getByRole('checkbox', { name: 'Afficher la pièce' }).check();
    await expect(host(page)).toHaveAttribute('data-aqfish-room', 'true');
    await page.getByRole('button', { name: 'Éditer le décor', exact: true }).click();
    await expect(host(page)).toHaveAttribute('data-aqfish-editing', 'true');
    const editor = page.getByRole('region', { name: 'Éditeur de décor' });

    const camera = await host(page).getAttribute('data-aqfish-camera');
    await page.mouse.move(1000, 400);
    for (let i = 0; i < 8; i++) {
      await page.mouse.wheel(0, 600);
    }
    await expect(host(page)).not.toHaveAttribute('data-aqfish-camera', camera!);
    await page.waitForTimeout(500);

    await editor.getByRole('radio', { name: 'Table basse' }).click();
    const floor = await visibleFloor(page);
    const [x, y] = await projectToScreen(page, floor);
    await page.mouse.click(x, y);
    await expect(host(page)).toHaveAttribute('data-aqfish-room-selected', '0');
    const added = await savedRoomItems(page);
    expect(added).toHaveLength(1);

    // Éloigner la table du mur du fond : un quart de tour y serait refusé (chevauchement).
    const top = [added[0].x, FLOOR_Y + TABLE_HEIGHT, added[0].z];
    await dragTank(page, top, [top[0], top[1], top[2] + 0.35]);
    await expect
      .poll(async () => (await savedRoomItems(page))[0]?.z, { timeout: 60_000 })
      .toBeGreaterThan(added[0].z + 0.15);

    // Tourner d'un quart de tour : l'orientation sauvegardée change.
    await page.keyboard.press('ArrowRight');
    await expect
      .poll(async () => (await savedRoomItems(page))[0]?.quarter, { timeout: 60_000 })
      .not.toBe(added[0].quarter);

    // Supprimer : la pièce est vide, y compris après rechargement.
    await page.keyboard.press('Delete');
    await expect(host(page)).toHaveAttribute('data-aqfish-room-count', '0', { timeout: 60_000 });
    expect(await savedRoomItems(page)).toEqual([]);
    await page.reload();
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    await expect(host(page)).toHaveAttribute('data-aqfish-room-count', '0');
    expect(errors).toEqual([]);
  });
});
