import { expect, test } from '@playwright/test';

import { box, coveredButtons, FONTS, openScene, overlaps, PANELS } from './outils-cadrage';

/**
 * Cadrage du message d'un geste de soin (#490, #610) : bulle à droite de « Réglages » en deux
 * colonnes, sans recouvrir « Commandes » ni la barre des vues. Séparé de
 * `cadrage-panneaux.spec.ts` pour la répartition de la CI (#600).
 */

// #610 : en deux colonnes, la bulle d'un geste de soin (240 px, à droite de « Réglages »)
// recouvrait « Commandes » déplié sous 1155 px de large. Le panneau ne passe en deux colonnes
// qu'à partir de 1167 px (panneau, bulle et aide-mémoire côte à côte) ; plus étroit, le message
// reste une ligne de la section, dans le panneau. Mesuré de part et d'autre du seuil.
test.describe('bulle de soin et « Commandes » ouverts ensemble (#610)', () => {
  for (const viewport of [
    { width: 915, height: 700 },
    { width: 1024, height: 700 },
    { width: 1154, height: 700 },
    { width: 1166, height: 700 },
    { width: 1167, height: 700 },
    { width: 1280, height: 720 },
  ]) {
    for (const font of FONTS) {
      test(`${viewport.width} × ${viewport.height} : sans se recouvrir (police ${font ?? 'par défaut'})`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport);
        const errors = await openScene(page, '?seed=42&points-blancs=1');
        if (font) {
          await page.addStyleTag({ content: `* { font-family: '${font}' !important; }` });
        }
        await PANELS.find((p) => p.name === 'Commandes')!.open(page);
        await PANELS.find((p) => p.name === 'Réglages (soins, message)')!.open(page);
        await expect(page.locator('#aide-commandes')).toBeVisible();
        const settings = await box(page.locator('.control-panel'));
        const bubble = await box(page.locator('.control-panel [data-treatment-message]'));
        const commands = await box(page.locator('#aide-commandes'));
        expect(overlaps(bubble, commands), 'la bulle recouvre « Commandes »').toBe(false);
        expect(overlaps(settings, commands), '« Réglages » recouvre « Commandes »').toBe(false);
        // Bulle hors du panneau en deux colonnes seulement, à 12 px au moins de « Commandes ».
        const outside = bubble.x >= settings.x + settings.width;
        expect(outside).toBe(viewport.width >= 1167);
        if (outside) {
          expect(commands.x - (bubble.x + bubble.width)).toBeGreaterThanOrEqual(12);
        }
        expect(errors).toEqual([]);
      });
    }
  }
});

// #490 : à 1280 × 720, un message de soin (le plus long : sel avec néons et corydoras, mise
// en garde comprise) agrandissait la section « Soins », qui passait en deuxième colonne et
// poussait « Sauvegarde » dans une troisième, hors du panneau. Le message est désormais une
// bulle à droite du panneau : chaque section reste entière dans le cadre, deux colonnes.
test.describe('message de soin à 1280 × 720 (#490)', () => {
  for (const font of FONTS) {
    test(`toutes les sections visibles, bulle dans la fenêtre (police ${font ?? 'par défaut'})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 720 });
      const errors = await openScene(page, '?seed=42&points-blancs=1');
      if (font) {
        await page.addStyleTag({
          content: `app-control-panel, app-control-panel * { font-family: '${font}' !important; }`,
        });
      }
      const settings = PANELS.find((p) => p.name === 'Réglages (soins, message)')!;
      await settings.open(page);
      const panel = settings.panel(page);
      expect(await panel.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      const panelBox = await box(panel);
      const sections = await panel.evaluate((el) =>
        [...el.querySelectorAll<HTMLElement>(':scope > fieldset')].map((f) => {
          const r = f.getBoundingClientRect();
          return { name: f.dataset['section'], left: r.left, right: r.right, bottom: r.bottom };
        }),
      );
      expect(sections.map((s) => s.name)).toContain('sauvegarde');
      for (const section of sections) {
        expect(section.right, `section « ${section.name} » hors du panneau`).toBeLessThanOrEqual(
          panelBox.x + panelBox.width,
        );
        expect(section.bottom, `section « ${section.name} » coupée`).toBeLessThanOrEqual(
          panelBox.y + panelBox.height,
        );
      }
      const lefts = new Set(sections.map((s) => Math.round(s.left)));
      expect(lefts.size, 'deux colonnes, pas trois').toBe(2);
      const bubble = await box(panel.locator('[data-treatment-message]'));
      const bar = await box(page.locator('.view-presets-bar'));
      expect(bubble.x).toBeGreaterThanOrEqual(panelBox.x + panelBox.width);
      expect(bubble.x + bubble.width).toBeLessThanOrEqual(1280);
      expect(bubble.y + bubble.height).toBeLessThanOrEqual(720);
      expect(overlaps(bubble, bar), 'la bulle recouvre la barre des vues').toBe(false);
      expect(await coveredButtons(panel), 'boutons d’interface recouverts').toEqual([]);
      expect(errors).toEqual([]);
    });
  }
});
