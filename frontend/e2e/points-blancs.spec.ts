import { expect, test, type Page } from '@playwright/test';

/**
 * Points blancs visibles (issue #366, ADR 0089) : le paramètre `points-blancs=1` rend les
 * poissons malades à t = 0 ; le tableau de bord le signale par une alerte qui renvoie à la
 * page « Maladies » du wiki. Les vérifications sont regroupées en peu de tests pour ne pas
 * déplacer les limites des parts de la CI (`docs/PIEGES.md`).
 *
 * Pages ouvertes avec `vitesse=0` : le monde reste à t = 0, l'alerte ne bouge pas.
 */

const status = (page: Page) => page.locator('[data-dashboard-status]');

async function open(page: Page, search: string): Promise<string[]> {
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

test.describe('Points blancs visibles (#366)', () => {
  test('points-blancs=1 : alerte critique, lien vers la page « Maladies » du wiki', async ({
    page,
  }) => {
    const errors = await open(page, '?seed=42&vitesse=0&points-blancs=1');
    const alert = status(page).locator('[data-alert="ich"]');
    await expect(alert).toBeVisible();
    await expect(alert).toHaveAttribute('data-severity', 'critique');
    await expect(alert).toContainText('Points blancs');
    await expect(status(page).locator('[data-health="sick"]')).toHaveAttribute(
      'title',
      /points blancs/,
    );

    await alert.locator('.status__chip').click();
    const detail = status(page).locator('[data-alert-detail="ich"]');
    await expect(detail).toContainText('Ichthyophthirius');
    const link = detail.locator('[data-alert-wiki="maladies"]');
    await expect(link).toHaveText('Wiki : Maladies');
    await expect(link).toHaveAccessibleName('Ouvrir le wiki : page « Maladies »');
    await link.click();

    const pageView = page.locator('[data-wiki-page-view="maladies"]');
    await expect(pageView).toBeVisible();
    await expect(pageView.locator('[data-wiki-entry="points-blancs"]')).toContainText(
      'Points blancs',
    );
    await expect(page.locator('[data-wiki-back]')).toBeFocused();
    // Le wiki est exclusif : « Réglages » reste fermé.
    await expect(page.locator('.control-panel')).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('sans le paramètre, ou avec une autre valeur : aucun malade, aucune alerte', async ({
    page,
  }) => {
    for (const search of ['?seed=42&vitesse=0', '?seed=42&vitesse=0&points-blancs=0']) {
      const errors = await open(page, search);
      await expect(status(page).locator('[data-alert-none]'), search).toBeVisible();
      await expect(status(page).locator('[data-alert="ich"]'), search).toHaveCount(0);
      expect(errors, search).toEqual([]);
    }
  });

  test('en capture, vues de face et de dessus : rendu sans erreur', async ({ page }) => {
    for (const camera of ['front', 'top']) {
      const errors = await open(
        page,
        `?capture=1&seed=42&time=30&points-blancs=1&camera=${camera}`,
      );
      expect(errors, camera).toEqual([]);
    }
  });
});
