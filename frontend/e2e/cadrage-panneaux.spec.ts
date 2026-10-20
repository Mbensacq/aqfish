import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * Cadrage des panneaux de l'interface (rétro du sprint 5, issue #108, et #79) : chaque
 * panneau ouvert tient dans la fenêtre et ne recouvre pas la barre des préréglages, à
 * 1280 × 720 (bureau, format des captures) et à 390 × 844 (téléphone).
 *
 * Tout nouveau panneau (météo, bassin…) s'ajoute à `PANELS` : il est alors contrôlé aux
 * deux formats sans test supplémentaire.
 */

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface PanelCase {
  /** Nom du panneau, tel qu'affiché. */
  readonly name: string;
  /** Boîte du panneau ouvert. */
  readonly panel: (page: Page) => Locator;
  /** Ouvre le panneau (quel que soit son état initial) et attend qu'il soit visible. */
  readonly open: (page: Page) => Promise<void>;
}

const PANELS: readonly PanelCase[] = [
  {
    name: 'Réglages',
    panel: (page) => page.locator('.control-panel'),
    open: async (page) => {
      await page.getByRole('button', { name: 'Réglages' }).click();
      await expect(page.locator('.control-panel')).toBeVisible();
    },
  },
  {
    name: 'Commandes',
    panel: (page) => page.locator('#aide-commandes'),
    open: async (page) => {
      // Ouvert par défaut sur grand écran, replié sur petit écran (#74).
      const folded = page.getByRole('button', { name: /Afficher l’aide-mémoire des commandes/ });
      if (await folded.isVisible()) {
        await folded.click();
      }
      await expect(page.locator('#aide-commandes')).toBeVisible();
    },
  },
];

const VIEWPORTS = [
  { width: 1280, height: 720 },
  { width: 390, height: 844 },
] as const;

async function openScene(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // `seed=` : monde neuf, sans relire une sauvegarde d'un test précédent (docs/PIEGES.md).
  await page.goto('/?seed=42');
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  return errors;
}

async function box(locator: Locator): Promise<Box> {
  const b = await locator.boundingBox();
  expect(b, 'élément visible').not.toBeNull();
  return b!;
}

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

for (const viewport of VIEWPORTS) {
  test.describe(`${viewport.width} × ${viewport.height}`, () => {
    test.use({ viewport });

    for (const panelCase of PANELS) {
      test(`panneau « ${panelCase.name} » ouvert : dans la fenêtre, sans recouvrir la barre des vues`, async ({
        page,
      }) => {
        const errors = await openScene(page);
        await panelCase.open(page);
        const panel = await box(panelCase.panel(page));
        const bar = await box(page.locator('.view-presets-bar'));

        expect(panel.x).toBeGreaterThanOrEqual(0);
        expect(panel.y).toBeGreaterThanOrEqual(0);
        expect(panel.x + panel.width).toBeLessThanOrEqual(viewport.width);
        expect(panel.y + panel.height).toBeLessThanOrEqual(viewport.height);
        expect(overlaps(panel, bar), 'le panneau recouvre la barre des vues').toBe(false);
        // Pas de débordement horizontal (texte coupé à droite).
        expect(await panelCase.panel(page).evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
          true,
        );
        expect(errors).toEqual([]);
      });
    }
  });
}

// #79 : à 1280 × 720, la section « Aide » du panneau « Commandes » n'apparaissait qu'en
// défilant (capture `front-panneau` du cycle 33). Elle doit tenir sans défilement ; à
// 390 × 844, le panneau défile, mais sa dernière ligne reste atteignable au-dessus de la barre.
test.describe('panneau « Commandes » (#79)', () => {
  test('1280 × 720 : entier sans défilement, section « Aide » comprise', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    const errors = await openScene(page);
    const commands = PANELS.find((p) => p.name === 'Commandes')!;
    await commands.open(page);
    const panel = commands.panel(page);
    const { scrollHeight, clientHeight } = await panel.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
    expect(scrollHeight, 'contenu plus haut que le panneau : défilement').toBeLessThanOrEqual(
      clientHeight,
    );
    const panelBox = await box(panel);
    const last = await box(panel.locator('[data-command="aide"]').locator('dd'));
    expect(last.y + last.height).toBeLessThanOrEqual(panelBox.y + panelBox.height);
    expect(errors).toEqual([]);
  });

  test('390 × 844 : dernière ligne atteignable, au-dessus de la barre des vues', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await openScene(page);
    const commands = PANELS.find((p) => p.name === 'Commandes')!;
    await commands.open(page);
    const panel = commands.panel(page);
    await panel.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    const last = await box(panel.locator('[data-command="aide"]').locator('dd'));
    const bar = await box(page.locator('.view-presets-bar'));
    expect(last.y + last.height).toBeLessThanOrEqual(bar.y);
    await expect(panel.locator('[data-command="aide"] dd')).toBeInViewport();
    expect(errors).toEqual([]);
  });
});
