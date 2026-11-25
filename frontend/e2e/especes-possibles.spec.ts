import { expect, test, type Page } from '@playwright/test';
import { ouvrirReglages } from './outils-panneau';

/**
 * Espèces encore possibles (issue #818, tranche 2 de #730) : la section « Population » liste,
 * pour le bac courant, chaque espèce du milieu avec son verdict face aux présentes, le nombre
 * que la capacité laisse et ses raisons sourcées ; la liste suit les effectifs.
 */

const hostEl = (page: Page) => page.locator('app-aquarium-host');
const section = (page: Page) => page.locator('[data-section="population"]');
const toggle = (page: Page) => section(page).locator('[data-possible-toggle]');
const item = (page: Page, id: string) => section(page).locator(`[data-possible-species="${id}"]`);

async function open(page: Page, search: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`/${search}`);
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  return errors;
}

// Bac tropical sans mangeur de crevettes : néons seuls.
const SANS_PREDATEUR = '?seed=42&population=neon:6,guppy:0,corydora:0,gourami:0,xipho:0';

test.describe('Espèces encore possibles (#818)', () => {
  test('la liste des espèces possibles suit l’ajout d’un prédateur', async ({ page }) => {
    const errors = await open(page, SANS_PREDATEUR);
    await ouvrirReglages(page, 'Population');
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(item(page, 'cerise')).toHaveAttribute('data-possible-level', 'compatible');

    // Un xipho ajouté : la crevette cerise passe en précautions, raison et source visibles.
    await section(page).getByRole('button', { name: 'Ajouter un xipho' }).click();
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-population', /xipho:1/);
    await expect(item(page, 'cerise')).toHaveAttribute('data-possible-level', 'precautions');
    await expect(item(page, 'cerise').locator('[data-possible-reason]')).toHaveText([
      'Avec les xiphos : xipho mange les jeunes (précautions) — FishKeeper',
    ]);

    // Liste triée : aucune espèce compatible après une espèce à précautions.
    const levels = await section(page)
      .locator('[data-possible-species]')
      .evaluateAll((items) => items.map((li) => li.getAttribute('data-possible-level')));
    const rank = (level: string | null) =>
      ['compatible', 'precautions', 'incompatible'].indexOf(level ?? '');
    expect(levels.map(rank)).toEqual([...levels.map(rank)].sort((a, b) => a - b));

    // Le xipho retiré : la crevette redevient compatible.
    await section(page).getByRole('button', { name: 'Retirer un xipho' }).click();
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-population', /xipho:0/);
    await expect(item(page, 'cerise')).toHaveAttribute('data-possible-level', 'compatible');
    expect(errors).toEqual([]);
  });

  test('crevettes présentes, xipho ajouté : raison sourcée sous la ligne du xipho', async ({
    page,
  }) => {
    const errors = await open(page, SANS_PREDATEUR.replace('neon:6', 'neon:6,cerise:6'));
    await ouvrirReglages(page, 'Population');
    await section(page).getByRole('button', { name: 'Ajouter un xipho' }).click();
    await expect(section(page).locator('[data-add-verdict]')).toHaveText([
      'Avec les crevettes cerises : xipho mange les jeunes (précautions) — FishKeeper',
    ]);
    expect(errors).toEqual([]);
  });

  test('téléphone (390 px) : liste ouverte lisible, sans défilement horizontal', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await open(page, '?seed=42&population=xipho:1');
    await ouvrirReglages(page, 'Population');
    await toggle(page).click();
    await expect(item(page, 'cerise')).toBeVisible();
    const overflow = await section(page).evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const box = await item(page, 'cerise').boundingBox();
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(390);
    // Marge droite (#820) : aucun résumé (« encore 30 ») à moins de 8 px du bord de la liste.
    const gaps = await section(page)
      .locator('[data-possible-list]')
      .evaluate((list) => {
        const right = list.getBoundingClientRect().right;
        return [...list.querySelectorAll('.possible__summary')].map((summary) => {
          const range = document.createRange();
          range.selectNodeContents(summary);
          return Math.min(...[...range.getClientRects()].map((r) => right - r.right));
        });
      });
    expect(gaps.length).toBeGreaterThan(0);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(8);
    expect(errors).toEqual([]);
  });
});
