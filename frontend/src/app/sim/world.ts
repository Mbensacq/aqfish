import { assertSeed } from '../core/random/prng';
import { SIM_DT } from './constants';
import { computeSchoolSteering, enforceMinDistance } from './flocking';
import { validateObstacle, type Obstacle } from './obstacles';
import { SPECIES, type SpeciesId } from './species';
import { createFish, stepFish, swimBounds, type Fish, type SwimBounds } from './swimmer';
import { waterVolume } from './tank';
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
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/**
 * Monde modifiable en place, possédé par un seul propriétaire (la boucle d'affichage de
 * `ui/aquarium-host`). Un `World` fraîchement créé lui est assignable.
 */
export type MutableWorld = Mutable<World>;

/**
 * Crée un monde à `time = 0`, vide par défaut, peuplé dans l'ordre de `population`
 * (identifiants consécutifs à partir de 0) dans le bac par défaut (`sim/tank.ts`), avec les
 * `obstacles` donnés (copiés, triés par identifiant) ; les poissons naissent hors des
 * obstacles (`createFish`).
 * @throws RangeError si la graine n'est pas un entier 32 bits non signé, si un effectif
 * n'est pas un entier positif ou nul, si un obstacle est invalide ou si deux obstacles ont
 * le même identifiant.
 */
export function createWorld(
  seed: number,
  population: readonly PopulationEntry[] = [],
  obstacles: readonly Obstacle[] = [],
): World {
  assertSeed(seed);
  const sortedObstacles = copyObstacles(obstacles);
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
      entities.push(
        createFish(seed, entities.length, species, boundsFor(species), sortedObstacles),
      );
    }
  }
  return { seed, tick: 0, time: 0, entities, obstacles: sortedObstacles };
}

function copyObstacles(obstacles: readonly Obstacle[]): Obstacle[] {
  const copies = obstacles.map((o) => ({ ...o }));
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

/** Monde par défaut de l'application : chaque espèce avec sa population par défaut. */
export function createDefaultWorld(seed: number): World {
  return createWorld(
    seed,
    Object.values(SPECIES).map((def) => ({ species: def.id, count: def.defaultPopulation })),
  );
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
  const steering = steeringBuffer(fishes.length);
  computeSchoolSteering(fishes, steering);
  // Ordre stable : celui du tableau, c'est-à-dire des identifiants.
  for (let i = 0; i < fishes.length; i++) {
    const fish = fishes[i];
    stepFish(
      fish,
      dt,
      boundsFor(fish.species),
      steering[3 * i],
      steering[3 * i + 1],
      steering[3 * i + 2],
      world.obstacles,
    );
  }
  enforceMinDistance(fishes, boundsOfFish);
}

function boundsOfFish(fish: Entity): SwimBounds {
  return boundsFor(fish.species);
}

/** Tampon de pilotage réutilisé d'un pas à l'autre ; réalloué seulement si la population croît. */
let steeringScratch = new Float64Array(0);

function steeringBuffer(count: number): Float64Array {
  if (steeringScratch.length < count * 3) {
    steeringScratch = new Float64Array(count * 3);
  }
  return steeringScratch;
}

/** Bornes de nage par espèce dans le bac par défaut, calculées une fois (aucune allocation par pas). */
const BOUNDS_CACHE = new Map<SpeciesId, SwimBounds>();

function boundsFor(species: SpeciesId): SwimBounds {
  let bounds = BOUNDS_CACHE.get(species);
  if (!bounds) {
    bounds = swimBounds(SPECIES[species], waterVolume());
    BOUNDS_CACHE.set(species, bounds);
  }
  return bounds;
}

function cloneWorld(world: World): MutableWorld {
  return structuredClone(world) as MutableWorld;
}

function assertSteps(steps: number): void {
  if (!Number.isInteger(steps) || steps < 0) {
    throw new RangeError(`steps doit être un entier positif ou nul (reçu : ${steps})`);
  }
}
