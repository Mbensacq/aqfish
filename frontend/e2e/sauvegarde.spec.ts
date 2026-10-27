import { readFileSync } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';

import { createDayClock } from '../src/app/sim/daylight';
import { setPopulation } from '../src/app/sim/population';
import { SAVE_FORMAT, SAVE_SCHEMA, serializeWorld } from '../src/app/sim/save';
import { advance, createDefaultWorld } from '../src/app/sim/world';

/**
 * Sauvegarde (issue #70) : enregistrement automatique dans le navigateur et restauration au
 * rechargement, export et import d'un fichier JSON (refus d'un fichier invalide sans toucher
 * au bac), boutons utilisables au clavier et lisibles à 390 px.
 *
 * Les pages sont ouvertes sans `seed=` : un paramètre de monde dans l'URL désactive la
 * restauration (l'URL prime).
 */

const hostEl = (page: Page) => page.locator('app-aquarium-host');
const toggle = (page: Page) => page.getByRole('button', { name: 'Réglages' });
const exportButton = (page: Page) => page.getByRole('button', { name: 'Exporter' });
const importButton = (page: Page) => page.getByRole('button', { name: 'Importer' });
const fileInput = (page: Page) => page.locator('[data-section="sauvegarde"] input[type="file"]');
const message = (page: Page) => page.locator('[data-save-message]');

async function open(page: Page, search = ''): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`/${search}`);
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  return errors;
}

/** Fichier JSON en mémoire pour `setInputFiles`. */
function jsonFile(name: string, text: string) {
  return { name, mimeType: 'application/json', buffer: Buffer.from(text, 'utf8') };
}

async function tick(page: Page): Promise<number> {
  return Number(await hostEl(page).getAttribute('data-aqfish-tick'));
}

async function openPanel(page: Page): Promise<void> {
  await toggle(page).click();
  await expect(exportButton(page)).toBeVisible();
}

test.describe('Sauvegarde (#70)', () => {
  test('recharger la page conserve la population, le temps et la vitesse', async ({ page }) => {
    const errors = await open(page);
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-save', 'active');
    await openPanel(page);
    await page.getByRole('button', { name: 'Retirer un guppy' }).click();
    await page.getByRole('button', { name: 'Retirer un guppy' }).click();
    await page.getByRole('button', { name: 'Ajouter un néon' }).click();
    await expect(hostEl(page)).toHaveAttribute(
      'data-aqfish-population',
      'neon:13,guppy:4,corydora:6',
    );
    await page.getByRole('slider', { name: 'Vitesse de la simulation' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-speed', '2');
    await expect.poll(() => tick(page)).toBeGreaterThan(30);
    const before = await tick(page);

    // `pagehide` au rechargement : la sauvegarde est écrite avant de quitter.
    await page.reload();
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    await expect(hostEl(page)).toHaveAttribute(
      'data-aqfish-population',
      'neon:13,guppy:4,corydora:6',
    );
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-speed', '2');
    expect(await tick(page)).toBeGreaterThanOrEqual(before);
    const stored = await page.evaluate(() => localStorage.getItem('aqfish.sauvegarde'));
    expect(JSON.parse(stored!)).toMatchObject({ format: SAVE_FORMAT, schema: SAVE_SCHEMA });
    expect(errors).toEqual([]);
  });

  test('changer d’environnement puis revenir retrouve chaque bac, rechargement compris (#277)', async ({
    page,
  }) => {
    const errors = await open(page);
    const environment = page.getByRole('combobox', { name: 'Environnement' });
    const population = () => hostEl(page).getAttribute('data-aqfish-population');
    await openPanel(page);
    // Bac tropical modifié : un guppy de moins, un néon de plus.
    await page.getByRole('button', { name: 'Retirer un guppy' }).click();
    await page.getByRole('button', { name: 'Ajouter un néon' }).click();
    const tropical = 'neon:13,guppy:5,corydora:6';
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-population', tropical);
    await expect.poll(() => tick(page)).toBeGreaterThan(10);

    // Au bassin : monde de départ, modifié à son tour.
    await environment.selectOption('bassin');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-environment', 'bassin');
    await page.getByRole('button', { name: 'Ajouter un koï' }).click();
    const pond = await population();
    expect(pond).toMatch(/^koi:\d+$/);

    // Retour : le bac tropical tel qu'il a été laissé.
    await environment.selectOption('tropical');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-environment', 'tropical');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-population', tropical);

    // Rechargement : les deux environnements sont retrouvés.
    await page.reload();
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-environment', 'tropical');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-population', tropical);
    await openPanel(page);
    await environment.selectOption('bassin');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-population', pond!);
    expect(errors).toEqual([]);
  });

  // #101 : la sauvegarde est lue avant la création du monde ; `heure=` n'est pas un paramètre
  // de monde (la population est restaurée) mais fige l'heure (l'horloge sauvegardée est ignorée).
  test('`heure=` dans l’URL : population restaurée, heure figée à celle de l’URL', async ({
    page,
  }) => {
    const errors = await open(page);
    await openPanel(page);
    await page.getByRole('button', { name: 'Ajouter un néon' }).click();
    await expect(hostEl(page)).toHaveAttribute(
      'data-aqfish-population',
      'neon:13,guppy:6,corydora:6',
    );
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    await page.goto('/?heure=3');
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    await expect(hostEl(page)).toHaveAttribute(
      'data-aqfish-population',
      'neon:13,guppy:6,corydora:6',
    );
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-hour', '3.00');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-hour-frozen', 'true');
    expect(errors).toEqual([]);
  });

  test('un paramètre de monde dans l’URL prime sur la sauvegarde', async ({ page }) => {
    await open(page);
    await openPanel(page);
    await page.getByRole('button', { name: 'Ajouter un néon' }).click();
    await expect(hostEl(page)).toHaveAttribute(
      'data-aqfish-population',
      'neon:13,guppy:6,corydora:6',
    );
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    await page.goto('/?seed=42');
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    await expect(hostEl(page)).toHaveAttribute(
      'data-aqfish-population',
      'neon:12,guppy:6,corydora:6',
    );
  });

  test('exporter puis importer un fichier valide ; un fichier invalide est refusé sans altérer le bac', async ({
    page,
  }) => {
    const errors = await open(page);
    await openPanel(page);

    // Export : un fichier JSON au format versionné, au nom proposé.
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      exportButton(page).click(),
    ]);
    expect(download.suggestedFilename()).toBe('aqfish-sauvegarde.json');
    const exported = JSON.parse(readFileSync((await download.path())!, 'utf8'));
    expect(exported).toMatchObject({
      format: SAVE_FORMAT,
      schema: SAVE_SCHEMA,
      seed: 42,
      environment: 'tropical',
    });

    // Import valide : un bassin à 4 koïs, à 18 h figées.
    const pond = setPopulation(advance(createDefaultWorld(7, 'bassin'), 600), 'koi', 4);
    // Fichier passé en mémoire : `setInputFiles` avec un chemin contenant des accents
    // (dossier de sortie nommé d'après le titre du test) ne sélectionne aucun fichier.
    await fileInput(page).setInputFiles(
      jsonFile(
        'bassin.json',
        serializeWorld(pond, { speed: 1, clock: createDayClock(18, 1200, true) }),
      ),
    );
    await expect(message(page)).toHaveText('Aquarium importé.');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-environment', 'bassin');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-population', 'koi:4');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-hour', '18.00');

    // Import invalide : message d'erreur en alerte, bac inchangé.
    await fileInput(page).setInputFiles(
      jsonFile('invalide.json', JSON.stringify({ format: SAVE_FORMAT, schema: 99 })),
    );
    await expect(page.getByRole('alert')).toContainText('Import refusé');
    await expect(page.getByRole('alert')).toContainText('version de sauvegarde inconnue');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-environment', 'bassin');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-population', 'koi:4');
    expect(errors).toEqual([]);
  });

  // #171 : les dimensions du bac passent par le fichier JSON ; hors bornes elles sont bornées,
  // hors du bac tropical le fichier est refusé et le bac reste inchangé.
  test('import : dimensions bornées, refusées hors du bac tropical (#171)', async ({ page }) => {
    const errors = await open(page);
    await openPanel(page);
    const base = JSON.parse(serializeWorld(createDefaultWorld(42)));

    await fileInput(page).setInputFiles(
      jsonFile(
        'bac.json',
        JSON.stringify({ ...base, dimensions: { width: 9, height: 0.1, depth: 0.45 } }),
      ),
    );
    await expect(message(page)).toHaveText('Aquarium importé.');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-tank', '2:0.5:0.45');

    const pond = JSON.parse(serializeWorld(createDefaultWorld(7, 'bassin')));
    await fileInput(page).setInputFiles(
      jsonFile(
        'bassin.json',
        JSON.stringify({ ...pond, dimensions: { width: 1, height: 0.6, depth: 0.5 } }),
      ),
    );
    await expect(page.getByRole('alert')).toContainText('Import refusé');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-tank', '2:0.5:0.45');
    expect(errors).toEqual([]);
  });

  // #101 : à 1280 × 720 (capture `front-panneau`), les boutons étaient rognés au bas du
  // panneau et demandaient un défilement. Ils doivent tenir entiers sans défiler, et le
  // panneau rester au-dessus de la barre des préréglages (à 390 px aussi, avec défilement).
  for (const [width, height] of [
    [1280, 720],
    [390, 844],
  ] as const) {
    test(`${width} × ${height} : panneau au-dessus de la barre ; à 1280, boutons entiers sans défiler`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      const errors = await open(page, '?seed=42');
      await openPanel(page);
      const panel = page.locator('.control-panel');
      const panelBox = (await panel.boundingBox())!;
      const barBox = (await page.locator('.view-presets-bar').boundingBox())!;
      expect(panelBox.y + panelBox.height).toBeLessThanOrEqual(barBox.y);
      if (width === 1280) {
        expect(await panel.evaluate((el) => el.scrollTop)).toBe(0);
        for (const button of [exportButton(page), importButton(page)]) {
          const box = (await button.boundingBox())!;
          expect(box.y).toBeGreaterThanOrEqual(panelBox.y);
          expect(box.y + box.height).toBeLessThanOrEqual(panelBox.y + panelBox.height);
        }
      }
      expect(errors).toEqual([]);
    });
  }

  test('boutons atteignables au clavier et lisibles à 390 px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page);
    await openPanel(page);
    const panel = page.locator('.control-panel');
    await panel.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    for (const button of [exportButton(page), importButton(page)]) {
      await expect(button).toBeVisible();
      const box = (await button.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(390);
      // Libellé sur une seule ligne (hauteur d'un bouton à une ligne).
      expect(box.height).toBeLessThan(40);
      expect(await button.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    }
    // Clavier : Tab depuis « Exporter » atteint « Importer » ; Entrée ouvre le choix de fichier.
    await exportButton(page).focus();
    await page.keyboard.press('Tab');
    await expect(importButton(page)).toBeFocused();
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.keyboard.press('Enter'),
    ]);
    expect(chooser.isMultiple()).toBe(false);
  });

  test('mode capture : aucune sauvegarde lue ni écrite', async ({ page }) => {
    await open(page);
    await openPanel(page);
    await page.getByRole('button', { name: 'Ajouter un néon' }).click();
    await expect(hostEl(page)).toHaveAttribute(
      'data-aqfish-population',
      'neon:13,guppy:6,corydora:6',
    );
    // Quitter la page enregistre une dernière fois (`pagehide`), avant la page de capture.
    await page.goto('/?capture=1&camera=top');
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    const stored = await page.evaluate(() => localStorage.getItem('aqfish.sauvegarde'));
    expect(stored).toContain('"format":"aqfish"');
    await expect(hostEl(page)).toHaveAttribute(
      'data-aqfish-population',
      'neon:12,guppy:6,corydora:6',
    );
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-tick', '0');
    expect(await hostEl(page).getAttribute('data-aqfish-save')).toBeNull();
    await page.evaluate(() => {
      window.dispatchEvent(new Event('pagehide'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(await page.evaluate(() => localStorage.getItem('aqfish.sauvegarde'))).toBe(stored);
  });

  test('stockage corrompu : le bac démarre à neuf, sans erreur', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await page.evaluate(() =>
      localStorage.setItem('aqfish.sauvegarde', '{"format":"aqfish","sche'),
    );
    await page.reload();
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    await expect(hostEl(page)).toHaveAttribute(
      'data-aqfish-population',
      'neon:12,guppy:6,corydora:6',
    );
    expect(errors).toEqual([]);
  });

  test('fichiers hostiles : refusés avec un message, bac inchangé', async ({ page }) => {
    const errors = await open(page);
    await openPanel(page);
    const population = await hostEl(page).getAttribute('data-aqfish-population');
    const hostile = [
      jsonFile('vide.json', ''),
      jsonFile('texte.json', 'ceci n’est pas du JSON'),
      jsonFile('tableau.json', '[1,2,3]'),
      jsonFile('proto.json', '{"__proto__":{"polluted":true},"format":"aqfish","schema":1}'),
      jsonFile('infini.json', '{"format":"aqfish","schema":1,"seed":1e999}'),
      jsonFile(
        'gros.json',
        JSON.stringify({ format: SAVE_FORMAT, schema: 1, pad: 'x'.repeat(300_000) }),
      ),
      jsonFile('profond.json', '['.repeat(50_000) + ']'.repeat(50_000)),
    ];
    for (const file of hostile) {
      await fileInput(page).setInputFiles(file);
      await expect(page.getByRole('alert')).toContainText('Import refusé');
      await expect(hostEl(page)).toHaveAttribute('data-aqfish-population', population!);
    }
    expect(await page.evaluate(() => ({}).hasOwnProperty.call({}, 'polluted'))).toBe(false);
    expect(errors).toEqual([]);
  });
});
