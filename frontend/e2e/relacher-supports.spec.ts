import { expect, test, type Page } from '@playwright/test';

import { initDecorPhysics } from '../src/app/core/decor-physics/decor-physics';
import { DEFAULT_DECOR, type DecorItem } from '../src/app/sim/decor';
import { decorDropScene, settleDecorItem } from '../src/app/sim/decor-drop';
import { addDecorItem } from '../src/app/sim/decor-edit';
import { createDayClock } from '../src/app/sim/daylight';
import { saveData } from '../src/app/sim/save';
import { createDefaultWorld } from '../src/app/sim/world';
import {
  clickTank,
  FREE_SAND,
  host,
  openScene,
  ROCK_2,
  savedDecor,
  startEditing,
} from './outils-decor';

/**
 * Relâcher les éléments dont le support disparaît (issue #182) : un petit rocher posé (par le
 * même moteur, ici côté Node) sur le rocher 2 du décor par défaut est enregistré dans la
 * sauvegarde. Une modification ailleurs ne le fait pas bouger (pose identique à l'octet) ;
 * supprimer le rocher 2 le fait retomber sur le sable.
 */

/** Décor par défaut + un petit rocher posé sur le rocher 2 (élévation non nulle). */
async function stackedDecor(): Promise<DecorItem[]> {
  const dropper = await initDecorPhysics();
  const support = DEFAULT_DECOR[2];
  const added = addDecorItem(DEFAULT_DECOR, 'rock', support.x, support.z, 7, 'tropical');
  if (!added) throw new Error('ajout attendu');
  const index = added.length - 1;
  const small = added.map((item, n) => (n === index ? { ...item, scale: 0.6 } : item));
  const scene = decorDropScene(small, index, 'tropical');
  if (!scene) throw new Error('scène attendue');
  const settled = settleDecorItem(small, index, dropper.drop(scene).rest, 'tropical');
  if (!settled || (settled[index].elevation ?? 0) < 0.01) throw new Error('empilement attendu');
  return settled;
}

/** Ouvre la scène sur une sauvegarde dont le décor est `decor`. */
async function openWithDecor(page: Page, decor: readonly DecorItem[]): Promise<string[]> {
  const data = saveData(createDefaultWorld(42), {
    speed: 1,
    clock: createDayClock(12, 1200, false),
    foodStyle: 'points',
  });
  const text = JSON.stringify({ ...data, decor });
  await page.addInitScript((saved) => {
    // Une seule fois : les écritures de l'éditeur ne sont pas écrasées par un rechargement.
    if (!window.sessionStorage.getItem('aqfish.e2e.seeded')) {
      window.sessionStorage.setItem('aqfish.e2e.seeded', '1');
      window.localStorage.setItem('aqfish.sauvegarde', saved);
    }
  }, text);
  return openScene(page);
}

test.describe('Relâcher les éléments dont le support disparaît (#182)', () => {
  test.use({ viewport: { width: 800, height: 500 } });
  test.beforeEach(() => {
    test.setTimeout(300_000);
  });

  test('soutenu : ne bouge pas ; support supprimé : retombe sur le sable', async ({ page }) => {
    const decor = await stackedDecor();
    const top = decor.length - 1;
    const errors = await openWithDecor(page, decor);
    await expect(host(page)).toHaveAttribute('data-aqfish-decor-count', String(decor.length));
    await startEditing(page);
    await expect(host(page)).toHaveAttribute('data-aqfish-decor-physics', 'pret', {
      timeout: 60_000,
    });
    // Un rocher ajouté ailleurs : le rocher porté garde sa pose à l'octet.
    await clickTank(page, FREE_SAND);
    await expect(host(page)).toHaveAttribute('data-aqfish-decor-count', String(decor.length + 1));
    const afterAdd = await savedDecor(page);
    expect(JSON.stringify(afterAdd[top])).toBe(JSON.stringify(decor[top]));
    // Le rocher 2 (le support) sélectionné puis supprimé.
    await page.getByRole('radio', { name: 'Sélection' }).click();
    await clickTank(page, ROCK_2);
    await expect(host(page)).toHaveAttribute('data-aqfish-decor-selected', '2');
    await page.keyboard.press('Delete');
    await expect(host(page)).toHaveAttribute('data-aqfish-decor-count', String(decor.length));
    const after = await savedDecor(page);
    // Indices décalés d'un cran après la suppression de l'élément 2.
    const fallen = after[top - 1];
    expect(fallen.seed).toBe(decor[top].seed);
    expect(fallen.elevation).toBeUndefined();
    after.forEach((item, n) => {
      if (n !== top - 1 && n < top) expect(item).toEqual(n < 2 ? decor[n] : decor[n + 1]);
    });
    await expect(page.locator('[data-decor-hint]')).not.toContainText('refusée');
    expect(errors).toEqual([]);
  });
});
