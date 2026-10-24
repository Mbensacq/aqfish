import { expect, test } from '@playwright/test';

import { SAVE_STORAGE_KEY } from '../src/app/core/save-storage/save-storage';
import { DEFAULT_DECOR, type DecorItem } from '../src/app/sim/decor';
import { clampDecorPosition } from '../src/app/sim/decor-edit';
import { DEFAULT_TANK, SAND_THICKNESS } from '../src/app/sim/tank';
import {
  blockEngine,
  host,
  openScene,
  startEditing,
  clickTank,
  FREE_SAND,
  FREE_SAND_2,
  OUTSIDE,
  ROCK_2,
  count,
  savedDecor,
  dragTank,
  touchDragTank,
} from './outils-decor';

/**
 * Éditeur de décor (issue #167) : « Réglages » → « Éditer le décor » ouvre le mode édition ;
 * un clic sur le sable pose l'élément choisi, un clic hors du bac n'ajoute rien, un clic sur
 * un élément le sélectionne, un clic ailleurs désélectionne, Suppr le retire ; le décor édité
 * survit au rechargement (sauvegarde locale). L'état est lu sur les attributs de l'hôte
 * (`data-aqfish-decor-count`, `data-aqfish-decor-selected`, `data-aqfish-editing`).
 */

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
    const decor = (JSON.parse(text!) as { decor: DecorItem[] }).decor;
    // Le rocher d'indice 2 a disparu, le rocher posé est le dernier élément.
    expect(decor.map((i) => i.kind)).toEqual([
      ...DEFAULT_DECOR.filter((_, n) => n !== 2).map((i) => i.kind),
      'rock',
    ]);
    // Posé au point cliqué, ramené là où son emprise tient dans le bac (#59).
    const expected = clampDecorPosition(decor.at(-1)!, FREE_SAND[0], FREE_SAND[2], 'tropical')!;
    expect(decor.at(-1)!.x).toBeCloseTo(expected.x, 6);
    expect(decor.at(-1)!.z).toBeCloseTo(expected.z, 6);
    expect(Math.abs(decor.at(-1)!.z - FREE_SAND[2])).toBeLessThan(0.02);
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

    test('sans moteur de chute, lâcher un rocher sur un autre : refusé, il revient à sa place', async ({
      page,
    }) => {
      // Avec le moteur (#170), le rocher lâché se pose sur l'autre ou à côté
      // (`pose-gravite.spec.ts`) ; sans lui, il est posé sur le sable, où il le pénétrerait.
      await blockEngine(page);
      const errors = await openScene(page);
      await startEditing(page);
      await expect(host(page)).toHaveAttribute('data-aqfish-decor-physics', 'indisponible', {
        timeout: 60_000,
      });
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
