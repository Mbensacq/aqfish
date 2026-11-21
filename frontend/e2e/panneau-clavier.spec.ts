import { expect, test, type Page } from '@playwright/test';

import {
  SETTINGS_CATEGORIES,
  type SettingsCategoryId,
} from '../src/app/ui/settings-window/settings-categories';

import {
  autoHour,
  count,
  decor,
  hostEl,
  hour,
  open,
  openPanel,
  ouvrirReglages,
  speed,
  toggle,
} from './outils-panneau';

/**
 * Panneau de contrôle « Réglages » au clavier (#52, #69) : Tab et flèches dans la population
 * et dans chaque section. Séparé de `panneau.spec.ts` pour la répartition de la CI (#600).
 *
 * Fenêtre des réglages (#722) : une catégorie à la fois ; dans la fenêtre, Tab parcourt
 * « Fermer », la recherche, les catégories, puis le contenu de la catégorie ouverte.
 */

/**
 * Ouvre la catégorie `id`, place le focus sur son bouton dans la liste, puis Tab jusqu'au
 * premier contrôle de son contenu (après les catégories suivantes de la liste).
 */
async function tabIntoCategory(page: Page, id: SettingsCategoryId): Promise<void> {
  const index = SETTINGS_CATEGORIES.findIndex((category) => category.id === id);
  await ouvrirReglages(page, SETTINGS_CATEGORIES[index].title);
  await page.locator(`[data-settings-category="${id}"]`).focus();
  for (let k = index + 1; k <= SETTINGS_CATEGORIES.length; k++) {
    await page.keyboard.press('Tab');
  }
}

test.describe('Panneau de contrôle', () => {
  test('population au clavier : Tab jusqu’aux boutons et au champ, flèches comprises', async ({
    page,
  }) => {
    const errors = await open(page);
    await ouvrirReglages(page, 'Décor');
    await decor(page).focus();
    // Le bouton « Granulés » (#117) partage la ligne du décor : il vient juste après.
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: /^Granulés : / })).toBeFocused();
    // Catégorie « Accessibilité » (#406) : sa seule case, juste après la liste.
    await tabIntoCategory(page, 'accessibilite');
    await expect(page.getByRole('checkbox', { name: 'Réduire les mouvements' })).toBeFocused();
    // Catégorie « Son » (#411) : la case puis le volume, sur la même ligne.
    await tabIntoCategory(page, 'son');
    await expect(page.getByRole('checkbox', { name: "Sons d'ambiance" })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('slider', { name: "Volume des sons d'ambiance" })).toBeFocused();
    // Catégorie « Population » : les quatre filtres, puis le tri (#723), puis la première
    // tuile : bouton « Fiche » (#237), sur la ligne du nom, avant « − ».
    await tabIntoCategory(page, 'population');
    for (const filter of ['Toutes', 'Dans le bac', 'Poissons', 'Invertébrés']) {
      await expect(page.getByRole('button', { name: filter, exact: true })).toBeFocused();
      await page.keyboard.press('Tab');
    }
    await expect(page.getByRole('combobox', { name: 'Trier par' })).toBeFocused();
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
    // Un appui de trop peut sortir de la page (après « Pharmacie », vers le navigateur) sans
    // être consigné : on revient en arrière jusqu'au bouton, au plus un appui de plus que le
    // journal n'en compte (#722, raclette et sécateur dans la barre : deux arrêts de plus).
    const isFocused = () => toggle(page).evaluate((el) => el === document.activeElement);
    for (let k = at + 1; k <= length && !(await isFocused()); k++) {
      await page.keyboard.press('Shift+Tab');
    }
    await expect(toggle(page)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
    // Fenêtre des réglages (#722) : le focus entre sur la catégorie ouverte, « Bac et milieu ».
    await expect(page.locator('[data-settings-category="bac"]')).toBeFocused();

    // Premier contrôle, après les autres catégories : la liste des environnements (#87,
    // testée dans environnement.spec.ts).
    for (let k = 1; k < SETTINGS_CATEGORIES.length; k++) await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('combobox', { name: 'Environnement' })).toBeFocused();

    // Case « Afficher la pièce » (#187), sous la liste, dans le bac tropical.
    await page.keyboard.press('Tab');
    await expect(page.getByRole('checkbox', { name: 'Afficher la pièce' })).toBeFocused();
    await page.keyboard.press('Space');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-room', 'true');

    // Catégorie « Temps » : bouton « Mode immersif » (#345), sur la ligne du titre
    // « Simulation ».
    await tabIntoCategory(page, 'temps');
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
    // Catégorie « Eau et matériel », premier contrôle après la liste des catégories.
    await tabIntoCategory(page, 'eau');

    // Section « Eau » (#207) : « Courant » (#460) et « Changer l’eau », sur la ligne du titre,
    // puis le chauffage, l'éclairage (#476), la lampe (#584) et l'amorce de bactéries (#529) ;
    // raclette et sécateur sont dans la barre du bas (#722).
    await expect(
      page.getByRole('button', { name: 'Courant : coupé, changer de force' }),
    ).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Changer l’eau' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('slider', { name: 'Consigne du chauffage' })).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-water', /^[a-z-]+;[\d.]+;24\.5;/);
    // Éclairage (#476), sous le chauffage.
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
    // Amorce de bactéries (#529), sous la lampe.
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
    await ouvrirReglages(page, 'Eau et matériel');
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

    // Catégorie « Décor » : « Éditer le décor » (#167), sur la ligne du titre, puis la case.
    await tabIntoCategory(page, 'decor');
    await expect(page.getByRole('button', { name: 'Éditer le décor', exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(decor(page)).toBeFocused();
    await page.keyboard.press('Space');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-decor', 'false');
    expect(errors).toEqual([]);
  });
});
