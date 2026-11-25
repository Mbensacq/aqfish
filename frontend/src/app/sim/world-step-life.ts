import { algaeGrowth, cachedAlgaePatches, hasAlgae, lightingOf, stepAlgaeInPlace } from './algae';
import { catappaActive } from './catappa';
import { ichStress, stepIchInPlace } from './disease';
import { stepDropsyInPlace } from './dropsy';
import { environmentWater } from './environment';
import { finRotCauses, stepFinRotInPlace } from './fin-rot';
import { addDecayedFoodInPlace, addEatenFoodInPlace } from './food-decay';
import { grazeAlgaeInPlace } from './grazing';
import { stepFungusInPlace } from './fungus';
import { deadLoad } from './mortality';
import {
  hasPlantGrowth,
  plantLightFactor,
  stepPlantGrowthInPlace,
  type MutablePlantGrowth,
} from './plant-growth';
import {
  absorbNitrogenInPlace,
  nitrogenGrowthFactor,
  phAfterUptake,
  plantUptakeCapacity,
} from './plant-uptake';
import { plantGrowthFactor } from './side-effects';
import { SPECIES, type SpeciesDefinition, type SpeciesId } from './species';
import { ichProtected, medicationProtects, stepTreatmentInPlace } from './treatment';
import { stepVelvetInPlace } from './velvet';
import {
  AMMONIA_PER_LOAD_LITER,
  MAX_CONCENTRATIONS,
  RESTING_AMMONIA_PER_LOAD_LITER,
  stepWaterInPlace,
  targetTemperature,
  waterLiters,
  waterLoad,
  type MutableWaterState,
} from './water';
import { freshPh } from './water-ph';
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
 * Eau (issues #206, #638 et #798) : l'ammoniaque de la nourriture du pas, pourrie (`decayed`)
 * et mangée (`eaten`, masses du pas, `sim/food-decay.ts`), et celle des corps en décomposition
 * entrent dans l'eau avant le pas d'eau, donc ne sont converties qu'au pas suivant, comme
 * celle produite au repos ; puis le pas d'eau, sans hasard, après les poissons (ne change rien
 * à leur nage).
 */
export function stepWaterStageInPlace(
  world: MutableWorld,
  dt: number,
  decayed: number,
  eaten: number,
): void {
  const water = world.water as MutableWaterState;
  const liters = waterLiters(environmentWater(world));
  if (decayed > 0) {
    addDecayedFoodInPlace(water, decayed, liters);
  }
  if (eaten > 0) {
    addEatenFoodInPlace(water, eaten, liters);
  }
  stepLivingWaterInPlace(world, dt, liters);
}

/**
 * Pas d'eau des habitants dans `liters` litres (issue #799) : corps en décomposition, puis
 * `stepWaterInPlace` (part au repos, filtre, température, pH). Partagé par le pas fin
 * (`stepWaterStageInPlace`) et l'avance à gros pas (`sim/ecosystem-step.ts`), qui peut imposer
 * un volume.
 */
export function stepLivingWaterInPlace(world: MutableWorld, dt: number, liters: number): void {
  const water = world.water as MutableWaterState;
  const bodies = deadLoad(world.dead);
  if (bodies > 0) {
    addBodyDecayInPlace(water, bodies, liters, dt);
  }
  stepWaterInPlace(
    water,
    dt,
    waterLoad(world.entities) + bodies,
    liters,
    targetTemperature(world.water, world.environment),
  );
}

/**
 * Corps en décomposition (issue #582) : un corps ne mange pas, mais pourrit au rythme d'avant
 * l'issue #798. Sa charge (`deadLoad`) passe par `stepWaterInPlace` pour la part « au repos »
 * (`RESTING_AMMONIA_PER_LOAD_LITER`) et le pH ; le reste de `AMMONIA_PER_LOAD_LITER` est
 * ajouté ici, plafonné à `MAX_CONCENTRATIONS.ammonia`.
 */
function addBodyDecayInPlace(
  water: MutableWaterState,
  bodies: number,
  liters: number,
  dt: number,
): void {
  const rest = AMMONIA_PER_LOAD_LITER - RESTING_AMMONIA_PER_LOAD_LITER;
  water.ammonia = Math.min(
    MAX_CONCENTRATIONS.ammonia,
    water.ammonia + ((rest * bodies) / liters) * dt,
  );
}

/**
 * Algues (issue #476) : sans hasard, sur les nitrates de fin de pas ; sans pousse (éclairage
 * normal, eau propre), rien n'est calculé ni écrit. Puis les brouteurs les mangent (#833,
 * `sim/grazing.ts`) ; sans algues, rien n'est calculé.
 */
export function stepAlgaeStageInPlace(world: MutableWorld, dt: number): void {
  if (!hasAlgae(world.environment)) {
    return;
  }
  const water = world.water as MutableWaterState;
  if (algaeGrowth(lightingOf(water), water.nitrate) > 0) {
    stepAlgaeInPlace(water, dt, cachedAlgaePatches(world.seed, environmentWater(world)));
  }
  if (water.algae !== undefined) {
    grazeAlgaeInPlace(water, world.entities as Mutable<Entity>[], dt);
  }
}

/**
 * Plantes (issues #477 et #821) : elles absorbent l'azote dans `liters` litres (défaut : ceux
 * du bac), l'ammonium d'abord, selon leur masse et la lumière (`sim/plant-uptake.ts`), sur
 * l'eau de fin de pas, avant les algues du pas suivant ; puis les plantes à tige poussent sans
 * hasard, jusqu'à la surface, ralenties par le sel (effet secondaire, #549), un éclairage
 * court (lampe, #584) et le manque d'azote (#821).
 */
export function stepPlantsStageInPlace(
  world: MutableWorld,
  dt: number,
  liters = waterLiters(environmentWater(world)),
): void {
  if (!hasPlantGrowth(world.environment)) {
    return;
  }
  const water = world.water as MutableWaterState;
  const surface = environmentWater(world).maxY;
  const light = plantLightFactor(lightingOf(water));
  const absorbed = absorbNitrogenInPlace(
    water,
    plantUptakeCapacity(world.decor, water.plantGrowth, surface, light),
    liters,
    dt,
  );
  water.ph = phAfterUptake(water.ph, absorbed, freshPh(world.environment));
  const growth = stepPlantGrowthInPlace(
    water.plantGrowth as MutablePlantGrowth | undefined,
    world.decor,
    dt,
    surface,
    plantGrowthFactor(water) * light * nitrogenGrowthFactor(water),
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
