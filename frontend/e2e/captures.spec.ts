import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { expect, test } from '@playwright/test';

import { SIM_DT } from '../src/app/sim/constants';
import { SPECIES } from '../src/app/sim/species';
import { swimBounds } from '../src/app/sim/swimmer';
import { waterVolume } from '../src/app/sim/tank';
import { glassStats, recordTrajectories } from '../src/app/sim/trajectory';
import { advance, createDefaultWorld, feed, type World } from '../src/app/sim/world';

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
 * (même graine que les captures), puis dessiné en SVG. Et `trajectoires-nourriture-top.png`
 * (issue #68) : même tracé, granulés déposés à t = 0 en `TRACE_FEEDINGS` (croix), pour voir
 * les poissons converger vers la nourriture.
 *
 * Les angles et paramètres doivent rester alignés avec
 * src/app/core/capture/capture-params.ts et docs/ARCHITECTURE.md.
 */
const CAMERA_PRESETS = ['top', 'bottom', 'front', 'side', 'three-quarter'] as const;
const SEED = Number(process.env['CAPTURE_SEED'] ?? 42);
const TIME_SECONDS = Number(process.env['CAPTURE_TIME'] ?? 30);
/**
 * Granulés posés (#117) : bac sans poissons (rien n'est mangé), quatre dépôts à t = 0, au
 * centre, sur un rocher, au pied d'une plante et sur le sable ; posés au temps de capture.
 */
const RESTING_FOOD =
  'population=neon:0,guppy:0,corydora:0&nourrir=0,0:0.3:0.03,0:-0.15:0.1,0:-0.4:0.15';
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

  // Cycle jour/nuit (issue #51) : captures supplémentaires à heure figée (`heure=`). Les
  // captures ci-dessus, sans `heure=`, sont à midi et restent inchangées.
  const DAY_CAPTURES = [
    { name: 'three-quarter-crepuscule', query: 'heure=18' },
    // Fin du crépuscule (#73) : teintes chaudes avant la nuit.
    { name: 'three-quarter-crepuscule-19h', query: 'heure=19' },
    { name: 'three-quarter-minuit', query: 'heure=0' },
    { name: 'three-quarter-sans-filtre-minuit', query: 'heure=0&filtre=aucun' },
    // Nourrissage (#67) : à 0 s au centre (posés sur le sable) et sur un rocher (posés
    // dessus), à 24 s (en train de couler).
    { name: 'three-quarter-nourriture', query: 'nourrir=0,0:0.3:0.03,24:-0.15:0.1' },
    { name: 'three-quarter-nourriture-minuit', query: 'nourrir=0,0:0.3:0.03,24:-0.15:0.1&heure=0' },
    // Granulés en voxels (#117), mêmes dépôts ; puis granulés posés (bac sans poissons, rien
    // n'est mangé) sur le sable, au pied d'une plante et sur un rocher, de jour et de nuit.
    {
      name: 'three-quarter-nourriture-voxels',
      query: 'nourrir=0,0:0.3:0.03,24:-0.15:0.1&granules=voxels',
    },
    { name: 'three-quarter-nourriture-posee', query: RESTING_FOOD },
    { name: 'three-quarter-nourriture-posee-minuit', query: `${RESTING_FOOD}&heure=0` },
    { name: 'three-quarter-nourriture-posee-voxels', query: `${RESTING_FOOD}&granules=voxels` },
    {
      name: 'three-quarter-nourriture-posee-voxels-minuit',
      query: `${RESTING_FOOD}&granules=voxels&heure=0`,
    },
    { name: 'front-nourriture', query: 'nourrir=0,0:0.3:0.03,24:-0.15:0.1&camera=front' },
    {
      name: 'front-nourriture-voxels',
      query: 'nourrir=0,0:0.3:0.03,24:-0.15:0.1&camera=front&granules=voxels',
    },
    // Population réglée (#69) : 12 néons, 2 guppys, aucun corydora.
    { name: 'three-quarter-population', query: 'population=neon:12,guppy:2,corydora:0' },
  ] as const;
  for (const { name, query } of DAY_CAPTURES) {
    test(`angle ${name}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      // `camera=` de la requête, s'il y en a un, remplace la vue trois-quarts (le dernier
      // paramètre répété ne compte pas : `URLSearchParams.get` lit le premier).
      const camera = query.includes('camera=') ? '' : 'camera=three-quarter&';
      await page.goto(`/?capture=1&seed=${SEED}&${camera}time=${TIME_SECONDS}&${query}`);
      await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
      await page.screenshot({ path: join(OUTPUT_DIR, `${name}.png`), animations: 'disabled' });
      expect(errors).toEqual([]);
    });
  }

  // Bassin (#87) : second environnement, de dessus (sa vue par défaut, sans `camera=`),
  // en trois-quarts et à minuit. Les captures du bac tropical ci-dessus restent inchangées.
  // Fleurs des nénuphars (#104) : ouvertes à midi, fermées à minuit, vues de dessus.
  const POND_CAPTURES = [
    { name: 'bassin-top', query: 'environnement=bassin' },
    { name: 'bassin-top-minuit', query: 'environnement=bassin&heure=0' },
    { name: 'bassin-top-sans-filtre', query: 'environnement=bassin&filtre=aucun' },
    { name: 'bassin-three-quarter', query: 'environnement=bassin&camera=three-quarter' },
    {
      name: 'bassin-three-quarter-minuit',
      query: 'environnement=bassin&camera=three-quarter&heure=0',
    },
    // Bassin enterré (#105) : vues basses en coupe, sol et margelle retirés côté caméra.
    { name: 'bassin-side', query: 'environnement=bassin&camera=side' },
    { name: 'bassin-front', query: 'environnement=bassin&camera=front' },
    { name: 'bassin-bottom', query: 'environnement=bassin&camera=bottom' },
    // Pluie (#106) : gouttes et ronds à la surface, de dessus et en trois-quarts.
    { name: 'bassin-top-pluie', query: 'environnement=bassin&pluie=1' },
    {
      name: 'bassin-three-quarter-pluie',
      query: 'environnement=bassin&camera=three-quarter&pluie=1',
    },
  ] as const;
  for (const { name, query } of POND_CAPTURES) {
    test(`angle ${name}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`/?capture=1&seed=${SEED}&time=${TIME_SECONDS}&${query}`);
      await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
      await page.screenshot({ path: join(OUTPUT_DIR, `${name}.png`), animations: 'disabled' });
      expect(errors).toEqual([]);
    });
  }

  // Téléphone en portrait (390 × 844, #117) : vue trois-quarts cadrée sur un écran étroit,
  // donc dézoomée, sans nourriture puis avec granulés posés en points et en voxels.
  const PHONE_CAPTURES = [
    { name: 'telephone-three-quarter', query: '' },
    { name: 'telephone-three-quarter-nourriture', query: `&${RESTING_FOOD}` },
    {
      name: 'telephone-three-quarter-nourriture-voxels',
      query: `&${RESTING_FOOD}&granules=voxels`,
    },
  ] as const;
  for (const { name, query } of PHONE_CAPTURES) {
    test(`angle ${name}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/?capture=1&seed=${SEED}&camera=three-quarter&time=${TIME_SECONDS}${query}`);
      await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
      await page.screenshot({ path: join(OUTPUT_DIR, `${name}.png`), animations: 'disabled' });
      expect(errors).toEqual([]);
    });
  }

  // Panneau de contrôle ouvert (#52) : hors mode capture (le contrat de capture n'affiche
  // aucune interface), heure figée à midi, simulation mise à l'arrêt depuis le panneau.
  // Capture d'interface : les poissons dépendent de l'instant de l'arrêt (non reproductible
  // à l'octet, contrairement aux captures ci-dessus, inchangées).
  test('angle front avec le panneau de contrôle ouvert', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`/?seed=${SEED}&camera=front&heure=12`);
    await expect(page.locator('body')).toHaveAttribute('data-aqfish-ready', 'true');
    await page.getByRole('button', { name: 'Réglages' }).click();
    await page.getByRole('slider', { name: 'Vitesse de la simulation' }).fill('0');
    await expect(page.locator('app-aquarium-host')).toHaveAttribute('data-aqfish-speed', '0');
    await page.screenshot({ path: join(OUTPUT_DIR, 'front-panneau.png'), animations: 'disabled' });
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

  test('tracé des trajectoires avec nourriture, vue de dessus', async ({ page }) => {
    const svg = trajectorySvg(SEED, TRACE_FOOD_SECONDS, TRACE_FEEDINGS);
    await page.setViewportSize({ width: svg.width, height: svg.height });
    await page.setContent(
      `<!doctype html><html><body style="margin:0;background:#1c1c22">${svg.markup}</body></html>`,
    );
    await page.screenshot({ path: join(OUTPUT_DIR, 'trajectoires-nourriture-top.png') });
  });
});

/** Dépôts du tracé avec nourriture (issue #68) : à t = 0, en eau libre (x, z en mètres). */
const TRACE_FEEDINGS: readonly { x: number; z: number }[] = [
  { x: -0.25, z: 0.1 },
  { x: 0.1, z: 0 },
  { x: 0.4, z: 0.15 },
];
const TRACE_FOOD_SECONDS = 30;

const TRACE_SECONDS = Number(process.env['CAPTURE_TRACE_TIME'] ?? 60);
/** Pixels par mètre du tracé. */
const TRACE_SCALE = 1000;
const TRACE_PADDING = 40;
/** Hauteur d'une ligne de légende, en pixels. */
const TRACE_LINE_HEIGHT = 22;
const TRACE_COLORS: Record<string, string> = {
  neon: '#3fa9f5',
  guppy: '#e8a33d',
  corydora: '#f2ead8',
};

/**
 * Tracé SVG vu de dessus (X vers la droite, Z vers le bas, comme la vue `top`) : vitres
 * (trait plein), limite de nage `wallMargin` (tirets), obstacles (disques), une polyligne
 * par poisson, et une légende sur plusieurs lignes avec la médiane des distances minimales
 * aux vitres (nombres au format français).
 */
function trajectorySvg(
  seed: number,
  seconds: number,
  feedings: readonly { x: number; z: number }[] = [],
): { markup: string; width: number; height: number } {
  const water = waterVolume();
  const steps = Math.round(seconds / SIM_DT);
  let start: World = createDefaultWorld(seed);
  for (const { x, z } of feedings) {
    start = feed(start, x, z);
  }
  const traces = recordTrajectories(start, steps, 3);
  // Statistiques de #43 sur les néons et les guppys, comparables d'un cycle à l'autre.
  const stats = glassStats(
    traces.filter((t) => t.species !== 'corydora'),
    water,
    0.1,
  );
  // Légende : une ligne de texte par entrée, pour ne jamais déborder du tracé (#85).
  const textLines = [
    `graine ${seed}, ${seconds} s simulées — néons (bleu), guppys (orange), corydoras (blanc)` +
      ` — rochers (gris) et plantes (vert) vus de dessus, survolables`,
    `néons et guppys : médiane des distances minimales aux vitres : ${frNumber(stats.medianMinimum * 100)} cm,` +
      ` positions à moins de 10 cm : ${frNumber(stats.nearFraction * 100)} %`,
  ];
  if (feedings.length > 0) {
    textLines.push(
      `${start.food.length - advance(start, steps).food.length} granulés mangés sur ` +
        `${start.food.length} en ${seconds} s (croix rouges : dépôts à t = 0)`,
    );
  }
  const width = Math.round((water.maxX - water.minX) * TRACE_SCALE) + 2 * TRACE_PADDING;
  const tankBottom = Math.round((water.maxZ - water.minZ) * TRACE_SCALE) + 2 * TRACE_PADDING;
  const height = tankBottom + TRACE_LINE_HEIGHT * textLines.length + 8;
  const px = (x: number) => (TRACE_PADDING + (x - water.minX) * TRACE_SCALE).toFixed(1);
  const pz = (z: number) => (TRACE_PADDING + (z - water.minZ) * TRACE_SCALE).toFixed(1);
  const hard = swimBounds(SPECIES.neon, water).hard;
  const rect = (b: { minX: number; maxX: number; minZ: number; maxZ: number }, style: string) =>
    `<rect x="${px(b.minX)}" y="${pz(b.minZ)}" width="${((b.maxX - b.minX) * TRACE_SCALE).toFixed(1)}" height="${((b.maxZ - b.minZ) * TRACE_SCALE).toFixed(1)}" fill="none" ${style}/>`;
  // Obstacles vus de dessus (#55) : un disque par sphère de collision, rochers en gris,
  // plantes en vert. Les formes du décor suivent les obstacles explicites, dans l'ordre.
  const decorStart = start.obstacles.length - start.decor.length;
  const obstacles = start.obstacles
    .map((o, i) => {
      const plant = i >= decorStart && start.decor[i - decorStart]?.kind === 'plant';
      const style = plant
        ? 'fill="#4caf50" fill-opacity="0.18" stroke="#4caf50" stroke-width="1"'
        : 'fill="#8d8a99" fill-opacity="0.35" stroke="#b7b4c4" stroke-width="1"';
      const spheres = o.shape === 'sphere' ? [o] : o.spheres;
      return spheres
        .map(
          (sp) =>
            `<circle cx="${px(sp.x)}" cy="${pz(sp.z)}" r="${(sp.radius * TRACE_SCALE).toFixed(1)}" ${style}/>`,
        )
        .join('');
    })
    .join('');
  const lines = traces
    .map(
      (t) =>
        `<polyline fill="none" stroke="${TRACE_COLORS[t.species] ?? '#f2ead8'}" stroke-width="1.5" stroke-opacity="0.8" points="${t.points.map((p) => `${px(p.x)},${pz(p.z)}`).join(' ')}"/>`,
    )
    .join('');
  // Granulés : croix rouges aux points de dépôt.
  const crosses = feedings
    .map(
      ({ x, z }) =>
        `<path d="M${(+px(x) - 9).toFixed(1)},${(+pz(z) - 9).toFixed(1)} l18,18 m0,-18 l-18,18" stroke="#e63946" stroke-width="3"/>`,
    )
    .join('');
  const texts = textLines
    .map(
      (line, i) =>
        `<text x="${TRACE_PADDING}" y="${tankBottom + TRACE_LINE_HEIGHT * (i + 1) - 6}" fill="#f2ead8" font-size="15">${line}</text>`,
    )
    .join('');
  const markup =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" font-family="sans-serif">` +
    rect(water, 'stroke="#a8e6cf" stroke-width="2"') +
    rect(hard, 'stroke="#6a6779" stroke-width="1" stroke-dasharray="6 4"') +
    obstacles +
    lines +
    crosses +
    texts +
    `</svg>`;
  return { markup, width, height };
}

/** Nombre à une décimale, virgule décimale (format français) : 8.8 → « 8,8 ». */
function frNumber(value: number): string {
  return value.toFixed(1).replace('.', ',');
}
