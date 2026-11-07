import { readFileSync } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';

import {
  ENVIRONMENT_TONE_COLORS,
  EXTENDED_PALETTE_COLORS,
  FOOD_TONE_COLORS,
} from '../src/app/render/palette';
import { lowResolutionSize } from '../src/app/render/pixel-art';
import { photoScale } from '../src/app/render/photo-capture';
import { decodePng, type DecodedPng } from './outils-pixels';

/**
 * Photo du bac (#479) : le bouton « Photo » de la barre des vues télécharge un PNG de la vue
 * courante, à la taille de la cible pixel art agrandie par un facteur entier, sans lissage
 * (chaque pixel de scène est un carré uni de couleurs de la palette), sans interface ; le
 * bouton se prend au clavier avec l'anneau de focus commun (#406). Absent en mode capture.
 */

const WIDTH = 800;
const HEIGHT = 600;
const photoButton = (page: Page) => page.locator('button[data-action="photo"]');

async function open(page: Page, search = '?seed=7'): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: WIDTH, height: HEIGHT });
  await page.goto(`/${search}`);
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  return errors;
}

/** Télécharge la photo déclenchée par `action` et la décode. */
async function photo(page: Page, action: () => Promise<void>): Promise<[string, DecodedPng]> {
  const [download] = await Promise.all([page.waitForEvent('download'), action()]);
  const png = decodePng(readFileSync((await download.path())!));
  return [download.suggestedFilename(), png];
}

function hex(rgba: Uint8Array, i: number): string {
  return `#${[rgba[i], rgba[i + 1], rgba[i + 2]].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

test.describe('Photo du bac (#479)', () => {
  test('PNG daté, agrandi par un entier, sans lissage, couleurs de la palette seulement', async ({
    page,
  }) => {
    const errors = await open(page);
    const [name, png] = await photo(page, () => photoButton(page).click());
    expect(name).toMatch(/^aqfish-\d{4}-\d{2}-\d{2}-\d{6}\.png$/);

    // Canvas plein écran, pixel ratio 1 en test : cible ceil(800 / 3) × ceil(600 / 3).
    const target = lowResolutionSize(WIDTH, HEIGHT);
    const factor = photoScale(target.width, target.height);
    expect(Number.isInteger(factor)).toBe(true);
    expect(factor).toBeGreaterThan(1);
    expect([png.width, png.height]).toEqual([target.width * factor, target.height * factor]);

    // Chaque pixel de scène est un carré uni de factor × factor pixels.
    const { rgba, width } = png;
    let mixed = 0;
    for (let by = 0; by < target.height; by++) {
      for (let bx = 0; bx < target.width; bx++) {
        const first = (by * factor * width + bx * factor) * 4;
        for (let dy = 0; dy < factor; dy++) {
          for (let dx = 0; dx < factor; dx++) {
            const i = ((by * factor + dy) * width + bx * factor + dx) * 4;
            if (
              rgba[i] !== rgba[first] ||
              rgba[i + 1] !== rgba[first + 1] ||
              rgba[i + 2] !== rgba[first + 2]
            ) {
              mixed++;
            }
          }
        }
      }
    }
    expect(mixed).toBe(0);

    // Uniquement des couleurs de la palette (aucun lissage, aucune interface), opaques.
    const palette = new Set(
      [...EXTENDED_PALETTE_COLORS, ...ENVIRONMENT_TONE_COLORS, ...FOOD_TONE_COLORS].map((c) =>
        c.toLowerCase(),
      ),
    );
    const strangers = new Set<string>();
    const colors = new Set<string>();
    // Un seul `expect` hors de la boucle : un `expect` par pixel (2,6 millions d'étapes de
    // test) bloque Playwright plusieurs minutes.
    let translucent = 0;
    for (let i = 0; i < rgba.length; i += 4) {
      const color = hex(rgba, i);
      colors.add(color);
      if (!palette.has(color)) {
        strangers.add(color);
      }
      if (rgba[i + 3] !== 255) {
        translucent++;
      }
    }
    expect(translucent).toBe(0);
    expect([...strangers]).toEqual([]);
    // Une vraie image du bac, pas un fond uni.
    expect(colors.size).toBeGreaterThan(8);
    expect(errors).toEqual([]);
  });

  test('clavier : atteint à Tab, anneau de focus visible, Entrée télécharge', async ({ page }) => {
    const errors = await open(page);
    const button = photoButton(page);
    await expect(button).toHaveAccessibleName('Photo du bac : télécharger une image PNG de la vue');
    // Parcours au clavier depuis le bouton précédent de la barre (« Nourrir »).
    await page.locator('button[data-action="nourrir"]').focus();
    await page.keyboard.press('Tab');
    await expect(button).toBeFocused();
    const ring = await button.evaluate((el) => {
      const style = getComputedStyle(el);
      return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
    });
    expect(ring.style).not.toBe('none');
    expect(ring.width).toBeGreaterThanOrEqual(2);
    const [, png] = await photo(page, () => page.keyboard.press('Enter'));
    expect(png.width).toBeGreaterThan(0);
    // Le focus reste sur le bouton, l'application continue de tourner.
    await expect(button).toBeFocused();
    expect(errors).toEqual([]);
  });

  test('absent en mode capture', async ({ page }) => {
    await open(page, '?capture=1&seed=7&camera=front');
    await expect(photoButton(page)).toHaveCount(0);
  });
});
