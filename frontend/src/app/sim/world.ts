import {
  BACTERIA_STARTER_DOSE,
  doseBacteriaStarterInPlace,
  type BacteriaStarterOutcome,
} from './bacteria-starter';
import { assertSeed } from '../core/random/prng';
import { createWalker, stepWalker, type WalkerGround } from './axolotl';
import { createFrog, stepFrog } from './frog';
import {
  deadBody,
  deadLoad,
  splitDeaths,
  stepDeadInPlace,
  toxicWater,
  type DeadAnimal,
} from './mortality';
import { behaviorTarget, hasLandedFood, speciesBehavior, type BehaviorContext } from './behaviors';
import { bubbleSourceFor, fillBubbles, type BubbleBuffer } from './bubbles';
import { addRivalSteering, enforceRivalDistance, hasRivals } from './compatibility';
import type { CareMode } from './care-mode';
import { catappaActive, withCatappaCount } from './catappa';
import { MAX_TOTAL_FISH, SIM_DT } from './constants';
import { dayIntensityAt, hourAt, type DayClock } from './daylight';
import { nightRest } from './day-rhythm';
import { setLampOnInPlace } from './lamp';
import {
  createFeeder,
  feederHours,
  feederSpot,
  hasFeeder,
  rationsDue,
  refillFeederInPlace,
  takeRationsInPlace,
  type FeederState,
} from './auto-feeder';
import {
  hasPlantGrowth,
  isGrowingPlant,
  plantShade,
  prunePlantInPlace,
  plantLightFactor,
  shownGrowth,
  stepPlantGrowthInPlace,
  type MutablePlantGrowth,
} from './plant-growth';
import {
  algaeGrowth,
  cachedAlgaePatches,
  hasAlgae,
  lightingOf,
  scrapeAlgaeInPlace,
  scrapedPatch,
  scrapedPatchesAlong,
  type ScraperRay,
  setLightingInPlace,
  stepAlgaeInPlace,
  type AlgaePatch,
} from './algae';
import {
  anemoneFootprints,
  anemoneHomes,
  anemoneLayout,
  anemoneObstacles,
  type Anemone,
  type AnemoneHome,
} from './anemones';
import { coralLayout, coralObstacles, type CoralColony } from './corals';
import { decorObstacles, parseDecorItems, type DecorItem } from './decor';
import { ichStress, infectAllInPlace, isIchAge, stepIchInPlace } from './disease';
import { finRotCauses, rotAllFinsInPlace, stepFinRotInPlace } from './fin-rot';
import { isVelvetProgress, stepVelvetInPlace, velvetAllInPlace } from './velvet';
import { fungusAllInPlace, isFungusProgress, stepFungusInPlace } from './fungus';
import { dropsyAllInPlace, isDropsyProgress, stepDropsyInPlace } from './dropsy';
import { TAP_RADIUS, tapGlassInPlace, type GlassPoint } from './glass-tap';
import {
  DEFAULT_ENVIRONMENT_ID,
  environmentById,
  environmentWater,
  isImmersiveEnvironment,
  isPondShapeable,
  isTankResizable,
  PLACE_CACHE_LIMIT,
  placeDimensions,
  placeEnvironment,
  placeKey,
  placeShape,
  type EnvironmentId,
  type Place,
} from './environment';
import { eatInPlace, feedingBand, foodTarget, type FeedingBand } from './feeding';
import {
  birthBounds,
  broodIndexAt,
  broodSize,
  canBreed,
  eatFryInPlace,
  FRY_GROWTH_TIME,
  FRY_STAGES,
  fryPlants,
  fryTarget,
  growFryInPlace,
  hasFry,
  isFemale,
  isFry,
  type BroodConditions,
} from './fry';
import {
  ageEggsInPlace,
  clutchSize,
  eatEggsInPlace,
  EGG_HATCH_TIME,
  EGG_SPECIES,
  eggRoom,
  fitSpawners,
  layClutch,
  SPAWN_MIN_ADULTS,
  spawnIndexAt,
  waterAllowsSpawn,
  type Egg,
  type MutableEgg,
  type SpawnConditions,
} from './eggs';
import { computeSchoolSteering, enforceMinDistance, type Vec3 } from './flocking';
import {
  dropFoodInPlace,
  FOOD_DROP_RADIUS,
  FOOD_RADIUS,
  stepFoodInPlace,
  type FoodPellet,
} from './food';
import { siphonedFood, siphonFloorPoint, type FloorPoint } from './siphon';
import { validateObstacle, type Obstacle } from './obstacles';
import {
  DEFAULT_POND_SHAPE,
  isPondShape,
  insideShape,
  keepInShape,
  shapeOutline,
  type PondShape,
} from './pond-shape';
import { plantGrowthFactor } from './side-effects';
import { SPECIES, type AnemoneBondParams, type SpeciesDefinition, type SpeciesId } from './species';
import { createFish, stepFish, swimBounds, type Fish, type SwimBounds } from './swimmer';
import { clampImmersiveDimensions, clampTankDimensions, type TankDimensions } from './tank';
import { assertTimeStep } from './time-step';
import {
  initialMaintenance,
  maintenanceDone,
  type MaintenanceState,
  type MaintenanceTask,
} from './maintenance';
import type { FirstTankPathState } from './first-tank-path';
import type { SavedWaterHistory } from './water-history';
import type { SavedJournal } from './journal';
import {
  changeWaterInPlace,
  freshWater,
  setHeaterInPlace,
  stepWaterInPlace,
  targetTemperature,
  waterLiters,
  waterLoad,
  type MutableWaterState,
  type WaterState,
} from './water';
import { phOutOfTolerance } from './water-ph';
import {
  doseConditionerInPlace,
  type ConditionerKind,
  type ConditionerOutcome,
} from './water-conditioner';
import { setCarbonInPlace, type CarbonOutcome } from './water-carbon';
import {
  dosePhRegulatorInPlace,
  type PhRegulatorDirection,
  type PhRegulatorOutcome,
} from './ph-regulator';
import { waterQuality } from './water-quality';
import {
  applyTreatmentInPlace,
  ichProtected,
  medicationProtects,
  stepTreatmentInPlace,
  type TreatmentKind,
  type TreatmentOutcome,
} from './treatment';
import { starveInPlace, stepWellbeingInPlace } from './wellbeing';
import {
  applyCurrentInPlace,
  currentVelocity,
  isCurrentLevel,
  isRiverSpecies,
  type CurrentLevel,
  type CurrentVelocity,
} from './water-current';

/**
 * Entité de la simulation. Seuls les poissons existent pour l'instant (`sim/swimmer.ts`).
 * Chaque entité tire son hasard de son propre sous-générateur, dérivé de la graine du
 * monde et de son identifiant (`deriveSeed`, core/random/prng.ts).
 */
export type Entity = Fish;

/** Population demandée à la création du monde. */
export interface PopulationEntry {
  readonly species: SpeciesId;
  readonly count: number;
}

/**
 * État du monde : objet de données pur, sérialisable en JSON (ADR 0003).
 * Ne jamais y placer de classe, de fonction ni d'objet Three.js.
 */
export interface World {
  /** Graine du monde, entier 32 bits non signé. */
  readonly seed: number;
  /**
   * Environnement du monde (`sim/environment.ts`, ADR 0026) : son volume d'eau borne la nage
   * et les dépôts de nourriture. Fixé à la création.
   */
  readonly environment: EnvironmentId;
  /**
   * Dimensions réglées du bac (issue #171, ADR 0047), bornées à `TANK_LIMITS` ; absentes :
   * celles de l'environnement. Le monde est ainsi un lieu (`TankPlace`, `sim/environment.ts`).
   */
  readonly dimensions?: TankDimensions;
  /**
   * Forme du bassin vue de dessus (issue #190, ADR 0080, `sim/pond-shape.ts`) : `ovale` ou
   * `haricot` ; absente, rectangle (jamais enregistrée ainsi). Fixée à la création.
   */
  readonly shape?: PondShape;
  /** Nombre de pas `SIM_DT` exécutés depuis la création. */
  readonly tick: number;
  /**
   * Temps simulé écoulé, en secondes. Toujours égal à `tick * SIM_DT` tant que le monde n'a
   * avancé que par pas de `SIM_DT` (cas de l'application) : il est recalculé à partir de
   * `tick`, jamais cumulé, pour ne pas dériver (erreur flottante).
   */
  readonly time: number;
  readonly entities: readonly Entity[];
  /**
   * Obstacles du bac (rochers à venir, `sim/obstacles.ts`), immobiles : les poissons les
   * contournent (ADR 0012). Données pures, triées par identifiant.
   */
  readonly obstacles: readonly Obstacle[];
  /**
   * Éléments de décor (rochers, `sim/decor.ts`), immobiles, dans l'ordre donné. Leurs formes
   * de collision sont ajoutées à `obstacles`, après les obstacles explicites (ADR 0015), puis
   * les boîtes des coraux tirés de la graine (`sim/corals.ts`, ADR 0040).
   */
  readonly decor: readonly DecorItem[];
  /**
   * Granulés de nourriture déposés par l'utilisateur (`sim/food.ts`, ADR 0022), dans l'ordre
   * des dépôts. Vide à la création.
   */
  readonly food: readonly FoodPellet[];
  /** Identifiant du prochain granulé déposé (compteur, jamais réutilisé). */
  readonly nextFoodId: number;
  /**
   * Identifiant du prochain poisson ajouté (`sim/population.ts`, issue #69) : compteur,
   * jamais réutilisé, égal à l'effectif initial à la création.
   */
  readonly nextFishId: number;
  /**
   * État de l'eau du bac (`sim/water.ts`, issue #206, ADR 0052) : température, composés
   * azotés, filtre. Eau saine à la création ; avancé à chaque pas, après la nourriture.
   */
  readonly water: WaterState;
  /**
   * Mode du bac (#278, `sim/care-mode.ts`, ADR 0077) : absent, le mode soins d'un bac jamais
   * passé par le mode décor. En mode `decor`, l'eau, la faim et la santé sont en pause.
   */
  readonly careMode?: CareMode;
  /**
   * Force du courant (issue #460, `sim/water-current.ts`, ADR 0108) : absente, celle de
   * l'environnement (`Environment.current`, coupée partout) ; jamais enregistrée coupée.
   */
  readonly current?: Exclude<CurrentLevel, 'coupe'>;
  /**
   * Œufs collés sur les vitres et les plantes (issue #478, `sim/eggs.ts`, ADR 0111) : absents
   * tant qu'aucune ponte n'a eu lieu, et retirés quand le dernier œuf a éclos ou a été mangé.
   */
  readonly eggs?: readonly Egg[];
  /**
   * Calendrier d'entretien (issue #513, `sim/maintenance.ts`, ADR 0116) : absent tant que
   * l'application n'a pas commencé le suivi de ce bac (monde neuf, ancienne sauvegarde).
   */
  readonly maintenance?: MaintenanceState;
  /**
   * Historique de l'eau (issue #511, `sim/water-history.ts`, ADR 0118), écrit à la sauvegarde
   * seulement : la partie le tient hors du monde, aucun pas n'y touche.
   */
  readonly waterHistory?: SavedWaterHistory;
  /**
   * Journal du bac (issue #581, `sim/journal.ts`), écrit à la sauvegarde seulement : la partie
   * le tient hors du monde, aucun pas n'y touche.
   */
  readonly journal?: SavedJournal;
  /**
   * Parcours « Mon premier aquarium » (issue #512, `sim/first-tank-path.ts`, ADR 0119), écrit
   * à la sauvegarde seulement : la partie le tient hors du monde, aucun pas n'y touche.
   */
  readonly firstTankPath?: FirstTankPathState;
  /**
   * Distributeur de nourriture automatique (issue #583, `sim/auto-feeder.ts`) : absent, aucun
   * (bac par défaut, anciennes sauvegardes) ; le monde avance alors exactement comme avant.
   */
  readonly feeder?: FeederState;
  /**
   * Mortalité activée (issue #582, `sim/mortality.ts`, ADR 0137) : absente, aucun animal ne
   * meurt et le monde avance exactement comme avant ; jamais enregistrée à `false`.
   */
  readonly mortality?: true;
  /**
   * Corps des animaux morts (issue #582), dans l'ordre des décès : ils ne nagent plus,
   * flottent ou reposent au fond et polluent l'eau jusqu'à leur retrait (`removeDeadInPlace`).
   * Absents tant qu'aucun corps n'est dans le bac.
   */
  readonly dead?: readonly DeadAnimal[];
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/**
 * Monde modifiable en place, possédé par un seul propriétaire (la boucle d'affichage de
 * `ui/aquarium-host`). Un `World` fraîchement créé lui est assignable.
 */
export type MutableWorld = Mutable<World>;

/**
 * Crée un monde à `time = 0`, vide par défaut, peuplé dans l'ordre de `population`
 * (identifiants consécutifs à partir de 0) dans l'environnement `environment` (le bac
 * tropical par défaut, `sim/environment.ts`), avec les
 * `obstacles` donnés (copiés, triés par identifiant) et le `decor` donné (validé, copié) ;
 * les formes de collision du décor suivent les obstacles explicites, avec les identifiants
 * suivant le plus grand d'entre eux, puis les boîtes des coraux de l'environnement
 * (`coralLayout`, tirés de la graine). Les poissons naissent hors des obstacles (`createFish`).
 * @throws RangeError si la graine n'est pas un entier 32 bits non signé, si un effectif
 * n'est pas un entier positif ou nul, si un obstacle ou un élément de décor est invalide ou
 * si deux obstacles ont le même identifiant, ou si l'environnement est inconnu (un élément
 * de décor doit aussi tenir dans ses dimensions).
 */
export function createWorld(
  seed: number,
  population: readonly PopulationEntry[] = [],
  obstacles: readonly Obstacle[] = [],
  decor: readonly DecorItem[] = [],
  place: Place = DEFAULT_ENVIRONMENT_ID,
): World {
  assertSeed(seed);
  const environment = placeEnvironment(place);
  environmentById(environment);
  const dimensions = worldDimensions(place);
  const shape = worldShape(place);
  // Lieu du monde : l'environnement seul, ou avec ses dimensions réglées (bornées) ou sa forme.
  const where: Place =
    dimensions === undefined
      ? shape === undefined
        ? environment
        : { environment, shape }
      : { environment, dimensions };
  const decorItems = parseDecorItems(decor, placeDimensions(where));
  const sortedObstacles = copyObstacles(obstacles);
  const firstDecorId = sortedObstacles.length > 0 ? sortedObstacles.at(-1)!.id + 1 : 0;
  sortedObstacles.push(...decorObstacles(decorItems, firstDecorId));
  // Coraux du récif (ADR 0040), puis anémones (ADR 0041) : tirés de la graine autour du
  // décor, après lui.
  const { corals, anemones } = seededFeatures(seed, where, decorItems);
  const firstCoralId = firstDecorId + decorItems.length;
  sortedObstacles.push(...coralObstacles(corals, firstCoralId));
  sortedObstacles.push(...anemoneObstacles(anemones, firstCoralId + corals.length));
  // Cache des éléments tirés de la graine (`worldFeatures`) : la sauvegarde et les pas ne
  // les recalculent pas.
  const { homes } = cacheFeatures(seed, placeKey(where), decorItems, corals, anemones);
  const entities: Entity[] = [];
  for (const { species, count } of population) {
    if (!Number.isInteger(count) || count < 0) {
      throw new RangeError(`count doit être un entier positif ou nul (reçu : ${count})`);
    }
    // `Object.hasOwn` : refuse les clés héritées du prototype (« constructor », « toString »…).
    if (!Object.hasOwn(SPECIES, species)) {
      throw new RangeError(`espèce inconnue : ${String(species)}`);
    }
    for (let i = 0; i < count; i++) {
      const home = homeForRank(homes, SPECIES[species].anemone, bondedCount(entities));
      entities.push(spawnEntity(seed, entities.length, species, where, sortedObstacles, home));
    }
  }
  return {
    seed,
    environment,
    ...(dimensions === undefined ? {} : { dimensions }),
    ...(shape === undefined ? {} : { shape }),
    tick: 0,
    time: 0,
    entities,
    obstacles: sortedObstacles,
    decor: decorItems,
    food: [],
    nextFoodId: 0,
    nextFishId: entities.length,
    water: freshWater(environment),
  };
}

/**
 * Dimensions réglées d'un lieu, bornées (`clampTankDimensions`), ou `undefined` sans réglage.
 * @throws RangeError si l'environnement du lieu n'a pas de dimensions réglables.
 */
function worldDimensions(place: Place): TankDimensions | undefined {
  if (typeof place === 'string' || place.dimensions === undefined) {
    return undefined;
  }
  if (place.immersive === true) {
    // Bac immersif (#375) : dimensions de l'écran, dans les environnements qui le proposent.
    if (!isImmersiveEnvironment(place.environment)) {
      throw new RangeError(`pas de bac immersif dans l’environnement ${place.environment}`);
    }
    return clampImmersiveDimensions(place.dimensions);
  }
  if (!isTankResizable(place.environment)) {
    throw new RangeError(`dimensions non réglables dans l’environnement ${place.environment}`);
  }
  return clampTankDimensions(place.dimensions);
}

/**
 * Forme réglée d'un lieu (issue #190), `undefined` pour le rectangle ou sans réglage.
 * @throws RangeError si la forme est inconnue, ou autre que le rectangle dans un
 * environnement dont la forme ne se règle pas.
 */
function worldShape(place: Place): PondShape | undefined {
  if (typeof place === 'string' || place.shape === undefined) {
    return undefined;
  }
  if (!isPondShape(place.shape)) {
    throw new RangeError(`forme de bassin inconnue : ${String(place.shape)}`);
  }
  if (place.shape === DEFAULT_POND_SHAPE) {
    return undefined;
  }
  if (!isPondShapeable(place.environment)) {
    throw new RangeError(`forme non réglable dans l’environnement ${place.environment}`);
  }
  return place.shape;
}

/**
 * Coraux (`sim/corals.ts`, ADR 0040) et anémones (`sim/anemones.ts`, ADR 0041) d'un
 * environnement, tirés de la graine autour du décor `decor` : ce que `createWorld` ajoute aux
 * obstacles, et ce que la sauvegarde et le rendu recalculent.
 */
export function seededFeatures(
  seed: number,
  place: Place,
  decor: readonly DecorItem[],
): { corals: CoralColony[]; anemones: Anemone[] } {
  const env = environmentById(placeEnvironment(place));
  const dims = placeDimensions(place);
  // Anémones d'abord : les coraux évitent leur emprise (ADR 0041).
  const anemones = anemoneLayout(seed, dims, env.anemones, decor);
  const corals = coralLayout(seed, dims, env.corals, decor, anemoneFootprints(anemones));
  return { corals, anemones };
}

/** Nombre de poissons attachés à une anémone (`SpeciesDefinition.anemone`) parmi `entities`. */
export function bondedCount(entities: readonly Entity[]): number {
  let n = 0;
  for (const e of entities) {
    if (SPECIES[e.species].anemone !== undefined) {
      n += 1;
    }
  }
  return n;
}

/**
 * Anémone du poisson attaché de rang `rank` (rang parmi les poissons attachés, dans l'ordre
 * des entités) : `perAnemone` poissons par anémone, puis on recommence à la première ;
 * `null` sans anémone ou pour une espèce sans attache.
 *
 * Le rang est stable pour les poissons qui restent : le panneau retire toujours le poisson
 * le plus récent de l'espèce (`setPopulationInPlace`), en fin de tableau, et ajoute en fin
 * de tableau ; les autres espèces n'entrent pas dans le compte (ADR 0041, cycle 54).
 */
export function homeForRank(
  homes: readonly AnemoneHome[],
  bond: AnemoneBondParams | undefined,
  rank: number,
): AnemoneHome | null {
  if (bond === undefined || homes.length === 0) {
    return null;
  }
  return homes[Math.floor(rank / bond.perAnemone) % homes.length];
}

/** Coraux, anémones et points d'attache tirés de la graine d'un monde (`worldFeatures`). */
export interface WorldFeatures {
  readonly corals: readonly CoralColony[];
  readonly anemones: readonly Anemone[];
  readonly homes: readonly AnemoneHome[];
}

/**
 * Éléments tirés de la graine, mis en cache par tableau de décor (le décor d'un monde n'est
 * jamais modifié en place : un changement de décor donne un nouveau tableau).
 */
const FEATURES_CACHE = new WeakMap<
  readonly DecorItem[],
  { seed: number; key: string; features: WorldFeatures }
>();
const NO_FEATURES: WorldFeatures = Object.freeze({
  corals: Object.freeze([]),
  anemones: Object.freeze([]),
  homes: Object.freeze([]),
});
/** Nombre de calculs de `seededFeatures` faits pour `worldFeatures` (tests : cache). */
let featureComputations = 0;

/** Nombre de dispositions calculées par `worldFeatures` depuis le chargement (tests). */
export function worldFeatureComputations(): number {
  return featureComputations;
}

function cacheFeatures(
  seed: number,
  key: string,
  decor: readonly DecorItem[],
  corals: readonly CoralColony[],
  anemones: readonly Anemone[],
): WorldFeatures {
  const features: WorldFeatures = Object.freeze({
    corals: Object.freeze([...corals]),
    anemones: Object.freeze([...anemones]),
    homes: Object.freeze(anemoneHomes(anemones)),
  });
  FEATURES_CACHE.set(decor, { seed, key, features });
  return features;
}

/**
 * Coraux, anémones et points d'attache de `world` (`seededFeatures`), figés et mis en cache
 * par tableau de décor : la disposition (modèles voxels compris) n'est recalculée que si le
 * décor, la graine ou l'environnement change. `createWorld` remplit le cache.
 */
export function worldFeatures(world: World): WorldFeatures {
  const env = environmentById(world.environment);
  if (env.corals === null && env.anemones === null) {
    return NO_FEATURES;
  }
  const key = placeKey(world);
  const hit = FEATURES_CACHE.get(world.decor);
  if (hit && hit.seed === world.seed && hit.key === key) {
    return hit.features;
  }
  featureComputations += 1;
  const { corals, anemones } = seededFeatures(world.seed, world, world.decor);
  return cacheFeatures(world.seed, key, world.decor, corals, anemones);
}

/** Points d'attache des anémones de `world` (`anemoneHomes`), mis en cache (`worldFeatures`). */
export function worldAnemoneHomes(world: World): readonly AnemoneHome[] {
  return worldFeatures(world).homes;
}

/**
 * Nombre d'obstacles de `world` tirés de la graine (coraux et anémones), sans recalcul quand
 * le décor n'a pas changé (`worldFeatures`).
 */
export function seededObstacleCount(world: World): number {
  const { corals, anemones } = worldFeatures(world);
  return corals.length + anemones.length;
}

/**
 * Crée l'entité `id` d'une espèce dans un environnement : un poisson (`createFish`), ou, pour
 * une espèce qui marche sur le fond, un individu posé sur le fond (`createWalker`,
 * `sim/axolotl.ts`) ; pour une espèce amphibie, un individu posé sur la berge (`createFrog`,
 * `sim/frog.ts`). Partagé par la création du monde et la population réglable.
 */
export function spawnEntity(
  seed: number,
  id: number,
  species: SpeciesId,
  environment: Place,
  obstacles: readonly Obstacle[],
  home: AnemoneHome | null = null,
): Entity {
  const bounds = boundsFor(species, environment);
  const def = SPECIES[species];
  if (def.anemone !== undefined && home !== null) {
    // Poisson attaché : naît près de son anémone, dans la laisse (`homeSpawn`).
    return createFish(seed, id, species, homeSpawn(bounds, home, def.anemone), obstacles);
  }
  if (def.walker !== undefined) {
    return createWalker(seed, id, species, bounds, groundFor(environment), obstacles);
  }
  if (def.amphibian !== undefined) {
    return createFrog(seed, id, species, bounds, groundFor(environment), obstacles);
  }
  return createFish(seed, id, species, bounds, obstacles);
}

/**
 * Bornes de nage dont la zone de naissance est le cube de demi-côté `leashRadius / 2` centré
 * sur le point d'attache `home`, ramené dans `bounds.hard`.
 */
function homeSpawn(bounds: SwimBounds, home: AnemoneHome, bond: AnemoneBondParams): SwimBounds {
  const { hard } = bounds;
  const r = bond.leashRadius / 2;
  const clampTo = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
  const axis = (c: number, lo: number, hi: number): [number, number] => [
    clampTo(c - r, lo, hi),
    clampTo(c + r, lo, hi),
  ];
  const [minX, maxX] = axis(home.x, hard.minX, hard.maxX);
  const [minY, maxY] = axis(home.hoverY, hard.minY, hard.maxY);
  const [minZ, maxZ] = axis(home.z, hard.minZ, hard.maxZ);
  return { ...bounds, spawn: { minX, maxX, minY, maxY, minZ, maxZ } };
}

/** Sol et eau de chaque lieu (`placeKey`), pour les espèces qui marchent sur le fond. */
const GROUND_CACHE = new Map<string, WalkerGround>();

function groundFor(place: Place, key: string = placeKey(place)): WalkerGround {
  let ground = GROUND_CACHE.get(key);
  if (!ground) {
    ground = {
      water: environmentWater(place),
      terrain: environmentById(placeEnvironment(place)).terrain,
    };
    trimCache(GROUND_CACHE);
    GROUND_CACHE.set(key, ground);
  }
  return ground;
}

/** Vide une table par lieu devenue trop grande (`PLACE_CACHE_LIMIT`). */
function trimCache(cache: Map<string, unknown>): void {
  if (cache.size >= PLACE_CACHE_LIMIT) {
    cache.clear();
  }
}

function copyObstacles(obstacles: readonly Obstacle[]): Obstacle[] {
  const copies = obstacles.map((o) =>
    o.shape === 'spheres' ? { ...o, spheres: o.spheres.map((s) => ({ ...s })) } : { ...o },
  );
  for (const o of copies) {
    const problems = validateObstacle(o);
    if (problems.length > 0) {
      throw new RangeError(`obstacle ${String(o.id)} invalide : ${problems.join(' ; ')}`);
    }
  }
  copies.sort((a, b) => a.id - b.id);
  for (let i = 1; i < copies.length; i++) {
    if (copies[i].id === copies[i - 1].id) {
      throw new RangeError(`identifiant d’obstacle en double : ${copies[i].id}`);
    }
  }
  return copies;
}

/**
 * Monde de départ d'un environnement (le bac tropical par défaut : chaque espèce avec sa
 * population par défaut, dans le décor par défaut `DEFAULT_DECOR`), avec sa population et
 * son décor de départ (`sim/environment.ts`), de forme `shape` (issue #190 ; rectangle par
 * défaut).
 * @throws RangeError si la graine, l'environnement ou la forme est invalide.
 */
export function createDefaultWorld(
  seed: number,
  environment: EnvironmentId = DEFAULT_ENVIRONMENT_ID,
  shape?: PondShape,
): World {
  const env = environmentById(environment);
  const place: Place = shape === undefined ? environment : { environment, shape };
  return createWorld(seed, env.population, [], env.decor, place);
}

/**
 * Horloge de journée lue par la simulation (rythme du jour, issue #209), ou `null` : plein
 * jour, nage d'avant au bit près. L'heure de chaque pas est `hourAt(clock, world.time)`.
 */
export type SimClock = DayClock | null;

/**
 * Fait avancer le monde d'un pas. Fonction pure : `world` n'est **jamais** modifié, un
 * nouvel état est renvoyé.
 * @throws RangeError si `dt` n'est pas un réel strictement positif.
 */
export function step(world: World, dt: number = SIM_DT, clock: SimClock = null): World {
  assertTimeStep(dt);
  const next = cloneWorld(world);
  stepInPlace(next, dt, clock);
  return next;
}

/**
 * Fait avancer le monde de `steps` pas de `SIM_DT`. Une seule copie de l'état, puis
 * aucune allocation par pas. `world` n'est jamais modifié.
 * @throws RangeError si `steps` n'est pas un entier positif ou nul.
 */
export function advance(world: World, steps: number, clock: SimClock = null): World {
  assertSteps(steps);
  if (steps === 0) {
    return world;
  }
  const next = cloneWorld(world);
  advanceInPlace(next, steps, clock);
  return next;
}

/**
 * Fait avancer `world` de `steps` pas de `SIM_DT` **en le modifiant** : aucune allocation.
 * Réservé au propriétaire unique du monde (boucle d'affichage de `ui/aquarium-host`, appelée
 * à chaque image) ; les tests et le reste du code utilisent `step` / `advance`, purs.
 * @throws RangeError si `steps` n'est pas un entier positif ou nul (monde inchangé).
 */
export function advanceInPlace(world: MutableWorld, steps: number, clock: SimClock = null): void {
  assertSteps(steps);
  for (let i = 0; i < steps; i++) {
    stepInPlace(world, SIM_DT, clock);
  }
}

/**
 * Écrit dans `out` les bulles du diffuseur du monde (`sim/bubbles.ts`, ADR 0017) et renvoie
 * leur nombre. Les bulles sont une fonction pure de la graine et du temps du monde : elles
 * n'ont pas d'état dans `World`, ne consomment aucun générateur des poissons et n'en
 * changent pas les trajectoires.
 */
export function worldBubbles(world: World, out: BubbleBuffer): number {
  if (!environmentById(world.environment).bubbles) {
    out.count = 0;
    return 0;
  }
  const v = worldCurrentVelocity(world, CURRENT_SCRATCH);
  if (world.dimensions === undefined && v.x === 0 && v.z === 0) {
    return fillBubbles(world.seed, world.time, out);
  }
  return fillBubbles(
    world.seed,
    world.time,
    out,
    world.dimensions === undefined ? undefined : bubbleSourceFor(world.dimensions),
    environmentWater(world),
    v.x,
    v.z,
  );
}

/** Force du courant du bac de `world` : la sienne, sinon celle de son environnement. */
export function worldCurrentLevel(world: Pick<World, 'current' | 'environment'>): CurrentLevel {
  return world.current ?? environmentById(world.environment).current.level;
}

/**
 * Écrit dans `out` la vitesse de l'eau du bac de `world` (`currentVelocity`) et renvoie `out` :
 * (0, 0) exactement, courant coupé.
 */
export function worldCurrentVelocity(
  world: Pick<World, 'current' | 'environment'>,
  out: CurrentVelocity,
): CurrentVelocity {
  return currentVelocity(environmentById(world.environment).current, worldCurrentLevel(world), out);
}

/**
 * Règle la force du courant du bac, **en modifiant** `world` : coupé, le champ est retiré
 * (sauvegardes et captures inchangées).
 * @throws RangeError si la force est inconnue (monde inchangé).
 */
export function setWorldCurrentInPlace(world: MutableWorld, level: CurrentLevel): void {
  if (!isCurrentLevel(level)) {
    throw new RangeError(`force de courant inconnue : ${String(level)}`);
  }
  if (level === 'coupe') {
    delete world.current;
  } else {
    world.current = level;
  }
}

/** Vitesse de l'eau du pas ou des bulles (réutilisée, sans allocation). */
const CURRENT_SCRATCH: CurrentVelocity = { x: 0, z: 0 };

/**
 * Dépose des granulés autour de (x, z), à la surface (`sim/food.ts`). Fonction pure : renvoie
 * un nouvel état, `world` n'est jamais modifié. Un point hors du bac ou un bac plein renvoie
 * un état sans nouveau granulé.
 * @throws RangeError si `x` ou `z` n'est pas un réel fini.
 */
export function feed(world: World, x: number, z: number): World {
  const next = cloneWorld(world);
  feedInPlace(next, x, z);
  return next;
}

/**
 * Comme `feed`, **en modifiant** `world` ; renvoie le nombre de granulés ajoutés. Réservé au
 * propriétaire unique du monde (`ui/aquarium-host`), comme `advanceInPlace`.
 */
export function feedInPlace(world: MutableWorld, x: number, z: number): number {
  const { water, terrain } = groundFor(world);
  if (world.shape !== undefined && Number.isFinite(x) && Number.isFinite(z)) {
    // Bassin non rectangulaire (issue #190) : rien sur la berge ; dans l'eau, le centre du
    // dépôt est écarté du bord pour que tous les granulés y tombent.
    const outline = shapeOutline(world.shape, water);
    if (!insideShape(outline, x, z)) {
      return 0;
    }
    FEED_POINT.x = x;
    FEED_POINT.z = z;
    keepInShape(FEED_POINT, outline, FEED_SHAPE_MARGIN);
    return dropFoodInPlace(
      world as MutableWorld & { food: FoodPellet[] },
      FEED_POINT.x,
      FEED_POINT.z,
      water,
      terrain,
    );
  }
  return dropFoodInPlace(world as MutableWorld & { food: FoodPellet[] }, x, z, water, terrain);
}

/**
 * Tapotement de la vitre au point `tap` (`tapGlassInPlace`, issue #346, ADR 0092), **en
 * modifiant** les poissons de `world` à moins de `radius` mètres ; renvoie le nombre de
 * poissons qui ont réagi. Réservé au propriétaire unique du monde (`ui/immersive-mode`), comme
 * `feedInPlace`.
 */
export function tapGlassInWorld(
  world: MutableWorld,
  tap: GlassPoint,
  radius: number = TAP_RADIUS,
): number {
  return tapGlassInPlace(world.entities as Mutable<Entity>[], tap, radius);
}

/**
 * Lâche les rations du distributeur dues entre `startTime` et `world.time` (`rationsDue`),
 * dans la limite de sa réserve, au point de chute sous l'appareil (`feederSpot`).
 */
function dropFeederRations(world: MutableWorld, clock: DayClock, startTime: number): void {
  const feeder = world.feeder!;
  const due = rationsDue(clock, startTime, world.time, feeder.hours);
  if (due === 0) {
    return;
  }
  const taken = takeRationsInPlace(feeder, due);
  const spot = feederSpot(environmentWater(world));
  for (let n = 0; n < taken; n++) {
    feedInPlace(world, spot.x, spot.z);
  }
}

/**
 * Pose, règle ou retire le distributeur automatique du bac (issue #583), **en modifiant**
 * `world` : `null` le retire ; des heures (1 à 4, normalisées par `feederHours`) le posent,
 * plein, ou changent les heures d'un distributeur déjà posé sans toucher à sa réserve.
 * Renvoie faux, sans rien changer, pour des heures invalides ou un bac sans distributeur
 * possible (`hasFeeder`).
 */
export function setWorldFeederInPlace(
  world: MutableWorld,
  hours: readonly number[] | null,
): boolean {
  if (hours === null) {
    delete world.feeder;
    return true;
  }
  const normalized = feederHours(hours);
  if (normalized === null || !hasFeeder(world.environment)) {
    return false;
  }
  world.feeder =
    world.feeder === undefined
      ? createFeeder(normalized)
      : { hours: normalized, stock: world.feeder.stock };
  return true;
}

/** Remplit le distributeur du bac (issue #583), **en modifiant** `world` ; faux sans distributeur. */
export function refillWorldFeederInPlace(world: MutableWorld): boolean {
  if (world.feeder === undefined) {
    return false;
  }
  refillFeederInPlace(world.feeder);
  return true;
}

/** Point de dépôt ramené dans la forme du bassin (réutilisé, sans allocation). */
const FEED_POINT = { x: 0, z: 0 };
/** Marge du centre d'un dépôt au bord d'un bassin non rectangulaire, en mètres. */
const FEED_SHAPE_MARGIN = FOOD_DROP_RADIUS + FOOD_RADIUS;

/** Dépôt de nourriture à un temps simulé donné (contrat de capture, `nourrir=`). */
export interface Feeding {
  readonly time: number;
  readonly x: number;
  readonly z: number;
}

/**
 * Avance le monde jusqu'au temps `time` en déposant la nourriture de `feedings` au temps
 * simulé de chaque dépôt (dans l'ordre des temps, puis de la liste) : même graine et mêmes
 * dépôts donnent le même état. Les dépôts postérieurs à `time` sont ignorés. Fonction pure.
 */
export function advanceToWithFeedings(
  world: World,
  time: number,
  feedings: readonly Feeding[],
  clock: SimClock = null,
): World {
  const target = ticksFor(time);
  const ordered = feedings
    .map((feeding, index) => ({ feeding, index, tick: ticksFor(feeding.time) }))
    .filter((entry) => entry.tick <= target)
    .sort((a, b) => a.tick - b.tick || a.index - b.index);
  let current = world;
  for (const { feeding, tick } of ordered) {
    current = feed(advance(current, Math.max(0, tick - current.tick), clock), feeding.x, feeding.z);
  }
  return advance(current, Math.max(0, target - current.tick), clock);
}

/** Nombre total de pas `SIM_DT` correspondant à un temps simulé : `round(time / SIM_DT)`. */
export function ticksFor(time: number): number {
  if (!Number.isFinite(time) || time < 0) {
    throw new RangeError(`time doit être un réel positif ou nul (reçu : ${time})`);
  }
  return Math.round(time / SIM_DT);
}

/**
 * Avance le monde par pas fixes jusqu'au temps absolu `time` (contrat de capture : sans
 * temps réel). Un monde déjà au-delà de `time` est renvoyé tel quel (pas de retour arrière).
 */
export function advanceTo(world: World, time: number, clock: SimClock = null): World {
  return advance(world, Math.max(0, ticksFor(time) - world.tick), clock);
}

function stepInPlace(world: MutableWorld, dt: number, clock: SimClock): void {
  const startTime = world.time;
  world.tick += 1;
  // Pas nominal : temps dérivé du compteur (exact, sans cumul d'erreur flottante).
  // Pas libre (`step(world, dt)`, tests) : temps cumulé.
  world.time = dt === SIM_DT ? world.tick * SIM_DT : world.time + dt;
  // Deux phases : le pilotage de banc de tous les poissons est calculé sur les positions du
  // début du pas, puis chacun nage. Le résultat ne dépend donc pas de l'ordre de mise à jour.
  const fishes = world.entities as Mutable<Entity>[];
  const decor = world.careMode === 'decor';
  if (decor) {
    keepHunger(fishes);
  }
  // Distributeur automatique (issue #583) : rations des heures passées pendant le pas, lâchées
  // comme un clic de nourrissage ; en pause en mode décor, comme la faim. Sans distributeur ni
  // horloge, rien n'est calculé.
  if (world.feeder !== undefined && clock !== null && !decor) {
    dropFeederRations(world, clock, startTime);
  }
  // Lieu du pas : une seule clé calculée par pas, lue par toutes les tables (`placeKey`).
  const place: Place = world;
  const key = placeKey(place);
  const steering = steeringBuffer(fishes.length);
  computeSchoolSteering(fishes, steering);
  // Espèces incompatibles (issue #209) : évitement anticipé ajouté au pilotage, puis distance
  // minimale après la nage. Sans couple incompatible, rien ne change (nage d'avant au bit près).
  const rivalsPresent = hasRivals(fishes);
  if (rivalsPresent) {
    addRivalSteering(fishes, steering);
  }
  // Rythme du jour (issue #209) : intensité du jour au temps du pas ; sans horloge, plein jour.
  const intensity = clock === null ? 1 : dayIntensityAt(hourAt(clock, world.time));
  // Nourriture (issue #68) : point visé calculé, comme le banc, sur les positions du début du
  // pas ; sans granulé, `target` reste nul et la nage est exactement celle d'avant.
  const food = world.food as FoodPellet[];
  // Anémones (issue #150) : points d'attache des poissons-clowns, aucun hors du récif.
  const homes = worldAnemoneHomes(world);
  let bondRank = 0;
  // Comportements de l'espèce (issue #427) : points visés calculés, comme le banc, sur les
  // positions du début du pas. Sans espèce concernée, aucun calcul (nage d'avant, au bit près).
  const behaving = computeBehaviorTargets(world, fishes, place, key);
  // Alevins (issue #459) : ils nagent près des plantes. Sans alevin, rien ne change.
  const fryPresent = fishes.some(isFry);
  const plants = fryPresent ? fryPlants(world.decor) : NO_PLANTS;
  // Courant (issue #460) : coupé, aucun calcul (nage d'avant, au bit près).
  const flow = worldCurrentVelocity(world, CURRENT_SCRATCH);
  const flowing = flow.x !== 0 || flow.z !== 0;
  // Ordre stable : celui du tableau, c'est-à-dire des identifiants.
  for (let i = 0; i < fishes.length; i++) {
    const fish = fishes[i];
    const bounds = boundsAt(fish.species, place, key);
    if (SPECIES[fish.species].walker !== undefined) {
      // Espèce qui marche sur le fond (axolotl, crevette nettoyeuse) : sa propre machine à
      // états, sans banc ni recherche de nourriture, qui contourne les obstacles (`sim/axolotl.ts`).
      stepWalker(fish, dt, world.seed, world.time, bounds, groundFor(place, key), world.obstacles);
      continue;
    }
    if (SPECIES[fish.species].amphibian !== undefined) {
      // Espèce amphibie (grenouille, triton) : posée, sauts, nage, entre terre et eau, sans banc ni
      // recherche de nourriture (`sim/frog.ts`).
      stepFrog(fish, dt, world.seed, world.time, bounds, groundFor(place, key));
      continue;
    }
    let target =
      food.length === 0
        ? null
        : foodTarget(
            fish,
            SPECIES[fish.species],
            food,
            bandFor(fish.species, place, key),
            bounds.hard,
            FOOD_TARGET,
            world.obstacles,
          );
    const bond = SPECIES[fish.species].anemone;
    if (bond !== undefined) {
      target = bondTarget(fish, bond, homeForRank(homes, bond, bondRank), food, target);
      bondRank += 1;
    }
    let grazing = false;
    if (target === null && behaving && behaviorFlags[i] === 1) {
      // La nourriture en vue l'emporte ; sinon, le point visé du comportement.
      BEHAVIOR_TARGET.x = behaviorPoints[3 * i];
      BEHAVIOR_TARGET.y = behaviorPoints[3 * i + 1];
      BEHAVIOR_TARGET.z = behaviorPoints[3 * i + 2];
      target = BEHAVIOR_TARGET;
      grazing = speciesBehavior(fish.species)?.kind === 'broutage';
    }
    if (target === null && fryPresent && fish.growth !== undefined) {
      target = fryTarget(fish, plants, world.time, bounds, FRY_TARGET);
    }
    stepFish(
      fish,
      dt,
      bounds,
      steering[3 * i],
      steering[3 * i + 1],
      steering[3 * i + 2],
      world.obstacles,
      target,
      nightRest(fish.species, intensity),
      grazing,
    );
    if (flowing) {
      applyCurrentInPlace(
        fish,
        flow.x,
        flow.z,
        dt,
        isRiverSpecies(fish.species),
        bounds,
        SPECIES[fish.species].wallMargin,
      );
    }
  }
  currentPlace = place;
  currentKey = key;
  enforceMinDistance(fishes, boundsOfFish);
  if (rivalsPresent) {
    enforceRivalDistance(fishes, boundsOfFish);
  }
  eatInPlace(fishes, food, bandOfFish, hardOfFish);
  if (flowing) {
    stepFoodInPlace(food, dt, flow.x, flow.z, environmentWater(place));
  } else {
    stepFoodInPlace(food, dt);
  }
  if (decor) {
    // Mode décor (#278) : faim rendue telle qu'au début du pas ; eau et santé en pause.
    restoreHunger(fishes);
    return;
  }
  // Alevins (issue #459) : croissance, puis prédation des alevins hors des plantes. En mode
  // décor, en pause comme l'eau et la santé.
  if (fryPresent) {
    growFryInPlace(fishes, dt);
    eatFryInPlace(fishes, plants);
  }
  // Eau (issue #206) : sans hasard, après les poissons ; ne change rien à leur nage.
  stepWaterInPlace(
    world.water as MutableWaterState,
    dt,
    waterLoad(fishes) + deadLoad(world.dead),
    waterLiters(environmentWater(place)),
    targetTemperature(world.water, world.environment),
  );
  // Algues (issue #476) : sans hasard, sur les nitrates de fin de pas ; sans pousse (éclairage
  // normal, eau propre), rien n'est calculé ni écrit.
  if (
    hasAlgae(world.environment) &&
    algaeGrowth(lightingOf(world.water), world.water.nitrate) > 0
  ) {
    stepAlgaeInPlace(
      world.water as MutableWaterState,
      dt,
      cachedAlgaePatches(world.seed, environmentWater(place)),
    );
  }
  // Plantes à tige (issue #477) : pousse sans hasard, jusqu'à la surface, ralentie par le sel
  // (effet secondaire, #549) et par un éclairage court (lampe, #584) ; en pause en mode décor
  // comme l'eau.
  if (hasPlantGrowth(world.environment)) {
    const water = world.water as MutableWaterState;
    const growth = stepPlantGrowthInPlace(
      water.plantGrowth as MutablePlantGrowth | undefined,
      world.decor,
      dt,
      environmentWater(place).maxY,
      plantGrowthFactor(water) * plantLightFactor(lightingOf(water)),
    );
    if (growth !== undefined && water.plantGrowth === undefined) {
      water.plantGrowth = growth;
    }
  }
  // Points blancs (issue #360) : sur l'eau de fin de pas ; aucun tirage sans stress ni
  // malade, donc un bac sain avance exactement comme avant. Un traitement efficace dans
  // l'eau (issue #361) empêche toute nouvelle infection, puis fait avancer la cure.
  stepIchInPlace(
    fishes,
    dt,
    ichStress(world.water, world.environment),
    world.environment,
    world.seed,
    world.tick,
    ichProtected(world.water),
  );
  // Velours (issue #532) : même stress que les points blancs, contagion lente ; le médicament
  // (sur l'eau du début du pas, avant sa dégradation) le fait reculer. Aucun tirage sans stress
  // ni malade.
  stepVelvetInPlace(
    fishes,
    dt,
    ichStress(world.water, world.environment),
    world.environment,
    world.seed,
    world.tick,
    medicationProtects(world.water),
  );
  // Champignons (issue #548) : seulement sur un animal blessé (signes d'une autre maladie) ou
  // affaibli, jamais spontanés ; le médicament (eau du début du pas) les fait reculer dans une
  // eau propre. Aucun tirage pour un animal sans porte d'entrée.
  stepFungusInPlace(
    fishes,
    dt,
    world.environment,
    world.seed,
    world.tick,
    medicationProtects(world.water),
    finRotCauses(world.water) === 0,
  );
  stepTreatmentInPlace(world.water as MutableWaterState, fishes, dt);
  // Pourriture des nageoires (issue #485) : sur l'ammoniaque et les nitrites de fin de pas ;
  // tirage d'apparition seulement en eau chargée, guérison sans tirage en eau corrigée.
  stepFinRotInPlace(
    fishes,
    dt,
    finRotCauses(world.water),
    world.environment,
    world.seed,
    world.tick,
  );
  // Hydropisie (issue #565) : sur l'eau de fin de pas et la santé de début de pas ; tirage
  // d'apparition seulement pour un animal affaibli en eau chargée, recul sans tirage en eau
  // propre avant le stade avancé.
  stepDropsyInPlace(
    fishes,
    dt,
    finRotCauses(world.water),
    world.environment,
    world.seed,
    world.tick,
  );
  // Santé (issue #208) : sur la faim de fin de pas (après les repas) et l'eau du pas (pH
  // compris, issue #236), sans hasard ; à santé pleine, la nage reste exactement celle d'avant.
  stepWellbeingInPlace(
    fishes,
    dt,
    waterQuality(world.water, world.environment) === 'mauvaise',
    speciesById,
    world.water.ph,
    catappaActive(world.water.catappa),
  );
  // Mortalité (issue #582) : corps du bac, puis décès sur la santé de fin de pas ; sans corps
  // ni mortalité activée, rien n'est calculé (monde d'avant au bit près).
  if (world.dead !== undefined) {
    stepDeadInPlace(world.dead, dt, (body) => boundsAt(body.species, place, key).hard.maxY);
  }
  if (world.mortality === true) {
    stepMortalityInPlace(world, dt);
  }
  // Mise bas (issue #459) : au dernier pas de chaque portée seulement, sur la santé et l'eau
  // de fin de pas ; aucun tirage pris aux générateurs des poissons.
  stepBroodInPlace(world);
  // Ponte des corydoras (issue #478) : prédation et éclosion des œufs du bac, puis ponte au
  // dernier pas de chaque période ; sans œuf ni ponte, rien n'est écrit.
  stepEggsInPlace(world, dt);
}

/**
 * Décès du pas (`splitDeaths`, `sim/mortality.ts`), **en modifiant** `world` : chaque animal
 * qui meurt passe de `entities` à `dead` (`deadBody`), un seul tirage par animal. Aucune
 * allocation si personne ne meurt.
 */
function stepMortalityInPlace(world: MutableWorld, dt: number): void {
  const split = splitDeaths(world.entities, toxicWater(world.water), dt, world.seed, world.tick);
  if (split === null) {
    return;
  }
  world.entities = split.living;
  world.dead = [...(world.dead ?? []), ...split.dying.map(deadBody)];
}

/**
 * Active ou coupe la mortalité (issue #582), **en modifiant** `world`. Coupée, les corps déjà
 * présents restent jusqu'à leur retrait.
 */
export function setWorldMortalityInPlace(world: MutableWorld, enabled: boolean): void {
  if (enabled) {
    world.mortality = true;
  } else {
    delete world.mortality;
  }
}

/**
 * Fait mourir sur-le-champ l'animal d'identifiant `id` (paramètre de capture `mort=1`, tests),
 * **en modifiant** `world` ; renvoie faux si aucun animal vivant ne porte cet identifiant.
 */
export function killWorldAnimalInPlace(world: MutableWorld, id: number): boolean {
  const index = world.entities.findIndex((fish) => fish.id === id);
  if (index < 0) {
    return false;
  }
  const fish = world.entities[index];
  world.entities = world.entities.filter((_, i) => i !== index);
  world.dead = [...(world.dead ?? []), deadBody(fish)];
  return true;
}

/**
 * Retire à l'épuisette le corps d'identifiant `id` (issue #582), **en modifiant** `world` :
 * sa pollution cesse aussitôt. Renvoie faux si aucun corps ne porte cet identifiant. Le champ
 * `dead` disparaît avec le dernier corps.
 */
export function removeDeadInPlace(world: MutableWorld, id: number): boolean {
  const dead = world.dead;
  if (dead === undefined || !dead.some((body) => body.id === id)) {
    return false;
  }
  const rest = dead.filter((body) => body.id !== id);
  if (rest.length === 0) {
    delete world.dead;
  } else {
    world.dead = rest;
  }
  return true;
}

/**
 * Point d'éclosion réutilisé par `hatchEgg` (aucune allocation par œuf) : tampon de calcul
 * écrit puis lu aussitôt, jamais conservé (`birthYoungInPlace` en recopie les coordonnées).
 */
const HATCH_POINT: Vec3 = { x: 0, y: 0, z: 0 };

/** Éclosion d'un œuf dans `world` (rappel de `ageEggsInPlace`, le monde en contexte, #501). */
function hatchEgg(world: MutableWorld, egg: Egg): void {
  HATCH_POINT.x = egg.x;
  HATCH_POINT.y = egg.y;
  HATCH_POINT.z = egg.z;
  birthYoungInPlace(world, egg.species, HATCH_POINT);
}

/**
 * Œufs du bac (`sim/eggs.ts`, issue #478), **en modifiant** `world` : les adultes nageurs
 * mangent les œufs de la vitre à leur portée, les œufs vieillissent de `dt` et ceux qui
 * atteignent `EGG_HATCH_TIME` éclosent en alevins (`birthYoungInPlace`, dans la limite des
 * plafonds : sinon l'œuf disparaît), puis la ponte de la période a lieu si le pas en achève
 * une (`spawnEggsInPlace`). Le champ `eggs` disparaît quand il ne reste aucun œuf.
 */
export function stepEggsInPlace(world: MutableWorld, dt: number): void {
  const eggs = world.eggs as MutableEgg[] | undefined;
  if (eggs !== undefined) {
    eatEggsInPlace(eggs, world.entities);
    ageEggsInPlace(eggs, dt, world, hatchEgg);
  }
  spawnEggsInPlace(world);
  if (world.eggs !== undefined && world.eggs.length === 0) {
    delete world.eggs;
  }
}

/**
 * Ponte (issue #478), **en modifiant** `world` : si le pas courant achève une période de
 * ponte (`spawnIndexAt`), chaque espèce ovipare qui compte au moins `SPAWN_MIN_ADULTS` adultes
 * en forme, dans une eau qui le permet (`waterAllowsSpawn`), pond `clutchSize` œufs, dans la
 * limite des plafonds (`eggRoom`). Renvoie le nombre d'œufs pondus.
 */
export function spawnEggsInPlace(world: MutableWorld): number {
  const spawn = spawnIndexAt(world.tick);
  if (spawn < 0) {
    return 0;
  }
  let laid = 0;
  for (const species of EGG_SPECIES) {
    if (fitSpawners(world.entities, species) < SPAWN_MIN_ADULTS) {
      continue;
    }
    const conditions: SpawnConditions = {
      goodWater: waterQuality(world.water, world.environment) === 'bonne',
      temperature: world.water.temperature,
      phOut: (id) => phOutOfTolerance(world.water.ph, id),
    };
    if (!waterAllowsSpawn(species, conditions)) {
      continue;
    }
    laid += layEggsInPlace(world, species, spawn, clutchSize(world.seed, species, spawn));
  }
  return laid;
}

/**
 * Pond au plus `count` œufs de la ponte `spawn` de `species` dans `world` (`layClutch`, dans
 * la limite de `eggRoom`), **en modifiant** `world`. Renvoie le nombre d'œufs pondus.
 */
function layEggsInPlace(
  world: MutableWorld,
  species: SpeciesId,
  spawn: number,
  count: number,
): number {
  const eggs = (world.eggs ?? []) as MutableEgg[];
  const room = Math.min(count, eggRoom(world.entities, eggs, species));
  const clutch = layClutch(
    world.seed,
    species,
    spawn,
    room,
    environmentWater(world),
    fryPlants(world.decor),
  );
  if (clutch.length > 0) {
    eggs.push(...clutch);
    world.eggs = eggs;
  }
  return clutch.length;
}

/**
 * Œufs d'exemple (paramètre d'URL `oeufs=1`, issue #478), **en modifiant** `world` (monde en
 * construction, avant le rendu) : chaque espèce ovipare présente pond sa première ponte, sans
 * condition de santé ni d'eau, dans la limite des plafonds ; les âges sont répartis sur
 * l'incubation pour que les éclosions s'étalent. Renvoie le nombre d'œufs.
 */
export function layEggsWorldInPlace(world: MutableWorld): number {
  let laid = 0;
  for (const species of EGG_SPECIES) {
    if (!world.entities.some((fish) => fish.species === species)) {
      continue;
    }
    const before = world.eggs?.length ?? 0;
    const count = layEggsInPlace(world, species, 0, clutchSize(world.seed, species, 0));
    const eggs = world.eggs as MutableEgg[] | undefined;
    for (let k = 0; k < count && eggs !== undefined; k++) {
      eggs[before + k].age = (k / Math.max(1, count)) * EGG_HATCH_TIME * 0.5;
    }
    laid += count;
  }
  return laid;
}

const NO_PLANTS: readonly DecorItem[] = Object.freeze([]);
const FRY_TARGET: Vec3 = { x: 0, y: 0, z: 0 };

/**
 * Mise bas d'une portée (`sim/fry.ts`, issue #459), **en modifiant** `world` : si le pas
 * courant achève une portée (`broodIndexAt`), chaque mère possible (`canBreed`), dans l'ordre
 * des identifiants, met bas `broodSize` alevins, tant que le plafond de l'espèce et celui du
 * bac le permettent (`birthFryInPlace`). Renvoie le nombre de naissances.
 */
export function stepBroodInPlace(world: MutableWorld): number {
  const brood = broodIndexAt(world.tick);
  if (brood < 0 || !world.entities.some((fish) => hasFry(fish.species))) {
    return 0;
  }
  const conditions: BroodConditions = {
    goodWater: waterQuality(world.water, world.environment) === 'bonne',
    phOut: (species) => phOutOfTolerance(world.water.ph, species),
  };
  const mothers = world.entities.filter((fish) => canBreed(fish, world.seed, conditions));
  let born = 0;
  for (const mother of mothers) {
    const size = broodSize(world.seed, mother.id, brood);
    for (let k = 0; k < size; k++) {
      if (birthFryInPlace(world, mother) === null) {
        return born;
      }
      born += 1;
    }
  }
  return born;
}

/**
 * Fait naître un alevin de `mother`, **en modifiant** `world` : identifiant
 * `world.nextFishId`, né près du point `near` (sa mère par défaut, `birthBounds`), âge 0,
 * ajouté en fin de tableau.
 * Renvoie l'alevin, ou `null` sans le créer si l'espèce est à `maxPopulation` ou le bac à
 * `MAX_TOTAL_FISH` (plafond de performance, alevins compris).
 */
export function birthFryInPlace(
  world: MutableWorld,
  mother: Entity,
  near: Vec3 = mother,
): Entity | null {
  return birthYoungInPlace(world, mother.species, near);
}

/**
 * Fait naître un alevin de `species` près du point `near`, **en modifiant** `world` (comme
 * `birthFryInPlace`) : mise bas d'une mère ou éclosion d'un œuf (issue #478). Renvoie
 * l'alevin, ou `null` sans le créer si un plafond est atteint.
 */
export function birthYoungInPlace(
  world: MutableWorld,
  species: SpeciesId,
  near: Vec3,
): Entity | null {
  let same = 0;
  for (const fish of world.entities) {
    if (fish.species === species) {
      same += 1;
    }
  }
  if (same >= SPECIES[species].maxPopulation || world.entities.length >= MAX_TOTAL_FISH) {
    return null;
  }
  const bounds = birthBounds(boundsFor(species, world), near);
  const fry: Mutable<Entity> = createFish(
    world.seed,
    world.nextFishId,
    species,
    bounds,
    world.obstacles,
  );
  fry.growth = 0;
  (world.entities as Entity[]).push(fry);
  world.nextFishId += 1;
  return fry;
}

/**
 * Alevins d'exemple (paramètre d'URL `alevins=1`, issue #459), **en modifiant** `world`
 * (monde en construction, avant le rendu) : chaque femelle d'une espèce vivipare met bas sa
 * première portée, sans condition de santé ni d'eau, dans la limite des plafonds, près de la
 * plante la plus proche (déjà à couvert) ; les alevins sont répartis entre les `FRY_STAGES`
 * jalons de croissance pour qu'ils se voient tous.
 * Renvoie le nombre d'alevins.
 */
export function broodWorldInPlace(world: MutableWorld): number {
  const mothers = world.entities.filter(
    (fish) => hasFry(fish.species) && !isFry(fish) && isFemale(fish, world.seed),
  );
  const plants = fryPlants(world.decor);
  let born = 0;
  for (const mother of mothers) {
    const size = broodSize(world.seed, mother.id, 0);
    const bounds = boundsFor(mother.species, world);
    const near = fryTarget(mother, plants, 0, bounds, { x: 0, y: 0, z: 0 }) ?? mother;
    for (let k = 0; k < size; k++) {
      const fry = birthFryInPlace(world, mother, near) as Mutable<Entity> | null;
      if (fry === null) {
        return born;
      }
      fry.growth = ((born % FRY_STAGES) * FRY_GROWTH_TIME) / FRY_STAGES;
      born += 1;
    }
  }
  return born;
}

/** Points visés des comportements (issue #427), réutilisés d'un pas à l'autre. */
let behaviorPoints = new Float64Array(0);
/** 1 : le poisson de même rang a un point visé de comportement à ce pas. */
let behaviorFlags = new Uint8Array(0);
const BEHAVIOR_TARGET: Vec3 = { x: 0, y: 0, z: 0 };
const BEHAVIOR_SCRATCH: Vec3 = { x: 0, y: 0, z: 0 };
const NO_FISHES: readonly Entity[] = Object.freeze([]);
const NO_OBSTACLES: readonly Obstacle[] = Object.freeze([]);
/**
 * Contexte des comportements, réécrit à chaque pas (#433) plutôt que recréé ; vidé de ses
 * tableaux après usage pour ne pas retenir le dernier monde.
 */
const BEHAVIOR_CTX: { -readonly [K in keyof BehaviorContext]: BehaviorContext[K] } = {
  seed: 0,
  time: 0,
  landedFood: false,
  fishes: NO_FISHES,
  obstacles: NO_OBSTACLES,
};

/**
 * Remplit `behaviorPoints` et `behaviorFlags` pour les poissons nageurs dont l'espèce a un
 * comportement (`sim/behaviors.ts`), sur les positions du début du pas ; renvoie `false` sans
 * rien calculer si aucun poisson n'est concerné. Tampons de module, comme `hungerKept`.
 */
function computeBehaviorTargets(
  world: World,
  fishes: readonly Entity[],
  place: Place,
  key: string,
): boolean {
  let any = false;
  for (const fish of fishes) {
    if (speciesBehavior(fish.species) !== null) {
      any = true;
      break;
    }
  }
  if (!any) {
    return false;
  }
  if (behaviorFlags.length < fishes.length) {
    behaviorFlags = new Uint8Array(2 * fishes.length);
    behaviorPoints = new Float64Array(6 * fishes.length);
  }
  const ctx = BEHAVIOR_CTX;
  ctx.seed = world.seed;
  ctx.time = world.time;
  ctx.landedFood = hasLandedFood(world.food);
  ctx.fishes = fishes;
  ctx.obstacles = world.obstacles;
  for (let i = 0; i < fishes.length; i++) {
    const fish = fishes[i];
    const def = SPECIES[fish.species];
    behaviorFlags[i] = 0;
    if (
      speciesBehavior(fish.species) === null ||
      def.walker !== undefined ||
      def.amphibian !== undefined
    ) {
      continue;
    }
    const bounds = boundsAt(fish.species, place, key);
    const point = behaviorTarget(
      fish,
      def.bodyLength,
      def.wallMargin,
      bounds,
      ctx,
      BEHAVIOR_SCRATCH,
    );
    if (point !== null) {
      behaviorFlags[i] = 1;
      behaviorPoints[3 * i] = point.x;
      behaviorPoints[3 * i + 1] = point.y;
      behaviorPoints[3 * i + 2] = point.z;
    }
  }
  ctx.fishes = NO_FISHES;
  ctx.obstacles = NO_OBSTACLES;
  return true;
}

/**
 * Faims du début du pas en mode décor (#278), réutilisées d'un pas à l'autre.
 *
 * Tampon de module partagé par tous les mondes (évite une allocation par pas) : correct
 * uniquement parce que `stepInPlace` n'est pas réentrant et que `keepHunger` et
 * `restoreHunger` sont appelés dans le même pas d'un même monde, sans autre pas entre les
 * deux. Un futur pas parallèle ou entrelacé des bacs devra porter ce tampon par le monde.
 */
let hungerKept = new Float64Array(64);

function keepHunger(fishes: readonly Entity[]): void {
  if (hungerKept.length < fishes.length) {
    hungerKept = new Float64Array(2 * fishes.length);
  }
  for (let i = 0; i < fishes.length; i++) {
    hungerKept[i] = fishes[i].hunger;
  }
}

function restoreHunger(fishes: Mutable<Entity>[]): void {
  for (let i = 0; i < fishes.length; i++) {
    fishes[i].hunger = hungerKept[i];
  }
}

function speciesById(species: SpeciesId): SpeciesDefinition {
  return SPECIES[species];
}

/**
 * Animaux affamés de longue date (`starveInPlace`, paramètre de capture `affames=1`, issue
 * #208) : renvoie un nouvel état, `world` n'est jamais modifié.
 */
export function starveWorld(world: World): World {
  const next = cloneWorld(world);
  starveWorldInPlace(next);
  return next;
}

/** Comme `starveWorld`, **en modifiant** `world` (monde en construction, avant le rendu). */
export function starveWorldInPlace(world: MutableWorld): void {
  starveInPlace(world.entities as Mutable<Entity>[]);
}

/**
 * Points blancs au stade aggravé pour tous les poissons qui peuvent les attraper
 * (`infectAllInPlace`, paramètre d'URL `points-blancs=1`, issue #366), **en modifiant**
 * `world` (monde en construction, avant le rendu).
 */
export function infectWorldInPlace(world: MutableWorld): void {
  infectAllInPlace(world.entities as Mutable<Entity>[], world.environment);
}

/**
 * Pourriture des nageoires au stade maximal pour tous les poissons qui peuvent l'attraper
 * (`rotAllFinsInPlace`, paramètre d'URL `pourriture=1`, issue #485), **en modifiant**
 * `world` (monde en construction, avant le rendu).
 */
export function rotWorldFinsInPlace(world: MutableWorld): void {
  rotAllFinsInPlace(world.entities as Mutable<Entity>[], world.environment);
}

/**
 * Velours au maximum pour tous les poissons qui peuvent l'attraper (`velvetAllInPlace`,
 * paramètre d'URL `velours=1`, issue #532), **en modifiant** `world` (monde en construction).
 */
export function velvetWorldInPlace(world: MutableWorld): void {
  velvetAllInPlace(world.entities as Mutable<Entity>[], world.environment);
}

/**
 * Champignons au maximum pour tous les poissons qui peuvent les attraper (`fungusAllInPlace`,
 * paramètre d'URL `champignons=1`, issue #548), **en modifiant** `world` (monde en
 * construction).
 */
export function fungusWorldInPlace(world: MutableWorld): void {
  fungusAllInPlace(world.entities as Mutable<Entity>[], world.environment);
}

/**
 * Hydropisie pour tous les poissons qui peuvent l'attraper (`dropsyAllInPlace`, paramètre
 * d'URL `hydropisie=1`, issue #565), **en modifiant** `world` (monde en construction) :
 * `progress` donne le stade (par défaut le maximum, écailles hérissées).
 */
export function dropsyWorldInPlace(world: MutableWorld, progress?: number): void {
  dropsyAllInPlace(world.entities as Mutable<Entity>[], world.environment, progress);
}

/**
 * Geste de soin contre les points blancs, le velours et les champignons
 * (`applyTreatmentInPlace`, issues #361, #532, #548), **en modifiant** l'eau de `world` s'il
 * est accepté : quantité `amount` (°C, g/L ou dose) du traitement `kind`, avec les espèces et
 * le nombre de malades du bac. Réservé au propriétaire unique du monde (`ui/aquarium-host`).
 */
export function treatWorldInPlace(
  world: MutableWorld,
  kind: TreatmentKind,
  amount: number,
): TreatmentOutcome {
  let infected = 0;
  let velvet = 0;
  let fungus = 0;
  let dropsy = 0;
  for (const entity of world.entities) {
    const ich = isIchAge(entity.ich);
    const veil = isVelvetProgress(entity.velvet);
    const cotton = isFungusProgress(entity.fungus);
    if (ich || veil || cotton) {
      infected += 1;
    }
    if (veil) {
      velvet += 1;
    }
    if (cotton) {
      fungus += 1;
    }
    if (isDropsyProgress(entity.dropsy)) {
      dropsy += 1;
    }
  }
  return applyTreatmentInPlace(world.water as MutableWaterState, kind, amount, {
    environment: world.environment,
    species: world.entities.map((entity) => entity.species),
    infected,
    velvet,
    fungus,
    dropsy,
  });
}

/**
 * Dose d'amorce de bactéries (issue #529, `doseBacteriaStarterInPlace`), **en modifiant**
 * `world`. Réservé au propriétaire unique du monde (`ui/aquarium-host`).
 */
export function doseWorldBacteriaStarterInPlace(world: MutableWorld): BacteriaStarterOutcome {
  return doseBacteriaStarterInPlace(world.water as MutableWaterState, BACTERIA_STARTER_DOSE);
}

/**
 * Dose de conditionneur (issue #530, `doseConditionerInPlace`), **en modifiant** `world`.
 * Réservé au propriétaire unique du monde (`ui/aquarium-host`).
 */
export function doseWorldConditionerInPlace(
  world: MutableWorld,
  kind: ConditionerKind,
): ConditionerOutcome {
  return doseConditionerInPlace(world.water as MutableWaterState, kind, 1);
}

/** Place ou retire le charbon actif (issue #531), **en modifiant** `world`. */
export function setWorldCarbonInPlace(world: MutableWorld, present: boolean): CarbonOutcome {
  return setCarbonInPlace(world.water as MutableWaterState, present);
}

/** Dose de régulateur de pH (issue #531), **en modifiant** `world`. */
export function doseWorldPhRegulatorInPlace(
  world: MutableWorld,
  direction: PhRegulatorDirection,
): PhRegulatorOutcome {
  return dosePhRegulatorInPlace(world.water as MutableWaterState, direction);
}

/** Active ou non les changements d'eau à l'eau non traitée (issue #530), **en modifiant**. */
export function setWorldUntreatedTapInPlace(world: MutableWorld, untreated: boolean): void {
  const water = world.water as MutableWaterState;
  if (untreated) {
    water.untreatedTap = true;
  } else {
    delete water.untreatedTap;
  }
}

/**
 * Changement d'eau (`changeWaterInPlace`, issue #206) : renvoie un nouvel état, `world`
 * n'est jamais modifié.
 */
export function changeWorldWater(world: World): World {
  const next = cloneWorld(world);
  changeWorldWaterInPlace(next);
  return next;
}

/**
 * Comme `changeWorldWater`, **en modifiant** `world`. Réservé au propriétaire unique du
 * monde (`ui/aquarium-host`), comme `advanceInPlace`.
 */
export function changeWorldWaterInPlace(world: MutableWorld): void {
  changeWaterInPlace(world.water as MutableWaterState, world.environment);
}

/** Résultat d'un passage de siphon (#605). */
export interface SiphonPass {
  /** Points du geste tombés dans l'eau (chacun retire un peu d'eau, `siphonedShare`). */
  readonly points: number;
  /** Granulés posés aspirés. */
  readonly food: number;
}

/**
 * Passage du siphon (#605), **en modifiant** `world` : chaque rayon `rays` vise un point du
 * sol (`siphonFloorPoint`) ; les granulés posés autour sont retirés (`siphonedFood`). L'eau
 * retirée n'est pas appliquée ici : la séance la compte et l'eau neuve dilue
 * (`refillWorldWaterInPlace`).
 */
export function siphonWorldInPlace(world: MutableWorld, rays: readonly ScraperRay[]): SiphonPass {
  const { water } = groundFor(world);
  const points: FloorPoint[] = [];
  for (const ray of rays) {
    const point = siphonFloorPoint(ray, water);
    if (point !== null) {
      points.push(point);
    }
  }
  const touched = siphonedFood(world.food, points);
  if (touched.length > 0) {
    const gone = new Set(touched);
    world.food = world.food.filter((_, index) => !gone.has(index));
  }
  return { points: points.length, food: touched.length };
}

/**
 * Eau neuve versée au seau (#605), **en modifiant** `world` : la part `share` est remplacée
 * (`changeWaterInPlace`) par de l'eau à `temperature` °C, avec le chlore du robinet si le
 * conditionneur a été oublié (`conditioner` faux).
 */
export function refillWorldWaterInPlace(
  world: MutableWorld,
  share: number,
  conditioner: boolean,
  temperature: number,
): void {
  changeWaterInPlace(world.water as MutableWaterState, world.environment, share, {
    untreated: !conditioner,
    temperature,
  });
}

/**
 * Consigne du chauffage (`setHeaterInPlace`, issue #207) : renvoie un nouvel état, `world`
 * n'est jamais modifié.
 * @throws RangeError comme `setHeaterInPlace`.
 */
export function setWorldHeater(world: World, temperature: number): World {
  const next = cloneWorld(world);
  setWorldHeaterInPlace(next, temperature);
  return next;
}

/**
 * Comme `setWorldHeater`, **en modifiant** `world` ; renvoie la consigne retenue (arrondie
 * au dixième). Réservé au propriétaire unique du monde (`ui/aquarium-host`).
 * @throws RangeError comme `setHeaterInPlace` (monde inchangé).
 */
export function setWorldHeaterInPlace(world: MutableWorld, temperature: number): number {
  return setHeaterInPlace(world.water as MutableWaterState, temperature);
}

/**
 * Durée d'éclairage du bac (issue #476, `setLightingInPlace`), **en modifiant** `world` :
 * heures entières par jour, valeur par défaut non écrite. Renvoie faux, sans rien changer,
 * hors de [`MIN_LIGHTING_HOURS`, `MAX_LIGHTING_HOURS`].
 */
export function setWorldLightingInPlace(world: MutableWorld, hours: number): boolean {
  return setLightingInPlace(world.water as MutableWaterState, hours);
}

/**
 * Heure d'allumage de la lampe du bac (issue #584, `setLampOnInPlace`), **en modifiant**
 * `world` : heure entière de 0 à 23, valeur par défaut non écrite. Renvoie faux, sans rien
 * changer, hors de ces heures.
 */
export function setWorldLampOnInPlace(world: MutableWorld, hour: number): boolean {
  return setLampOnInPlace(world.water as MutableWaterState, hour);
}

/** Plaques d'algues du bac de `world` (`algaePatches`), vides hors des bacs à algues. */
export function worldAlgaePatches(world: World): readonly AlgaePatch[] {
  return hasAlgae(world.environment)
    ? cachedAlgaePatches(world.seed, environmentWater(world))
    : NO_ALGAE_PATCHES;
}

const NO_ALGAE_PATCHES: readonly AlgaePatch[] = Object.freeze([]);

/**
 * Raclette (issue #476), **en modifiant** `world` : retire la plaque d'algues visible
 * touchée la première par le rayon (`origin`, `direction`, repère du bac). Ne touche ni aux
 * poissons ni au reste de l'eau. Renvoie l'indice de la plaque retirée, `-1` si aucune.
 */
export function scrapeWorldAlgaeInPlace(
  world: MutableWorld,
  origin: readonly [number, number, number],
  direction: readonly [number, number, number],
): number {
  const index = scrapedPatch(worldAlgaePatches(world), world.water.algae, origin, direction);
  return index >= 0 && scrapeAlgaeInPlace(world.water as MutableWaterState, index) ? index : -1;
}

/**
 * Passage de raclette le long d'une trajectoire (#604), **en modifiant** `world` : chaque
 * plaque visible touchée par l'un des rayons `rays` est retirée (`scrapedPatchesAlong`).
 * Renvoie les indices des plaques retirées, dans l'ordre du passage.
 */
export function scrapeWorldAlgaeAlongInPlace(
  world: MutableWorld,
  rays: readonly ScraperRay[],
): number[] {
  const touched = scrapedPatchesAlong(worldAlgaePatches(world), world.water.algae, rays);
  for (const index of touched) {
    scrapeAlgaeInPlace(world.water as MutableWaterState, index);
  }
  return touched;
}

/**
 * Taille (issue #477), **en modifiant** `world` : ramène la plante à tige d'indice `index` de
 * `World.decor` à sa hauteur de repli (`prunePlantInPlace`). Renvoie vrai si elle a raccourci
 * (faux pour un autre élément, une plante sans pousse visible ou un bac où rien ne pousse).
 */
export function pruneWorldPlantInPlace(world: MutableWorld, index: number): boolean {
  const item = world.decor[index];
  if (!item || !isGrowingPlant(item) || !hasPlantGrowth(world.environment)) {
    return false;
  }
  return prunePlantInPlace(
    world.water.plantGrowth as MutablePlantGrowth | undefined,
    item,
    environmentWater(world).maxY,
  );
}

/**
 * Commence le suivi de l'entretien de `world` au temps courant s'il n'a pas encore de
 * calendrier (#513) : un bac neuf ou une ancienne sauvegarde ne part pas en retard.
 */
export function ensureWorldMaintenanceInPlace(world: MutableWorld): MaintenanceState {
  return (world.maintenance ??= initialMaintenance(world.time));
}

/** Enregistre la tâche d'entretien `task` faite maintenant, **en modifiant** `world` (#513). */
export function recordWorldMaintenanceInPlace(world: MutableWorld, task: MaintenanceTask): void {
  world.maintenance = maintenanceDone(ensureWorldMaintenanceInPlace(world), task, world.time);
}

/** Vrai si le bac a une plante à tige à tailler (#513). */
export function worldHasPrunablePlants(world: World): boolean {
  return hasPlantGrowth(world.environment) && world.decor.some(isGrowingPlant);
}

/**
 * Pousse affichée (voxels entiers, `shownGrowth`, #477) de l'élément d'indice `index` de
 * `World.decor` : 0 pour un autre élément, ou dans un bac où rien ne pousse.
 */
export function worldShownPlantGrowth(world: World, index: number): number {
  const item = world.decor[index];
  return item && isGrowingPlant(item) && hasPlantGrowth(world.environment)
    ? shownGrowth(world.water.plantGrowth, item, environmentWater(world).maxY)
    : 0;
}

/** Lumière gardée au fond du bac de `world` sous les plantes hautes (`plantShade`, #477). */
export function worldPlantShade(world: World): number {
  return hasPlantGrowth(world.environment)
    ? plantShade(world.water.plantGrowth, world.decor, environmentWater(world).maxY)
    : 1;
}

/**
 * Nombre de feuilles de catappa (`withCatappaCount`, issue #239) : renvoie un nouvel état,
 * `world` n'est jamais modifié.
 * @throws RangeError comme `withCatappaCount`.
 */
export function setWorldCatappa(world: World, count: number): World {
  const next = cloneWorld(world);
  setWorldCatappaInPlace(next, count);
  return next;
}

/**
 * Comme `setWorldCatappa`, **en modifiant** `world` : feuilles neuves ajoutées, les plus
 * décomposées retirées d'abord ; sans feuille, le champ `catappa` disparaît de l'eau.
 * Réservé au propriétaire unique du monde (`ui/aquarium-host`).
 * @throws RangeError comme `withCatappaCount` (monde inchangé).
 */
export function setWorldCatappaInPlace(world: MutableWorld, count: number): void {
  const leaves = withCatappaCount(world.water.catappa, count);
  const water = world.water as MutableWaterState;
  if (leaves.length === 0) {
    delete water.catappa;
  } else {
    water.catappa = leaves;
  }
}

/** Point visé vers la nourriture, réutilisé d'un poisson à l'autre (aucune allocation). */
const FOOD_TARGET: Vec3 = { x: 0, y: 0, z: 0 };
/** Point visé vers l'anémone, réutilisé d'un poisson à l'autre (aucune allocation). */
const HOME_TARGET: Vec3 = { x: 0, y: 0, z: 0 };

/**
 * Point visé par un poisson attaché à l'anémone `home` (issue #150), passé à `stepFish` à la
 * place de la nourriture : le cœur des tentacules (`refugeY`) tant qu'un granulé déposé il y
 * a moins de `refugeDuration` secondes est à moins de `refugeRadius` de l'anémone (à
 * l'horizontale) ; sinon la nourriture visée (`food`), s'il y en a ; sinon le point d'attache
 * (`hoverY`) quand le poisson s'en est éloigné de plus de `leashRadius` ; sinon rien (nage
 * libre). Sans anémone (`home` nul) : `food` inchangé.
 */
export function bondTarget(
  fish: Entity,
  bond: AnemoneBondParams,
  home: AnemoneHome | null,
  pellets: readonly FoodPellet[],
  food: Vec3 | null,
): Vec3 | null {
  if (home === null) {
    return food;
  }
  const r2 = bond.refugeRadius * bond.refugeRadius;
  for (const p of pellets) {
    const dx = p.x - home.x;
    const dz = p.z - home.z;
    if (p.age < bond.refugeDuration && dx * dx + dz * dz < r2) {
      HOME_TARGET.x = home.x;
      HOME_TARGET.y = home.refugeY;
      HOME_TARGET.z = home.z;
      return HOME_TARGET;
    }
  }
  if (food !== null) {
    return food;
  }
  const dx = fish.x - home.x;
  const dy = fish.y - home.hoverY;
  const dz = fish.z - home.z;
  if (dx * dx + dy * dy + dz * dz > bond.leashRadius * bond.leashRadius) {
    HOME_TARGET.x = home.x;
    HOME_TARGET.y = home.hoverY;
    HOME_TARGET.z = home.z;
    return HOME_TARGET;
  }
  return null;
}

/**
 * Environnement du pas en cours, lu par les rappels ci-dessous : des fonctions de module,
 * pour ne créer aucune fermeture par pas.
 */
let currentPlace: Place = DEFAULT_ENVIRONMENT_ID;
let currentKey: string = DEFAULT_ENVIRONMENT_ID;

function boundsOfFish(fish: Entity): SwimBounds {
  return boundsAt(fish.species, currentPlace, currentKey);
}

function hardOfFish(fish: Entity): SwimBounds['hard'] {
  return boundsAt(fish.species, currentPlace, currentKey).hard;
}

function bandOfFish(fish: Entity): FeedingBand {
  return bandFor(fish.species, currentPlace, currentKey);
}

/**
 * Valeur par espèce et par lieu (`placeKey`), calculée une fois : deux tables imbriquées, pour
 * qu'une lecture n'alloue rien (pas de clé composée). `compute` est une fonction de module
 * (pas de fermeture créée à chaque lecture) ; une seule lecture des tables par appel (#97).
 */
function cached<T>(
  cache: Map<string, Map<SpeciesId, T>>,
  species: SpeciesId,
  place: Place,
  key: string,
  compute: (species: SpeciesId, place: Place) => T,
): T {
  let perSpecies = cache.get(key);
  if (!perSpecies) {
    perSpecies = new Map();
    trimCache(cache);
    cache.set(key, perSpecies);
  }
  let value = perSpecies.get(species);
  if (value === undefined) {
    value = compute(species, place);
    perSpecies.set(species, value);
  }
  return value;
}

/** Tranches d'eau de l'alimentation par espèce et par lieu. */
const BAND_CACHE = new Map<string, Map<SpeciesId, FeedingBand>>();

function computeBand(species: SpeciesId, place: Place): FeedingBand {
  return feedingBand(SPECIES[species].feeding, environmentWater(place));
}

function bandFor(species: SpeciesId, place: Place, key: string): FeedingBand {
  return cached(BAND_CACHE, species, place, key, computeBand);
}

/** Tampon de pilotage réutilisé d'un pas à l'autre ; réalloué seulement si la population croît. */
let steeringScratch = new Float64Array(0);

function steeringBuffer(count: number): Float64Array {
  if (steeringScratch.length < count * 3) {
    steeringScratch = new Float64Array(count * 3);
  }
  return steeringScratch;
}

/** Bornes de nage par espèce et par lieu (aucune allocation une fois calculées). */
const BOUNDS_CACHE = new Map<string, Map<SpeciesId, SwimBounds>>();

/**
 * Bornes de nage d'une espèce dans un environnement (le bac tropical par défaut) ou dans un
 * lieu aux dimensions réglées (un monde), partagées : ne pas modifier.
 */
export function boundsFor(
  species: SpeciesId,
  environment: Place = DEFAULT_ENVIRONMENT_ID,
): SwimBounds {
  return boundsAt(species, environment, placeKey(environment));
}

function computeBounds(species: SpeciesId, place: Place): SwimBounds {
  return swimBounds(SPECIES[species], environmentWater(place), placeShape(place));
}

function boundsAt(species: SpeciesId, place: Place, key: string): SwimBounds {
  return cached(BOUNDS_CACHE, species, place, key, computeBounds);
}

/** Copie profonde d'un monde, modifiable (aucune donnée partagée avec `world`). */
export function cloneWorld(world: World): MutableWorld {
  return structuredClone(world) as MutableWorld;
}

function assertSteps(steps: number): void {
  if (!Number.isInteger(steps) || steps < 0) {
    throw new RangeError(`steps doit être un entier positif ou nul (reçu : ${steps})`);
  }
}
