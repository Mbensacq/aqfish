import { expect, test, type Page } from '@playwright/test';

import { box, FONTS, openScene, PANELS, SETTINGS_CASES } from './outils-cadrage';
import { fermerReglages } from './outils-panneau';

/**
 * Cadrage du message d'un geste de soin (#490, #610) dans la fenêtre des réglages (#722) : il
 * était une bulle à droite du panneau en deux colonnes ; c'est désormais une ligne de la
 * catégorie « Soins et produits », dans la fenêtre, qui replie « Commandes » le temps d'être
 * ouverte (sa bascule sous le fond) et le rend à sa fermeture.
 * Séparé de `cadrage-panneaux.spec.ts` pour la répartition de la CI (#600).
 */

/** Vrai si le centre de `selector` est couvert par la fenêtre des réglages ou son fond. */
async function coveredBySettings(page: Page, selector: string): Promise<boolean> {
  return page.evaluate((target) => {
    const element = document.querySelector(target)!;
    const r = element.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return hit !== null && document.querySelector('app-settings-window')!.contains(hit);
  }, selector);
}

// #610 : la bulle d'un geste de soin recouvrait « Commandes » déplié sous 1155 px de large.
// Dans la fenêtre, le message reste dans le contenu de la catégorie, entier en largeur, quelle
// que soit la largeur ; « Commandes » est replié le temps de la fenêtre, puis rendu (#722).
test.describe('message de soin et « Commandes » ouverts ensemble (#610, #722)', () => {
  for (const viewport of [
    { width: 915, height: 700 },
    { width: 1166, height: 700 },
    { width: 1280, height: 720 },
  ]) {
    for (const font of FONTS) {
      test(`${viewport.width} × ${viewport.height} : message dans la fenêtre, « Commandes » replié puis rendu (police ${font ?? 'par défaut'})`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport);
        const errors = await openScene(page, '?seed=42&points-blancs=1');
        if (font) {
          await page.addStyleTag({ content: `* { font-family: '${font}' !important; }` });
        }
        await PANELS.find((p) => p.name === 'Commandes')!.open(page);
        await SETTINGS_CASES.find((p) => p.name === 'Réglages (soins, message)')!.open(page);
        const content = page.locator('.settings-window__content');
        const contentBox = await box(content);
        const message = await box(page.locator('.control-panel [data-treatment-message]'));
        expect(message.x).toBeGreaterThanOrEqual(contentBox.x);
        expect(message.x + message.width).toBeLessThanOrEqual(contentBox.x + contentBox.width);
        expect(await content.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
        await expect(page.locator('#aide-commandes')).toHaveCount(0);
        expect(await coveredBySettings(page, '.commands-help__toggle')).toBe(true);
        await fermerReglages(page);
        await expect(page.locator('#aide-commandes')).toBeVisible();
        expect(errors).toEqual([]);
      });
    }
  }
});

// #490 : à 1280 × 720, le message de soin le plus long (sel avec néons et corydoras, mise en
// garde comprise) agrandissait la section « Soins » au point de pousser « Sauvegarde » hors du
// panneau. Dans la fenêtre, la catégorie « Soins et produits » ne montre que sa section : le
// message, les gestes et l'état du traitement y tiennent sans défilement horizontal, et la
// note des sources reste lisible.
test.describe('message de soin à 1280 × 720 (#490, #722)', () => {
  for (const font of FONTS) {
    test(`catégorie « Soins et produits » entière, message dans la fenêtre (police ${font ?? 'par défaut'})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 720 });
      const errors = await openScene(page, '?seed=42&points-blancs=1');
      if (font) {
        await page.addStyleTag({
          content: `app-control-panel, app-control-panel * { font-family: '${font}' !important; }`,
        });
      }
      const settings = SETTINGS_CASES.find((p) => p.name === 'Réglages (soins, message)')!;
      await settings.open(page);
      const window = await box(settings.panel(page));
      const content = page.locator('.settings-window__content');
      expect(await content.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      const shown = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('[data-section]')]
          .filter((section) => !section.hidden)
          .map((section) => section.dataset['section']),
      );
      expect(shown).toEqual(['soins']);
      const section = await box(page.locator("[data-section='soins']"));
      expect(section.y + section.height, 'section « Soins » coupée').toBeLessThanOrEqual(
        window.y + window.height,
      );
      const message = await box(page.locator('.control-panel [data-treatment-message]'));
      expect(message.x + message.width).toBeLessThanOrEqual(window.x + window.width);
      expect(message.y + message.height).toBeLessThanOrEqual(window.y + window.height);
      expect(errors).toEqual([]);
    });
  }
});
