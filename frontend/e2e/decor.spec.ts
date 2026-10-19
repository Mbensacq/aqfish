import { expect, test } from '@playwright/test';

/**
 * Décor en données (issue #48), vu depuis l'application réelle : le monde contient les
 * rochers du décor par défaut, aucun poisson n'est à l'intérieur de leur forme de collision
 * (union de sphères), à plusieurs instants et pour plusieurs graines, et la page ne produit
 * aucune erreur, y compris sur un petit écran. Le monde est lu via l'API de débogage
 * d'Angular (build de développement), comme `evitement.spec.ts`.
 */
interface DecorProbe {
  rocks: number;
  obstacleCount: number;
  fish: number;
  minPenetration: number;
}

async function probeDecor(page: import('@playwright/test').Page): Promise<DecorProbe | null> {
  return page.evaluate((): DecorProbe | null => {
    const debug = (window as unknown as { ng?: { getComponent(el: Element): unknown } }).ng;
    const host = document.querySelector('app-aquarium-host');
    const component = debug && host ? debug.getComponent(host) : null;
    const world = (
      component as {
        world: {
          decor: { kind: string }[];
          obstacles: {
            shape: string;
            spheres?: { x: number; y: number; z: number; radius: number }[];
          }[];
          entities: { x: number; y: number; z: number }[];
        } | null;
      } | null
    )?.world;
    if (!world) {
      return null;
    }
    // Distance signée minimale d'un poisson à l'union de sphères (négative = à l'intérieur).
    let minDistance = Infinity;
    for (const o of world.obstacles) {
      for (const s of o.spheres ?? []) {
        for (const f of world.entities) {
          const d = Math.hypot(f.x - s.x, f.y - s.y, f.z - s.z) - s.radius;
          minDistance = Math.min(minDistance, d);
        }
      }
    }
    return {
      rocks: world.decor.filter((d) => d.kind === 'rock').length,
      obstacleCount: world.obstacles.length,
      fish: world.entities.length,
      minPenetration: minDistance,
    };
  });
}

for (const seed of [1, 42, 4294967295]) {
  for (const time of [5, 60]) {
    test(`graine ${seed}, ${time} s : des rochers, aucun poisson dedans`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
      await page.goto(`/?capture=1&seed=${seed}&camera=three-quarter&time=${time}`);
      await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
      const probe = await probeDecor(page);
      expect(probe, 'monde lisible via window.ng (build de développement)').not.toBeNull();
      expect(probe!.rocks).toBeGreaterThanOrEqual(1);
      expect(probe!.obstacleCount).toBeGreaterThanOrEqual(probe!.rocks);
      expect(probe!.fish).toBeGreaterThan(0);
      expect(Number.isFinite(probe!.minPenetration), 'des sphères ont été mesurées').toBe(true);
      expect(probe!.minPenetration).toBeGreaterThanOrEqual(0);
      expect(errors).toEqual([]);
    });
  }
}

test('petite fenêtre (390 × 844) : les rochers se dessinent sans erreur', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?capture=1&seed=42&camera=three-quarter&time=10');
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  const probe = await probeDecor(page);
  expect(probe).not.toBeNull();
  expect(probe!.rocks).toBeGreaterThanOrEqual(1);
  expect(errors).toEqual([]);
});
