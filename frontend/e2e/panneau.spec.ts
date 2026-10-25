import { expect, test, type Locator, type Page } from '@playwright/test';

import { PALETTE } from '../src/app/render/palette';

/**
 * Panneau de contrôle (issue #52) : vitesse de simulation, heure de la journée, affichage
 * du décor, population par espèce (#69). Repliable, utilisable au clavier et à 390 px,
 * absent en mode capture.
 */

const hostEl = (page: Page) => page.locator('app-aquarium-host');
const toggle = (page: Page) => page.getByRole('button', { name: 'Réglages' });
const speed = (page: Page) => page.getByRole('slider', { name: 'Vitesse de la simulation' });
const hour = (page: Page) => page.getByRole('slider', { name: 'Heure de la journée' });
const autoHour = (page: Page) => page.getByRole('checkbox', { name: 'Heure automatique' });
const decor = (page: Page) => page.getByRole('checkbox', { name: 'Afficher le décor' });
const count = (page: Page, plural: string) =>
  page.getByRole('spinbutton', { name: `Nombre de ${plural}` });
const population = (page: Page) => hostEl(page).getAttribute('data-aqfish-population');

async function open(page: Page, search = '?seed=42'): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`/${search}`);
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  return errors;
}

async function tick(page: Page): Promise<number> {
  return Number(await hostEl(page).getAttribute('data-aqfish-tick'));
}

function overlaps(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  expect(b, 'élément visible').not.toBeNull();
  return b!;
}

const VEGETATION = new Set<string>([
  PALETTE.vegetationOmbre,
  PALETTE.vegetationSombre,
  PALETTE.vegetation,
  PALETTE.vegetationClaire,
  PALETTE.vegetationLumineuse,
]);

/** Nombre de pixels de végétation (couleurs que les poissons n'ont pas) du canvas. */
async function vegetationPixels(page: Page): Promise<number> {
  const png = (await page.locator('canvas').screenshot({ animations: 'disabled' })).toString(
    'base64',
  );
  return page.evaluate(
    async ({ png, colors }) => {
      const blob = await (await fetch(`data:image/png;base64,${png}`)).blob();
      const bitmap = await createImageBitmap(blob);
      const context = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d');
      if (!context) {
        throw new Error('Contexte 2D indisponible');
      }
      context.drawImage(bitmap, 0, 0);
      const d = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
      const set = new Set(colors);
      let count = 0;
      for (let i = 0; i < d.length; i += 4) {
        const hex =
          '#' + [d[i], d[i + 1], d[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('');
        if (set.has(hex)) {
          count++;
        }
      }
      return count;
    },
    { png, colors: [...VEGETATION] },
  );
}

test.describe('Panneau de contrôle', () => {
  test('fermé par défaut, se déplie au clic ; contrôles nommés', async ({ page }) => {
    const errors = await open(page);
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(speed(page)).toHaveCount(0);
    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('region', { name: 'Réglages de l’aquarium' })).toBeVisible();
    for (const control of [speed(page), hour(page), autoHour(page), decor(page)]) {
      await expect(control).toBeVisible();
    }
    await expect(speed(page)).toHaveAttribute('aria-valuetext', '×1');
    await expect(autoHour(page)).toBeChecked();
    await expect(decor(page)).toBeChecked();
    await toggle(page).click();
    await expect(speed(page)).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('vitesse 0 : la simulation s’arrête, le rendu continue ; ×4 reprend', async ({ page }) => {
    const errors = await open(page);
    await toggle(page).click();
    await speed(page).fill('0');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-speed', '0');
    await expect(speed(page)).toHaveAttribute('aria-valuetext', 'Pause');
    const stopped = await tick(page);
    // Le rendu continue : une transition de caméra avance toujours.
    const before = await hostEl(page).getAttribute('data-aqfish-camera');
    await page.getByRole('button', { name: /vue de dessus/i }).click();
    await expect(hostEl(page)).not.toHaveAttribute('data-aqfish-camera', before!);
    await page.waitForTimeout(1000);
    expect(await tick(page)).toBe(stopped);
    await speed(page).fill('4');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-speed', '4');
    await expect.poll(() => tick(page)).toBeGreaterThan(stopped);
    expect(errors).toEqual([]);
  });

  test('heure : le curseur fige l’éclairage à l’heure choisie, libellé « 14:30 »', async ({
    page,
  }) => {
    const errors = await open(page);
    await toggle(page).click();
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
    await toggle(page).click();
    // Simulation à l'arrêt : seules les images du décor changent.
    await speed(page).fill('0');
    await page.getByRole('button', { name: /vue de face/i }).click();
    await page.waitForTimeout(800);
    const shown = await vegetationPixels(page);
    expect(shown).toBeGreaterThan(500);
    await decor(page).uncheck();
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-decor', 'false');
    await expect.poll(() => vegetationPixels(page)).toBeLessThan(shown * 0.01);
    await decor(page).check();
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-decor', 'true');
    await expect.poll(() => vegetationPixels(page)).toBeGreaterThan(shown * 0.9);
    expect(errors).toEqual([]);
  });

  test('population : « + », « − » et saisie changent les effectifs sans remettre à zéro', async ({
    page,
  }) => {
    const errors = await open(page);
    await toggle(page).click();
    await expect(hostEl(page)).toHaveAttribute(
      'data-aqfish-population',
      'neon:12,guppy:6,corydora:6',
    );
    await expect(count(page, 'néons')).toHaveValue('12');
    await expect.poll(() => tick(page)).toBeGreaterThan(30);
    const before = await tick(page);
    await page.getByRole('button', { name: 'Ajouter un néon' }).click();
    await expect(hostEl(page)).toHaveAttribute(
      'data-aqfish-population',
      'neon:13,guppy:6,corydora:6',
    );
    await expect(count(page, 'néons')).toHaveValue('13');
    await page.getByRole('button', { name: 'Retirer un corydora' }).click();
    await count(page, 'guppys').fill('2');
    await count(page, 'guppys').press('Enter');
    await expect(hostEl(page)).toHaveAttribute(
      'data-aqfish-population',
      'neon:13,guppy:2,corydora:5',
    );
    // Hors bornes : ramené au maximum de l'espèce, affiché dans le champ.
    await count(page, 'néons').fill('500');
    await count(page, 'néons').press('Enter');
    await expect(count(page, 'néons')).toHaveValue('40');
    await expect(page.getByRole('button', { name: 'Ajouter un néon' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(await population(page)).toBe('neon:40,guppy:2,corydora:5');
    // Le temps n'est pas remis à zéro, et la simulation continue.
    const after = await tick(page);
    expect(after).toBeGreaterThanOrEqual(before);
    await expect.poll(() => tick(page)).toBeGreaterThan(after);
    expect(errors).toEqual([]);
  });

  test('population au clavier : Tab jusqu’aux boutons et au champ, flèches comprises', async ({
    page,
  }) => {
    const errors = await open(page);
    await toggle(page).click();
    await decor(page).focus();
    // Le bouton « Granulés » (#117) partage la ligne du décor : il vient juste après.
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: /^Granulés : / })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Retirer un néon' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(hostEl(page)).toHaveAttribute(
      'data-aqfish-population',
      'neon:11,guppy:6,corydora:6',
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
      'neon:13,guppy:6,corydora:6',
    );
    await page.keyboard.press('Space');
    await expect(hostEl(page)).toHaveAttribute(
      'data-aqfish-population',
      'neon:14,guppy:6,corydora:6',
    );
    // Les chiffres tapés dans le champ ne déclenchent pas les raccourcis de vue (1 à 5).
    const camera = await hostEl(page).getAttribute('data-aqfish-camera');
    await count(page, 'guppys').focus();
    await page.keyboard.press('1');
    await page.waitForTimeout(300);
    expect(await hostEl(page).getAttribute('data-aqfish-camera')).toBe(camera);
    expect(errors).toEqual([]);
  });

  test('au clavier : Tab jusqu’au bouton, Entrée, puis chaque contrôle', async ({ page }) => {
    // Une vingtaine de touches, chacune suivie d'une image en rendu logiciel : avec la section
    // « Eau » (#207), le parcours dépasse le délai par défaut de 2 min en local.
    test.setTimeout(240_000);
    const errors = await open(page);
    let reached = false;
    for (let i = 0; i < 40 && !reached; i++) {
      await page.keyboard.press('Tab');
      reached = await toggle(page).evaluate((el) => el === document.activeElement);
    }
    expect(reached, 'bouton « Réglages » atteint par Tab').toBe(true);
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

    // Section « Eau » (#207) : « Changer l’eau », sur la ligne du titre, puis le chauffage.
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Changer l’eau' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('slider', { name: 'Consigne du chauffage' })).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-water', /^[a-z-]+;[\d.]+;25\.5;/);

    // Section « Décor » : « Éditer le décor » (#167), sur la ligne du titre, puis la case.
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Éditer le décor', exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(decor(page)).toBeFocused();
    await page.keyboard.press('Space');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-decor', 'false');
    expect(errors).toEqual([]);
  });

  test('à 390 px : panneau ouvert entier, sans masquer la barre des préréglages', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await open(page);
    await toggle(page).click();
    const panel = await box(page.locator('section.control-panel'));
    const button = await box(toggle(page));
    for (const b of [panel, button]) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(390);
    }
    const bar = await box(page.locator('.view-presets-bar'));
    const indicator = await box(page.getByRole('img', { name: /Moment de la journée/ }));
    const help = await box(page.locator('app-commands-help button').first());
    for (const b of [panel, button]) {
      expect(overlaps(b, bar), 'barre des préréglages').toBe(false);
      expect(overlaps(b, indicator), 'indicateur du moment').toBe(false);
      expect(overlaps(b, help), 'aide-mémoire').toBe(false);
    }
    // Population (#69) : chaque ligne entière dans le panneau, contrôles de taille tactile.
    const rows = page.locator('[data-section="population"] .control-panel__count');
    await expect(rows).toHaveCount(3);
    for (let i = 0; i < 3; i++) {
      const row = await box(rows.nth(i));
      expect(row.x).toBeGreaterThanOrEqual(panel.x);
      expect(row.x + row.width).toBeLessThanOrEqual(panel.x + panel.width);
      for (const control of await rows.nth(i).locator('button, input').all()) {
        const b = await box(control);
        expect(b.x + b.width).toBeLessThanOrEqual(panel.x + panel.width);
        expect(b.height).toBeGreaterThanOrEqual(28);
      }
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
