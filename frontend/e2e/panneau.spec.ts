import { expect, test } from '@playwright/test';

import {
  autoHour,
  box,
  count,
  decor,
  fermerReglages,
  hostEl,
  hour,
  open,
  ouvrirReglages,
  population,
  speed,
  tick,
  toggle,
  vegetationPixels,
} from './outils-panneau';

/**
 * Panneau de contrôle (issue #52) : vitesse de simulation, heure de la journée, affichage
 * du décor, population par espèce (#69). Repliable, utilisable au clavier et à 390 px,
 * absent en mode capture.
 */

test.describe('Panneau de contrôle', () => {
  test('fermé par défaut, se déplie au clic ; contrôles nommés', async ({ page }) => {
    const errors = await open(page);
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(speed(page)).toHaveCount(0);
    await ouvrirReglages(page, 'Temps');
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('region', { name: 'Réglages de l’aquarium' })).toBeVisible();
    for (const control of [speed(page), hour(page), autoHour(page)]) {
      await expect(control).toBeVisible();
    }
    await expect(speed(page)).toHaveAttribute('aria-valuetext', '×1');
    await expect(autoHour(page)).toBeChecked();
    await ouvrirReglages(page, 'Décor');
    await expect(decor(page)).toBeVisible();
    await expect(decor(page)).toBeChecked();
    await fermerReglages(page);
    await expect(speed(page)).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('vitesse 0 : la simulation s’arrête, le rendu continue ; ×4 reprend', async ({ page }) => {
    const errors = await open(page);
    await ouvrirReglages(page, 'Temps');
    await speed(page).fill('0');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-speed', '0');
    await expect(speed(page)).toHaveAttribute('aria-valuetext', 'Pause');
    const stopped = await tick(page);
    // Le rendu continue : une transition de caméra avance toujours (fenêtre refermée, #722).
    await fermerReglages(page);
    const before = await hostEl(page).getAttribute('data-aqfish-camera');
    await page.getByRole('button', { name: /vue de dessus/i }).click();
    await expect(hostEl(page)).not.toHaveAttribute('data-aqfish-camera', before!);
    await page.waitForTimeout(1000);
    expect(await tick(page)).toBe(stopped);
    await ouvrirReglages(page, 'Temps');
    await speed(page).fill('4');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-speed', '4');
    await expect.poll(() => tick(page)).toBeGreaterThan(stopped);
    expect(errors).toEqual([]);
  });

  test('heure : le curseur fige l’éclairage à l’heure choisie, libellé « 14:30 »', async ({
    page,
  }) => {
    const errors = await open(page);
    await ouvrirReglages(page, 'Temps');
    await hour(page).fill('14.5');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-hour', '14.50');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-hour-frozen', 'true');
    await expect(hour(page)).toHaveAttribute('aria-valuetext', '14:30');
    await expect(page.locator('[data-section="journee"] output')).toHaveText('14:30');
    await expect(autoHour(page)).not.toBeChecked();
    // Éclairage lié : minuit ⇒ indicateur « nuit ».
    await hour(page).fill('0');
    await expect(page.getByRole('img', { name: /Moment de la journée/ })).toHaveAccessibleName(
      'Moment de la journée : nuit',
    );
    // Retour au cycle automatique, depuis l'heure figée.
    await autoHour(page).check();
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-hour-frozen', 'false');
    expect(errors).toEqual([]);
  });

  test('décor : la case masque puis réaffiche rochers et plantes', async ({ page }) => {
    const errors = await open(page, '?seed=42&heure=12');
    await ouvrirReglages(page, 'Temps');
    // Simulation à l'arrêt : seules les images du décor changent.
    await speed(page).fill('0');
    await fermerReglages(page);
    await page.getByRole('button', { name: /vue de face/i }).click();
    await page.waitForTimeout(800);
    const shown = await vegetationPixels(page);
    expect(shown).toBeGreaterThan(500);
    // Fenêtre des réglages (#722) : refermée entre chaque bascule, pour que le bac se voie.
    await ouvrirReglages(page, 'Décor');
    await decor(page).uncheck();
    await fermerReglages(page);
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-decor', 'false');
    await expect.poll(() => vegetationPixels(page)).toBeLessThan(shown * 0.01);
    await ouvrirReglages(page, 'Décor');
    await decor(page).check();
    await fermerReglages(page);
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-decor', 'true');
    await expect.poll(() => vegetationPixels(page)).toBeGreaterThan(shown * 0.9);
    expect(errors).toEqual([]);
  });

  test('population : « + », « − » et saisie changent les effectifs sans remettre à zéro', async ({
    page,
  }) => {
    const errors = await open(page);
    await ouvrirReglages(page, 'Population');
    await expect(hostEl(page)).toHaveAttribute(
      'data-aqfish-population',
      'neon:12,guppy:6,corydora:6,rasbora:0,tetra:0,kuhli:0,gourami:0,platy:0,danio:0,ancistrus:0,otocinclus:0,braise:0,molly:0,miel:0,xipho:0,cerise:0,neritine:0',
    );
    await expect(count(page, 'néons')).toHaveValue('12');
    await expect.poll(() => tick(page)).toBeGreaterThan(30);
    const before = await tick(page);
    await page.getByRole('button', { name: 'Ajouter un néon' }).click();
    await expect(hostEl(page)).toHaveAttribute(
      'data-aqfish-population',
      'neon:13,guppy:6,corydora:6,rasbora:0,tetra:0,kuhli:0,gourami:0,platy:0,danio:0,ancistrus:0,otocinclus:0,braise:0,molly:0,miel:0,xipho:0,cerise:0,neritine:0',
    );
    await expect(count(page, 'néons')).toHaveValue('13');
    await page.getByRole('button', { name: 'Retirer un corydora' }).click();
    await count(page, 'guppys').fill('2');
    await count(page, 'guppys').press('Enter');
    await expect(hostEl(page)).toHaveAttribute(
      'data-aqfish-population',
      'neon:13,guppy:2,corydora:5,rasbora:0,tetra:0,kuhli:0,gourami:0,platy:0,danio:0,ancistrus:0,otocinclus:0,braise:0,molly:0,miel:0,xipho:0,cerise:0,neritine:0',
    );
    // Hors bornes : ramené au maximum de l'espèce, affiché dans le champ.
    await count(page, 'néons').fill('500');
    await count(page, 'néons').press('Enter');
    await expect(count(page, 'néons')).toHaveValue('40');
    await expect(page.getByRole('button', { name: 'Ajouter un néon' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(await population(page)).toBe(
      'neon:40,guppy:2,corydora:5,rasbora:0,tetra:0,kuhli:0,gourami:0,platy:0,danio:0,ancistrus:0,otocinclus:0,braise:0,molly:0,miel:0,xipho:0,cerise:0,neritine:0',
    );
    // Le temps n'est pas remis à zéro, et la simulation continue.
    const after = await tick(page);
    expect(after).toBeGreaterThanOrEqual(before);
    await expect.poll(() => tick(page)).toBeGreaterThan(after);
    expect(errors).toEqual([]);
  });

  test('à 390 px : fenêtre des réglages entière, lignes de population entières', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await open(page);
    await ouvrirReglages(page, 'Population');
    const panel = await box(page.locator('section.control-panel'));
    const button = await box(toggle(page));
    for (const b of [panel, button]) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(390);
    }
    // Fenêtre des réglages (#722) : modale, elle couvre la barre des préréglages, l'indicateur
    // et l'aide-mémoire (fond assombri) ; elle tient entière dans l'écran.
    const window = await box(page.locator('[data-settings-window]'));
    expect(window.x).toBeGreaterThanOrEqual(0);
    expect(window.y).toBeGreaterThanOrEqual(0);
    expect(window.x + window.width).toBeLessThanOrEqual(390);
    expect(window.y + window.height).toBeLessThanOrEqual(844);
    // Population (#69) : chaque ligne entière dans le panneau, contrôles de taille tactile.
    const rows = page.locator('[data-section="population"] .control-panel__count');
    // Bac tropical : trois espèces peuplées et quatorze ajoutables (#238, #362, #391, #425).
    await expect(rows).toHaveCount(17);
    // Toutes les boîtes relevées en un seul aller-retour : un `boundingBox` par contrôle
    // (17 lignes × 5) dépassait le délai du test en rendu logiciel (#391).
    const measured = await rows.evaluateAll((els) =>
      els.map((row) => {
        const box = (el: Element) => {
          const r = el.getBoundingClientRect();
          return { x: r.x, width: r.width, height: r.height };
        };
        return { row: box(row), controls: [...row.querySelectorAll('button, input')].map(box) };
      }),
    );
    expect(measured).toHaveLength(17);
    for (const { row, controls } of measured) {
      expect(row.width).toBeGreaterThan(0);
      expect(row.x).toBeGreaterThanOrEqual(panel.x);
      expect(row.x + row.width).toBeLessThanOrEqual(panel.x + panel.width);
      expect(controls.length).toBeGreaterThan(0);
      for (const b of controls) {
        expect(b.width, 'contrôle visible').toBeGreaterThan(0);
        expect(b.x + b.width).toBeLessThanOrEqual(panel.x + panel.width);
        expect(b.height).toBeGreaterThanOrEqual(28);
      }
    }
    // Curseurs (#92) : zone de saisie d'au moins 24 px de haut, vitesse et heure comprises.
    const ranges = await page
      .locator('section.control-panel input.control-panel__range')
      .evaluateAll((els) =>
        els
          .map((el) => el.getBoundingClientRect())
          .filter((r) => r.width > 0)
          .map((r) => r.height),
      );
    expect(ranges.length).toBeGreaterThanOrEqual(5);
    for (const height of ranges) {
      expect(height, 'cible tactile du curseur').toBeGreaterThanOrEqual(24);
    }
    // Aucun débordement horizontal à l'intérieur du panneau.
    const scroll = await page
      .locator('section.control-panel')
      .evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(scroll).toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
  });

  test('mode capture : aucun panneau', async ({ page }) => {
    await open(page, '?capture=1');
    await expect(page.locator('app-control-panel')).toHaveCount(0);
  });
});
