import { expect, test } from '@playwright/test';

/**
 * QA (issue #50) : bulles, caustiques et reflet restent sans erreur dans des conditions
 * extrêmes (petite fenêtre, graines limites, temps démesuré, tous les angles).
 */
const ANGLES = ['front', 'top', 'bottom', 'side', 'three-quarter'];
const SEEDS = [0, 1, 4294967295];

test.describe('Bulles et lumière : robustesse', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const seed of SEEDS) {
    test(`graine ${seed}, petite fenêtre, temps long : aucun angle ne produit d'erreur`, async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => {
        if (m.type() === 'error') {
          errors.push(m.text());
        }
      });
      for (const camera of ANGLES) {
        await page.goto(`/?capture=1&seed=${seed}&camera=${camera}&time=3000`);
        await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
      }
      expect(errors).toEqual([]);
    });
  }
});
