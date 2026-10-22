import { assertSeed } from '../core/random/prng';
import { createWalker, stepWalker, type WalkerGround } from './axolotl';
import { createFrog, stepFrog } from './frog';
import { fillBubbles, type BubbleBuffer } from './bubbles';
import { SIM_DT } from './constants';
import { decorObstacles, parseDecorItems, type DecorItem } from './decor';
import {
  DEFAULT_ENVIRONMENT_ID,
  environmentById,
  environmentWater,
  type EnvironmentId,
} from './environment';
import { eatInPlace, feedingBand, foodTarget, type FeedingBand } from './feeding';
import { computeSchoolSteering, enforceMinDistance, type Vec3 } from './flocking';
import { dropFoodInPlace, stepFoodInPlace, type FoodPellet } from './food';
import { validateObstacle, type Obstacle } from './obstacles';
import { SPECIES, type SpeciesId } from './species';
import { createFish, stepFish, swimBounds, type Fish, type SwimBounds } from './swimmer';
import { assertTimeStep } from './time-step';

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
   * de collision sont ajoutées à `obstacles`, après les obstacles explicites (ADR 0015).
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
 * suivant le plus grand d'entre eux. Les poissons naissent hors des obstacles (`createFish`).
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
  environment: EnvironmentId = DEFAULT_ENVIRONMENT_ID,
): World {
  assertSeed(seed);
  const env = environmentById(environment);
  const decorItems = parseDecorItems(decor, env.dimensions);
  const sortedObstacles = copyObstacles(obstacles);
  const firstDecorId = sortedObstacles.length > 0 ? sortedObstacles.at(-1)!.id + 1 : 0;
  sortedObstacles.push(...decorObstacles(decorItems, firstDecorId));
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
      entities.push(spawnEntity(seed, entities.length, species, environment, sortedObstacles));
    }
  }
  return {
    seed,
    environment,
    tick: 0,
    time: 0,
    entities,
    obstacles: sortedObstacles,
    decor: decorItems,
    food: [],
    nextFoodId: 0,
    nextFishId: entities.length,
  };
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
  environment: EnvironmentId,
  obstacles: readonly Obstacle[],
): Entity {
  const bounds = boundsFor(species, environment);
  const def = SPECIES[species];
  if (def.walker !== undefined) {
    return createWalker(seed, id, species, bounds, groundFor(environment), obstacles);
  }
  if (def.amphibian !== undefined) {
    return createFrog(seed, id, species, bounds, groundFor(environment), obstacles);
  }
  return createFish(seed, id, species, bounds, obstacles);
}

/** Sol et eau de chaque environnement, pour les espèces qui marchent sur le fond. */
const GROUND_CACHE = new Map<EnvironmentId, WalkerGround>();

function groundFor(environment: EnvironmentId): WalkerGround {
  let ground = GROUND_CACHE.get(environment);
  if (!ground) {
    ground = {
      water: environmentWater(environment),
      terrain: environmentById(environment).terrain,
    };
    GROUND_CACHE.set(environment, ground);
  }
  return ground;
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
  return fillBubbles(world.seed, world.time, out);
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
    environmentWater(world.environment),
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
  const environment = world.environment;
  const steering = steeringBuffer(fishes.length);
  computeSchoolSteering(fishes, steering);
  // Nourriture (issue #68) : point visé calculé, comme le banc, sur les positions du début du
  // pas ; sans granulé, `target` reste nul et la nage est exactement celle d'avant.
  const food = world.food as FoodPellet[];
  // Ordre stable : celui du tableau, c'est-à-dire des identifiants.
  for (let i = 0; i < fishes.length; i++) {
    const fish = fishes[i];
    const bounds = boundsFor(fish.species, environment);
    if (SPECIES[fish.species].walker !== undefined) {
      // Espèce qui marche sur le fond (axolotl) : sa propre machine à états, sans banc ni
      // recherche de nourriture (`sim/axolotl.ts`).
      stepWalker(fish, dt, world.seed, world.time, bounds, groundFor(environment));
      continue;
    }
    if (SPECIES[fish.species].amphibian !== undefined) {
      // Espèce amphibie (grenouille) : posée, sauts, nage, entre terre et eau, sans banc ni
      // recherche de nourriture (`sim/frog.ts`).
      stepFrog(fish, dt, world.seed, world.time, bounds, groundFor(environment));
      continue;
    }
    const target =
      food.length === 0
        ? null
        : foodTarget(
            fish,
            SPECIES[fish.species],
            food,
            bandFor(fish.species, environment),
            bounds.hard,
            FOOD_TARGET,
            world.obstacles,
          );
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
  currentEnvironment = environment;
  enforceMinDistance(fishes, boundsOfFish);
  eatInPlace(fishes, food, bandOfFish, hardOfFish);
  stepFoodInPlace(food, dt);
}

/** Point visé vers la nourriture, réutilisé d'un poisson à l'autre (aucune allocation). */
const FOOD_TARGET: Vec3 = { x: 0, y: 0, z: 0 };

/**
 * Environnement du pas en cours, lu par les rappels ci-dessous : des fonctions de module,
 * pour ne créer aucune fermeture par pas.
 */
let currentEnvironment: EnvironmentId = DEFAULT_ENVIRONMENT_ID;

function boundsOfFish(fish: Entity): SwimBounds {
  return boundsFor(fish.species, currentEnvironment);
}

function hardOfFish(fish: Entity): SwimBounds['hard'] {
  return boundsFor(fish.species, currentEnvironment).hard;
}

function bandOfFish(fish: Entity): FeedingBand {
  return bandFor(fish.species, currentEnvironment);
}

/**
 * Valeur par espèce et par environnement, calculée une fois : deux tables imbriquées, pour
 * qu'une lecture n'alloue rien (pas de clé composée).
 */
function cached<T>(
  cache: Map<EnvironmentId, Map<SpeciesId, T>>,
  species: SpeciesId,
  environment: EnvironmentId,
  compute: () => T,
): T {
  let perSpecies = cache.get(environment);
  if (!perSpecies) {
    perSpecies = new Map();
    cache.set(environment, perSpecies);
  }
  let value = perSpecies.get(species);
  if (value === undefined) {
    value = compute();
    perSpecies.set(species, value);
  }
  return value;
}

/** Tranches d'eau de l'alimentation par espèce et par environnement. */
const BAND_CACHE = new Map<EnvironmentId, Map<SpeciesId, FeedingBand>>();

function bandFor(species: SpeciesId, environment: EnvironmentId): FeedingBand {
  const band = BAND_CACHE.get(environment)?.get(species);
  return (
    band ??
    cached(BAND_CACHE, species, environment, () =>
      feedingBand(SPECIES[species].feeding, environmentWater(environment)),
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

/** Bornes de nage par espèce et par environnement (aucune allocation une fois calculées). */
const BOUNDS_CACHE = new Map<EnvironmentId, Map<SpeciesId, SwimBounds>>();

/**
 * Bornes de nage d'une espèce dans un environnement (le bac tropical par défaut), partagées :
 * ne pas modifier.
 */
export function boundsFor(
  species: SpeciesId,
  environment: EnvironmentId = DEFAULT_ENVIRONMENT_ID,
): SwimBounds {
  const bounds = BOUNDS_CACHE.get(environment)?.get(species);
  return (
    bounds ??
    cached(BOUNDS_CACHE, species, environment, () =>
      swimBounds(SPECIES[species], environmentWater(environment)),
    )
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
