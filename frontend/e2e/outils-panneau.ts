import { expect, type Locator, type Page } from '@playwright/test';

import { PALETTE } from '../src/app/render/palette';
import { canvasShot, countColors } from './outils-pixels';

/**
 * Outils communs des e2e du panneau de contrôle « Réglages » (#52, #69). Les tests sont
 * répartis en deux fichiers (`panneau.spec.ts`, `panneau-clavier.spec.ts`) pour que la CI les
 * place dans des parts différentes (`e2e/durees.json`, #600).
 */

export const hostEl = (page: Page) => page.locator('app-aquarium-host');
export const toggle = (page: Page) => page.getByRole('button', { name: 'Réglages' });
export const speed = (page: Page) => page.getByRole('slider', { name: 'Vitesse de la simulation' });
export const hour = (page: Page) => page.getByRole('slider', { name: 'Heure de la journée' });
export const autoHour = (page: Page) => page.getByRole('checkbox', { name: 'Heure automatique' });
export const decor = (page: Page) => page.getByRole('checkbox', { name: 'Afficher le décor' });
export const count = (page: Page, plural: string) =>
  page.getByRole('spinbutton', { name: `Nombre de ${plural}` });
export const population = (page: Page) => hostEl(page).getAttribute('data-aqfish-population');

export async function open(page: Page, search = '?seed=42'): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`/${search}`);
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  return errors;
}

/** Ouvre la page puis le panneau « Réglages » d'un clic. */
export async function openPanel(page: Page): Promise<string[]> {
  const errors = await open(page);
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
  return errors;
}

export async function tick(page: Page): Promise<number> {
  return Number(await hostEl(page).getAttribute('data-aqfish-tick'));
}

export function overlaps(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

export async function box(locator: Locator) {
  const b = await locator.boundingBox();
  expect(b, 'élément visible').not.toBeNull();
  return b!;
}

export const VEGETATION = new Set<string>([
  PALETTE.vegetationOmbre,
  PALETTE.vegetationSombre,
  PALETTE.vegetation,
  PALETTE.vegetationClaire,
  PALETTE.vegetationLumineuse,
]);

/** Nombre de pixels de végétation (couleurs que les poissons n'ont pas) du canvas. */
export async function vegetationPixels(page: Page): Promise<number> {
  const counts = countColors(await canvasShot(page), [...VEGETATION]);
  return counts.reduce((sum, n) => sum + n, 0);
}
