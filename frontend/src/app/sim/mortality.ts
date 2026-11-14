import { deriveSeed } from '../core/random/prng';
import { ichHealthStress } from './disease';
import { dropsyHealthStress } from './dropsy';
import { finRotHealthStress } from './fin-rot';
import { fungusHealthStress } from './fungus';
import { SPECIES, type SpeciesId } from './species';
import type { Fish } from './swimmer';
import { REFERENCE_BODY_LENGTH, type WaterState } from './water';
import { toxicAmmonia } from './water-conditioner';
import { COMPOUND_THRESHOLDS } from './water-quality';
import { velvetHealthStress } from './velvet';
import { HEALTH_FLOOR, STARVING_HUNGER, feedsOnPellets } from './wellbeing';

/**
 * Mortalité, lot 1 (issue #582, ADR 0137) : un animal très affaibli finit par mourir si
 * l'on néglige son bac ; son corps reste dans l'eau et la pollue tant qu'on ne le retire pas.
 *
 * **Option** : `World.mortality` ; absente (bac par défaut, anciennes sauvegardes), aucun
 * décès et le monde avance exactement comme avant. En mode décor, rien n'avance (ni santé, ni
 * mortalité).
 *
 * **Risque** : seul un animal dont la santé est au plus `MORTALITY_HEALTH` (à peine au-dessus
 * du plancher, `sim/wellbeing.ts`) peut mourir. Trois causes, chacune de poids 1 au plus :
 * maladie (somme des poids des maladies dans la santé, bornée à 1), jeûne (faim maximale,
 * seulement pour une espèce nourrie aux granulés) et eau toxique (ammoniaque libre ou nitrites
 * au seuil « mauvaise »). Taux de décès λ = causes · `MORTALITY_RATE_PER_CAUSE` ; sans cause
 * (animal qui se remet), aucun décès. La santé met 8 minutes simulées à tomber au plancher
 * pour une cause : un bac négligé perd son premier animal en une demi-heure simulée environ,
 * le temps d'agir.
 *
 * **Déterminisme** : tirage par hachage de (graine, pas, animal), sans état ni sous-générateur
 * consommé, calculé seulement si λ > 0 (même principe que `ichDraw`, `sim/disease.ts`).
 *
 * **Corps** : un animal mort quitte `World.entities` pour `World.dead` (`DeadAnimal`), si bien
 * qu'aucun système (banc, repas, maladies, santé, ponte) n'a à l'exclure. Un nageur remonte
 * lentement flotter sous la surface ; un marcheur ou un amphibien reste où il est, au fond.
 * Sa décomposition ajoute `DECAY_LOAD_FACTOR` fois sa charge de vivant à la production
 * d'ammoniaque (`deadLoad`) jusqu'à son retrait à l'épuisette (`removeDeadInPlace`).
 *
 * Toutes les valeurs sont des **approximations de jeu** (temps compressé comme le reste de la
 * simulation) : aucune source fiable ne chiffre une mortalité selon un score de santé de jeu,
 * et la pollution par un corps qui se décompose n'est pas chiffrée dans `docs/SOINS.md`.
 */

/** Santé au-dessus de laquelle aucun animal ne meurt. Approximation de jeu. */
export const MORTALITY_HEALTH = HEALTH_FLOOR + 0.02;
/**
 * Taux de décès par cause, en s⁻¹, pour un animal au plancher : 20 minutes simulées en
 * moyenne pour une cause, 10 pour deux. Approximation de jeu.
 */
export const MORTALITY_RATE_PER_CAUSE = 1 / 1200;
/**
 * Charge de la décomposition d'un corps, en multiples de sa charge de vivant (`waterLoad`,
 * `sim/water.ts`) : un corps pollue trois fois plus qu'un animal vivant. Approximation de jeu.
 */
export const DECAY_LOAD_FACTOR = 3;
/** Vitesse de remontée d'un nageur mort vers la surface, en m/s. Approximation de jeu. */
export const DEAD_FLOAT_SPEED = 0.01;
/** Âge maximal d'un corps, en secondes simulées : son compteur s'arrête là (une journée). */
export const DEAD_MAX_AGE = 86400;

/** Sel du hachage des tirages de décès (séparé des autres usages de la graine). */
const MORTALITY_SALT = 0x6d0e7a11;

/** Animal mort : ses données de vivant, figées, et l'âge du corps en secondes simulées. */
export type DeadAnimal = Fish & { readonly deadFor: number };

/** Animal vu par la mortalité. */
export interface MortalitySubject {
  readonly id: number;
  readonly species: SpeciesId;
  readonly hunger: number;
  readonly health: number;
  readonly ich?: number;
  readonly finRot?: number;
  readonly velvet?: number;
  readonly fungus?: number;
  readonly dropsy?: number;
}

/** Vrai si l'eau est toxique : ammoniaque libre ou nitrites au seuil « mauvaise ». */
export function toxicWater(
  water: Pick<WaterState, 'ammonia' | 'ammoniaBinder' | 'nitrite'>,
): boolean {
  return (
    toxicAmmonia(water) >= COMPOUND_THRESHOLDS.ammonia.bad ||
    water.nitrite >= COMPOUND_THRESHOLDS.nitrite.bad
  );
}

/** Poids de la maladie dans le risque, dans [0, 1] : somme des poids des maladies, bornée. */
export function diseaseCause(animal: MortalitySubject): number {
  const sum =
    ichHealthStress(animal.ich) +
    finRotHealthStress(animal.finRot) +
    velvetHealthStress(animal.velvet) +
    fungusHealthStress(animal.fungus) +
    dropsyHealthStress(animal.dropsy);
  return sum >= 1 ? 1 : sum;
}

/**
 * Taux de décès de `animal`, en s⁻¹ (fonction pure) : 0 si sa santé dépasse
 * `MORTALITY_HEALTH` (ou n'est pas finie : état corrompu), sinon
 * (maladie + jeûne + eau toxique) · `MORTALITY_RATE_PER_CAUSE`. `toxic` : eau toxique
 * (`toxicWater`).
 */
export function mortalityRate(animal: MortalitySubject, toxic: boolean): number {
  if (!(animal.health <= MORTALITY_HEALTH)) {
    return 0;
  }
  const def = SPECIES[animal.species];
  const starving = feedsOnPellets(def) && animal.hunger >= STARVING_HUNGER ? 1 : 0;
  const causes = diseaseCause(animal) + starving + (toxic ? 1 : 0);
  return causes * MORTALITY_RATE_PER_CAUSE;
}

/** Probabilité de décès pendant `dt` secondes au taux `rate` : `1 − e^(−rate·dt)`, dans [0, 1). */
export function mortalityChance(rate: number, dt: number): number {
  if (!(rate > 0) || !(dt > 0) || !Number.isFinite(rate) || !Number.isFinite(dt)) {
    return 0;
  }
  return 1 - Math.exp(-rate * dt);
}

/**
 * Tirage de décès dans [0, 1) pour l'animal `id` au pas `tick` du monde de graine `seed` :
 * hachage sans état (aucun sous-générateur consommé).
 */
export function mortalityDraw(seed: number, tick: number, id: number): number {
  const step = deriveSeed(seed, tick >>> 0);
  return deriveSeed((step ^ MORTALITY_SALT) >>> 0, id) / 4294967296;
}

/**
 * Vrai si `animal` meurt pendant ce pas de `dt` secondes (tirage `mortalityDraw` comparé à
 * `mortalityChance`) ; aucun tirage si le taux est nul.
 */
export function diesThisStep(
  animal: MortalitySubject,
  toxic: boolean,
  dt: number,
  seed: number,
  tick: number,
): boolean {
  const chance = mortalityChance(mortalityRate(animal, toxic), dt);
  return chance > 0 && mortalityDraw(seed, tick, animal.id) < chance;
}

/** Partage des animaux d'un pas où au moins un meurt (`splitDeaths`). */
export interface DeathSplit<T> {
  readonly living: T[];
  readonly dying: T[];
}

/**
 * Décès du pas (#615) : un seul tirage `dies` par animal (`diesThisStep` par défaut, ordre de
 * `animals`). `null`, sans aucune allocation, si personne ne meurt ; sinon les vivants et les
 * mourants, chacun dans l'ordre d'origine.
 */
export function splitDeaths<T extends MortalitySubject>(
  animals: readonly T[],
  toxic: boolean,
  dt: number,
  seed: number,
  tick: number,
  dies: typeof diesThisStep = diesThisStep,
): DeathSplit<T> | null {
  let first = 0;
  while (first < animals.length && !dies(animals[first], toxic, dt, seed, tick)) {
    first += 1;
  }
  if (first === animals.length) {
    return null;
  }
  const living = animals.slice(0, first);
  const dying = [animals[first]];
  for (let i = first + 1; i < animals.length; i++) {
    const animal = animals[i];
    (dies(animal, toxic, dt, seed, tick) ? dying : living).push(animal);
  }
  return { living, dying };
}

/**
 * Corps de `fish`, mort à l'instant : à plat (inclinaison nulle), position précédente égale à
 * la position. Vitesse et virage sont gardés tels quels (bornes de la sauvegarde) mais ne
 * servent plus : un corps ne nage pas.
 */
export function deadBody(fish: Fish): DeadAnimal {
  return {
    ...fish,
    pitch: 0,
    pitchTarget: 0,
    ascent: 0,
    px: fish.x,
    py: fish.y,
    pz: fish.z,
    pyaw: fish.yaw,
    ppitch: 0,
    pphase: fish.phase,
    deadFor: 0,
  };
}

/** Vrai si un animal de l'espèce flotte une fois mort (nageur) ; sinon il reste au fond. */
export function floatsWhenDead(species: SpeciesId): boolean {
  const def = SPECIES[species];
  return def.walker === undefined && def.amphibian === undefined;
}

/**
 * Corps d'un pas de `dt` secondes, **en place** : l'âge avance (borné à `DEAD_MAX_AGE`) et un
 * nageur remonte vers `surfaceOf(corps)` (plus haute position de son espèce) à `DEAD_FLOAT_SPEED` (jamais au
 * delà) ; position précédente mise à jour pour l'interpolation du rendu.
 */
export function stepDeadInPlace(
  dead: readonly DeadAnimal[],
  dt: number,
  surfaceOf: (body: DeadAnimal) => number,
): void {
  for (const body of dead as Mutable<DeadAnimal>[]) {
    body.deadFor = Math.min(body.deadFor + dt, DEAD_MAX_AGE);
    body.px = body.x;
    body.py = body.y;
    body.pz = body.z;
    if (floatsWhenDead(body.species)) {
      const top = surfaceOf(body);
      if (body.y < top) {
        body.y = Math.min(top, body.y + DEAD_FLOAT_SPEED * dt);
      }
    }
  }
}

/**
 * Charge de décomposition des corps `dead` : `DECAY_LOAD_FACTOR` fois leur charge de vivant
 * (cube de `bodyLength / REFERENCE_BODY_LENGTH`, comme `waterLoad`). 0 sans corps.
 */
export function deadLoad(dead: readonly { readonly species: SpeciesId }[] | undefined): number {
  if (dead === undefined) {
    return 0;
  }
  let load = 0;
  for (const body of dead) {
    const r = SPECIES[body.species].bodyLength / REFERENCE_BODY_LENGTH;
    load += r * r * r;
  }
  return DECAY_LOAD_FACTOR * load;
}

/**
 * Rayon minimal de prise d'un corps à l'épuisette, en m : un corps de néon fait 2 à 4 pixels
 * à l'écran, la prise est donc plus large que lui (au moins sa longueur).
 */
export const NET_RADIUS = 0.03;

/**
 * Corps touché par le rayon `origin` + t·`direction` (t > 0, direction non nulle, pas
 * forcément unitaire) : celui dont le centre est à au plus `max(NET_RADIUS, longueur du
 * corps)` du rayon, le plus proche de l'origine ; `null` si aucun (ou direction nulle).
 */
export function netTarget(
  dead: readonly DeadAnimal[] | undefined,
  origin: readonly [number, number, number],
  direction: readonly [number, number, number],
): number | null {
  if (dead === undefined) {
    return null;
  }
  const [dx, dy, dz] = direction;
  const length = Math.hypot(dx, dy, dz);
  if (!(length > 0) || !Number.isFinite(length)) {
    return null;
  }
  const ux = dx / length;
  const uy = dy / length;
  const uz = dz / length;
  let best: number | null = null;
  let bestT = Number.POSITIVE_INFINITY;
  for (const body of dead) {
    const ox = body.x - origin[0];
    const oy = body.y - origin[1];
    const oz = body.z - origin[2];
    const t = ox * ux + oy * uy + oz * uz;
    if (!(t > 0)) {
      continue;
    }
    const radius = Math.max(NET_RADIUS, SPECIES[body.species].bodyLength);
    const px = ox - t * ux;
    const py = oy - t * uy;
    const pz = oz - t * uz;
    if (px * px + py * py + pz * pz <= radius * radius && t < bestT) {
      best = body.id;
      bestT = t;
    }
  }
  return best;
}

/** Âge de corps valide (nombre fini dans [0, `DEAD_MAX_AGE`]). */
export function isDeadAge(value: unknown): value is number {
  return typeof value === 'number' && value >= 0 && value <= DEAD_MAX_AGE;
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };
