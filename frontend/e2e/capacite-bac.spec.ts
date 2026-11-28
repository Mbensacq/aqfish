import { expect, test, type Page } from '@playwright/test';

import { createDayClock } from '../src/app/sim/daylight';
import { environmentById } from '../src/app/sim/environment';
import { populationLimits, setPopulation } from '../src/app/sim/population';
import { serializeWorld } from '../src/app/sim/save';
import { populationOf } from '../src/app/sim/tank-capacity';
import { capacityLimits, tankCapacity } from '../src/app/sim/tank-capacity-limits';
import { createDefaultWorld } from '../src/app/sim/world';
import { openScene, startEditing } from './outils-decor';
import { fermerReglages, ouvrirReglages } from './outils-panneau';

/**
 * Capacité du bac branchée sur l'interface (#809, tranche 2 de #729, ADR 0172) : en mode
 * soins, un compteur s'arrête à la capacité et dit pourquoi ; en mode décor, aucune
 * contrainte ; une sauvegarde trop pleine est signalée à l'import sans perdre d'animal ; le
 * bilan donne l'occupation.
 */

const hostEl = (page: Page) => page.locator('app-aquarium-host');
const section = (page: Page) => page.locator('[data-section="population"]');
const kuhlis = (page: Page) => page.locator('[data-species="kuhli"] input[type="number"]');

/** Effectif d'une espèce lu dans `data-aqfish-population` (« neon:8,guppy:6… »). */
async function count(page: Page, species: string): Promise<number> {
  const raw = (await hostEl(page).getAttribute('data-aqfish-population')) ?? '';
  const entry = raw.split(',').find((part) => part.startsWith(`${species}:`));
  return Number(entry?.split(':')[1] ?? 0);
}

/** Effectif maximal des loches kuhli du bac tropical par défaut et la raison du refus. */
function expectedKuhli(): { max: number; reason: string | undefined } {
  const world = createDefaultWorld(42);
  const { liters } = tankCapacity(world);
  const { limits, reasons } = capacityLimits(
    { liters, population: populationOf(world) },
    environmentById(world.environment).species,
    populationLimits(world),
  );
  return { max: limits.kuhli, reason: reasons.kuhli };
}

test.describe('Capacité du bac (#809)', () => {
  test.setTimeout(240_000);

  test('mode soins : compteur borné à la capacité, refus chiffré ; mode décor libre', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const expected = expectedKuhli();
    // Le bac par défaut bloque les loches kuhli par la capacité, pas par un plafond technique.
    expect(expected.reason).toMatch(/loche kuhli adulte de .* cm demande/);
    await page.goto('/?seed=42&vitesse=0');
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    await ouvrirReglages(page, 'Population');
    await expect(section(page).locator('[data-capacity]')).toContainText('% de la capacité');
    await expect(section(page).locator('[data-capacity]')).toContainText(
      'd’eau réelle (288 L bruts',
    );

    await test.step('soins : au-delà de la capacité, l’effectif est ramené et « + » refuse', async () => {
      await kuhlis(page).fill('99');
      await kuhlis(page).press('Enter');
      await expect.poll(() => count(page, 'kuhli')).toBe(expected.max);
      const plus = page.getByRole('button', { name: 'Ajouter une loche kuhli' });
      await expect(plus).toHaveAttribute('aria-disabled', 'true');
      await plus.dispatchEvent('click'); // aria-disabled : Playwright refuse click() (PIEGES)
      await expect.poll(() => count(page, 'kuhli')).toBe(expected.max);
      await expect(section(page).locator('[data-capacity-refusal="kuhli"]')).toHaveText(
        expected.reason!,
      );
      expect(Number(await hostEl(page).getAttribute('data-aqfish-capacity'))).toBeLessThanOrEqual(
        100,
      );
    });

    await test.step('bilan : occupation en tête', async () => {
      await fermerReglages(page);
      await page.getByRole('button', { name: 'Bilan du bac' }).click();
      await expect(page.locator('[data-review-capacity]')).toContainText('% de la capacité');
      await page.getByRole('button', { name: 'Bilan du bac' }).click();
    });

    await test.step('décor : aucune contrainte de capacité', async () => {
      await ouvrirReglages(page, 'Bac et milieu');
      await page.locator('[data-section="bacs"] [data-care-mode-toggle]').click();
      await page
        .locator('[data-care-mode-confirm]')
        .getByRole('button', { name: 'Passer en mode décor' })
        .click();
      await expect(hostEl(page)).toHaveAttribute('data-aqfish-mode', 'decor');
      await ouvrirReglages(page, 'Population');
      await page.getByRole('button', { name: 'Ajouter une loche kuhli' }).click();
      await expect.poll(() => count(page, 'kuhli')).toBe(expected.max + 1);
      await expect(section(page).locator('[data-capacity-refusal]')).toHaveCount(0);
      await expect(section(page).locator('[data-capacity]')).toContainText(
        'Mode décor : capacité non contrôlée',
      );
    });
    expect(errors).toEqual([]);
  });

  test('import d’une sauvegarde trop pleine : alerte, aucun animal retiré', async ({ page }) => {
    await page.goto('/?seed=42&vitesse=0');
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    const packed = setPopulation(setPopulation(createDefaultWorld(42), 'neon', 40), 'guppy', 20);
    const text = serializeWorld(packed, { speed: 0, clock: createDayClock(12, 1200, true) });
    await ouvrirReglages(page, 'Sauvegarde et partage');
    await page.locator('[data-section="sauvegarde"] input[type="file"]').setInputFiles({
      name: 'trop-plein.json',
      mimeType: 'application/json',
      buffer: Buffer.from(text),
    });
    await expect(page.locator('[data-section="sauvegarde"]')).toContainText(
      'Bac au-delà de sa capacité',
    );
    await expect.poll(() => count(page, 'neon')).toBe(40);
    await ouvrirReglages(page, 'Population');
    await expect(section(page).locator('[data-capacity-alert]')).toContainText(
      'Aucun animal n’a été retiré',
    );
    await expect(page.getByRole('button', { name: 'Ajouter un néon' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });
});

/**
 * Scénario S3 jouable (#862, ADR 0190) : au bac d'eau froide, sans axolotl, un poisson rouge
 * adulte dans environ 120 L ; le « + » du poisson rouge est refusé avec la raison OATA.
 */

/** Règle l'effectif de `species` par son champ numérique. */
async function setCount(page: Page, species: string, value: number): Promise<void> {
  await page.locator(`[data-species="${species}"] input[type="number"]`).fill(String(value));
  await page.locator(`[data-species="${species}"] input[type="number"]`).press('Enter');
  await expect.poll(() => count(page, species)).toBe(value);
}

test.describe('Capacité : poisson rouge en bac d’eau froide (#862)', () => {
  // Rendu logiciel lent : le redimensionnement recrée la vue (comme `dimensions-bac.spec.ts`).
  test.use({ viewport: { width: 800, height: 500 } });
  test.setTimeout(300_000);

  test('80 × 40 × 50 cm et un poisson rouge : le deuxième est refusé (OATA)', async ({ page }) => {
    const errors = await openScene(page, '?environnement=eaufroide&seed=42&vitesse=0');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-environment', 'eaufroide');

    await test.step('bac redimensionné à environ 120 L', async () => {
      await startEditing(page);
      for (const [key, cm] of [
        ['width', 80],
        ['depth', 40],
        ['height', 50],
      ] as const) {
        await page.locator(`[data-dimension="${key}"]`).fill(String(cm));
      }
      await expect(hostEl(page)).toHaveAttribute('data-aqfish-tank', '0.8:0.5:0.4');
      await page.getByRole('button', { name: 'Terminer' }).click();
      await expect(hostEl(page)).toHaveAttribute('data-aqfish-editing', 'false');
    });

    await test.step('sans axolotl, un poisson rouge : « + » refusé, raison OATA', async () => {
      await ouvrirReglages(page, 'Population');
      await setCount(page, 'axolotl', 0);
      await setCount(page, 'rouge', 1);
      const plus = page.getByRole('button', { name: 'Ajouter un poisson rouge' });
      await expect(plus).toHaveAttribute('aria-disabled', 'true');
      await plus.dispatchEvent('click'); // aria-disabled : Playwright refuse click() (PIEGES)
      await expect.poll(() => count(page, 'rouge')).toBe(1);
      await expect(section(page).locator('[data-capacity-refusal="rouge"]')).toHaveText(
        /^\s*1\d\d,\d L : un poisson rouge adulte demande 100 L, puis 50 L par poisson rouge en plus \(OATA\) ; il faudrait 150 L\s*$/,
      );
      await expect(section(page).locator('[data-capacity]')).toContainText('% de la capacité');
    });
    expect(errors).toEqual([]);
  });
});
