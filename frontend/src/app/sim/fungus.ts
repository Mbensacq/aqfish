import { deriveSeed } from '../core/random/prng';
import { DEFAULT_DAY_LENGTH_SECONDS } from './daylight';
import { catchesIch, isIchContagious } from './disease';
import type { EnvironmentId } from './environment';
import { showsFinRot } from './fin-rot';
import type { SpeciesId } from './species';
import { assertTimeStep } from './time-step';
import { showsVelvet } from './velvet';

/**
 * Champignons (Saprolegnia, oomycètes, issue #548, ADR 0128) : quatrième maladie simulée, après
 * les points blancs (`sim/disease.ts`), la pourriture des nageoires (`sim/fin-rot.ts`) et le
 * velours (`sim/velvet.ts`). Infection opportuniste qui s'installe sur une peau abîmée ou un
 * animal affaibli et forme un voile blanc cotonneux (`docs/SOINS.md` §§ 5.6 et 5.12).
 *
 * État par animal : `fungus`, progression en secondes simulées dans [0, `FUNGUS_MAX`] ; absent,
 * l'animal est sain (tous les animaux d'un bac sain, et toutes les sauvegardes antérieures).
 * Trois stades : début (aucun signe), coton visible (la santé baisse), stade avancé (la santé
 * baisse deux fois plus vite).
 *
 * Apparition : **jamais spontanée**. Seul un animal qui a une porte d'entrée peut l'attraper
 * (`fungusCauses`, 0 à 2) : une blessure (signes visibles d'une autre maladie : points blancs,
 * nageoires effilochées ou velours ; les blessures de territoire ne sont pas modélisées,
 * ADR 0106) ou un affaiblissement (santé sous `FUNGUS_WEAK_HEALTH`). Un animal sain en eau
 * propre n'a aucune cause : aucun tirage, aucune infection. Pas de contagion (hors périmètre) :
 * approximation de jeu, les spores sont considérées comme présentes dans tout bac.
 *
 * Traitement : le médicament du panneau « Soins » (`medicationProtects`) tant qu'il agit,
 * dans une **eau propre** (`finRotCauses` nul : ni ammoniaque ni nitrites au seuil
 * « mauvaise ») : le coton recule (`FUNGUS_HEAL_SPEED`) jusqu'à la guérison. Médicament dans
 * une eau chargée : la maladie ne progresse plus mais ne recule pas. Sans médicament, elle
 * progresse jusqu'au maximum, même si la porte d'entrée s'est refermée. Le sel et la chaleur
 * n'y font rien (approximation de jeu, mise en garde `FUNGUS_WRONG_TREATMENT`). Un second
 * médicament ne soigne pas plus vite : la guérison dépend de « médicament actif », pas de la dose.
 *
 * Déterminisme : tirage d'apparition par hachage sans état de (graine, pas, animal), avec son
 * propre sel ; aucun sous-générateur consommé, aucun tirage pour un animal sans cause.
 *
 * Toutes les valeurs numériques sont des **approximations de jeu** (temps compressé, une
 * journée de 20 minutes) : aucune source consultée ne chiffre le délai d'apparition ni la durée
 * de la guérison (`docs/SOINS.md` § 5.6).
 */

/** Stade de la maladie (`fungusStage`). */
export type FungusStage = 'debut' | 'coton' | 'avance';

/** Fin du début sans signe, en s : le coton apparaît. Approximation de jeu. */
export const FUNGUS_VISIBLE_AT = 180;
/** Début du stade avancé, en s. Approximation de jeu. */
export const FUNGUS_ADVANCED_AT = 600;
/** Progression maximale, en s : la maladie s'arrête là sans traitement. */
export const FUNGUS_MAX = 900;
/** Journées simulées de médicament pour guérir un animal au maximum. Approximation de jeu. */
export const FUNGUS_CURE_DAYS = 2;
/**
 * Recul du coton sous médicament en eau propre, en secondes de progression par seconde
 * simulée : un animal au maximum guérit en `FUNGUS_CURE_DAYS` journées simulées.
 */
export const FUNGUS_HEAL_SPEED = FUNGUS_MAX / (FUNGUS_CURE_DAYS * DEFAULT_DAY_LENGTH_SECONDS);
/**
 * Taux d'apparition chez un animal par porte d'entrée, en s⁻¹ : un animal blessé et affaibli
 * se couvre de coton en une demi-heure simulée en moyenne. Approximation de jeu.
 */
export const FUNGUS_RATE = 1 / 3600;
/** Santé sous laquelle un animal est affaibli (porte d'entrée). Approximation de jeu. */
export const FUNGUS_WEAK_HEALTH = 0.5;
/** Poids dans la santé (`sim/wellbeing.ts`) : coton visible, puis stade avancé. */
export const FUNGUS_VISIBLE_HEALTH_STRESS = 0.5;
export const FUNGUS_ADVANCED_HEALTH_STRESS = 1;

/**
 * Mise en garde d'un sel ou d'une chaleur donnés à un bac qui compte un cas de champignons
 * (issue #548) : dans le jeu, seul le médicament, en eau propre, le fait reculer.
 */
export const FUNGUS_WRONG_TREATMENT =
  'Champignons : le sel et la chaleur ne les soignent pas ; médicament et eau propre (approximation de jeu).';

/** Sel des tirages d'apparition (distinct des autres maladies). */
const FUNGUS_SALT = 0x5a9f0c3b;

/** Vrai si un animal de l'espèce `species` peut l'attraper : poisson nageur d'eau douce. */
export function catchesFungus(species: SpeciesId, environment: EnvironmentId): boolean {
  return catchesIch(species, environment);
}

/** Progression valide (nombre fini dans [0, `FUNGUS_MAX`]). */
export function isFungusProgress(value: unknown): value is number {
  return typeof value === 'number' && value >= 0 && value <= FUNGUS_MAX;
}

/** Stade d'une progression, ou `null` pour un animal sain (absente ou invalide). */
export function fungusStage(fungus: number | undefined): FungusStage | null {
  if (!isFungusProgress(fungus)) {
    return null;
  }
  if (fungus < FUNGUS_VISIBLE_AT) {
    return 'debut';
  }
  return fungus < FUNGUS_ADVANCED_AT ? 'coton' : 'avance';
}

/** Vrai si le coton est visible (stades coton et avancé). */
export function showsFungus(fungus: number | undefined): boolean {
  return isFungusProgress(fungus) && fungus >= FUNGUS_VISIBLE_AT;
}

/** Intensité des signes, dans [0, 1], pour le rendu : 0 sain ou au début, puis linéaire. */
export function fungusSeverity(fungus: number | undefined): number {
  if (!showsFungus(fungus)) {
    return 0;
  }
  return ((fungus as number) - FUNGUS_VISIBLE_AT) / (FUNGUS_MAX - FUNGUS_VISIBLE_AT);
}

/** Poids de la maladie dans la santé : 0 sain ou au début. */
export function fungusHealthStress(fungus: number | undefined): number {
  switch (fungusStage(fungus)) {
    case 'coton':
      return FUNGUS_VISIBLE_HEALTH_STRESS;
    case 'avance':
      return FUNGUS_ADVANCED_HEALTH_STRESS;
    default:
      return 0;
  }
}

/** Tirage d'apparition dans [0, 1) pour l'animal `id` au pas `tick` (hachage sans état). */
export function fungusDraw(seed: number, tick: number, id: number): number {
  const step = deriveSeed(seed, tick >>> 0);
  return deriveSeed((step ^ FUNGUS_SALT) >>> 0, id) / 4294967296;
}

/** Animal vu par la maladie. */
export interface FungusSubject {
  readonly id: number;
  readonly species: SpeciesId;
  readonly health: number;
  readonly ich?: number;
  readonly finRot?: number;
  readonly velvet?: number;
  fungus?: number;
}

/** Vrai si l'animal porte une blessure : signes visibles d'une autre maladie. */
export function isWounded(animal: Omit<FungusSubject, 'id' | 'species' | 'health'>): boolean {
  return isIchContagious(animal.ich) || showsFinRot(animal.finRot) || showsVelvet(animal.velvet);
}

/**
 * Portes d'entrée d'un animal (0 à 2) : blessure (`isWounded`), affaiblissement (santé finie
 * sous `FUNGUS_WEAK_HEALTH`). Une santé non finie ne compte pas (état corrompu : aucune
 * maladie n'en naît).
 */
export function fungusCauses(animal: Omit<FungusSubject, 'id' | 'species'>): number {
  const weak = Number.isFinite(animal.health) && animal.health < FUNGUS_WEAK_HEALTH ? 1 : 0;
  return (isWounded(animal) ? 1 : 0) + weak;
}

/**
 * Champignons d'un pas de `dt` secondes pour tous les animaux d'un bac, **en place** (aucune
 * allocation). `treated` : le médicament agit (`medicationProtects`) ; `cleanWater` : ni
 * ammoniaque ni nitrites au seuil « mauvaise » (`finRotCauses` nul).
 * - Malade sans médicament : progresse (jusqu'à `FUNGUS_MAX`) ; sous médicament en eau propre :
 *   recule (`FUNGUS_HEAL_SPEED`) et guérit à 0 (champ effacé) ; sous médicament en eau
 *   chargée : inchangé.
 * - Sain : sans médicament, infecté avec la probabilité `1 − e^(−λ·dt)`,
 *   λ = `fungusCauses` × `FUNGUS_RATE` ; aucun tirage sans cause ni sous médicament.
 * Une progression invalide (état corrompu), ou portée par un animal qui ne l'attrape pas ici,
 * est effacée. Renvoie le nombre d'animaux guéris pendant ce pas.
 * @throws RangeError si `dt` n'est pas un réel strictement positif (animaux inchangés).
 */
export function stepFungusInPlace(
  animals: readonly FungusSubject[],
  dt: number,
  environment: EnvironmentId,
  seed: number,
  tick: number,
  treated = false,
  cleanWater = true,
): number {
  assertTimeStep(dt);
  let healed = 0;
  for (const animal of animals) {
    const progress = animal.fungus;
    if (progress !== undefined) {
      if (!isFungusProgress(progress) || !catchesFungus(animal.species, environment)) {
        delete animal.fungus;
        continue;
      }
      if (!treated) {
        animal.fungus = Math.min(progress + dt, FUNGUS_MAX);
      } else if (cleanWater) {
        const next = progress - dt * FUNGUS_HEAL_SPEED;
        if (next <= 0) {
          delete animal.fungus;
          healed += 1;
        } else {
          animal.fungus = next;
        }
      }
      continue;
    }
    if (treated || !catchesFungus(animal.species, environment)) {
      continue;
    }
    const causes = fungusCauses(animal);
    if (causes === 0) {
      continue;
    }
    if (fungusDraw(seed, tick, animal.id) < 1 - Math.exp(-causes * FUNGUS_RATE * dt)) {
      animal.fungus = 0;
    }
  }
  return healed;
}

/**
 * Champignons au maximum pour tous les animaux qui peuvent l'attraper (`catchesFungus`), **en
 * place** : paramètre d'URL `champignons=1`, pour l'e2e et les captures. Aucun tirage.
 */
export function fungusAllInPlace(
  animals: readonly Pick<FungusSubject, 'species' | 'fungus'>[],
  environment: EnvironmentId,
): void {
  for (const animal of animals) {
    if (catchesFungus(animal.species, environment)) {
      animal.fungus = FUNGUS_MAX;
    }
  }
}
