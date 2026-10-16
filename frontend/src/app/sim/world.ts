import { assertSeed } from '../core/random/prng';
import { SIM_DT } from './constants';

/**
 * Entité de la simulation (poisson, plante…). Vide pour l'instant : les espèces arrivent
 * avec l'issue « Première espèce qui nage ». Chaque entité tirera son hasard de
 * `createEntityPrng(world.seed, id)` (core/random/prng.ts).
 */
export interface Entity {
  /** Identifiant unique, entier 32 bits non signé. */
  readonly id: number;
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
 * Crée un monde vide à `time = 0`.
 * @throws RangeError si la graine n'est pas un entier 32 bits non signé.
 */
export function createWorld(seed: number): World {
  return { seed: assertSeed(seed), tick: 0, time: 0, entities: [] };
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
  // Les comportements des entités viendront ici (dans un ordre stable, par identifiant).
}

function cloneWorld(world: World): Mutable<World> {
  return structuredClone(world) as Mutable<World>;
}

function assertDt(dt: number): void {
  if (!(dt > 0) || !Number.isFinite(dt)) {
    throw new RangeError(`dt doit être un réel strictement positif (reçu : ${dt})`);
  }
}
