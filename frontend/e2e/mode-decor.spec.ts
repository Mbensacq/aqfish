import { expect, test, type Page } from '@playwright/test';

/**
 * Mode décor, lot 1 (#278, ADR 0077) : changer de mode demande une confirmation qui explique
 * la conséquence ; en décor, badge à la place du tableau de bord et espèce d'un autre milieu
 * ajoutée au bac tropical ; retour en soins (confirmé), animal gardé, relu après rechargement.
 *
 * Page ouverte sans `seed=` : la sauvegarde automatique est restaurée au rechargement.
 */

const hostEl = (page: Page) => page.locator('app-aquarium-host');
const bacs = (page: Page) => page.locator('[data-section="bacs"]');
const confirmBox = (page: Page) => page.locator('[data-care-mode-confirm]');

/** Effectif d'une espèce lu dans `data-aqfish-population` (« neon:8,guppy:6… »). */
async function count(page: Page, species: string): Promise<number> {
  const raw = (await hostEl(page).getAttribute('data-aqfish-population')) ?? '';
  const entry = raw.split(',').find((part) => part.startsWith(`${species}:`));
  return Number(entry?.split(':')[1] ?? 0);
}

async function openPanel(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Réglages' }).click();
  await expect(page.locator('section.control-panel')).toBeVisible();
}

test.describe('Mode décor (#278)', () => {
  test.setTimeout(240_000);

  test('passer en décor, ajouter un poisson de mer au bac tropical, revenir aux soins', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-mode', 'soins');
    await expect(page.locator('app-dashboard-frame')).toHaveCount(1);
    await expect(page.locator('[data-decor-badge]')).toHaveCount(0);
    await openPanel(page);
    const toggle = bacs(page).locator('[data-care-mode-toggle]');
    await expect(toggle).toHaveText(/Mode : soins/);
    // En soins, le poisson-clown (récif) n'est pas proposé dans le bac tropical.
    await expect(page.getByRole('button', { name: 'Ajouter un poisson-clown' })).toHaveCount(0);

    await test.step('Soins → Décor : confirmation, puis badge à la place du tableau de bord', async () => {
      await toggle.click();
      await expect(confirmBox(page)).toBeVisible();
      await expect(confirmBox(page)).toContainText('mises en pause, pas effacées');
      // Annuler ne change rien.
      await confirmBox(page).getByRole('button', { name: 'Annuler' }).click();
      await expect(confirmBox(page)).toHaveCount(0);
      await expect(hostEl(page)).toHaveAttribute('data-aqfish-mode', 'soins');
      await toggle.click();
      await confirmBox(page).getByRole('button', { name: 'Passer en mode décor' }).click();
      await expect(hostEl(page)).toHaveAttribute('data-aqfish-mode', 'decor');
      await expect(page.locator('[data-decor-badge]')).toHaveText(
        'Mode décor : pas une simulation réaliste',
      );
      await expect(page.locator('app-dashboard-frame')).toHaveCount(0);
      await expect(page.locator('app-dashboard-status')).toHaveCount(0);
      await expect(toggle).toHaveText(/Mode : décor/);
    });

    await test.step('Décor : une espèce d’eau de mer s’ajoute au bac tropical', async () => {
      await page.getByRole('button', { name: 'Ajouter un poisson-clown' }).click();
      await expect.poll(() => count(page, 'clown')).toBe(1);
    });

    await test.step('Décor → Soins : animal inadapté listé, « Tout garder », état repris', async () => {
      await toggle.click();
      await expect(confirmBox(page)).toContainText('reprennent où elles en étaient');
      // Lot 2 : le poisson-clown (récif) est listé avec sa raison.
      await expect(confirmBox(page).locator('[data-unsuitable]')).toHaveCount(1);
      await expect(confirmBox(page).locator('[data-unsuitable="clown"]')).toContainText(
        'Poisson-clown (1)',
      );
      await expect(confirmBox(page).locator('[data-unsuitable="clown"]')).toContainText(
        'Autre milieu : vit dans « Récif »',
      );
      await confirmBox(page).getByRole('button', { name: 'Tout garder' }).click();
      await expect(hostEl(page)).toHaveAttribute('data-aqfish-mode', 'soins');
      await expect(page.locator('[data-decor-badge]')).toHaveCount(0);
      await expect(page.locator('app-dashboard-frame')).toHaveCount(1);
      expect(await count(page, 'clown')).toBe(1);
      // Avertissements habituels : le poisson-clown gardé est signalé dans le panneau.
      await expect(page.locator('[data-milieu-warning]')).toContainText('Poisson-clown (1)');
    });

    await test.step('Rechargement : mode soins et poisson-clown relus', async () => {
      await page.reload();
      await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
      await expect(hostEl(page)).toHaveAttribute('data-aqfish-mode', 'soins');
      await expect.poll(() => count(page, 'clown')).toBe(1);
    });
    expect(errors).toEqual([]);
  });

  /** Passe le bac affiché en décor, ajoute un poisson-clown et un koï, ouvre le retour en soins. */
  async function decorWithStrangers(page: Page): Promise<void> {
    await page.goto('/?seed=5');
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    await openPanel(page);
    const toggle = bacs(page).locator('[data-care-mode-toggle]');
    await toggle.click();
    await confirmBox(page).getByRole('button', { name: 'Passer en mode décor' }).click();
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-mode', 'decor');
    await page.getByRole('button', { name: 'Ajouter un poisson-clown' }).click();
    await page.getByRole('button', { name: 'Ajouter un koï' }).click();
    await expect.poll(() => count(page, 'koi')).toBe(1);
    await expect.poll(() => count(page, 'clown')).toBe(1);
    await toggle.click();
    await expect(confirmBox(page)).toBeVisible();
  }

  test('retour en soins : « Tout retirer » retire exactement les animaux listés (#278, lot 2)', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await decorWithStrangers(page);
    const neons = await count(page, 'neon');
    const guppys = await count(page, 'guppy');
    await expect(confirmBox(page).locator('[data-unsuitable]')).toHaveCount(2);
    await confirmBox(page).getByRole('button', { name: 'Tout retirer' }).click();
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-mode', 'soins');
    await expect.poll(() => count(page, 'clown')).toBe(0);
    expect(await count(page, 'koi')).toBe(0);
    expect(await count(page, 'neon')).toBe(neons);
    expect(await count(page, 'guppy')).toBe(guppys);
    await expect(page.locator('[data-milieu-warning]')).toHaveCount(0);
    // Sans animal inadapté, le retour suivant n'a pas de liste.
    await bacs(page).locator('[data-care-mode-toggle]').click();
    await confirmBox(page).getByRole('button', { name: 'Passer en mode décor' }).click();
    await bacs(page).locator('[data-care-mode-toggle]').click();
    await expect(confirmBox(page).locator('[data-unsuitable]')).toHaveCount(0);
    await expect(
      confirmBox(page).getByRole('button', { name: 'Revenir au mode soins' }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  });

  for (const size of [
    { width: 1280, height: 720 },
    { width: 390, height: 844 },
  ]) {
    test(`retour en soins : liste lisible sans débord à ${size.width} px`, async ({ page }) => {
      await page.setViewportSize(size);
      await decorWithStrangers(page);
      const box = await confirmBox(page).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(size.width);
      expect(box!.y + box!.height).toBeLessThanOrEqual(size.height);
      // Aucun débord horizontal du dialogue ni de ses lignes.
      const overflow = await confirmBox(page).evaluate((el) =>
        [el, ...el.querySelectorAll('li, button')].some(
          (node) => node.scrollWidth > node.clientWidth + 1,
        ),
      );
      expect(overflow).toBe(false);
      for (const button of ['Tout retirer', 'Tout garder', 'Annuler']) {
        await expect(confirmBox(page).getByRole('button', { name: button })).toBeInViewport();
      }
      // Capture jointe au rapport (vue de face, critère « lisible à chaque largeur »).
      const shot = test.info().outputPath(`retour-soins-${size.width}.png`);
      await page.screenshot({ path: shot });
      await test.info().attach(`retour-soins-${size.width}`, {
        path: shot,
        contentType: 'image/png',
      });
    });
  }
});
