import { assertSeed, createPrng, deriveSeed, MAX_SEED } from '../core/random/prng';
import {
  CORAL_FORMS,
  CORAL_SCALE_LIMITS,
  coralModel,
  type CoralForm,
  type CoralModel,
} from './coral-shapes';
import { decorObstacles, type DecorItem } from './decor';
import type { BoxObstacle } from './obstacles';
import { SAND_THICKNESS, type TankDimensions } from './tank';

/**
 * Coraux du récif (issue #149, ADR 0040) : colonies en voxels posées sur le sable, de trois
 * formes (branchu, en table, en dôme) et de quatre teintes.
 *
 * Tout est **dérivé** de la graine du monde, sans état : la disposition (`coralLayout`) se
 * tire d'un flux de hasard propre (`CORAL_STREAM`), qui ne touche jamais aux sous-générateurs
 * des poissons ni au décor des autres environnements ; la forme de chaque colonie
 * (`coralModel`) se tire de sa propre graine. La sauvegarde (ADR 0028) n'a aucun champ
 * nouveau.
 *
 * Bornes : une colonie tourne d'un nombre entier de quarts de tour, si bien que sa boîte
 * englobante reste alignée sur les axes du bac. Cette boîte est son obstacle
 * (`coralObstacles`) ; son emprise au sol tient dans le sol rétréci de `CORAL_EDGE_MARGIN`,
 * à `CORAL_GAP` au moins des autres colonies et des formes de collision du décor (rochers).
 * Module pur et déterministe, sans Three.js (ADR 0003).
 */

export {
  CORAL_FORMS,
  CORAL_SCALE_LIMITS,
  CORAL_VOXEL_SIZE,
  coralModel,
  type CoralCell,
  type CoralForm,
  type CoralModel,
} from './coral-shapes';

/** Teintes des colonies (couleurs : `render/coral-model.ts`). */
export const CORAL_HUES = ['rose', 'orange', 'violet', 'jaune'] as const;
export type CoralHue = (typeof CORAL_HUES)[number];

/** Flux de hasard des coraux, dérivé de la graine du monde (`deriveSeed`). */
export const CORAL_STREAM = 0xc0a1;
/** Enfoncement de la base dans le sable, en fraction de voxel (comme les rochers). */
export const CORAL_SINK_RATIO = 0.25;
/** Distance minimale entre l'emprise d'une colonie et les vitres, en mètres. */
export const CORAL_EDGE_MARGIN = 0.03;
/** Jeu minimal entre une emprise et une autre emprise ou un rocher, en mètres. */
export const CORAL_GAP = 0.02;
/** Essais de placement par colonie avant de l'omettre. */
export const CORAL_ATTEMPTS = 150;
/** Nombre maximal de colonies d'un environnement (borne de `CoralSettings.count.max`). */
export const MAX_CORALS = 16;

/** Réglage des coraux d'un environnement (`sim/environment.ts`). */
export interface CoralSettings {
  /** Nombre de colonies visé, tiré entre `min` et `max` (bornes comprises). */
  readonly count: { readonly min: number; readonly max: number };
  /** Échelle d'une colonie, tirée entre `min` et `max`. */
  readonly scale: { readonly min: number; readonly max: number };
}

/** Colonie posée sur le sable (données pures). */
export interface CoralColony {
  /** Rang de la colonie dans la disposition (0, 1, 2…). */
  readonly id: number;
  readonly form: CoralForm;
  readonly hue: CoralHue;
  /** Origine du modèle (centre de la base), dans le repère du bac (mètres). */
  readonly x: number;
  readonly z: number;
  /** Rotation autour de Y : `quarterTurns · π / 2` (même convention que `decorToTank`). */
  readonly quarterTurns: 0 | 1 | 2 | 3;
  readonly scale: number;
  /** Graine de forme, entier 32 bits non signé. */
  readonly seed: number;
}

/**
 * Vérifie un réglage de coraux : effectifs entiers dans [0, `MAX_CORALS`] avec `min ≤ max`,
 * échelles dans `CORAL_SCALE_LIMITS` avec `min ≤ max`.
 * @throws RangeError si le réglage est invalide.
 */
export function assertCoralSettings(settings: CoralSettings): CoralSettings {
  const { count, scale } = settings;
  if (
    !Number.isInteger(count.min) ||
    !Number.isInteger(count.max) ||
    count.min < 0 ||
    count.max < count.min ||
    count.max > MAX_CORALS
  ) {
    throw new RangeError(`effectif de coraux invalide : ${JSON.stringify(count)}`);
  }
  if (
    !(scale.min >= CORAL_SCALE_LIMITS.min) ||
    !(scale.max <= CORAL_SCALE_LIMITS.max) ||
    !(scale.max >= scale.min)
  ) {
    throw new RangeError(`échelle de corail invalide : ${JSON.stringify(scale)}`);
  }
  return settings;
}

/** Altitude de la base d'une colonie (repère du bac) : sur le sable, légèrement enfoncée. */
export function coralBaseY(voxelSize: number): number {
  return SAND_THICKNESS - CORAL_SINK_RATIO * voxelSize;
}

/** Emprise au sol (repère du bac) du modèle `model` posé en `(x, z)` avec `quarterTurns`. */
export function coralFootprint(
  model: CoralModel,
  x: number,
  z: number,
  quarterTurns: number,
): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const v = model.voxelSize;
  const [i0, i1, k0, k1] = [model.minI * v, model.maxI * v, model.minK * v, model.maxK * v];
  // x' = cos · lx + sin · lz ; z' = −sin · lx + cos · lz, aux quarts de tour exacts.
  switch (quarterTurns) {
    case 1:
      return { minX: x + k0, maxX: x + k1, minZ: z - i1, maxZ: z - i0 };
    case 2:
      return { minX: x - i1, maxX: x - i0, minZ: z - k1, maxZ: z - k0 };
    case 3:
      return { minX: x - k1, maxX: x - k0, minZ: z + i0, maxZ: z + i1 };
    default:
      return { minX: x + i0, maxX: x + i1, minZ: z + k0, maxZ: z + k1 };
  }
}

/** Boîte d'obstacle d'une colonie : boîte englobante de ses voxels, identifiant `id`. */
export function coralBox(colony: CoralColony, id: number): BoxObstacle {
  const model = coralModel(colony.form, colony.seed, colony.scale);
  const f = coralFootprint(model, colony.x, colony.z, colony.quarterTurns);
  const baseY = coralBaseY(model.voxelSize);
  const halfY = (model.maxJ * model.voxelSize) / 2;
  return {
    id,
    shape: 'box',
    x: (f.minX + f.maxX) / 2,
    y: baseY + halfY,
    z: (f.minZ + f.maxZ) / 2,
    halfX: (f.maxX - f.minX) / 2,
    halfY,
    halfZ: (f.maxZ - f.minZ) / 2,
  };
}

/** Obstacles des colonies, identifiants consécutifs à partir de `firstId`, dans l'ordre. */
export function coralObstacles(colonies: readonly CoralColony[], firstId = 0): BoxObstacle[] {
  return colonies.map((colony, n) => coralBox(colony, firstId + n));
}

/**
 * Disposition des coraux pour la graine `seed` sur le sol du bac `dims`, autour du décor
 * `decor` : nombre, formes, teintes, échelles, rotations et positions, déterministes. Formes
 * et teintes suivent chacune une permutation tirée de la graine, parcourue en boucle au fil
 * des colonies placées : dès
 * 3 colonies, les trois formes sont présentes ; dès 4, les quatre teintes. Chaque colonie est
 * placée au plus `CORAL_ATTEMPTS` fois, puis omise (le nombre obtenu peut être inférieur au
 * nombre visé). `settings` nul : aucun corail.
 * @throws RangeError si la graine ou le réglage est invalide.
 */
export function coralLayout(
  seed: number,
  dims: TankDimensions,
  settings: CoralSettings | null,
  decor: readonly DecorItem[] = [],
): CoralColony[] {
  assertSeed(seed);
  if (settings === null) {
    return [];
  }
  assertCoralSettings(settings);
  const rng = createPrng(deriveSeed(seed, CORAL_STREAM));
  const forms = shuffled(CORAL_FORMS, rng.next);
  const hues = shuffled(CORAL_HUES, rng.next);
  const rocks = decorObstacles(decor).flatMap((o) => o.spheres);
  const target =
    settings.count.min + Math.floor(rng.next() * (settings.count.max - settings.count.min + 1));
  const halfW = dims.width / 2 - CORAL_EDGE_MARGIN;
  const halfD = dims.depth / 2 - CORAL_EDGE_MARGIN;
  const placed: ReturnType<typeof coralFootprint>[] = [];
  const colonies: CoralColony[] = [];
  for (let n = 0; n < target; n++) {
    const form = forms[colonies.length % forms.length];
    const hue = hues[colonies.length % hues.length];
    const scale = settings.scale.min + (settings.scale.max - settings.scale.min) * rng.next();
    const quarterTurns = Math.floor(rng.next() * 4) as CoralColony['quarterTurns'];
    const shapeSeed = Math.floor(rng.next() * (MAX_SEED + 1));
    const model = coralModel(form, shapeSeed, scale);
    for (let attempt = 0; attempt < CORAL_ATTEMPTS; attempt++) {
      const x = (2 * rng.next() - 1) * halfW;
      const z = (2 * rng.next() - 1) * halfD;
      const f = coralFootprint(model, x, z, quarterTurns);
      const fits =
        f.minX >= -halfW &&
        f.maxX <= halfW &&
        f.minZ >= -halfD &&
        f.maxZ <= halfD &&
        placed.every((o) => rectGap(f, o) >= CORAL_GAP) &&
        rocks.every((s) => rectCircleGap(f, s.x, s.z, s.radius) >= CORAL_GAP);
      if (fits) {
        placed.push(f);
        colonies.push({
          id: colonies.length,
          form,
          hue,
          x,
          z,
          quarterTurns,
          scale,
          seed: shapeSeed,
        });
        break;
      }
    }
  }
  return colonies;
}

type Rect = ReturnType<typeof coralFootprint>;

/** Écart entre deux rectangles (0 s'ils se touchent ou se recouvrent). */
export function rectGap(a: Rect, b: Rect): number {
  const dx = Math.max(0, a.minX - b.maxX, b.minX - a.maxX);
  const dz = Math.max(0, a.minZ - b.maxZ, b.minZ - a.maxZ);
  return Math.hypot(dx, dz);
}

/** Écart entre un rectangle et un disque (négatif s'ils se recouvrent). */
export function rectCircleGap(r: Rect, x: number, z: number, radius: number): number {
  const dx = Math.max(0, r.minX - x, x - r.maxX);
  const dz = Math.max(0, r.minZ - z, z - r.maxZ);
  return Math.hypot(dx, dz) - radius;
}

/** Permutation de `items` tirée de `next` (Fisher-Yates). */
function shuffled<T>(items: readonly T[], next: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
