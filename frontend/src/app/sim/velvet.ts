import { deriveSeed } from '../core/random/prng';
import { DEFAULT_DAY_LENGTH_SECONDS } from './daylight';
import { catchesIch } from './disease';
import type { EnvironmentId } from './environment';
import type { SpeciesId } from './species';
import { assertTimeStep } from './time-step';

/**
 * Velours (Oodinium / Piscinoodinium, issue #532, ADR 0124) : troisième maladie simulée, après
 * les points blancs (`sim/disease.ts`) et la pourriture des nageoires (`sim/fin-rot.ts`).
 * Parasite (dinoflagellé) qui couvre la peau d'un voile fin doré (`docs/SOINS.md` § 5.2).
 *
 * État par animal : `velvet`, progression en secondes simulées dans [0, `VELVET_MAX`] ;
 * absent, l'animal est sain (tous les animaux d'un bac sain, et toutes les sauvegardes
 * antérieures). Trois stades : incubation (aucun signe, pas contagieux), voile visible
 * (contagieux, la santé baisse), stade avancé (la santé baisse deux fois plus vite).
 *
 * Apparition : comme les points blancs, sous l'effet du stress du bac (`ichStress` : écart de
 * température, changement brusque, ammoniaque ou nitrites), mais plus rarement ; contagion
 * **lente** (trois fois moins que les points blancs). Un bac sans stress et sans malade ne
 * tombe jamais malade. L'arrivée d'un poisson sans quarantaine n'est pas modélisée (la
 * quarantaine viendra avec #547).
 *
 * Traitement : le médicament du panneau « Soins » (`medicationProtects`, `sim/treatment.ts`)
 * tant qu'il agit : aucune nouvelle infection, et le voile recule (`VELVET_HEAL_SPEED`)
 * jusqu'à la guérison. Le sel et la chaleur, remèdes des points blancs dans le jeu, n'y font
 * rien : c'est l'erreur de traitement à reconnaître (non-confusion des deux maladies). Un
 * médicament non redosé laisse la maladie reprendre là où elle en est.
 *
 * Déterminisme : tirage d'infection par hachage sans état de (graine, pas, animal), avec son
 * propre sel ; aucun sous-générateur consommé, aucun tirage dans un bac sans stress ni malade.
 *
 * Toutes les valeurs numériques sont des **approximations de jeu** (temps compressé, une
 * journée de 20 minutes) : en eau douce, les traitements spécifiques du velours ne sont pas
 * vérifiés (`docs/SOINS.md` §§ 5.2 et 15).
 */

/** Stade de la maladie (`velvetStage`). */
export type VelvetStage = 'incubation' | 'voile' | 'avance';

/** Fin de l'incubation, en s : le voile apparaît. Approximation de jeu. */
export const VELVET_VISIBLE_AT = 240;
/** Début du stade avancé, en s. Approximation de jeu. */
export const VELVET_ADVANCED_AT = 600;
/** Progression maximale, en s : la maladie s'arrête là sans traitement. */
export const VELVET_MAX = 900;
/** Journées simulées de médicament pour guérir un animal au maximum. Approximation de jeu. */
export const VELVET_CURE_DAYS = 2;
/**
 * Recul du voile sous médicament, en secondes de progression par seconde simulée : un animal
 * au maximum guérit en `VELVET_CURE_DAYS` journées simulées.
 */
export const VELVET_HEAL_SPEED = VELVET_MAX / (VELVET_CURE_DAYS * DEFAULT_DAY_LENGTH_SECONDS);
/**
 * Taux d'infection d'un poisson sain par cause de stress, en s⁻¹ : moitié de celui des points
 * blancs. Approximation de jeu.
 */
export const VELVET_STRESS_RATE = 1 / 7200;
/**
 * Taux d'infection d'un poisson sain par poisson contagieux du même bac, en s⁻¹ : contagion
 * lente, trois fois moindre que celle des points blancs. Approximation de jeu.
 */
export const VELVET_CONTAGION_RATE = 1 / 5400;
/** Poids dans la santé (`sim/wellbeing.ts`) : voile visible, puis stade avancé. */
export const VELVET_VISIBLE_HEALTH_STRESS = 0.5;
export const VELVET_ADVANCED_HEALTH_STRESS = 1;

/** Sel des tirages d'infection (distinct des points blancs et de la pourriture). */
const VELVET_SALT = 0x0d1a7e55;

/** Vrai si un animal de l'espèce `species` peut l'attraper : poisson nageur d'eau douce. */
export function catchesVelvet(species: SpeciesId, environment: EnvironmentId): boolean {
  return catchesIch(species, environment);
}

/** Progression valide (nombre fini dans [0, `VELVET_MAX`]). */
export function isVelvetProgress(value: unknown): value is number {
  return typeof value === 'number' && value >= 0 && value <= VELVET_MAX;
}

/** Stade d'une progression, ou `null` pour un animal sain (absente ou invalide). */
export function velvetStage(velvet: number | undefined): VelvetStage | null {
  if (!isVelvetProgress(velvet)) {
    return null;
  }
  if (velvet < VELVET_VISIBLE_AT) {
    return 'incubation';
  }
  return velvet < VELVET_ADVANCED_AT ? 'voile' : 'avance';
}

/** Vrai si le voile est visible (stades voile et avancé) : l'animal est contagieux. */
export function showsVelvet(velvet: number | undefined): boolean {
  return isVelvetProgress(velvet) && velvet >= VELVET_VISIBLE_AT;
}

/** Intensité des signes, dans [0, 1], pour le rendu : 0 sain ou en incubation, puis linéaire. */
export function velvetSeverity(velvet: number | undefined): number {
  if (!showsVelvet(velvet)) {
    return 0;
  }
  return ((velvet as number) - VELVET_VISIBLE_AT) / (VELVET_MAX - VELVET_VISIBLE_AT);
}

/** Poids de la maladie dans la santé : 0 sain ou en incubation. */
export function velvetHealthStress(velvet: number | undefined): number {
  switch (velvetStage(velvet)) {
    case 'voile':
      return VELVET_VISIBLE_HEALTH_STRESS;
    case 'avance':
      return VELVET_ADVANCED_HEALTH_STRESS;
    default:
      return 0;
  }
}

/** Tirage d'infection dans [0, 1) pour l'animal `id` au pas `tick` (hachage sans état). */
export function velvetDraw(seed: number, tick: number, id: number): number {
  const step = deriveSeed(seed, tick >>> 0);
  return deriveSeed((step ^ VELVET_SALT) >>> 0, id) / 4294967296;
}

/** Animal vu par la maladie. */
export interface VelvetSubject {
  readonly id: number;
  readonly species: SpeciesId;
  velvet?: number;
}

/**
 * Velours d'un pas de `dt` secondes pour tous les animaux d'un bac, **en place** (aucune
 * allocation). `stress` : causes de stress du bac (`ichStress`) ; une valeur non finie ou
 * négative compte pour 0. `treated` : le médicament agit (`medicationProtects`).
 * - Sans traitement : les malades progressent (jusqu'à `VELVET_MAX`), puis chaque poisson sain
 *   qui peut l'attraper est infecté avec la probabilité `1 − e^(−λ·dt)`,
 *   λ = stress × `VELVET_STRESS_RATE` + contagieux × `VELVET_CONTAGION_RATE` (contagieux
 *   comptés au début du pas : l'ordre des animaux ne compte pas).
 * - Sous traitement : aucune infection, aucun tirage ; les malades reculent
 *   (`VELVET_HEAL_SPEED`) et sont guéris à 0 (champ effacé).
 * Une progression invalide (état corrompu), ou portée par un animal qui ne l'attrape pas ici,
 * est effacée. Renvoie le nombre d'animaux guéris pendant ce pas.
 * @throws RangeError si `dt` n'est pas un réel strictement positif (animaux inchangés).
 */
export function stepVelvetInPlace(
  animals: readonly VelvetSubject[],
  dt: number,
  stress: number,
  environment: EnvironmentId,
  seed: number,
  tick: number,
  treated = false,
): number {
  assertTimeStep(dt);
  let contagious = 0;
  let infected = 0;
  for (const animal of animals) {
    if (animal.velvet === undefined) {
      continue;
    }
    if (!isVelvetProgress(animal.velvet) || !catchesVelvet(animal.species, environment)) {
      delete animal.velvet;
      continue;
    }
    infected += 1;
    if (animal.velvet >= VELVET_VISIBLE_AT) {
      contagious += 1;
    }
  }
  const causes = stress > 0 && Number.isFinite(stress) ? stress : 0;
  const rate = treated ? 0 : causes * VELVET_STRESS_RATE + contagious * VELVET_CONTAGION_RATE;
  if (infected === 0 && rate === 0) {
    // Bac sain et sans stress, ou traité sans malade : rien à faire, aucun tirage.
    return 0;
  }
  const chance = 1 - Math.exp(-rate * dt);
  let healed = 0;
  for (const animal of animals) {
    const progress = animal.velvet;
    if (progress !== undefined) {
      if (!treated) {
        animal.velvet = Math.min(progress + dt, VELVET_MAX);
        continue;
      }
      const next = progress - dt * VELVET_HEAL_SPEED;
      if (next <= 0) {
        delete animal.velvet;
        healed += 1;
      } else {
        animal.velvet = next;
      }
    } else if (
      chance > 0 &&
      catchesVelvet(animal.species, environment) &&
      velvetDraw(seed, tick, animal.id) < chance
    ) {
      animal.velvet = 0;
    }
  }
  return healed;
}

/**
 * Velours au maximum pour tous les animaux qui peuvent l'attraper (`catchesVelvet`), **en
 * place** : paramètre d'URL `velours=1`, pour l'e2e et les captures. Aucun tirage.
 */
export function velvetAllInPlace(
  animals: readonly VelvetSubject[],
  environment: EnvironmentId,
): void {
  for (const animal of animals) {
    if (catchesVelvet(animal.species, environment)) {
      animal.velvet = VELVET_MAX;
    }
  }
}
