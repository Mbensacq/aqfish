import { expect, test, type Page } from '@playwright/test';

import { PALETTE } from '../src/app/render/palette';

/**
 * Première espèce qui nage, le néon (issue #8) : les poissons sont visibles avec leurs
 * couleurs de la palette, ondulent avec le temps de simulation, et une même URL de capture
 * donne toujours la même image.
 */

async function captureScreen(page: Page, search: string): Promise<Buffer> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`/${search}`);
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  const png = await page.screenshot({ animations: 'disabled' });
  expect(errors).toEqual([]);
  return png;
}

/** Nombre de pixels de l'image égaux à chacune des couleurs demandées. */
async function countColors(page: Page, png: Buffer, colors: string[]): Promise<number[]> {
  return page.evaluate(
    async ({ png, colors }) => {
      const blob = await (await fetch(`data:image/png;base64,${png}`)).blob();
      const bitmap = await createImageBitmap(blob);
      const context = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d');
      if (!context) {
        throw new Error('Contexte 2D indisponible');
      }
      context.drawImage(bitmap, 0, 0);
      const data = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
      const wanted = colors.map((c) => parseInt(c.slice(1), 16));
      const counts = wanted.map(() => 0);
      for (let i = 0; i < data.length; i += 4) {
        const rgb = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
        const index = wanted.indexOf(rgb);
        if (index >= 0) {
          counts[index]++;
        }
      }
      return counts;
    },
    { png: png.toString('base64'), colors },
  );
}

test.describe('Néons', () => {
  test('visibles de face avec le bleu et le rouge néon de la palette', async ({ page }) => {
    const png = await captureScreen(page, '?capture=1&seed=42&camera=front&time=30');
    const [blue, red] = await countColors(page, png, [PALETTE.neonBleu, PALETTE.neonRouge]);
    // Un pixel de scène = 3 × 3 pixels d'écran ; plusieurs poissons visibles.
    expect(blue).toBeGreaterThan(9 * 10);
    expect(red).toBeGreaterThan(9 * 10);
  });

  test('même URL de capture ⇒ image identique', async ({ page }) => {
    const url = '?capture=1&seed=7&camera=three-quarter&time=12';
    const first = await captureScreen(page, url);
    const second = await captureScreen(page, url);
    expect(second.equals(first)).toBe(true);
  });

  test('temps de simulation différent ⇒ image différente (nage et ondulation)', async ({
    page,
  }) => {
    const a = await captureScreen(page, '?capture=1&seed=7&camera=front&time=12');
    const b = await captureScreen(page, '?capture=1&seed=7&camera=front&time=12.1');
    expect(b.equals(a)).toBe(false);
  });

  test('sans néons, la scène ne contient pas leurs couleurs (témoin)', async ({ page }) => {
    // Témoin du premier test : la vue de dessous cache les poissons derrière le substrat
    // opaque (ADR 0006) ; ni bleu ni rouge néon ne doivent apparaître ailleurs.
    const png = await captureScreen(page, '?capture=1&seed=42&camera=bottom&time=0');
    const [blue, red] = await countColors(page, png, [PALETTE.neonBleu, PALETTE.neonRouge]);
    expect(blue + red).toBeLessThan(9 * 10);
  });
});

/** Valeurs alignées sur src/app/sim/tank.ts (bac par défaut). */
const TANK = { halfWidth: 0.6, halfDepth: 0.25, sand: 0.06, water: 0.6 * 0.9 };

interface FishProbe {
  x: number;
  y: number;
  z: number;
}

/** Positions des poissons du monde réel de l'application (API de débogage d'Angular). */
async function readFish(page: Page): Promise<FishProbe[]> {
  const fish = await page.evaluate(() => {
    const debug = (window as unknown as { ng?: { getComponent(el: Element): unknown } }).ng;
    const host = document.querySelector('app-aquarium-host');
    const component = debug && host ? debug.getComponent(host) : null;
    const world = (component as { world: { entities: FishProbe[] } | null } | null)?.world;
    return world ? world.entities.map(({ x, y, z }) => ({ x, y, z })) : null;
  });
  expect(fish, 'monde lisible via window.ng (build de développement)').not.toBeNull();
  return fish!;
}

test.describe('Néons : maintien dans le bac (monde réel de l’application)', () => {
  for (const seed of [0, 1, 42, 4294967295]) {
    test(`graine ${seed} : 8 poissons, tous dans le volume d’eau après 600 s`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`/?capture=1&seed=${seed}&camera=side&time=600`);
      await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
      const fish = await readFish(page);
      expect(fish).toHaveLength(8);
      for (const { x, y, z } of fish) {
        expect(Math.abs(x)).toBeLessThanOrEqual(TANK.halfWidth);
        expect(Math.abs(z)).toBeLessThanOrEqual(TANK.halfDepth);
        expect(y).toBeGreaterThanOrEqual(TANK.sand);
        expect(y).toBeLessThanOrEqual(TANK.water);
      }
      expect(errors).toEqual([]);
    });
  }

  test('hors capture, les poissons nagent et restent dans le bac', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    const before = await readFish(page);
    await expect
      .poll(async () => {
        const now = await readFish(page);
        return now.some((f, i) => f.x !== before[i].x || f.z !== before[i].z);
      })
      .toBe(true);
    for (const { x, y, z } of await readFish(page)) {
      expect(Math.abs(x)).toBeLessThanOrEqual(TANK.halfWidth);
      expect(Math.abs(z)).toBeLessThanOrEqual(TANK.halfDepth);
      expect(y).toBeGreaterThanOrEqual(TANK.sand);
      expect(y).toBeLessThanOrEqual(TANK.water);
    }
  });
});
