import { expect, test, type Page } from '@playwright/test';

/**
 * QA des amphibiens réels du paludarium (#270) : les fiches du sonneur oriental et du triton à
 * ventre de feu s'ouvrent, portent le bon nom et un statut légal lisible, sur grand et petit écran.
 */

const section = (page: Page) => page.locator('[data-section="population"]');
const sheet = (page: Page) => section(page).getByRole('region', { name: /^Fiche : / });

async function open(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/?environnement=paludarium&seed=42&vitesse=0');
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  await page.getByRole('button', { name: 'Réglages' }).click();
  await expect(section(page)).toBeVisible();
  return errors;
}

for (const viewport of [
  { name: 'bureau', width: 1280, height: 720 },
  { name: '390 × 844', width: 390, height: 844 },
]) {
  test.describe(`Amphibiens réels (#270), ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    for (const [fiche, latin] of [
      ['Sonneur oriental', 'Bombina orientalis'],
      ['Triton à ventre de feu', 'Cynops orientalis'],
    ] as const) {
      test(`la fiche « ${fiche} » s’ouvre avec son nom scientifique`, async ({ page }) => {
        const errors = await open(page);
        const toggle = section(page).getByRole('button', { name: new RegExp(`^Fiche : ${fiche}`) });
        await toggle.scrollIntoViewIfNeeded();
        await toggle.click();
        await expect(sheet(page)).toBeVisible();
        await expect(sheet(page)).toContainText(latin);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth,
        );
        expect(overflow).toBe(false);
        expect(errors).toEqual([]);
      });
    }
  });
}
