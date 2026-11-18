import { algaeGrowth, cachedAlgaePatches, hasAlgae, lightingOf, stepAlgaeInPlace } from './algae';
import { catappaActive } from './catappa';
import { ichStress, stepIchInPlace } from './disease';
import { stepDropsyInPlace } from './dropsy';
import { environmentWater } from './environment';
import { finRotCauses, stepFinRotInPlace } from './fin-rot';
import { addDecayedFoodInPlace } from './food-decay';
import { stepFungusInPlace } from './fungus';
import { deadLoad } from './mortality';
import {
  hasPlantGrowth,
  plantLightFactor,
  stepPlantGrowthInPlace,
  type MutablePlantGrowth,
} from './plant-growth';
import { plantGrowthFactor } from './side-effects';
import { SPECIES, type SpeciesDefinition, type SpeciesId } from './species';
import { ichProtected, medicationProtects, stepTreatmentInPlace } from './treatment';
import { stepVelvetInPlace } from './velvet';
import {
  stepWaterInPlace,
  targetTemperature,
  waterLiters,
  waterLoad,
  type MutableWaterState,
} from './water';
import { waterQuality } from './water-quality';
import { stepWellbeingInPlace } from './wellbeing';
import type { Entity, Mutable, MutableWorld } from './world-types';

/**
 * Étapes « vivantes » du pas de simulation (`stepInPlace`, `sim/world.ts`, lot 2 du chantier
 * #686) : eau, algues, plantes, maladies et santé, appelées après la nage et les repas, dans
 * l'ordre décrit par `docs/ARCHITECTURE.md` (« Pas de simulation »). Aucune n'alloue par pas ;
 * chacune ne lit que le monde et ce qu'on lui passe. Ces étapes sont en pause en mode décor.
 */

/**
 * Eau (issues #206 et #638) : l'ammoniaque des granulés décomposés (`decayed`, masse du pas)
 * entre dans l'eau avant le pas d'eau, donc n'est convertie qu'au pas suivant, comme celle des
 * déchets ; puis le pas d'eau, sans hasard, après les poissons (ne change rien à leur nage).
 */
export function stepWaterStageInPlace(world: MutableWorld, dt: number, decayed: number): void {
  const water = world.water as MutableWaterState;
  const liters = waterLiters(environmentWater(world));
  if (decayed > 0) {
    addDecayedFoodInPlace(water, decayed, liters);
  }
  stepWaterInPlace(
    water,
    dt,
    waterLoad(world.entities) + deadLoad(world.dead),
    liters,
    targetTemperature(world.water, world.environment),
  );
}

/**
 * Algues (issue #476) : sans hasard, sur les nitrates de fin de pas ; sans pousse (éclairage
 * normal, eau propre), rien n'est calculé ni écrit.
 */
export function stepAlgaeStageInPlace(world: MutableWorld, dt: number): void {
  if (
    hasAlgae(world.environment) &&
    algaeGrowth(lightingOf(world.water), world.water.nitrate) > 0
  ) {
    stepAlgaeInPlace(
      world.water as MutableWaterState,
      dt,
      cachedAlgaePatches(world.seed, environmentWater(world)),
    );
  }
}

/**
 * Plantes à tige (issue #477) : pousse sans hasard, jusqu'à la surface, ralentie par le sel
 * (effet secondaire, #549) et par un éclairage court (lampe, #584).
 */
export function stepPlantsStageInPlace(world: MutableWorld, dt: number): void {
  if (!hasPlantGrowth(world.environment)) {
    return;
  }
  const water = world.water as MutableWaterState;
  const growth = stepPlantGrowthInPlace(
    water.plantGrowth as MutablePlantGrowth | undefined,
    world.decor,
    dt,
    environmentWater(world).maxY,
    plantGrowthFactor(water) * plantLightFactor(lightingOf(water)),
  );
  if (growth !== undefined && water.plantGrowth === undefined) {
    water.plantGrowth = growth;
  }
}

/**
 * Maladies, sur l'eau de fin de pas, dans cet ordre (chacune tire sur `seed` et `tick`, sans
 * toucher aux générateurs des poissons ; aucun tirage pour un bac sain) :
 * 1. points blancs (#360) : un traitement efficace (#361) empêche toute nouvelle infection ;
 * 2. velours (#532) : même stress, contagion lente, reculé par le médicament ;
 * 3. champignons (#548) : seulement sur un animal blessé ou affaibli, jamais spontanés ;
 * 4. dégradation du traitement dans l'eau ;
 * 5. pourriture des nageoires (#485) : tirage d'apparition seulement en eau chargée ;
 * 6. hydropisie (#565) : tirage seulement pour un animal affaibli en eau chargée.
 * Le médicament est lu sur l'eau du début de l'étape, avant sa dégradation.
 */
export function stepDiseasesInPlace(world: MutableWorld, dt: number): void {
  const fishes = world.entities as Mutable<Entity>[];
  const { environment, seed, tick } = world;
  const stress = ichStress(world.water, environment);
  stepIchInPlace(fishes, dt, stress, environment, seed, tick, ichProtected(world.water));
  stepVelvetInPlace(fishes, dt, stress, environment, seed, tick, medicationProtects(world.water));
  stepFungusInPlace(
    fishes,
    dt,
    environment,
    seed,
    tick,
    medicationProtects(world.water),
    finRotCauses(world.water) === 0,
  );
  stepTreatmentInPlace(world.water as MutableWaterState, fishes, dt);
  stepFinRotInPlace(fishes, dt, finRotCauses(world.water), environment, seed, tick);
  stepDropsyInPlace(fishes, dt, finRotCauses(world.water), environment, seed, tick);
}

/**
 * Santé (issue #208) : sur la faim de fin de pas (après les repas) et l'eau du pas (pH
 * compris, issue #236), sans hasard ; à santé pleine, la nage reste exactement celle d'avant.
 */
export function stepHealthStageInPlace(world: MutableWorld, dt: number): void {
  stepWellbeingInPlace(
    world.entities as Mutable<Entity>[],
    dt,
    waterQuality(world.water, world.environment) === 'mauvaise',
    speciesById,
    world.water.ph,
    catappaActive(world.water.catappa),
  );
}

function speciesById(species: SpeciesId): SpeciesDefinition {
  return SPECIES[species];
}
