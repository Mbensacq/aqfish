import { deriveSeed } from '../core/random/prng';
import { DEFAULT_DAY_LENGTH_SECONDS } from './daylight';
import { catchesIch } from './disease';
import type { EnvironmentId } from './environment';
import type { SpeciesId } from './species';
import { assertTimeStep } from './time-step';

/**
 * Hydropisie (issue #565, ADR 0132) : cinquième maladie simulée, après les points blancs
 * (`sim/disease.ts`), la pourriture des nageoires (`sim/fin-rot.ts`), le velours
 * (`sim/velvet.ts`) et les champignons (`sim/fungus.ts`). Signe d'une infection interne
 * (Aeromonas le plus souvent) chez un poisson affaibli par une eau dégradée : abdomen gonflé,
 * puis écailles hérissées « en pomme de pin » ; le stade avancé est terminal, à pronostic
 * réservé (`docs/SOINS.md` § 5.7, Merck).
 *
 * État par animal : `dropsy`, progression en secondes simulées dans [0, `DROPSY_MAX`] ; absent,
 * l'animal est sain (tous les animaux d'un bac sain, et toutes les sauvegardes antérieures).
 * Trois stades : début (aucun signe), ventre gonflé (la santé baisse), écailles hérissées
 * (stade avancé, la santé baisse trois fois plus vite).
 *
 * Apparition : **jamais spontanée** ni contagieuse. Il faut à la fois une eau dégradée
 * (`causes` : ammoniaque et nitrites au seuil « mauvaise », `finRotCauses`, 0 à 2) et un animal
 * affaibli (santé finie sous `DROPSY_WEAK_HEALTH`) : c'est le stress d'une eau mauvaise
 * **longtemps** (la santé met plusieurs minutes simulées à tomber) qui l'ouvre. Taux bas
 * (`DROPSY_RATE`) : maladie lente.
 *
 * Évolution et soins : dans une eau dégradée, elle progresse jusqu'au maximum. Dans une eau
 * propre (`causes` nul, par exemple en quarantaine ou après des changements d'eau), elle recule
 * lentement (`DROPSY_HEAL_SPEED`) **tant qu'elle n'a pas atteint le stade avancé** ; au stade
 * avancé, elle ne recule plus (pronostic réservé : aucun bouton « guérir », `docs/SOINS.md`,
 * recommandation 4). Les traitements du panneau « Soins » (sel, chaleur, médicament) n'y font
 * rien : le vrai traitement passe par un vétérinaire (antibiotique sur ordonnance). Le jeu ne
 * propose l'euthanasie sans souffrance qu'en conseil (alerte et wiki), jamais comme geste.
 *
 * Déterminisme : tirage d'apparition par hachage sans état de (graine, pas, animal), avec son
 * propre sel ; aucun sous-générateur consommé, aucun tirage pour un animal sans cause.
 *
 * Toutes les valeurs numériques sont des **approximations de jeu** (temps compressé, une
 * journée de 20 minutes) : aucune source consultée ne chiffre le délai d'apparition ni la durée
 * de l'évolution (`docs/SOINS.md` § 5.7).
 */

/** Stade de la maladie (`dropsyStage`). */
export type DropsyStage = 'debut' | 'gonfle' | 'herisse';

/** Fin du début sans signe, en s : le ventre gonfle. Approximation de jeu. */
export const DROPSY_VISIBLE_AT = 600;
/** Début du stade avancé (écailles hérissées), en s : plus de recul. Approximation de jeu. */
export const DROPSY_ADVANCED_AT = 1800;
/** Progression maximale, en s : la maladie s'arrête là. */
export const DROPSY_MAX = 2400;
/**
 * Journées simulées d'eau propre pour qu'un animal tout juste avant le stade avancé guérisse.
 * Approximation de jeu : guérison lente, possible seulement si l'on agit tôt.
 */
export const DROPSY_CURE_DAYS = 3;
/** Recul en eau propre, en secondes de progression par seconde simulée. */
export const DROPSY_HEAL_SPEED =
  DROPSY_ADVANCED_AT / (DROPSY_CURE_DAYS * DEFAULT_DAY_LENGTH_SECONDS);
/**
 * Taux d'apparition chez un animal affaibli, par cause d'eau dégradée, en s⁻¹ : environ deux
 * heures simulées en moyenne avec une seule cause. Approximation de jeu (maladie lente).
 */
export const DROPSY_RATE = 1 / 7200;
/** Santé sous laquelle un animal est affaibli (condition d'apparition). Approximation de jeu. */
export const DROPSY_WEAK_HEALTH = 0.5;
/** Poids dans la santé (`sim/wellbeing.ts`) : ventre gonflé, puis écailles hérissées. */
export const DROPSY_SWOLLEN_HEALTH_STRESS = 0.5;
export const DROPSY_ADVANCED_HEALTH_STRESS = 1.5;

/**
 * Mise en garde d'un traitement donné à un bac qui compte un cas d'hydropisie (issue #565) :
 * dans le jeu, seuls une eau propre et l'isolement aident, et seulement avant le stade avancé.
 */
export const DROPSY_WRONG_TREATMENT =
  'Hydropisie : ni le sel, ni la chaleur, ni ce médicament ne la soignent ; eau propre et quarantaine (approximation de jeu).';

/** Sel des tirages d'apparition (distinct des autres maladies). */
const DROPSY_SALT = 0x2d7e41a9;

/** Vrai si un animal de l'espèce `species` peut l'attraper : poisson nageur d'eau douce. */
export function catchesDropsy(species: SpeciesId, environment: EnvironmentId): boolean {
  return catchesIch(species, environment);
}

/** Progression valide (nombre fini dans [0, `DROPSY_MAX`]). */
export function isDropsyProgress(value: unknown): value is number {
  return typeof value === 'number' && value >= 0 && value <= DROPSY_MAX;
}

/** Stade d'une progression, ou `null` pour un animal sain (absente ou invalide). */
export function dropsyStage(dropsy: number | undefined): DropsyStage | null {
  if (!isDropsyProgress(dropsy)) {
    return null;
  }
  if (dropsy < DROPSY_VISIBLE_AT) {
    return 'debut';
  }
  return dropsy < DROPSY_ADVANCED_AT ? 'gonfle' : 'herisse';
}

/** Vrai si les signes sont visibles (ventre gonflé et stade avancé). */
export function showsDropsy(dropsy: number | undefined): boolean {
  return isDropsyProgress(dropsy) && dropsy >= DROPSY_VISIBLE_AT;
}

/**
 * Gonflement du ventre, dans [0, 1], pour le rendu : 0 sain ou au début, puis linéaire jusqu'au
 * stade avancé, 1 ensuite.
 */
export function dropsySwelling(dropsy: number | undefined): number {
  if (!showsDropsy(dropsy)) {
    return 0;
  }
  return Math.min(
    ((dropsy as number) - DROPSY_VISIBLE_AT) / (DROPSY_ADVANCED_AT - DROPSY_VISIBLE_AT),
    1,
  );
}

/**
 * Écailles hérissées, dans [0, 1], pour le rendu : 0 avant le stade avancé, puis linéaire
 * jusqu'au maximum (une valeur non nulle dès l'entrée dans le stade).
 */
export function dropsyScales(dropsy: number | undefined): number {
  if (dropsyStage(dropsy) !== 'herisse') {
    return 0;
  }
  return ((dropsy as number) - DROPSY_ADVANCED_AT) / (DROPSY_MAX - DROPSY_ADVANCED_AT);
}

/** Poids de la maladie dans la santé : 0 sain ou au début. */
export function dropsyHealthStress(dropsy: number | undefined): number {
  switch (dropsyStage(dropsy)) {
    case 'gonfle':
      return DROPSY_SWOLLEN_HEALTH_STRESS;
    case 'herisse':
      return DROPSY_ADVANCED_HEALTH_STRESS;
    default:
      return 0;
  }
}

/** Tirage d'apparition dans [0, 1) pour l'animal `id` au pas `tick` (hachage sans état). */
export function dropsyDraw(seed: number, tick: number, id: number): number {
  const step = deriveSeed(seed, tick >>> 0);
  return deriveSeed((step ^ DROPSY_SALT) >>> 0, id) / 4294967296;
}

/** Animal vu par la maladie. */
export interface DropsySubject {
  readonly id: number;
  readonly species: SpeciesId;
  readonly health: number;
  dropsy?: number;
}

/** Vrai si l'animal est affaibli (santé finie sous `DROPSY_WEAK_HEALTH`). */
export function isDropsyWeak(health: number): boolean {
  return Number.isFinite(health) && health < DROPSY_WEAK_HEALTH;
}

/**
 * Hydropisie d'un pas de `dt` secondes pour tous les animaux d'un bac, **en place** (aucune
 * allocation). `causes` : causes d'eau dégradée (`finRotCauses`, 0 à 2 ; une valeur non finie
 * ou négative compte pour 0).
 * - Malade en eau dégradée : progresse (jusqu'à `DROPSY_MAX`) ; en eau propre : recule
 *   (`DROPSY_HEAL_SPEED`) et guérit à 0 (champ effacé) avant le stade avancé, inchangé ensuite.
 * - Sain : affaibli en eau dégradée, atteint avec la probabilité `1 − e^(−λ·dt)`,
 *   λ = `causes` × `DROPSY_RATE` ; aucun tirage sinon.
 * Une progression invalide (état corrompu), ou portée par un animal qui ne l'attrape pas ici,
 * est effacée. Renvoie le nombre d'animaux guéris pendant ce pas.
 * @throws RangeError si `dt` n'est pas un réel strictement positif (animaux inchangés).
 */
export function stepDropsyInPlace(
  animals: readonly DropsySubject[],
  dt: number,
  causes: number,
  environment: EnvironmentId,
  seed: number,
  tick: number,
): number {
  assertTimeStep(dt);
  const count = causes > 0 && Number.isFinite(causes) ? causes : 0;
  const chance = count > 0 ? 1 - Math.exp(-count * DROPSY_RATE * dt) : 0;
  let healed = 0;
  for (const animal of animals) {
    const progress = animal.dropsy;
    if (progress !== undefined) {
      if (!isDropsyProgress(progress) || !catchesDropsy(animal.species, environment)) {
        delete animal.dropsy;
        continue;
      }
      if (count > 0) {
        animal.dropsy = Math.min(progress + dt, DROPSY_MAX);
      } else if (progress < DROPSY_ADVANCED_AT) {
        const next = progress - dt * DROPSY_HEAL_SPEED;
        if (next <= 0) {
          delete animal.dropsy;
          healed += 1;
        } else {
          animal.dropsy = next;
        }
      }
      continue;
    }
    if (
      chance > 0 &&
      isDropsyWeak(animal.health) &&
      catchesDropsy(animal.species, environment) &&
      dropsyDraw(seed, tick, animal.id) < chance
    ) {
      animal.dropsy = 0;
    }
  }
  return healed;
}

/**
 * Hydropisie au maximum pour tous les animaux qui peuvent l'attraper (`catchesDropsy`), **en
 * place** : paramètre d'URL `hydropisie=1`, pour l'e2e et les captures. Aucun tirage.
 * `progress` : progression donnée (par défaut `DROPSY_MAX`).
 */
export function dropsyAllInPlace(
  animals: readonly Pick<DropsySubject, 'species' | 'dropsy'>[],
  environment: EnvironmentId,
  progress = DROPSY_MAX,
): void {
  for (const animal of animals) {
    if (catchesDropsy(animal.species, environment)) {
      animal.dropsy = progress;
    }
  }
}
