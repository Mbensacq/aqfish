import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * Cadrage des panneaux de l'interface (rétro du sprint 5, issue #108, et #79) : chaque
 * panneau ouvert tient dans la fenêtre, ne recouvre pas la barre des préréglages et laisse
 * libres les boutons d'interface (#112), à 1280 × 720 (bureau, format des captures),
 * 390 × 844 (téléphone) et 320 × 568 (très petit téléphone).
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
  /** Requête de la page (monde neuf, graine 42, bac tropical par défaut). */
  readonly search?: string;
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
    // Bassin (#106) : case « Pluie » en plus, sur la ligne de « Heure automatique ».
    name: 'Réglages (bassin)',
    search: '?seed=42&environnement=bassin',
    panel: (page) => page.locator('.control-panel'),
    open: async (page) => {
      await page.getByRole('button', { name: 'Réglages' }).click();
      await expect(page.locator('.control-panel [data-rain]')).toBeVisible();
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
  // #112 : « Réglages » ouvert recouvrait le bouton « Commandes ».
  { width: 320, height: 568 },
] as const;

/**
 * Boutons d'interface qui doivent rester cliquables quel que soit le panneau ouvert :
 * bascules des panneaux (« Réglages », « Commandes » replié ou son bouton « Replier ») et
 * boutons de la barre des préréglages.
 */
const INTERFACE_BUTTONS =
  '.control-panel__toggle, .commands-help__toggle, .view-presets-bar button';

async function openScene(page: Page, search = '?seed=42'): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // `seed=` : monde neuf, sans relire une sauvegarde d'un test précédent (docs/PIEGES.md).
  await page.goto(`/${search}`);
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

/**
 * Boutons d'interface visibles (hors du panneau ouvert) qui ne sont pas entièrement libres :
 * le panneau ne doit chevaucher aucun d'eux, et leur centre comme leurs quatre coins doivent
 * atteindre le bouton lui-même (`elementFromPoint`), pas un élément posé dessus, ni l'hôte
 * transparent d'un panneau (#112). Coins en retrait de 4 px : au-delà de l'arrondi des
 * boutons (rayon ≤ 10 px), que le test de clic respecte.
 */
async function coveredButtons(panel: Locator): Promise<string[]> {
  return panel.evaluate((panelEl, selector) => {
    const panelBox = panelEl.getBoundingClientRect();
    const buttons = Array.from(document.querySelectorAll<HTMLElement>(selector));
    return buttons.flatMap((button) => {
      const r = button.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || panelEl.contains(button)) {
        return [];
      }
      const name = button.getAttribute('aria-label') ?? button.textContent?.trim() ?? '?';
      if (
        r.left < panelBox.right &&
        panelBox.left < r.right &&
        r.top < panelBox.bottom &&
        panelBox.top < r.bottom
      ) {
        return [`« ${name} » chevauché par le panneau`];
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
  }, INTERFACE_BUTTONS);
}

for (const viewport of VIEWPORTS) {
  test.describe(`${viewport.width} × ${viewport.height}`, () => {
    test.use({ viewport });

    for (const panelCase of PANELS) {
      test(`panneau « ${panelCase.name} » ouvert : dans la fenêtre, sans recouvrir la barre des vues`, async ({
        page,
      }) => {
        const errors = await openScene(page, panelCase.search);
        await panelCase.open(page);
        const panel = await box(panelCase.panel(page));
        const bar = await box(page.locator('.view-presets-bar'));

        expect(panel.x).toBeGreaterThanOrEqual(0);
        expect(panel.y).toBeGreaterThanOrEqual(0);
        expect(panel.x + panel.width).toBeLessThanOrEqual(viewport.width);
        expect(panel.y + panel.height).toBeLessThanOrEqual(viewport.height);
        expect(overlaps(panel, bar), 'le panneau recouvre la barre des vues').toBe(false);
        expect(
          await coveredButtons(panelCase.panel(page)),
          'boutons d’interface recouverts',
        ).toEqual([]);
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
// La hauteur du texte dépend de la police : `system-ui` donne Inter dans l'environnement des
// agents et DejaVu Sans (plus large, donc plus de retours à la ligne) en CI. Le test impose
// aussi DejaVu Sans, pour que l'écart se voie avant la CI (docs/PIEGES.md).
const FONTS = [null, 'DejaVu Sans'] as const;

// #112 : à 320 × 568, l'hôte du panneau « Réglages » (transparent, aussi large que le
// panneau) interceptait le clic sur le bouton « Commandes » replié, en haut à droite.
test('320 × 568 : « Réglages » ouvert, le bouton « Commandes » ouvre l’aide-mémoire (#112)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const errors = await openScene(page);
  await PANELS.find((p) => p.name === 'Réglages')!.open(page);
  await page.getByRole('button', { name: /Afficher l’aide-mémoire des commandes/ }).click();
  await expect(page.locator('#aide-commandes')).toBeVisible();
  await expect(page.locator('.control-panel')).toBeVisible();
  expect(errors).toEqual([]);
});

test.describe('panneau « Commandes » (#79)', () => {
  for (const font of FONTS) {
    test(`1280 × 720 : entier sans défilement, section « Aide » comprise (police ${font ?? 'par défaut'})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 720 });
      const errors = await openScene(page);
      if (font) {
        await page.addStyleTag({
          content: `app-commands-help, app-commands-help * { font-family: '${font}' !important; }`,
        });
      }
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
  }

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
