import { expect, test, type Page } from '@playwright/test';

/**
 * « Réglages » et « Commandes » sur petit écran (#136) : sous 640 px de large, ouvrir l'un
 * replie l'autre, pour que leurs textes ne se superposent jamais ; les deux bascules restent
 * cliquables dans chaque état ; en paysage de téléphone (568 × 320), l'aide-mémoire démarre
 * replié. Les boîtes sont mesurées (`boundingBox`) et les clics vérifiés par
 * `elementFromPoint`, plutôt que sur une capture (docs/PIEGES.md).
 */

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const SMALL_VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 568, height: 320 },
] as const;

const settingsPanel = (page: Page) => page.locator('.control-panel');
const helpPanel = (page: Page) => page.locator('#aide-commandes');
const settingsButton = (page: Page) => page.getByRole('button', { name: 'Réglages' });
const helpUnfold = (page: Page) =>
  page.getByRole('button', { name: /Afficher l’aide-mémoire des commandes/ });
const helpFold = (page: Page) => page.getByRole('button', { name: /Replier l’aide-mémoire/ });

async function openScene(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // `seed=` : monde neuf ; contexte neuf à chaque test, donc aucun état mémorisé de l'aide.
  await page.goto('/?seed=42');
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  return errors;
}

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** Boîtes des panneaux ouverts (aucun, un seul, ou les deux s'ils sont visibles ensemble). */
async function openPanels(page: Page): Promise<Box[]> {
  const boxes: Box[] = [];
  for (const panel of [settingsPanel(page), helpPanel(page)]) {
    if ((await panel.count()) > 0) {
      const b = await panel.boundingBox();
      expect(b, 'panneau ouvert visible').not.toBeNull();
      boxes.push(b!);
    }
  }
  return boxes;
}

/**
 * Bascules (« Réglages » et celle de « Commandes », repliée ou « Replier ») qui ne sont pas
 * atteintes en leur centre et en leurs quatre coins (retrait de 4 px, au-delà de l'arrondi)
 * par `elementFromPoint` : un panneau ou l'hôte transparent d'un panneau les masque.
 */
async function blockedToggles(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const toggles = Array.from(
      document.querySelectorAll<HTMLElement>('.control-panel__toggle, .commands-help__toggle'),
    );
    return toggles.flatMap((button) => {
      const r = button.getBoundingClientRect();
      const name = button.getAttribute('aria-label') ?? button.textContent?.trim() ?? '?';
      if (r.width === 0 || r.height === 0) {
        return [`« ${name} » invisible`];
      }
      if (r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight) {
        return [`« ${name} » hors de la fenêtre`];
      }
      const inset = 4;
      const points = [
        [r.left + r.width / 2, r.top + r.height / 2],
        [r.left + inset, r.top + inset],
        [r.right - inset, r.top + inset],
        [r.left + inset, r.bottom - inset],
        [r.right - inset, r.bottom - inset],
      ];
      for (const [x, y] of points) {
        const hit = document.elementFromPoint(x, y);
        if (!hit || !button.contains(hit)) {
          const what = hit ? `<${hit.tagName.toLowerCase()} class="${hit.className}">` : 'rien';
          return [`« ${name} » recouvert en (${Math.round(x)}, ${Math.round(y)}) par ${what}`];
        }
      }
      return [];
    });
  });
}

/** Contrôle d'un état : au plus un panneau ouvert, aucun recouvrement, bascules libres. */
async function expectReadable(page: Page, state: string): Promise<void> {
  const boxes = await openPanels(page);
  expect(boxes.length, `${state} : deux panneaux ouverts ensemble`).toBeLessThanOrEqual(1);
  if (boxes.length === 2) {
    expect(overlaps(boxes[0], boxes[1]), `${state} : panneaux superposés`).toBe(false);
  }
  expect(await blockedToggles(page), `${state} : bascules recouvertes`).toEqual([]);
}

for (const viewport of SMALL_VIEWPORTS) {
  test.describe(`${viewport.width} × ${viewport.height} (#136)`, () => {
    test.use({ viewport });

    test('aide-mémoire replié au démarrage, bascules libres', async ({ page }) => {
      const errors = await openScene(page);
      await expect(helpPanel(page)).toHaveCount(0);
      await expect(helpUnfold(page)).toBeVisible();
      await expectReadable(page, 'démarrage');
      expect(errors).toEqual([]);
    });

    test('ouvrir l’un replie l’autre, dans les deux sens, sans jamais les superposer', async ({
      page,
    }) => {
      const errors = await openScene(page);

      await settingsButton(page).click();
      await expect(settingsPanel(page)).toBeVisible();
      await expectReadable(page, '« Réglages » ouvert');

      await helpUnfold(page).click();
      await expect(helpPanel(page)).toBeVisible();
      await expect(settingsPanel(page)).toHaveCount(0);
      await expect(settingsButton(page)).toHaveAttribute('aria-expanded', 'false');
      await expectReadable(page, '« Commandes » ouvert après « Réglages »');

      await settingsButton(page).click();
      await expect(settingsPanel(page)).toBeVisible();
      await expect(helpPanel(page)).toHaveCount(0);
      await expectReadable(page, '« Réglages » rouvert');

      // Touche `?` : même règle qu'au clic.
      await page.locator('body').press('?');
      await expect(helpPanel(page)).toBeVisible();
      await expect(settingsPanel(page)).toHaveCount(0);
      await expectReadable(page, '« Commandes » ouvert à la touche ?');

      // Replier l'aide-mémoire ne rouvre rien.
      await helpFold(page).click();
      await expect(helpPanel(page)).toHaveCount(0);
      await expect(settingsPanel(page)).toHaveCount(0);
      await expectReadable(page, 'tout replié');
      expect(errors).toEqual([]);
    });
  });
}

test.describe('800 × 400 (#136)', () => {
  test.use({ viewport: { width: 800, height: 400 } });

  test('écran assez large : les deux panneaux ouverts ensemble, côte à côte', async ({ page }) => {
    const errors = await openScene(page);
    await expect(helpPanel(page)).toBeVisible(); // déplié par défaut au-delà de 639 px
    await settingsButton(page).click();
    await expect(settingsPanel(page)).toBeVisible();
    await expect(helpPanel(page)).toBeVisible();
    const boxes = await openPanels(page);
    expect(boxes).toHaveLength(2);
    expect(overlaps(boxes[0], boxes[1]), 'panneaux superposés').toBe(false);
    expect(await blockedToggles(page)).toEqual([]);
    expect(errors).toEqual([]);
  });
});
