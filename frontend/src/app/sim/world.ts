import { assertSeed } from '../core/random/prng';
import { createWalker, stepWalker, type WalkerGround } from './axolotl';
import { createFrog, stepFrog } from './frog';
import { bubbleSourceFor, fillBubbles, type BubbleBuffer } from './bubbles';
import { SIM_DT } from './constants';
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
import {
  DEFAULT_ENVIRONMENT_ID,
  environmentById,
  environmentWater,
  isTankResizable,
  PLACE_CACHE_LIMIT,
  placeDimensions,
  placeEnvironment,
  placeKey,
  type EnvironmentId,
  type Place,
} from './environment';
import { eatInPlace, feedingBand, foodTarget, type FeedingBand } from './feeding';
import { computeSchoolSteering, enforceMinDistance, type Vec3 } from './flocking';
import { dropFoodInPlace, stepFoodInPlace, type FoodPellet } from './food';
import { validateObstacle, type Obstacle } from './obstacles';
import { SPECIES, type AnemoneBondParams, type SpeciesId } from './species';
import { createFish, stepFish, swimBounds, type Fish, type SwimBounds } from './swimmer';
import { clampTankDimensions, type TankDimensions } from './tank';
import { assertTimeStep } from './time-step';
import {
  changeWaterInPlace,
  freshWater,
  stepWaterInPlace,
  WATER_TEMPERATURES,
  waterLiters,
  waterLoad,
  type MutableWaterState,
  type WaterState,
} from './water';

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
  // Lieu du monde : l'environnement seul, ou avec ses dimensions réglées (bornées).
  const where: Place = dimensions === undefined ? environment : { environment, dimensions };
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
  if (!isTankResizable(place.environment)) {
    throw new RangeError(`dimensions non réglables dans l’environnement ${place.environment}`);
  }
  return clampTankDimensions(place.dimensions);
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
 * son décor de départ (`sim/environment.ts`).
 * @throws RangeError si la graine ou l'environnement est invalide.
 */
export function createDefaultWorld(
  seed: number,
  environment: EnvironmentId = DEFAULT_ENVIRONMENT_ID,
): World {
  const env = environmentById(environment);
  return createWorld(seed, env.population, [], env.decor, environment);
}

/**
 * Fait avancer le monde d'un pas. Fonction pure : `world` n'est **jamais** modifié, un
 * nouvel état est renvoyé.
 * @throws RangeError si `dt` n'est pas un réel strictement positif.
 */
export function step(world: World, dt: number = SIM_DT): World {
  assertTimeStep(dt);
  const next = cloneWorld(world);
  stepInPlace(next, dt);
  return next;
}

/**
 * Fait avancer le monde de `steps` pas de `SIM_DT`. Une seule copie de l'état, puis
 * aucune allocation par pas. `world` n'est jamais modifié.
 * @throws RangeError si `steps` n'est pas un entier positif ou nul.
 */
export function advance(world: World, steps: number): World {
  assertSteps(steps);
  if (steps === 0) {
    return world;
  }
  const next = cloneWorld(world);
  advanceInPlace(next, steps);
  return next;
}

/**
 * Fait avancer `world` de `steps` pas de `SIM_DT` **en le modifiant** : aucune allocation.
 * Réservé au propriétaire unique du monde (boucle d'affichage de `ui/aquarium-host`, appelée
 * à chaque image) ; les tests et le reste du code utilisent `step` / `advance`, purs.
 * @throws RangeError si `steps` n'est pas un entier positif ou nul (monde inchangé).
 */
export function advanceInPlace(world: MutableWorld, steps: number): void {
  assertSteps(steps);
  for (let i = 0; i < steps; i++) {
    stepInPlace(world, SIM_DT);
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
  if (world.dimensions === undefined) {
    return fillBubbles(world.seed, world.time, out);
  }
  return fillBubbles(
    world.seed,
    world.time,
    out,
    bubbleSourceFor(world.dimensions),
    environmentWater(world),
  );
}

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
  return dropFoodInPlace(
    world as MutableWorld & { food: FoodPellet[] },
    x,
    z,
    environmentWater(world),
  );
}

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
): World {
  const target = ticksFor(time);
  const ordered = feedings
    .map((feeding, index) => ({ feeding, index, tick: ticksFor(feeding.time) }))
    .filter((entry) => entry.tick <= target)
    .sort((a, b) => a.tick - b.tick || a.index - b.index);
  let current = world;
  for (const { feeding, tick } of ordered) {
    current = feed(advance(current, Math.max(0, tick - current.tick)), feeding.x, feeding.z);
  }
  return advance(current, Math.max(0, target - current.tick));
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
export function advanceTo(world: World, time: number): World {
  return advance(world, Math.max(0, ticksFor(time) - world.tick));
}

function stepInPlace(world: MutableWorld, dt: number): void {
  world.tick += 1;
  // Pas nominal : temps dérivé du compteur (exact, sans cumul d'erreur flottante).
  // Pas libre (`step(world, dt)`, tests) : temps cumulé.
  world.time = dt === SIM_DT ? world.tick * SIM_DT : world.time + dt;
  // Deux phases : le pilotage de banc de tous les poissons est calculé sur les positions du
  // début du pas, puis chacun nage. Le résultat ne dépend donc pas de l'ordre de mise à jour.
  const fishes = world.entities as Mutable<Entity>[];
  // Lieu du pas : une seule clé calculée par pas, lue par toutes les tables (`placeKey`).
  const place: Place = world;
  const key = placeKey(place);
  const steering = steeringBuffer(fishes.length);
  computeSchoolSteering(fishes, steering);
  // Nourriture (issue #68) : point visé calculé, comme le banc, sur les positions du début du
  // pas ; sans granulé, `target` reste nul et la nage est exactement celle d'avant.
  const food = world.food as FoodPellet[];
  // Anémones (issue #150) : points d'attache des poissons-clowns, aucun hors du récif.
  const homes = worldAnemoneHomes(world);
  let bondRank = 0;
  // Ordre stable : celui du tableau, c'est-à-dire des identifiants.
  for (let i = 0; i < fishes.length; i++) {
    const fish = fishes[i];
    const bounds = boundsAt(fish.species, place, key);
    if (SPECIES[fish.species].walker !== undefined) {
      // Espèce qui marche sur le fond (axolotl) : sa propre machine à états, sans banc ni
      // recherche de nourriture (`sim/axolotl.ts`).
      stepWalker(fish, dt, world.seed, world.time, bounds, groundFor(place, key));
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
    stepFish(
      fish,
      dt,
      bounds,
      steering[3 * i],
      steering[3 * i + 1],
      steering[3 * i + 2],
      world.obstacles,
      target,
    );
  }
  currentPlace = place;
  currentKey = key;
  enforceMinDistance(fishes, boundsOfFish);
  eatInPlace(fishes, food, bandOfFish, hardOfFish);
  stepFoodInPlace(food, dt);
  // Eau (issue #206) : sans hasard, après les poissons ; ne change rien à leur nage.
  stepWaterInPlace(
    world.water as MutableWaterState,
    dt,
    waterLoad(fishes),
    waterLiters(environmentWater(place)),
    WATER_TEMPERATURES[world.environment],
  );
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
  changeWaterInPlace(world.water as MutableWaterState);
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
 * qu'une lecture n'alloue rien (pas de clé composée).
 */
function cached<T>(
  cache: Map<string, Map<SpeciesId, T>>,
  species: SpeciesId,
  key: string,
  compute: () => T,
): T {
  let perSpecies = cache.get(key);
  if (!perSpecies) {
    perSpecies = new Map();
    trimCache(cache);
    cache.set(key, perSpecies);
  }
  let value = perSpecies.get(species);
  if (value === undefined) {
    value = compute();
    perSpecies.set(species, value);
  }
  return value;
}

/** Tranches d'eau de l'alimentation par espèce et par lieu. */
const BAND_CACHE = new Map<string, Map<SpeciesId, FeedingBand>>();

function bandFor(species: SpeciesId, place: Place, key: string): FeedingBand {
  const band = BAND_CACHE.get(key)?.get(species);
  return (
    band ??
    cached(BAND_CACHE, species, key, () =>
      feedingBand(SPECIES[species].feeding, environmentWater(place)),
    )
  );
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

function boundsAt(species: SpeciesId, place: Place, key: string): SwimBounds {
  const bounds = BOUNDS_CACHE.get(key)?.get(species);
  return (
    bounds ??
    cached(BOUNDS_CACHE, species, key, () => swimBounds(SPECIES[species], environmentWater(place)))
  );
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
