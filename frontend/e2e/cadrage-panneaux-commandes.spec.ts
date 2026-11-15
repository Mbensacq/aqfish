import { expect, test } from '@playwright/test';

import { box, FONTS, openScene, overlaps, PANELS } from './outils-cadrage';

/**
 * Cadrage de l'aide-mémoire « Commandes » (#79, #588, #610) : entier à 1280 × 720, à côté de
 * « Réglages » sans le recouvrir, au-dessus du bandeau bas. Séparé de
 * `cadrage-panneaux.spec.ts` pour la répartition de la CI (#600).
 */

// #79 : à 1280 × 720, la section « Aide » du panneau « Commandes » n'apparaissait qu'en
// défilant (capture `front-panneau` du cycle 33). Elle doit tenir sans défilement ; à
// 390 × 844, le panneau défile, mais sa dernière ligne reste atteignable au-dessus de la barre.
test.describe('panneau « Commandes » (#79)', () => {
  for (const font of FONTS) {
    test(`1280 × 720 : entier sans défilement, section « Aide » comprise (police ${font ?? 'par défaut'})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 720 });
      const errors = await openScene(page);
      if (font) {
        await page.addStyleTag({
          content: `app-commands-help, app-commands-help * { font-family: '${font}' !important; }`,
        });
      }
      const commands = PANELS.find((p) => p.name === 'Commandes')!;
      await commands.open(page);
      const panel = commands.panel(page);
      const { scrollHeight, clientHeight } = await panel.evaluate((el) => ({
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
      }));
      expect(scrollHeight, 'contenu plus haut que le panneau : défilement').toBeLessThanOrEqual(
        clientHeight,
      );
      const panelBox = await box(panel);
      const last = await box(panel.locator('[data-command="aide"]').locator('dd'));
      expect(last.y + last.height).toBeLessThanOrEqual(panelBox.y + panelBox.height);
      expect(errors).toEqual([]);
    });
  }

  test('390 × 844 : dernière ligne atteignable, au-dessus de la barre des vues', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await openScene(page);
    const commands = PANELS.find((p) => p.name === 'Commandes')!;
    await commands.open(page);
    const panel = commands.panel(page);
    await panel.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    const last = await box(panel.locator('[data-command="aide"]').locator('dd'));
    const bar = await box(page.locator('.view-presets-bar'));
    expect(last.y + last.height).toBeLessThanOrEqual(bar.y);
    await expect(panel.locator('[data-command="aide"] dd')).toBeInViewport();
    expect(errors).toEqual([]);
  });
});

// #588 : à 900 × 700, « Réglages » en deux colonnes (532 px, de 59 à 591 px) recouvrait
// l'aide-mémoire « Commandes » déplié (300 px, à 12 px du bord droit : dès 588 px). Le panneau
// ne passe en deux colonnes qu'à partir de 1167 px de large (915 px avant #610, qui y ajoute la
// bulle de soin) ; plus étroit, une colonne. Les deux panneaux ouverts ensemble restent séparés
// d'au moins 12 px, de part et d'autre de l'ancien seuil comme du nouveau.
test.describe('« Réglages » et « Commandes » ouverts ensemble (#588)', () => {
  for (const viewport of [
    { width: 900, height: 700 },
    { width: 914, height: 700 },
    { width: 915, height: 700 },
    { width: 1024, height: 700 },
    { width: 1166, height: 700 },
    { width: 1167, height: 700 },
    { width: 1280, height: 720 },
  ]) {
    for (const search of ['?seed=42', '?seed=42&points-blancs=1']) {
      test(`${viewport.width} × ${viewport.height} : sans se recouvrir (${search})`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport);
        const errors = await openScene(page, search);
        await PANELS.find((p) => p.name === 'Commandes')!.open(page);
        await PANELS.find((p) => p.name === 'Réglages')!.open(page);
        // Au-delà de 639 px, ouvrir « Réglages » ne replie pas « Commandes » (#136).
        await expect(page.locator('#aide-commandes')).toBeVisible();
        const settings = await box(page.locator('.control-panel'));
        const commands = await box(page.locator('#aide-commandes'));
        expect(overlaps(settings, commands), '« Réglages » recouvre « Commandes »').toBe(false);
        expect(commands.x - (settings.x + settings.width)).toBeGreaterThanOrEqual(12);
        expect(
          await page.locator('.control-panel').evaluate((el) => el.scrollWidth <= el.clientWidth),
        ).toBe(true);
        expect(errors).toEqual([]);
      });
    }
  }
});

// #610 : sous 1100 px, le bandeau bas (santé, alertes) occupe toute la largeur ; à 900 × 700,
// le bas de « Commandes » déplié touchait sa ligne. L'aide-mémoire s'arrête au-dessus, quelle
// que soit la hauteur du bandeau (une à trois lignes selon la largeur et la police).
test.describe('« Commandes » au-dessus du bandeau bas (#610)', () => {
  for (const viewport of [
    { width: 640, height: 700 },
    { width: 768, height: 700 },
    { width: 900, height: 700 },
    { width: 1024, height: 700 },
  ]) {
    for (const font of FONTS) {
      test(`${viewport.width} × ${viewport.height} : sans toucher le bandeau (police ${font ?? 'par défaut'})`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport);
        const errors = await openScene(page, '?seed=42&points-blancs=1');
        if (font) {
          await page.addStyleTag({ content: `* { font-family: '${font}' !important; }` });
        }
        await PANELS.find((p) => p.name === 'Commandes')!.open(page);
        const status = page.locator('app-dashboard-status .status');
        // La hauteur publiée suit le bandeau (police changée : il peut passer à la ligne).
        await expect
          .poll(async () => {
            const [commands, bar] = [await box(page.locator('#aide-commandes')), await box(status)];
            return bar.y - (commands.y + commands.height);
          })
          .toBeGreaterThanOrEqual(8);
        await expect(page.locator('#aide-commandes [data-command="aide"] dd')).toBeAttached();
        expect(errors).toEqual([]);
      });
    }
  }
});
