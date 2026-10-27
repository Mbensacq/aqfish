import { ENVIRONMENT_IDS, type EnvironmentId } from './environment';
import { createDefaultWorld, type World } from './world';

/**
 * Mondes des environnements visités mais non affichés (issue #277, ADR 0063) : changer
 * d'environnement range le monde quitté et reprend celui de l'environnement choisi, tel
 * qu'il avait été laissé ; un environnement jamais visité part de son monde de départ
 * (`createDefaultWorld`, avec la graine du monde quitté).
 *
 * Un monde rangé est **figé** : il n'est jamais avancé tant qu'il n'est pas affiché (son
 * `tick` est celui du moment où on l'a quitté). Les mondes ne sont pas copiés : celui qui
 * appelle cède le monde quitté et reçoit la propriété du monde repris.
 */
export type StashedWorlds = ReadonlyMap<EnvironmentId, World>;

/** Résultat de `switchEnvironment`. */
export interface EnvironmentSwitch {
  /** Monde de l'environnement choisi, à afficher. */
  readonly world: World;
  /** Mondes rangés après le changement : le monde quitté y est, le monde repris n'y est plus. */
  readonly stash: StashedWorlds;
  /** `true` si le monde a été repris des mondes rangés, `false` s'il est neuf. */
  readonly resumed: boolean;
}

/**
 * Change d'environnement : range `current` et reprend le monde de `target` (rangé, ou neuf).
 * Fonction pure : `stash` n'est pas modifié, une nouvelle table est renvoyée.
 * @throws RangeError si `target` est l'environnement de `current`, ou si `stash` contient un
 * monde rangé sous un autre environnement que le sien.
 */
export function switchEnvironment(
  current: World,
  stash: StashedWorlds,
  target: EnvironmentId,
): EnvironmentSwitch {
  if (target === current.environment) {
    throw new RangeError(`environnement déjà affiché (${target})`);
  }
  assertStash(stash);
  const next = new Map<EnvironmentId, World>(stash);
  next.set(current.environment, current);
  const kept = next.get(target);
  next.delete(target);
  return kept === undefined
    ? { world: createDefaultWorld(current.seed, target), stash: next, resumed: false }
    : { world: kept, stash: next, resumed: true };
}

/**
 * Mondes rangés dans l'ordre des environnements (`ENVIRONMENT_IDS`), sans celui de
 * `shown` : ordre stable pour la sauvegarde.
 */
export function stashedList(stash: StashedWorlds, shown: EnvironmentId): readonly World[] {
  assertStash(stash);
  const list: World[] = [];
  for (const id of ENVIRONMENT_IDS) {
    const world = stash.get(id);
    if (world !== undefined && id !== shown) {
      list.push(world);
    }
  }
  return list;
}

/**
 * Table des mondes rangés à partir d'une liste (relue d'une sauvegarde).
 * @throws RangeError si deux mondes ont le même environnement, ou si l'un est celui de `shown`.
 */
export function stashFromList(worlds: readonly World[], shown: EnvironmentId): StashedWorlds {
  const stash = new Map<EnvironmentId, World>();
  for (const world of worlds) {
    if (world.environment === shown || stash.has(world.environment)) {
      throw new RangeError(`environnement en double (${world.environment})`);
    }
    stash.set(world.environment, world);
  }
  return stash;
}

function assertStash(stash: StashedWorlds): void {
  for (const [id, world] of stash) {
    if (world.environment !== id) {
      throw new RangeError(`monde ${world.environment} rangé sous l’environnement ${id}`);
    }
  }
}
