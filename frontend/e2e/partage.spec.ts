import { writeFileSync } from 'node:fs';

import { expect, test, type Browser, type Page } from '@playwright/test';

import { DEFAULT_SAVE_SETTINGS } from '../src/app/sim/save';
import { createShare } from '../src/app/sim/share-link';
import { createDefaultWorld } from '../src/app/sim/world';

/**
 * Partage d'un bac par lien (#426, ADR 0105) : « Partager ce bac » produit un lien ; ouvert
 * dans une page neuve, il propose l'import sans rien remplacer ; accepté, la page retrouve la
 * même population, enregistrée. Un lien invalide affiche un refus lisible. En capture, le bac
 * d'un lien donne la même image que le monde d'origine (même graine, même temps).
 */

const hostEl = (page: Page) => page.locator('app-aquarium-host');
const offer = (page: Page) => page.locator('[data-share-offer]');

interface Opened {
  readonly errors: string[];
}

async function open(page: Page, url: string): Promise<Opened> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  await page.goto(url);
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  return { errors };
}

async function freshPage(browser: Browser): Promise<Page> {
  // Stockage neuf, sauf le guide du débutant déjà vu (comme `playwright.config.ts`).
  const origin = new URL(String(test.info().project.use.baseURL)).origin;
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    storageState: {
      cookies: [],
      origins: [{ origin, localStorage: [{ name: 'aqfish.guide-debutant.v1', value: 'vu' }] }],
    },
  });
  return context.newPage();
}

test.describe('Partage par lien (#426)', () => {
  test('partager, ouvrir le lien dans une page neuve, confirmer, retrouver la population', async ({
    page,
    browser,
  }) => {
    test.setTimeout(240_000);
    const source = await open(page, '/');
    await page.getByRole('button', { name: 'Réglages' }).click();
    await page.getByRole('button', { name: 'Retirer un guppy' }).click();
    await page.getByRole('button', { name: 'Ajouter un néon' }).click();
    const population = await hostEl(page).getAttribute('data-aqfish-population');
    expect(population).toContain('neon:13,guppy:5');

    await page.getByRole('button', { name: 'Partager ce bac' }).click();
    const field = page.locator('[data-share-link]');
    await expect(field).toBeVisible();
    const link = await field.inputValue();
    expect(link).toMatch(/#partage=1\.[zj]\.[A-Za-z0-9_-]+$/);
    await expect(page.locator('[data-save-message]')).toContainText('Lien de partage');

    await page.close();

    // Page neuve (stockage vide) : un bac par défaut, puis la proposition, sans remplacement.
    const other = await freshPage(browser);
    const target = await open(other, link);
    await expect(offer(other)).toBeVisible();
    await expect(offer(other)).toContainText('Bac tropical');
    const before = await hostEl(other).getAttribute('data-aqfish-population');
    expect(before).not.toBe(population);

    await other.getByRole('button', { name: 'Importer cet aquarium' }).click();
    await expect(offer(other)).toHaveCount(0);
    await expect(hostEl(other)).toHaveAttribute('data-aqfish-population', population!);
    expect(new URL(other.url()).hash).toBe('');

    // Rechargement : la population importée est enregistrée, plus de proposition.
    await other.reload();
    await expect(other.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    await expect(hostEl(other)).toHaveAttribute('data-aqfish-population', population!);
    await expect(offer(other)).toHaveCount(0);

    expect(source.errors).toEqual([]);
    expect(target.errors).toEqual([]);
    await other.context().close();
  });

  test('« Ignorer » laisse le bac en place ; un lien invalide affiche un refus lisible', async ({
    page,
  }) => {
    const opened = await open(page, '/');
    const before = await hostEl(page).getAttribute('data-aqfish-population');
    const world = createDefaultWorld(5, 'bassin');
    const outcome = await createShare('http://x/', world, DEFAULT_SAVE_SETTINGS);
    expect(outcome.kind).toBe('lien');
    const fragment = (outcome as { url: string }).url.split('#')[1]!;

    // Lien collé dans le même onglet (`hashchange`).
    await page.evaluate((hash) => (window.location.hash = hash), fragment);
    await expect(offer(page)).toContainText('Bassin');
    await page.getByRole('button', { name: 'Ignorer' }).click();
    await expect(offer(page)).toHaveCount(0);
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-environment', 'tropical');
    expect(await hostEl(page).getAttribute('data-aqfish-population')).toBe(before);

    await page.evaluate(() => (window.location.hash = 'partage=1.z.AAAAAAAA'));
    const error = page.locator('[data-share-error]');
    await expect(error).toContainText('Lien de partage refusé : lien corrompu');
    await page.getByRole('button', { name: 'Fermer' }).click();
    await expect(error).toHaveCount(0);

    await page.evaluate(() => (window.location.hash = 'partage=9.z.AAAA'));
    await expect(error).toContainText('version de lien inconnue');
    expect(opened.errors).toEqual([]);
  });

  test('capture trois-quarts du bac importé identique à celle de l’original', async ({ page }) => {
    // Le lien est produit par la page elle-même (même moteur JavaScript) : un monde avancé de
    // 1 800 pas sous Node diffère de celui de Chromium (docs/PIEGES.md, cycle 143).
    const url = '/?capture=1&seed=42&camera=three-quarter&time=30';
    const original = await open(page, url);
    const expected = await page.screenshot({ animations: 'disabled' });
    const link = await page.evaluate(async (): Promise<string | null> => {
      const debug = (window as unknown as { ng?: { getComponent(el: Element): unknown } }).ng;
      const el = document.querySelector('app-aquarium-host');
      const host = (debug && el ? debug.getComponent(el) : null) as {
        capture: boolean;
        shareTank(): Promise<void>;
        shareLink(): string | null;
      } | null;
      if (!host) {
        return null;
      }
      // « Partager » est sans effet en capture : levé le temps de produire le lien.
      host.capture = false;
      await host.shareTank();
      host.capture = true;
      return host.shareLink();
    });
    expect(link).toMatch(/#partage=1\.z\./);
    const fragment = link!.split('#')[1]!;

    const shared = await open(page, `/?capture=1&camera=three-quarter#${fragment}`);
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-seed', '42');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-tick', '1800');
    const actual = await page.screenshot({ animations: 'disabled' });
    writeFileSync(test.info().outputPath('original.png'), expected);
    writeFileSync(test.info().outputPath('importe.png'), actual);
    expect(actual.equals(expected)).toBe(true);
    expect([...original.errors, ...shared.errors]).toEqual([]);
  });
});
