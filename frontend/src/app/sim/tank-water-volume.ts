import { decorBaseY, decorVoxels, type DecorItem } from './decor';
import { environmentById, environmentWater, placeEnvironment, type Place } from './environment';
import type { Obstacle } from './obstacles';
import type { Box3 } from './tank';
import { terrainHeightAt, type TerrainSettings } from './terrain';
import { waterLiters } from './water';
import type { World } from './world-types';

/**
 * Volume d'eau réel d'un bac, décor déduit (issue #807, tranche 1 de #729,
 * `docs/ECOSYSTEME.md` § 3.1, ADR 0171) : c'est lui que lit le calcul de capacité
 * (`sim/tank-capacity.ts`). Fonctions pures et déterministes, appelées à la demande (ajout
 * d'un animal, chargement), jamais dans la boucle d'affichage.
 *
 * Formule : litres de la boîte d'eau (`waterLiters(environmentWater(…))`, les litres affichés
 * par la fenêtre des réglages), moins la part immergée
 *
 * - des voxels des rochers et des bois flottés (`decorVoxels`, entre le sable et la surface) ;
 * - des boîtes de collision des coraux et des anémones, pondérées par `CORAL_FILL_RATIO` ;
 * - du sol qui s'élève au-dessus du sable (berge du paludarium, `sim/terrain.ts`), échantillonné
 *   sur une grille de `TERRAIN_SAMPLE_STEP`.
 *
 * Les plantes ne sont pas déduites (approximation de jeu : tiges et feuilles fines, volume
 * négligeable devant les rochers) ; la forme ovale ou haricot du bassin non plus, comme pour
 * les litres affichés.
 */

/**
 * Pas de la grille d'échantillonnage du sol, en mètres. Approximation de jeu : 1 cm, soit
 * 5 000 points pour le paludarium ; l'écart au pas de 5 mm est sous 1 %.
 */
export const TERRAIN_SAMPLE_STEP = 0.01;

/**
 * Part pleine de la boîte de collision d'un corail ou d'une anémone. Approximation de jeu :
 * une colonie ramifiée ne remplit qu'une partie de sa boîte englobante.
 */
export const CORAL_FILL_RATIO = 0.5;

/** Litres d'eau d'un bac et ce qui en est déduit. */
export interface WaterVolumeBreakdown {
  /** Litres de la boîte d'eau, ceux de la fenêtre des réglages. */
  readonly grossLiters: number;
  /** Litres occupés par les rochers et les bois flottés. */
  readonly decorLiters: number;
  /** Litres occupés par les coraux et les anémones (boîtes pondérées). */
  readonly coralLiters: number;
  /** Litres occupés par le sol au-dessus du sable (berge). */
  readonly terrainLiters: number;
  /** Volume d'eau réel, en litres, jamais négatif. */
  readonly liters: number;
}

/** Bac lu par le calcul : son lieu, son décor et ses obstacles (un `World` convient). */
export type WaterVolumeSource = Pick<World, 'environment' | 'dimensions' | 'decor' | 'obstacles'>;

/** Longueur commune de [a0, a1] et [b0, b1], 0 s'ils ne se recouvrent pas. */
function overlap(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

/**
 * Litres immergés d'un élément de décor : ses voxels, rognés au sable et à la surface de
 * `water`. Une plante compte 0 (approximation de jeu, voir l'en-tête).
 */
export function decorItemLiters(item: DecorItem, water: Box3): number {
  if (item.kind === 'plant') {
    return 0;
  }
  const { voxelSize: v, cells } = decorVoxels(item);
  const base = decorBaseY(item);
  let height = 0;
  for (const cell of cells) {
    const bottom = base + cell.j * v;
    height += overlap(bottom, bottom + v, water.minY, water.maxY);
  }
  return height * v * v * 1000;
}

/** Litres immergés des obstacles en boîte (coraux, anémones), pondérés par `CORAL_FILL_RATIO`. */
export function boxObstaclesLiters(obstacles: readonly Obstacle[], water: Box3): number {
  let m3 = 0;
  for (const o of obstacles) {
    if (o.shape !== 'box') {
      continue;
    }
    m3 +=
      overlap(o.x - o.halfX, o.x + o.halfX, water.minX, water.maxX) *
      overlap(o.y - o.halfY, o.y + o.halfY, water.minY, water.maxY) *
      overlap(o.z - o.halfZ, o.z + o.halfZ, water.minZ, water.maxZ);
  }
  return m3 * CORAL_FILL_RATIO * 1000;
}

/**
 * Litres occupés par le sol au-dessus du fond de l'eau (`water.minY`) et sous sa surface :
 * berge et pente immergée du paludarium. `null` (dalle plate) : 0.
 */
export function terrainLiters(terrain: TerrainSettings | null, water: Box3): number {
  if (terrain === null) {
    return 0;
  }
  const nx = Math.max(1, Math.round((water.maxX - water.minX) / TERRAIN_SAMPLE_STEP));
  const nz = Math.max(1, Math.round((water.maxZ - water.minZ) / TERRAIN_SAMPLE_STEP));
  const dx = (water.maxX - water.minX) / nx;
  const dz = (water.maxZ - water.minZ) / nz;
  let height = 0;
  for (let i = 0; i < nx; i++) {
    const x = water.minX + (i + 0.5) * dx;
    for (let k = 0; k < nz; k++) {
      const z = water.minZ + (k + 0.5) * dz;
      const ground = terrainHeightAt(x, z, terrain, water);
      height += overlap(water.minY, ground, water.minY, water.maxY);
    }
  }
  return height * dx * dz * 1000;
}

/** Lieu d'un bac : l'environnement seul, ou avec ses dimensions réglées. */
function placeOf(tank: WaterVolumeSource): Place {
  return tank.dimensions === undefined
    ? tank.environment
    : { environment: tank.environment, dimensions: tank.dimensions };
}

/** Volume d'eau réel de `tank` et le détail de ce qui en est déduit (voir l'en-tête). */
export function waterVolumeBreakdown(tank: WaterVolumeSource): WaterVolumeBreakdown {
  const place = placeOf(tank);
  const water = environmentWater(place);
  const grossLiters = waterLiters(water);
  let decorLiters = 0;
  for (const item of tank.decor) {
    decorLiters += decorItemLiters(item, water);
  }
  const coralLiters = boxObstaclesLiters(tank.obstacles, water);
  const groundLiters = terrainLiters(environmentById(placeEnvironment(place)).terrain, water);
  return {
    grossLiters,
    decorLiters,
    coralLiters,
    terrainLiters: groundLiters,
    liters: Math.max(0, grossLiters - decorLiters - coralLiters - groundLiters),
  };
}

/** Volume d'eau réel de `tank`, en litres, décor déduit (`waterVolumeBreakdown`). */
export function realWaterLiters(tank: WaterVolumeSource): number {
  return waterVolumeBreakdown(tank).liters;
}
