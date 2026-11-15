import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Outils communs des e2e du cadrage des panneaux (rétro du sprint 5, #108, #79) : panneaux à
 * contrôler, ouverture d'une scène, boîtes et recouvrements. Les tests sont répartis en
 * plusieurs fichiers `cadrage-panneaux*.spec.ts` pour que la CI les place dans des parts
 * différentes (`e2e/durees.json`, #600) : réunis, ils prenaient 18 à 31 min, soit à eux seuls
 * la quasi-totalité d'une part.
 *
 * Tout nouveau panneau (météo, bassin…) s'ajoute à `PANELS` : il est alors contrôlé à chaque
 * format de `PANEL_VIEWPORTS` sans test supplémentaire.
 */

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PanelCase {
  /** Nom du panneau, tel qu'affiché. */
  readonly name: string;
  /** Boîte du panneau ouvert. */
  readonly panel: (page: Page) => Locator;
  /** Ouvre le panneau (quel que soit son état initial) et attend qu'il soit visible. */
  readonly open: (page: Page) => Promise<void>;
  /** Requête de la page (monde neuf, graine 42, bac tropical par défaut). */
  readonly search?: string;
}

export const PANELS: readonly PanelCase[] = [
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

/**
 * Boutons d'interface qui doivent rester cliquables quel que soit le panneau ouvert :
 * bascules des panneaux (« Réglages », « Commandes » replié ou son bouton « Replier ») et
 * boutons de la barre des préréglages.
 */
export const INTERFACE_BUTTONS =
  '.control-panel__toggle, .commands-help__toggle, .species-wiki__toggle, .view-presets-bar button';

export async function openScene(page: Page, search = '?seed=42'): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // `seed=` : monde neuf, sans relire une sauvegarde d'un test précédent (docs/PIEGES.md).
  await page.goto(`/${search}`);
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  return errors;
}

export async function box(locator: Locator): Promise<Box> {
  const b = await locator.boundingBox();
  expect(b, 'élément visible').not.toBeNull();
  return b!;
}

export function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/**
 * Boutons d'interface visibles (hors du panneau ouvert) qui ne sont pas entièrement libres :
 * le panneau ne doit chevaucher aucun d'eux, et leur centre comme leurs quatre coins doivent
 * atteindre le bouton lui-même (`elementFromPoint`), pas un élément posé dessus, ni l'hôte
 * transparent d'un panneau (#112). Coins en retrait de 4 px : au-delà de l'arrondi des
 * boutons (rayon ≤ 10 px), que le test de clic respecte.
 */
export async function coveredButtons(panel: Locator): Promise<string[]> {
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

/**
 * Formats où chaque panneau de `PANELS` est contrôlé : 1280 × 720 (bureau, format des
 * captures, `cadrage-panneaux-bureau.spec.ts`), 390 × 844 (téléphone) et 320 × 568 (très
 * petit téléphone, #112 : « Réglages » ouvert recouvrait le bouton « Commandes »), ces deux
 * derniers dans `cadrage-panneaux.spec.ts`.
 */
export const PANEL_VIEWPORTS = [
  { width: 1280, height: 720 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
] as const;

// La hauteur du texte dépend de la police : `system-ui` donne Inter dans l'environnement des
// agents et DejaVu Sans (plus large, donc plus de retours à la ligne) en CI. Les tests
// imposent aussi DejaVu Sans, pour que l'écart se voie avant la CI (docs/PIEGES.md).
export const FONTS = [null, 'DejaVu Sans'] as const;

/**
 * Contrôle un panneau de `PANELS` ouvert au format `viewport` (déjà appliqué à la page) : dans
 * la fenêtre, sans recouvrir la barre des vues ni les boutons d'interface, sans débordement
 * horizontal. Les `test(…)` restent dans les fichiers `.spec.ts` : Playwright attribue un
 * test au fichier où il est déclaré, et `scripts/parts-e2e.mjs --mesurer` lit ce fichier.
 */
export async function checkPanelInViewport(
  page: Page,
  panelCase: PanelCase,
  viewport: { readonly width: number; readonly height: number },
): Promise<void> {
  const errors = await openScene(page, panelCase.search);
  await panelCase.open(page);
  const panel = await box(panelCase.panel(page));
  const bar = await box(page.locator('.view-presets-bar'));

  expect(panel.x).toBeGreaterThanOrEqual(0);
  expect(panel.y).toBeGreaterThanOrEqual(0);
  expect(panel.x + panel.width).toBeLessThanOrEqual(viewport.width);
  expect(panel.y + panel.height).toBeLessThanOrEqual(viewport.height);
  expect(overlaps(panel, bar), 'le panneau recouvre la barre des vues').toBe(false);
  expect(await coveredButtons(panelCase.panel(page)), 'boutons d’interface recouverts').toEqual([]);
  // Pas de débordement horizontal (texte coupé à droite).
  expect(await panelCase.panel(page).evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  expect(errors).toEqual([]);
}
