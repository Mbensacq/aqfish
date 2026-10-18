import { expect, test } from '@playwright/test';

/**
 * Évitement des parois (issue #28, QA cycle 9), vu depuis l'application réelle : à plusieurs
 * instants et pour plusieurs graines, aucun poisson ne colle une paroi, le sable ou la
 * surface. Seuil de 3 cm (le relevé du cycle 9 donne au moins 10 cm, environ 5 cm depuis le réglage du
 * cycle 13, issue #43) : marge large pour ne
 * pas rendre le test fragile. Garde de non-régression seulement : il passe aussi sur `main`
 * (les marges de rebond existaient déjà) et ne prouve donc pas l'évitement, couvert par les
 * tests unitaires de `sim/avoidance.spec.ts` et `sim/world.spec.ts`.
 *
 * Le monde est lu via l'API de débogage d'Angular (build de développement), comme
 * `neon.spec.ts`. Valeurs alignées sur src/app/sim/tank.ts (bac par défaut).
 */
const TANK = { halfWidth: 0.6, halfDepth: 0.25, sand: 0.06, water: 0.6 * 0.9 };
const MIN_CLEARANCE = 0.03;

interface WorldProbe {
  fish: number;
  clearance: number;
}

for (const seed of [0, 42, 4294967295]) {
  for (const time of [30, 300]) {
    test(`graine ${seed}, ${time} s : aucun poisson au contact d’une paroi`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
      await page.goto(`/?capture=1&seed=${seed}&camera=side&time=${time}`);
      await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
      const probe = await page.evaluate((tank): WorldProbe | null => {
        const debug = (window as unknown as { ng?: { getComponent(el: Element): unknown } }).ng;
        const host = document.querySelector('app-aquarium-host');
        const component = debug && host ? debug.getComponent(host) : null;
        const world = (
          component as {
            world: { entities: { x: number; y: number; z: number }[] } | null;
          } | null
        )?.world;
        if (!world) {
          return null;
        }
        let clearance = Infinity;
        for (const { x, y, z } of world.entities) {
          clearance = Math.min(
            clearance,
            tank.halfWidth - Math.abs(x),
            tank.halfDepth - Math.abs(z),
            y - tank.sand,
            tank.water - y,
          );
        }
        return { fish: world.entities.length, clearance };
      }, TANK);
      expect(probe, 'monde lisible via window.ng (build de développement)').not.toBeNull();
      expect(probe!.fish).toBeGreaterThan(0);
      expect(probe!.clearance).toBeGreaterThanOrEqual(MIN_CLEARANCE);
      expect(errors).toEqual([]);
    });
  }
}
