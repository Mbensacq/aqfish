import { createPrng, deriveSeed } from '../core/random/prng';
import { validateDecorItem, type DecorItem } from './decor';
import { environmentById, type EnvironmentId } from './environment';
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

export const DECOR_CHOICE_IDS = ['rock', 'tall', 'tuft'] as const;
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
export function canPlaceDecorAt(x: number, z: number, environment: EnvironmentId): boolean {
  const { width, depth } = environmentById(environment).dimensions;
  return (
    Number.isFinite(x) &&
    Number.isFinite(z) &&
    Math.abs(x) <= width / 2 - DECOR_EDGE_MARGIN &&
    Math.abs(z) <= depth / 2 - DECOR_EDGE_MARGIN
  );
}

/**
 * Décor `decor` augmenté d'un élément `choice` posé en (x, z), à l'échelle 1 et tourné d'un
 * angle tiré de sa graine (`nextDecorSeed`). `null` (rien n'est ajouté) si le décor n'est pas
 * éditable, s'il est plein (`MAX_DECOR_ITEMS`), si le point est hors des bornes
 * (`canPlaceDecorAt`) ou si l'élément obtenu est invalide (`validateDecorItem`).
 */
export function addDecorItem(
  decor: readonly DecorItem[],
  choice: DecorChoiceId,
  x: number,
  z: number,
  worldSeed: number,
  environment: EnvironmentId,
): DecorItem[] | null {
  if (
    !isDecorEditable(environment) ||
    !isDecorChoiceId(choice) ||
    decor.length >= MAX_DECOR_ITEMS ||
    !canPlaceDecorAt(x, z, environment)
  ) {
    return null;
  }
  const seed = nextDecorSeed(worldSeed, decor);
  const rotation = createPrng(seed).next() * 2 * Math.PI;
  const { kind, form } = DECOR_CATALOG[choice];
  const item: DecorItem =
    form === undefined
      ? { kind, x, z, rotation, scale: 1, seed }
      : { kind, x, z, rotation, scale: 1, seed, form };
  if (validateDecorItem(item, environmentById(environment).dimensions).length > 0) {
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
  const rebuilt = createWorld(world.seed, [], [], decor, world.environment);
  world.decor = rebuilt.decor;
  world.obstacles = rebuilt.obstacles;
}

/** Copie de `world` dont le décor est `decor` (`setDecorInPlace`) ; `world` n'est pas modifié. */
export function withDecor(world: World, decor: readonly DecorItem[]): World {
  const copy: MutableWorld = { ...world };
  setDecorInPlace(copy, decor);
  return copy;
}
