import { assertSeed } from '../core/random/prng';
import { SIM_DT } from './constants';
import { SPECIES, type SpeciesId } from './species';
import { createFish, stepFish, swimBounds, type Fish, type SwimBounds } from './swimmer';
import { waterVolume } from './tank';

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
  /** Temps simulé écoulé, en secondes. */
  readonly time: number;
  readonly entities: readonly Entity[];
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/**
 * Crée un monde à `time = 0`, vide par défaut, peuplé dans l'ordre de `population`
 * (identifiants consécutifs à partir de 0) dans le bac par défaut (`sim/tank.ts`).
 * @throws RangeError si la graine n'est pas un entier 32 bits non signé, ou si un effectif
 * n'est pas un entier positif ou nul.
 */
export function createWorld(seed: number, population: readonly PopulationEntry[] = []): World {
  assertSeed(seed);
  const entities: Entity[] = [];
  for (const { species, count } of population) {
    if (!Number.isInteger(count) || count < 0) {
      throw new RangeError(`count doit être un entier positif ou nul (reçu : ${count})`);
    }
    if (!(species in SPECIES)) {
      throw new RangeError(`espèce inconnue : ${String(species)}`);
    }
    for (let i = 0; i < count; i++) {
      entities.push(createFish(seed, entities.length, species, boundsFor(species)));
    }
  }
  return { seed, tick: 0, time: 0, entities };
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
  assertDt(dt);
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
  if (!Number.isInteger(steps) || steps < 0) {
    throw new RangeError(`steps doit être un entier positif ou nul (reçu : ${steps})`);
  }
  if (steps === 0) {
    return world;
  }
  const next = cloneWorld(world);
  for (let i = 0; i < steps; i++) {
    stepInPlace(next, SIM_DT);
  }
  return next;
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

function stepInPlace(world: Mutable<World>, dt: number): void {
  world.tick += 1;
  world.time += dt;
  // Ordre stable : celui du tableau, c'est-à-dire des identifiants.
  for (const fish of world.entities as Mutable<Entity>[]) {
    stepFish(fish, dt, boundsFor(fish.species));
  }
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

function cloneWorld(world: World): Mutable<World> {
  return structuredClone(world) as Mutable<World>;
}

function assertDt(dt: number): void {
  if (!(dt > 0) || !Number.isFinite(dt)) {
    throw new RangeError(`dt doit être un réel strictement positif (reçu : ${dt})`);
  }
}
