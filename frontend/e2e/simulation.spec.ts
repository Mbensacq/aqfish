import { expect, test, type Page } from '@playwright/test';

/**
 * Parcours de la simulation déterministe (QA, nuit 2026-10-16, issue #5) : le monde est
 * avancé jusqu'à `time` avant le signal « prêt » en mode capture, puis figé ; hors capture,
 * il avance en temps réel par pas fixes de 1/60 s.
 *
 * L'état du monde n'est pas exposé dans le DOM : on le lit sur le composant hôte via l'API
 * de débogage d'Angular (`window.ng`), disponible car le serveur des e2e est `ng serve`
 * (build de développement, voir playwright.config.ts).
 */

interface WorldProbe {
  tick: number;
  time: number;
  seed: number;
  alpha: number;
}

/** Valeurs alignées sur src/app/sim/constants.ts et src/app/core/capture/capture-params.ts. */
const TICKS_PER_SECOND = 60;
const MAX_CAPTURE_TIME_SECONDS = 3600;
const MAX_STEPS_PER_FRAME = 5;

async function openScene(page: Page, search = ''): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`/${search}`);
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  return errors;
}

async function readWorld(page: Page): Promise<WorldProbe> {
  const probe = await page.evaluate(() => {
    const debug = (window as unknown as { ng?: { getComponent(el: Element): unknown } }).ng;
    const host = document.querySelector('app-aquarium-host');
    if (!debug || !host) {
      return null;
    }
    const component = debug.getComponent(host) as {
      world: { tick: number; time: number; seed: number } | null;
      interpolationAlpha: number;
    } | null;
    const world = component?.world;
    return world
      ? {
          tick: world.tick,
          time: world.time,
          seed: world.seed,
          alpha: component.interpolationAlpha,
        }
      : null;
  });
  expect(probe, 'monde lisible via window.ng (build de développement)').not.toBeNull();
  return probe!;
}

/** Laisse passer `count` images (requestAnimationFrame), sans attente fixe. */
async function waitFrames(page: Page, count: number): Promise<void> {
  await page.evaluate(
    (n) =>
      new Promise<void>((resolve) => {
        let left = n;
        const tick = (): void => {
          left -= 1;
          if (left <= 0) {
            resolve();
          } else {
            requestAnimationFrame(tick);
          }
        };
        requestAnimationFrame(tick);
      }),
    count,
  );
}

test.describe('Simulation en mode capture', () => {
  test('le monde a atteint time avant le signal « prêt », puis reste figé', async ({ page }) => {
    const errors = await openScene(page, '?capture=1&seed=42&camera=front&time=30');
    const atReady = await readWorld(page);
    expect(atReady.tick).toBe(30 * TICKS_PER_SECOND);
    expect(atReady.time).toBeCloseTo(30, 6);
    expect(atReady.seed).toBe(42);

    await waitFrames(page, 10);
    expect(await readWorld(page)).toEqual(atReady);

    // Un redimensionnement rend de nouvelles images : le temps réel écoulé ne doit pas compter.
    await page.setViewportSize({ width: 800, height: 600 });
    await expect
      .poll(() => page.locator('canvas').evaluate((c: HTMLCanvasElement) => c.width))
      .toBe(800);
    await page.setViewportSize({ width: 1024, height: 640 });
    await expect
      .poll(() => page.locator('canvas').evaluate((c: HTMLCanvasElement) => c.width))
      .toBe(1024);
    await waitFrames(page, 10);
    expect(await readWorld(page)).toEqual(atReady);
    expect(errors).toEqual([]);
  });

  test('time = 0 : aucun pas', async ({ page }) => {
    await openScene(page, '?capture=1&time=0');
    expect((await readWorld(page)).tick).toBe(0);
  });

  test('time arrondi au pas le plus proche', async ({ page }) => {
    // 0,6 pas ⇒ 1 pas ; 0,48 pas ⇒ 0 pas.
    await openScene(page, `?capture=1&time=${0.6 / TICKS_PER_SECOND}`);
    expect((await readWorld(page)).tick).toBe(1);
    await openScene(page, `?capture=1&time=${0.48 / TICKS_PER_SECOND}`);
    expect((await readWorld(page)).tick).toBe(0);
  });

  test('un time démesuré est plafonné et l’image reste produite', async ({ page }) => {
    const errors = await openScene(page, '?capture=1&time=1e12');
    expect((await readWorld(page)).tick).toBe(MAX_CAPTURE_TIME_SECONDS * TICKS_PER_SECOND);
    expect(errors).toEqual([]);
  });

  test('la graine de l’URL est celle du monde ; une graine invalide retombe sur 42', async ({
    page,
  }) => {
    await openScene(page, '?capture=1&seed=4294967295');
    expect((await readWorld(page)).seed).toBe(4294967295);
    await openScene(page, '?capture=1&seed=4294967296');
    expect((await readWorld(page)).seed).toBe(42);
  });

  test('même URL ⇒ même monde', async ({ page }) => {
    const url = '?capture=1&seed=123&time=12.5';
    await openScene(page, url);
    const first = await readWorld(page);
    await openScene(page, url);
    expect(await readWorld(page)).toEqual(first);
  });
});

test.describe('Simulation hors capture', () => {
  test('le monde avance en temps réel par pas fixes, sans emballement', async ({ page }) => {
    const errors = await openScene(page, '?seed=7');
    const start = await readWorld(page);
    const startMs = await page.evaluate(() => performance.now());
    expect(start.seed).toBe(7);

    // ~0,5 s d'observation : assez pour qu'un double pas par image dépasse la borne ci-dessous.
    await expect.poll(async () => (await readWorld(page)).tick).toBeGreaterThan(start.tick + 30);

    const end = await readWorld(page);
    const elapsedSeconds = ((await page.evaluate(() => performance.now())) - startMs) / 1000;
    // Jamais plus de pas que le temps réel écoulé. Marge : décalage entre l'horodatage rAF et
    // performance.now(), plus le reste de l'accumulateur (au plus MAX_STEPS_PER_FRAME pas).
    expect(end.tick - start.tick).toBeLessThanOrEqual(
      Math.ceil(elapsedSeconds * TICKS_PER_SECOND) + MAX_STEPS_PER_FRAME,
    );
    expect(end.time).toBeCloseTo(end.tick / TICKS_PER_SECOND, 6);
    expect(end.alpha).toBeGreaterThanOrEqual(0);
    expect(end.alpha).toBeLessThan(1);
    expect(errors).toEqual([]);
  });

  test('le paramètre time est ignoré hors capture (départ à t = 0)', async ({ page }) => {
    await openScene(page, '?time=3600');
    expect((await readWorld(page)).tick).toBeLessThan(TICKS_PER_SECOND * 60);
  });
});
