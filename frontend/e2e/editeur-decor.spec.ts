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

/** Glisser à la souris de `from` à `to` (points du bac), en plusieurs pas. */
async function dragTank(page: Page, from: readonly number[], to: readonly number[]): Promise<void> {
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
async function touchDragTank(
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

test.describe('Éditeur de décor : déplacer, tourner, redimensionner (#168)', () => {
  test.beforeEach(() => {
    test.setTimeout(300_000);
  });

  test.describe('à la souris', () => {
    test.use({ viewport: { width: 800, height: 500 } });

    test('glisser un élément le déplace sans tourner la caméra ; glisser dans le vide la tourne', async ({
      page,
    }) => {
      // Sans `seed=` : chaque modification est écrite dans la sauvegarde locale.
      const errors = await openScene(page);
      await startEditing(page);
      const camera = await host(page).getAttribute('data-aqfish-camera');
      await dragTank(page, ROCK_2, [FREE_SAND_2[0], SAND_THICKNESS + 0.03, FREE_SAND_2[2] - 0.04]);
      await expect(host(page)).toHaveAttribute('data-aqfish-decor-selected', '2');
      await expect
        .poll(async () => (await savedDecor(page))[2].x, { timeout: 60_000 })
        .not.toBeCloseTo(DEFAULT_DECOR[2].x, 2);
      const rock = (await savedDecor(page))[2];
      expect(rock.x).toBeGreaterThan(DEFAULT_DECOR[2].x);
      expect(rock.z).toBeGreaterThan(DEFAULT_DECOR[2].z);
      expect(Math.abs(rock.z)).toBeLessThan(DEFAULT_TANK.depth / 2);
      // La caméra n'a pas bougé, aucun élément n'a été ajouté.
      expect(await host(page).getAttribute('data-aqfish-camera')).toBe(camera);
      expect(await count(page)).toBe(String(DEFAULT_DECOR.length));
      // Glisser dans le vide (sable libre) : la caméra tourne, rien n'est posé ni déplacé.
      await dragTank(page, FREE_SAND, [FREE_SAND[0] + 0.2, SAND_THICKNESS, FREE_SAND[2]]);
      await expect(host(page)).not.toHaveAttribute('data-aqfish-camera', camera!);
      expect(await count(page)).toBe(String(DEFAULT_DECOR.length));
      expect((await savedDecor(page))[2]).toEqual(rock);
      expect(errors).toEqual([]);
    });

    test('glisser au-delà de la vitre : l’élément reste dans le bac ; flèches et + − le posent', async ({
      page,
    }) => {
      const errors = await openScene(page);
      await startEditing(page);
      // Devant la vitre avant : le rocher s'arrête contre elle, son emprise dans le bac.
      await dragTank(page, ROCK_2, [DEFAULT_DECOR[2].x, SAND_THICKNESS + 0.03, 0.6]);
      await expect
        .poll(async () => (await savedDecor(page))[2].z, { timeout: 60_000 })
        .toBeGreaterThan(DEFAULT_DECOR[2].z + 0.08);
      const rock = (await savedDecor(page))[2];
      expect(rock.z).toBeLessThan(DEFAULT_TANK.depth / 2 - 0.1);
      await page.keyboard.press('ArrowRight');
      await expect
        .poll(async () => (await savedDecor(page))[2].rotation, { timeout: 60_000 })
        .toBeCloseTo((rock.rotation + Math.PI / 12) % (2 * Math.PI), 6);
      await page.keyboard.press('-');
      await expect
        .poll(async () => (await savedDecor(page))[2].scale, { timeout: 60_000 })
        .toBeCloseTo(rock.scale - 0.25, 6);
      expect(errors).toEqual([]);
    });

    test('lâcher un rocher sur un autre : la pose est refusée, il revient à sa place', async ({
      page,
    }) => {
      const errors = await openScene(page);
      await startEditing(page);
      const target = DEFAULT_DECOR[3];
      await dragTank(page, ROCK_2, [target.x, SAND_THICKNESS + 0.03, target.z]);
      await expect(host(page)).toHaveAttribute('data-aqfish-decor-selected', '2');
      // Sauvegarde écrite à chaque modification : à défaut, on valide l'état après un geste
      // suivant, valide celui-là (déplacement vers le sable libre devant).
      await dragTank(page, ROCK_2, [FREE_SAND_2[0], SAND_THICKNESS + 0.03, FREE_SAND_2[2]]);
      await expect
        .poll(async () => (await savedDecor(page))[2].z, { timeout: 60_000 })
        .toBeGreaterThan(DEFAULT_DECOR[2].z + 0.05);
      // Le rocher visé n'a pas bougé et aucun élément n'a été ajouté ni retiré.
      const saved = await savedDecor(page);
      expect(saved[3].x).toBeCloseTo(target.x, 6);
      expect(saved[3].z).toBeCloseTo(target.z, 6);
      expect(saved).toHaveLength(DEFAULT_DECOR.length);
      expect(errors).toEqual([]);
    });
  });

  test.describe('au toucher, 390 × 844', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

    test('un doigt déplace l’élément ; boutons de pose de 44 px au moins', async ({ page }) => {
      const errors = await openScene(page);
      await startEditing(page);
      const camera = await host(page).getAttribute('data-aqfish-camera');
      await touchDragTank(page, ROCK_2, [
        DEFAULT_DECOR[2].x - 0.08,
        SAND_THICKNESS + 0.03,
        DEFAULT_DECOR[2].z + 0.1,
      ]);
      await expect(host(page)).toHaveAttribute('data-aqfish-decor-selected', '2');
      await expect
        .poll(async () => (await savedDecor(page))[2].x, { timeout: 60_000 })
        .toBeLessThan(DEFAULT_DECOR[2].x - 0.04);
      expect(await host(page).getAttribute('data-aqfish-camera')).toBe(camera);
      const editor = page.getByRole('region', { name: 'Éditeur de décor' });
      for (const name of ['Tourner de −15°', 'Tourner de +15°', 'Réduire', 'Agrandir']) {
        const box = (await editor.getByRole('button', { name, exact: true }).boundingBox())!;
        expect(box.width, name).toBeGreaterThanOrEqual(44);
        expect(box.height, name).toBeGreaterThanOrEqual(44);
      }
      const before = (await savedDecor(page))[2];
      await editor.getByRole('button', { name: 'Tourner de −15°', exact: true }).tap();
      await expect
        .poll(async () => (await savedDecor(page))[2].rotation, { timeout: 60_000 })
        .not.toBeCloseTo(before.rotation, 6);
      // Réduire (agrandi ici, le rocher chevaucherait la touffe voisine : refusé).
      await editor.getByRole('button', { name: 'Réduire', exact: true }).tap();
      await expect
        .poll(async () => (await savedDecor(page))[2].scale, { timeout: 60_000 })
        .toBeCloseTo(before.scale - 0.25, 6);
      expect(errors).toEqual([]);
    });
  });
});
