import { expect, test } from '@playwright/test';

import {
  box,
  checkPanelInViewport,
  openScene,
  overlaps,
  PANEL_VIEWPORTS,
  PANELS,
} from './outils-cadrage';

/**
 * Cadrage des panneaux de l'interface (rétro du sprint 5, issue #108, et #79) : chaque
 * panneau ouvert tient dans la fenêtre, ne recouvre pas la barre des préréglages et laisse
 * libres les boutons d'interface (#112), à 390 × 844 (téléphone) et 320 × 568 (très petit
 * téléphone) ; 1280 × 720 dans `cadrage-panneaux-bureau.spec.ts`. Les autres cas de cadrage
 * sont dans `cadrage-panneaux-*.spec.ts` (#600), outils communs dans `outils-cadrage.ts`.
 */

for (const viewport of PANEL_VIEWPORTS.slice(1)) {
  test.describe(`${viewport.width} × ${viewport.height}`, () => {
    test.use({ viewport });

    for (const panelCase of PANELS) {
      test(`panneau « ${panelCase.name} » ouvert : dans la fenêtre, sans recouvrir la barre des vues`, async ({
        page,
      }) => {
        await checkPanelInViewport(page, panelCase, viewport);
      });
    }
  });
}

// #112 : à 320 × 568, l'hôte du panneau « Réglages » (transparent, aussi large que le
// panneau) interceptait le clic sur le bouton « Commandes » replié, en haut à droite.
test('320 × 568 : « Réglages » ouvert, le bouton « Commandes » ouvre l’aide-mémoire (#112)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const errors = await openScene(page);
  await PANELS.find((p) => p.name === 'Réglages')!.open(page);
  await page.getByRole('button', { name: /Afficher l’aide-mémoire des commandes/ }).click();
  await expect(page.locator('#aide-commandes')).toBeVisible();
  // #136 : sous 640 px, ouvrir « Commandes » replie « Réglages » (panneaux exclusifs).
  await expect(page.locator('.control-panel')).toHaveCount(0);
  expect(errors).toEqual([]);
});

// #257 : « Réglages » ouvert passe par-dessus le cadre du tableau de bord (ADR 0059). Le
// panneau est opaque, et chaque élément visible du cadre qu'il croise est bien dessous : au
// centre de la partie recouverte, le point appartient au panneau.
test('1280 × 720 : « Réglages » ouvert masque entièrement le cadre qu’il recouvre (#257)', async ({
  page,
}) => {
  const errors = await openScene(page, '?seed=42&vitesse=0');
  await page.getByRole('button', { name: 'Réglages' }).click();
  await expect(page.locator('.control-panel')).toBeVisible();
  const result = await page.evaluate(() => {
    const panel = document.querySelector('.control-panel')!;
    const rect = panel.getBoundingClientRect();
    const background = getComputedStyle(panel).backgroundColor;
    let crossed = 0;
    const seen: string[] = [];
    for (const el of document.querySelectorAll('app-dashboard-frame *')) {
      const box = el.getBoundingClientRect();
      const left = Math.max(box.left, rect.left);
      const right = Math.min(box.right, rect.right);
      const top = Math.max(box.top, rect.top);
      const bottom = Math.min(box.bottom, rect.bottom);
      if (right - left < 1 || bottom - top < 1) {
        continue;
      }
      crossed++;
      const hit = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
      if (!hit || !panel.contains(hit)) {
        seen.push(`${el.tagName.toLowerCase()}.${el.className}`);
      }
    }
    return { background, crossed, seen };
  });
  // Le panneau croise bien le cadre à ce format, sinon le test ne prouverait rien.
  expect(result.crossed).toBeGreaterThan(0);
  expect(result.seen).toEqual([]);
  expect(result.background).toBe('rgb(27, 31, 35)'); // $panel-background (charte #721)
  expect(errors).toEqual([]);
});

// Bilan déplié à 390 × 844 (#592) : le bandeau santé et alertes grandit vers le haut et sa
// ligne Santé/Faim passait sous la languette « Mon premier aquarium » (bas fixe à 124 px).
// La languette se masque tant qu'un détail du bandeau est déplié, et revient à sa fermeture ;
// repliée, elle ne recouvre aucune ligne du bandeau.
test('390 × 844 : bilan et journal dépliés, la languette du parcours ne recouvre pas le bandeau (#592)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = await openScene(page, '?seed=42&vitesse=0');
  const path = page.locator('app-first-tank-path');
  const items = page.locator('[data-dashboard-status] .status__item');
  const free = async () => {
    if ((await path.count()) === 0) {
      return;
    }
    const pathBox = await box(path.locator('.path__toggle'));
    for (const item of await items.all()) {
      expect(overlaps(pathBox, await box(item)), 'languette sur une ligne du bandeau').toBe(false);
    }
  };
  await expect(path).toBeVisible();
  await free();
  const review = page.getByRole('button', { name: 'Bilan du bac' });
  await review.click();
  await expect(page.locator('[data-review-detail]')).toBeVisible();
  await expect(path).toHaveCount(0);
  await free();
  await page.locator('[data-journal]').click();
  await expect(page.locator('[data-journal-detail]')).toBeVisible();
  await expect(path).toHaveCount(0);
  await review.click();
  await expect(page.locator('[data-review-detail]')).toHaveCount(0);
  await expect(path).toBeVisible();
  await free();
  expect(errors).toEqual([]);
});
