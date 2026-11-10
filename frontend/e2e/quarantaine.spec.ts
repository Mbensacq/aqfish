import { expect, test, type Page } from '@playwright/test';

/**
 * Bac de quarantaine (#547) : depuis la liste des bacs, au clavier seulement, installer la
 * quarantaine, y transférer un néon malade, le soigner là (le bac affiché reste sans produit),
 * puis le ramener avec le rappel d'acclimatation. Simulation à l'arrêt.
 */

const hostEl = (page: Page) => page.locator('app-aquarium-host');
const list = (page: Page) => page.locator('[data-section="bacs"]');
const quarantine = (page: Page) => page.locator('[data-quarantine]');
const notice = (page: Page) => list(page).locator('[data-transfer-notice]');

/** Effectif d'une espèce lu dans `data-aqfish-population` (« neon:8;guppy:6… »). */
async function count(page: Page, species: string): Promise<number> {
  const raw = (await hostEl(page).getAttribute('data-aqfish-population')) ?? '';
  const entry = raw.split(/[;,]/).find((part) => part.startsWith(`${species}`));
  return Number(entry?.split(/[:=]/)[1] ?? NaN);
}

/** Donne le focus à `selector` puis l'active au clavier (Entrée), sans souris. */
async function press(page: Page, selector: string): Promise<void> {
  await page.locator(selector).focus();
  await page.keyboard.press('Enter');
}

/** Choisit `value` dans la liste `selector` après lui avoir donné le focus. */
async function choose(page: Page, selector: string, value: string): Promise<void> {
  const select = page.locator(selector);
  await select.focus();
  await select.selectOption(value);
  await expect(select).toHaveValue(value);
}

test.describe('Bac de quarantaine (#547)', () => {
  // La pièce et ses bacs sont lents sous le rendu logiciel des tests (cf. liste-bacs.spec).
  test.setTimeout(300_000);

  test('transfert vers la quarantaine, soin à part, puis retour, au clavier', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/?seed=42&camera=front&heure=12&vitesse=0&points-blancs=1');
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    await page.getByRole('button', { name: 'Réglages' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('section.control-panel')).toBeVisible();

    // Bac malade : l'installation est proposée, sa description donne la durée sourcée.
    const install = page.locator('[data-quarantine-install]');
    await expect(install).toBeVisible();
    await expect(install).toHaveAttribute('title', /UC Davis.*approximation de jeu/);
    await expect(quarantine(page)).toHaveCount(0);
    await press(page, '[data-quarantine-install]');
    await expect(notice(page)).toContainText('« Quarantaine » installé');
    await expect(list(page).locator('[data-tank]')).toHaveCount(2);
    await expect(list(page).locator('[data-tank="1"]')).toContainText('Quarantaine');
    await expect(install).toHaveCount(0);
    await expect(quarantine(page).locator('[data-quarantine-duration]')).toContainText('UC Davis');

    // Transfert d'un néon malade à l'épuisette.
    const before = await count(page, 'neon');
    await choose(page, '[data-transfer-species]', 'neon');
    await choose(page, '[data-transfer-target]', '1');
    await press(page, '[data-transfer]');
    await expect(notice(page)).toContainText('Néon transféré dans « Quarantaine »');
    await expect.poll(() => count(page, 'neon')).toBe(before - 1);
    await expect(quarantine(page).locator('[data-quarantine-tank]')).toContainText('1 malade');

    // Soin dans la quarantaine seule : le bac affiché reste sans médicament.
    await press(page, '[data-quarantine-treatment="medicament"]');
    await expect(notice(page)).toContainText('« Quarantaine » :');
    await expect(hostEl(page)).not.toHaveAttribute('data-aqfish-treatment', /.+/);

    // Retour au bac affiché, avec le rappel d'acclimatation.
    await choose(page, '[data-quarantine-species]', 'neon');
    await press(page, '[data-quarantine-return]');
    await expect(notice(page)).toContainText('Néon ramené dans « Bac tropical »');
    await expect(notice(page)).toContainText('Acclimatation');
    await expect.poll(() => count(page, 'neon')).toBe(before);
    await expect(list(page).locator('[data-tank="1"]')).toContainText('vide');
    await expect(quarantine(page).locator('[data-quarantine-return]')).toHaveCount(0);

    // Le tout est enregistré : la quarantaine et le retour survivent au rechargement.
    await page.goto('/');
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    expect(await count(page, 'neon')).toBe(before);
    expect(errors).toEqual([]);
  });
});
