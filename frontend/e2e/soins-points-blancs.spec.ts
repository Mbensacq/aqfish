import { expect, test, type Page } from '@playwright/test';

import { createDayClock } from '../src/app/sim/daylight';
import { serializeWorld } from '../src/app/sim/save';
import {
  createDefaultWorld,
  createWorld,
  infectWorldInPlace,
  type MutableWorld,
} from '../src/app/sim/world';

/**
 * Soins des points blancs (issue #361, ADR 0091) : section « Soins » des réglages, gestes,
 * traitement en cours au tableau de bord, guérison, et message d'erreur d'un traitement
 * dangereux. Deux tests seulement, pour ne pas déplacer les limites des parts de la CI
 * (`docs/PIEGES.md`).
 *
 * Les bacs sont importés simulation à l'arrêt (vitesse 0) : rien ne bouge avant le geste. Un
 * traitement complet dure 5 journées simulées (100 min à vitesse 1) : pour voir la fin, la
 * sauvegarde automatique est relue après le geste, la cure avancée à 99,95 % (3 s simulées
 * restantes), puis la page rechargée et la simulation relancée.
 */

const hostEl = (page: Page) => page.locator('app-aquarium-host');
const status = (page: Page) => page.locator('[data-dashboard-status]');
const care = (page: Page) => page.locator('[data-section="soins"]');

async function open(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  return errors;
}

async function openPanel(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Réglages' }).click();
  await expect(page.locator('[data-section="eau"]')).toBeVisible();
}

/** Importe `world` simulation à l'arrêt, midi figé. */
async function importWorld(page: Page, world: MutableWorld): Promise<void> {
  const text = serializeWorld(world, { speed: 0, clock: createDayClock(12, 1200, true) });
  await page.locator('[data-section="sauvegarde"] input[type="file"]').setInputFiles({
    name: 'soins.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });
  await expect(hostEl(page)).toHaveAttribute('data-aqfish-speed', '0');
}

test.describe('Soins des points blancs (#361)', () => {
  test('provoquer la maladie, donner le médicament, voir l’alerte disparaître', async ({
    page,
  }) => {
    const errors = await open(page);
    await openPanel(page);
    // Sans malade, pas de section « Soins ».
    await expect(care(page)).toHaveCount(0);

    const world: MutableWorld = createDefaultWorld(42);
    infectWorldInPlace(world);
    await importWorld(page, world);
    await expect(status(page).locator('[data-alert="ich"]')).toHaveAttribute(
      'data-severity',
      'critique',
    );
    await expect(care(page)).toBeVisible();
    await expect(care(page).locator('[data-treatment-status]')).toHaveText(
      'Aucun traitement en cours.',
    );
    await expect(care(page).locator('[data-treatment-sources]')).toContainText('Merck');

    await care(page).getByRole('button', { name: 'Ajouter 1 dose de médicament' }).click();
    await expect(care(page).locator('[data-treatment-message]')).toContainText('Dose ajoutée');
    await expect(care(page).locator('[data-treatment-status]')).toContainText(
      'En cours : médicament 1,0 dose, encore 5,0 j',
    );
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-treatment', '5;2.3');
    await expect(status(page).locator('[data-alert="treatment"]')).toContainText(
      'Traitement en cours',
    );
    // Redoser aussitôt : surdosage refusé.
    await care(page).getByRole('button', { name: 'Ajouter 1 dose de médicament' }).click();
    await expect(care(page).locator('[data-treatment-message]')).toContainText('Surdosage');

    // Fin du traitement : cure avancée dans la sauvegarde, puis simulation relancée.
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    await page.evaluate(() => {
      const key = 'aqfish.sauvegarde';
      const doc = JSON.parse(localStorage.getItem(key)!) as {
        selectedTankId: number;
        settings: { speed: number };
        tanks: { id: number; world: { water: { ichCure?: number; medication?: number } } }[];
      };
      const water = doc.tanks.find((t) => t.id === doc.selectedTankId)!.world.water;
      if (water.medication !== 1 || water.ichCure !== 0) {
        throw new Error(`traitement non enregistré : ${JSON.stringify(water)}`);
      }
      water.ichCure = 0.9995;
      doc.settings.speed = 1;
      localStorage.setItem(key, JSON.stringify(doc));
    });
    await page.reload();
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    await expect(status(page).locator('[data-alert="ich"]')).toHaveCount(0, { timeout: 60_000 });
    await expect(status(page).locator('[data-alert="treatment"]')).toHaveCount(0, {
      timeout: 60_000,
    });
    await expect(hostEl(page)).not.toHaveAttribute('data-aqfish-treatment', /.*/);
    await expect(status(page).locator('[data-health="sick"]')).not.toHaveAttribute(
      'title',
      /points blancs/,
    );
    expect(errors).toEqual([]);
  });

  test('traitement dangereux : sel et médicament refusés avec un amphibien, message clair', async ({
    page,
  }) => {
    const errors = await open(page);
    await openPanel(page);
    // Bac revenu du mode décor avec un axolotl (mode soins écrit, ADR 0077).
    const world: MutableWorld = createWorld(42, [
      { species: 'neon', count: 4 },
      { species: 'axolotl', count: 1 },
    ]);
    world.careMode = 'soins';
    infectWorldInPlace(world);
    await importWorld(page, world);
    await expect(care(page)).toBeVisible();

    await care(page).getByRole('button', { name: 'Ajouter 1 g/L de sel' }).click();
    const message = care(page).locator('[data-treatment-message]');
    await expect(message).toContainText('Sel refusé : toxique pour les amphibiens');
    await expect(message).toContainText('axolotls');
    await expect(message).toContainText('Produits et traitements');
    await expect(message).toHaveClass(/control-panel__message--error/);

    await care(page).getByRole('button', { name: 'Ajouter 1 dose de médicament' }).click();
    await expect(message).toContainText('Médicament refusé : toxique pour les amphibiens');
    await expect(hostEl(page)).not.toHaveAttribute('data-aqfish-treatment', /.*/);

    // Chaleur plafonnée à la plage tolérée la plus basse : l'axolotl (eau froide) l'interdit ici.
    await care(page).getByRole('button', { name: 'Monter le chauffage de 1 °C' }).click();
    await expect(message).toContainText('Chaleur refusée');
    await expect(message).toContainText('axolotls : ');
    expect(errors).toEqual([]);
  });
});
