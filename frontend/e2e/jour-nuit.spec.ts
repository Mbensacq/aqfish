import { expect, test, type Page } from '@playwright/test';

import { PALETTE, PALETTE_COLORS } from '../src/app/render/palette';

/**
 * Cycle jour/nuit (issue #51, ADR 0018) : paramètre d'URL `heure=`, touche `H`, rendu de
 * nuit dans la palette et lisible, filtre `P` à toute heure. L'heure affichée est lue sur
 * `data-aqfish-hour`, l'état de l'horloge sur `data-aqfish-hour-frozen`.
 */

const host = (page: Page) => page.locator('app-aquarium-host');

async function openScene(page: Page, search: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`/${search}`);
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  return errors;
}

async function screenshot(page: Page, search: string): Promise<Buffer> {
  const errors = await openScene(page, search);
  const png = await page.screenshot({ animations: 'disabled' });
  expect(errors).toEqual([]);
  return png;
}

interface NightReport {
  offPalette: number;
  /** Pixels différents du fond de la scène (le bac et son contenu). */
  notBackground: number;
  /** Nombre de pixels de chaque couleur de la palette (`#rrggbb`). */
  counts: Record<string, number>;
}

async function analyse(page: Page, png: Buffer): Promise<NightReport> {
  return page.evaluate(
    async ({ data, palette, background }) => {
      const bitmap = await createImageBitmap(
        await (await fetch(`data:image/png;base64,${data}`)).blob(),
      );
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0);
      const pixels = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
      const hex = (i: number) =>
        '#' + [0, 1, 2].map((k) => pixels[i + k].toString(16).padStart(2, '0')).join('');
      const allowed = new Set(palette);
      let offPalette = 0;
      let notBackground = 0;
      const counts: Record<string, number> = {};
      for (let i = 0; i < pixels.length; i += 4) {
        const color = hex(i);
        if (!allowed.has(color)) offPalette++;
        if (color !== background) notBackground++;
        counts[color] = (counts[color] ?? 0) + 1;
      }
      return { offPalette, notBackground, counts };
    },
    { data: png.toString('base64'), palette: [...PALETTE_COLORS], background: PALETTE.fondScene },
  );
}

const BASE = '?capture=1&seed=42&camera=three-quarter&time=30';

test.describe('Cycle jour/nuit', () => {
  test('heure= : minuit diffère de midi ; midi et valeur invalide = captures par défaut', async ({
    page,
  }) => {
    const byDefault = await screenshot(page, BASE);
    expect(await host(page).getAttribute('data-aqfish-hour')).toBe('12.00');
    const noon = await screenshot(page, `${BASE}&heure=12`);
    const invalid = await screenshot(page, `${BASE}&heure=25`);
    const midnight = await screenshot(page, `${BASE}&heure=0`);
    expect(await host(page).getAttribute('data-aqfish-hour')).toBe('0.00');
    expect(noon.equals(byDefault)).toBe(true);
    expect(invalid.equals(byDefault)).toBe(true);
    expect(midnight.equals(byDefault)).toBe(false);
  });

  test('la nuit, l’image reste dans la palette et le bac se distingue du fond', async ({
    page,
  }) => {
    const day = await analyse(page, await screenshot(page, BASE));
    const night = await analyse(page, await screenshot(page, `${BASE}&heure=0`));
    expect(night.offPalette).toBe(0);
    // Le bac occupe autant de pixels de nuit que de jour : rien ne se fond dans le fond.
    expect(night.notBackground).toBeGreaterThan(day.notBackground * 0.97);
  });

  test('la nuit, les poissons s’assombrissent mais les néons restent lisibles (ADR 0019)', async ({
    page,
  }) => {
    const day = await analyse(page, await screenshot(page, BASE));
    const night = await analyse(page, await screenshot(page, `${BASE}&heure=0`));
    const count = (r: NightReport, color: string) => r.counts[color] ?? 0;
    // Dans cette vue, le blanc des ventres et le rouge néon n'appartiennent qu'aux poissons.
    for (const color of [PALETTE.koiBlanc, PALETTE.neonRouge]) {
      expect(count(day, color)).toBeGreaterThan(0);
      expect(count(night, color)).toBe(0);
    }
    // Le bleu néon reste le même, pixel pour pixel en nombre.
    expect(count(night, PALETTE.neonBleu)).toBeGreaterThan(0);
    expect(count(night, PALETTE.neonBleu)).toBe(count(day, PALETTE.neonBleu));
  });

  test('hors capture : heure= fige l’heure, qui ne bouge plus avec le temps', async ({ page }) => {
    await openScene(page, '?heure=6');
    await expect(host(page)).toHaveAttribute('data-aqfish-hour-frozen', 'true');
    const tick = Number(await host(page).getAttribute('data-aqfish-tick'));
    await expect
      .poll(async () => Number(await host(page).getAttribute('data-aqfish-tick')))
      .toBeGreaterThan(tick + 30);
    expect(await host(page).getAttribute('data-aqfish-hour')).toBe('6.00');
  });

  test('touche H : fige l’heure qui avançait, puis la remet en marche', async ({ page }) => {
    const errors = await openScene(page, '');
    const hour = async () => Number(await host(page).getAttribute('data-aqfish-hour'));
    await expect(host(page)).toHaveAttribute('data-aqfish-hour-frozen', 'false');
    // L'heure avance (journée de 1 200 s : 0,02 h par seconde simulée).
    await expect.poll(hour).toBeGreaterThan(12.02);
    await page.keyboard.press('h');
    await expect(host(page)).toHaveAttribute('data-aqfish-hour-frozen', 'true');
    const frozen = await host(page).getAttribute('data-aqfish-hour');
    const tick = Number(await host(page).getAttribute('data-aqfish-tick'));
    await expect
      .poll(async () => Number(await host(page).getAttribute('data-aqfish-tick')))
      .toBeGreaterThan(tick + 30);
    expect(await host(page).getAttribute('data-aqfish-hour')).toBe(frozen);
    await page.keyboard.press('H');
    await expect(host(page)).toHaveAttribute('data-aqfish-hour-frozen', 'false');
    await expect.poll(hour).toBeGreaterThan(Number(frozen) + 0.02);
    expect(errors).toEqual([]);
  });

  test('touches J et N : figent le plein jour (midi) ou la nuit (minuit), H reprend sans saut', async ({
    page,
  }) => {
    const errors = await openScene(page, '');
    const hour = async () => Number(await host(page).getAttribute('data-aqfish-hour'));
    await expect(host(page)).toHaveAttribute('data-aqfish-hour-frozen', 'false');
    await page.keyboard.press('n');
    await expect(host(page)).toHaveAttribute('data-aqfish-hour-frozen', 'true');
    await expect(host(page)).toHaveAttribute('data-aqfish-hour', '0.00');
    const tick = Number(await host(page).getAttribute('data-aqfish-tick'));
    await expect
      .poll(async () => Number(await host(page).getAttribute('data-aqfish-tick')))
      .toBeGreaterThan(tick + 30);
    expect(await host(page).getAttribute('data-aqfish-hour')).toBe('0.00');
    // Déjà figée la nuit : J passe directement au plein jour.
    await page.keyboard.press('J');
    await expect(host(page)).toHaveAttribute('data-aqfish-hour', '12.00');
    await expect(host(page)).toHaveAttribute('data-aqfish-hour-frozen', 'true');
    await page.keyboard.press('N');
    await expect(host(page)).toHaveAttribute('data-aqfish-hour', '0.00');
    // Reprise : l'heure repart de minuit (pas de saut vers l'heure qu'il aurait été).
    await page.keyboard.press('h');
    await expect(host(page)).toHaveAttribute('data-aqfish-hour-frozen', 'false');
    const resumed = await hour();
    expect(resumed).toBeLessThan(0.02);
    await expect.poll(hour).toBeGreaterThan(0.02);
    expect(await hour()).toBeLessThan(1);
    expect(errors).toEqual([]);
  });

  test('mode capture : J et N sans effet', async ({ page }) => {
    const errors = await openScene(page, `${BASE}&heure=6`);
    for (const key of ['j', 'n']) {
      await page.keyboard.press(key);
    }
    await expect(host(page)).toHaveAttribute('data-aqfish-hour', '6.00');
    expect(errors).toEqual([]);
  });

  test('touche P : le rendu sans filtre fonctionne la nuit', async ({ page }) => {
    const errors = await openScene(page, '?heure=0');
    await page.keyboard.press('p');
    await expect(host(page)).toHaveAttribute('data-aqfish-filter', 'aucun');
    await page.keyboard.press('p');
    await expect(host(page)).toHaveAttribute('data-aqfish-filter', 'pixel');
    expect(await host(page).getAttribute('data-aqfish-hour')).toBe('0.00');
    expect(errors).toEqual([]);
  });
  test('robustesse : valeurs d’URL extrêmes ignorées, petit écran de nuit sans erreur', async ({
    page,
  }) => {
    const byDefault = await screenshot(page, BASE);
    for (const raw of ['-1', 'abc', '24', '1e1', '']) {
      const png = await screenshot(page, `${BASE}&heure=${encodeURIComponent(raw)}`);
      expect(png.equals(byDefault), `heure=${raw} doit retomber sur midi`).toBe(true);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await openScene(page, '?heure=23.99');
    await expect(host(page)).toHaveAttribute('data-aqfish-hour', '23.99');
    expect(errors).toEqual([]);
  });
});
