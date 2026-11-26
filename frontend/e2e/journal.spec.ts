import { expect, test, type Locator, type Page } from '@playwright/test';

import { createDayClock } from '../src/app/sim/daylight';
import { JOURNAL_VERSION, careSessionEntry, freshWaterEntry } from '../src/app/sim/journal';
import { serializeWorld } from '../src/app/sim/save';
import { createDefaultWorld } from '../src/app/sim/world';
import { fermerReglages, ouvrirReglages } from './outils-panneau';

/**
 * Journal du bac : reproduction et entretien (issue #655). Un bac importé porte déjà une
 * ponte, une naissance, une séance et une taille ; un changement d'eau fait depuis
 * l'interface s'y ajoute. Le journal s'ouvre depuis le bilan, se filtre par type, et tient
 * sur un téléphone sans texte coupé ni empiéter sur le centre du bac. Le bilan de reproduction
 * des sept derniers jours (#677) s'affiche dans le bilan et sous le filtre « Reproduction », et
 * le filtre choisi survit au rechargement.
 */
async function openWithJournal(page: Page, days = 0): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  await page.goto('/?seed=42&vitesse=0');
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  const world = {
    ...createDefaultWorld(42),
    journal: {
      version: JOURNAL_VERSION,
      entries: [
        { time: 100, kind: 'ponte', detail: 'corydora', count: 4 },
        { time: 1300, kind: 'naissance', detail: 'guppy', count: 2 },
        careSessionEntry(2500),
        { time: 2510, kind: 'taille', count: 3 },
        freshWaterEntry(2520),
        // Journal long (téléphone) : une séance par jour ensuite.
        ...Array.from({ length: days }, (_, day) => careSessionEntry(3600 + day * 1200)),
        // … puis une éclosion récente, dans la période du bilan de reproduction (#677).
        ...(days > 0
          ? [{ time: 3600 + days * 1200, kind: 'eclosion', detail: 'corydora', count: 3 }]
          : []),
      ],
    },
  } as Parameters<typeof serializeWorld>[0];
  const text = serializeWorld(world, { speed: 0, clock: createDayClock(12, 1200, true) });
  await ouvrirReglages(page, 'Sauvegarde et partage');
  await page.locator('[data-section="sauvegarde"] input[type="file"]').setInputFiles({
    name: 'journal.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });
  await ouvrirReglages(page, 'Eau et matériel');
  await page.getByRole('button', { name: 'Changer l’eau' }).click();
  await fermerReglages(page);
  await page.locator('[data-review]').click();
  await expect(page.locator('[data-review-detail] [data-reproduction-summary]')).toBeVisible();
  await page.locator('[data-journal]').click();
  return errors;
}

const lines = (page: Page) => page.locator('[data-journal-detail] li');
const reproduction = (page: Page) => page.locator('[data-reproduction-summary]');

test('journal : ouvert depuis le bilan, filtré par type, lignes datées avec icône', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors = await openWithJournal(page);
  // Du plus récent au plus ancien ; le changement d'eau, fait au temps 0 du bac importé, en
  // dernier.
  await expect(lines(page)).toHaveCount(6);
  await expect(lines(page).first()).toContainText('Jour 3 : Eau neuve versée');
  await expect(lines(page).nth(1)).toContainText('Taille des plantes (3 coupes)');
  await expect(lines(page).nth(2)).toContainText('Séance d’entretien terminée');
  await expect(lines(page).nth(3)).toContainText('Jour 2 : Naissance : 2 alevins (Guppy)');
  await expect(lines(page).nth(4)).toContainText('Jour 1 : Ponte : 4 œufs (Corydora)');
  await expect(lines(page).last()).toContainText('Jour 1 : Changement d’eau');
  for (const line of await lines(page).all()) {
    await expect(line.locator('svg rect').first()).toBeAttached();
  }

  await page.locator('[data-journal-filter="reproduction"]').click();
  await expect(page.locator('[data-journal-filter="reproduction"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(lines(page)).toHaveCount(2);
  await expect(lines(page).first()).toHaveAttribute('data-journal-kind', 'naissance');
  await expect(lines(page).last()).toHaveAttribute('data-journal-kind', 'ponte');
  // Bilan de reproduction (#677) : une ligne par espèce, dans l'ordre du catalogue.
  await expect(reproduction(page)).toHaveText(
    'Reproduction, 7 derniers jours : Guppy, 1 naissance (2 alevins) ; Corydora, 1 ponte (4 œufs).',
  );

  await page.locator('[data-journal-filter="entretien"]').click();
  await expect(lines(page)).toHaveCount(4);
  await expect(
    page.locator('[data-journal-detail] [data-journal-group="reproduction"]'),
  ).toHaveCount(0);

  // Aucun événement du type : liste vide, « rien à signaler ».
  await page.locator('[data-journal-filter="alertes"]').click();
  await expect(lines(page)).toHaveCount(0);
  await expect(page.locator('[data-journal-empty]')).toHaveText('Rien à signaler.');

  await page.locator('[data-journal-filter="tout"]').click();
  await expect(lines(page)).toHaveCount(6);
  await expect(reproduction(page)).toHaveCount(0);

  // Filtre retenu au rechargement (#677).
  await page.locator('[data-journal-filter="entretien"]').click();
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  await page.locator('[data-review]').click();
  await page.locator('[data-journal]').click();
  await expect(page.locator('[data-journal-filter="entretien"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('[data-journal-filter][aria-pressed="true"]')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('390 × 844 : journal filtré lisible, sans texte coupé, centre du bac dégagé (#265)', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = await openWithJournal(page, 40);
  await expect(lines(page)).toHaveCount(47);
  await page.locator('[data-journal-filter="reproduction"]').click();
  await expect(lines(page)).toHaveCount(3);
  // Bilan de reproduction (#677) : seule l'éclosion récente est dans les sept derniers jours.
  await expect(reproduction(page)).toHaveText(
    'Reproduction, 7 derniers jours : Corydora, 1 éclosion (3 alevins).',
  );
  await checkPhoneLayout(page, [reproduction(page), ...(await lines(page).all())]);
  const captureDir = process.env['CAPTURE_DIR'];
  if (captureDir) {
    await page.screenshot({ path: `${captureDir}/journal-reproduction-390.png` });
  }
  await page.locator('[data-journal-filter="tout"]').click();
  await expect(lines(page)).toHaveCount(47);
  const detail = page.locator('[data-journal-detail]');
  // Aucun texte coupé : rien ne déborde en largeur, ni la page ni une ligne ou un bouton.
  await checkPhoneLayout(page, [
    ...(await lines(page).all()).slice(0, 8),
    ...(await page.locator('[data-journal-filter]').all()),
  ]);
  if (captureDir) {
    await page.screenshot({ path: `${captureDir}/journal-390.png` });
  }
  // La liste défile : la dernière ligne reste atteignable.
  await lines(page).last().scrollIntoViewIfNeeded();
  await expect(lines(page).last()).toBeInViewport();
  await expect(detail).toBeInViewport();
  expect(errors).toEqual([]);
});

/**
 * Téléphone (390 × 844) : `elements` sans texte coupé ni débord ; centre du bac dégagé. Même
 * avec 47 lignes, le journal (liste défilante) reste dans le bas de la zone de rendu, sous le
 * bac (à 390 × 844, le bac s'arrête vers 565 px). Le rectangle de 60 % × 60 % du bandeau replié
 * (tableau-de-bord-sante) n'est pas tenable par un détail déplié : le bandeau seul en occupe
 * déjà le bas (voir la PR #655).
 */
async function checkPhoneLayout(page: Page, elements: readonly Locator[]): Promise<void> {
  for (const element of elements) {
    const fits = await element.evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
    expect(fits, `texte coupé : ${await element.textContent()}`).toBe(true);
    const box = (await element.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
  }
  const canvas = (await page.locator('app-aquarium-host canvas').boundingBox())!;
  const panel = (await page.locator('[data-review-detail]').boundingBox())!;
  expect(panel.y, 'journal sur le bac').toBeGreaterThanOrEqual(canvas.y + 0.7 * canvas.height);
  expect(panel.y + panel.height).toBeLessThanOrEqual(844);
}
