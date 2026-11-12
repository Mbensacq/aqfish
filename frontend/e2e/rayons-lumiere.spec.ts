import { expect, test, type Page } from '@playwright/test';

/**
 * Rayons de lumière dans l'eau (#567) : lus sur `data-aqfish-rayons` (`force;temps`, force
 * au centième, temps du mouvement en secondes entières). Pleins à midi, éteints à minuit,
 * animés par défaut et fixes sous « Réduire les mouvements ».
 */

const host = (page: Page) => page.locator('app-aquarium-host');

async function openScene(page: Page, search: string): Promise<string[]> {
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

async function rays(page: Page): Promise<{ strength: number; time: number }> {
  const raw = (await host(page).getAttribute('data-aqfish-rayons')) ?? '';
  const [strength, time] = raw.split(';').map(Number);
  return { strength, time };
}

test.describe('rayons de lumière, mouvements normaux', () => {
  test.use({ contextOptions: { reducedMotion: 'no-preference' } });

  test('pleins à midi et animés ; éteints à minuit', async ({ page }) => {
    const errors = await openScene(page, '');
    await expect.poll(async () => (await rays(page)).strength).toBe(1);
    const start = (await rays(page)).time;
    await expect.poll(async () => (await rays(page)).time, { timeout: 20_000 }).not.toBe(start);
    await openScene(page, '?heure=0');
    await expect.poll(async () => (await rays(page)).strength).toBe(0);
    expect(errors).toEqual([]);
  });
});

test.describe('rayons de lumière, « réduire les mouvements »', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('rayons fixes : le temps du mouvement ne bouge plus', async ({ page }) => {
    const errors = await openScene(page, '');
    await expect(host(page)).toHaveAttribute('data-aqfish-mouvements-reduits', 'true');
    await expect.poll(async () => (await rays(page)).strength).toBe(1);
    // Le monde avance d'au moins 3 s simulées (0,06 h sur une journée de 20 min) : sans
    // l'option, le temps des rayons aurait changé de seconde entière.
    const before = await rays(page);
    const hourBefore = Number(await host(page).getAttribute('data-aqfish-hour'));
    await expect
      .poll(async () => Number(await host(page).getAttribute('data-aqfish-hour')), {
        timeout: 30_000,
      })
      .toBeGreaterThanOrEqual(hourBefore + 0.06);
    expect((await rays(page)).time).toBe(before.time);
    expect(errors).toEqual([]);
  });
});
