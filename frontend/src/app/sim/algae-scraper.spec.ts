import { describe, expect, it } from 'vitest';

import {
  ALGAE_PATCH_COUNT,
  algaeCoverage,
  drawnRadius,
  SCRAPER_REACH,
  scrapedPatchesAlong,
  visibleAlgaeCount,
  type AlgaePatch,
  type AlgaeWater,
  type ScraperRay,
} from './algae';
import {
  advance,
  createDefaultWorld,
  scrapeWorldAlgaeAlongInPlace,
  worldAlgaePatches,
  type MutableWorld,
} from './world';

/** Deux plaques sur la vitre du fond (z = -0,2), l'une à gauche, l'autre à droite. */
const PATCHES: readonly AlgaePatch[] = [
  { wall: 'fond', x: -0.2, y: 0.2, z: -0.2, radius: 0.05, vigor: 1 },
  { wall: 'fond', x: 0.2, y: 0.2, z: -0.2, radius: 0.05, vigor: 1 },
];

/** Rayon horizontal vers le fond, depuis le devant, à l'abscisse `x`. */
const ray = (x: number, y = 0.2): ScraperRay => ({ origin: [x, y, 1], direction: [0, 0, -1] });

/** Trajectoire de `from` à `to` en `n` points. */
const sweep = (from: number, to: number, n: number): ScraperRay[] =>
  Array.from({ length: n }, (_, i) => ray(from + ((to - from) * i) / (n - 1)));

describe('raclette le long d’une trajectoire (#604)', () => {
  it('retire chaque plaque touchée une fois, dans l’ordre du passage', () => {
    expect(scrapedPatchesAlong(PATCHES, [1, 1], sweep(-0.3, 0.3, 61))).toEqual([0, 1]);
    expect(scrapedPatchesAlong(PATCHES, [1, 1], sweep(0.3, -0.3, 61))).toEqual([1, 0]);
  });

  it('plaque non touchée : trajectoire qui passe à côté', () => {
    // Passage à gauche seulement : la plaque de droite reste.
    expect(scrapedPatchesAlong(PATCHES, [1, 1], sweep(-0.3, -0.1, 21))).toEqual([0]);
    // Passage au-dessus des deux plaques.
    const high = Array.from({ length: 21 }, (_, i) => ray(-0.3 + 0.03 * i, 0.4));
    expect(scrapedPatchesAlong(PATCHES, [1, 1], high)).toEqual([]);
  });

  it('portée : touchée jusqu’à rayon dessiné + SCRAPER_REACH, pas au-delà', () => {
    const edge = PATCHES[0].x + drawnRadius(PATCHES[0], 1) + SCRAPER_REACH;
    expect(scrapedPatchesAlong(PATCHES, [1, 1], [ray(edge - 1e-6)])).toEqual([0]);
    expect(scrapedPatchesAlong(PATCHES, [1, 1], [ray(edge + 1e-3)])).toEqual([]);
    // Plaque à moitié poussée : rayon dessiné plus petit, portée plus courte.
    const small = PATCHES[0].x + drawnRadius(PATCHES[0], 0.25) + SCRAPER_REACH;
    expect(scrapedPatchesAlong(PATCHES, [0.25, 1], [ray(small + 1e-3)])).toEqual([]);
    expect(scrapedPatchesAlong(PATCHES, [0.25, 1], [ray(small - 1e-6)])).toEqual([0]);
  });

  it('bac sans algues, plaques invisibles, trajectoire vide : rien', () => {
    expect(scrapedPatchesAlong(PATCHES, undefined, sweep(-0.3, 0.3, 61))).toEqual([]);
    expect(scrapedPatchesAlong(PATCHES, [0.01, 0.01], sweep(-0.3, 0.3, 61))).toEqual([]);
    expect(scrapedPatchesAlong(PATCHES, [1, 1], [])).toEqual([]);
    expect(scrapedPatchesAlong([], [1, 1], sweep(-0.3, 0.3, 61))).toEqual([]);
  });

  it('ne modifie pas la couverture reçue', () => {
    const algae = [1, 1];
    scrapedPatchesAlong(PATCHES, algae, sweep(-0.3, 0.3, 61));
    expect(algae).toEqual([1, 1]);
  });

  it('plaques visibles comptées', () => {
    expect(visibleAlgaeCount(undefined)).toBe(0);
    expect(visibleAlgaeCount([0, 0.01, 0.05, 1])).toBe(2);
  });

  it('sur le monde : un balayage du devant retire les plaques du fond touchées', () => {
    const world = advance(createDefaultWorld(42), 30) as MutableWorld;
    (world as { water: AlgaeWater }).water = {
      ...world.water,
      algae: new Array<number>(ALGAE_PATCH_COUNT).fill(1),
    };
    const fishes = JSON.stringify(world.entities);
    const patches = worldAlgaePatches(world);
    const back = patches.findIndex((p) => p.wall === 'fond');
    const p = patches[back];
    const rays = Array.from({ length: 41 }, (_, i) => ({
      origin: [p.x - 0.1 + 0.005 * i, p.y, 3] as const,
      direction: [0, 0, -1] as const,
    }));
    const touched = scrapeWorldAlgaeAlongInPlace(world, rays);
    expect(touched.length).toBeGreaterThan(0);
    for (const index of touched) {
      expect(world.water.algae![index]).toBe(0);
    }
    expect(algaeCoverage(world.water.algae)).toBeLessThan(1);
    expect(JSON.stringify(world.entities)).toBe(fishes);
    // Un second passage au même endroit ne retire plus rien de ce qu'il a retiré.
    const again = scrapeWorldAlgaeAlongInPlace(world, rays);
    expect(again.some((i) => touched.includes(i))).toBe(false);
  });

  it('dernière plaque retirée : champ algae retiré du monde', () => {
    const world = createDefaultWorld(42) as MutableWorld;
    const patches = worldAlgaePatches(world);
    const only = new Array<number>(ALGAE_PATCH_COUNT).fill(0);
    const p = patches[0];
    only[0] = 1;
    (world as { water: AlgaeWater }).water = { ...world.water, algae: only };
    const origin: [number, number, number] =
      p.wall === 'gauche' ? [-3, p.y, p.z] : p.wall === 'droite' ? [3, p.y, p.z] : [p.x, p.y, 3];
    const direction: [number, number, number] =
      p.wall === 'gauche' ? [1, 0, 0] : p.wall === 'droite' ? [-1, 0, 0] : [0, 0, -1];
    expect(scrapeWorldAlgaeAlongInPlace(world, [{ origin, direction }])).toEqual([0]);
    expect(world.water.algae).toBeUndefined();
  });
});
