import type { Fish } from './swimmer';
import { SPECIES, type SpeciesId } from './species';
import type { TankDimensions } from './tank';

/**
 * Tapoter la vitre (mode immersif, #346, ADR 0092) : les poissons proches du point touché
 * réagissent selon leur espèce, par la fuite (demi-tour et pointe de vitesse) ou par la
 * curiosité (cap vers la vitre, vitesse de croisière). La réaction est une impulsion : elle
 * modifie le cap, l'inclinaison et la vitesse une fois, puis la nage habituelle reprend
 * (`stepFish`), qui ramène la vitesse dans ses bornes et contourne les vitres.
 *
 * Aucun tirage : la réaction ne consomme aucun générateur, donc un monde qu'on ne tapote pas
 * avance exactement comme avant, et deux mondes de même graine tapotés aux mêmes pas restent
 * identiques. Valeurs de jeu (approximations, pas des mesures).
 */

/** Réaction d'une espèce au tapotement : fuite, curiosité, ou aucune (`null`). */
export type TapReaction = 'fuite' | 'curiosite';

/**
 * Réaction de chaque espèce. Les espèces qui marchent ou sautent (axolotl, grenouille,
 * triton) ont leur propre machine à états : elles ne réagissent pas (`null`).
 */
export const TAP_REACTIONS: Readonly<Record<SpeciesId, TapReaction | null>> = {
  neon: 'fuite',
  guppy: 'curiosite',
  corydora: 'fuite',
  koi: 'curiosite',
  axolotl: null,
  grenouille: null,
  triton: null,
  clown: 'curiosite',
  chirurgien: 'curiosite',
  rasbora: 'fuite',
  tetra: 'fuite',
  kuhli: 'fuite',
  gourami: 'curiosite',
  platy: 'curiosite',
  danio: 'fuite',
  ancistrus: 'fuite',
  otocinclus: 'fuite',
  braise: 'fuite',
  molly: 'curiosite',
  // Gourami miel : lent et vite intimidé (Seriously Fish), d'où la fuite (approximation de jeu).
  miel: 'fuite',
  chromis: 'fuite',
  // Gobie : rentre dans son terrier au moindre danger ; gramma : se réfugie dans les
  // anfractuosités (FishBase) ; les deux fuient (approximation de jeu).
  gobie: 'fuite',
  gramma: 'fuite',
  // Crevette nettoyeuse : marcheuse, sans réaction au tapotement (comme l'axolotl) ;
  // blennie : rentre dans son trou (approximation de jeu).
  crevette: null,
  blennie: 'fuite',
};

/** Portée du tapotement, en mètres simulés, autour du point touché sur la vitre. */
export const TAP_RADIUS = 0.15;

/** Part de l'inclinaison maximale de l'espèce prise par la réaction (cap surtout horizontal). */
export const TAP_PITCH_RATIO = 0.5;

/** Distance horizontale sous laquelle la direction est jugée indéfinie, en mètres. */
const DIRECTION_EPSILON = 1e-6;

/** Point de la vitre avant, dans le repère du bac (mètres). */
export interface GlassPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Point de la vitre avant sous la fraction d'écran (`u`, `v`) ∈ [0, 1]² (0, 0 : coin haut
 * gauche), pour un bac `dimensions` dont la vitre avant remplit l'écran (mode immersif) :
 * `x` ∈ [−w/2, w/2], `y` ∈ [0, h], `z` = d/2. Fractions bornées à [0, 1] ; `null` si l'une
 * n'est pas finie.
 */
export function glassPoint(dimensions: TankDimensions, u: number, v: number): GlassPoint | null {
  if (!Number.isFinite(u) || !Number.isFinite(v)) {
    return null;
  }
  const cu = Math.min(1, Math.max(0, u));
  const cv = Math.min(1, Math.max(0, v));
  return {
    x: (cu - 0.5) * dimensions.width,
    y: (1 - cv) * dimensions.height,
    z: dimensions.depth / 2,
  };
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/**
 * Fait réagir **en place** les poissons de `fishes` à moins de `radius` mètres du point
 * `tap` ; renvoie le nombre de poissons qui ont réagi. Fuite : cap opposé au point, vitesse
 * maximale de l'espèce ; curiosité : cap vers le point, vitesse de croisière. Un poisson
 * exactement sous le point (direction horizontale indéfinie) fuit vers le fond du bac et,
 * curieux, garde son cap. Aucun tirage. Point ou portée non finis, portée négative : aucun
 * effet.
 */
export function tapGlassInPlace(
  fishes: readonly Mutable<Fish>[],
  tap: GlassPoint,
  radius: number = TAP_RADIUS,
): number {
  if (
    !Number.isFinite(tap.x) ||
    !Number.isFinite(tap.y) ||
    !Number.isFinite(tap.z) ||
    !Number.isFinite(radius) ||
    radius < 0
  ) {
    return 0;
  }
  const radius2 = radius * radius;
  let reacted = 0;
  for (const fish of fishes) {
    const reaction = TAP_REACTIONS[fish.species];
    if (reaction === null) {
      continue;
    }
    const dx = fish.x - tap.x;
    const dy = fish.y - tap.y;
    const dz = fish.z - tap.z;
    if (dx * dx + dy * dy + dz * dz > radius2) {
      continue;
    }
    const def = SPECIES[fish.species];
    const dh = Math.sqrt(dx * dx + dz * dz);
    const pitchLimit = def.maxPitch * TAP_PITCH_RATIO;
    if (reaction === 'fuite') {
      // Vers l'arrière du bac (−z) si la direction horizontale est indéfinie.
      fish.yaw = dh > DIRECTION_EPSILON ? Math.atan2(dz, dx) : -Math.PI / 2;
      fish.pitch = clamp(Math.atan2(dy, Math.max(dh, DIRECTION_EPSILON)), pitchLimit);
      fish.speed = def.maxSpeed;
    } else {
      if (dh > DIRECTION_EPSILON) {
        fish.yaw = Math.atan2(-dz, -dx);
        fish.pitch = clamp(Math.atan2(-dy, dh), pitchLimit);
      }
      fish.speed = def.cruiseSpeed;
    }
    reacted++;
  }
  return reacted;
}

function clamp(value: number, limit: number): number {
  return Math.min(limit, Math.max(-limit, value));
}
