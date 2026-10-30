import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type CDPSession, type Page } from '@playwright/test';

/**
 * Vue fond d'écran (#279, ADR 0079) : `?fond=1`, aucune interface, caméra automatique,
 * configuration lue dans `aqfish-fond.json` (servi ici par `page.route`, le fichier
 * n'existant pas sur le serveur de développement), cadence limitée, pause page masquée,
 * mémoire stable. Le paquet ouvert en `file://` est vérifié par `npm run paquet-fond`.
 */

const EXAMPLE = readFileSync(join(__dirname, '..', 'fond-ecran', 'aqfish-fond.json'), 'utf8');
const hostEl = (page: Page) => page.locator('app-aquarium-host');

/** Sert `aqfish-fond.json` : l'exemple du paquet, ou le texte donné. */
async function serveConfig(page: Page, body = EXAMPLE): Promise<void> {
  await page.route('**/aqfish-fond.json', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body }),
  );
}

/** Erreurs de la page et de la console, à vérifier en fin de test. */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  return errors;
}

async function tick(page: Page): Promise<number> {
  return Number(await hostEl(page).getAttribute('data-aqfish-tick'));
}

/** Nombre d'objets vivants d'un type WebGL (`WebGLBuffer`…), après ramassage des miettes. */
async function liveObjects(cdp: CDPSession, type: string): Promise<number> {
  const proto = await cdp.send('Runtime.evaluate', { expression: `${type}.prototype` });
  const { objects } = await cdp.send('Runtime.queryObjects', {
    prototypeObjectId: proto.result.objectId!,
  });
  const { result } = await cdp.send('Runtime.callFunctionOn', {
    objectId: objects.objectId!,
    functionDeclaration: 'function () { return this.length; }',
    returnByValue: true,
  });
  return result.value as number;
}

async function heapAfterGc(cdp: CDPSession): Promise<number> {
  await cdp.send('HeapProfiler.collectGarbage');
  const { usedSize } = await cdp.send('Runtime.getHeapUsage');
  return usedSize;
}

test.describe('Vue fond d’écran (#279)', () => {
  test.setTimeout(240_000);

  test('aucune interface, configuration du fichier, caméra qui bouge, souris sans effet', async ({
    page,
  }, testInfo) => {
    const errors = collectErrors(page);
    await serveConfig(page);
    await page.goto('/?fond=1');
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-fond', 'fichier');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-environment', 'tropical');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-mode', 'decor');

    // Seul le canvas : aucun bouton, champ, lien ni panneau ; la tabulation ne prend rien.
    await expect(page.locator('canvas')).toHaveCount(1);
    await expect(page.locator('button, input, select, textarea, a[href], [tabindex]')).toHaveCount(
      0,
    );
    await expect(
      page.locator(
        'app-control-panel, app-view-presets-bar, app-commands-help, app-beginner-guide, app-dashboard-frame, app-dashboard-status, app-day-indicator, app-species-wiki, app-decor-badge',
      ),
    ).toHaveCount(0);
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('BODY');

    // Caméra automatique : la vue change d'une capture à l'autre, à 10 s d'écart.
    const camera = () => hostEl(page).getAttribute('data-aqfish-camera');
    const first = await page.screenshot();
    const cameraBefore = await camera();
    await page.waitForTimeout(10_000);
    const second = await page.screenshot({ path: testInfo.outputPath('fond-ecran.png') });
    expect(second.equals(first)).toBe(false);
    const cameraAfter = await camera();
    expect(cameraAfter).not.toBe(cameraBefore);

    // Souris : glisser sur le canvas ne prend pas la main, la caméra poursuit sa course.
    await page.mouse.move(400, 300);
    await page.mouse.down();
    await page.mouse.move(700, 400, { steps: 5 });
    await page.mouse.up();
    await expect.poll(camera, { timeout: 10_000 }).not.toBe(cameraAfter);
    expect(errors).toEqual([]);
  });

  test('fichier invalide : scène par défaut ; cadence limitée ; pause page masquée', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await serveConfig(page, 'pas une sauvegarde');
    await page.goto('/?fond=1&fps=15');
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-fond', 'defaut');
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-environment', 'tropical');

    // Cadence : au plus 15 images par seconde (rendus comptés sur 4 s).
    const rendered = await page.evaluate(async () => {
      const canvas = document.querySelector('canvas')!;
      const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
      if (!gl) {
        return -1;
      }
      let draws = 0;
      const original = gl.drawArrays.bind(gl);
      const originalElements = gl.drawElements.bind(gl);
      let frameDraws = false;
      gl.drawArrays = (...args: Parameters<typeof gl.drawArrays>) => {
        frameDraws = true;
        original(...args);
      };
      gl.drawElements = (...args: Parameters<typeof gl.drawElements>) => {
        frameDraws = true;
        originalElements(...args);
      };
      await new Promise<void>((resolve) => {
        const start = performance.now();
        const loop = () => {
          if (frameDraws) {
            draws++;
            frameDraws = false;
          }
          if (performance.now() - start < 4000) {
            requestAnimationFrame(loop);
          } else {
            resolve();
          }
        };
        requestAnimationFrame(loop);
      });
      gl.drawArrays = original;
      gl.drawElements = originalElements;
      return draws;
    });
    expect(rendered).toBeGreaterThan(0);
    expect(rendered).toBeLessThanOrEqual(4 * 15 + 2);

    // Page masquée : la boucle s'arrête (le monde n'avance plus), puis repart.
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-fond-pause', '1');
    const paused = await tick(page);
    await page.waitForTimeout(2000);
    expect(await tick(page)).toBe(paused);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(hostEl(page)).toHaveAttribute('data-aqfish-fond-pause', '0');
    await expect.poll(() => tick(page), { timeout: 10_000 }).toBeGreaterThan(paused);
    expect(errors).toEqual([]);
  });

  test('endurance accélérée : minutes simulées sans erreur, mémoire et objets WebGL stables', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await serveConfig(page);
    // Vitesse ×4 et petite fenêtre : en rendu logiciel, chaque image coûte cher ; la
    // simulation avance d'au plus quelques pas par image (`maxStepsForSpeed`).
    await page.setViewportSize({ width: 320, height: 180 });
    await page.goto('/?fond=1&vitesse=4&fps=60');
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    const cdp = await page.context().newCDPSession(page);
    await page.waitForTimeout(5000);
    const startTick = await tick(page);
    const heapStart = await heapAfterGc(cdp);
    const buffersStart = await liveObjects(cdp, 'WebGLBuffer');
    const texturesStart = await liveObjects(cdp, 'WebGLTexture');

    await page.waitForTimeout(60_000);
    const heapEnd = await heapAfterGc(cdp);
    const buffersEnd = await liveObjects(cdp, 'WebGLBuffer');
    const texturesEnd = await liveObjects(cdp, 'WebGLTexture');
    const simulated = ((await tick(page)) - startTick) / 60;

    test.info().annotations.push({
      type: 'mesures',
      description: `${simulated.toFixed(0)} s simulées ; tas ${heapStart} → ${heapEnd} o ; tampons ${buffersStart} → ${buffersEnd} ; textures ${texturesStart} → ${texturesEnd}`,
    });
    // Au moins deux minutes simulées (rendu logiciel lent : la vitesse réelle varie).
    expect(simulated).toBeGreaterThan(120);
    expect(buffersEnd).toBeLessThanOrEqual(buffersStart);
    expect(texturesEnd).toBeLessThanOrEqual(texturesStart);
    // Tas JS : moins de 5 Mo de plus après ramassage des miettes.
    expect(heapEnd - heapStart).toBeLessThan(5 * 1024 * 1024);
    expect(errors).toEqual([]);
  });
});
