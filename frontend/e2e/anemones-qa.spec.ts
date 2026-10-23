import { expect, test, type Page } from '@playwright/test';

/** QA des anémones et des poissons-clowns du récif (#150) : présence à l'écran et isolation. */

const toggle = (page: Page) => page.getByRole('button', { name: 'Réglages' });
const speed = (page: Page) => page.getByRole('slider', { name: 'Vitesse de la simulation' });
const decor = (page: Page) => page.getByRole('checkbox', { name: 'Afficher le décor' });

const CLOWN_ORANGE = '#ff6d00';
/** Tentacules (`koiRouge`) : seule l'anémone en porte dans le récif ; le bac tropical n'en a pas. */
const TENTACULE_ROUGE = '#d94a3a';

async function open(page: Page, search: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(`/${search}`);
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  return errors;
}

/** Nombre de pixels de la capture du canevas pour chaque couleur exacte demandée. */
async function count(page: Page, colors: string[]): Promise<number[]> {
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
      const totals = colors.map(() => 0);
      for (let i = 0; i < d.length; i += 4) {
        const hex =
          '#' + [d[i], d[i + 1], d[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('');
        const index = colors.indexOf(hex);
        if (index >= 0) totals[index]++;
      }
      return totals;
    },
    { png, colors },
  );
}

async function freeze(page: Page): Promise<void> {
  await toggle(page).click();
  await speed(page).fill('0');
  await page.getByRole('button', { name: /vue de face/i }).click();
  await page.waitForTimeout(800);
}

test.describe('Anémones et poissons-clowns : parcours utilisateur', () => {
  test('récif : tentacules rouges et clowns orange visibles ; la case « décor » ne masque que l’anémone', async ({
    page,
  }) => {
    const errors = await open(page, '?environnement=recif&seed=42&heure=12');
    await freeze(page);
    const [orange, rouge] = await count(page, [CLOWN_ORANGE, TENTACULE_ROUGE]);
    expect(rouge).toBeGreaterThan(30);
    expect(orange).toBeGreaterThan(0);
    await decor(page).uncheck();
    await expect
      .poll(async () => (await count(page, [TENTACULE_ROUGE]))[0])
      .toBeLessThan(rouge * 0.05);
    await decor(page).check();
    await expect
      .poll(async () => (await count(page, [TENTACULE_ROUGE]))[0])
      .toBeGreaterThan(rouge * 0.9);
    expect(errors).toEqual([]);
  });

  for (const env of ['tropical', 'bassin', 'paludarium']) {
    test(`${env} : aucun poisson-clown orange vif`, async ({ page }) => {
      const errors = await open(page, `?environnement=${env}&seed=42&heure=12`);
      expect((await count(page, [CLOWN_ORANGE]))[0]).toBe(0);
      expect(errors).toEqual([]);
    });
  }

  test('bac tropical : aucune anémone (pas de tentacule rouge)', async ({ page }) => {
    await open(page, '?environnement=tropical&seed=42&heure=12');
    await freeze(page);
    expect((await count(page, [TENTACULE_ROUGE]))[0]).toBe(0);
  });

  for (const seed of [1, 7, 123]) {
    test(`récif graine ${seed} : se charge sans erreur, trois clowns`, async ({ page }) => {
      const errors = await open(page, `?environnement=recif&seed=${seed}`);
      await expect(page.locator('app-aquarium-host')).toHaveAttribute(
        'data-aqfish-population',
        'clown:3',
      );
      await page.waitForTimeout(500);
      expect(errors).toEqual([]);
    });
  }

  test('petite fenêtre (390 × 844) : le récif s’affiche sans erreur', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await open(page, '?environnement=recif&seed=42&camera=top');
    await page.mouse.wheel(0, 300);
    expect(errors).toEqual([]);
  });
});
