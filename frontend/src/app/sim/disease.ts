import { deriveSeed } from '../core/random/prng';
import { livesIn, type EnvironmentId } from './environment';
import { SPECIES, type SpeciesId } from './species';
import { assertTimeStep } from './time-step';
import { WATER_TEMPERATURES, targetTemperature, type WaterState } from './water';
import { COMPOUND_THRESHOLDS, TEMPERATURE_THRESHOLDS } from './water-quality';

/**
 * Maladie des points blancs, lot 1/2 (issue #360, ADR 0088) : apparition sous l'effet du
 * stress, cycle simplifié et contagion dans le bac. Le rendu des points et les alertes
 * viennent avec l'issue #366, les traitements avec le lot 2/2.
 *
 * État par animal : `ich`, âge de l'infection en secondes simulées, dans
 * [0, `ICH_AGGRAVATED_AT`] ; absent, l'animal est sain (cas de tous les animaux d'un bac
 * qui n'a jamais été stressé, et de toutes les sauvegardes antérieures). Trois stades :
 * incubation (aucun signe, pas contagieux), points visibles (contagieux, la santé baisse),
 * aggravation (contagieux, la santé baisse deux fois plus vite).
 *
 * Seuls les **poissons d'eau douce** l'attrapent (`catchesIch`) : pas les amphibiens
 * (axolotl, grenouille, triton), ni les espèces ou les bacs de récif. Le projet n'a pas
 * encore d'invertébré.
 *
 * Apparition : un bac est stressé (`ichStress`) par un écart de température important à
 * celle de l'environnement, un changement de température brusque (eau encore loin de la
 * consigne du chauffage), ou une ammoniaque ou des nitrites élevés. Chaque cause ajoute
 * `ICH_STRESS_RATE` au taux d'infection de chaque poisson sain ; chaque poisson contagieux
 * du bac y ajoute `ICH_CONTAGION_RATE`. Un bac sans stress et sans malade ne tombe donc
 * **jamais** malade. L'ajout d'un animal sans quarantaine n'est pas modélisé : la
 * quarantaine n'existe pas encore dans le jeu (ADR 0088).
 *
 * Déterminisme : le tirage d'une infection est un hachage de (graine du monde, pas, animal),
 * sans état : il ne consomme **aucun** sous-générateur, et n'est calculé que si le taux
 * d'infection est non nul. Les mondes sans stress restent identiques au bit près.
 *
 * Toutes les valeurs numériques sont des **approximations de jeu** (temps compressé comme
 * le reste de la simulation) : la durée réelle du cycle d'*Ichthyophthirius* selon la
 * température n'a pas été vérifiée dans une source fiable (`docs/SOINS.md`, § 5.1).
 */

/** Stade de la maladie (`ichStage`). */
export type IchStage = 'incubation' | 'visible' | 'aggravee';

/** Fin de l'incubation, en secondes simulées : les points apparaissent. Approximation de jeu. */
export const ICH_VISIBLE_AT = 300;
/** Début de l'aggravation, en secondes simulées ; l'âge s'arrête là. Approximation de jeu. */
export const ICH_AGGRAVATED_AT = 900;
/**
 * Taux d'infection d'un poisson sain par cause de stress, en s⁻¹ : un bac de 12 poissons
 * sous une cause durable compte un premier cas en 5 minutes simulées en moyenne.
 * Approximation de jeu.
 */
export const ICH_STRESS_RATE = 1 / 3600;
/**
 * Taux d'infection d'un poisson sain par poisson contagieux du même bac, en s⁻¹.
 * Approximation de jeu.
 */
export const ICH_CONTAGION_RATE = 1 / 1800;
/**
 * Poids de la maladie dans la santé (`sim/wellbeing.ts`, `healthStress`) aux stades
 * visible et aggravé, en causes : une demi-cause, puis une cause entière (de 1 au plancher
 * en 8 minutes simulées). Approximation de jeu ; dans la réalité, la mortalité sans
 * traitement est soudaine et élevée (Merck), mais aucun animal ne meurt encore dans le jeu.
 */
export const ICH_VISIBLE_HEALTH_STRESS = 0.5;
export const ICH_AGGRAVATED_HEALTH_STRESS = 1;
/**
 * Écart à la température de l'environnement qui stresse, en °C : celui de l'eau « mauvaise »
 * (`TEMPERATURE_THRESHOLDS.bad`).
 */
export const ICH_TEMPERATURE_GAP = TEMPERATURE_THRESHOLDS.bad;
/**
 * Écart à la température visée (consigne du chauffage) qui signale un changement brusque,
 * en °C : l'eau la rejoint avec une constante de temps de 10 minutes (`sim/water.ts`), soit
 * au moins 18 °C par heure simulée à cet écart. Approximation de jeu.
 */
export const ICH_SHOCK_GAP = 3;
/** Ammoniaque et nitrites qui stressent : le seuil « mauvaise » de chacun (unités de jeu). */
export const ICH_AMMONIA = COMPOUND_THRESHOLDS.ammonia.bad;
export const ICH_NITRITE = COMPOUND_THRESHOLDS.nitrite.bad;

/** Sel du hachage des tirages d'infection (séparé des autres usages de la graine). */
const ICH_SALT = 0x1c4f00d5;

/**
 * Vrai si un animal de l'espèce `species` peut attraper les points blancs dans un bac de
 * l'environnement `environment` : poisson nageur (ni marcheur ni amphibie), d'eau douce
 * (espèce absente du récif, bac autre que le récif).
 */
export function catchesIch(species: SpeciesId, environment: EnvironmentId): boolean {
  const def = SPECIES[species];
  return (
    environment !== 'recif' &&
    def.walker === undefined &&
    def.amphibian === undefined &&
    !livesIn('recif', species)
  );
}

/**
 * Nombre de causes de stress du bac (0 à 4) pour son eau `water` dans l'environnement
 * `environment` : écart de température à l'environnement ≥ `ICH_TEMPERATURE_GAP`, écart à la
 * température visée ≥ `ICH_SHOCK_GAP` (changement brusque), ammoniaque ≥ `ICH_AMMONIA`,
 * nitrites ≥ `ICH_NITRITE`. Une valeur non finie (état corrompu) ne compte pas : la maladie
 * ne naît que d'un stress avéré.
 */
export function ichStress(water: WaterState, environment: EnvironmentId): number {
  const t = water.temperature;
  let causes = 0;
  if (Math.abs(t - WATER_TEMPERATURES[environment]) >= ICH_TEMPERATURE_GAP) {
    causes += 1;
  }
  if (Math.abs(t - targetTemperature(water, environment)) >= ICH_SHOCK_GAP) {
    causes += 1;
  }
  if (water.ammonia >= ICH_AMMONIA) {
    causes += 1;
  }
  if (water.nitrite >= ICH_NITRITE) {
    causes += 1;
  }
  return causes;
}

/** Âge d'infection valide (nombre fini dans [0, `ICH_AGGRAVATED_AT`]). */
export function isIchAge(value: unknown): value is number {
  return typeof value === 'number' && value >= 0 && value <= ICH_AGGRAVATED_AT;
}

/** Stade d'un âge d'infection, ou `null` pour un animal sain (âge absent ou invalide). */
export function ichStage(ich: number | undefined): IchStage | null {
  if (!isIchAge(ich)) {
    return null;
  }
  if (ich < ICH_VISIBLE_AT) {
    return 'incubation';
  }
  return ich < ICH_AGGRAVATED_AT ? 'visible' : 'aggravee';
}

/** Vrai si l'animal transmet la maladie (points visibles ou aggravation). */
export function isIchContagious(ich: number | undefined): boolean {
  return isIchAge(ich) && ich >= ICH_VISIBLE_AT;
}

/**
 * Intensité des signes visibles, dans [0, 1], pour le rendu (issue #366) : 0 sain ou en
 * incubation, puis linéaire jusqu'à 1 au début de l'aggravation.
 */
export function ichSeverity(ich: number | undefined): number {
  if (!isIchContagious(ich)) {
    return 0;
  }
  return ((ich as number) - ICH_VISIBLE_AT) / (ICH_AGGRAVATED_AT - ICH_VISIBLE_AT);
}

/** Poids de la maladie dans la santé (`sim/wellbeing.ts`) : 0 sain ou en incubation. */
export function ichHealthStress(ich: number | undefined): number {
  switch (ichStage(ich)) {
    case 'visible':
      return ICH_VISIBLE_HEALTH_STRESS;
    case 'aggravee':
      return ICH_AGGRAVATED_HEALTH_STRESS;
    default:
      return 0;
  }
}

/**
 * Tirage d'infection dans [0, 1) pour l'animal `id` au pas `tick` du monde de graine `seed` :
 * hachage sans état (aucun sous-générateur consommé).
 */
export function ichDraw(seed: number, tick: number, id: number): number {
  const step = deriveSeed(seed, tick >>> 0);
  return deriveSeed((step ^ ICH_SALT) >>> 0, id) / 4294967296;
}

/** Animal vu par la maladie. */
export interface IchSubject {
  readonly id: number;
  readonly species: SpeciesId;
  ich?: number;
}

/**
 * Maladie d'un pas de `dt` secondes pour tous les animaux d'un bac, **en place** (aucune
 * allocation) : les infections en cours vieillissent (jusqu'à `ICH_AGGRAVATED_AT`), puis
 * chaque poisson sain qui peut l'attraper (`catchesIch`) est infecté avec la probabilité
 * `1 − e^(−λ·dt)`, où λ = `stress · ICH_STRESS_RATE + contagieux · ICH_CONTAGION_RATE`. Le
 * nombre de contagieux est compté au début du pas : le résultat ne dépend pas de l'ordre des
 * animaux. Un âge d'infection invalide (non fini, hors bornes : état corrompu) est effacé.
 * `stress` : causes de stress du bac (`ichStress`) ; une valeur non finie ou négative compte
 * pour 0. `seed`, `tick` : graine du monde et numéro du pas, pour les tirages (`ichDraw`).
 * @throws RangeError si `dt` n'est pas un réel strictement positif (animaux inchangés).
 */
export function stepIchInPlace(
  animals: readonly IchSubject[],
  dt: number,
  stress: number,
  environment: EnvironmentId,
  seed: number,
  tick: number,
): void {
  assertTimeStep(dt);
  let contagious = 0;
  let infected = 0;
  for (const animal of animals) {
    if (animal.ich === undefined) {
      continue;
    }
    if (!isIchAge(animal.ich)) {
      delete animal.ich;
      continue;
    }
    infected += 1;
    if (animal.ich >= ICH_VISIBLE_AT && catchesIch(animal.species, environment)) {
      contagious += 1;
    }
  }
  const causes = stress > 0 && Number.isFinite(stress) ? stress : 0;
  const rate = causes * ICH_STRESS_RATE + contagious * ICH_CONTAGION_RATE;
  if (infected === 0 && rate === 0) {
    // Bac sain et sans stress : rien à faire, aucun tirage.
    return;
  }
  const chance = 1 - Math.exp(-rate * dt);
  for (const animal of animals) {
    if (animal.ich !== undefined) {
      animal.ich = Math.min(animal.ich + dt, ICH_AGGRAVATED_AT);
    } else if (
      chance > 0 &&
      catchesIch(animal.species, environment) &&
      ichDraw(seed, tick, animal.id) < chance
    ) {
      animal.ich = 0;
    }
  }
}
