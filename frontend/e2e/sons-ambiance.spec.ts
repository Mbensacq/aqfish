import { expect, test, type Page } from '@playwright/test';

/**
 * Sons d'ambiance (#411, ADR 0100) : section « Son » des réglages, désactivée par défaut,
 * choix mémorisé (`aqfish.sons`). Chromium sans périphérique audio : seul l'état est vérifié,
 * jamais le signal. Les créations et fermetures d'`AudioContext` sont comptées par une
 * enveloppe posée avant l'application (`window.__aqfishAudio`).
 */

interface AudioCount {
  created: number;
  closed: number;
}

const settings = (page: Page) => page.getByRole('button', { name: 'Réglages' });
const soundBox = (page: Page) => page.getByRole('checkbox', { name: "Sons d'ambiance" });
const volume = (page: Page) => page.getByRole('slider', { name: "Volume des sons d'ambiance" });
const motionBox = (page: Page) => page.getByRole('checkbox', { name: 'Réduire les mouvements' });

const audioCount = (page: Page): Promise<AudioCount> =>
  page.evaluate(() => (window as unknown as { __aqfishAudio: AudioCount }).__aqfishAudio);

async function openScene(page: Page, search = '', stored: string | null = null): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript((value) => {
    if (value !== null) {
      localStorage.setItem('aqfish.sons', value);
    }
    const count = { created: 0, closed: 0 };
    (window as unknown as { __aqfishAudio: AudioCount }).__aqfishAudio = count;
    const Native = window.AudioContext;
    if (typeof Native !== 'function') {
      return;
    }
    class Counted extends Native {
      constructor(options?: AudioContextOptions) {
        super(options);
        count.created++;
      }
      override close(): Promise<void> {
        count.closed++;
        return super.close();
      }
    }
    window.AudioContext = Counted;
  }, stored);
  await page.goto(`/${search}`);
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  return errors;
}

test.describe('sons d’ambiance', () => {
  // Parcours court en 800 × 600 : une image par appui de touche (docs/PIEGES.md).
  test.use({ viewport: { width: 800, height: 600 } });

  test('clavier : Tab jusqu’à la case, Espace l’active, curseur réglable aux flèches', async ({
    page,
  }) => {
    const errors = await openScene(page, '?vitesse=0');
    expect(await audioCount(page)).toEqual({ created: 0, closed: 0 });
    await settings(page).click();
    await expect(soundBox(page)).not.toBeChecked();
    await expect(volume(page)).toHaveValue('30');
    // Aucun contexte audio tant que la case n'est pas cochée, même après des gestes.
    expect(await audioCount(page)).toEqual({ created: 0, closed: 0 });
    // Départ du parcours sur la case précédente (« Accessibilité »), puis Tab.
    await motionBox(page).focus();
    await page.keyboard.press('Tab');
    await expect(soundBox(page)).toBeFocused();
    const outline = await soundBox(page).evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline).not.toBe('none');
    await page.keyboard.press('Space');
    await expect(soundBox(page)).toBeChecked();
    await expect.poll(() => audioCount(page)).toEqual({ created: 1, closed: 0 });
    await page.keyboard.press('Tab');
    await expect(volume(page)).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(volume(page)).toHaveValue('40');
    await expect(volume(page)).toHaveAttribute('aria-valuetext', '40 %');
    await expect(soundBox(page)).toBeChecked();
    expect(await page.evaluate(() => localStorage.getItem('aqfish.sons'))).toBe('actif:40');
    // Décochée : le contexte est fermé.
    await soundBox(page).uncheck();
    await expect.poll(() => audioCount(page)).toEqual({ created: 1, closed: 1 });
    expect(await page.evaluate(() => localStorage.getItem('aqfish.sons'))).toBe('muet:40');
    expect(errors).toEqual([]);
  });

  test('choix « actif » mémorisé : case cochée, contexte créé au premier geste seulement', async ({
    page,
  }) => {
    const errors = await openScene(page, '?vitesse=0', 'actif:60');
    expect(await audioCount(page)).toEqual({ created: 0, closed: 0 });
    await settings(page).click();
    await expect(soundBox(page)).toBeChecked();
    await expect(volume(page)).toHaveValue('60');
    await expect.poll(() => audioCount(page)).toEqual({ created: 1, closed: 0 });
    expect(errors).toEqual([]);
  });

  test('démarrage refusé (#413) : message dédié, case décochée à l’écran, case et curseur désactivés', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      class Refused {
        constructor() {
          throw new DOMException('refusé', 'NotAllowedError');
        }
      }
      window.AudioContext = Refused as unknown as typeof AudioContext;
    });
    await page.goto('/?vitesse=0');
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    await settings(page).click();
    await expect(soundBox(page)).toBeEnabled();
    await soundBox(page).click();
    const message = page.locator('#panneau-son-indisponible');
    await expect(message).toContainText("le navigateur a refusé de démarrer l'audio");
    await expect(message).not.toContainText('ne prend pas en charge');
    await expect(soundBox(page)).not.toBeChecked();
    await expect(soundBox(page)).toBeDisabled();
    expect(errors).toEqual([]);
  });

  test('capture : rien ne démarre, même avec un choix « actif » mémorisé', async ({ page }) => {
    const errors = await openScene(page, '?capture=1&camera=front', 'actif:60');
    await page.mouse.click(400, 300);
    await page.keyboard.press('Shift');
    expect(await audioCount(page)).toEqual({ created: 0, closed: 0 });
    expect(errors).toEqual([]);
  });
});
