import type { ScraperRay } from './algae';
import { isLanded, type FoodPellet } from './food';
import type { Box3 } from './tank';

/**
 * Siphon et eau neuve de la séance d'entretien guidée (issue #605, lot 2 de #593). Fonctions
 * pures, sans hasard ni horloge.
 *
 * Siphon : on promène le tuyau sur le sol ; chaque point du geste qui tombe dans le bac retire
 * `SIPHON_SHARE_PER_POINT` de l'eau (jusqu'à `MAX_SIPHON_SHARE`) et les granulés posés à moins
 * de `SIPHON_REACH` (la nourriture non mangée : ce sont les seuls dépôts simulés, l'encrassement
 * du sol arrive avec #607). L'eau retirée ne change pas les concentrations : c'est l'eau neuve
 * qui dilue (`changeWaterInPlace` avec la part versée).
 *
 * Eau neuve : on verse au seau (`BUCKET_SHARE` par seau) jusqu'à remplacer l'eau retirée ; un
 * seau sans conditionneur apporte le chlore du robinet (`sim/water-conditioner.ts`), une eau
 * plus froide ou plus chaude que celle du bac de plus de `TEMPERATURE_GAP_WARNING` est signalée.
 */

/** Part de l'eau retirée par point du geste (≈ 6 px, `strokePoints`). Approximation de jeu. */
export const SIPHON_SHARE_PER_POINT = 0.002;
/**
 * Plafond de l'eau retirée en une séance : on ne vide pas un bac habité. Approximation de jeu.
 */
export const MAX_SIPHON_SHARE = 0.8;
/**
 * Part au-delà de laquelle le siphon avertit : UF/IFAS conseille de changer 25 à 50 % de l'eau
 * (`docs/SOINS.md` § 14) ; plus, c'est un choc de chlore, de température et de pH.
 */
export const SIPHON_WARNING_SHARE = 0.5;
/** Distance au tuyau sous laquelle un granulé posé est aspiré, en mètres. Approximation de jeu. */
export const SIPHON_REACH = 0.03;
/** Part de l'eau du bac apportée par un seau. Approximation de jeu. */
export const BUCKET_SHARE = 0.1;
/** Écart de température entre le seau et le bac signalé, en °C. Approximation de jeu. */
export const TEMPERATURE_GAP_WARNING = 2;

/** Point du sol visé par le tuyau (repère du bac). */
export interface FloorPoint {
  readonly x: number;
  readonly z: number;
}

/**
 * Point du sol visé par le rayon `ray` dans l'eau `water` : là où il coupe le fond s'il le
 * coupe dans le bac ; sinon, l'aplomb du point où il entre dans l'eau (vue de côté : le tuyau
 * descend sous le point visé). `null` si le rayon manque l'eau ou n'est pas fini.
 */
export function siphonFloorPoint(ray: ScraperRay, water: Box3): FloorPoint | null {
  const [ox, oy, oz] = ray.origin;
  const [dx, dy, dz] = ray.direction;
  if (![ox, oy, oz, dx, dy, dz].every(Number.isFinite)) {
    return null;
  }
  if (dy < 0) {
    const t = (water.minY - oy) / dy;
    const x = ox + dx * t;
    const z = oz + dz * t;
    if (t >= 0 && inside(x, z, water)) {
      return { x, z };
    }
  }
  // Entrée dans la boîte de l'eau (méthode des tranches).
  let near = 0;
  let far = Infinity;
  for (const [o, d, min, max] of [
    [ox, dx, water.minX, water.maxX],
    [oy, dy, water.minY, water.maxY],
    [oz, dz, water.minZ, water.maxZ],
  ] as const) {
    if (d === 0) {
      if (o < min || o > max) {
        return null;
      }
      continue;
    }
    const a = (min - o) / d;
    const b = (max - o) / d;
    near = Math.max(near, Math.min(a, b));
    far = Math.min(far, Math.max(a, b));
  }
  if (near > far) {
    return null;
  }
  return {
    x: clamp(ox + dx * near, water.minX, water.maxX),
    z: clamp(oz + dz * near, water.minZ, water.maxZ),
  };
}

/** Vrai si un bac de `liters` litres contient de l'eau à siphonner (volume positif et fini). */
export function hasWaterToSiphon(liters: number): boolean {
  return liters > 0 && Number.isFinite(liters);
}

/**
 * Part de l'eau retirée après `points` points de siphon de plus, en partant de `share` :
 * plafonnée à `MAX_SIPHON_SHARE`. Bac sans eau (`hasWater` faux, voir `hasWaterToSiphon`) : 0.
 */
export function siphonedShare(share: number, points: number, hasWater: boolean): number {
  if (!hasWater) {
    return 0;
  }
  const start = Number.isFinite(share) ? clamp(share, 0, MAX_SIPHON_SHARE) : 0;
  const added = Number.isFinite(points) && points > 0 ? Math.floor(points) : 0;
  return Math.min(MAX_SIPHON_SHARE, start + added * SIPHON_SHARE_PER_POINT);
}

/** Pourcentage entier affiché par une jauge de part `share` (0 à 100). */
export function sharePercent(share: number): number {
  return Number.isFinite(share) ? Math.round(clamp(share, 0, 1) * 100) : 0;
}

/** Vrai si la part retirée dépasse le seuil conseillé (`SIPHON_WARNING_SHARE`). */
export function siphonWarning(share: number): boolean {
  return share > SIPHON_WARNING_SHARE;
}

/** Consigne de l'étape « siphon » pour la part retirée `share`. */
export function siphonStepHint(share: number): string {
  const percent = sharePercent(share);
  if (percent === 0) {
    return 'Promenez le tuyau sur le sol : il aspire les restes et un peu d’eau.';
  }
  if (siphonWarning(share)) {
    return `${percent} % de l’eau retirée : c’est trop, au-delà de 50 % le changement choque les poissons.`;
  }
  return `${percent} % de l’eau retirée (25 à 50 % conseillés).`;
}

/**
 * Indices des granulés de `food` posés au sol à moins de `SIPHON_REACH` (dans le plan) de l'un
 * des points `points`, dans l'ordre de `food`. Les granulés qui flottent ou coulent restent.
 */
export function siphonedFood(food: readonly FoodPellet[], points: readonly FloorPoint[]): number[] {
  const reach = SIPHON_REACH * SIPHON_REACH;
  const touched: number[] = [];
  food.forEach((pellet, index) => {
    if (
      isLanded(pellet) &&
      points.some((p) => (pellet.x - p.x) ** 2 + (pellet.z - p.z) ** 2 <= reach)
    ) {
      touched.push(index);
    }
  });
  return touched;
}

/**
 * Part versée après un seau de plus, en partant de `poured` : jamais plus que l'eau retirée
 * `siphoned` (le bac est plein).
 */
export function pouredShare(poured: number, siphoned: number): number {
  const limit = Number.isFinite(siphoned) ? clamp(siphoned, 0, MAX_SIPHON_SHARE) : 0;
  const start = Number.isFinite(poured) ? clamp(poured, 0, limit) : 0;
  return Math.min(limit, start + BUCKET_SHARE);
}

/** Avertissements de l'eau neuve : chlore (conditionneur oublié) et écart de température. */
export interface FreshWaterWarnings {
  /** Vrai si le seau n'a pas reçu de conditionneur. */
  readonly chlorine: boolean;
  /** Écart de température seau − bac, en °C, arrondi au dixième ; 0 sous le seuil. */
  readonly temperatureGap: number;
}

/** Avertissements d'un seau à `bucket` °C dans un bac à `tank` °C. */
export function freshWaterWarnings(
  conditioner: boolean,
  bucket: number,
  tank: number,
): FreshWaterWarnings {
  const gap = Number.isFinite(bucket) && Number.isFinite(tank) ? bucket - tank : 0;
  return {
    chlorine: !conditioner,
    temperatureGap: Math.abs(gap) > TEMPERATURE_GAP_WARNING ? Math.round(gap * 10) / 10 : 0,
  };
}

/** Phrases des avertissements (vide : rien à signaler). */
export function freshWaterWarningTexts(warnings: FreshWaterWarnings): string[] {
  const texts: string[] = [];
  if (warnings.chlorine) {
    texts.push('Sans conditionneur, le chlore du robinet passe dans le bac.');
  }
  const gap = warnings.temperatureGap;
  if (gap !== 0) {
    const degrees = String(Math.abs(gap)).replace('.', ',');
    texts.push(
      `Eau ${gap < 0 ? 'plus froide' : 'plus chaude'} que le bac de ${degrees} °C : un choc pour les poissons.`,
    );
  }
  return texts;
}

/** Consigne de l'étape « eau neuve » : part versée `poured` sur l'eau retirée `siphoned`. */
export function freshWaterStepHint(poured: number, siphoned: number): string {
  if (!(siphoned > 0)) {
    return 'Aucune eau retirée : rien à remplacer, passez cette étape.';
  }
  if (poured >= siphoned) {
    return 'Le bac est plein : l’eau retirée est remplacée.';
  }
  return `Versez l’eau neuve au seau : ${sharePercent(poured)} % sur ${sharePercent(siphoned)} %.`;
}

function inside(x: number, z: number, water: Box3): boolean {
  return x >= water.minX && x <= water.maxX && z >= water.minZ && z <= water.maxZ;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
