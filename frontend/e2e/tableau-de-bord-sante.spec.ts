import { expect, test, type Page } from '@playwright/test';

import { createDayClock } from '../src/app/sim/daylight';
import { serializeWorld } from '../src/app/sim/save';
import { freshWater } from '../src/app/sim/water';
import { createDefaultWorld, starveWorldInPlace, type MutableWorld } from '../src/app/sim/world';

/**
 * Tableau de bord, lot 2 (issue #260, ADR 0060) : simulation dans le cadre haut, santé des
 * animaux et alertes (cause et action) dans le bandeau bas, jamais au centre du bac. Fichier
 * séparé de `tableau-de-bord.spec.ts` pour que les parts de la CI restent équilibrées.
 *
 * Pages ouvertes avec `vitesse=0` : le monde reste à t = 0, les valeurs ne bougent pas.
 */

const VIEWPORTS = [
  { width: 1280, height: 720 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
] as const;

const dashboard = (page: Page) => page.locator('[data-dashboard]');
const status = (page: Page) => page.locator('[data-dashboard-status]');

async function open(page: Page, search = '?seed=42&vitesse=0'): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`/${search}`);
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  await expect(dashboard(page)).toBeVisible();
  return errors;
}

/**
 * Importe un bac à l'eau mauvaise (ammoniaque 6, nitrites 2,5, nitrates 50) aux animaux
 * affamés de longue date : cinq alertes (#260), dont trois affichées.
 */
async function importAlerts(page: Page, speed = 0): Promise<void> {
  const world: MutableWorld = createDefaultWorld(42);
  world.water = { ...freshWater('tropical'), ammonia: 6, nitrite: 2.5, nitrate: 50 };
  starveWorldInPlace(world);
  const text = serializeWorld(world, { speed, clock: createDayClock(12, 1200, true) });
  const settings = page.getByRole('button', { name: 'Réglages' });
  await settings.click();
  await page.locator('[data-section="sauvegarde"] input[type="file"]').setInputFiles({
    name: 'alertes.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });
  await expect(status(page).locator('[data-alert]')).toHaveCount(3);
  await settings.click();
  await expect(page.locator('.control-panel')).toHaveCount(0);
}

/** Boîtes de tous les éléments visibles du tableau de bord (cadre haut et bandeau bas). */
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

    test('santé, simulation et trois alertes visibles en texte et icône, centre du bac dégagé', async ({
      page,
    }) => {
      // Import d'un bac : plus long que les autres tests en rendu logiciel.
      test.setTimeout(240_000);
      const errors = await open(page);
      // Simulation : moment de la journée, heure, vitesse.
      const sim = dashboard(page).locator('[data-dashboard-sim]');
      await expect(sim).toBeInViewport({ ratio: 1 });
      await expect(sim).toContainText('Jour');
      await expect(sim.locator('[data-dashboard-hour]')).toHaveText('12:00');
      await expect(sim.locator('[data-dashboard-speed]')).toContainText('Pause');
      await expect(sim.locator('svg rect').first()).toBeAttached();
      // Santé : quatre lignes, chacune avec son icône.
      const items = status(page).locator('[data-health]');
      await expect(items).toHaveCount(4);
      for (let i = 0; i < 4; i++) {
        await expect(items.nth(i)).toBeInViewport({ ratio: 1 });
        await expect(items.nth(i).locator('svg rect').first()).toBeAttached();
      }
      await expect(status(page).locator('[data-health-value="health"]')).toHaveText('100 %');
      await expect(status(page).locator('[data-health-value="sick"]')).toHaveText('0');
      await expect(status(page).locator('[data-alert-none]')).toContainText('Aucune alerte');

      await importAlerts(page);
      await expect(status(page).locator('[data-health-value="health"]')).toHaveText('20 %');
      await expect(status(page).locator('[data-health-value="distressed"]')).toHaveText('24');
      const chips = status(page).locator('[data-alert] button');
      await expect(chips).toHaveCount(3);
      for (let i = 0; i < 3; i++) {
        await expect(chips.nth(i)).toBeInViewport({ ratio: 1 });
        await expect(chips.nth(i)).toContainText('Critique');
        await expect(chips.nth(i).locator('svg rect').first()).toBeAttached();
      }
      await expect(chips.first()).toContainText('Ammoniaque trop haute');
      await expect(status(page).locator('[data-alerts-more]')).toContainText('+2');
      // Centre du bac (60 % × 60 % de la zone de rendu) dégagé, même avec trois alertes.
      const canvas = await page.locator('app-aquarium-host canvas').boundingBox();
      const { x, y, width, height } = canvas!;
      const center = {
        left: x + 0.2 * width,
        right: x + 0.8 * width,
        top: y + 0.2 * height,
        bottom: y + 0.8 * height,
      };
      const boxes = await frameBoxes(page);
      expect(boxes.length).toBeGreaterThan(20);
      const intruders = boxes.filter(
        (b) =>
          b.left < center.right &&
          center.left < b.right &&
          b.top < center.bottom &&
          center.top < b.bottom,
      );
      expect(intruders, 'éléments du tableau de bord dans le rectangle central').toEqual([]);
      // Rien ne déborde de la fenêtre, ni ne recouvre la barre des vues.
      const presets = await page.locator('app-view-presets-bar .view-presets-bar').boundingBox();
      for (const box of boxes) {
        expect(box.left).toBeGreaterThanOrEqual(0);
        expect(box.right).toBeLessThanOrEqual(viewport.width);
        expect(box.bottom).toBeLessThanOrEqual(presets!.y);
      }
      expect(errors).toEqual([]);
    });
  });
}

test('alertes : dépliées au clavier sur cause et action, annoncées sans répétition (#260)', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  const errors = await open(page);
  const announcement = status(page).locator('[role="status"]');
  await expect(announcement).toHaveText('Aucune alerte.');
  // Simulation en marche (vitesse 1) : relevés deux fois par seconde (tous les 30 pas).
  await importAlerts(page, 1);
  await expect(announcement).toHaveText(
    /^5 alertes : Ammoniaque trop haute \(critique\), Animaux affamés \(critique\)/,
  );
  // Aucune nouvelle annonce pendant 2 s de relevés tant que les alertes ne changent pas.
  const changes = await announcement.evaluate(
    (el) =>
      new Promise<number>((done) => {
        let count = 0;
        const observer = new MutationObserver((records) => (count += records.length));
        observer.observe(el, { childList: true, characterData: true, subtree: true });
        setTimeout(() => {
          observer.disconnect();
          done(count);
        }, 2000);
      }),
  );
  await expect(page.locator('app-aquarium-host')).not.toHaveAttribute('data-aqfish-tick', '0');
  expect(changes).toBe(0);

  const chip = status(page).locator('[data-alert="ammonia"] button');
  await chip.focus();
  await expect(chip).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Enter');
  await expect(chip).toHaveAttribute('aria-expanded', 'true');
  const detail = page.locator(`#${await chip.getAttribute('aria-controls')}`);
  await expect(detail).toBeVisible();
  await expect(detail).toContainText('Cause probable : déchets des animaux');
  await expect(detail).toContainText('À faire : Changer l’eau');
  // Le suivant au clavier, puis repli à la barre d'espace.
  await page.keyboard.press('Tab');
  const next = status(page).locator('[data-alert="hunger"] button');
  await expect(next).toBeFocused();
  await page.keyboard.press('Space');
  await expect(next).toHaveAttribute('aria-expanded', 'true');
  await expect(chip).toHaveAttribute('aria-expanded', 'false');
  await expect(status(page).locator('[data-alert-detail]')).toContainText('Nourrir');
  await page.keyboard.press('Space');
  await expect(next).toHaveAttribute('aria-expanded', 'false');
  await expect(status(page).locator('[data-alert-detail]')).toHaveCount(0);
  expect(errors).toEqual([]);
});
