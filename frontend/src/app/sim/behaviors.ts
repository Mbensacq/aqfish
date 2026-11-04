import { deriveSeed } from '../core/random/prng';
import { isLanded, type FoodPellet } from './food';
import type { Vec3 } from './flocking';
import { obstacleDistance, type Obstacle } from './obstacles';
import type { SpeciesId } from './species';
import type { Fish, SwimBounds } from './swimmer';

/**
 * Comportements propres à l'espèce (issue #427, ADR 0106) : broutage des vitres, fouille du
 * sable, défense d'un territoire.
 *
 * Chaque comportement suit un **calendrier sans état** : le temps simulé est découpé en
 * fenêtres de `period` secondes ; dans chaque fenêtre, un épisode de durée et de début tirés
 * du hachage (graine du monde, identifiant du poisson, rang de la fenêtre). Rien n'est ajouté
 * à l'état du monde (sauvegardes inchangées) et aucun tirage n'est pris au générateur du
 * poisson : même graine et même état donnent le même épisode, et une espèce sans comportement
 * nage exactement comme avant, au bit près.
 *
 * Pendant un épisode, le comportement donne au poisson un **point visé** (`behaviorTarget`),
 * suivi par `stepFish` comme un granulé ; la nourriture en vue l'emporte toujours. Le rendu
 * ajoute un geste (`behaviorGesture`) atténué par « Réduire les mouvements » (ADR 0098) : la
 * simulation, elle, ne voit jamais l'option.
 *
 * Valeurs de jeu (approximations, pas des mesures).
 */

/** Comportements de la simulation. */
export type BehaviorKind = 'broutage' | 'fouille' | 'territoire';

/** Calendrier d'un comportement. */
export interface BehaviorParams {
  readonly kind: BehaviorKind;
  /** Longueur d'une fenêtre, en secondes (au plus un épisode par fenêtre). */
  readonly period: number;
  /** Durée d'un épisode, tirée dans [minDuration, maxDuration], en secondes (≤ `period`). */
  readonly minDuration: number;
  readonly maxDuration: number;
}

const FOUILLE: BehaviorParams = Object.freeze({
  kind: 'fouille',
  period: 12,
  minDuration: 5,
  maxDuration: 9,
});
const BROUTAGE: BehaviorParams = Object.freeze({
  kind: 'broutage',
  period: 40,
  minDuration: 12,
  maxDuration: 24,
});
const TERRITOIRE: BehaviorParams = Object.freeze({
  kind: 'territoire',
  period: 15,
  minDuration: 4,
  maxDuration: 8,
});

/**
 * Espèces concernées : corydora (fouille), ancistrus et otocinclus (broutage), gourami et
 * gramma (territoire). Les autres n'ont aucun comportement : leur nage ne change pas.
 */
export const SPECIES_BEHAVIORS: Readonly<Partial<Record<SpeciesId, BehaviorParams>>> =
  Object.freeze({
    corydora: FOUILLE,
    ancistrus: BROUTAGE,
    otocinclus: BROUTAGE,
    gourami: TERRITOIRE,
    gramma: TERRITOIRE,
  });

/** Comportement de l'espèce, ou `null`. */
export function speciesBehavior(species: SpeciesId): BehaviorParams | null {
  return SPECIES_BEHAVIORS[species] ?? null;
}

const UINT32_RANGE = 4294967296;
/** Sels des tirages d'une fenêtre (début, durée) et du territoire. */
const START_SALT = 0x5ea1;
const DURATION_SALT = 0xd0a7;
const HOME_SALT = 0x7e77;

function unit(h: number): number {
  return h / UINT32_RANGE;
}

/**
 * Temps restant de l'épisode en cours au temps `time`, en secondes ; 0 hors épisode (ou pour
 * un temps négatif ou non fini). Pur : ne dépend que de la graine, de l'identifiant et du temps.
 */
export function boutRemaining(
  params: BehaviorParams,
  seed: number,
  fishId: number,
  time: number,
): number {
  if (!Number.isFinite(time) || time < 0) {
    return 0;
  }
  const window = Math.floor(time / params.period);
  const base = deriveSeed(deriveSeed(seed, fishId), window % UINT32_RANGE);
  const duration =
    params.minDuration +
    unit(deriveSeed(base, DURATION_SALT)) * (params.maxDuration - params.minDuration);
  const start = unit(deriveSeed(base, START_SALT)) * (params.period - duration);
  const local = time - window * params.period;
  return local >= start && local < start + duration ? start + duration - local : 0;
}

/** Vrai si au moins un granulé est posé (sable ou rocher) : condition de la fouille. */
export function hasLandedFood(food: readonly FoodPellet[]): boolean {
  for (const pellet of food) {
    if (isLanded(pellet)) {
      return true;
    }
  }
  return false;
}

/**
 * Comportement en cours d'un poisson (épisode actif, et granulé posé pour la fouille), ou
 * `null`. Lu par le rendu pour le geste ; la simulation y ajoute les conditions de cible.
 */
export function activeBehavior(
  fish: Fish,
  seed: number,
  time: number,
  landedFood: boolean,
): BehaviorKind | null {
  const params = SPECIES_BEHAVIORS[fish.species];
  if (params === undefined || (params.kind === 'fouille' && !landedFood)) {
    return null;
  }
  return boutRemaining(params, seed, fish.id, time) > 0 ? params.kind : null;
}

/** Distance du point visé devant le museau pendant la fouille, en mètres. */
export const FORAGE_AHEAD = 0.04;
/** Avance du point visé le long de la vitre pendant le broutage, en mètres. */
export const GRAZE_AHEAD = 0.05;
/**
 * Hauteur du broutage sur la vitre : part de la hauteur de `hard`, tirée dans cette plage, puis
 * bornée par la hauteur préférée de l'espèce.
 */
export const GRAZE_MIN_HEIGHT = 0;
export const GRAZE_MAX_HEIGHT = 0.6;
/** Rayon du territoire autour de son centre, en mètres. */
export const TERRITORY_RADIUS = 0.15;
/** Le défenseur cesse de charger à cette distance de l'intrus (en longueurs de corps). */
export const CHARGE_STOP_LENGTHS = 1.5;
/** Essais pour placer le centre du territoire hors des obstacles. */
const HOME_TRIES = 8;
/** Écart minimal entre le centre du territoire et un obstacle, en plus de `wallMargin`. */
const HOME_CLEARANCE = 0.02;

const SCRATCH_NORMAL = { x: 0, y: 0, z: 0 };

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/**
 * Centre du territoire d'un poisson : point de sa zone de naissance (`bounds.spawn`) tiré de
 * la graine et de l'identifiant, à `wallMargin + 2 cm` au moins de tout obstacle ; `null` si
 * aucun des essais n'y parvient (bac encombré), ou si la zone est vide.
 */
export function territoryHome(
  seed: number,
  fishId: number,
  bounds: SwimBounds,
  obstacles: readonly Obstacle[],
  margin: number,
  out: Vec3,
): Vec3 | null {
  const box = bounds.spawn;
  if (!(box.maxX >= box.minX && box.maxY >= box.minY && box.maxZ >= box.minZ)) {
    return null;
  }
  let h = deriveSeed(deriveSeed(seed, fishId), HOME_SALT);
  for (let attempt = 0; attempt < HOME_TRIES; attempt++) {
    const hx = deriveSeed(h, 1);
    const hy = deriveSeed(h, 2);
    const hz = deriveSeed(h, 3);
    h = deriveSeed(h, 4);
    const x = box.minX + unit(hx) * (box.maxX - box.minX);
    const y = box.minY + unit(hy) * (box.maxY - box.minY);
    const z = box.minZ + unit(hz) * (box.maxZ - box.minZ);
    let clear = true;
    for (const o of obstacles) {
      if (obstacleDistance(o, x, y, z, SCRATCH_NORMAL) < margin + HOME_CLEARANCE) {
        clear = false;
        break;
      }
    }
    if (clear) {
      out.x = x;
      out.y = y;
      out.z = z;
      return out;
    }
  }
  return null;
}

/** Contexte d'un pas, commun à tous les poissons. */
export interface BehaviorContext {
  readonly seed: number;
  readonly time: number;
  /** Au moins un granulé posé (`hasLandedFood`). */
  readonly landedFood: boolean;
  /** Tous les poissons du bac (intrus possibles), positions du début du pas. */
  readonly fishes: readonly Fish[];
  readonly obstacles: readonly Obstacle[];
}

/**
 * Point visé par le comportement de `fish` au pas courant, écrit dans `out`, ou `null` (pas de
 * comportement, hors épisode, ou aucune cible) :
 *
 * - **fouille** : granulé posé dans le bac ; point du sable devant le museau (le corydora
 *   descend et avance le nez au sol) ;
 * - **broutage** : point de la vitre la plus proche, à une hauteur tirée pour l'épisode,
 *   avancé de `GRAZE_AHEAD` le long de la vitre (sens tiré lui aussi) ; aucune cible dans un
 *   bassin non rectangulaire (`bounds.outline`) ;
 * - **territoire** : retour vers le centre hors du rayon, à tout moment ; pendant un épisode,
 *   charge vers l'intrus (autre espèce) le plus proche du centre dans le rayon, arrêtée à
 *   `CHARGE_STOP_LENGTHS` longueurs de lui. Jamais de contact voulu ni de dégât : la santé
 *   n'est pas touchée.
 */
export function behaviorTarget(
  fish: Fish,
  bodyLength: number,
  wallMargin: number,
  bounds: SwimBounds,
  ctx: BehaviorContext,
  out: Vec3,
): Vec3 | null {
  const params = SPECIES_BEHAVIORS[fish.species];
  if (params === undefined) {
    return null;
  }
  const { hard } = bounds;
  switch (params.kind) {
    case 'fouille': {
      if (!ctx.landedFood || boutRemaining(params, ctx.seed, fish.id, ctx.time) <= 0) {
        return null;
      }
      out.x = clamp(fish.x + Math.cos(fish.yaw) * FORAGE_AHEAD, hard.minX, hard.maxX);
      out.y = hard.minY;
      out.z = clamp(fish.z + Math.sin(fish.yaw) * FORAGE_AHEAD, hard.minZ, hard.maxZ);
      return out;
    }
    case 'broutage': {
      if (bounds.outline !== undefined || boutRemaining(params, ctx.seed, fish.id, ctx.time) <= 0) {
        return null;
      }
      const window = Math.floor(ctx.time / params.period);
      const h = deriveSeed(
        deriveSeed(deriveSeed(ctx.seed, fish.id), window % UINT32_RANGE),
        0x9a2e,
      );
      const ratio = GRAZE_MIN_HEIGHT + unit(h) * (GRAZE_MAX_HEIGHT - GRAZE_MIN_HEIGHT);
      const sign = (h & 1) === 0 ? 1 : -1;
      const toMinX = fish.x - hard.minX;
      const toMaxX = hard.maxX - fish.x;
      const toMinZ = fish.z - hard.minZ;
      const toMaxZ = hard.maxZ - fish.z;
      const nearest = Math.min(toMinX, toMaxX, toMinZ, toMaxZ);
      // Jamais au-dessus de la hauteur préférée d'une espèce de fond (`preferredMaxY`) : l'ancistrus
      // broute le bas de la vitre, l'otocinclus monte jusqu'au tiers de la colonne.
      out.y = Math.min(
        hard.minY + ratio * (hard.maxY - hard.minY),
        Math.max(hard.minY, bounds.preferredMaxY),
      );
      if (nearest === toMinZ || nearest === toMaxZ) {
        out.z = nearest === toMinZ ? hard.minZ : hard.maxZ;
        out.x = clamp(fish.x + sign * GRAZE_AHEAD, hard.minX, hard.maxX);
      } else {
        out.x = nearest === toMinX ? hard.minX : hard.maxX;
        out.z = clamp(fish.z + sign * GRAZE_AHEAD, hard.minZ, hard.maxZ);
      }
      return out;
    }
    case 'territoire': {
      const home = territoryHome(ctx.seed, fish.id, bounds, ctx.obstacles, wallMargin, out);
      if (home === null) {
        return null;
      }
      const hx = home.x;
      const hy = home.y;
      const hz = home.z;
      const r2 = TERRITORY_RADIUS * TERRITORY_RADIUS;
      if (distance2(fish.x, fish.y, fish.z, hx, hy, hz) > r2) {
        return home; // retour au territoire
      }
      if (boutRemaining(params, ctx.seed, fish.id, ctx.time) <= 0) {
        return null;
      }
      let intruder: Fish | null = null;
      let best = r2;
      for (const other of ctx.fishes) {
        if (other.species === fish.species) {
          continue;
        }
        const d2 = distance2(other.x, other.y, other.z, hx, hy, hz);
        if (d2 < best) {
          best = d2;
          intruder = other;
        }
      }
      if (intruder === null) {
        return null;
      }
      const stop = CHARGE_STOP_LENGTHS * bodyLength;
      if (distance2(fish.x, fish.y, fish.z, intruder.x, intruder.y, intruder.z) < stop * stop) {
        return null;
      }
      out.x = clamp(intruder.x, hard.minX, hard.maxX);
      out.y = clamp(intruder.y, hard.minY, hard.maxY);
      out.z = clamp(intruder.z, hard.minZ, hard.maxZ);
      return out;
    }
  }
}

function distance2(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  const dz = az - bz;
  return dx * dx + dy * dy + dz * dz;
}

/** Geste du rendu pendant un comportement, en radians (ajouté à la pose interpolée). */
export interface BehaviorGesture {
  /** Inclinaison ajoutée (négative : museau vers le bas). */
  pitch: number;
  /** Cap ajouté (frétillement). */
  yaw: number;
}

/** Inclinaison du museau vers le sable pendant la fouille (posture, non atténuée). */
export const FORAGE_TILT = 0.35;
/** Hochement de la fouille : amplitude (rad) et fréquence (Hz). */
export const FORAGE_BOB = 0.15;
export const FORAGE_BOB_HZ = 2.5;
/** Râpe du broutage : frétillement latéral, amplitude (rad) et fréquence (Hz). */
export const GRAZE_RASP = 0.12;
export const GRAZE_RASP_HZ = 3;
/** Parade de défense : frémissement latéral, amplitude (rad) et fréquence (Hz). */
export const DISPLAY_QUIVER = 0.2;
export const DISPLAY_QUIVER_HZ = 5;

/**
 * Geste du comportement `kind` au temps `time` (secondes simulées), écrit dans `out`. La part
 * qui **bouge** (hochement, râpe, frémissement) est multipliée par `motion` (1 : mouvements
 * normaux ; 0 : coupée par « Réduire les mouvements ») ; la posture fixe (museau baissé de la
 * fouille) reste. Sans comportement (`null`), geste nul. La phase est décalée par
 * l'identifiant pour que deux voisins ne bougent pas à l'unisson.
 */
export function behaviorGesture(
  kind: BehaviorKind | null,
  time: number,
  fishId: number,
  motion: number,
  out: BehaviorGesture,
): BehaviorGesture {
  out.pitch = 0;
  out.yaw = 0;
  if (kind === null) {
    return out;
  }
  const phase = (fishId % 7) * 0.9;
  const m = Number.isFinite(motion) ? clamp(motion, 0, 1) : 0;
  switch (kind) {
    case 'fouille':
      out.pitch =
        -FORAGE_TILT + FORAGE_BOB * m * Math.sin(2 * Math.PI * FORAGE_BOB_HZ * time + phase);
      break;
    case 'broutage':
      out.yaw = GRAZE_RASP * m * Math.sin(2 * Math.PI * GRAZE_RASP_HZ * time + phase);
      break;
    case 'territoire':
      out.yaw = DISPLAY_QUIVER * m * Math.sin(2 * Math.PI * DISPLAY_QUIVER_HZ * time + phase);
      break;
  }
  // Zéro positif quand le geste est coupé (`motion` nul) : rien de « -0 » dans les poses.
  out.pitch += 0;
  out.yaw += 0;
  return out;
}
