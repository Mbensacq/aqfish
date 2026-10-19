import { expect, test, type Page } from '@playwright/test';

import { PALETTE } from '../src/app/render/palette';
import { SIM_DT } from '../src/app/sim/constants';

/**
 * Plantes qui ondulent (issue #49), vues depuis l'application réelle.
 *
 * Le décor contient des plantes des deux formes, et leur mouvement est visible mais lent :
 * à 1 s d'écart, une part nette des pixels de végétation a changé ; d'une image à la
 * suivante (un pas de simulation), presque rien. On ne compare que les pixels de
 * végétation (couleurs que les poissons n'ont pas) pour isoler les plantes, les poissons
 * bougeant eux aussi. Le temps vient de l'URL (contrat de capture) : chaque image est
 * déterministe.
 */
const VEGETATION = [
  PALETTE.vegetationOmbre,
  PALETTE.vegetationSombre,
  PALETTE.vegetation,
  PALETTE.vegetationClaire,
  PALETTE.vegetationLumineuse,
];

async function shoot(page: Page, time: number, camera = 'front'): Promise<string> {
  await page.goto(`/?capture=1&seed=42&camera=${camera}&time=${time}`);
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  return (await page.screenshot({ animations: 'disabled' })).toString('base64');
}

interface VegetationDiff {
  /** Pixels de végétation dans l'une ou l'autre image. */
  vegetation: number;
  /** Parmi eux, pixels dont la couleur diffère entre les deux images. */
  changed: number;
}

/** Compare deux captures (PNG en base64) sur les seuls pixels de végétation. */
async function vegetationDiff(page: Page, a: string, b: string): Promise<VegetationDiff> {
  return page.evaluate(
    async ({ a, b, vegetation }) => {
      const decode = async (png: string): Promise<Uint8ClampedArray> => {
        const blob = await (await fetch(`data:image/png;base64,${png}`)).blob();
        const bitmap = await createImageBitmap(blob);
        const context = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d');
        if (!context) {
          throw new Error('Contexte 2D indisponible');
        }
        context.drawImage(bitmap, 0, 0);
        return context.getImageData(0, 0, bitmap.width, bitmap.height).data;
      };
      const hex = (d: Uint8ClampedArray, i: number): string =>
        '#' + [d[i], d[i + 1], d[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('');
      const [da, db] = [await decode(a), await decode(b)];
      const green = new Set(vegetation);
      let count = 0;
      let changed = 0;
      for (let i = 0; i < da.length; i += 4) {
        const ca = hex(da, i);
        const cb = hex(db, i);
        if (green.has(ca) || green.has(cb)) {
          count++;
          if (ca !== cb) {
            changed++;
          }
        }
      }
      return { vegetation: count, changed };
    },
    { a, b, vegetation: VEGETATION },
  );
}

test.describe('Plantes qui ondulent', () => {
  test('le monde contient des plantes des deux formes, sans erreur', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto('/?capture=1&seed=42&camera=three-quarter&time=5');
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    const forms = await page.evaluate((): string[] => {
      const debug = (window as unknown as { ng?: { getComponent(el: Element): unknown } }).ng;
      const host = document.querySelector('app-aquarium-host');
      const component = debug && host ? debug.getComponent(host) : null;
      const world = (component as { world: { decor: { kind: string; form?: string }[] } | null })
        ?.world;
      return (world?.decor ?? []).filter((d) => d.kind === 'plant').map((d) => d.form ?? '');
    });
    expect(forms).toContain('tall');
    expect(forms).toContain('tuft');
    expect(errors).toEqual([]);
  });

  test('mouvement visible à 1 s d’écart, sans clignotement d’une image à la suivante', async ({
    page,
  }) => {
    const t = 12;
    const base = await shoot(page, t);
    const next = await shoot(page, t + SIM_DT);
    const after = await shoot(page, t + SIM_DT * 2);
    const later = await shoot(page, t + 1);
    const step1 = await vegetationDiff(page, base, next);
    const step2 = await vegetationDiff(page, next, after);
    const second = await vegetationDiff(page, base, later);
    // Des plantes à l'écran.
    expect(base === later).toBe(false);
    expect(second.vegetation).toBeGreaterThan(2000);
    // Visible : une part nette de la végétation a bougé en 1 s.
    expect(second.changed / second.vegetation).toBeGreaterThan(0.05);
    // Lent, sans clignotement : d'une image à la suivante, très peu de changements, bien
    // moins qu'en 1 s, et pas de saut d'une paire d'images à l'autre.
    for (const step of [step1, step2]) {
      expect(step.changed / step.vegetation).toBeLessThan(0.03);
      expect(step.changed * 5).toBeLessThan(second.changed);
    }
  });
});
