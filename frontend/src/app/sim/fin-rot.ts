import { deriveSeed } from '../core/random/prng';
import { catchesIch } from './disease';
import type { EnvironmentId } from './environment';
import type { SpeciesId } from './species';
import { assertTimeStep } from './time-step';
import type { WaterState } from './water';
import { COMPOUND_THRESHOLDS } from './water-quality';

/**
 * Pourriture des nageoires (issue #485, ADR 0114) : deuxième maladie simulée, liée à la
 * qualité de l'eau. Infection bactérienne opportuniste (Aeromonas, `docs/SOINS.md` § 5.7) :
 * elle naît d'une eau trop chargée et **guérit quand on corrige la cause**, sans bouton
 * « guérir » ni médicament simulé.
 *
 * État par animal : `finRot`, progression de la maladie en secondes simulées, dans
 * [0, `FIN_ROT_MAX`] ; absent, l'animal est sain (tous les animaux d'un bac à l'eau bonne, et
 * toutes les sauvegardes antérieures). Tant que l'eau est trop chargée, la progression monte
 * (jusqu'à `FIN_ROT_MAX`) ; dès que la cause disparaît, elle redescend
 * (`FIN_ROT_HEAL_SPEED`) et l'animal est guéri quand elle atteint 0 : la durée de la
 * guérison est donc celle de la maladie, à la vitesse de guérison près. Trois stades :
 * début (aucun signe), nageoires effilochées (la santé baisse), stade avancé (la santé baisse
 * deux fois plus vite).
 *
 * Qui : les mêmes animaux que les points blancs (`catchesIch`), poissons nageurs d'eau douce
 * (les sources consultées décrivent Aeromonas en eau douce, Merck) ; pas les amphibiens.
 *
 * Cause : ammoniaque ou nitrites au seuil « mauvaise » ou au-dessus (`finRotCauses`, 0 à 2).
 * La blessure de territoire n'est pas modélisée (les comportements de territoire n'abîment
 * personne, ADR 0106). Pas de contagion : approximation de jeu, les bactéries opportunistes
 * sont considérées comme présentes dans tout bac, c'est l'eau qui fait la maladie.
 *
 * Déterminisme : tirage d'apparition par hachage sans état de (graine, pas, animal), avec son
 * propre sel ; aucun sous-générateur consommé, rien n'est calculé en eau bonne sans malade.
 *
 * Toutes les valeurs numériques sont des **approximations de jeu** (temps compressé, une
 * journée de jeu de 20 minutes) : aucune source consultée ne chiffre le délai entre une eau
 * chargée et les premiers signes, ni la durée de cicatrisation (`docs/SOINS.md` § 5.7).
 */

/** Stade de la maladie (`finRotStage`). */
export type FinRotStage = 'debut' | 'effilochee' | 'avancee';

/** Progression à partir de laquelle les nageoires sont effilochées, en s. Approximation de jeu. */
export const FIN_ROT_VISIBLE_AT = 240;
/** Progression du stade avancé, en s. Approximation de jeu. */
export const FIN_ROT_ADVANCED_AT = 720;
/** Progression maximale, en s : la maladie s'arrête là tant que l'eau reste chargée. */
export const FIN_ROT_MAX = 1200;
/**
 * Vitesse de guérison en eau corrigée, en secondes de progression par seconde simulée : un
 * animal au maximum guérit en 20 minutes simulées (une journée de jeu). Approximation de jeu.
 */
export const FIN_ROT_HEAL_SPEED = 1;
/**
 * Taux d'apparition chez un poisson sain par cause, en s⁻¹ : un bac de 12 poissons sous une
 * cause durable compte un premier cas en 5 minutes simulées en moyenne. Approximation de jeu.
 */
export const FIN_ROT_RATE = 1 / 3600;
/** Poids dans la santé (`sim/wellbeing.ts`) : nageoires effilochées, puis stade avancé. */
export const FIN_ROT_VISIBLE_HEALTH_STRESS = 0.5;
export const FIN_ROT_ADVANCED_HEALTH_STRESS = 1;
/** Ammoniaque et nitrites qui rendent malade : le seuil « mauvaise » (unités de jeu). */
export const FIN_ROT_AMMONIA = COMPOUND_THRESHOLDS.ammonia.bad;
export const FIN_ROT_NITRITE = COMPOUND_THRESHOLDS.nitrite.bad;

/** Sel des tirages d'apparition (distinct de celui des points blancs). */
const FIN_ROT_SALT = 0x5f1e27a3;

/** Vrai si un animal de l'espèce `species` peut l'attraper dans l'environnement donné. */
export function catchesFinRot(species: SpeciesId, environment: EnvironmentId): boolean {
  return catchesIch(species, environment);
}

/**
 * Nombre de causes (0 à 2) de l'eau `water` : ammoniaque ≥ `FIN_ROT_AMMONIA`, nitrites ≥
 * `FIN_ROT_NITRITE`. Une valeur non finie ne compte pas (la maladie ne naît que d'une eau
 * chargée avérée).
 */
export function finRotCauses(water: Pick<WaterState, 'ammonia' | 'nitrite'>): number {
  return (water.ammonia >= FIN_ROT_AMMONIA ? 1 : 0) + (water.nitrite >= FIN_ROT_NITRITE ? 1 : 0);
}

/** Progression valide (nombre fini dans [0, `FIN_ROT_MAX`]). */
export function isFinRotProgress(value: unknown): value is number {
  return typeof value === 'number' && value >= 0 && value <= FIN_ROT_MAX;
}

/** Stade d'une progression, ou `null` pour un animal sain (absente ou invalide). */
export function finRotStage(finRot: number | undefined): FinRotStage | null {
  if (!isFinRotProgress(finRot)) {
    return null;
  }
  if (finRot < FIN_ROT_VISIBLE_AT) {
    return 'debut';
  }
  return finRot < FIN_ROT_ADVANCED_AT ? 'effilochee' : 'avancee';
}

/** Vrai si les nageoires sont effilochées (stades effiloché et avancé). */
export function showsFinRot(finRot: number | undefined): boolean {
  return isFinRotProgress(finRot) && finRot >= FIN_ROT_VISIBLE_AT;
}

/**
 * Intensité des signes visibles, dans [0, 1], pour le rendu : 0 sain ou au début, puis
 * linéaire jusqu'à 1 au maximum.
 */
export function finRotSeverity(finRot: number | undefined): number {
  if (!showsFinRot(finRot)) {
    return 0;
  }
  return ((finRot as number) - FIN_ROT_VISIBLE_AT) / (FIN_ROT_MAX - FIN_ROT_VISIBLE_AT);
}

/** Poids de la maladie dans la santé : 0 sain ou au début. */
export function finRotHealthStress(finRot: number | undefined): number {
  switch (finRotStage(finRot)) {
    case 'effilochee':
      return FIN_ROT_VISIBLE_HEALTH_STRESS;
    case 'avancee':
      return FIN_ROT_ADVANCED_HEALTH_STRESS;
    default:
      return 0;
  }
}

/** Tirage d'apparition dans [0, 1) pour l'animal `id` au pas `tick` (hachage sans état). */
export function finRotDraw(seed: number, tick: number, id: number): number {
  const step = deriveSeed(seed, tick >>> 0);
  return deriveSeed((step ^ FIN_ROT_SALT) >>> 0, id) / 4294967296;
}

/** Animal vu par la maladie. */
export interface FinRotSubject {
  readonly id: number;
  readonly species: SpeciesId;
  finRot?: number;
}

/**
 * Pourriture des nageoires d'un pas de `dt` secondes pour tous les animaux d'un bac, **en
 * place** (aucune allocation). `causes` : causes de l'eau (`finRotCauses`) ; une valeur non
 * finie ou négative compte pour 0.
 * - Eau chargée (causes > 0) : les malades progressent (jusqu'à `FIN_ROT_MAX`), chaque
 *   poisson sain qui peut l'attraper tombe malade avec la probabilité `1 − e^(−λ·dt)`,
 *   λ = causes × `FIN_ROT_RATE`.
 * - Eau corrigée (causes = 0) : les malades guérissent (`FIN_ROT_HEAL_SPEED`) ; à 0, le champ
 *   est effacé. Aucun tirage.
 * Une progression invalide (état corrompu), ou portée par un animal qui ne l'attrape pas ici,
 * est effacée.
 * @throws RangeError si `dt` n'est pas un réel strictement positif (animaux inchangés).
 */
export function stepFinRotInPlace(
  animals: readonly FinRotSubject[],
  dt: number,
  causes: number,
  environment: EnvironmentId,
  seed: number,
  tick: number,
): void {
  assertTimeStep(dt);
  const count = causes > 0 && Number.isFinite(causes) ? causes : 0;
  const chance = count > 0 ? 1 - Math.exp(-count * FIN_ROT_RATE * dt) : 0;
  for (const animal of animals) {
    const progress = animal.finRot;
    if (progress === undefined) {
      if (
        chance > 0 &&
        catchesFinRot(animal.species, environment) &&
        finRotDraw(seed, tick, animal.id) < chance
      ) {
        animal.finRot = 0;
      }
      continue;
    }
    if (!isFinRotProgress(progress) || !catchesFinRot(animal.species, environment)) {
      delete animal.finRot;
      continue;
    }
    if (count > 0) {
      animal.finRot = Math.min(progress + dt, FIN_ROT_MAX);
    } else {
      const next = progress - dt * FIN_ROT_HEAL_SPEED;
      if (next <= 0) {
        delete animal.finRot;
      } else {
        animal.finRot = next;
      }
    }
  }
}

/**
 * Nageoires au stade avancé pour tous les animaux qui peuvent l'attraper (`catchesFinRot`),
 * **en place** : paramètre d'URL `pourriture=1`, pour l'e2e et les captures. Aucun tirage.
 */
export function rotAllFinsInPlace(
  animals: readonly FinRotSubject[],
  environment: EnvironmentId,
): void {
  for (const animal of animals) {
    if (catchesFinRot(animal.species, environment)) {
      animal.finRot = FIN_ROT_MAX;
    }
  }
}
