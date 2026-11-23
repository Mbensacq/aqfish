import { environmentWater } from './environment';
import { growHunger, isHungry, satiate } from './feeding';
import { FOOD_SIZE_FACTORS } from './food';
import { addEatenFoodInPlace } from './food-decay';
import { SPECIES } from './species';
import { assertTimeStep } from './time-step';
import { waterLiters, type MutableWaterState } from './water';
import { feedsOnPellets } from './wellbeing';
import {
  stepAlgaeStageInPlace,
  stepHealthStageInPlace,
  stepLivingWaterInPlace,
  stepPlantsStageInPlace,
} from './world-step-life';
import type { Entity, Mutable, MutableWorld } from './world-types';

/**
 * Avance « écosystème » à gros pas (issue #799, tranche 2c de #728, ADR 0169,
 * `docs/ECOSYSTEME.md` § 3.4) : eau, algues, plantes, faim et santé d'un bac, **sans** la nage
 * des animaux, la nourriture qui tombe, les maladies (tirées au hasard), la mortalité ni le
 * rendu. L'équilibre d'un bac se juge sur des semaines simulées : cette avance les fait tourner
 * en quelques secondes, pour les scénarios de référence (`docs/ECOSYSTEME.md` § 4).
 *
 * Chaque pas appelle les mêmes étapes que le pas fin du monde (`sim/world-step-life.ts`), dans
 * le même ordre : faim (comme la nage), eau, algues, plantes, santé. Toutes sont intégrées sous
 * une forme stable quel que soit le pas (exponentielles, logistique, bornes) : à gros pas, le
 * résultat reste proche de celui du pas fin (tolérance dans `ecosystem-step.spec.ts`). Rien
 * n'est tiré au hasard : même monde, même résultat.
 *
 * Le volume d'eau peut être imposé (`liters`) pour simuler un bac plus petit que ce que
 * permettent les dimensions réglables (bocal de 10 L du scénario S1).
 */

/**
 * Pas long par défaut, en secondes simulées : 300 pas fins. L'ammoniaque produite pendant un pas
 * n'est convertie qu'au pas suivant (`stepWaterInPlace`) : l'écart avec le pas fin vaut environ
 * `pas × AMMONIA_CONVERSION` (≈ 4 % à 5 s, 27 % à 60 s, mesuré). À 5 s, trois mois simulés
 * d'un bac peuplé tournent en une fraction de seconde.
 */
export const ECOSYSTEM_STEP_SECONDS = 5;

/**
 * Masse moyenne d'un granulé (`pelletMass`), sur les tailles tirées à parts égales
 * (`FOOD_SIZE_FACTORS`) : masse d'un granulé mangé par `feedAnimalsInPlace`.
 */
export const MEAN_PELLET_MASS =
  FOOD_SIZE_FACTORS.reduce((sum, size) => sum + size * size * size, 0) / FOOD_SIZE_FACTORS.length;

/** Réglages de l'avance à gros pas. */
export interface EcosystemOptions {
  /** Pas, en secondes simulées (défaut : `ECOSYSTEM_STEP_SECONDS`). */
  readonly stepSeconds?: number;
  /** Volume d'eau imposé, en litres (défaut : celui de la boîte d'eau du monde). */
  readonly liters?: number;
}

/**
 * Litres d'eau vus par l'avance : `liters` imposé, ou ceux de la boîte d'eau de `world`.
 * @throws RangeError si `liters` est donné et n'est pas un réel strictement positif.
 */
export function ecosystemLiters(world: MutableWorld, liters?: number): number {
  if (liters === undefined) {
    return waterLiters(environmentWater(world));
  }
  if (!(liters > 0) || !Number.isFinite(liters)) {
    throw new RangeError(`liters doit être un réel strictement positif (reçu : ${liters})`);
  }
  return liters;
}

/**
 * Fait avancer `world` de `durationSeconds` secondes simulées **en le modifiant**, par pas de
 * `options.stepSeconds` (le dernier pas, plus court, finit la durée). Le temps du monde
 * (`time`) avance d'autant ; le compteur de pas fins (`tick`) ne bouge pas. En mode décor
 * (#278), seul le temps avance, comme l'eau et la faim du pas fin y sont en pause. Une durée
 * nulle ne change rien.
 * @throws RangeError si `durationSeconds` n'est pas un réel positif ou nul, si le pas n'est pas
 * un réel strictement positif, ou si `options.liters` est invalide (monde inchangé).
 */
export function advanceEcosystemInPlace(
  world: MutableWorld,
  durationSeconds: number,
  options: EcosystemOptions = {},
): void {
  if (!(durationSeconds >= 0) || !Number.isFinite(durationSeconds)) {
    throw new RangeError(
      `durationSeconds doit être un réel positif ou nul (reçu : ${durationSeconds})`,
    );
  }
  const stepSeconds = options.stepSeconds ?? ECOSYSTEM_STEP_SECONDS;
  assertTimeStep(stepSeconds);
  const liters = ecosystemLiters(world, options.liters);
  const steps = Math.floor(durationSeconds / stepSeconds);
  for (let i = 0; i < steps; i++) {
    stepEcosystemInPlace(world, stepSeconds, liters);
  }
  const rest = durationSeconds - steps * stepSeconds;
  if (rest > 0) {
    stepEcosystemInPlace(world, rest, liters);
  }
}

function stepEcosystemInPlace(world: MutableWorld, dt: number, liters: number): void {
  world.time += dt;
  if (world.careMode === 'decor') {
    return;
  }
  const animals = world.entities as Mutable<Entity>[];
  for (const animal of animals) {
    animal.hunger = growHunger(animal.hunger, SPECIES[animal.species], dt);
  }
  stepLivingWaterInPlace(world, dt, liters);
  stepAlgaeStageInPlace(world, dt);
  stepPlantsStageInPlace(world, dt);
  stepHealthStageInPlace(world, dt);
}

/**
 * Repas sans nage, **en modifiant** `world` : chaque animal qui mange les granulés
 * (`feedsOnPellets`) et a faim (`isHungry`) en mange jusqu'à ne plus avoir faim, de masse
 * `MEAN_PELLET_MASS` chacun ; l'ammoniaque des repas entre dans l'eau
 * (`addEatenFoodInPlace`, ADR 0168) dans `liters` litres (défaut : ceux du monde). Rien ne
 * tombe ni ne pourrit : c'est un nourrissage « juste ce qu'il faut ». Renvoie la masse mangée.
 * @throws RangeError si `liters` est donné et n'est pas un réel strictement positif.
 */
export function feedAnimalsInPlace(world: MutableWorld, liters?: number): number {
  const volume = ecosystemLiters(world, liters);
  let mass = 0;
  for (const animal of world.entities as Mutable<Entity>[]) {
    if (!feedsOnPellets(SPECIES[animal.species])) {
      continue;
    }
    while (isHungry(animal.hunger)) {
      animal.hunger = satiate(animal.hunger);
      mass += MEAN_PELLET_MASS;
    }
  }
  if (mass > 0) {
    addEatenFoodInPlace(world.water as MutableWaterState, mass, volume);
  }
  return mass;
}
