import { keepInShape } from './pond-shape';
import { ANCISTRUS, CORYDORA, DANIO, OTOCINCLUS, XIPHO, type SpeciesId } from './species';
import type { Fish, SwimBounds } from './swimmer';

/**
 * Courant d'eau (issue #460, ADR 0108) : un biotope de rivière. Le champ est **uniforme** dans
 * le volume d'eau : une direction horizontale, propre à l'environnement
 * (`Environment.current`), et une force réglée par bac (`World.current`), coupée par défaut.
 *
 * - Les poissons de rivière (`RIVER_SPECIES`) se tournent face au courant (rhéotaxie) et
 *   gagnent un peu vers l'amont ; les autres nageurs sont légèrement emportés vers l'aval.
 *   Les marcheurs du fond et les amphibiens ne sont pas touchés.
 * - Les particules suivent le courant : bulles, granulés qui flottent ou coulent, feuilles
 *   mortes (`sim/bubbles.ts`, `sim/food.ts`, `sim/floating-leaves.ts`).
 *
 * Aucun tirage : le courant ne consomme aucun générateur. Coupé, aucun calcul n'est fait et
 * la simulation est exactement celle d'avant (captures identiques à l'octet).
 */

/** Forces du courant, dans l'ordre du réglage. */
export const CURRENT_LEVELS = ['coupe', 'doux', 'fort'] as const;

/** Force du courant d'un bac. */
export type CurrentLevel = (typeof CURRENT_LEVELS)[number];

/** Libellés affichés des forces. */
export const CURRENT_LEVEL_LABELS: Readonly<Record<CurrentLevel, string>> = {
  coupe: 'coupé',
  doux: 'doux',
  fort: 'fort',
};

/** Vitesse de l'eau de chaque force, en m/s (rivière calme à vive, à l'échelle d'un bac). */
export const CURRENT_SPEEDS: Readonly<Record<CurrentLevel, number>> = {
  coupe: 0,
  doux: 0.03,
  fort: 0.07,
};

/**
 * Champ de courant d'un environnement : direction horizontale (angle en radians dans le plan
 * X-Z, 0 vers +X, π/2 vers +Z) et force par défaut.
 */
export interface CurrentField {
  readonly direction: number;
  readonly level: CurrentLevel;
}

/** Champ sans courant : celui de tous les environnements par défaut. */
export const NO_CURRENT: CurrentField = Object.freeze({ direction: 0, level: 'coupe' });

/**
 * Espèces de rivière : eaux vives de leur milieu d'origine (`docs/ESPECES.md`). Danio zébré,
 * xipho, ancistrus, otocinclus et corydoras vivent dans des ruisseaux et rivières à courant.
 */
export const RIVER_SPECIES: readonly SpeciesId[] = [
  DANIO.id,
  XIPHO.id,
  ANCISTRUS.id,
  OTOCINCLUS.id,
  CORYDORA.id,
];

/** Part de la vitesse de l'eau qui emporte un nageur qui n'est pas de rivière. */
export const DRIFT_SHARE = 0.3;
/** Part de la vitesse de l'eau qu'un poisson de rivière gagne vers l'amont. */
export const UPSTREAM_SHARE = 0.15;
/** Vitesse de virage vers l'amont d'un poisson de rivière au courant fort, en rad/s. */
export const RHEOTAXIS_TURN = 1.2;

/** Vrai si `value` est une force de courant. */
export function isCurrentLevel(value: unknown): value is CurrentLevel {
  return (CURRENT_LEVELS as readonly unknown[]).includes(value);
}

/** Vrai si l'espèce vit en eau courante (`RIVER_SPECIES`). */
export function isRiverSpecies(species: SpeciesId): boolean {
  return RIVER_SPECIES.includes(species);
}

/** Force suivante du réglage (coupé → doux → fort → coupé). */
export function nextCurrentLevel(level: CurrentLevel): CurrentLevel {
  return CURRENT_LEVELS[(CURRENT_LEVELS.indexOf(level) + 1) % CURRENT_LEVELS.length];
}

/** Vitesse horizontale de l'eau (m/s). */
export interface CurrentVelocity {
  x: number;
  z: number;
}

/**
 * Écrit dans `out` la vitesse de l'eau du champ `field` à la force `level` et renvoie `out`.
 * Coupé : exactement (0, 0).
 */
export function currentVelocity(
  field: CurrentField,
  level: CurrentLevel,
  out: CurrentVelocity,
): CurrentVelocity {
  const speed = CURRENT_SPEEDS[level];
  if (speed === 0) {
    out.x = 0;
    out.z = 0;
    return out;
  }
  out.x = Math.cos(field.direction) * speed;
  out.z = Math.sin(field.direction) * speed;
  return out;
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/**
 * Courant sur un nageur, **en modifiant** `fish`, après sa nage du pas (`stepFish`) : un
 * poisson de rivière vire vers l'amont (au plus `RHEOTAXIS_TURN` rad/s, en proportion de la
 * force) et gagne `UPSTREAM_SHARE` de la vitesse de l'eau vers l'amont ; un autre est emporté
 * de `DRIFT_SHARE` vers l'aval. Le poisson reste dans la boîte `hard` et la forme du bassin.
 * Sans allocation ni tirage ; sans effet pour une eau immobile.
 */
export function applyCurrentInPlace(
  fish: Mutable<Fish>,
  vx: number,
  vz: number,
  dt: number,
  river: boolean,
  bounds: SwimBounds,
  wallMargin: number,
): void {
  const speed = Math.sqrt(vx * vx + vz * vz);
  if (speed === 0) {
    return;
  }
  if (river) {
    const upstream = Math.atan2(-vz, -vx);
    const maxTurn = RHEOTAXIS_TURN * Math.min(1, speed / CURRENT_SPEEDS.fort) * dt;
    const delta = wrap(upstream - fish.yaw);
    fish.yaw = wrap(fish.yaw + Math.max(-maxTurn, Math.min(maxTurn, delta)));
    fish.x -= vx * UPSTREAM_SHARE * dt;
    fish.z -= vz * UPSTREAM_SHARE * dt;
  } else {
    fish.x += vx * DRIFT_SHARE * dt;
    fish.z += vz * DRIFT_SHARE * dt;
  }
  const { hard } = bounds;
  fish.x = Math.min(hard.maxX, Math.max(hard.minX, fish.x));
  fish.z = Math.min(hard.maxZ, Math.max(hard.minZ, fish.z));
  if (bounds.outline !== undefined) {
    keepInShape(fish, bounds.outline, wallMargin);
  }
}

/** Ramène un angle dans (-π, π]. */
function wrap(angle: number): number {
  let a = angle % (2 * Math.PI);
  if (a <= -Math.PI) {
    a += 2 * Math.PI;
  } else if (a > Math.PI) {
    a -= 2 * Math.PI;
  }
  return a;
}
