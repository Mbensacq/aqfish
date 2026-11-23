import { expect, type Page } from '@playwright/test';

import { createDayClock } from '../src/app/sim/daylight';
import { DEFAULT_DECOR } from '../src/app/sim/decor';
import { environmentWater } from '../src/app/sim/environment';
import { isGrowingPlant, plantLimits } from '../src/app/sim/plant-growth';
import { serializeWorld } from '../src/app/sim/save';
import { createDefaultWorld } from '../src/app/sim/world';
import type { MutableWorld } from '../src/app/sim/world-types';
import { card, hostEl } from './outils-seance';
import { fermerReglages, ouvrirReglages } from './outils-panneau';

/**
 * Outils des e2e de l'étape « taille » de la séance d'entretien (#623) : import d'un bac aux
 * plantes à leur plafond, saut jusqu'à la taille, coupe à la souris ou au doigt. Les tests sont
 * répartis en deux fichiers pour que la CI les place dans des parts différentes.
 */
const surface = environmentWater('tropical').maxY;
const tall = DEFAULT_DECOR.filter(isGrowingPlant);
export const caps = tall.map((item) => plantLimits(item, surface).cap);

/** Pousses affichées (`data-aqfish-plants`, « p1,p2,…;lumière du fond en % »). */
export async function growths(page: Page): Promise<number[]> {
  const raw = (await hostEl(page).getAttribute('data-aqfish-plants')) ?? '';
  return raw
    .split(';')[0]
    .split(',')
    .filter((g) => g !== '')
    .map(Number);
}

export const pruned = async (page: Page): Promise<boolean> =>
  (await growths(page)).some((g, n) => g < caps[n]!);

/** Importe `world`, simulation en pause, midi figé. */
export async function importWorld(page: Page, world: MutableWorld, name: string): Promise<void> {
  const text = serializeWorld(world, { speed: 0, clock: createDayClock(12, 1200, true) });
  await ouvrirReglages(page, 'Sauvegarde et partage');
  await page.locator('[data-section="sauvegarde"] input[type="file"]').setInputFiles({
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });
  await expect(hostEl(page)).toHaveAttribute('data-aqfish-speed', '0');
  await fermerReglages(page);
}

/** Bac tropical par défaut, plantes à tige à leur plafond. */
export async function importTallTank(page: Page): Promise<void> {
  const world: MutableWorld = createDefaultWorld(42);
  world.water = {
    ...world.water,
    plantGrowth: Object.fromEntries(tall.map((item, n) => [String(item.seed), caps[n]])),
  };
  await importWorld(page, world, 'plantes.json');
  await expect(hostEl(page)).toHaveAttribute('data-aqfish-plants', `${caps.join(',')};88`);
}

/** Saute les quatre premières étapes jusqu'à la taille. */
export async function skipToPrune(page: Page, tap = false): Promise<void> {
  for (let i = 0; i < 4; i++) {
    const skip = card(page).locator('[data-care-skip]');
    await (tap ? skip.tap() : skip.click());
  }
  await expect(card(page)).toHaveAttribute('data-step', 'taille');
}

/** Points visés : tiges des deux grandes plantes du fond en vue trois-quarts (1280 × 720). */
const TARGETS = [
  [0.414, 0.42],
  [0.58, 0.47],
  [0.412, 0.36],
  [0.575, 0.55],
  [0.42, 0.48],
  [0.585, 0.4],
] as const;

export async function cutOnePlant(page: Page, tap: boolean): Promise<void> {
  const { x, y, width, height } = (await page.locator('app-aquarium-host canvas').boundingBox())!;
  for (const [fx, fy] of TARGETS) {
    if (tap) {
      await page.touchscreen.tap(x + fx * width, y + fy * height);
    } else {
      await page.mouse.click(x + fx * width, y + fy * height);
    }
    if (await pruned(page)) {
      return;
    }
  }
  await expect.poll(() => pruned(page)).toBe(true);
}
