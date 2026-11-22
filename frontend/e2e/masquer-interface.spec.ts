import { expect, test, type Page } from '@playwright/test';
import { ouvrirReglages } from './outils-panneau';

/**
 * « Masquer l'interface » (#725, à la place du mode immersif) : interrupteur dans
 * « Affichage » et touche `I` ; Échap, `I` ou un appui long font revenir l'interface. La
 * caméra reste utilisable et rien n'est visible hors du bac, sauf l'indication 3 s.
 * L'état est lu sur `data-interface-hidden` (racine), la caméra sur `data-aqfish-camera`.
 */

const root = (page: Page) => page.locator('app-root');
const host = (page: Page) => page.locator('app-aquarium-host');
const hint = (page: Page) => page.locator('[data-hidden-interface-hint]');

async function openScene(page: Page, before?: () => Promise<void>): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await before?.();
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  return errors;
}

/** Éléments visibles hors de l'hôte du canvas et de l'indication (boîte non vide). */
async function visibleOutsideTank(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const appRoot = document.querySelector('app-root')!;
    const found: string[] = [];
    for (const el of appRoot.querySelectorAll<HTMLElement>('*')) {
      if (el.closest('app-aquarium-host, app-hidden-interface-hint')) {
        continue;
      }
      const box = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (box.width > 0 && box.height > 0 && style.visibility !== 'hidden') {
        found.push(el.tagName.toLowerCase() + (el.className ? `.${el.className}` : ''));
      }
    }
    return found;
  });
}

async function camera(page: Page): Promise<string | null> {
  return host(page).getAttribute('data-aqfish-camera');
}

test('touche I : tout disparaît sauf le bac, la caméra reste utilisable ; I et Échap reviennent', async ({
  page,
}) => {
  const errors = await openScene(page);
  expect((await visibleOutsideTank(page)).length).toBeGreaterThan(0);

  await page.keyboard.press('i');
  await expect(root(page)).toHaveAttribute('data-interface-hidden', 'true');
  await expect(hint(page)).toHaveText('I ou Échap pour revenir');
  expect(await visibleOutsideTank(page)).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('interface-masquee.png') });

  // Caméra : vue de dessus au clavier, puis molette sur le bac.
  const before = await camera(page);
  await page.keyboard.press('1');
  await expect.poll(() => camera(page)).not.toBe(before);
  const top = await camera(page);
  await page.mouse.move(640, 360);
  await page.mouse.wheel(0, 400);
  await expect.poll(() => camera(page)).not.toBe(top);
  await expect(root(page)).toHaveAttribute('data-interface-hidden', 'true');

  // L'indication s'efface après 3 s.
  await expect(hint(page)).toHaveCount(0, { timeout: 6000 });

  await page.keyboard.press('i');
  await expect(root(page)).toHaveAttribute('data-interface-hidden', 'false');
  await expect(page.locator('.control-panel__toggle')).toBeVisible();

  await page.keyboard.press('I');
  await expect(root(page)).toHaveAttribute('data-interface-hidden', 'true');
  await page.keyboard.press('Escape');
  await expect(root(page)).toHaveAttribute('data-interface-hidden', 'false');
  expect(errors).toEqual([]);
});

test('interrupteur « Masquer l’interface » d’« Affichage », puis appui long pour revenir', async ({
  page,
}) => {
  const errors = await openScene(page);
  await ouvrirReglages(page, 'Affichage');
  // `click` et non `check` : la case disparaît avec l'interface, `check` attendrait de la revoir
  // pour vérifier son état.
  await page.getByRole('checkbox', { name: 'Masquer l’interface' }).click();
  await expect(root(page)).toHaveAttribute('data-interface-hidden', 'true');
  expect(await visibleOutsideTank(page)).toEqual([]);

  // Appui bref : l'interface reste masquée (un clic nourrit, il ne la fait pas revenir).
  await page.mouse.move(640, 300);
  await page.mouse.down();
  await page.mouse.up();
  await expect(root(page)).toHaveAttribute('data-interface-hidden', 'true');

  // Appui long immobile : elle revient.
  await page.mouse.down();
  await page.waitForTimeout(900);
  await page.mouse.up();
  await expect(root(page)).toHaveAttribute('data-interface-hidden', 'false');
  // L'interrupteur suit l'état (fenêtre des réglages refermée au masquage).
  await ouvrirReglages(page, 'Affichage');
  await expect(page.getByRole('checkbox', { name: 'Masquer l’interface' })).not.toBeChecked();
  expect(errors).toEqual([]);
});

test('préférences du mode immersif retiré : ignorées au chargement, sans erreur', async ({
  page,
}) => {
  const errors = await openScene(page, () =>
    page.addInitScript(() => {
      localStorage.setItem(
        'aqfish.etalonnage-ecran',
        JSON.stringify({ pxPerMm: 4.2, eyeDistanceMm: 400, measured: true }),
      );
    }),
  );
  await expect(page.locator('[data-immersive-open]')).toHaveCount(0);
  await page.keyboard.press('i');
  await expect(root(page)).toHaveAttribute('data-interface-hidden', 'true');
  expect(errors).toEqual([]);
});
