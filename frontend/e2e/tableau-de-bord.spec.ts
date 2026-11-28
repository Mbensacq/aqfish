import { expect, test, type Locator, type Page } from '@playwright/test';

import { createDayClock } from '../src/app/sim/daylight';
import { serializeWorld } from '../src/app/sim/save';
import { sampleWater } from '../src/app/sim/water-quality';
import { createDefaultWorld } from '../src/app/sim/world';
import type { MutableWorld } from '../src/app/sim/world-types';
import { fermerReglages, ouvrirReglages } from './outils-panneau';

/**
 * Tableau de bord de l'eau (issue #256, ADR 0059) : cadre sur le bord haut, jauges toujours
 * visibles, jamais au centre du bac, repliable à la souris et au clavier.
 *
 * Pages ouvertes avec `vitesse=0` : le monde reste à t = 0, les valeurs ne bougent pas
 * pendant le test (`docs/PIEGES.md`, « Capture d'interface non reproductible »).
 */

const VIEWPORTS = [
  { width: 1280, height: 720 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
] as const;

const dashboard = (page: Page) => page.locator('[data-dashboard]');
const toggle = (page: Page) => dashboard(page).locator('.dashboard__toggle');

async function open(page: Page, search = '?seed=42&vitesse=0'): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`/${search}`);
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  await expect(dashboard(page)).toBeVisible();
  return errors;
}

/** Boîtes de tous les éléments visibles du tableau de bord (cadre haut et bandeau bas, #260). */
async function frameBoxes(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('app-dashboard-frame, app-dashboard-status')].flatMap((root) =>
      [root, ...root.querySelectorAll('*')].flatMap((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0
          ? [{ left: r.left, top: r.top, right: r.right, bottom: r.bottom }]
          : [];
      }),
    ),
  );
}

for (const viewport of VIEWPORTS) {
  test.describe(`${viewport.width} × ${viewport.height}`, () => {
    test.use({ viewport });

    test('jauges visibles en continu : étiquette, unité, valeur, niveau en texte et icône, tendance', async ({
      page,
    }) => {
      const errors = await open(page);
      const meters = dashboard(page).getByRole('meter');
      await expect(meters).toHaveCount(5);
      const names = [
        'Température',
        'Ammoniaque (NH₃/NH₄⁺)',
        'Nitrites (NO₂⁻)',
        'Nitrates (NO₃⁻)',
        'pH',
      ];
      for (const [index, name] of names.entries()) {
        const meter = meters.nth(index);
        await expect(meter).toHaveAttribute('aria-label', name);
        await expect(meter).toHaveAttribute('aria-valuetext', /, (bon|idéal), stable$/);
        await expect(meter).toBeInViewport({ ratio: 1 });
      }
      const temperature = dashboard(page).locator('[data-gauge="temperature"]');
      await expect(temperature).toContainText('Temp.');
      await expect(temperature).toContainText('24,0');
      await expect(temperature).toContainText('°C');
      await expect(temperature.locator('[data-level-label]')).toHaveText('Bon');
      await expect(temperature.locator('[data-level-label] svg rect').first()).toBeAttached();
      await expect(temperature.locator('[data-trend-arrow]')).toHaveText('→');
      // Rien ne déborde de la fenêtre.
      for (const box of await frameBoxes(page)) {
        expect(box.left).toBeGreaterThanOrEqual(0);
        expect(box.right).toBeLessThanOrEqual(viewport.width);
        expect(box.top).toBeGreaterThanOrEqual(0);
      }
      // Bouton « Commandes » et bascule des « Réglages » jamais recouverts par le cadre.
      for (const name of ['Réglages', 'Commandes', 'Replier']) {
        const button = page.locator('.control-panel__toggle, .commands-help__toggle').filter({
          hasText: name,
        });
        if ((await button.count()) === 0) {
          continue;
        }
        const covered = await button.first().evaluate((el) => {
          const r = el.getBoundingClientRect();
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return !hit || !el.contains(hit);
        });
        expect(covered, `« ${name} » recouvert`).toBe(false);
      }
      expect(errors).toEqual([]);
    });

    test('le cadre ne recouvre pas le centre du bac (60 % × 60 % de la zone de rendu)', async ({
      page,
    }) => {
      const errors = await open(page);
      const canvas = await page.locator('app-aquarium-host canvas').boundingBox();
      expect(canvas).not.toBeNull();
      const { x, y, width, height } = canvas!;
      const center = {
        left: x + 0.2 * width,
        right: x + 0.8 * width,
        top: y + 0.2 * height,
        bottom: y + 0.8 * height,
      };
      const boxes = await frameBoxes(page);
      expect(boxes.length).toBeGreaterThan(10);
      const intruders = boxes.filter(
        (b) =>
          b.left < center.right &&
          center.left < b.right &&
          b.top < center.bottom &&
          center.top < b.bottom,
      );
      expect(intruders, 'éléments du cadre dans le rectangle central').toEqual([]);
      expect(errors).toEqual([]);
    });
  });
}

test('se replie et se déplie au clavier ; plein hors survol et focus (charte #721)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const errors = await open(page);
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(toggle(page)).toHaveAccessibleName('Eau : bonne. Replier les jauges');
  const controls = await toggle(page).getAttribute('aria-controls');
  await expect(page.locator(`#${controls}`)).toBeVisible();
  // Au repos (la souris est hors du cadre), plein comme tous les panneaux de la charte.
  await page.mouse.move(640, 400);
  await expect
    .poll(() => dashboard(page).evaluate((el) => Number(getComputedStyle(el).opacity)))
    .toBe(1);

  await toggle(page).focus();
  await expect
    .poll(() => dashboard(page).evaluate((el) => Number(getComputedStyle(el).opacity)))
    .toBe(1);
  await page.keyboard.press('Enter');
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(dashboard(page).getByRole('meter')).toHaveCount(0);
  // Replié, l'indicateur global reste lisible.
  await expect(toggle(page)).toContainText('Bonne');
  await page.keyboard.press('Space');
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(dashboard(page).getByRole('meter')).toHaveCount(5);
  expect(errors).toEqual([]);
});

test('se replie à la souris ; une eau mauvaise est signalée en texte et en icône', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = await open(page, '?vitesse=0');
  // Eau mauvaise importée (nitrates à 50), simulation à l'arrêt.
  const world: MutableWorld = createDefaultWorld(42);
  world.water = sampleWater('tropical', 'mauvaise');
  const text = serializeWorld(world, { speed: 0, clock: createDayClock(12, 1200, true) });
  await ouvrirReglages(page, 'Sauvegarde et partage');
  await page
    .locator('[data-section="sauvegarde"] input[type="file"]')
    .setInputFiles({ name: 'eau.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  await fermerReglages(page);
  const nitrate = dashboard(page).locator('[data-gauge="nitrate"]');
  await expect(nitrate).toHaveAttribute('data-level', 'rouge');
  await expect(nitrate.locator('[data-level-label]')).toHaveText('Critique');
  await expect(nitrate.locator('[data-gauge-value]')).toHaveText('50,0');
  await expect(toggle(page)).toHaveAttribute('data-water-quality', 'mauvaise');
  await expect(toggle(page)).toContainText('Mauvaise');

  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(nitrate).toHaveCount(0);
  await toggle(page).click();
  await expect(nitrate).toBeVisible();
  expect(errors).toEqual([]);
});

/**
 * Bandeau du haut entre 768 et 1439 px (#881) : à 1100 × 720, aide-mémoire déplié, l'heure et
 * la vitesse recouvraient la valeur et la jauge du pH. La simulation passe désormais sous les
 * jauges quand la place manque : les boîtes du pH et de la simulation ne se chevauchent à
 * aucune largeur, aide-mémoire déplié ou replié, et la simulation reste dans le cadre. Sur
 * tablette (640 à 1099 px), l'aide-mémoire déplié descend sous le cadre passé sur deux lignes.
 *
 * Un seul test (la page est chargée une fois) : la scène est à l'arrêt (`vitesse=0`) et la
 * largeur change par `setViewportSize`. Placé dans ce fichier plutôt que dans un nouveau :
 * `durees.json` est au plafond de 30 min par part et tout nouveau fichier le dépasse (#632).
 */

const WIDTHS = [700, 768, 1024, 1100, 1180, 1280, 1439] as const;

interface Rect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

async function rect(locator: Locator): Promise<Rect> {
  return locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  });
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/** Déplie ou replie l'aide-mémoire « Commandes » selon `open`. */
async function setCommandsHelp(page: Page, open: boolean): Promise<void> {
  const name = open ? /Afficher l’aide-mémoire des commandes/ : /Replier l’aide-mémoire/;
  const toggle = page.getByRole('button', { name });
  if (await toggle.isVisible()) {
    await toggle.click();
  }
  await expect(page.locator('#aide-commandes')).toBeVisible({ visible: open });
}

async function checkWidth(page: Page, width: number, helpOpen: boolean): Promise<void> {
  await page.setViewportSize({ width, height: 720 });
  await setCommandsHelp(page, helpOpen);
  const frame = page.locator('[data-dashboard]');
  const ph = frame.locator('[data-gauge="ph"]');
  const sim = frame.locator('[data-dashboard-sim]');
  await expect(ph).toBeVisible();
  await expect(sim).toBeVisible();
  const [phBox, simBox, frameBox] = [await rect(ph), await rect(sim), await rect(frame)];
  const where = `${width} px, aide-mémoire ${helpOpen ? 'déplié' : 'replié'}`;
  expect(overlaps(phBox, simBox), `pH et simulation se chevauchent (${where})`).toBe(false);
  // Chaque enfant de la simulation (heure, vitesse) reste dans le cadre.
  for (const part of await sim.locator(':scope > *').all()) {
    const box = await rect(part);
    expect(box.left, `simulation hors du cadre (${where})`).toBeGreaterThanOrEqual(frameBox.left);
    expect(box.right, `simulation hors du cadre (${where})`).toBeLessThanOrEqual(frameBox.right);
    expect(overlaps(phBox, box), `pH sous la simulation (${where})`).toBe(false);
  }
  if (helpOpen && width < 1100) {
    const help = await rect(page.locator('app-commands-help'));
    expect(help.top, `aide-mémoire sur le cadre (${where})`).toBeGreaterThanOrEqual(
      frameBox.bottom,
    );
  }
}

test('pH et heure du bandeau du haut sans chevauchement de 768 à 1439 px (#881)', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1100, height: 720 });
  await page.goto('/?seed=42&vitesse=0');
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  for (const helpOpen of [true, false]) {
    for (const width of WIDTHS) {
      await test.step(`${width} px, aide-mémoire ${helpOpen ? 'déplié' : 'replié'}`, () =>
        checkWidth(page, width, helpOpen));
    }
  }
  expect(errors).toEqual([]);
});
