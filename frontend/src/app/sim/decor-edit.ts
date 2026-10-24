import { createPrng, deriveSeed } from '../core/random/prng';
import {
  decorSpheres,
  decorVoxels,
  MAX_DECOR_SCALE,
  MIN_DECOR_SCALE,
  validateDecorItem,
  type DecorItem,
} from './decor';
import { placeDimensions, placeEnvironment, type EnvironmentId, type Place } from './environment';
import type { PlantForm } from './plant';
import { MAX_SAVE_DECOR } from './save';
import { createWorld, seededObstacleCount, type MutableWorld, type World } from './world';

/**
 * Édition du décor (issue #167, ADR 0043) : fonctions pures qui produisent un **nouveau**
 * tableau de `DecorItem` (jamais modifié en place), puis l'installent dans un monde en
 * recalculant ses obstacles. La simulation reste déterministe : la graine d'un élément ajouté
 * est tirée de la graine du monde.
 */

/** Environnements dont le décor est modifiable (le bac tropical seulement, pour l'instant). */
export const EDITABLE_ENVIRONMENTS: readonly EnvironmentId[] = ['tropical'];

/** Vrai si le décor de l'environnement `id` peut être édité. */
export function isDecorEditable(id: EnvironmentId): boolean {
  return EDITABLE_ENVIRONMENTS.includes(id);
}

/** Nombre maximal d'éléments de décor : celui qu'une sauvegarde accepte. */
export const MAX_DECOR_ITEMS = MAX_SAVE_DECOR;

/**
 * Marge entre le centre d'un élément ajouté et les vitres, en mètres : un rocher ou une
 * plante posé au bord ne dépasse pas du bac.
 */
export const DECOR_EDGE_MARGIN = 0.04;

/** Base des identifiants passés à `deriveSeed` pour tirer la graine d'un élément ajouté. */
export const DECOR_SEED_BASE = 0x0ed17000;

/** Entrée du catalogue de l'éditeur : un type d'élément (et la forme d'une plante). */
export interface DecorChoice {
  readonly id: DecorChoiceId;
  readonly name: string;
  readonly kind: DecorItem['kind'];
  readonly form?: PlantForm;
}

export const DECOR_CHOICE_IDS = ['rock', 'wood', 'tall', 'tuft'] as const;
export type DecorChoiceId = (typeof DECOR_CHOICE_IDS)[number];

/**
 * Outil de l'éditeur de décor : `select` (un clic sur le sable désélectionne), ou un type du
 * catalogue à poser d'un clic sur le sable.
 */
export type DecorTool = 'select' | DecorChoiceId;

/** Vrai si `value` est un outil de l'éditeur de décor. */
export function isDecorTool(value: unknown): value is DecorTool {
  return value === 'select' || isDecorChoiceId(value);
}

/** Catalogue de l'éditeur, dans l'ordre d'affichage. */
export const DECOR_CATALOG: Readonly<Record<DecorChoiceId, DecorChoice>> = {
  rock: { id: 'rock', name: 'Rocher', kind: 'rock' },
  wood: { id: 'wood', name: 'Bois flotté', kind: 'wood' },
  tall: { id: 'tall', name: 'Grande plante', kind: 'plant', form: 'tall' },
  tuft: { id: 'tuft', name: 'Touffe', kind: 'plant', form: 'tuft' },
};

/** Vrai si `value` est un identifiant du catalogue. */
export function isDecorChoiceId(value: unknown): value is DecorChoiceId {
  return (DECOR_CHOICE_IDS as readonly unknown[]).includes(value);
}

/**
 * Graine de forme d'un nouvel élément : `deriveSeed(worldSeed, DECOR_SEED_BASE + n)` pour le
 * plus petit `n ≥ decor.length` dont la graine n'est pas déjà prise. Même monde, même décor :
 * même graine.
 */
export function nextDecorSeed(worldSeed: number, decor: readonly DecorItem[]): number {
  const used = new Set(decor.map((item) => item.seed));
  for (let n = decor.length; ; n++) {
    const seed = deriveSeed(worldSeed, DECOR_SEED_BASE + n);
    if (!used.has(seed)) {
      return seed;
    }
  }
}

/**
 * Vrai si (x, z) peut recevoir un élément dans l'environnement `environment` : réels finis,
 * à au moins `DECOR_EDGE_MARGIN` des vitres.
 */
export function canPlaceDecorAt(x: number, z: number, environment: Place): boolean {
  const { width, depth } = placeDimensions(environment);
  return (
    Number.isFinite(x) &&
    Number.isFinite(z) &&
    Math.abs(x) <= width / 2 - DECOR_EDGE_MARGIN &&
    Math.abs(z) <= depth / 2 - DECOR_EDGE_MARGIN
  );
}

/**
 * Décor `decor` augmenté d'un élément `choice` posé en (x, z), à l'échelle 1 et tourné d'un
 * angle tiré de sa graine (`nextDecorSeed`). Le point est ensuite ramené là où l'emprise de
 * l'élément tient dans le bac (`clampDecorPosition`, issue #59) : un rocher posé contre une
 * vitre n'en dépasse pas. `null` (rien n'est ajouté) si le décor n'est pas éditable, s'il est
 * plein (`MAX_DECOR_ITEMS`), si le point est hors des bornes (`canPlaceDecorAt`) ou si
 * l'élément obtenu est invalide (`validateDecorItem`).
 */
export function addDecorItem(
  decor: readonly DecorItem[],
  choice: DecorChoiceId,
  x: number,
  z: number,
  worldSeed: number,
  environment: Place,
): DecorItem[] | null {
  if (
    !isDecorEditable(placeEnvironment(environment)) ||
    !isDecorChoiceId(choice) ||
    decor.length >= MAX_DECOR_ITEMS ||
    !canPlaceDecorAt(x, z, environment)
  ) {
    return null;
  }
  const seed = nextDecorSeed(worldSeed, decor);
  const rotation = createPrng(seed).next() * 2 * Math.PI;
  const { kind, form } = DECOR_CATALOG[choice];
  const placed: DecorItem =
    form === undefined
      ? { kind, x, z, rotation, scale: 1, seed }
      : { kind, x, z, rotation, scale: 1, seed, form };
  const p = clampDecorPosition(placed, x, z, environment);
  if (p === null) {
    return null;
  }
  const item: DecorItem = p.x === x && p.z === z ? placed : { ...placed, x: p.x, z: p.z };
  if (validateDecorItem(item, placeDimensions(environment)).length > 0) {
    return null;
  }
  return [...decor, item];
}

/** Décor `decor` sans l'élément d'indice `index` ; `null` si l'indice n'existe pas. */
export function removeDecorItem(decor: readonly DecorItem[], index: number): DecorItem[] | null {
  if (!Number.isInteger(index) || index < 0 || index >= decor.length) {
    return null;
  }
  return decor.filter((_, n) => n !== index);
}

/**
 * Remplace le décor de `world` (modifié en place) par `decor` : ses obstacles sont recalculés
 * comme à la création (`createWorld` : décor, puis éléments tirés de la graine). Les
 * poissons, la nourriture et le temps ne changent pas ; un poisson recouvert par un élément
 * ajouté en est sorti au pas suivant (filet de sécurité de `stepFish`).
 * @throws RangeError si un élément est invalide, ou si le monde a des obstacles explicites
 * (hors décor et éléments tirés de la graine), qui seraient perdus.
 */
export function setDecorInPlace(world: MutableWorld, decor: readonly DecorItem[]): void {
  if (world.obstacles.length !== world.decor.length + seededObstacleCount(world)) {
    throw new RangeError('édition du décor : le monde a des obstacles explicites');
  }
  const rebuilt = createWorld(world.seed, [], [], decor, world);
  world.decor = rebuilt.decor;
  world.obstacles = rebuilt.obstacles;
}

/** Copie de `world` dont le décor est `decor` (`setDecorInPlace`) ; `world` n'est pas modifié. */
export function withDecor(world: World, decor: readonly DecorItem[]): World {
  const copy: MutableWorld = { ...world };
  setDecorInPlace(copy, decor);
  return copy;
}

// ---------------------------------------------------------------------------------------
// Déplacer, tourner, redimensionner (issue #168)

/** Pas de rotation de l'éditeur : 15°, en radians. */
export const DECOR_ROTATION_STEP = Math.PI / 12;

/** Pas d'échelle de l'éditeur (ajouté ou retiré), borné à [`MIN_DECOR_SCALE`, `MAX_DECOR_SCALE`]. */
export const DECOR_SCALE_STEP = 0.25;

/**
 * Emprises déjà calculées, par élément (#178) : le calcul régénère le modèle voxel de
 * l'élément, trop coûteux pour chaque déplacement du pointeur. Un `DecorItem` est en lecture
 * seule : une rotation ou une échelle produit un nouvel objet, donc une nouvelle entrée.
 */
const FOOTPRINTS = new WeakMap<DecorItem, number>();

/** Nombre d'emprises calculées (`decorFootprint`) depuis le chargement du module (tests). */
let footprintComputations = 0;

/** Nombre d'emprises calculées depuis le chargement du module, pour les tests. */
export function decorFootprintComputations(): number {
  return footprintComputations;
}

/**
 * Emprise horizontale d'un élément, en mètres : rayon du disque, centré sur (x, z), qui
 * contient tous ses voxels quelle que soit sa rotation (plus l'ondulation d'une plante).
 * Elle ne dépend que du type, de la forme, de la graine et de l'échelle ; mémorisée par
 * élément (`FOOTPRINTS`).
 */
export function decorFootprint(item: DecorItem): number {
  const hit = FOOTPRINTS.get(item);
  if (hit !== undefined) {
    return hit;
  }
  footprintComputations += 1;
  const footprint = computeFootprint(item);
  FOOTPRINTS.set(item, footprint);
  return footprint;
}

function computeFootprint(item: DecorItem): number {
  const model = decorVoxels(item);
  let reach2 = 0;
  for (const { i, k } of model.cells) {
    // Coin du voxel le plus éloigné de l'axe vertical.
    const dx = Math.max(Math.abs(i), Math.abs(i + 1));
    const dz = Math.max(Math.abs(k), Math.abs(k + 1));
    reach2 = Math.max(reach2, dx * dx + dz * dz);
  }
  return Math.sqrt(reach2) * model.voxelSize + model.amplitude;
}

/**
 * Position (x, z) la plus proche de (`x`, `z`) où l'élément `item` tient dans le bac de
 * l'environnement `environment` : son emprise (`decorFootprint`, au moins
 * `DECOR_EDGE_MARGIN`) ne dépasse d'aucune vitre. Un élément plus large que le bac sur un axe
 * est centré sur cet axe. `null` si `x` ou `z` n'est pas un réel fini.
 */
export function clampDecorPosition(
  item: DecorItem,
  x: number,
  z: number,
  environment: Place,
): { x: number; z: number } | null {
  if (!Number.isFinite(x) || !Number.isFinite(z)) {
    return null;
  }
  const { width, depth } = placeDimensions(environment);
  const reach = Math.max(decorFootprint(item), DECOR_EDGE_MARGIN);
  const clamp = (v: number, half: number) => {
    const bound = Math.max(half - reach, 0);
    return Math.min(Math.max(v, -bound), bound);
  };
  return { x: clamp(x, width / 2), z: clamp(z, depth / 2) };
}

/** Vrai si les formes de collision de `a` et `b` se pénètrent (au moins deux sphères sécantes). */
export function decorItemsOverlap(a: DecorItem, b: DecorItem): boolean {
  const sa = decorSpheres(a);
  const sb = decorSpheres(b);
  return sa.some((p) =>
    sb.some((q) => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) < p.radius + q.radius),
  );
}

/** Indices des éléments de `decor` (autres que `index`) que `item` pénètre. */
function overlapsAt(decor: readonly DecorItem[], index: number, item: DecorItem): Set<number> {
  const hits = new Set<number>();
  decor.forEach((other, n) => {
    if (n !== index && decorItemsOverlap(item, other)) {
      hits.add(n);
    }
  });
  return hits;
}

/**
 * Vrai si la nouvelle pose de l'élément `index` (`next[index]`, le reste de `next` égal à
 * `previous`) est acceptable : elle ne pénètre aucun autre élément qu'il ne pénétrait pas déjà
 * dans `previous`. Deux formes qui se chevauchent peuvent enfermer un poisson entre elles ;
 * un chevauchement hérité (décor chargé) ne bloque pas pour autant l'élément sur place.
 * Faux si `index` n'existe pas dans l'un des deux décors, ou si leurs longueurs diffèrent.
 */
export function isDecorPoseAllowed(
  previous: readonly DecorItem[],
  next: readonly DecorItem[],
  index: number,
): boolean {
  if (
    previous.length !== next.length ||
    !Number.isInteger(index) ||
    index < 0 ||
    index >= next.length
  ) {
    return false;
  }
  const before = overlapsAt(previous, index, previous[index]);
  for (const n of overlapsAt(next, index, next[index])) {
    if (!before.has(n)) {
      return false;
    }
  }
  return true;
}

/** Décor `decor` dont l'élément `index` est remplacé par `item` (validé), `null` sinon. */
function replaceItem(
  decor: readonly DecorItem[],
  index: number,
  item: DecorItem,
  environment: Place,
): DecorItem[] | null {
  if (validateDecorItem(item, placeDimensions(environment)).length > 0) {
    return null;
  }
  return decor.map((other, n) => (n === index ? item : other));
}

function editableIndex(decor: readonly DecorItem[], index: number, environment: Place): boolean {
  return (
    isDecorEditable(placeEnvironment(environment)) &&
    Number.isInteger(index) &&
    index >= 0 &&
    index < decor.length
  );
}

/**
 * Décor `decor` dont l'élément `index` est déplacé vers (`x`, `z`), position bornée au bac
 * (`clampDecorPosition`). Aperçu du glissement : le chevauchement n'est pas vérifié ici
 * (`isDecorPoseAllowed`, au lâcher). `null` si le décor n'est pas éditable, si l'indice
 * n'existe pas ou si la position n'est pas finie.
 */
export function moveDecorItem(
  decor: readonly DecorItem[],
  index: number,
  x: number,
  z: number,
  environment: Place,
): DecorItem[] | null {
  if (!editableIndex(decor, index, environment)) {
    return null;
  }
  const item = decor[index];
  const p = clampDecorPosition(item, x, z, environment);
  if (!p) {
    return null;
  }
  // Même forme, même échelle : l'élément déplacé reprend l'emprise de l'original, qu'un
  // glissement enchaîné à partir de l'aperçu ne recalcule donc pas (#178).
  const moved = { ...item, x: p.x, z: p.z };
  FOOTPRINTS.set(moved, decorFootprint(item));
  return replaceItem(decor, index, moved, environment);
}

/** Angle ramené dans [0, 2π). */
function normalizeAngle(angle: number): number {
  const turn = 2 * Math.PI;
  const a = angle % turn;
  return a < 0 ? a + turn : a;
}

/**
 * Décor `decor` dont l'élément `index` a tourné de `steps` pas de `DECOR_ROTATION_STEP`
 * (positif : sens de `rotation`), angle ramené dans [0, 2π). `null` si le décor n'est pas
 * éditable, si l'indice n'existe pas, si `steps` n'est pas un entier non nul, ou si la
 * nouvelle pose est refusée (`isDecorPoseAllowed`).
 */
export function rotateDecorItem(
  decor: readonly DecorItem[],
  index: number,
  steps: number,
  environment: Place,
): DecorItem[] | null {
  if (!editableIndex(decor, index, environment) || !Number.isInteger(steps) || steps === 0) {
    return null;
  }
  const item = decor[index];
  const rotation = normalizeAngle(item.rotation + steps * DECOR_ROTATION_STEP);
  const next = replaceItem(decor, index, { ...item, rotation }, environment);
  return next && isDecorPoseAllowed(decor, next, index) ? next : null;
}

/**
 * Décor `decor` dont l'élément `index` a changé d'échelle de `steps` pas de
 * `DECOR_SCALE_STEP`, bornée à [`MIN_DECOR_SCALE`, `MAX_DECOR_SCALE`] ; la position est
 * rebornée au bac (l'emprise change avec l'échelle). `null` si le décor n'est pas éditable,
 * si l'indice n'existe pas, si `steps` n'est pas un entier non nul, si l'échelle est déjà à
 * la borne, ou si la nouvelle pose est refusée (`isDecorPoseAllowed`).
 */
export function scaleDecorItem(
  decor: readonly DecorItem[],
  index: number,
  steps: number,
  environment: Place,
): DecorItem[] | null {
  if (!editableIndex(decor, index, environment) || !Number.isInteger(steps) || steps === 0) {
    return null;
  }
  const item = decor[index];
  // Arrondi au millionième : pas de dérive après plusieurs pas (1,4 + 0,25 · 3).
  const raw = Math.round((item.scale + steps * DECOR_SCALE_STEP) * 1e6) / 1e6;
  const scale = Math.min(Math.max(raw, MIN_DECOR_SCALE), MAX_DECOR_SCALE);
  if (scale === item.scale) {
    return null;
  }
  const resized = { ...item, scale };
  const p = clampDecorPosition(resized, item.x, item.z, environment);
  if (!p) {
    return null;
  }
  const next = replaceItem(decor, index, { ...resized, x: p.x, z: p.z }, environment);
  return next && isDecorPoseAllowed(decor, next, index) ? next : null;
}
