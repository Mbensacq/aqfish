import { expect, test, type Page } from '@playwright/test';

import { DEFAULT_DECOR, type DecorItem } from '../src/app/sim/decor';
import { clampDecorPosition, isDecorPoseAllowed } from '../src/app/sim/decor-edit';
import { SAND_THICKNESS } from '../src/app/sim/tank';
import {
  blockEngine,
  clickTank,
  count,
  dragTank,
  ENGINE_MARKER,
  FREE_SAND,
  host,
  openScene,
  ROCK_2,
  savedDecor,
  startEditing,
} from './outils-decor';

/**
 * Pose par gravité (issue #170) : le moteur physique n'est demandé qu'à l'ouverture de
 * l'éditeur ; un rocher lâché sur un autre s'y pose ou glisse à côté, sans le pénétrer ;
 * moteur inaccessible (hors ligne) : l'élément est posé sur le sable avec un message.
 * Le fragment du moteur se reconnaît à son WebAssembly embarqué en base64 (en-tête `\0asm`).
 */

/** Signale chaque script reçu qui contient le moteur. */
function watchEngine(page: Page): { loaded: () => boolean } {
  let loaded = false;
  page.on('response', async (response) => {
    if (!/\.m?js(\?|$)/.test(response.url())) {
      return;
    }
    try {
      if ((await response.text()).includes(ENGINE_MARKER)) {
        loaded = true;
      }
    } catch {
      // Réponse sans corps (redirection, requête abandonnée).
    }
  });
  return { loaded: () => loaded };
}

const physics = (page: Page) => host(page).getAttribute('data-aqfish-decor-physics');

test.describe('Pose par gravité (#170)', () => {
  test.use({ viewport: { width: 800, height: 500 } });
  test.beforeEach(() => {
    test.setTimeout(300_000);
  });

  test('moteur demandé à l’ouverture de l’éditeur seulement', async ({ page }) => {
    const engine = watchEngine(page);
    const errors = await openScene(page, '?seed=42');
    // Laisse le temps aux requêtes tardives : toujours aucun moteur.
    await page.waitForTimeout(2_000);
    expect(engine.loaded()).toBe(false);
    expect(await physics(page)).toBeNull();
    await startEditing(page);
    await expect(host(page)).toHaveAttribute('data-aqfish-decor-physics', 'pret', {
      timeout: 60_000,
    });
    await expect.poll(engine.loaded).toBe(true);
    // Sur le sable libre : posé au point du lâcher (ramené là où son emprise tient dans le
    // bac, #59), sans élévation.
    await clickTank(page, FREE_SAND);
    await expect(host(page)).toHaveAttribute(
      'data-aqfish-decor-count',
      String(DEFAULT_DECOR.length + 1),
    );
    const added = (await savedDecor(page)).at(-1)!;
    expect(added.elevation).toBeUndefined();
    const expected = clampDecorPosition(
      added as DecorItem,
      FREE_SAND[0],
      FREE_SAND[2],
      'tropical',
    )!;
    expect(added.x).toBeCloseTo(expected.x, 2);
    expect(added.z).toBeCloseTo(expected.z, 2);
    expect(Math.abs(added.z - FREE_SAND[2])).toBeLessThan(0.02);
    expect(errors).toEqual([]);
  });

  test('rocher lâché sur un autre : posé dessus ou à côté, sans le pénétrer', async ({ page }) => {
    const errors = await openScene(page, '?seed=42');
    await startEditing(page);
    await expect(host(page)).toHaveAttribute('data-aqfish-decor-physics', 'pret', {
      timeout: 60_000,
    });
    await page.getByRole('radio', { name: 'Sélection' }).click();
    // Le rocher 2 glissé jusqu'au rocher 3, puis lâché.
    const target = DEFAULT_DECOR[3];
    await dragTank(page, ROCK_2, [target.x, SAND_THICKNESS, target.z]);
    await expect
      .poll(async () => (await savedDecor(page))[2]?.x ?? DEFAULT_DECOR[2].x)
      .not.toBe(DEFAULT_DECOR[2].x);
    const decor = (await savedDecor(page)) as unknown as DecorItem[];
    expect(decor).toHaveLength(DEFAULT_DECOR.length);
    // Ni chevauchement nouveau, ni décor modifié ailleurs.
    expect(isDecorPoseAllowed(DEFAULT_DECOR, decor, 2)).toBe(true);
    decor.forEach((item, n) => {
      if (n !== 2) expect(item).toEqual(DEFAULT_DECOR[n]);
    });
    await expect(page.locator('[data-decor-hint]')).not.toContainText('refusée');
    expect(errors).toEqual([]);
  });

  test('moteur inaccessible : posé sur le sable, avec un message', async ({ page }) => {
    // Hors ligne pour le moteur seulement.
    await blockEngine(page);
    const errors = await openScene(page, '?seed=42');
    await startEditing(page);
    await expect(host(page)).toHaveAttribute('data-aqfish-decor-physics', 'indisponible', {
      timeout: 60_000,
    });
    await clickTank(page, FREE_SAND);
    await expect(host(page)).toHaveAttribute(
      'data-aqfish-decor-count',
      String(DEFAULT_DECOR.length + 1),
    );
    expect(await count(page)).toBe(String(DEFAULT_DECOR.length + 1));
    const added = (await savedDecor(page)).at(-1)!;
    expect(added.elevation).toBeUndefined();
    expect(added.x).toBeCloseTo(FREE_SAND[0], 2);
    await expect(page.locator('[data-decor-hint]')).toContainText('posé sur le sable');
    expect(errors).toEqual([]);
  });

  test('pose après chute : conservée au rechargement, simulation sans moteur', async ({ page }) => {
    const errors = await openScene(page);
    await startEditing(page);
    await expect(host(page)).toHaveAttribute('data-aqfish-decor-physics', 'pret', {
      timeout: 60_000,
    });
    await page.getByRole('radio', { name: 'Sélection' }).click();
    const target = DEFAULT_DECOR[3];
    await dragTank(page, ROCK_2, [target.x, SAND_THICKNESS, target.z]);
    await expect
      .poll(async () => (await savedDecor(page))[2]?.x ?? DEFAULT_DECOR[2].x)
      .not.toBe(DEFAULT_DECOR[2].x);
    const before = await savedDecor(page);
    // Hors édition, après rechargement : mêmes poses, aucun moteur demandé.
    const engine = watchEngine(page);
    await page.reload();
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    await page.waitForTimeout(2_000);
    expect(await savedDecor(page)).toEqual(before);
    expect(engine.loaded()).toBe(false);
    expect(await physics(page)).toBeNull();
    expect(errors).toEqual([]);
  });
});
