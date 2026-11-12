import { expect, test, type Page } from '@playwright/test';

/**
 * Lampe du bac (issue #584) : intensité exposée (`data-aqfish-lamp`) selon l'heure figée
 * (`heure=`), fondu à l'allumage, réglages « Éclairage » et « Lampe » de la section « Eau »,
 * lisibles sans débordement horizontal, et changement net avec « Réduire les mouvements ».
 *
 * Lampe par défaut : allumée à 10 h pour 8 h (10:00 → 18:00), fondu d'une demi-heure.
 */

const hostEl = (page: Page) => page.locator('app-aquarium-host');
const section = (page: Page) => page.locator('[data-section="eau"]');

async function open(page: Page, search: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`/${search}`);
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  return errors;
}

async function openSettings(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Réglages' }).click();
  await expect(section(page)).toBeVisible();
}

/** Vrai si ni la page ni la section « Eau » ne défilent horizontalement. */
async function noHorizontalOverflow(page: Page): Promise<boolean> {
  const pageOk = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );
  const sectionOk = await section(page).evaluate((el) => el.scrollWidth <= el.clientWidth);
  return pageOk && sectionOk;
}

test.describe('lampe du bac (#584)', () => {
  test('intensité selon l’heure : midi allumée, minuit éteinte, fondu à l’allumage', async ({
    page,
  }) => {
    const errors = await open(page, '?heure=12');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-lamp', '1.00');
    await open(page, '?heure=0');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-lamp', '0.00');
    await open(page, '?heure=10.25');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-lamp', '0.50');
    expect(errors).toEqual([]);
  });

  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 390, height: 844 },
  ]) {
    test(`réglages lisibles à ${viewport.width} px, allumage enregistré`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const errors = await open(page, '?heure=12');
      await openSettings(page);
      const duration = section(page).locator('[data-lighting]');
      const lampOn = section(page).locator('[data-lamp-on]');
      await expect(duration).toHaveAttribute('min', '4');
      await expect(duration).toHaveAttribute('max', '14');
      await expect(lampOn).toHaveAttribute('aria-valuetext', 'allumée à 10:00');
      await lampOn.scrollIntoViewIfNeeded();
      await expect(lampOn).toBeInViewport();
      await expect(section(page).getByText('allumée à 10:00')).toBeVisible();
      expect(await noHorizontalOverflow(page)).toBe(true);
      // Allumage à 20 h : à midi, la lampe est éteinte.
      await lampOn.fill('20');
      await expect(lampOn).toHaveAttribute('aria-valuetext', 'allumée à 20:00');
      await expect(hostEl(page)).toHaveAttribute('data-aqfish-lamp', '0.00');
      expect(await noHorizontalOverflow(page)).toBe(true);
      expect(errors).toEqual([]);
    });
  }
});

test.describe('lampe du bac (#584), mouvements réduits', () => {
  // `reducedMotion` passe par les options du contexte (voir `mouvements-reduits.spec.ts`).
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('« Réduire les mouvements » : pas de fondu, changement net', async ({ page }) => {
    const errors = await open(page, '?heure=10.25');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-lamp', '1.00');
    await open(page, '?heure=17.9');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-lamp', '1.00');
    await open(page, '?heure=18');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-lamp', '0.00');
    expect(errors).toEqual([]);
  });
});
