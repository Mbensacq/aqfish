import { ICH_AGGRAVATED_AT, ICH_VISIBLE_AT } from './disease';
import {
  DEAD_FLOAT_SPEED,
  DEAD_MAX_AGE,
  DECAY_LOAD_FACTOR,
  MORTALITY_HEALTH,
  MORTALITY_RATE_PER_CAUSE,
  deadBody,
  deadLoad,
  diesThisStep,
  diseaseCause,
  floatsWhenDead,
  isDeadAge,
  NET_RADIUS,
  netTarget,
  mortalityChance,
  mortalityDraw,
  mortalityRate,
  stepDeadInPlace,
  toxicWater,
  type DeadAnimal,
  type MortalitySubject,
} from './mortality';
import { parseWorld, serializeWorld } from './save';
import { SPECIES } from './species';
import { freshWater, waterLoad } from './water';
import { HEALTH_FLOOR, STARVING_HUNGER } from './wellbeing';
import {
  advanceInPlace,
  cloneWorld,
  createWorld,
  killWorldAnimalInPlace,
  removeDeadInPlace,
  setWorldMortalityInPlace,
  type MutableWorld,
} from './world';

const weak = (extra: Partial<MortalitySubject> = {}): MortalitySubject => ({
  id: 0,
  species: 'neon',
  hunger: 0,
  health: HEALTH_FLOOR,
  ...extra,
});

/** Bac de néons affamés au plancher dans une eau toxique : la mortalité y est maximale. */
function neglected(seed: number, count = 12): MutableWorld {
  const world = cloneWorld(createWorld(seed, [{ species: 'neon', count }]));
  for (const fish of world.entities as unknown as { hunger: number; health: number }[]) {
    fish.hunger = STARVING_HUNGER;
    fish.health = HEALTH_FLOOR;
  }
  (world.water as { ammonia: number }).ammonia = 8;
  return world;
}

describe('mortalité : risque (fonction pure)', () => {
  it('aucun risque au-dessus de MORTALITY_HEALTH, même avec toutes les causes', () => {
    const sick = weak({ health: MORTALITY_HEALTH + 1e-9, hunger: 1, ich: ICH_AGGRAVATED_AT });
    expect(mortalityRate(sick, true)).toBe(0);
    expect(mortalityRate(weak({ health: 1, hunger: 1 }), true)).toBe(0);
  });

  it('aucun risque au plancher sans cause (animal qui se remet)', () => {
    expect(mortalityRate(weak(), false)).toBe(0);
  });

  it('une cause par facteur : maladie, jeûne, eau toxique', () => {
    expect(mortalityRate(weak({ ich: ICH_AGGRAVATED_AT }), false)).toBe(MORTALITY_RATE_PER_CAUSE);
    expect(mortalityRate(weak({ hunger: STARVING_HUNGER }), false)).toBe(MORTALITY_RATE_PER_CAUSE);
    expect(mortalityRate(weak(), true)).toBe(MORTALITY_RATE_PER_CAUSE);
    expect(mortalityRate(weak({ hunger: 1, ich: ICH_AGGRAVATED_AT }), true)).toBe(
      3 * MORTALITY_RATE_PER_CAUSE,
    );
  });

  it('maladie bornée à une cause, demi-cause au stade visible', () => {
    expect(diseaseCause(weak({ ich: ICH_VISIBLE_AT }))).toBe(0.5);
    expect(diseaseCause(weak({ ich: ICH_AGGRAVATED_AT, finRot: 1e9 }))).toBe(1);
    expect(diseaseCause(weak())).toBe(0);
  });

  it('le jeûne ne compte pas pour une espèce qui ne mange pas les granulés', () => {
    expect(mortalityRate(weak({ species: 'axolotl', hunger: 1 }), false)).toBe(0);
    expect(mortalityRate(weak({ species: 'axolotl' }), true)).toBe(MORTALITY_RATE_PER_CAUSE);
  });

  it('santé non finie : aucun risque (état corrompu)', () => {
    expect(mortalityRate(weak({ health: Number.NaN, hunger: 1 }), true)).toBe(0);
  });

  it('eau toxique au seuil « mauvaise » d’ammoniaque libre ou de nitrites', () => {
    const water = freshWater('tropical');
    expect(toxicWater(water)).toBe(false);
    expect(toxicWater({ ...water, ammonia: 5 })).toBe(true);
    expect(toxicWater({ ...water, ammonia: 4.99 })).toBe(false);
    expect(toxicWater({ ...water, nitrite: 5 })).toBe(true);
    // Ammoniaque liée par le conditionneur : elle n'agit plus.
    expect(toxicWater({ ...water, ammonia: 5, ammoniaBinder: 1 })).toBe(false);
  });

  it('probabilité d’un pas : nulle à taux ou pas nul, non fini ou négatif', () => {
    expect(mortalityChance(0, 1)).toBe(0);
    expect(mortalityChance(-1, 1)).toBe(0);
    expect(mortalityChance(Number.POSITIVE_INFINITY, 1)).toBe(0);
    expect(mortalityChance(1, 0)).toBe(0);
    expect(mortalityChance(1 / 1200, 1)).toBeCloseTo(1 - Math.exp(-1 / 1200), 15);
    expect(mortalityChance(1e6, 1e6)).toBeLessThanOrEqual(1);
  });

  it('tirage déterministe dans [0, 1), différent selon la graine, le pas et l’animal', () => {
    const a = mortalityDraw(42, 100, 3);
    expect(mortalityDraw(42, 100, 3)).toBe(a);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(1);
    expect(mortalityDraw(43, 100, 3)).not.toBe(a);
    expect(mortalityDraw(42, 101, 3)).not.toBe(a);
    expect(mortalityDraw(42, 100, 4)).not.toBe(a);
    expect(mortalityDraw(0xffffffff, 0, 0)).toBeLessThan(1);
  });

  it('diesThisStep : jamais sans risque, toujours à probabilité quasi certaine', () => {
    expect(diesThisStep(weak({ health: 1 }), true, 1e9, 1, 1)).toBe(false);
    expect(diesThisStep(weak({ hunger: 1 }), true, 1e9, 1, 1)).toBe(true);
  });
});

describe('mortalité : corps', () => {
  const world = createWorld(7, [{ species: 'neon', count: 1 }]);
  const fish = world.entities[0];

  it('un corps est à plat et commence à l’âge 0', () => {
    const body = deadBody(fish);
    expect(body.deadFor).toBe(0);
    expect(body.pitch).toBe(0);
    expect([body.px, body.py, body.pz]).toEqual([fish.x, fish.y, fish.z]);
    expect(body.id).toBe(fish.id);
  });

  it('un nageur remonte vers la surface sans la dépasser ; l’âge est borné', () => {
    const body = { ...deadBody(fish), y: 0.1 } as DeadAnimal;
    const dead = [body];
    stepDeadInPlace(dead, 1, () => 0.2);
    expect(dead[0].y).toBeCloseTo(0.1 + DEAD_FLOAT_SPEED, 12);
    expect(dead[0].py).toBe(0.1);
    stepDeadInPlace(dead, 1e6, () => 0.2);
    expect(dead[0].y).toBe(0.2);
    expect(dead[0].deadFor).toBe(DEAD_MAX_AGE);
  });

  it('un marcheur ou un amphibien reste au fond', () => {
    expect(floatsWhenDead('neon')).toBe(true);
    expect(floatsWhenDead('axolotl')).toBe(false);
    const body = { ...deadBody(fish), species: 'axolotl', y: 0.01 } as DeadAnimal;
    const dead = [body];
    stepDeadInPlace(dead, 100, () => 0.2);
    expect(dead[0].y).toBe(0.01);
    expect(dead[0].deadFor).toBe(100);
  });

  it('décomposition : DECAY_LOAD_FACTOR fois la charge de vivant, 0 sans corps', () => {
    expect(deadLoad(undefined)).toBe(0);
    expect(deadLoad([])).toBe(0);
    expect(deadLoad([fish])).toBeCloseTo(DECAY_LOAD_FACTOR * waterLoad([fish]), 12);
  });

  it('âge de corps valide', () => {
    expect(isDeadAge(0)).toBe(true);
    expect(isDeadAge(DEAD_MAX_AGE)).toBe(true);
    expect(isDeadAge(-1)).toBe(false);
    expect(isDeadAge(Number.NaN)).toBe(false);
    expect(isDeadAge('1')).toBe(false);
  });
});

describe('mortalité : épuisette (prise le long d’un rayon)', () => {
  const fish = createWorld(7, [{ species: 'neon', count: 1 }]).entities[0];
  const at = (id: number, x: number, y: number, z: number): DeadAnimal =>
    ({ ...deadBody(fish), id, x, y, z }) as DeadAnimal;

  it('aucun corps, direction nulle ou non finie : rien', () => {
    expect(netTarget(undefined, [0, 0, 0], [1, 0, 0])).toBeNull();
    expect(netTarget([], [0, 0, 0], [1, 0, 0])).toBeNull();
    expect(netTarget([at(1, 1, 0, 0)], [0, 0, 0], [0, 0, 0])).toBeNull();
    expect(netTarget([at(1, 1, 0, 0)], [0, 0, 0], [Number.NaN, 0, 0])).toBeNull();
  });

  it('corps sur le rayon, à la limite du rayon de prise, ou derrière l’origine', () => {
    const radius = Math.max(NET_RADIUS, SPECIES.neon.bodyLength);
    expect(netTarget([at(1, 1, 0, 0)], [0, 0, 0], [5, 0, 0])).toBe(1);
    expect(netTarget([at(1, 1, radius * 0.99, 0)], [0, 0, 0], [1, 0, 0])).toBe(1);
    expect(netTarget([at(1, 1, radius * 1.01, 0)], [0, 0, 0], [1, 0, 0])).toBeNull();
    expect(netTarget([at(1, -1, 0, 0)], [0, 0, 0], [1, 0, 0])).toBeNull();
  });

  it('deux corps alignés : le plus proche de l’origine', () => {
    const dead = [at(1, 2, 0, 0), at(2, 1, 0.01, 0)];
    expect(netTarget(dead, [0, 0, 0], [1, 0, 0])).toBe(2);
  });
});

describe('mortalité dans le monde', { timeout: 60_000 }, () => {
  it('option absente : aucun décès, même dans un bac négligé', () => {
    const world = neglected(3);
    advanceInPlace(world, 12_000);
    expect(world.entities).toHaveLength(12);
    expect(world.dead).toBeUndefined();
  });

  it('option absente : le monde avance au bit près comme avant (corps jamais créés)', () => {
    const a = neglected(9);
    const b = neglected(9);
    setWorldMortalityInPlace(b, true);
    setWorldMortalityInPlace(b, false);
    advanceInPlace(a, 600);
    advanceInPlace(b, 600);
    expect(b).toEqual(a);
    expect('mortality' in b).toBe(false);
  });

  it('option active : un bac négligé perd des animaux, de façon déterministe', () => {
    const run = (seed: number): MutableWorld => {
      const world = neglected(seed);
      setWorldMortalityInPlace(world, true);
      advanceInPlace(world, 12_000);
      return world;
    };
    const a = run(11);
    expect(a.dead?.length ?? 0).toBeGreaterThan(0);
    expect(a.entities.length + (a.dead?.length ?? 0)).toBe(12);
    expect(run(11)).toEqual(a);
    const ids = (w: MutableWorld): number[] => (w.dead ?? []).map((body) => body.id);
    expect(ids(run(12))).not.toEqual(ids(a));
  });

  it('option active : un bac sain ne perd aucun animal', () => {
    const world = cloneWorld(createWorld(5, [{ species: 'neon', count: 12 }]));
    setWorldMortalityInPlace(world, true);
    advanceInPlace(world, 12_000);
    expect(world.entities).toHaveLength(12);
    expect(world.dead).toBeUndefined();
  });

  it('mode décor : aucun décès', () => {
    const world = neglected(11);
    world.careMode = 'decor';
    setWorldMortalityInPlace(world, true);
    advanceInPlace(world, 12_000);
    expect(world.dead).toBeUndefined();
  });

  it('un corps ajoute de l’ammoniaque tant qu’il reste ; retiré, l’effet cesse', () => {
    const base = cloneWorld(createWorld(21, [{ species: 'neon', count: 4 }]));
    const withBody = cloneWorld(base);
    expect(killWorldAnimalInPlace(withBody, 0)).toBe(true);
    expect(withBody.entities).toHaveLength(3);
    expect(withBody.dead).toHaveLength(1);
    const alive = cloneWorld(base);
    advanceInPlace(alive, 600);
    advanceInPlace(withBody, 600);
    // Le corps pollue plus que l'animal vivant qu'il était.
    expect(withBody.water.ammonia).toBeGreaterThan(alive.water.ammonia);

    // Retrait : les deux bacs ont ensuite la même production (3 vivants contre 3 vivants).
    const removed = cloneWorld(withBody);
    expect(removeDeadInPlace(removed, 0)).toBe(true);
    expect(removed.dead).toBeUndefined();
    const without = cloneWorld(base);
    expect(killWorldAnimalInPlace(without, 0)).toBe(true);
    expect(removeDeadInPlace(without, 0)).toBe(true);
    const before = removed.water.ammonia;
    advanceInPlace(removed, 1);
    const kept = cloneWorld(withBody);
    advanceInPlace(kept, 1);
    expect(kept.water.ammonia - withBody.water.ammonia).toBeGreaterThan(
      removed.water.ammonia - before,
    );
  });

  it('un corps flotte sous la surface et ne nage plus', () => {
    const world = cloneWorld(createWorld(21, [{ species: 'neon', count: 2 }]));
    killWorldAnimalInPlace(world, 1);
    const x = world.dead?.[0].x;
    const y = world.dead?.[0].y ?? 0;
    advanceInPlace(world, 60 * 60);
    const body = world.dead?.[0];
    expect(body?.x).toBe(x);
    expect(body?.y).toBeGreaterThan(y);
    expect(body?.deadFor).toBeCloseTo(60, 6);
  });

  it('identifiants inconnus : rien ne change', () => {
    const world = cloneWorld(createWorld(21, [{ species: 'neon', count: 2 }]));
    expect(killWorldAnimalInPlace(world, 99)).toBe(false);
    expect(removeDeadInPlace(world, 0)).toBe(false);
    killWorldAnimalInPlace(world, 0);
    expect(removeDeadInPlace(world, 1)).toBe(false);
    expect(world.dead).toHaveLength(1);
  });

  it('sauvegarde : option et corps relus ; anciennes sauvegardes sans corps', () => {
    const world = cloneWorld(createWorld(21, [{ species: 'neon', count: 3 }]));
    setWorldMortalityInPlace(world, true);
    killWorldAnimalInPlace(world, 1);
    advanceInPlace(world, 30);
    const parsed = parseWorld(serializeWorld(world));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(parsed.world.mortality).toBe(true);
    expect(parsed.world.dead).toHaveLength(1);
    expect(parsed.world.dead?.[0].id).toBe(1);
    expect(parsed.world.dead?.[0].deadFor).toBeCloseTo(0.5, 9);
    expect(parsed.world.entities.map((f) => f.id)).toEqual([0, 2]);

    const plain = parseWorld(serializeWorld(createWorld(21, [{ species: 'neon', count: 3 }])));
    expect(plain.ok && plain.world.mortality === undefined && plain.world.dead === undefined).toBe(
      true,
    );
  });

  it('sauvegarde : corps invalide refusé', () => {
    const world = cloneWorld(createWorld(21, [{ species: 'neon', count: 3 }]));
    killWorldAnimalInPlace(world, 1);
    const data = JSON.parse(serializeWorld(world));
    const body = (data.world ?? data).dead[0];
    body.deadFor = -1;
    expect(parseWorld(JSON.stringify(data)).ok).toBe(false);
    body.deadFor = 0;
    expect(parseWorld(JSON.stringify(data)).ok).toBe(true);
    (data.world ?? data).mortality = 'oui';
    expect(parseWorld(JSON.stringify(data)).ok).toBe(false);
  });
});
