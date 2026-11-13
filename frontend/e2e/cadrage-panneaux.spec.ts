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
    // Section « Soins » affichée (bac malade, #488) : à 1280 × 720, « Sauvegarde » passait
    // dans une troisième colonne, hors du panneau (débordement horizontal).
    name: 'Réglages (soins)',
    search: '?seed=42&points-blancs=1',
    panel: (page) => page.locator('.control-panel'),
    open: async (page) => {
      await page.getByRole('button', { name: 'Réglages' }).click();
      await expect(page.locator(".control-panel [data-section='soins']")).toBeVisible();
    },
  },
  {
    // Message d'un geste de soin affiché (#490) : en deux colonnes, il passe dans une bulle à
    // droite du panneau, la section « Soins » ne grandit pas et « Sauvegarde » reste visible.
    name: 'Réglages (soins, message)',
    search: '?seed=42&points-blancs=1',
    panel: (page) => page.locator('.control-panel'),
    open: async (page) => {
      await page.getByRole('button', { name: 'Réglages' }).click();
      await page.getByRole('button', { name: 'Ajouter 1 g/L de sel' }).click();
      await expect(page.locator('.control-panel [data-treatment-message]')).toContainText(
        'Prudence',
      );
    },
  },
  {
    // Quarantaine installée (#571) : à 1280 × 720, « Bacs » partait en troisième colonne et
    // « Sauvegarde » en quatrième ; le panneau passe sur une colonne qui défile.
    name: 'Réglages (quarantaine)',
    search: '?seed=42&points-blancs=1',
    panel: (page) => page.locator('.control-panel'),
    open: async (page) => {
      await page.getByRole('button', { name: 'Réglages' }).click();
      await page.getByRole('button', { name: 'Installer un bac de quarantaine' }).click();
      await expect(page.locator('.control-panel [data-quarantine]')).toBeVisible();
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
  {
    // Wiki des espèces (#287), fiche la plus longue ouverte (chirurgien bleu, récif).
    name: 'Wiki des espèces',
    search: '?seed=42&environnement=recif',
    panel: (page) => page.locator('#wiki-especes'),
    open: async (page) => {
      await page.getByRole('button', { name: 'Wiki des espèces' }).click();
      await page.locator('#wiki-especes [data-wiki-species="chirurgien"]').click();
      await expect(page.locator('#wiki-especes [data-wiki-sheet]')).toBeVisible();
    },
  },
  {
    // Pharmacie du bac (#533), bac malade : conseil le plus long (médicament ou sel).
    name: 'Pharmacie du bac',
    search: '?seed=42&points-blancs=1',
    panel: (page) => page.locator('#pharmacie-bac'),
    open: async (page) => {
      await page.getByRole('button', { name: 'Pharmacie du bac' }).click();
      await expect(page.locator('#pharmacie-bac [data-pharmacy-advice]')).toBeVisible();
    },
  },
  {
    // Journal du bac (#581), dans le bilan déplié, après un traitement et un changement d'eau.
    name: 'Journal du bac',
    search: '?seed=42&points-blancs=1',
    panel: (page) => page.locator('[data-review-detail]'),
    open: async (page) => {
      await page.getByRole('button', { name: 'Réglages' }).click();
      await page.getByRole('button', { name: 'Ajouter 1 g/L de sel' }).click();
      await page.getByRole('button', { name: 'Changer l’eau' }).click();
      await page.getByRole('button', { name: 'Réglages' }).click();
      await page.locator('[data-review]').click();
      await page.locator('[data-journal]').click();
      await expect(page.locator('[data-journal-detail] li')).toHaveCount(2);
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
  '.control-panel__toggle, .commands-help__toggle, .species-wiki__toggle, .view-presets-bar button';

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
  // #136 : sous 640 px, ouvrir « Commandes » replie « Réglages » (panneaux exclusifs).
  await expect(page.locator('.control-panel')).toHaveCount(0);
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

// #588 : à 900 × 700, « Réglages » en deux colonnes (532 px, de 59 à 591 px) recouvrait
// l'aide-mémoire « Commandes » déplié (300 px, à 12 px du bord droit : dès 588 px). Le panneau
// ne passe en deux colonnes qu'à partir de 1167 px de large (915 px avant #610, qui y ajoute la
// bulle de soin) ; plus étroit, une colonne. Les deux panneaux ouverts ensemble restent séparés
// d'au moins 12 px, de part et d'autre de l'ancien seuil comme du nouveau.
test.describe('« Réglages » et « Commandes » ouverts ensemble (#588)', () => {
  for (const viewport of [
    { width: 900, height: 700 },
    { width: 914, height: 700 },
    { width: 915, height: 700 },
    { width: 1024, height: 700 },
    { width: 1166, height: 700 },
    { width: 1167, height: 700 },
    { width: 1280, height: 720 },
  ]) {
    for (const search of ['?seed=42', '?seed=42&points-blancs=1']) {
      test(`${viewport.width} × ${viewport.height} : sans se recouvrir (${search})`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport);
        const errors = await openScene(page, search);
        await PANELS.find((p) => p.name === 'Commandes')!.open(page);
        await PANELS.find((p) => p.name === 'Réglages')!.open(page);
        // Au-delà de 639 px, ouvrir « Réglages » ne replie pas « Commandes » (#136).
        await expect(page.locator('#aide-commandes')).toBeVisible();
        const settings = await box(page.locator('.control-panel'));
        const commands = await box(page.locator('#aide-commandes'));
        expect(overlaps(settings, commands), '« Réglages » recouvre « Commandes »').toBe(false);
        expect(commands.x - (settings.x + settings.width)).toBeGreaterThanOrEqual(12);
        expect(
          await page.locator('.control-panel').evaluate((el) => el.scrollWidth <= el.clientWidth),
        ).toBe(true);
        expect(errors).toEqual([]);
      });
    }
  }
});

// #610 : en deux colonnes, la bulle d'un geste de soin (240 px, à droite de « Réglages »)
// recouvrait « Commandes » déplié sous 1155 px de large. Le panneau ne passe en deux colonnes
// qu'à partir de 1167 px (panneau, bulle et aide-mémoire côte à côte) ; plus étroit, le message
// reste une ligne de la section, dans le panneau. Mesuré de part et d'autre du seuil.
test.describe('bulle de soin et « Commandes » ouverts ensemble (#610)', () => {
  for (const viewport of [
    { width: 915, height: 700 },
    { width: 1024, height: 700 },
    { width: 1154, height: 700 },
    { width: 1166, height: 700 },
    { width: 1167, height: 700 },
    { width: 1280, height: 720 },
  ]) {
    for (const font of FONTS) {
      test(`${viewport.width} × ${viewport.height} : sans se recouvrir (police ${font ?? 'par défaut'})`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport);
        const errors = await openScene(page, '?seed=42&points-blancs=1');
        if (font) {
          await page.addStyleTag({ content: `* { font-family: '${font}' !important; }` });
        }
        await PANELS.find((p) => p.name === 'Commandes')!.open(page);
        await PANELS.find((p) => p.name === 'Réglages (soins, message)')!.open(page);
        await expect(page.locator('#aide-commandes')).toBeVisible();
        const settings = await box(page.locator('.control-panel'));
        const bubble = await box(page.locator('.control-panel [data-treatment-message]'));
        const commands = await box(page.locator('#aide-commandes'));
        expect(overlaps(bubble, commands), 'la bulle recouvre « Commandes »').toBe(false);
        expect(overlaps(settings, commands), '« Réglages » recouvre « Commandes »').toBe(false);
        // Bulle hors du panneau en deux colonnes seulement, à 12 px au moins de « Commandes ».
        const outside = bubble.x >= settings.x + settings.width;
        expect(outside).toBe(viewport.width >= 1167);
        if (outside) {
          expect(commands.x - (bubble.x + bubble.width)).toBeGreaterThanOrEqual(12);
        }
        expect(errors).toEqual([]);
      });
    }
  }
});

// #610 : sous 1100 px, le bandeau bas (santé, alertes) occupe toute la largeur ; à 900 × 700,
// le bas de « Commandes » déplié touchait sa ligne. L'aide-mémoire s'arrête au-dessus, quelle
// que soit la hauteur du bandeau (une à trois lignes selon la largeur et la police).
test.describe('« Commandes » au-dessus du bandeau bas (#610)', () => {
  for (const viewport of [
    { width: 640, height: 700 },
    { width: 768, height: 700 },
    { width: 900, height: 700 },
    { width: 1024, height: 700 },
  ]) {
    for (const font of FONTS) {
      test(`${viewport.width} × ${viewport.height} : sans toucher le bandeau (police ${font ?? 'par défaut'})`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport);
        const errors = await openScene(page, '?seed=42&points-blancs=1');
        if (font) {
          await page.addStyleTag({ content: `* { font-family: '${font}' !important; }` });
        }
        await PANELS.find((p) => p.name === 'Commandes')!.open(page);
        const status = page.locator('app-dashboard-status .status');
        // La hauteur publiée suit le bandeau (police changée : il peut passer à la ligne).
        await expect
          .poll(async () => {
            const [commands, bar] = [await box(page.locator('#aide-commandes')), await box(status)];
            return bar.y - (commands.y + commands.height);
          })
          .toBeGreaterThanOrEqual(8);
        await expect(page.locator('#aide-commandes [data-command="aide"] dd')).toBeAttached();
        expect(errors).toEqual([]);
      });
    }
  }
});

// #490 : à 1280 × 720, un message de soin (le plus long : sel avec néons et corydoras, mise
// en garde comprise) agrandissait la section « Soins », qui passait en deuxième colonne et
// poussait « Sauvegarde » dans une troisième, hors du panneau. Le message est désormais une
// bulle à droite du panneau : chaque section reste entière dans le cadre, deux colonnes.
test.describe('message de soin à 1280 × 720 (#490)', () => {
  for (const font of FONTS) {
    test(`toutes les sections visibles, bulle dans la fenêtre (police ${font ?? 'par défaut'})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 720 });
      const errors = await openScene(page, '?seed=42&points-blancs=1');
      if (font) {
        await page.addStyleTag({
          content: `app-control-panel, app-control-panel * { font-family: '${font}' !important; }`,
        });
      }
      const settings = PANELS.find((p) => p.name === 'Réglages (soins, message)')!;
      await settings.open(page);
      const panel = settings.panel(page);
      expect(await panel.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      const panelBox = await box(panel);
      const sections = await panel.evaluate((el) =>
        [...el.querySelectorAll<HTMLElement>(':scope > fieldset')].map((f) => {
          const r = f.getBoundingClientRect();
          return { name: f.dataset['section'], left: r.left, right: r.right, bottom: r.bottom };
        }),
      );
      expect(sections.map((s) => s.name)).toContain('sauvegarde');
      for (const section of sections) {
        expect(section.right, `section « ${section.name} » hors du panneau`).toBeLessThanOrEqual(
          panelBox.x + panelBox.width,
        );
        expect(section.bottom, `section « ${section.name} » coupée`).toBeLessThanOrEqual(
          panelBox.y + panelBox.height,
        );
      }
      const lefts = new Set(sections.map((s) => Math.round(s.left)));
      expect(lefts.size, 'deux colonnes, pas trois').toBe(2);
      const bubble = await box(panel.locator('[data-treatment-message]'));
      const bar = await box(page.locator('.view-presets-bar'));
      expect(bubble.x).toBeGreaterThanOrEqual(panelBox.x + panelBox.width);
      expect(bubble.x + bubble.width).toBeLessThanOrEqual(1280);
      expect(bubble.y + bubble.height).toBeLessThanOrEqual(720);
      expect(overlaps(bubble, bar), 'la bulle recouvre la barre des vues').toBe(false);
      expect(await coveredButtons(panel), 'boutons d’interface recouverts').toEqual([]);
      expect(errors).toEqual([]);
    });
  }
});

// #370 : à 1280 × 720, la liste « Population » défile seule ; sa hauteur est arrondie à un
// nombre entier de lignes d'espèce, pour qu'aucune ne soit coupée à mi-hauteur. Avec la
// section « Soins » (bac malade, `points-blancs=1`), la liste est plus courte : même règle.
test.describe('liste « Population » du panneau « Réglages » (#370)', () => {
  for (const font of FONTS) {
    for (const search of ['?seed=42', '?seed=42&points-blancs=1']) {
      test(`1280 × 720 : aucune ligne d’espèce coupée (${search}, police ${font ?? 'par défaut'})`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: 1280, height: 720 });
        const errors = await openScene(page, search);
        if (font) {
          await page.addStyleTag({
            content: `app-control-panel, app-control-panel * { font-family: '${font}' !important; }`,
          });
        }
        const settings = PANELS.find((p) => p.name === 'Réglages')!;
        await settings.open(page);
        const list = settings.panel(page).locator("[data-section='population']");
        const { visibleTop, visibleBottom, scrolls, rows } = await list.evaluate((el) => {
          const top = el.getBoundingClientRect().top + el.clientTop;
          return {
            visibleTop: top,
            visibleBottom: top + el.clientHeight,
            scrolls: el.scrollHeight > el.clientHeight,
            rows: [...el.querySelectorAll('.control-panel__count')].map((row) => {
              const r = row.getBoundingClientRect();
              return { top: r.top, bottom: r.bottom };
            }),
          };
        });
        expect(scrolls, 'quatorze espèces : la liste défile à ce format').toBe(true);
        expect(rows.length).toBeGreaterThan(0);
        let shown = 0;
        for (const [i, row] of rows.entries()) {
          const inside = row.top >= visibleTop && row.bottom <= visibleBottom;
          const outside = row.top >= visibleBottom || row.bottom <= visibleTop;
          expect(inside || outside, `ligne ${i + 1} coupée par le bas de la liste`).toBe(true);
          shown += inside ? 1 : 0;
        }
        expect(shown, 'au moins trois espèces visibles sans défiler').toBeGreaterThanOrEqual(3);
        expect(errors).toEqual([]);
      });
    }
  }
});

// #322 : le badge du mode décor remplace le cadre haut du tableau de bord ; il prend sa place
// à toutes les largeurs, marges du téléphone (8 px sous 480 px) comprises. Sur bureau, le
// cadre et le badge commencent à 12 px après « Réglages » et finissent à 12 px avant
// l'aide-mémoire déplié (largeurs lues dans `src/app/ui/_panel-layout.scss`).
test.describe('badge du mode décor à la place du cadre haut (#322)', () => {
  const widths = [
    { width: 1280, height: 720 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
    { width: 320, height: 568 },
  ] as const;

  for (const viewport of widths) {
    test(`${viewport.width} × ${viewport.height} : même place que le cadre haut`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      const errors = await openScene(page, '?seed=42&vitesse=0');
      const frame = await box(page.locator('app-dashboard-frame'));
      await page.goto('/?seed=42&vitesse=0&mode=decor');
      await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
      await expect(page.locator('[data-decor-badge]')).toBeVisible();
      const badge = await box(page.locator('app-decor-badge'));
      expect(badge.x).toBeCloseTo(frame.x, 1);
      expect(badge.y).toBeCloseTo(frame.y, 1);
      expect(badge.width).toBeCloseTo(frame.width, 1);
      const margin = viewport.width <= 480 ? 8 : 12;
      if (viewport.width >= 1100) {
        const settings = await box(page.locator('.control-panel__toggle'));
        const help = await box(page.locator('#aide-commandes'));
        expect(badge.x - (settings.x + settings.width)).toBeGreaterThanOrEqual(margin);
        expect(help.x - (badge.x + badge.width)).toBeCloseTo(margin, 1);
      } else {
        expect(badge.x).toBeCloseTo(margin, 1);
        expect(viewport.width - (badge.x + badge.width)).toBeCloseTo(margin, 1);
      }
      expect(errors).toEqual([]);
    });
  }
});

// #257 : « Réglages » ouvert passe par-dessus le cadre du tableau de bord (ADR 0059). Le
// panneau est opaque, et chaque élément visible du cadre qu'il croise est bien dessous : au
// centre de la partie recouverte, le point appartient au panneau.
test('1280 × 720 : « Réglages » ouvert masque entièrement le cadre qu’il recouvre (#257)', async ({
  page,
}) => {
  const errors = await openScene(page, '?seed=42&vitesse=0');
  await page.getByRole('button', { name: 'Réglages' }).click();
  await expect(page.locator('.control-panel')).toBeVisible();
  const result = await page.evaluate(() => {
    const panel = document.querySelector('.control-panel')!;
    const rect = panel.getBoundingClientRect();
    const background = getComputedStyle(panel).backgroundColor;
    let crossed = 0;
    const seen: string[] = [];
    for (const el of document.querySelectorAll('app-dashboard-frame *')) {
      const box = el.getBoundingClientRect();
      const left = Math.max(box.left, rect.left);
      const right = Math.min(box.right, rect.right);
      const top = Math.max(box.top, rect.top);
      const bottom = Math.min(box.bottom, rect.bottom);
      if (right - left < 1 || bottom - top < 1) {
        continue;
      }
      crossed++;
      const hit = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
      if (!hit || !panel.contains(hit)) {
        seen.push(`${el.tagName.toLowerCase()}.${el.className}`);
      }
    }
    return { background, crossed, seen };
  });
  // Le panneau croise bien le cadre à ce format, sinon le test ne prouverait rien.
  expect(result.crossed).toBeGreaterThan(0);
  expect(result.seen).toEqual([]);
  expect(result.background).toBe('rgb(20, 20, 24)');
  expect(errors).toEqual([]);
});

// #571 : quarantaine installée, le panneau ne déborde pas en largeur, aussi à 900 × 700 (une
// colonne depuis #588 ; plus petit format à deux colonnes jusque-là) et avec DejaVu Sans (police de la CI, plus large) ; le choix du
// bac de quarantaine reçoit le focus et reste visible dans le panneau qui défile.
test.describe('quarantaine installée (#571)', () => {
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 900, height: 700 },
  ]) {
    for (const font of FONTS) {
      test(`${viewport.width} × ${viewport.height} : sans débord, bac de quarantaine visible (police ${font ?? 'par défaut'})`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport);
        const errors = await openScene(page, '?seed=42&points-blancs=1');
        if (font) {
          await page.addStyleTag({
            content: `app-control-panel, app-control-panel * { font-family: '${font}' !important; }`,
          });
        }
        await PANELS.find((p) => p.name === 'Réglages (quarantaine)')!.open(page);
        const panel = page.locator('.control-panel');
        expect(await panel.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
        const panelBox = await box(panel);
        expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(viewport.width);
        expect(panelBox.y + panelBox.height).toBeLessThanOrEqual(viewport.height);
        const select = panel.locator('[data-quarantine-tank]');
        await expect(select).toBeFocused();
        const selectBox = await box(select);
        expect(selectBox.y).toBeGreaterThanOrEqual(panelBox.y);
        expect(selectBox.y + selectBox.height).toBeLessThanOrEqual(panelBox.y + panelBox.height);
        // « Sauvegarde » reste atteignable en défilant, dans la largeur du panneau.
        const save = panel.locator("[data-section='sauvegarde']");
        await save.scrollIntoViewIfNeeded();
        const saveBox = await box(save);
        expect(saveBox.x + saveBox.width).toBeLessThanOrEqual(panelBox.x + panelBox.width);
        expect(errors).toEqual([]);
      });
    }
  }
});

// Bilan déplié à 390 × 844 (#592) : le bandeau santé et alertes grandit vers le haut et sa
// ligne Santé/Faim passait sous la languette « Mon premier aquarium » (bas fixe à 124 px).
// La languette se masque tant qu'un détail du bandeau est déplié, et revient à sa fermeture ;
// repliée, elle ne recouvre aucune ligne du bandeau.
test('390 × 844 : bilan et journal dépliés, la languette du parcours ne recouvre pas le bandeau (#592)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = await openScene(page, '?seed=42&vitesse=0');
  const path = page.locator('app-first-tank-path');
  const items = page.locator('[data-dashboard-status] .status__item');
  const free = async () => {
    if ((await path.count()) === 0) {
      return;
    }
    const pathBox = await box(path.locator('.path__toggle'));
    for (const item of await items.all()) {
      expect(overlaps(pathBox, await box(item)), 'languette sur une ligne du bandeau').toBe(false);
    }
  };
  await expect(path).toBeVisible();
  await free();
  const review = page.getByRole('button', { name: 'Bilan du bac' });
  await review.click();
  await expect(page.locator('[data-review-detail]')).toBeVisible();
  await expect(path).toHaveCount(0);
  await free();
  await page.locator('[data-journal]').click();
  await expect(page.locator('[data-journal-detail]')).toBeVisible();
  await expect(path).toHaveCount(0);
  await review.click();
  await expect(page.locator('[data-review-detail]')).toHaveCount(0);
  await expect(path).toBeVisible();
  await free();
  expect(errors).toEqual([]);
});
