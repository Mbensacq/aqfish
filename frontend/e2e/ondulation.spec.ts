import { expect, test } from '@playwright/test';

/**
 * Ondulation du corps (issue #29, QA cycle 10), vue depuis l'application réelle.
 *
 * Le monde est lu via l'API de débogage d'Angular (build de développement), comme
 * `neon.spec.ts`. La logique (valeurs exactes, déterminisme) est couverte par
 * `sim/undulation.spec.ts` ; ici, on vérifie le branchement bout en bout : phases
 * individuelles distinctes, rendu identique à graine égale, rendu différent d'une graine
 * à l'autre.
 */
const URL = (seed: number): string => `/?capture=1&seed=${seed}&camera=top&time=30`;

async function readPhases(page: import('@playwright/test').Page): Promise<number[]> {
  return page.evaluate((): number[] => {
    const debug = (window as unknown as { ng?: { getComponent(el: Element): unknown } }).ng;
    const host = document.querySelector('app-aquarium-host');
    const component = debug && host ? debug.getComponent(host) : null;
    const world = (component as { world: { entities: { phase: number }[] } | null } | null)?.world;
    return world ? world.entities.map((e) => e.phase) : [];
  });
}

test.describe('Ondulation du corps', () => {
  test('les poissons ont des phases individuelles distinctes et valides', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(URL(42));
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    const phases = await readPhases(page);
    expect(phases.length).toBeGreaterThan(1);
    for (const phase of phases) {
      expect(Number.isFinite(phase)).toBe(true);
      expect(phase).toBeGreaterThanOrEqual(0);
      expect(phase).toBeLessThan(2 * Math.PI);
    }
    expect(new Set(phases.map((p) => p.toFixed(6))).size).toBe(phases.length);
    expect(errors).toEqual([]);
  });

  test('même URL ⇒ même image ; autre graine ⇒ autre image', async ({ page }) => {
    const shoot = async (seed: number): Promise<Buffer> => {
      await page.goto(URL(seed));
      await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
      return page.screenshot({ animations: 'disabled' });
    };
    const a = await shoot(42);
    const b = await shoot(42);
    const c = await shoot(7);
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });
});
