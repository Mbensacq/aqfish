import { createPrng, deriveSeed } from '../core/random/prng';
import { DEFAULT_DAY_LENGTH_SECONDS } from './daylight';
import { decorElevation, plantBaseY, type DecorItem } from './decor';
import type { EnvironmentId } from './environment';
import { plantModel, type PlantForm } from './plant';
import { assertTimeStep } from './time-step';

/**
 * Pousse et taille des plantes à tige (issue #477, ADR 0110) : fonctions pures et
 * déterministes, sans horloge murale.
 *
 * Une plante `tall` d'un bac d'eau douce gagne de la hauteur avec le temps **simulé** (la
 * vitesse de simulation l'accélère donc d'elle-même), à un rythme tiré de sa graine, jusqu'à
 * un plafond : sa pointe reste un voxel sous la surface de l'eau. La taille (mode Soins)
 * la ramène à une hauteur de repli, jamais sous sa hauteur d'origine. Une plante arrivée au
 * plafond fait un peu d'ombre au fond du bac (`plantShade`).
 *
 * Règles (**approximations de jeu**, `docs/SOINS.md` § 12) : rythme, repli et ombre sont des
 * ordres de grandeur de jeu, non tirés d'une source.
 *
 * La pousse est un nombre réel de voxels, par plante, rangé dans l'eau du bac
 * (`WaterState.plantGrowth`, par graine de la plante, comme les algues) : enregistrée et
 * copiée avec elle. Le rendu n'en montre que la partie entière (paliers d'un voxel). Absente,
 * aucune pousse : la plante a sa hauteur d'origine.
 */

/** Pousse moyenne d'une plante, en voxels par jour simulé (`DEFAULT_DAY_LENGTH_SECONDS`). */
export const PLANT_GROWTH_VOXELS_PER_DAY = 6;

/** Vigueur d'une plante : facteur de sa pousse, tiré de sa graine dans cet intervalle. */
export const PLANT_VIGOR_MIN = 0.7;
export const PLANT_VIGOR_MAX = 1.3;

/** Écart gardé entre la pointe d'une plante au plafond et la surface de l'eau, en voxels. */
export const PLANT_SURFACE_MARGIN_VOXELS = 1;

/** Part de sa hauteur totale qu'une plante garde à la taille (hauteur de repli). */
export const PLANT_PRUNE_KEEP = 0.8;

/** Ombre d'une plante au plafond sur le fond du bac (part de lumière retirée). */
export const PLANT_SHADE_PER_PLANT = 0.04;
/** Ombre maximale des plantes sur le fond du bac. */
export const PLANT_SHADE_MAX = 0.12;

/** Pousse de chaque plante, en voxels, par graine (clé : la graine écrite en décimal). */
export type PlantGrowth = Readonly<Record<string, number>>;

/** Pousse modifiable en place (propriétaire unique : l'eau du monde). */
export type MutablePlantGrowth = Record<string, number>;

/** Sel du sous-générateur de la vigueur (distinct de ceux du modèle et des feuilles). */
const VIGOR_SALT = 0x6a70;

/** Environnements où les plantes poussent : bacs vitrés d'eau douce (ceux des algues). */
const GROWTH_ENVIRONMENTS: readonly EnvironmentId[] = ['tropical', 'paludarium', 'eaufroide'];

/** Vrai si les plantes à tige poussent dans un bac de l'environnement `environment`. */
export function hasPlantGrowth(environment: EnvironmentId): boolean {
  return GROWTH_ENVIRONMENTS.includes(environment);
}

/** Vrai si l'élément `item` est une plante qui pousse (forme `tall`). */
export function isGrowingPlant(item: DecorItem): boolean {
  return item.kind === 'plant' && item.form === 'tall';
}

/** Rythme de pousse d'une plante de graine `seed`, en voxels par seconde simulée. */
export function plantGrowthRate(seed: number): number {
  const vigor =
    PLANT_VIGOR_MIN +
    (PLANT_VIGOR_MAX - PLANT_VIGOR_MIN) * createPrng(deriveSeed(seed, VIGOR_SALT)).next();
  return (PLANT_GROWTH_VOXELS_PER_DAY * vigor) / DEFAULT_DAY_LENGTH_SECONDS;
}

/**
 * Pousse d'une plante de graine `seed` après `elapsed` secondes simulées depuis sa hauteur
 * d'origine (ou sa dernière taille à zéro), bornée à [0, `cap`] : 0 à `elapsed ≤ 0`.
 */
export function plantGrowthAt(seed: number, elapsed: number, cap: number): number {
  const grown = elapsed > 0 ? plantGrowthRate(seed) * elapsed : 0;
  return Math.min(Math.max(cap, 0), grown);
}

/** Hauteur d'origine et plafond d'une plante, mis en cache par élément et par surface. */
interface PlantLimits {
  readonly surface: number;
  /** Clé de la plante dans `PlantGrowth` (graine en décimal). */
  readonly key: string;
  /** Hauteur d'origine, en voxels. */
  readonly height: number;
  /** Pousse maximale, en voxels entiers (≥ 0). */
  readonly cap: number;
  readonly rate: number;
}

const LIMITS = new WeakMap<DecorItem, PlantLimits>();

/**
 * Hauteur d'origine (voxels), plafond de pousse (voxels entiers, ≥ 0) et rythme d'une plante
 * `tall` dont la surface de l'eau est à l'altitude `surface` (repère du bac) : sa pointe au
 * plafond reste `PLANT_SURFACE_MARGIN_VOXELS` sous la surface. Plafond nul si la plante
 * touche déjà la surface. Mis en cache (le modèle voxel coûte cher).
 */
export function plantLimits(item: DecorItem, surface: number): PlantLimits {
  const hit = LIMITS.get(item);
  if (hit && hit.surface === surface) {
    return hit;
  }
  const model = plantModel(item.seed, item.scale, item.form as PlantForm);
  const v = model.voxelSize;
  const base = plantBaseY(v) + decorElevation(item);
  const room = Math.floor((surface - base) / v + 1e-9) - PLANT_SURFACE_MARGIN_VOXELS;
  const limits: PlantLimits = {
    surface,
    key: String(item.seed),
    height: model.height,
    cap: Math.max(0, room - model.height),
    rate: plantGrowthRate(item.seed),
  };
  LIMITS.set(item, limits);
  return limits;
}

/** Pousse enregistrée d'une plante de graine `seed`, 0 si absente. */
export function growthOf(growth: PlantGrowth | undefined, seed: number): number {
  return growth?.[String(seed)] ?? 0;
}

/**
 * Pousse affichée d'une plante : la partie entière de sa pousse, bornée au plafond (après un
 * agrandissement d'échelle dans l'éditeur, une pousse peut dépasser le nouveau plafond).
 */
export function shownGrowth(
  growth: PlantGrowth | undefined,
  item: DecorItem,
  surface: number,
): number {
  const { cap, key } = plantLimits(item, surface);
  return Math.min(Math.floor(growth?.[key] ?? 0), cap);
}

/**
 * Fait pousser de `dt` secondes les plantes `tall` de `decor`, **en modifiant** `growth`
 * (créé au premier voxel de pousse) ; la surface de l'eau est à l'altitude `surface`.
 * Renvoie la pousse (même objet, ou `undefined` si rien ne pousse : aucun champ écrit).
 * @throws RangeError si `dt` n'est pas un pas de temps valide.
 */
export function stepPlantGrowthInPlace(
  growth: MutablePlantGrowth | undefined,
  decor: readonly DecorItem[],
  dt: number,
  surface: number,
): MutablePlantGrowth | undefined {
  assertTimeStep(dt);
  let out = growth;
  for (const item of decor) {
    if (!isGrowingPlant(item)) {
      continue;
    }
    const { cap, rate, key } = plantLimits(item, surface);
    const now = out?.[key] ?? 0;
    if (now >= cap) {
      continue;
    }
    out ??= {};
    out[key] = Math.min(cap, now + rate * dt);
  }
  return out;
}

/**
 * Pousse d'une plante de hauteur d'origine `height` (voxels) et de pousse `growth` après la
 * taille : sa hauteur totale ramenée à `PLANT_PRUNE_KEEP` d'elle-même (voxels entiers), jamais
 * sous la hauteur d'origine (pousse ≥ 0).
 */
export function prunedGrowth(height: number, growth: number): number {
  const total = height + Math.max(0, growth);
  return Math.max(0, Math.floor(total * PLANT_PRUNE_KEEP) - height);
}

/**
 * Taille la plante `item`, **en modifiant** `growth` : renvoie vrai si elle a raccourci (faux
 * pour une plante sans pousse visible, ou qui ne pousse pas). Une pousse nulle est retirée.
 */
export function prunePlantInPlace(
  growth: MutablePlantGrowth | undefined,
  item: DecorItem,
  surface: number,
): boolean {
  if (!growth || !isGrowingPlant(item)) {
    return false;
  }
  const { key, height } = plantLimits(item, surface);
  const now = growth[key] ?? 0;
  const next = prunedGrowth(height, Math.floor(now));
  if (next >= Math.floor(now)) {
    return false;
  }
  if (next === 0) {
    delete growth[key];
  } else {
    growth[key] = next;
  }
  return true;
}

/**
 * Lumière gardée au fond du bac, dans [1 − `PLANT_SHADE_MAX`, 1] : chaque plante `tall` à son
 * plafond (plafond non nul) en retire `PLANT_SHADE_PER_PLANT`. Exactement 1 sans pousse.
 */
export function plantShade(
  growth: PlantGrowth | undefined,
  decor: readonly DecorItem[],
  surface: number,
): number {
  if (!growth) {
    return 1;
  }
  let shaded = 0;
  for (const item of decor) {
    if (isGrowingPlant(item)) {
      const { cap, key } = plantLimits(item, surface);
      if (cap > 0 && (growth[key] ?? 0) >= cap) {
        shaded++;
      }
    }
  }
  return 1 - Math.min(PLANT_SHADE_MAX, PLANT_SHADE_PER_PLANT * shaded);
}

/** Pousse maximale admise à la lecture d'une sauvegarde, en voxels. */
export const MAX_SAVED_PLANT_GROWTH = 1000;

/** Résultat de `readPlantGrowth`. */
export type ReadPlantGrowthResult =
  | { readonly ok: true; readonly growth: MutablePlantGrowth }
  | { readonly ok: false; readonly error: string };

/**
 * Lit la pousse des plantes d'une sauvegarde : un objet dont les clés sont des graines
 * (entiers écrits en décimal) et les valeurs des nombres dans [0, `MAX_SAVED_PLANT_GROWTH`].
 * Les pousses nulles sont omises de la copie.
 */
export function readPlantGrowth(value: unknown): ReadPlantGrowthResult {
  const error = {
    ok: false,
    error: `eau : plantGrowth doit associer des graines à des nombres dans [0, ${MAX_SAVED_PLANT_GROWTH}]`,
  } as const;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return error;
  }
  const growth: MutablePlantGrowth = {};
  for (const [key, g] of Object.entries(value as Record<string, unknown>)) {
    if (
      !/^\d{1,10}$/.test(key) ||
      typeof g !== 'number' ||
      !(g >= 0 && g <= MAX_SAVED_PLANT_GROWTH)
    ) {
      return error;
    }
    if (g > 0) {
      growth[key] = g;
    }
  }
  return { ok: true, growth };
}
