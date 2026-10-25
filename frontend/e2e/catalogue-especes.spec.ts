import { expect, test, type Page } from '@playwright/test';

/**
 * Catalogue d'espèces (issue #189) : dans le panneau, les espèces de l'environnement courant,
 * chacune avec un curseur d'effectif ; l'effectif réel du monde (`data-aqfish-population`,
 * compté sur les entités) suit le curseur, borné, et se conserve au rechargement
 * (sauvegarde automatique).
 */

const hostEl = (page: Page) => page.locator('app-aquarium-host');
const toggle = (page: Page) => page.getByRole('button', { name: 'Réglages' });
/** Curseur d'une espèce, désigné par la fin de son nom (« de néons », « d’axolotls »). */
const slider = (page: Page, ofPlural: string) =>
  page.getByRole('slider', { name: `Curseur du nombre ${ofPlural}` });
const rows = (page: Page) => page.locator('[data-section="population"] [data-species]');

async function open(page: Page, search = '?seed=42'): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`/${search}`);
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  return errors;
}

test.describe('Catalogue d’espèces (#189)', () => {
  test('curseur : l’effectif réel change, borné au maximum de l’espèce', async ({ page }) => {
    // Sans paramètre de monde dans l'URL : le rechargement relit la sauvegarde automatique.
    const errors = await open(page, '');
    await toggle(page).click();
    await expect(rows(page)).toHaveCount(3);
    await expect(hostEl(page)).toHaveAttribute(
      'data-aqfish-population',
      'neon:12,guppy:6,corydora:6',
    );

    // Plus de corydoras, moins de néons.
    await slider(page, 'de corydoras').fill('12');
    await expect(hostEl(page)).toHaveAttribute(
      'data-aqfish-population',
      'neon:12,guppy:6,corydora:12',
    );
    await slider(page, 'de néons').fill('4');
    await expect(hostEl(page)).toHaveAttribute(
      'data-aqfish-population',
      'neon:4,guppy:6,corydora:12',
    );
    // Le champ numérique suit le curseur.
    await expect(page.getByRole('spinbutton', { name: 'Nombre de néons' })).toHaveValue('4');

    // Aux flèches : un poisson de plus, puis au maximum de l'espèce (End).
    await slider(page, 'de corydoras').focus();
    await page.keyboard.press('ArrowRight');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-population', /corydora:13$/);
    await page.keyboard.press('End');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-population', /corydora:16$/);

    // À zéro : l'espèce disparaît du bac.
    await slider(page, 'de guppys').fill('0');
    await expect(hostEl(page)).toHaveAttribute(
      'data-aqfish-population',
      'neon:4,guppy:0,corydora:16',
    );

    // Rechargé : effectifs conservés par la sauvegarde automatique.
    await page.reload();
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    await expect(hostEl(page)).toHaveAttribute(
      'data-aqfish-population',
      'neon:4,guppy:0,corydora:16',
    );
    expect(errors).toEqual([]);
  });

  test('le catalogue suit l’environnement ; libellés accordés (une grenouille)', async ({
    page,
  }) => {
    const errors = await open(page, '?seed=42&environnement=paludarium');
    await toggle(page).click();
    await expect(rows(page)).toHaveCount(3);
    expect(
      await rows(page).evaluateAll((els) => els.map((el) => el.getAttribute('data-species'))),
    ).toEqual(['axolotl', 'grenouille', 'triton']);
    await page.getByRole('button', { name: 'Retirer une grenouille' }).click();
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-population', /grenouille:2/);
    await expect(slider(page, 'de grenouilles')).toHaveValue('2');
    await slider(page, 'd’axolotls').fill('4');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-population', /axolotl:4/);
    expect(errors).toEqual([]);
  });

  test('390 px : chaque curseur entier dans le panneau', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await open(page);
    await toggle(page).click();
    const panel = await page.locator('section.control-panel').boundingBox();
    expect(panel).not.toBeNull();
    for (const plural of ['néons', 'guppys', 'corydoras']) {
      const control = slider(page, `de ${plural}`);
      await control.scrollIntoViewIfNeeded();
      const b = await control.boundingBox();
      expect(b).not.toBeNull();
      expect(b!.x).toBeGreaterThanOrEqual(panel!.x);
      expect(b!.x + b!.width).toBeLessThanOrEqual(panel!.x + panel!.width);
      expect(b!.width).toBeGreaterThan(90);
      expect(b!.height).toBeGreaterThanOrEqual(28);
      // « − », curseur, champ et « + » sur une même ligne.
      const row = page
        .locator(`[data-section="population"] [data-species]`)
        .filter({ has: control });
      for (const other of await row.locator('button, input[type="number"]').all()) {
        const o = await other.boundingBox();
        expect(Math.abs(o!.y + o!.height / 2 - (b!.y + b!.height / 2))).toBeLessThan(4);
      }
    }
    expect(errors).toEqual([]);
  });
});
