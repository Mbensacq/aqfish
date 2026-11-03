import { expect, test, type Page } from '@playwright/test';

import { contrastRatio, type Rgb } from '../src/app/ui/dashboard-frame/contrast';

/**
 * Clavier et focus visible (#407) : toute l'interface se parcourt à la touche Tab, sans piège
 * ni élément caché, chaque contrôle atteint montre l'anneau de focus commun (contraste ≥ 3:1
 * sur son halo), et les panneaux ouvrables se ferment à Échap en rendant le focus au bouton
 * qui les a ouverts. 1280 × 720, aide-mémoire déplié par défaut ; parcours complet en
 * 800 × 600 (un appui sur Tab coûte une image en rendu logiciel, moins chère en petit).
 */

/** Ce que la page dit de l'élément qui a le focus. */
interface Focused {
  /** Clé stable de l'élément (ordre dans le document), pour détecter le retour au début. */
  readonly key: string;
  /** Composant d'interface qui le contient (`app-…`), `null` hors interface. */
  readonly owner: string | null;
  readonly tag: string;
  readonly name: string;
  /** Dans la liste des bacs des réglages. */
  readonly inTankList: boolean;
  /** Boîte non vide et au moins en partie dans la fenêtre. */
  readonly visible: boolean;
  readonly outlineStyle: string;
  readonly outlineWidth: number;
  readonly outlineColor: string;
  readonly boxShadow: string;
}

async function openScene(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  return errors;
}

/**
 * Consigne, à chaque `focusin`, ce que la page dit de l'élément qui reçoit le focus, dans
 * `window.__focusLog` : un appui sur Tab coûte déjà une image (≈ 1 s en rendu logiciel), une
 * lecture par appui doublerait la durée du parcours.
 */
function recordFocus(page: Page): Promise<void> {
  return page.addInitScript(() => {
    const log: unknown[] = [];
    (window as unknown as { __focusLog: unknown[] }).__focusLog = log;
    let next = 0;
    const keys = new WeakMap<Element, string>();
    document.addEventListener('focusin', (event) => {
      const el = event.target;
      if (!(el instanceof HTMLElement)) {
        return;
      }
      if (!keys.has(el)) {
        keys.set(el, `${next++}`);
      }
      // Composant le plus extérieur sous `app-root` (un panneau peut en contenir d'autres).
      let owner: Element | null = null;
      for (
        let node = el.parentElement;
        node && node.tagName !== 'APP-ROOT';
        node = node.parentElement
      ) {
        if (node.tagName.startsWith('APP-')) {
          owner = node;
        }
      }
      const labelled = el.getAttribute('aria-labelledby');
      const labels = (el as HTMLInputElement).labels;
      const name = (
        el.getAttribute('aria-label') ??
        (labelled ? document.getElementById(labelled)?.textContent : null) ??
        (labels && labels.length > 0 ? labels[0]?.textContent : null) ??
        el.getAttribute('title') ??
        el.textContent ??
        ''
      ).trim();
      const box = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      log.push({
        key: keys.get(el),
        owner: owner ? owner.tagName.toLowerCase() : null,
        tag: el.tagName.toLowerCase(),
        name,
        inTankList: el.closest('[data-section="bacs"]') !== null,
        visible:
          box.width > 0 &&
          box.height > 0 &&
          box.right > 0 &&
          box.bottom > 0 &&
          box.left < innerWidth &&
          box.top < innerHeight,
        outlineStyle: style.outlineStyle,
        outlineWidth: parseFloat(style.outlineWidth),
        outlineColor: style.outlineColor,
        boxShadow: style.boxShadow,
      });
    });
  });
}

function focusLog(page: Page): Promise<Focused[]> {
  return page.evaluate(() => (window as unknown as { __focusLog: Focused[] }).__focusLog);
}

/** Couleur calculée `rgb(r, g, b)` ou `rgba(…)` lue en composantes. */
function parseRgb(value: string): Rgb {
  const parts = /rgba?\((\d+), (\d+), (\d+)/.exec(value);
  if (!parts) {
    throw new Error(`Couleur calculée « ${value} » illisible`);
  }
  return [Number(parts[1]), Number(parts[2]), Number(parts[3])];
}

test.describe('Clavier et focus visible (#407)', () => {
  test('Tab parcourt barre des vues, tableau de bord, réglages, liste des bacs et wiki, sans piège', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: 800, height: 600 });
    await recordFocus(page);
    const errors = await openScene(page);
    // Réglages ouverts au clavier, pour que leurs contrôles (liste des bacs comprise) soient
    // dans le parcours ; le parcours part de leur bouton.
    const before = (await focusLog(page)).length;
    const settings = page.getByRole('button', { name: 'Réglages', exact: true });
    await settings.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('section.control-panel')).toBeVisible();
    // Contrôles atteignables au clavier : le parcours doit en faire le tour, et revenir.
    const reachable = await page.evaluate(
      () =>
        [
          ...document.querySelectorAll<HTMLElement>(
            'button, input, select, textarea, a[href], [tabindex]',
          ),
        ].filter((el) => el.tabIndex >= 0 && !(el as HTMLButtonElement).disabled).length,
    );
    for (let i = 0; i < reachable + 3; i++) {
      await page.keyboard.press('Tab');
    }
    // Premier élément : « Réglages » (focus posé par le test) ; les suivants, atteints à Tab,
    // jusqu'au retour sur un élément déjà vu.
    const [start, ...tabbed] = (await focusLog(page)).slice(before);
    expect(start?.name).toBe('Réglages');
    const seen: Focused[] = start ? [start] : [];
    const checked: Focused[] = [];
    let wrapped = false;
    for (const focused of tabbed) {
      checked.push(focused);
      wrapped = seen.some((other) => other.key === focused.key);
      if (wrapped) {
        break;
      }
      seen.push(focused);
    }

    expect(wrapped, 'le parcours revient au premier contrôle (aucun piège)').toBe(true);
    const owners = new Set(seen.map((focused) => focused.owner));
    for (const owner of [
      'app-view-presets-bar',
      'app-dashboard-frame',
      'app-control-panel',
      'app-species-wiki',
      'app-commands-help',
    ]) {
      expect(owners, owner).toContain(owner);
    }
    expect(
      seen.some((focused) => focused.inTankList),
      'liste des bacs',
    ).toBe(true);

    for (const focused of checked) {
      const label = `${focused.owner} ${focused.tag} « ${focused.name} »`;
      expect.soft(focused.owner, `${label} : hors de l'interface`).not.toBeNull();
      expect.soft(focused.visible, `${label} : invisible`).toBe(true);
      expect.soft(focused.name, `${label} : sans nom`).not.toBe('');
      expect.soft(focused.outlineStyle, `${label} : sans anneau`).toBe('solid');
      expect.soft(focused.outlineWidth, `${label} : anneau trop fin`).toBeGreaterThanOrEqual(2);
      // Halo opaque de part et d'autre de l'anneau : seul voisin, quelle que soit la scène.
      expect.soft(focused.boxShadow, `${label} : sans halo`).toMatch(/^rgb\(20, 20, 24\) /);
      if (focused.boxShadow.startsWith('rgb(')) {
        const ratio = contrastRatio(parseRgb(focused.outlineColor), parseRgb(focused.boxShadow));
        expect.soft(ratio, `${label} : anneau peu contrasté`).toBeGreaterThanOrEqual(3);
      }
    }
    expect(errors).toEqual([]);
  });

  test('Échap ferme « Réglages », « Commandes » et le wiki, et rend le focus au bouton d’origine', async ({
    page,
  }) => {
    const errors = await openScene(page);
    const settings = page.getByRole('button', { name: 'Réglages', exact: true });

    // Réglages : ouverts au clavier, focus dans le panneau, puis Échap.
    await settings.focus();
    await page.keyboard.press('Enter');
    await expect(settings).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Tab');
    await expect(page.locator('section.control-panel')).toContainText('Environnement');
    expect(
      await page.evaluate(() => !!document.activeElement?.closest('section.control-panel')),
    ).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.locator('section.control-panel')).toHaveCount(0);
    await expect(settings).toBeFocused();

    // Commandes (déplié par défaut) : Échap sur « Replier ».
    const fold = page.getByRole('button', { name: /Replier l’aide-mémoire/ });
    await fold.focus();
    await page.keyboard.press('Escape');
    await expect(page.locator('#aide-commandes')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Afficher l’aide-mémoire/ })).toBeFocused();

    // Wiki : ouvert au clavier, Échap.
    const wiki = page.getByRole('button', { name: 'Wiki des espèces' });
    await wiki.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#wiki-especes')).toBeVisible();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Escape');
    await expect(page.locator('#wiki-especes')).toHaveCount(0);
    await expect(wiki).toBeFocused();

    expect(errors).toEqual([]);
  });
});
