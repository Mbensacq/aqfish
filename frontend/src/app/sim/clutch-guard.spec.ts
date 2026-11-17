import type { AnemoneHome } from './anemones';
import {
  canGuard,
  CLUTCH_GROUP_RADIUS,
  clutchGuardInto,
  GUARD_HOVER,
  GUARD_HUNGER,
  GUARD_PERIOD,
  GUARD_RADIUS,
  GUARD_SORTIE,
  GUARD_STANDOFF,
  GUARD_SWAY,
  GUARD_CLOSE_RANGE,
  guardTarget,
  isNearClutch,
  nearestHome,
  noGuard,
} from './clutch-guard';
import { SIM_DT } from './constants';
import { EGG_HATCH_TIME, type Egg, type MutableEgg } from './eggs';
import type { Vec3 } from './flocking';
import { parseWorld, serializeWorld } from './save';
import { speciesSheet } from './species-sheet';
import type { Fish } from './swimmer';
import {
  advanceInPlace,
  cloneWorld,
  createDefaultWorld,
  layEggsWorldInPlace,
  step,
  worldAnemoneHomes,
  type MutableWorld,
  type World,
} from './world';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/** Nombre de pas pour `seconds` secondes simulées. */
const steps = (seconds: number): number => Math.round(seconds / SIM_DT);

const egg = (x: number, y: number, z: number, species: Egg['species'] = 'clown'): MutableEgg => ({
  species,
  x,
  y,
  z,
  age: 0,
  surface: 'rocher',
});

/** Récif nourri et sain, avec la ponte d'exemple (`oeufs=1`) à t = 0. */
function reefWithClutch(seed = 7): MutableWorld {
  const world = cloneWorld(createDefaultWorld(seed, 'recif'));
  for (const fish of world.entities as Mutable<Fish>[]) {
    fish.hunger = 0.1;
    fish.health = 1;
  }
  expect(layEggsWorldInPlace(world)).toBeGreaterThan(0);
  return world;
}

const fishOf = (world: World, id: number): Fish => {
  const fish = world.entities.find((f) => f.id === id);
  if (fish === undefined) {
    throw new Error(`animal ${id} absent`);
  }
  return fish;
};

const trace = (world: World, steps: number): string => {
  const copy = cloneWorld(world);
  const out: string[] = [];
  for (let k = 0; k < steps; k++) {
    advanceInPlace(copy, 1);
    out.push(copy.entities.map((f) => `${f.x},${f.y},${f.z}`).join(';'));
  }
  return out.join('|');
};

describe('garde de la ponte par le poisson-clown (#670)', () => {
  it('avec une ponte et un clown adulte sain, la cible reste dans GUARD_RADIUS des œufs', () => {
    const world = reefWithClutch();
    const guard = clutchGuardInto(world.entities, world.eggs, noGuard());
    expect(guard.index).toBeGreaterThanOrEqual(0);
    expect(world.entities[guard.index].species).toBe('clown');
    const home = nearestHome(worldAnemoneHomes(world), guard);
    expect(home).not.toBeNull();
    const out: Vec3 = { x: 0, y: 0, z: 0 };
    let sorties = 0;
    for (let t = 0; t < 3 * GUARD_PERIOD; t += 0.05) {
      guardTarget(guard, home, t, out);
      const d = Math.hypot(out.x - guard.x, out.y - guard.y, out.z - guard.z);
      expect(d).toBeLessThan(GUARD_RADIUS);
      expect(out.y).toBeGreaterThan(guard.y);
      expect(out.y).toBeLessThanOrEqual(guard.y + GUARD_HOVER + 1e-12);
      if (Math.hypot(out.x - guard.x, out.z - guard.z) > GUARD_STANDOFF + GUARD_SWAY + 0.005) {
        sorties += 1;
      }
    }
    // Courtes sorties vers l'anémone : une part de chaque période, pas plus.
    expect(sorties).toBeGreaterThan(0);
    expect(sorties * 0.05).toBeLessThanOrEqual(3 * GUARD_SORTIE + 0.2);
  });

  it('dans le monde, le gardien rejoint la ponte et y reste ; les autres clowns nagent', () => {
    const world = reefWithClutch();
    const guard = clutchGuardInto(world.entities, world.eggs, noGuard());
    const id = world.entities[guard.index].id;
    const center = { x: guard.x, y: guard.y, z: guard.z };
    advanceInPlace(world, steps(30));
    let worst = 0;
    for (let k = 0; k < 60; k++) {
      advanceInPlace(world, steps(1));
      const fish = fishOf(world, id);
      worst = Math.max(worst, Math.hypot(fish.x - center.x, fish.z - center.z));
    }
    // Le poisson tourne autour du point visé : borne lâche (environ une longueur de corps).
    expect(worst).toBeLessThan(GUARD_RADIUS + 0.06);
  });

  it('sans ponte, la nage est celle d’avant, à l’octet', () => {
    const plain = cloneWorld(createDefaultWorld(7, 'recif'));
    const empty = cloneWorld(plain);
    empty.eggs = [];
    expect(trace(empty, 20)).toBe(trace(plain, 20));
    // Œufs de corydora seulement : aucune garde.
    expect(clutchGuardInto(plain.entities, [egg(0, 0, 0, 'corydora')], noGuard()).index).toBe(-1);
  });

  it('cas limites : aucun œuf, null, undefined, clown malade, mort, juvénile, affamé', () => {
    const world = reefWithClutch();
    const fishes = world.entities as Mutable<Fish>[];
    const eggs = world.eggs as Egg[];
    expect(clutchGuardInto(fishes, undefined, noGuard()).index).toBe(-1);
    expect(clutchGuardInto(fishes, null, noGuard()).index).toBe(-1);
    expect(clutchGuardInto(fishes, [], noGuard()).index).toBe(-1);
    expect(clutchGuardInto([], eggs, noGuard()).index).toBe(-1);
    const clowns = fishes.filter((f) => f.species === 'clown');
    expect(clowns.length).toBeGreaterThanOrEqual(3);
    const first = clutchGuardInto(fishes, eggs, noGuard()).index;
    expect(fishes[first]).toBe(clowns[0]);
    // Malade : relayé par le suivant.
    clowns[0].ich = 0;
    expect(canGuard(clowns[0])).toBe(false);
    expect(fishes[clutchGuardInto(fishes, eggs, noGuard()).index]).toBe(clowns[1]);
    // Juvénile.
    clowns[1].growth = 10;
    expect(canGuard(clowns[1])).toBe(false);
    // Affamé au-delà du seuil : quitte la garde pour manger.
    clowns[2].hunger = GUARD_HUNGER + 0.01;
    expect(canGuard(clowns[2])).toBe(false);
    for (const c of clowns.slice(3)) {
      c.health = 0.3; // affaibli
    }
    expect(clutchGuardInto(fishes, eggs, noGuard()).index).toBe(-1);
    // Mort : il a quitté `entities`, le pas ne lève pas d'exception et rien n'est gardé.
    clowns[2].hunger = GUARD_HUNGER;
    expect(canGuard(clowns[2])).toBe(true);
    expect(fishes[clutchGuardInto(fishes, eggs, noGuard()).index]).toBe(clowns[2]);
    const alive = fishes.filter((f) => f !== clowns[2]);
    expect(clutchGuardInto(alive, eggs, noGuard()).index).toBe(-1);
    expect(() => step(world)).not.toThrow();
  });

  it('plusieurs pontes : la plus ancienne est gardée, centre sur ses seuls œufs', () => {
    const world = reefWithClutch();
    const far = CLUTCH_GROUP_RADIUS * 3;
    const eggs = [egg(0.1, 0.02, 0.1), egg(0.11, 0.02, 0.1), egg(0.1 + far, 0.02, 0.1)];
    const guard = clutchGuardInto(world.entities, eggs, noGuard());
    expect(guard.index).toBeGreaterThanOrEqual(0);
    expect(guard.x).toBeCloseTo(0.105, 12);
    expect(guard.z).toBeCloseTo(0.1, 12);
    // Sans anémone : va-et-vient seul, dans le rayon.
    const out: Vec3 = { x: 0, y: 0, z: 0 };
    for (let t = 0; t < GUARD_PERIOD; t += 0.1) {
      guardTarget(guard, null, t, out);
      expect(Math.hypot(out.x - guard.x, out.y - guard.y, out.z - guard.z)).toBeLessThan(
        GUARD_RADIUS,
      );
    }
    // Anémone juste au-dessus de la ponte : pas de direction, pas de sortie.
    const above: AnemoneHome = { x: guard.x, z: guard.z, hoverY: 0.1, refugeY: 0.08 };
    guardTarget(guard, above, GUARD_PERIOD - 0.5, out);
    expect(Number.isFinite(out.x) && Number.isFinite(out.z)).toBe(true);
    // Plancher de nage au-dessus des œufs : relevé, mais jamais hors de GUARD_RADIUS.
    for (const floor of [guard.y + 0.04, guard.y + 1, Number.NaN]) {
      for (const t of [0, 1, GUARD_PERIOD - 1]) {
        guardTarget(guard, above, t, out, floor);
        const d = Math.hypot(out.x - guard.x, out.y - guard.y, out.z - guard.z);
        expect(d).toBeLessThan(GUARD_RADIUS);
        expect(out.y).toBeGreaterThanOrEqual(guard.y + GUARD_HOVER - 1e-12);
      }
    }
    expect(guardTarget(guard, null, 0, out, guard.y + 0.04).y).toBeCloseTo(guard.y + 0.04, 12);
    guardTarget(guard, null, Number.NaN, out);
    expect(Number.isFinite(out.x)).toBe(true);
    expect(nearestHome([], guard)).toBeNull();
    expect(isNearClutch({ x: guard.x + GUARD_CLOSE_RANGE * 0.9, z: guard.z }, guard)).toBe(true);
    expect(isNearClutch({ x: guard.x, z: guard.z + GUARD_CLOSE_RANGE }, guard)).toBe(false);
  });

  it('la garde cesse à l’éclosion ; même graine, même suite de positions', () => {
    const world = reefWithClutch();
    expect(trace(world, 40)).toBe(trace(world, 40));
    const later = cloneWorld(world);
    advanceInPlace(later, steps(EGG_HATCH_TIME + 1));
    expect((later.eggs ?? []).some((e) => e.species === 'clown')).toBe(false);
    expect(clutchGuardInto(later.entities, later.eggs, noGuard()).index).toBe(-1);
    // Après l'éclosion, le monde nage comme un monde identique sans œuf.
    const bare = cloneWorld(later);
    bare.eggs = undefined;
    expect(trace(later, 10)).toBe(trace(bare, 10));
  });

  it('sauvegarde : aucun champ ajouté, un monde rechargé garde le même gardien', () => {
    const world = reefWithClutch();
    advanceInPlace(world, steps(20));
    const text = serializeWorld(world);
    expect(text.includes('guard')).toBe(false);
    const read = parseWorld(text);
    expect(read.ok).toBe(true);
    if (!read.ok) {
      return;
    }
    expect(serializeWorld(read.world)).toBe(text);
    expect(trace(read.world, 20)).toBe(trace(world, 20));
    // Sauvegarde sans œuf : se charge à l'identique.
    const plain = serializeWorld(createDefaultWorld(42, 'recif'));
    const back = parseWorld(plain);
    expect(back.ok && serializeWorld(back.world)).toBe(plain);
  });

  it('fiche du clown : la garde est citée, source et approximation de jeu', () => {
    const note = speciesSheet('clown').notes.find((n) => n.text.startsWith('Reproduction'));
    expect(note?.text).toContain('garde');
    expect(note?.text).toContain('approximation de jeu');
    expect(note?.status.kind).toBe('source');
  });
});
