import { expect, test } from '@playwright/test';

import {
  hostEl,
  toggle,
  speed,
  hour,
  autoHour,
  decor,
  count,
  open,
  openPanel,
} from './outils-panneau';

/**
 * Panneau de contrôle « Réglages » au clavier (#52, #69) : Tab et flèches dans la population
 * et dans chaque section. Séparé de `panneau.spec.ts` pour la répartition de la CI (#600).
 */

test.describe('Panneau de contrôle', () => {
  test('population au clavier : Tab jusqu’aux boutons et au champ, flèches comprises', async ({
    page,
  }) => {
    const errors = await open(page);
    await toggle(page).click();
    await decor(page).focus();
    // Le bouton « Granulés » (#117) partage la ligne du décor : il vient juste après.
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: /^Granulés : / })).toBeFocused();
    // Section « Accessibilité » (#406), entre « Décor » et « Population ».
    await page.keyboard.press('Tab');
    await expect(page.getByRole('checkbox', { name: 'Réduire les mouvements' })).toBeFocused();
    // Section « Son » (#411) : la case puis le volume, sur la même ligne.
    await page.keyboard.press('Tab');
    await expect(page.getByRole('checkbox', { name: "Sons d'ambiance" })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('slider', { name: "Volume des sons d'ambiance" })).toBeFocused();
    // Bouton « Fiche » (#237), sur la ligne du nom, avant « − ».
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Fiche : Néon' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Retirer un néon' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(hostEl(page)).toHaveAttribute(
      'data-aqfish-population',
      'neon:11,guppy:6,corydora:6,rasbora:0,tetra:0,kuhli:0,gourami:0,platy:0,danio:0,ancistrus:0,otocinclus:0,braise:0,molly:0,miel:0,xipho:0,cerise:0,neritine:0',
    );
    // Curseur d'effectif (#189), entre « − » et le champ.
    await page.keyboard.press('Tab');
    await expect(page.getByRole('slider', { name: 'Curseur du nombre de néons' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(count(page, 'néons')).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    // Validé en quittant le champ (Tab) : le bouton « + » suivant reçoit le focus.
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Ajouter un néon' })).toBeFocused();
    await expect(hostEl(page)).toHaveAttribute(
      'data-aqfish-population',
      'neon:13,guppy:6,corydora:6,rasbora:0,tetra:0,kuhli:0,gourami:0,platy:0,danio:0,ancistrus:0,otocinclus:0,braise:0,molly:0,miel:0,xipho:0,cerise:0,neritine:0',
    );
    await page.keyboard.press('Space');
    await expect(hostEl(page)).toHaveAttribute(
      'data-aqfish-population',
      'neon:14,guppy:6,corydora:6,rasbora:0,tetra:0,kuhli:0,gourami:0,platy:0,danio:0,ancistrus:0,otocinclus:0,braise:0,molly:0,miel:0,xipho:0,cerise:0,neritine:0',
    );
    // Les chiffres tapés dans le champ ne déclenchent pas les raccourcis de vue (1 à 5).
    const camera = await hostEl(page).getAttribute('data-aqfish-camera');
    await count(page, 'guppys').focus();
    await page.keyboard.press('1');
    await page.waitForTimeout(300);
    expect(await hostEl(page).getAttribute('data-aqfish-camera')).toBe(camera);
    expect(errors).toEqual([]);
  });

  // Parcours de l'ordre de Tab découpé par section (#544) : chaque appui coûte une image en
  // rendu logiciel, et un seul test pour tout le panneau approchait son délai de 4 min à chaque
  // nouveau contrôle. Chaque test reprend par focus direct sur le dernier contrôle vérifié par
  // le précédent : la chaîne de Tab reste vérifiée de bout en bout, maillon par maillon.
  test('au clavier : Tab jusqu’au bouton, Entrée, puis la section « Simulation »', async ({
    page,
  }) => {
    // Le chemin jusqu'au bouton « Réglages » passe par la barre des vues, les jauges et l'aide
    // (~20 appuis) : relu à chaque appui, il coûtait à lui seul plus de 2 min en local. Les
    // éléments qui reçoivent le focus sont consignés dans la page et relus tous les quatre
    // appuis ; les appuis de trop sont défaits à Maj+Tab. D'où un délai encore relevé, mais
    // indépendant du nombre de contrôles du panneau, qui sont dans les tests suivants.
    test.setTimeout(240_000);
    await page.addInitScript(() => {
      const log: Element[] = [];
      (window as unknown as { aqfishFocusLog: Element[] }).aqfishFocusLog = log;
      document.addEventListener('focusin', (event) => log.push(event.target as Element));
    });
    const errors = await open(page);
    let pressed = 0;
    let [at, length] = [-1, 0];
    while (pressed < 40 && at < 0) {
      for (let k = 0; k < 4; k++, pressed++) await page.keyboard.press('Tab');
      [at, length] = await toggle(page).evaluate((el) => {
        const log = (window as unknown as { aqfishFocusLog: Element[] }).aqfishFocusLog;
        return [log.lastIndexOf(el), log.length];
      });
    }
    expect(at, 'bouton « Réglages » atteint par Tab').toBeGreaterThanOrEqual(0);
    for (let k = at + 1; k < length; k++) await page.keyboard.press('Shift+Tab');
    await expect(toggle(page)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');

    // Premier contrôle : la liste des environnements (#87, testée dans environnement.spec.ts).
    await page.keyboard.press('Tab');
    await expect(page.getByRole('combobox', { name: 'Environnement' })).toBeFocused();

    // Case « Afficher la pièce » (#187), sous la liste, dans le bac tropical.
    await page.keyboard.press('Tab');
    await expect(page.getByRole('checkbox', { name: 'Afficher la pièce' })).toBeFocused();
    await page.keyboard.press('Space');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-room', 'true');

    // Bouton « Mode immersif » (#345), sur la ligne du titre « Simulation ».
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Mode immersif' })).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(speed(page)).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-speed', '2');

    await page.keyboard.press('Tab');
    await expect(hour(page)).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-hour-frozen', 'true');

    await page.keyboard.press('Tab');
    await expect(autoHour(page)).toBeFocused();
    await page.keyboard.press('Space');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-hour-frozen', 'false');
    expect(errors).toEqual([]);
  });

  test('au clavier : section « Eau », du courant à l’amorce de bactéries', async ({ page }) => {
    const errors = await openPanel(page);
    // Reprise sur le dernier contrôle de la section « Simulation » (test précédent).
    await autoHour(page).focus();

    // Section « Eau » (#207) : « Courant » (#460) et « Changer l’eau », sur la ligne du titre,
    // puis le chauffage, l'éclairage (#476), la lampe (#584) et la raclette (#476), les
    // feuilles de catappa (#239).
    await page.keyboard.press('Tab');
    await expect(
      page.getByRole('button', { name: 'Courant : coupé, changer de force' }),
    ).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Changer l’eau' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('slider', { name: 'Consigne du chauffage' })).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-water', /^[a-z-]+;[\d.]+;24\.5;/);
    // Éclairage et raclette (#476), sous le chauffage.
    await page.keyboard.press('Tab');
    await expect(page.getByRole('slider', { name: 'Durée d’éclairage par jour' })).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-algae', /;9$/);
    // Heure d'allumage de la lampe (#584), à côté de l'éclairage.
    await page.keyboard.press('Tab');
    const lampOn = page.getByRole('slider', { name: 'Heure d’allumage de la lampe' });
    await expect(lampOn).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(lampOn).toHaveAttribute('aria-valuetext', 'allumée à 11:00');
    await page.keyboard.press('Tab');
    await expect(
      page.getByRole('button', { name: 'Raclette : cliquer sur les algues' }),
    ).toBeFocused();
    // Sécateur (#477), à côté de la raclette.
    await page.keyboard.press('Tab');
    await expect(
      page.getByRole('button', { name: 'Sécateur : cliquer sur une plante haute' }),
    ).toBeFocused();
    // Amorce de bactéries (#529), à côté du sécateur.
    await page.keyboard.press('Tab');
    await expect(
      page.getByRole('button', { name: 'Verser une dose d’amorce de bactéries nitrifiantes' }),
    ).toBeFocused();
    expect(errors).toEqual([]);
  });

  test('au clavier : section « Eau », des conditionneurs au catappa, puis « Décor »', async ({
    page,
  }) => {
    const errors = await openPanel(page);
    // Reprise sur l'amorce de bactéries, dernier contrôle vérifié par le test précédent.
    await page
      .getByRole('button', { name: 'Verser une dose d’amorce de bactéries nitrifiantes' })
      .focus();

    // Eau non traitée et conditionneurs (#530).
    for (const name of [
      'Eau du robinet non traitée',
      'Verser du conditionneur au thiosulfate (chlore)',
      'Verser du conditionneur liant l’ammoniaque',
      'Charbon actif dans le filtre',
      'Baisser le pH d’un cran',
      'Monter le pH d’un cran',
    ]) {
      await page.keyboard.press('Tab');
      await expect(page.getByRole('button', { name })).toBeFocused();
    }
    // Feuilles de catappa (#239) : « − » (désactivé, mais atteignable au clavier) puis « + ».
    await page.keyboard.press('Tab');
    await expect(
      page.getByRole('button', { name: 'Retirer une feuille de catappa' }),
    ).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(
      page.getByRole('button', { name: 'Ajouter une feuille de catappa' }),
    ).toBeFocused();

    // Section « Décor » : « Éditer le décor » (#167), sur la ligne du titre, puis la case.
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Éditer le décor', exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(decor(page)).toBeFocused();
    await page.keyboard.press('Space');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-decor', 'false');
    expect(errors).toEqual([]);
  });
});
