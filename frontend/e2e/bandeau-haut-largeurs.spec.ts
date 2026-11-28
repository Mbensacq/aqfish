import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * Bandeau du haut entre 768 et 1439 px (#881) : à 1100 × 720, aide-mémoire déplié, l'heure et
 * la vitesse recouvraient la valeur et la jauge du pH. La simulation passe désormais sous les
 * jauges quand la place manque : les boîtes du pH et de la simulation ne se chevauchent à
 * aucune largeur, aide-mémoire déplié ou replié, et la simulation reste dans le cadre. Sur
 * tablette (640 à 1099 px), l'aide-mémoire déplié descend sous le cadre passé sur deux lignes.
 *
 * Un seul test (la page est rechargée une fois) : la scène est à l'arrêt (`vitesse=0`) et la
 * largeur change par `setViewportSize`.
 */

const WIDTHS = [640, 700, 768, 900, 1024, 1100, 1180, 1280, 1366, 1439] as const;

interface Rect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

async function rect(locator: Locator): Promise<Rect> {
  return locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  });
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/** Déplie ou replie l'aide-mémoire « Commandes » selon `open`. */
async function setCommandsHelp(page: Page, open: boolean): Promise<void> {
  const name = open ? /Afficher l’aide-mémoire des commandes/ : /Replier l’aide-mémoire/;
  const toggle = page.getByRole('button', { name });
  if (await toggle.isVisible()) {
    await toggle.click();
  }
  await expect(page.locator('#aide-commandes')).toBeVisible({ visible: open });
}

async function checkWidth(page: Page, width: number, helpOpen: boolean): Promise<void> {
  await page.setViewportSize({ width, height: 720 });
  await setCommandsHelp(page, helpOpen);
  const frame = page.locator('[data-dashboard]');
  const ph = frame.locator('[data-gauge="ph"]');
  const sim = frame.locator('[data-dashboard-sim]');
  await expect(ph).toBeVisible();
  await expect(sim).toBeVisible();
  const [phBox, simBox, frameBox] = [await rect(ph), await rect(sim), await rect(frame)];
  const where = `${width} px, aide-mémoire ${helpOpen ? 'déplié' : 'replié'}`;
  expect(overlaps(phBox, simBox), `pH et simulation se chevauchent (${where})`).toBe(false);
  // Chaque enfant de la simulation (heure, vitesse) reste dans le cadre.
  for (const part of await sim.locator(':scope > *').all()) {
    const box = await rect(part);
    expect(box.left, `simulation hors du cadre (${where})`).toBeGreaterThanOrEqual(frameBox.left);
    expect(box.right, `simulation hors du cadre (${where})`).toBeLessThanOrEqual(frameBox.right);
    expect(overlaps(phBox, box), `pH sous la simulation (${where})`).toBe(false);
  }
  if (helpOpen && width < 1100) {
    const help = await rect(page.locator('app-commands-help'));
    expect(help.top, `aide-mémoire sur le cadre (${where})`).toBeGreaterThanOrEqual(
      frameBox.bottom,
    );
  }
}

test('pH et heure du bandeau du haut sans chevauchement de 768 à 1439 px (#881)', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1100, height: 720 });
  await page.goto('/?seed=42&vitesse=0');
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  for (const helpOpen of [true, false]) {
    for (const width of WIDTHS) {
      await test.step(`${width} px, aide-mémoire ${helpOpen ? 'déplié' : 'replié'}`, () =>
        checkWidth(page, width, helpOpen));
    }
  }
  expect(errors).toEqual([]);
});
