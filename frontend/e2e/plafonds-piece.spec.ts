import { expect, test, type Page } from '@playwright/test';

/**
 * Plafonds de performance de la pièce (#392, lot 4 de #264, ADR 0096) : au plafond
 * d'animaux de la pièce (240, tous bacs confondus), la section « Population » le dit et
 * l'ajout est sans effet ; retirer un animal reste possible.
 *
 * Tropical (en soins), récif et paludarium (en mode décor, où toute espèce s'ajoute, #278)
 * à 60 animaux, le plafond d'un bac ; bassin à ses 7 koïs de départ ; puis l'eau froide, en
 * décor, ne peut plus en prendre que 53 : c'est la pièce qui bloque, pas le bac.
 */

const hostEl = (page: Page) => page.locator('app-aquarium-host');
const bacs = (page: Page) => page.locator('[data-section="bacs"]');
const notice = (page: Page) => page.locator('[data-section="population"] [data-room-cap]');

/** Effectifs lus dans `data-aqfish-population` (« neon:8,guppy:6… »). */
async function counts(page: Page): Promise<Record<string, number>> {
  const raw = (await hostEl(page).getAttribute('data-aqfish-population')) ?? '';
  return Object.fromEntries(
    raw
      .split(',')
      .filter((part) => part.includes(':'))
      .map((part) => {
        const [species, n] = part.split(':');
        return [species, Number(n)];
      }),
  );
}

async function total(page: Page): Promise<number> {
  return Object.values(await counts(page)).reduce((a, b) => a + b, 0);
}

/** Saisit un effectif trop grand : l'hôte le ramène à la place restante. */
async function fillMax(page: Page, species: string): Promise<void> {
  const field = page.locator(`[data-species="${species}"] input[type="number"]`);
  await field.fill('99');
  await field.press('Enter');
}

/**
 * Remplit le bac affiché avec des néons (40 au plus) puis des guppys (20 au plus) : 60
 * animaux, le plafond d'un bac, depuis un bac de départ d'au plus 20 animaux hors néons et
 * guppys ; moins si la pièce n'a plus de place.
 */
async function fillTank(page: Page): Promise<void> {
  await fillMax(page, 'neon');
  await fillMax(page, 'guppy');
}

async function decorMode(page: Page): Promise<void> {
  await bacs(page).locator('[data-care-mode-toggle]').click();
  await page
    .locator('[data-care-mode-confirm]')
    .getByRole('button', { name: 'Passer en mode décor' })
    .click();
  await expect(hostEl(page)).toHaveAttribute('data-aqfish-mode', 'decor');
}

test.describe('Plafonds de la pièce (#392)', () => {
  // Rendu logiciel des tests : chaque changement d'effectif redessine le bac (lent).
  test.setTimeout(480_000);

  test('au plafond d’animaux, le message est visible et l’ajout est sans effet', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    await page.getByRole('button', { name: 'Réglages' }).click();
    await expect(page.locator('section.control-panel')).toBeVisible();
    await page.getByRole('slider', { name: 'Vitesse de la simulation' }).fill('0');
    const environment = page.getByRole('combobox', { name: 'Environnement', exact: true });

    await test.step('trois bacs à 60, le bassin à 7 : 187 animaux, sous le plafond', async () => {
      await fillTank(page);
      await expect.poll(() => total(page)).toBe(60);
      await expect(notice(page)).toHaveCount(0);
      for (const id of ['recif', 'paludarium']) {
        await environment.selectOption(id);
        await expect(hostEl(page)).toHaveAttribute('data-aqfish-environment', id);
        await decorMode(page);
        await fillTank(page);
        await expect.poll(() => total(page)).toBe(60);
      }
      await environment.selectOption('bassin');
      await expect(hostEl(page)).toHaveAttribute('data-aqfish-environment', 'bassin');
      await expect.poll(() => total(page)).toBe(7);
      await expect(notice(page)).toHaveCount(0);
    });

    await test.step('eau froide : la pièce, pas le bac, arrête l’ajout à 53 (240 en tout)', async () => {
      await environment.selectOption('eaufroide');
      await expect(hostEl(page)).toHaveAttribute('data-aqfish-environment', 'eaufroide');
      await decorMode(page);
      await fillTank(page);
      // 60 − 7 − 3 × 60 = 53 : le bac pourrait en prendre 60, la pièce est à 240.
      await expect.poll(() => total(page)).toBe(53);
      await expect(notice(page)).toHaveText(
        'Plafond de la pièce atteint : 240 animaux au plus, tous bacs confondus.',
      );
      const before = await counts(page);
      const add = page.locator('[data-species="danio"] button[aria-label^="Ajouter"]');
      await expect(add).toHaveAttribute('aria-disabled', 'true');
      await add.dispatchEvent('click'); // aria-disabled : Playwright refuse click() (PIEGES)
      await fillMax(page, 'danio');
      await expect(hostEl(page)).toHaveAttribute('data-aqfish-environment', 'eaufroide');
      expect(await counts(page)).toEqual(before);
    });

    await test.step('retirer un animal fait disparaître le message ; le rajouter le rétablit', async () => {
      await page.locator('[data-species="neon"] button[aria-label^="Retirer"]').click();
      await expect.poll(() => total(page)).toBe(52);
      await expect(notice(page)).toHaveCount(0);
      await page.locator('[data-species="neon"] button[aria-label^="Ajouter"]').click();
      await expect.poll(() => total(page)).toBe(53);
      await expect(notice(page)).toBeVisible();
    });
    expect(errors).toEqual([]);
  });
});
