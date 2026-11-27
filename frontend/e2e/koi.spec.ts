import { expect, test, type Page } from '@playwright/test';

import { PALETTE } from '../src/app/render/palette';
import { SIM_DT } from '../src/app/sim/constants';
import { DEFAULT_DAY_LENGTH_SECONDS } from '../src/app/sim/daylight';
import { START_DAY_OF_YEAR, DAYS_PER_YEAR } from '../src/app/sim/pond-season';
import { createDefaultWorld } from '../src/app/sim/world';
import type { MutableWorld } from '../src/app/sim/world-types';
import { ouvrirReglages } from './outils-panneau';
import { importWorld } from './outils-taille';

/**
 * Koïs, première espèce du bassin (issue #88) : visibles de dessus avec les couleurs de leurs
 * robes, présents seulement dans le bassin, réglables au panneau du bassin seulement.
 */

const host = (page: Page) => page.locator('app-aquarium-host');

/**
 * Bassin par défaut au jour `day` de l'année (#858), eau et température ambiante à
 * `temperature` °C (la simulation est importée en pause : elles restent telles quelles).
 */
function pondOnDay(day: number, temperature: number): MutableWorld {
  const world: MutableWorld = createDefaultWorld(42, 'bassin');
  const days = (day - START_DAY_OF_YEAR + DAYS_PER_YEAR) % DAYS_PER_YEAR;
  world.tick = Math.round((days * DEFAULT_DAY_LENGTH_SECONDS) / SIM_DT);
  world.time = world.tick * SIM_DT;
  world.water = { ...world.water, temperature, ambient: temperature };
  return world;
}

async function open(page: Page, search: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`/${search}`);
  await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
  return errors;
}

/** Nombre de pixels de la capture d'écran égaux à chacune des couleurs demandées. */
async function countColors(page: Page, colors: string[]): Promise<number[]> {
  const png = await page.screenshot({ animations: 'disabled' });
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
        const index = wanted.indexOf((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
        if (index >= 0) {
          counts[index]++;
        }
      }
      return counts;
    },
    { png: png.toString('base64'), colors },
  );
}

const KOI_COLORS = [PALETTE.koiBlanc, PALETTE.koiRouge, PALETTE.koiOrange];

test.describe('Koïs (#88)', () => {
  test('de dessus, le bassin montre des koïs blancs, rouges et orange ; sans koïs, aucun', async ({
    page,
  }) => {
    const errors = await open(page, '?capture=1&seed=42&environnement=bassin&time=20');
    await expect(host(page)).toHaveAttribute('data-aqfish-population', 'koi:3,rouge:0');
    const [white, red, orange] = await countColors(page, KOI_COLORS);
    // Un pixel de scène = 3 × 3 pixels d'écran ; plusieurs koïs de chaque robe.
    expect(white).toBeGreaterThan(9 * 20);
    expect(red).toBeGreaterThan(9 * 10);
    expect(orange).toBeGreaterThan(9 * 10);
    // Témoin : même scène sans koïs, aucune de leurs couleurs.
    const witness = await open(
      page,
      '?capture=1&seed=42&environnement=bassin&time=20&population=koi:0',
    );
    await expect(host(page)).toHaveAttribute('data-aqfish-population', 'koi:0,rouge:0');
    expect(await countColors(page, KOI_COLORS)).toEqual([0, 0, 0]);
    expect([...errors, ...witness]).toEqual([]);
  });

  test('panneau : le bassin propose koïs et poissons rouges (#654), le bac ses trois espèces', async ({
    page,
  }) => {
    const errors = await open(page, '?seed=42&environnement=bassin');
    await ouvrirReglages(page, 'Population');
    const rows = page.locator('[data-section="population"] [data-species]');
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toHaveAttribute('data-species', 'koi');
    await expect(rows.nth(1)).toHaveAttribute('data-species', 'rouge');
    // Bassin par défaut plein à 86 % (3 koïs, ADR 0173) : une quatrième est refusée, on retire.
    await page.getByRole('button', { name: 'Retirer un koï' }).click();
    await expect(host(page)).toHaveAttribute('data-aqfish-population', 'koi:2,rouge:0');
    await ouvrirReglages(page, 'Bac et milieu');
    await page.getByRole('combobox', { name: 'Environnement' }).selectOption('tropical');
    await expect(host(page)).toHaveAttribute('data-aqfish-environment', 'tropical');
    await ouvrirReglages(page, 'Population');
    await expect(rows).toHaveCount(17);
    await expect(host(page)).toHaveAttribute(
      'data-aqfish-population',
      'neon:12,guppy:6,corydora:6,rasbora:0,tetra:0,kuhli:0,gourami:0,platy:0,danio:0,ancistrus:0,otocinclus:0,braise:0,molly:0,miel:0,xipho:0,cerise:0,neritine:0',
    );
    expect(errors).toEqual([]);
  });

  test('population=koi:5 est ignorée dans le bac tropical', async ({ page }) => {
    const errors = await open(page, '?capture=1&seed=42&population=koi:5,neon:3');
    await expect(host(page)).toHaveAttribute(
      'data-aqfish-population',
      'neon:3,guppy:6,corydora:6,rasbora:0,tetra:0,kuhli:0,gourami:0,platy:0,danio:0,ancistrus:0,otocinclus:0,braise:0,molly:0,miel:0,xipho:0,cerise:0,neritine:0',
    );
    expect(errors).toEqual([]);
  });

  test('saisons (#858) : la jauge de température du bassin suit la date de jeu', async ({
    page,
  }) => {
    // Deux imports d'un bassin, l'un en hiver, l'autre en été : ~30 s en rendu logiciel.
    test.setTimeout(120_000);
    const errors = await open(page, '');
    const temperature = page.locator('[data-gauge="temperature"] [data-gauge-value]');
    const season = page.locator('[data-dashboard-season]');
    await expect(season).toHaveCount(0);

    await importWorld(page, pondOnDay(20, 4), 'hiver.json');
    await expect(temperature).toHaveText('4,0');
    await expect(season).toHaveAttribute('data-season', 'hiver');
    await expect(season).toHaveText(/^Hiver /);
    await expect(season).toHaveAttribute('title', /^Saison : hiver, /);
    // Eau à la température de saison : la jauge reste au vert, en texte comme en couleur.
    await expect(page.locator('[data-gauge="temperature"]')).toHaveAttribute('data-level', 'vert');

    await importWorld(page, pondOnDay(200, 23.5), 'ete.json');
    await expect(temperature).toHaveText('23,5');
    await expect(season).toHaveAttribute('data-season', 'ete');
    await expect(season).toHaveText(/^Été /);
    expect(errors).toEqual([]);
  });
});
