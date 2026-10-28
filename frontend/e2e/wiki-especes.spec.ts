import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * Wiki des espèces, lot 1/2 (issue #287) : ouvrir, chercher, ouvrir une fiche, ajouter une
 * espèce, fermer, à la souris puis au clavier, sans erreur console ; bouton « Wiki » libre et
 * sans chevauchement aux largeurs usuelles, police de la CI comprise (docs/PIEGES.md).
 * Paludarium : l'axolotl y est ajoutable (absent du bac par défaut, ADR 0065). Simulation à
 * l'arrêt dès t = 0 (`vitesse=0`).
 */

const toggle = (page: Page) => page.getByRole('button', { name: 'Wiki des espèces' });
const wiki = (page: Page) => page.locator('#wiki-especes');
const search = (page: Page) => wiki(page).getByRole('searchbox');
const list = (page: Page, part: 'present' | 'addable') =>
  wiki(page).locator(`[data-wiki-list="${part}"] [data-wiki-species]`);
const sheet = (page: Page) => wiki(page).locator('[data-wiki-sheet]');

async function open(page: Page, search = '?seed=42&vitesse=0&environnement=paludarium') {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  await page.goto(`/${search}`);
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  return errors;
}

async function ids(locator: Locator): Promise<(string | null)[]> {
  return locator.evaluateAll((els) => els.map((el) => el.getAttribute('data-wiki-species')));
}

test.describe('Wiki des espèces (#287)', () => {
  test('à la souris : ouvrir, chercher, fiche, ajouter, fermer', async ({ page }) => {
    const errors = await open(page);
    await expect(wiki(page)).toHaveCount(0);
    await toggle(page).click();
    await expect(wiki(page)).toBeVisible();
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
    // « Commandes », ouvert par défaut sur bureau, est replié.
    await expect(page.locator('#aide-commandes')).toHaveCount(0);
    expect(await ids(list(page, 'present'))).toEqual(['grenouille', 'triton']);
    expect(await ids(list(page, 'addable'))).toEqual(['axolotl']);

    await search(page).fill('AMBYSTOMA');
    expect(await ids(list(page, 'present'))).toEqual([]);
    expect(await ids(list(page, 'addable'))).toEqual(['axolotl']);
    await search(page).fill('requin');
    await expect(wiki(page).getByText('Aucune espèce')).toHaveCount(2);
    await search(page).fill('');

    await list(page, 'addable').first().click();
    await expect(sheet(page)).toHaveAttribute('data-wiki-sheet', 'axolotl');
    await expect(sheet(page).locator('[data-wiki-field]')).toHaveCount(11);
    await expect(sheet(page).locator('[data-wiki-status]')).toHaveCount(11);
    await sheet(page).getByRole('button', { name: 'Ajouter au bac' }).click();
    await expect(page.locator('app-aquarium-host')).toHaveAttribute(
      'data-aqfish-population',
      /(^|,)axolotl:1(,|$)/,
    );
    // Avertissements d'ajout (#237) : axolotl déconseillé avec les sonneurs et les tritons.
    await expect(
      sheet(page).locator('[data-wiki-add-warning]', { hasText: 'déconseillés avec' }),
    ).toHaveCount(2);

    await sheet(page).getByRole('button', { name: 'Retour à la liste' }).click();
    expect(await ids(list(page, 'present'))).toEqual(['axolotl', 'grenouille', 'triton']);
    expect(await ids(list(page, 'addable'))).toEqual([]);
    await wiki(page).getByRole('button', { name: 'Fermer', exact: true }).click();
    await expect(wiki(page)).toHaveCount(0);
    await expect(toggle(page)).toBeFocused();
    expect(errors).toEqual([]);
  });

  test('au clavier : Entrée ouvre, Tab cherche et choisit, Échap remonte puis ferme, focus hors du wiki compris', async ({
    page,
  }) => {
    const errors = await open(page);
    await toggle(page).focus();
    await page.keyboard.press('Enter');
    await expect(wiki(page)).toBeVisible();
    // Bouton « Fermer », puis le champ de recherche.
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(search(page)).toBeFocused();
    await page.keyboard.type('axolotl');
    await page.keyboard.press('Tab');
    await expect(list(page, 'addable').first()).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(sheet(page)).toHaveAttribute('data-wiki-sheet', 'axolotl');
    const add = sheet(page).getByRole('button', { name: 'Ajouter au bac' });
    await add.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('app-aquarium-host')).toHaveAttribute(
      'data-aqfish-population',
      /(^|,)axolotl:1(,|$)/,
    );
    // Échap dans la fiche : retour à la liste, focus sur l'espèce quittée.
    await page.keyboard.press('Escape');
    await expect(sheet(page)).toHaveCount(0);
    await expect(wiki(page).locator('[data-wiki-species="axolotl"]')).toBeFocused();
    // Échap dans la liste : wiki fermé, focus rendu au bouton.
    await page.keyboard.press('Escape');
    await expect(wiki(page)).toHaveCount(0);
    await expect(toggle(page)).toBeFocused();

    // #289 : après un clic sur la scène (focus hors du wiki), Échap ferme encore la fiche,
    // puis le wiki. Clic à gauche du bac, sur le fond de la pièce.
    await page.keyboard.press('Enter');
    await list(page, 'present').first().click();
    await expect(sheet(page)).toHaveCount(1);
    await page.mouse.click(120, 400);
    await expect(wiki(page)).toBeVisible();
    expect(await page.evaluate(() => document.activeElement?.closest('#wiki-especes'))).toBeNull();
    await page.keyboard.press('Escape');
    await expect(sheet(page)).toHaveCount(0);
    await page.mouse.click(120, 400);
    await page.keyboard.press('Escape');
    await expect(wiki(page)).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('ouvrir « Réglages » ferme le wiki, et inversement', async ({ page }) => {
    const errors = await open(page, '?seed=42&vitesse=0');
    await toggle(page).click();
    await expect(wiki(page)).toBeVisible();
    await page.getByRole('button', { name: 'Réglages' }).click();
    await expect(page.locator('.control-panel')).toBeVisible();
    await expect(wiki(page)).toHaveCount(0);
    await toggle(page).click();
    await expect(page.locator('.control-panel')).toHaveCount(0);
    await expect(wiki(page)).toBeVisible();
    expect(errors).toEqual([]);
  });

  // Le bouton « Wiki » change de place selon la largeur : il ne doit chevaucher aucun bouton
  // d'interface, ni la barre des vues, ni sortir de l'écran, avec la police de la CI aussi.
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 900, height: 700 },
    { width: 768, height: 1024 },
    { width: 640, height: 800 },
    { width: 390, height: 844 },
    { width: 320, height: 568 },
  ]) {
    test(`bouton « Wiki » libre à ${viewport.width} × ${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const errors = await open(page, '?seed=42&vitesse=0');
      for (const font of [null, 'DejaVu Sans']) {
        if (font !== null) {
          await page.addStyleTag({ content: `* { font-family: '${font}' !important; }` });
        }
        const problems = await toggle(page).evaluate((button) => {
          const r = button.getBoundingClientRect();
          const out: string[] = [];
          if (r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight) {
            out.push('hors de l’écran');
          }
          const others = document.querySelectorAll<HTMLElement>(
            '.control-panel__toggle, .commands-help__toggle, .view-presets-bar, app-day-indicator > *',
          );
          for (const other of others) {
            const o = other.getBoundingClientRect();
            if (r.left < o.right && o.left < r.right && r.top < o.bottom && o.top < r.bottom) {
              out.push(`chevauche ${other.className || other.tagName}`);
            }
          }
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          if (!hit || !button.contains(hit)) {
            out.push('recouvert');
          }
          return out;
        });
        expect(problems, `police ${font ?? 'par défaut'}`).toEqual([]);
      }
      expect(errors).toEqual([]);
    });
  }
});
