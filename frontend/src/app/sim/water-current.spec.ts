import { createBubbleBuffer, fillBubbles } from './bubbles';
import { ENVIRONMENT_IDS, environmentById, TROPICAL_TANK } from './environment';
import { createFloatingLeafBuffer, fillFloatingLeaves } from './floating-leaves';
import { dropFoodInPlace, stepFoodInPlace, type FoodPellet, type FoodState } from './food';
import { parseSaveData, saveData } from './save';
import { waterVolume } from './tank';
import {
  applyCurrentInPlace,
  CURRENT_LEVELS,
  CURRENT_SPEEDS,
  currentVelocity,
  isCurrentLevel,
  isRiverSpecies,
  nextCurrentLevel,
  NO_CURRENT,
  RIVER_SPECIES,
} from './water-current';
import {
  advance,
  boundsFor,
  createDefaultWorld,
  createWorld,
  feed,
  setWorldCurrentInPlace,
  step,
  worldBubbles,
  worldCurrentLevel,
  worldCurrentVelocity,
  type MutableWorld,
  type World,
} from './world';
import { createFish } from './swimmer';

/** Abscisse moyenne des poissons, moyennée sur `steps` pas. */
function meanX(start: World, steps: number): number {
  let world = start;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < steps; i += 10) {
    world = advance(world, 10);
    for (const fish of world.entities) {
      sum += fish.x;
      n++;
    }
  }
  return sum / n;
}

function withCurrent(world: World, level: 'doux' | 'fort'): MutableWorld {
  const copy = structuredClone(world) as MutableWorld;
  setWorldCurrentInPlace(copy, level);
  return copy;
}

describe('courant (issue #460)', () => {
  it('définit un champ par environnement, coupé par défaut partout', () => {
    for (const id of ENVIRONMENT_IDS) {
      const field = environmentById(id).current;
      expect(Number.isFinite(field.direction)).toBe(true);
      expect(field.level).toBe('coupe');
    }
    expect(TROPICAL_TANK.current).toBe(NO_CURRENT);
    const world = createDefaultWorld(42);
    expect(world.current).toBeUndefined();
    expect(worldCurrentLevel(world)).toBe('coupe');
    const v = worldCurrentVelocity(world, { x: 1, z: 1 });
    expect(v).toEqual({ x: 0, z: 0 });
  });

  it('donne une vitesse de la force et de la direction du champ', () => {
    const out = { x: 0, z: 0 };
    currentVelocity({ direction: Math.PI / 2, level: 'coupe' }, 'fort', out);
    expect(out.x).toBeCloseTo(0, 12);
    expect(out.z).toBeCloseTo(CURRENT_SPEEDS.fort, 12);
    currentVelocity(NO_CURRENT, 'doux', out);
    expect(out).toEqual({ x: CURRENT_SPEEDS.doux, z: 0 });
    currentVelocity(NO_CURRENT, 'coupe', out);
    expect(out).toEqual({ x: 0, z: 0 });
    expect(CURRENT_SPEEDS.coupe).toBe(0);
    expect(CURRENT_SPEEDS.doux).toBeLessThan(CURRENT_SPEEDS.fort);
  });

  it('valide les forces et les fait tourner dans l’ordre du réglage', () => {
    for (const level of CURRENT_LEVELS) {
      expect(isCurrentLevel(level)).toBe(true);
    }
    for (const bad of ['', 'Fort', null, undefined, 1, 'toString']) {
      expect(isCurrentLevel(bad)).toBe(false);
    }
    expect(nextCurrentLevel('coupe')).toBe('doux');
    expect(nextCurrentLevel('doux')).toBe('fort');
    expect(nextCurrentLevel('fort')).toBe('coupe');
  });

  it('règle la force du bac ; coupé, le champ disparaît', () => {
    const world = createDefaultWorld(7) as MutableWorld;
    setWorldCurrentInPlace(world, 'fort');
    expect(world.current).toBe('fort');
    expect(worldCurrentLevel(world)).toBe('fort');
    setWorldCurrentInPlace(world, 'coupe');
    expect('current' in world).toBe(false);
    expect(() => setWorldCurrentInPlace(world, 'tempête' as never)).toThrow(RangeError);
    expect('current' in world).toBe(false);
  });

  it('liste des espèces de rivière', () => {
    expect(RIVER_SPECIES).toContain('danio');
    expect(isRiverSpecies('danio')).toBe(true);
    expect(isRiverSpecies('neon')).toBe(false);
    expect(isRiverSpecies('axolotl')).toBe(false);
  });

  it('coupé, ne change rien au monde (mêmes états qu’avant, au bit près)', () => {
    const world = createDefaultWorld(42);
    const cut = structuredClone(world) as MutableWorld;
    setWorldCurrentInPlace(cut, 'coupe');
    expect(advance(cut, 600)).toEqual(advance(world, 600));
  });

  it('est déterministe : même graine, mêmes états', () => {
    const world = withCurrent(createWorld(3, [{ species: 'danio', count: 5 }]), 'fort');
    expect(advance(world, 400)).toEqual(advance(structuredClone(world), 400));
  });

  it('les poissons de rivière remontent le courant, les autres dérivent peu (2 000 pas)', () => {
    const river = createWorld(11, [{ species: 'danio', count: 6 }]);
    const lake = createWorld(11, [{ species: 'neon', count: 6 }]);
    const riverShift = meanX(withCurrent(river, 'fort'), 2000) - meanX(river, 2000);
    const lakeShift = meanX(withCurrent(lake, 'fort'), 2000) - meanX(lake, 2000);
    // Courant vers +X au bac tropical : l'amont est vers −X.
    expect(riverShift).toBeLessThan(-0.05);
    expect(lakeShift).toBeGreaterThan(0);
    expect(Math.abs(lakeShift)).toBeLessThan(Math.abs(riverShift));
  });

  it('le courant doux agit moins que le fort', () => {
    const river = createWorld(5, [{ species: 'danio', count: 6 }]);
    const base = meanX(river, 2000);
    const soft = meanX(withCurrent(river, 'doux'), 2000) - base;
    const strong = meanX(withCurrent(river, 'fort'), 2000) - base;
    expect(soft).toBeLessThan(0);
    expect(strong).toBeLessThan(soft);
  });

  it('garde les poissons dans l’eau, courant fort, et ne touche pas les marcheurs', () => {
    let world: World = withCurrent(
      createWorld(9, [
        { species: 'danio', count: 4 },
        { species: 'neon', count: 4 },
      ]),
      'fort',
    );
    for (let i = 0; i < 30; i++) {
      world = advance(world, 100);
      for (const fish of world.entities) {
        const hard = boundsFor(fish.species, world.environment).hard;
        expect(fish.x).toBeGreaterThanOrEqual(hard.minX - 1e-9);
        expect(fish.x).toBeLessThanOrEqual(hard.maxX + 1e-9);
        expect(fish.z).toBeGreaterThanOrEqual(hard.minZ - 1e-9);
        expect(fish.z).toBeLessThanOrEqual(hard.maxZ + 1e-9);
      }
    }
    const cold = createDefaultWorld(4, 'eaufroide');
    expect(advance(withCurrent(cold, 'fort'), 300).entities).toEqual(advance(cold, 300).entities);
  });

  it('un nageur se tourne vers l’amont seulement s’il est de rivière', () => {
    const bounds = boundsFor('danio', 'tropical');
    const fish = { ...createFish(1, 0, 'danio', bounds), x: 0, z: 0, yaw: 0 };
    applyCurrentInPlace(fish, 0.07, 0, 1 / 60, true, bounds, 0.01);
    expect(fish.yaw).toBeGreaterThan(0);
    expect(fish.x).toBeLessThan(0);
    const other = { ...createFish(1, 0, 'neon', bounds), x: 0, z: 0, yaw: 0 };
    applyCurrentInPlace(other, 0.07, 0, 1 / 60, false, bounds, 0.01);
    expect(other.yaw).toBe(0);
    expect(other.x).toBeGreaterThan(0);
    const still = { ...other };
    applyCurrentInPlace(still, 0, 0, 1 / 60, false, bounds, 0.01);
    expect(still).toEqual(other);
  });

  it('les bulles suivent le courant', () => {
    const a = createBubbleBuffer();
    const b = createBubbleBuffer();
    const water = waterVolume();
    const n = fillBubbles(42, 30, a, undefined, water);
    expect(fillBubbles(42, 30, b, undefined, water, 0.03, 0)).toBe(n);
    let downstream = 0;
    for (let i = 0; i < n; i++) {
      expect(b.positions[3 * i]).toBeGreaterThanOrEqual(a.positions[3 * i]);
      expect(b.positions[3 * i + 1]).toBe(a.positions[3 * i + 1]);
      if (b.positions[3 * i] > a.positions[3 * i]) {
        downstream++;
      }
    }
    expect(downstream).toBeGreaterThan(n / 2);
    // Par le monde : bulles du bac tropical emportées, celles d'un bac sans courant inchangées.
    const world = advance(createDefaultWorld(42), 600);
    const still = createBubbleBuffer();
    const moved = createBubbleBuffer();
    worldBubbles(world, still);
    worldBubbles(withCurrent(world, 'fort'), moved);
    expect(moved.count).toBeGreaterThan(0);
    expect(moved.positions[0]).toBeGreaterThan(still.positions[0]);
  });

  it('les granulés qui flottent ou coulent suivent le courant, posés ils restent', () => {
    const water = waterVolume();
    const food: FoodPellet[] = [];
    const world: FoodState = { seed: 1, decor: [], food, nextFoodId: 0 };
    dropFoodInPlace(world, 0, 0, water, null);
    const before = food.map((p) => p.x);
    stepFoodInPlace(food, 1, 0.05, 0, water);
    food.forEach((p, i) => expect(p.x).toBeCloseTo(before[i] + 0.05, 9));
    // Sans eau donnée, rien ne dérive.
    const x = food.map((p) => p.x);
    stepFoodInPlace(food, 1, 0.05, 0);
    food.forEach((p, i) => expect(p.x).toBe(x[i]));
    // Granulé posé : il ne bouge plus.
    for (let i = 0; i < 2000 && !food.some((p) => p.y <= p.restY); i++) {
      stepFoodInPlace(food, 0.05, 0.05, 0, water);
    }
    const landed = food.filter((p) => p.y <= p.restY);
    expect(landed.length).toBeGreaterThan(0);
    const xs = landed.map((p) => p.x);
    stepFoodInPlace(food, 0.05, 0.05, 0, water);
    food.filter((p) => p.y <= p.restY).forEach((p, i) => expect(p.x).toBe(xs[i]));
    // Dans le monde : les granulés déposés dérivent vers l'aval.
    const fed = feed(createWorld(1), 0, 0);
    const calm = advance(fed, 60);
    const flowing = advance(withCurrent(fed, 'fort'), 60);
    expect(flowing.food[0].x).toBeGreaterThan(calm.food[0].x);
  });

  it('les feuilles mortes suivent le courant', () => {
    const water = waterVolume({ width: 2, height: 0.4, depth: 1.4 });
    const a = createFloatingLeafBuffer();
    const b = createFloatingLeafBuffer();
    const n = fillFloatingLeaves(42, 100, water, a);
    expect(n).toBeGreaterThan(0);
    expect(fillFloatingLeaves(42, 100, water, b, 0.02, 0)).toBe(n);
    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += b.leaves[6 * i] - a.leaves[6 * i];
    }
    expect(sum / n).toBeGreaterThan(0.01);
    const c = createFloatingLeafBuffer();
    fillFloatingLeaves(42, 100, water, c, 0, 0);
    expect(Array.from(c.leaves)).toEqual(Array.from(a.leaves));
  });

  it('enregistre et relit la force du courant ; ancienne sauvegarde : coupé', () => {
    const world = withCurrent(createDefaultWorld(42), 'doux');
    const data = saveData(world);
    expect(data.current).toBe('doux');
    const back = parseSaveData(JSON.parse(JSON.stringify(data)));
    expect(back.ok && back.world.current).toBe('doux');
    const plain = saveData(createDefaultWorld(42));
    expect('current' in plain).toBe(false);
    const old = parseSaveData(JSON.parse(JSON.stringify(plain)));
    expect(old.ok && old.world.current).toBeUndefined();
    const bad = parseSaveData({ ...JSON.parse(JSON.stringify(plain)), current: 'coupe' });
    expect(bad.ok).toBe(false);
  });

  it('l’état de step reste pur avec le courant', () => {
    const world = withCurrent(createWorld(2, [{ species: 'danio', count: 2 }]), 'fort');
    const copy = structuredClone(world);
    step(world);
    expect(world).toEqual(copy);
  });
});
