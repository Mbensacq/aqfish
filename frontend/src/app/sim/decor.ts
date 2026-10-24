import { createPrng, MAX_SEED } from '../core/random/prng';
import type { Sphere, SpheresObstacle } from './obstacles';
import {
  PLANT_FORMS,
  PLANT_SINK_VOXELS,
  plantCollision,
  plantModel,
  type PlantForm,
} from './plant';
import { DEFAULT_TANK, SAND_THICKNESS, type TankDimensions } from './tank';
import { WOOD_SINK_RATIO, woodModel } from './wood';

/**
 * Décor du bac décrit par des **données** (idée #34, ADR 0015) : chaque élément est un objet
 * JSON (type, position, rotation, échelle, graine de forme), jamais codé en dur dans la
 * scène. Un rocher est un ensemble de voxels généré depuis sa graine (même graine, même
 * forme) ; sa forme de collision est une union de sphères tirée des mêmes « blocs » que ses
 * voxels, qui les contient tous (`rockModel`, `decorObstacles`). Un bois flotté (`wood`,
 * ADR 0045) suit le même principe, avec des sphères fines le long de ses branches
 * (`sim/wood.ts`). Module pur et déterministe, sans Three.js (ADR 0003).
 */

/** Types d'éléments de décor connus. */
export const DECOR_KINDS = ['rock', 'plant', 'wood'] as const;
export type DecorKind = (typeof DECOR_KINDS)[number];

/**
 * Élément de décor posé sur le sable. Unités : mètres et radians. L'altitude découle du type
 * (`decorBaseY`) : un élément repose sur le sable, sauf s'il a été posé sur un autre élément
 * par la chute de l'éditeur (`elevation`, ADR 0046).
 */
export interface DecorItem {
  readonly kind: DecorKind;
  /** Position horizontale du centre de la base, dans le repère du bac (`sim/tank.ts`). */
  readonly x: number;
  readonly z: number;
  /** Rotation autour de l'axe vertical (Y), en radians. */
  readonly rotation: number;
  /** Échelle de l'élément, dans [`MIN_DECOR_SCALE`, `MAX_DECOR_SCALE`]. */
  readonly scale: number;
  /** Graine de forme, entier 32 bits non signé. */
  readonly seed: number;
  /** Forme d'une plante (`sim/plant.ts`), obligatoire pour `plant`, interdite sinon. */
  readonly form?: PlantForm;
  /**
   * Hauteur de la base au-dessus de sa pose sur le sable, en mètres (≥ 0) ; absente : 0.
   * Non nulle seulement pour un élément posé sur un autre (ADR 0046).
   */
  readonly elevation?: number;
}

export const MIN_DECOR_SCALE = 0.25;
export const MAX_DECOR_SCALE = 3;

const ITEM_KEYS: readonly string[] = [
  'kind',
  'x',
  'z',
  'rotation',
  'scale',
  'seed',
  'form',
  'elevation',
];

/**
 * Problèmes d'un élément de décor venu de l'extérieur (JSON), liste vide s'il est valide.
 * Refuse : objet absent, clé inconnue ou manquante, type inconnu, nombre non fini, échelle
 * hors bornes, graine non entière sur 32 bits, position hors du bac `dims`, forme de plante
 * absente ou inconnue, forme donnée à autre chose qu'une plante, élévation négative ou plus
 * haute que le bac.
 */
export function validateDecorItem(value: unknown, dims: TankDimensions = DEFAULT_TANK): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return ['un élément de décor doit être un objet'];
  }
  const item = value as Record<string, unknown>;
  const problems: string[] = [];
  for (const key of Object.keys(item)) {
    if (!ITEM_KEYS.includes(key)) {
      problems.push(`clé inconnue : ${key}`);
    }
  }
  if (!(DECOR_KINDS as readonly unknown[]).includes(item['kind'])) {
    problems.push(`kind inconnu : ${String(item['kind'])}`);
  }
  if (item['kind'] === 'plant' && !(PLANT_FORMS as readonly unknown[]).includes(item['form'])) {
    problems.push(`form doit être ${PLANT_FORMS.join(' ou ')} (reçu : ${String(item['form'])})`);
  }
  if (item['kind'] !== 'plant' && 'form' in item) {
    problems.push('form est réservée aux plantes');
  }
  for (const key of ['x', 'z', 'rotation', 'scale', 'seed']) {
    const v = item[key];
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      problems.push(`${key} doit être un réel fini (reçu : ${String(v)})`);
    }
  }
  if (problems.length > 0) {
    return problems;
  }
  const { x, z, scale, seed } = item as unknown as DecorItem;
  if (Math.abs(x) > dims.width / 2) {
    problems.push(`x hors du bac (reçu : ${x}, bornes ± ${dims.width / 2})`);
  }
  if (Math.abs(z) > dims.depth / 2) {
    problems.push(`z hors du bac (reçu : ${z}, bornes ± ${dims.depth / 2})`);
  }
  if (scale < MIN_DECOR_SCALE || scale > MAX_DECOR_SCALE) {
    problems.push(
      `scale doit être dans [${MIN_DECOR_SCALE}, ${MAX_DECOR_SCALE}] (reçu : ${scale})`,
    );
  }
  if (!Number.isInteger(seed) || seed < 0 || seed > MAX_SEED) {
    problems.push(`seed doit être un entier 32 bits non signé (reçu : ${seed})`);
  }
  if ('elevation' in item) {
    const e = item['elevation'];
    if (typeof e !== 'number' || !Number.isFinite(e) || e < 0 || e > dims.height) {
      problems.push(`elevation doit être un réel dans [0, ${dims.height}] (reçu : ${String(e)})`);
    }
  }
  return problems;
}

/**
 * Valide une liste d'éléments de décor (données déjà décodées) et renvoie des copies ne
 * gardant que les clés connues.
 * @throws RangeError listant tous les problèmes, préfixés par l'indice de l'élément.
 */
export function parseDecorItems(value: unknown, dims: TankDimensions = DEFAULT_TANK): DecorItem[] {
  if (!Array.isArray(value)) {
    throw new RangeError('le décor doit être une liste d’éléments');
  }
  const problems: string[] = [];
  value.forEach((item, i) => {
    for (const p of validateDecorItem(item, dims)) {
      problems.push(`élément ${i} : ${p}`);
    }
  });
  if (problems.length > 0) {
    throw new RangeError(problems.join(' ; '));
  }
  return (value as DecorItem[]).map(({ kind, x, z, rotation, scale, seed, form, elevation }) => {
    const item: DecorItem =
      form === undefined
        ? { kind, x, z, rotation, scale, seed }
        : { kind, x, z, rotation, scale, seed, form };
    return elevation === undefined ? item : withElevation(item, elevation);
  });
}

/**
 * Décode un décor écrit en JSON (tableau d'éléments).
 * @throws RangeError si le texte n'est pas du JSON ou si un élément est invalide.
 */
export function parseDecor(json: string, dims: TankDimensions = DEFAULT_TANK): DecorItem[] {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch (error) {
    throw new RangeError(`décor : JSON invalide (${(error as Error).message})`, { cause: error });
  }
  return parseDecorItems(value, dims);
}

// ---------------------------------------------------------------------------------------
// Rochers

/** Arête d'un voxel de rocher à l'échelle 1, en mètres. */
export const ROCK_VOXEL_SIZE = 0.012;

/**
 * Enfoncement de la base dans le sable, en fraction de voxel : aucun jour visible sous le
 * rocher, quel que soit l'angle de vue.
 */
export const ROCK_SINK_RATIO = 0.25;

/** Bloc d'un rocher : sphère dans le repère local, en voxels (Y = 0 à la base). */
export interface RockBlob {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly r: number;
}

/** Voxel plein d'un rocher : indices entiers, le voxel occupe [i, i + 1] × [j, j + 1] × [k, k + 1]. */
export interface RockCell {
  readonly i: number;
  readonly j: number;
  readonly k: number;
}

/** Modèle d'un rocher, dans son repère local (avant rotation et translation). */
export interface RockModel {
  /** Arête d'un voxel, en mètres (`ROCK_VOXEL_SIZE · scale`). */
  readonly voxelSize: number;
  /** Blocs générateurs (en voxels) ; la forme de collision en dérive. */
  readonly blobs: readonly RockBlob[];
  /** Voxels pleins, triés par (j, i, k) ; `j ≥ 0`. */
  readonly cells: readonly RockCell[];
}

/**
 * Blocs d'un rocher tirés de sa graine : un bloc principal centré, puis 1 à 3 blocs
 * secondaires plus petits, décalés horizontalement. Centres bas (entre 0,2 et 0,5 rayon
 * au-dessus de la base) : le rocher est plus large que haut et repose à plat.
 */
export function rockBlobs(seed: number): RockBlob[] {
  const rng = createPrng(seed);
  const mainR = 4.5 + rng.next() * 2;
  const blobs: RockBlob[] = [{ x: 0, y: mainR * (0.25 + rng.next() * 0.25), z: 0, r: mainR }];
  const extra = 1 + Math.floor(rng.next() * 3);
  for (let n = 0; n < extra; n++) {
    const r = mainR * (0.5 + rng.next() * 0.3);
    const angle = rng.next() * 2 * Math.PI;
    const reach = mainR * (0.55 + rng.next() * 0.35);
    blobs.push({
      x: Math.cos(angle) * reach,
      y: r * (0.2 + rng.next() * 0.25),
      z: Math.sin(angle) * reach,
      r,
    });
  }
  return blobs;
}

/**
 * Modèle voxel d'un rocher : un voxel est plein si ses huit coins sont dans un même bloc.
 * Chaque voxel est donc contenu dans une sphère de la forme de collision (`decorObstacles`) :
 * un poisson hors de l'union de sphères n'est jamais dans un voxel.
 * @throws RangeError si la graine ou l'échelle est invalide.
 */
export function rockModel(seed: number, scale: number): RockModel {
  if (!(scale >= MIN_DECOR_SCALE && scale <= MAX_DECOR_SCALE)) {
    throw new RangeError(
      `scale doit être dans [${MIN_DECOR_SCALE}, ${MAX_DECOR_SCALE}] (reçu : ${scale})`,
    );
  }
  const blobs = rockBlobs(seed);
  let minI = Infinity;
  let maxI = -Infinity;
  let maxJ = -Infinity;
  let minK = Infinity;
  let maxK = -Infinity;
  for (const b of blobs) {
    minI = Math.min(minI, Math.floor(b.x - b.r));
    maxI = Math.max(maxI, Math.ceil(b.x + b.r));
    maxJ = Math.max(maxJ, Math.ceil(b.y + b.r));
    minK = Math.min(minK, Math.floor(b.z - b.r));
    maxK = Math.max(maxK, Math.ceil(b.z + b.r));
  }
  const cells: RockCell[] = [];
  for (let j = 0; j < maxJ; j++) {
    for (let i = minI; i < maxI; i++) {
      for (let k = minK; k < maxK; k++) {
        if (blobs.some((b) => cubeInside(b, i, j, k))) {
          cells.push({ i, j, k });
        }
      }
    }
  }
  return { voxelSize: ROCK_VOXEL_SIZE * scale, blobs, cells };
}

function cubeInside(b: RockBlob, i: number, j: number, k: number): boolean {
  // Coin le plus éloigné du centre sur chaque axe.
  const dx = Math.max(Math.abs(i - b.x), Math.abs(i + 1 - b.x));
  const dy = Math.max(Math.abs(j - b.y), Math.abs(j + 1 - b.y));
  const dz = Math.max(Math.abs(k - b.z), Math.abs(k + 1 - b.z));
  return dx * dx + dy * dy + dz * dz <= b.r * b.r;
}

/** Altitude de la base d'un rocher (repère du bac) : sur le sable, légèrement enfoncée. */
export function rockBaseY(voxelSize: number): number {
  return SAND_THICKNESS - ROCK_SINK_RATIO * voxelSize;
}

/**
 * Passe un point du repère local d'un élément (en mètres, Y = 0 à la base) au repère du
 * bac : rotation `rotation` autour de Y (même convention que `Object3D.rotation.y` de
 * Three.js), puis translation. Écrit le résultat dans `out`.
 */
export function decorToTank(
  item: DecorItem,
  baseY: number,
  lx: number,
  ly: number,
  lz: number,
  out: { x: number; y: number; z: number },
): void {
  const c = Math.cos(item.rotation);
  const s = Math.sin(item.rotation);
  out.x = item.x + c * lx + s * lz;
  out.y = baseY + ly;
  out.z = item.z - s * lx + c * lz;
}

/** Altitude de la racine d'une plante (repère du bac) : enfoncée de `PLANT_SINK_VOXELS`. */
export function plantBaseY(voxelSize: number): number {
  return SAND_THICKNESS - PLANT_SINK_VOXELS * voxelSize;
}

/** Altitude de la base d'un bois flotté (repère du bac) : sur le sable, légèrement enfoncée. */
export function woodBaseY(voxelSize: number): number {
  return SAND_THICKNESS - WOOD_SINK_RATIO * voxelSize;
}

/** Élévation d'un élément au-dessus de sa pose sur le sable (`elevation`, 0 si absente). */
export function decorElevation(item: DecorItem): number {
  return item.elevation ?? 0;
}

/**
 * Copie de `item` à l'élévation `elevation` : la clé est omise à 0 (un décor posé sur le
 * sable reste identique à celui d'avant l'ADR 0046).
 */
export function withElevation(item: DecorItem, elevation: number): DecorItem {
  const copy: { -readonly [K in keyof DecorItem]: DecorItem[K] } = { ...item };
  delete copy.elevation;
  return elevation === 0 ? copy : { ...copy, elevation };
}

/** Altitude de la base d'un élément sur le sable (sans `elevation`), selon son type. */
export function decorGroundBaseY(item: DecorItem): number {
  if (item.kind === 'plant') {
    return plantBaseY(plantModel(item.seed, item.scale, item.form as PlantForm).voxelSize);
  }
  if (item.kind === 'wood') {
    return woodBaseY(woodModel(item.seed, item.scale).voxelSize);
  }
  return rockBaseY(rockModel(item.seed, item.scale).voxelSize);
}

/** Altitude de la base d'un élément de décor : sur le sable selon son type, plus `elevation`. */
export function decorBaseY(item: DecorItem): number {
  return decorGroundBaseY(item) + decorElevation(item);
}

/**
 * Voxels et arête d'un élément de décor, selon son type, dans son repère local (avant
 * rotation et translation) ; `amplitude` : ondulation d'une plante (0 sinon), en mètres.
 */
export function decorVoxels(item: DecorItem): {
  readonly voxelSize: number;
  readonly cells: readonly RockCell[];
  readonly amplitude: number;
} {
  if (item.kind === 'plant') {
    const model = plantModel(item.seed, item.scale, item.form as PlantForm);
    return { voxelSize: model.voxelSize, cells: model.cells, amplitude: model.amplitude };
  }
  const model =
    item.kind === 'wood' ? woodModel(item.seed, item.scale) : rockModel(item.seed, item.scale);
  return { voxelSize: model.voxelSize, cells: model.cells, amplitude: 0 };
}

/**
 * Hauteur locale du centre d'une sphère de collision de rayon `r` (centre à `y` au-dessus de
 * la base) : inchangée sur le sable, où la partie enfouie des sphères ne se voit pas ; pour
 * un élément posé sur un autre (`elevation` > 0), remontée pour qu'aucune sphère ne descende
 * sous la base, sans quoi il reposerait sur sa partie invisible, au-dessus du vide (ADR 0046).
 */
export function liftedSphereY(item: DecorItem): (y: number, r: number) => number {
  return decorElevation(item) > 0 ? (y, r) => Math.max(y, r) : (y) => y;
}

/**
 * Forme de collision d'une plante : sphères de ses tiges (`plantCollision`), dans le
 * repère du bac. Le feuillage n'y est pas : il reste traversable.
 */
export function plantSpheres(item: DecorItem): Sphere[] {
  const model = plantModel(item.seed, item.scale, item.form as PlantForm);
  const v = model.voxelSize;
  const baseY = plantBaseY(v) + decorElevation(item);
  const lift = liftedSphereY(item);
  const p = { x: 0, y: 0, z: 0 };
  return plantCollision(model).map((b) => {
    decorToTank(item, baseY, b.x * v, lift(b.y * v, b.r * v), b.z * v, p);
    return { x: p.x, y: p.y, z: p.z, radius: b.r * v };
  });
}

/** Forme de collision d'un rocher : ses blocs, en sphères du repère du bac. */
export function rockSpheres(item: DecorItem): Sphere[] {
  const model = rockModel(item.seed, item.scale);
  const v = model.voxelSize;
  const baseY = rockBaseY(v) + decorElevation(item);
  const lift = liftedSphereY(item);
  const p = { x: 0, y: 0, z: 0 };
  return model.blobs.map((b) => {
    decorToTank(item, baseY, b.x * v, lift(b.y * v, b.r * v), b.z * v, p);
    return { x: p.x, y: p.y, z: p.z, radius: b.r * v };
  });
}

/**
 * Forme de collision d'un bois flotté : ses sphères fines le long des branches
 * (`woodModel`), dans le repère du bac.
 */
export function woodSpheres(item: DecorItem): Sphere[] {
  const model = woodModel(item.seed, item.scale);
  const v = model.voxelSize;
  const baseY = woodBaseY(v) + decorElevation(item);
  const lift = liftedSphereY(item);
  const p = { x: 0, y: 0, z: 0 };
  return model.spheres.map((b) => {
    decorToTank(item, baseY, b.x * v, lift(b.y * v, b.r * v), b.z * v, p);
    return { x: p.x, y: p.y, z: p.z, radius: b.r * v };
  });
}

/** Sphères de collision d'un élément de décor (repère du bac), selon son type. */
export function decorSpheres(item: DecorItem): Sphere[] {
  if (item.kind === 'plant') {
    return plantSpheres(item);
  }
  return item.kind === 'wood' ? woodSpheres(item) : rockSpheres(item);
}

/**
 * Obstacles des éléments de décor, identifiants consécutifs à partir de `firstId`, dans
 * l'ordre de `items`.
 */
export function decorObstacles(items: readonly DecorItem[], firstId = 0): SpheresObstacle[] {
  return items.map((item, n) => ({
    id: firstId + n,
    shape: 'spheres',
    spheres: decorSpheres(item),
  }));
}

/**
 * Décor par défaut du bac tropical : quelques rochers de formes variées, de longues plantes
 * vers le fond et des touffes basses devant, en données JSON (validées au chargement du
 * module comme n'importe quel décor venu de l'extérieur). Deux rochers à gauche laissent
 * entre eux un passage.
 */
export const DEFAULT_DECOR: readonly DecorItem[] = parseDecor(`[
  { "kind": "rock", "x": -0.36, "z": -0.09, "rotation": 0.4, "scale": 1.4, "seed": 11 },
  { "kind": "rock", "x": -0.1, "z": -0.12, "rotation": 2.1, "scale": 1.05, "seed": 27 },
  { "kind": "rock", "x": 0.3, "z": 0.03, "rotation": 5.2, "scale": 1.25, "seed": 3 },
  { "kind": "rock", "x": 0.47, "z": -0.14, "rotation": 1.3, "scale": 0.85, "seed": 8 },
  { "kind": "plant", "form": "tall", "x": -0.5, "z": -0.17, "rotation": 0.3, "scale": 1.2, "seed": 101 },
  { "kind": "plant", "form": "tall", "x": 0.12, "z": -0.19, "rotation": 1.9, "scale": 1, "seed": 204 },
  { "kind": "plant", "form": "tall", "x": 0.2, "z": -0.15, "rotation": 4.1, "scale": 0.8, "seed": 303 },
  { "kind": "plant", "form": "tuft", "x": -0.2, "z": 0.1, "rotation": 0.8, "scale": 1, "seed": 404 },
  { "kind": "plant", "form": "tuft", "x": 0.08, "z": 0.14, "rotation": 2.6, "scale": 1.2, "seed": 505 },
  { "kind": "plant", "form": "tuft", "x": 0.52, "z": 0.1, "rotation": 5.5, "scale": 0.9, "seed": 606 }
]`);
