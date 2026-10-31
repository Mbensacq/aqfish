import { expect, test, type Locator, type Page } from '@playwright/test';

import { DEFAULT_DECOR } from '../src/app/sim/decor';
import { SAND_THICKNESS } from '../src/app/sim/tank';
import {
  dragTank,
  FREE_SAND,
  openScene,
  projectToScreen,
  ROCK_2,
  savedDecor,
  touchDragTank,
} from './outils-decor';

/**
 * Caméra libre dans la pièce, lot 2 (issue #344) : au doigt (glisser pour orienter, pincer
 * ou boutons « Avancer » / « Reculer »), pavé qui ne recouvre ni le tableau de bord ni le
 * panneau « Réglages », sélection et édition du décor en caméra libre.
 */

const hostEl = (page: Page) => page.locator('app-aquarium-host');
const freeButton = (page: Page) => page.locator('[data-action="camera-libre"]');
const pad = (page: Page) => page.locator('app-free-camera-pad .free-camera-pad');
const padButton = (page: Page, move: 'avancer' | 'reculer') =>
  page.locator(`[data-free-move="${move}"]`);

interface Rect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

async function camera(page: Page): Promise<number[]> {
  return ((await hostEl(page).getAttribute('data-aqfish-camera')) ?? '').split(',').map(Number);
}

/** Boîtes de tous les éléments visibles sous `selector` (racines comprises). */
async function boxes(page: Page, selector: string): Promise<Rect[]> {
  return page.evaluate(
    (sel) =>
      [...document.querySelectorAll(sel)].flatMap((root) =>
        [root, ...root.querySelectorAll('*')].flatMap((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0
            ? [{ left: r.left, top: r.top, right: r.right, bottom: r.bottom }]
            : [];
        }),
      ),
    selector,
  );
}

async function rect(locator: Locator): Promise<Rect> {
  const b = (await locator.boundingBox())!;
  return { left: b.x, top: b.y, right: b.x + b.width, bottom: b.y + b.height };
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/** Le pavé est dans la fenêtre et ne touche aucune boîte de `selector`. */
async function expectPadClearOf(page: Page, selector: string): Promise<void> {
  const padBox = await rect(pad(page));
  const viewport = page.viewportSize()!;
  expect(padBox.left).toBeGreaterThanOrEqual(0);
  expect(padBox.top).toBeGreaterThanOrEqual(0);
  expect(padBox.right).toBeLessThanOrEqual(viewport.width);
  expect(padBox.bottom).toBeLessThanOrEqual(viewport.height);
  const others = await boxes(page, selector);
  expect(others.length, selector).toBeGreaterThan(0);
  for (const other of others) {
    expect(overlaps(padBox, other), `${selector} ${JSON.stringify(other)}`).toBe(false);
  }
}

/** Ouvre « Réglages », affiche la pièce ; le panneau reste ouvert. */
async function showRoom(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Réglages' }).click();
  await page.getByRole('checkbox', { name: 'Afficher la pièce' }).check();
  await expect(hostEl(page)).toHaveAttribute('data-aqfish-room', 'true');
}

/** Événements pointeur tactiles envoyés au canvas : `tracks` = un trajet par doigt. */
async function touchGesture(page: Page, tracks: readonly (readonly number[])[]): Promise<void> {
  await page.locator('app-aquarium-host canvas').evaluate((canvas, fingers) => {
    const fire = (type: string, id: number, x: number, y: number) =>
      canvas.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 20 + id,
          pointerType: 'touch',
          isPrimary: id === 0,
          button: type === 'pointermove' ? -1 : 0,
          buttons: type === 'pointerup' ? 0 : 1,
          clientX: x,
          clientY: y,
          bubbles: true,
        }),
      );
    fingers.forEach(([ax, ay], id) => fire('pointerdown', id, ax, ay));
    for (let n = 1; n <= 8; n++) {
      fingers.forEach(([ax, ay, bx, by], id) =>
        fire('pointermove', id, ax + ((bx - ax) * n) / 8, ay + ((by - ay) * n) / 8),
      );
    }
    fingers.forEach(([, , bx, by], id) => fire('pointerup', id, bx, by));
  }, tracks);
}

/** Attend l'arrêt de la caméra (vitesse amortie, poussée éteinte). */
async function waitForRest(page: Page): Promise<number[]> {
  await expect
    .poll(async () => {
      const a = await camera(page);
      await page.waitForTimeout(300);
      return (await camera(page)).join() === a.join();
    })
    .toBe(true);
  return camera(page);
}

test.describe('Caméra libre au doigt, 390 × 844 (#344)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test.setTimeout(240_000);

  test('glisser oriente, pincer et boutons avancent ou reculent ; pavé dégagé', async ({
    page,
  }, testInfo) => {
    const errors = await openScene(page, '?seed=8&camera=three-quarter&vitesse=0');
    await showRoom(page);

    await test.step('entrer au bouton « Libre » : pavé affiché, hors du panneau', async () => {
      await expect(pad(page)).toHaveCount(0);
      await freeButton(page).tap();
      await expect(hostEl(page)).toHaveAttribute('data-aqfish-camera-libre', 'true');
      await expect(pad(page)).toBeVisible();
      await expectPadClearOf(page, '.control-panel');
      await page.getByRole('button', { name: 'Réglages' }).click();
      await expect(page.locator('.control-panel')).toBeHidden();
      await expectPadClearOf(page, 'app-dashboard-frame, app-dashboard-status');
      await page.screenshot({ path: testInfo.outputPath('pave-390.png') });
    });

    const box = (await page.locator('app-aquarium-host canvas').boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    await test.step('un doigt : un appui bref n’oriente pas, un glisser oriente', async () => {
      const target = await hostEl(page).getAttribute('data-aqfish-target');
      const position = await camera(page);
      await touchGesture(page, [[cx, cy, cx + 4, cy + 3]]);
      await page.waitForTimeout(200);
      expect(await hostEl(page).getAttribute('data-aqfish-target')).toBe(target);
      await touchGesture(page, [[cx, cy, cx + 90, cy]]);
      await expect.poll(() => hostEl(page).getAttribute('data-aqfish-target')).not.toBe(target);
      expect(await camera(page)).toEqual(position);
    });

    await test.step('deux doigts qui s’écartent : la caméra avance puis s’arrête', async () => {
      const before = await waitForRest(page);
      await touchGesture(page, [
        [cx - 30, cy, cx - 120, cy],
        [cx + 30, cy, cx + 120, cy],
      ]);
      await expect
        .poll(async () => {
          const now = await camera(page);
          return Math.hypot(now[0] - before[0], now[2] - before[2]);
        })
        .toBeGreaterThan(0.05);
      await waitForRest(page);
    });

    await test.step('bouton « Reculer » tenu : la caméra recule ; relâché : s’arrête', async () => {
      const before = await waitForRest(page);
      const init = { pointerId: 40, pointerType: 'touch', isPrimary: true, button: 0 };
      await padButton(page, 'reculer').dispatchEvent('pointerdown', init);
      await expect
        .poll(async () => {
          const now = await camera(page);
          return Math.hypot(now[0] - before[0], now[2] - before[2]);
        })
        .toBeGreaterThan(0.05);
      await padButton(page, 'reculer').dispatchEvent('pointerup', init);
      const rest = await waitForRest(page);
      await page.waitForTimeout(500);
      expect(await camera(page)).toEqual(rest);
    });

    await test.step('sortir : pavé masqué', async () => {
      await freeButton(page).tap();
      await expect(hostEl(page)).toHaveAttribute('data-aqfish-camera-libre', 'false');
      await expect(pad(page)).toHaveCount(0);
    });

    expect(errors).toEqual([]);
  });

  test('un doigt déplace un élément du décor en caméra libre', async ({ page }) => {
    const errors = await openScene(page, '');
    await showRoom(page);
    await freeButton(page).tap();
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-camera-libre', 'true');
    await page.getByRole('button', { name: 'Éditer le décor', exact: true }).click();
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-editing', 'true');
    const camera0 = await hostEl(page).getAttribute('data-aqfish-camera');
    const target0 = await hostEl(page).getAttribute('data-aqfish-target');
    await touchDragTank(page, ROCK_2, [
      DEFAULT_DECOR[2].x - 0.08,
      SAND_THICKNESS + 0.03,
      DEFAULT_DECOR[2].z + 0.1,
    ]);
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-decor-selected', '2');
    await expect
      .poll(async () => (await savedDecor(page))[2].x, { timeout: 60_000 })
      .toBeLessThan(DEFAULT_DECOR[2].x - 0.04);
    // Glisser un élément ne tourne pas la caméra libre.
    expect(await hostEl(page).getAttribute('data-aqfish-camera')).toBe(camera0);
    expect(await hostEl(page).getAttribute('data-aqfish-target')).toBe(target0);
    expect(errors).toEqual([]);
  });
});

test.describe('Caméra libre et édition, 1280 × 720 (#344)', () => {
  test.use({ viewport: { width: 1280, height: 720 } });
  test.setTimeout(300_000);

  test('pavé dégagé ; sélection, ajout et déplacement du décor en caméra libre', async ({
    page,
  }, testInfo) => {
    const errors = await openScene(page, '');
    await showRoom(page);
    await freeButton(page).click();
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-camera-libre', 'true');
    await expect(pad(page)).toBeVisible();
    await expectPadClearOf(page, '.control-panel');
    await expectPadClearOf(page, 'app-dashboard-frame, app-dashboard-status');
    await page.screenshot({ path: testInfo.outputPath('pave-1280.png') });

    await page.getByRole('button', { name: 'Éditer le décor', exact: true }).click();
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-editing', 'true');
    // L'édition ne quitte pas la caméra libre.
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-camera-libre', 'true');
    const count = DEFAULT_DECOR.length;

    await test.step('clic sur un rocher : sélectionné, caméra immobile', async () => {
      const position = await camera(page);
      const [x, y] = await projectToScreen(page, ROCK_2);
      await page.mouse.click(x, y);
      await expect(hostEl(page)).toHaveAttribute('data-aqfish-decor-selected', '2');
      expect(await camera(page)).toEqual(position);
    });

    await test.step('glisser le rocher : déplacé, la vue ne tourne pas', async () => {
      const target = await hostEl(page).getAttribute('data-aqfish-target');
      await dragTank(page, ROCK_2, [
        DEFAULT_DECOR[2].x - 0.08,
        SAND_THICKNESS + 0.03,
        DEFAULT_DECOR[2].z + 0.1,
      ]);
      await expect
        .poll(async () => (await savedDecor(page))[2].x, { timeout: 60_000 })
        .toBeLessThan(DEFAULT_DECOR[2].x - 0.04);
      expect(await hostEl(page).getAttribute('data-aqfish-target')).toBe(target);
    });

    await test.step('clic sur le sable libre : élément ajouté', async () => {
      const [x, y] = await projectToScreen(page, FREE_SAND);
      await page.mouse.click(x, y);
      await expect(hostEl(page)).toHaveAttribute('data-aqfish-decor-count', String(count + 1));
      await expect(hostEl(page)).toHaveAttribute('data-aqfish-camera-libre', 'true');
    });

    expect(errors).toEqual([]);
  });

  test('le mode libre est repris au rechargement, puis l’orbite une fois quitté', async ({
    page,
  }) => {
    const errors = await openScene(page, '');
    await showRoom(page);
    await freeButton(page).click();
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-camera-libre', 'true');
    // La pièce est enregistrée dans la sauvegarde (écrite au changement) : rechargement.
    await page.reload();
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-camera-libre', 'true');
    await expect(pad(page)).toBeVisible();
    await freeButton(page).click();
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-camera-libre', 'false');
    await page.reload();
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-camera-libre', 'false');
    expect(errors).toEqual([]);
  });
});
