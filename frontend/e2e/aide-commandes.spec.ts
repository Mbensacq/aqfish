import { expect, test, type Locator, type Page } from '@playwright/test';

import { GESTURE_COMMANDS, KEY_COMMANDS } from '../src/app/core/commands/commands';

/**
 * Aide-mémoire des commandes (issue #74) : généré depuis `core/commands`, repliable par `?`,
 * état conservé au rechargement, absent en mode capture, lisible à 390 × 844.
 */

async function openScene(page: Page, search = ''): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`/${search}`);
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  return errors;
}

const panel = (page: Page): Locator => page.locator('#aide-commandes');

test('liste toutes les touches et tous les gestes déclarés, ouvert par défaut', async ({
  page,
}) => {
  const errors = await openScene(page);
  await expect(panel(page)).toBeVisible();
  for (const command of KEY_COMMANDS) {
    const row = panel(page).locator(`[data-command="${command.id}"]`);
    await expect(row.locator('kbd')).toHaveText(command.display);
    await expect(row.locator('dd')).toHaveText(command.description);
  }
  for (const gesture of GESTURE_COMMANDS) {
    await expect(panel(page).locator(`[data-command="${gesture.id}"] dt`)).toHaveText(
      gesture.gesture,
    );
  }
  expect(errors).toEqual([]);
});

test('? replie puis déplie ; l’état replié est conservé au rechargement', async ({ page }) => {
  await openScene(page);
  await expect(panel(page)).toBeVisible();

  await page.keyboard.press('?');
  await expect(panel(page)).toHaveCount(0);
  const folded = page.getByRole('button', { name: /Afficher l’aide-mémoire des commandes/ });
  await expect(folded).toBeVisible();
  await expect(folded).toHaveAttribute('aria-expanded', 'false');

  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  await expect(panel(page)).toHaveCount(0);
  await expect(folded).toBeVisible();

  // Déplier au clic, puis replier au bouton du panneau.
  await folded.click();
  await expect(panel(page)).toBeVisible();
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  await expect(panel(page)).toBeVisible();
  await page.getByRole('button', { name: /Replier l’aide-mémoire/ }).click();
  await expect(panel(page)).toHaveCount(0);
});

test('les raccourcis restent actifs, aide-mémoire ouvert ou replié', async ({ page }) => {
  await openScene(page);
  const host = page.locator('app-aquarium-host');
  await page.keyboard.press('p');
  await expect(host).toHaveAttribute('data-aqfish-filter', 'aucun');
  await page.keyboard.press('?');
  await expect(panel(page)).toHaveCount(0);
  await page.keyboard.press('p');
  await expect(host).toHaveAttribute('data-aqfish-filter', 'pixel');
});

test('mode capture : aucun aide-mémoire, ? sans effet', async ({ page }) => {
  await openScene(page, '?capture=1&seed=42&camera=three-quarter&time=2');
  await expect(page.locator('app-commands-help')).toHaveCount(0);
  await page.keyboard.press('?');
  await expect(page.locator('app-commands-help')).toHaveCount(0);
});

test.describe('petit écran (390 × 844)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('replié par défaut : une pastille en haut à droite, qui déplie', async ({ page }) => {
    await openScene(page);
    await expect(panel(page)).toHaveCount(0);
    const folded = page.getByRole('button', { name: /Afficher l’aide-mémoire des commandes/ });
    const box = (await folded.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(box.y).toBeLessThan(60);
    expect(box.width).toBeLessThan(160);
    await folded.click();
    await expect(panel(page)).toBeVisible();
  });

  test('déplié : entier dans la fenêtre, lisible, sans recouvrir la barre des préréglages', async ({
    page,
  }) => {
    const errors = await openScene(page);
    await page.keyboard.press('?');
    await expect(panel(page)).toBeVisible();
    const box = (await panel(page).boundingBox())!;
    const bar = (await page.locator('.view-presets-bar').boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(box.y + box.height).toBeLessThanOrEqual(bar.y);

    // Lisible : texte d'au moins 11 px, pas de débordement horizontal, et la dernière
    // ligne atteignable (par défilement vertical si besoin).
    expect(await panel(page).evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    const sizes = await panel(page)
      .locator('dd, dt, h3')
      .evaluateAll((els) => els.map((el) => parseFloat(getComputedStyle(el).fontSize)));
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(11);
    const last = panel(page).locator('[data-command="aide"] dd');
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeInViewport();
    expect(errors).toEqual([]);
  });
});
