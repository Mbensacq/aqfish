import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { expect, test } from '@playwright/test';

import { SIM_DT } from '../src/app/sim/constants';
import { SPECIES } from '../src/app/sim/species';
import { swimBounds } from '../src/app/sim/swimmer';
import { waterVolume } from '../src/app/sim/tank';
import { glassStats, recordTrajectories } from '../src/app/sim/trajectory';
import { createDefaultWorld } from '../src/app/sim/world';

/**
 * Harnais de captures (projet Playwright « captures »).
 *
 * Photographie l'application sous les 5 angles du contrat de capture (plus une vue
 * trois-quarts sans filtre pixel art, `filtre=aucun`), avec une
 * graine et un temps de simulation fixes, pour suivre l'évolution visuelle nuit
 * après nuit. Lancer : `npm run captures` (sortie : CAPTURE_DIR, par défaut
 * ../docs/captures/latest).
 *
 * En plus, `trajectoires-top.png` : tracé des trajectoires vues de dessus sur
 * `TRACE_SECONDS` secondes simulées (issue #43), pour prouver un comportement de nage
 * qu'une image figée ne montre pas. Calculé hors de l'application, avec la simulation pure
 * (même graine que les captures), puis dessiné en SVG.
 *
 * Les angles et paramètres doivent rester alignés avec
 * src/app/core/capture/capture-params.ts et docs/ARCHITECTURE.md.
 */
const CAMERA_PRESETS = ['top', 'bottom', 'front', 'side', 'three-quarter'] as const;
const SEED = Number(process.env['CAPTURE_SEED'] ?? 42);
const TIME_SECONDS = Number(process.env['CAPTURE_TIME'] ?? 30);
const OUTPUT_DIR = resolve(
  process.env['CAPTURE_DIR'] ?? join(__dirname, '..', '..', 'docs', 'captures', 'latest'),
);

test.describe('Captures', () => {
  test.beforeAll(() => {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  for (const camera of CAMERA_PRESETS) {
    test(`angle ${camera}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));

      await page.goto(`/?capture=1&seed=${SEED}&camera=${camera}&time=${TIME_SECONDS}`);
      await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');

      await page.screenshot({ path: join(OUTPUT_DIR, `${camera}.png`), animations: 'disabled' });
      expect(errors).toEqual([]);
    });
  }

  // Filtre désactivé (issue #33) : capture supplémentaire, les 5 angles ci-dessus restent en
  // pixel art et inchangés.
  test('angle three-quarter sans filtre', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto(
      `/?capture=1&seed=${SEED}&camera=three-quarter&time=${TIME_SECONDS}&filtre=aucun`,
    );
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');

    await page.screenshot({
      path: join(OUTPUT_DIR, 'three-quarter-sans-filtre.png'),
      animations: 'disabled',
    });
    expect(errors).toEqual([]);
  });

  test('tracé des trajectoires, vue de dessus', async ({ page }) => {
    const svg = trajectorySvg(SEED, TRACE_SECONDS);
    await page.setViewportSize({ width: svg.width, height: svg.height });
    await page.setContent(
      `<!doctype html><html><body style="margin:0;background:#1c1c22">${svg.markup}</body></html>`,
    );
    await page.screenshot({ path: join(OUTPUT_DIR, 'trajectoires-top.png') });
  });
});

const TRACE_SECONDS = Number(process.env['CAPTURE_TRACE_TIME'] ?? 60);
/** Pixels par mètre du tracé. */
const TRACE_SCALE = 1000;
const TRACE_PADDING = 40;
const TRACE_COLORS: Record<string, string> = {
  neon: '#3fa9f5',
  guppy: '#e8a33d',
  corydora: '#f2ead8',
};

/**
 * Tracé SVG vu de dessus (X vers la droite, Z vers le bas, comme la vue `top`) : vitres
 * (trait plein), limite de nage `wallMargin` (tirets), une polyligne par poisson, et une
 * légende avec la médiane des distances minimales aux vitres.
 */
function trajectorySvg(
  seed: number,
  seconds: number,
): { markup: string; width: number; height: number } {
  const water = waterVolume();
  const steps = Math.round(seconds / SIM_DT);
  const traces = recordTrajectories(createDefaultWorld(seed), steps, 3);
  // Statistiques de #43 sur les néons et les guppys, comparables d'un cycle à l'autre.
  const stats = glassStats(
    traces.filter((t) => t.species !== 'corydora'),
    water,
    0.1,
  );
  const width = Math.round((water.maxX - water.minX) * TRACE_SCALE) + 2 * TRACE_PADDING;
  const height = Math.round((water.maxZ - water.minZ) * TRACE_SCALE) + 2 * TRACE_PADDING + 30;
  const px = (x: number) => (TRACE_PADDING + (x - water.minX) * TRACE_SCALE).toFixed(1);
  const pz = (z: number) => (TRACE_PADDING + (z - water.minZ) * TRACE_SCALE).toFixed(1);
  const hard = swimBounds(SPECIES.neon, water).hard;
  const rect = (b: { minX: number; maxX: number; minZ: number; maxZ: number }, style: string) =>
    `<rect x="${px(b.minX)}" y="${pz(b.minZ)}" width="${((b.maxX - b.minX) * TRACE_SCALE).toFixed(1)}" height="${((b.maxZ - b.minZ) * TRACE_SCALE).toFixed(1)}" fill="none" ${style}/>`;
  const lines = traces
    .map(
      (t) =>
        `<polyline fill="none" stroke="${TRACE_COLORS[t.species] ?? '#f2ead8'}" stroke-width="1.5" stroke-opacity="0.8" points="${t.points.map((p) => `${px(p.x)},${pz(p.z)}`).join(' ')}"/>`,
    )
    .join('');
  const legend =
    `graine ${seed}, ${seconds} s simulées — néons (bleu), guppys (orange), corydoras (blanc) — ` +
    `néons et guppys : médiane des distances minimales aux vitres : ${(stats.medianMinimum * 100).toFixed(1)} cm, ` +
    `positions à moins de 10 cm : ${(stats.nearFraction * 100).toFixed(1)} %`;
  const markup =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" font-family="sans-serif">` +
    rect(water, 'stroke="#a8e6cf" stroke-width="2"') +
    rect(hard, 'stroke="#6a6779" stroke-width="1" stroke-dasharray="6 4"') +
    lines +
    `<text x="${TRACE_PADDING}" y="${height - 14}" fill="#f2ead8" font-size="15">${legend}</text>` +
    `</svg>`;
  return { markup, width, height };
}
