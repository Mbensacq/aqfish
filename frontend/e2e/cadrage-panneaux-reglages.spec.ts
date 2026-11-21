import { expect, test } from '@playwright/test';

import { box, FONTS, openScene, SETTINGS_CASES } from './outils-cadrage';
import { ouvrirReglages } from './outils-panneau';

/**
 * Cadrage du contenu de « Réglages » (#370, #322, #571), dans la fenêtre des réglages (#722) :
 * lignes « Population » entières, badge du mode décor à la place du cadre haut, quarantaine
 * installée sans débord.
 * Séparé de `cadrage-panneaux.spec.ts` pour la répartition de la CI (#600).
 */

// #370 : à 1280 × 720, la liste « Population » défilait seule, sa hauteur arrondie à un nombre
// entier de lignes. Fenêtre des réglages (#722) : la catégorie « Population » défile dans le
// contenu de la fenêtre ; chaque ligne d'espèce y est entière en largeur, et plusieurs sont
// visibles sans défiler, avec ou sans la section « Soins » (bac malade, `points-blancs=1`).
test.describe('catégorie « Population » de la fenêtre des réglages (#370, #722)', () => {
  for (const font of FONTS) {
    for (const search of ['?seed=42', '?seed=42&points-blancs=1']) {
      test(`1280 × 720 : lignes d’espèce entières en largeur (${search}, police ${font ?? 'par défaut'})`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: 1280, height: 720 });
        const errors = await openScene(page, search);
        if (font) {
          await page.addStyleTag({
            content: `app-control-panel, app-control-panel * { font-family: '${font}' !important; }`,
          });
        }
        await ouvrirReglages(page, 'Population');
        const content = page.locator('.settings-window__content');
        const { left, right, top, bottom, overflow, rows } = await content.evaluate((el) => {
          const r = el.getBoundingClientRect();
          return {
            left: r.left,
            right: r.right,
            top: r.top,
            bottom: r.bottom,
            overflow: el.scrollWidth > el.clientWidth + 1,
            rows: [...el.querySelectorAll('[data-section="population"] .control-panel__count')].map(
              (row) => {
                const b = row.getBoundingClientRect();
                return { left: b.left, right: b.right, top: b.top, bottom: b.bottom };
              },
            ),
          };
        });
        expect(overflow, 'débordement horizontal').toBe(false);
        expect(rows.length).toBeGreaterThan(0);
        for (const [i, row] of rows.entries()) {
          expect(row.left, `ligne ${i + 1}`).toBeGreaterThanOrEqual(left);
          expect(row.right, `ligne ${i + 1}`).toBeLessThanOrEqual(right);
        }
        const shown = rows.filter((row) => row.top >= top && row.bottom <= bottom).length;
        expect(shown, 'au moins trois espèces visibles sans défiler').toBeGreaterThanOrEqual(3);
        expect(errors).toEqual([]);
      });
    }
  }
});

// #322 : le badge du mode décor remplace le cadre haut du tableau de bord ; il prend sa place
// à toutes les largeurs, marges du téléphone (8 px sous 480 px) comprises. Sur bureau, le
// cadre et le badge commencent à 12 px après « Réglages » et finissent à 12 px avant
// l'aide-mémoire déplié (largeurs lues dans `src/app/ui/_panel-layout.scss`).
test.describe('badge du mode décor à la place du cadre haut (#322)', () => {
  const widths = [
    { width: 1280, height: 720 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
    { width: 320, height: 568 },
  ] as const;

  for (const viewport of widths) {
    test(`${viewport.width} × ${viewport.height} : même place que le cadre haut`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      const errors = await openScene(page, '?seed=42&vitesse=0');
      const frame = await box(page.locator('app-dashboard-frame'));
      await page.goto('/?seed=42&vitesse=0&mode=decor');
      await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
      await expect(page.locator('[data-decor-badge]')).toBeVisible();
      const badge = await box(page.locator('app-decor-badge'));
      expect(badge.x).toBeCloseTo(frame.x, 1);
      expect(badge.y).toBeCloseTo(frame.y, 1);
      expect(badge.width).toBeCloseTo(frame.width, 1);
      const margin = viewport.width <= 480 ? 8 : 12;
      if (viewport.width >= 1100) {
        const settings = await box(page.locator('.control-panel__toggle'));
        const help = await box(page.locator('#aide-commandes'));
        expect(badge.x - (settings.x + settings.width)).toBeGreaterThanOrEqual(margin);
        expect(help.x - (badge.x + badge.width)).toBeCloseTo(margin, 1);
      } else {
        expect(badge.x).toBeCloseTo(margin, 1);
        expect(viewport.width - (badge.x + badge.width)).toBeCloseTo(margin, 1);
      }
      expect(errors).toEqual([]);
    });
  }
});

// #571 : quarantaine installée, le contenu de la fenêtre (#722) ne déborde pas en largeur,
// aussi à 900 × 700 et avec DejaVu Sans (police de la CI, plus large) ; le choix du bac de
// quarantaine reçoit le focus et reste visible dans le contenu qui défile.
test.describe('quarantaine installée (#571)', () => {
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 900, height: 700 },
  ]) {
    for (const font of FONTS) {
      test(`${viewport.width} × ${viewport.height} : sans débord, bac de quarantaine visible (police ${font ?? 'par défaut'})`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport);
        const errors = await openScene(page, '?seed=42&points-blancs=1');
        if (font) {
          await page.addStyleTag({
            content: `app-control-panel, app-control-panel * { font-family: '${font}' !important; }`,
          });
        }
        await SETTINGS_CASES.find((p) => p.name === 'Réglages (quarantaine)')!.open(page);
        const panel = page.locator('.settings-window__content');
        expect(await panel.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
        const panelBox = await box(panel);
        expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(viewport.width);
        expect(panelBox.y + panelBox.height).toBeLessThanOrEqual(viewport.height);
        const select = panel.locator('[data-quarantine-tank]');
        await expect(select).toBeFocused();
        const selectBox = await box(select);
        expect(selectBox.y).toBeGreaterThanOrEqual(panelBox.y);
        expect(selectBox.y + selectBox.height).toBeLessThanOrEqual(panelBox.y + panelBox.height);
        // Le reste de la section « Bacs » atteignable en défilant, dans la largeur du contenu.
        const tanks = panel.locator("[data-section='bacs']");
        await tanks.scrollIntoViewIfNeeded();
        const tanksBox = await box(tanks);
        expect(tanksBox.x + tanksBox.width).toBeLessThanOrEqual(panelBox.x + panelBox.width);
        expect(errors).toEqual([]);
      });
    }
  }
});
