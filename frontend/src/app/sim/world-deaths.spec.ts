import { describe, expect, it } from 'vitest';

import { ageSeconds, birthTime, lifespanSeconds } from './aging';
import { DEFAULT_DAY_LENGTH_SECONDS } from './daylight';
import {
  addJournalEntry,
  createJournal,
  journalLines,
  observeJournal,
  watchJournal,
} from './journal';
import { setPopulationInPlace } from './population';
import { createRoom, type RoomState } from './room-state';
import { parseWorld, serializeWorld } from './save';
import { transferFish } from './tank-transfer';
import {
  advance,
  advanceInPlace,
  birthYoungInPlace,
  cloneWorld,
  createWorld,
  setWorldMortalityInPlace,
} from './world';
import { stepDeathsInPlace } from './world-deaths';
import type { MutableWorld } from './world-types';

/** Bac de `count` crevettes cerises (durée de vie la plus courte), mortalité activée ou non. */
function shrimpTank(mortality: boolean, count = 6): MutableWorld {
  const world = cloneWorld(createWorld(7, [{ species: 'cerise', count }]));
  setWorldMortalityInPlace(world, mortality);
  return world;
}

/**
 * Avance les décès seuls (`stepDeathsInPlace`) de `days` pas d'un jour de jeu : le pas complet
 * du monde serait trop lent pour atteindre une fin de vie (taux de l'ordre de 1/6000 s⁻¹).
 */
function liveDaysInPlace(world: MutableWorld, days: number): void {
  for (let day = 0; day < days; day++) {
    world.tick += 1;
    world.time += DEFAULT_DAY_LENGTH_SECONDS;
    stepDeathsInPlace(world, DEFAULT_DAY_LENGTH_SECONDS);
  }
}

/** Fait naître chaque animal de `world` assez tôt pour qu'il ait `age` secondes au temps 0. */
function ageAllInPlace(world: MutableWorld, age: number): void {
  world.entities = world.entities.map((fish) => ({ ...fish, bornAt: world.time - age }));
}

describe('vieillissement dans le monde (#857)', () => {
  it('le monde neuf n’écrit aucune naissance : l’âge vient de la graine', () => {
    const world = createWorld(7, [{ species: 'cerise', count: 3 }]);
    for (const fish of world.entities) {
      expect(fish.bornAt).toBeUndefined();
      expect(ageSeconds(fish, world.seed, world.time)).toBeGreaterThan(0);
    }
  });

  it('un alevin naît au temps de sa naissance', () => {
    const world = shrimpTank(false, 2);
    advanceInPlace(world, 120);
    const fry = birthYoungInPlace(world, 'cerise', { x: 0, y: 0, z: 0 });
    expect(fry?.bornAt).toBe(world.time);
  });

  it('un adulte ajouté en cours de partie garde un âge adulte à son arrivée', () => {
    const world = shrimpTank(false, 2);
    advanceInPlace(world, 600);
    setPopulationInPlace(world, 'cerise', 3);
    const added = world.entities[world.entities.length - 1]!;
    expect(added.bornAt).toBeDefined();
    expect(ageSeconds(added, world.seed, world.time)).toBeGreaterThan(
      0.2 * lifespanSeconds('cerise'),
    );
  });

  it('juste avant sa durée de vie, aucun animal ne meurt de vieillesse', () => {
    const world = shrimpTank(true);
    ageAllInPlace(world, lifespanSeconds('cerise') - 3 * DEFAULT_DAY_LENGTH_SECONDS);
    liveDaysInPlace(world, 2);
    expect(world.entities).toHaveLength(6);
    expect(world.dead).toBeUndefined();
  });

  it('bien au-delà de sa durée de vie, l’animal meurt de vieillesse, corps marqué', () => {
    const world = shrimpTank(true);
    ageAllInPlace(world, 2 * lifespanSeconds('cerise'));
    liveDaysInPlace(world, 30);
    expect(world.dead?.length ?? 0).toBeGreaterThan(0);
    for (const body of world.dead ?? []) {
      expect(body.cause).toBe('vieillesse');
    }
  });

  it('mortalité coupée : aucun animal ne meurt, même très vieux', () => {
    const world = shrimpTank(false);
    ageAllInPlace(world, 2 * lifespanSeconds('cerise'));
    advanceInPlace(world, 600);
    expect(world.entities).toHaveLength(6);
    expect(world.dead).toBeUndefined();
  });

  it('le journal note une ligne neutre « Mort de vieillesse », une seule fois', () => {
    const world = shrimpTank(true);
    const watch = watchJournal(world);
    ageAllInPlace(world, 2 * lifespanSeconds('cerise'));
    liveDaysInPlace(world, 30);
    const events = observeJournal(watch, world);
    const journal = createJournal();
    for (const event of events) {
      addJournalEntry(journal, event);
    }
    const lines = journalLines(journal);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ kind: 'vieillesse', group: 'sante' });
    expect(lines[0]!.text).toMatch(/^Mort de vieillesse : Crevette cerise \(\d+ anima(l|ux)\)$/);
    expect(observeJournal(watch, world)).toEqual([]);
  });

  it('naissance et cause de décès passent par la sauvegarde', () => {
    const world = shrimpTank(true);
    ageAllInPlace(world, 2 * lifespanSeconds('cerise'));
    liveDaysInPlace(world, 30);
    const parsed = parseWorld(serializeWorld(world));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(parsed.world.entities.map((fish) => fish.bornAt)).toEqual(
      world.entities.map((fish) => fish.bornAt),
    );
    expect(parsed.world.dead?.map((body) => body.cause)).toEqual(
      world.dead?.map((body) => body.cause),
    );
  });

  it('ancienne sauvegarde sans naissance : âge adulte tiré de la graine, comme au départ', () => {
    const world = cloneWorld(createWorld(7, [{ species: 'neon', count: 2 }]));
    advanceInPlace(world, 60);
    const parsed = parseWorld(serializeWorld(world));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    const fish = parsed.world.entities[0]!;
    expect(fish.bornAt).toBeUndefined();
    expect(birthTime(fish, parsed.world.seed)).toBe(birthTime(world.entities[0]!, world.seed));
    expect(ageSeconds(fish, parsed.world.seed, parsed.world.time)).toBeCloseTo(
      ageSeconds(world.entities[0]!, world.seed, world.time),
      9,
    );
  });

  it('naissance ou cause invalides : sauvegarde refusée', () => {
    const world = shrimpTank(true, 1);
    const data = JSON.parse(serializeWorld(world)) as { fish: Record<string, unknown>[] };
    data.fish[0]!['bornAt'] = 'hier';
    expect(parseWorld(JSON.stringify(data)).ok).toBe(false);

    const old = shrimpTank(true, 2);
    ageAllInPlace(old, 2 * lifespanSeconds('cerise'));
    liveDaysInPlace(old, 30);
    const withBody = JSON.parse(serializeWorld(old)) as { dead: Record<string, unknown>[] };
    withBody.dead[0]!['cause'] = 'mystère';
    expect(parseWorld(JSON.stringify(withBody)).ok).toBe(false);
  });

  it('corps dans l’ordre des décès relus ; un identifiant de corps en double est refusé', () => {
    const world = shrimpTank(true, 1);
    const data = JSON.parse(serializeWorld(world)) as {
      fish: Record<string, unknown>[];
      dead?: Record<string, unknown>[];
    };
    const body = { ...data.fish[0]!, deadFor: 0 };
    data.fish = [];
    data.dead = [
      { ...body, id: 0 },
      { ...body, id: 0 },
    ];
    expect(parseWorld(JSON.stringify(data)).ok).toBe(false);
  });

  it('un transfert garde l’âge de l’animal, ramené à l’horloge du bac d’arrivée', () => {
    const base = createRoom(42, ['tropical', 'tropical']);
    const from = advance(base.tanks[0]!.world, 300);
    const room: RoomState = {
      ...base,
      tanks: base.tanks.map((tank, i) => (i === 0 ? { ...tank, world: from } : tank)),
    };
    const fish = from.entities.find((entity) => entity.species === 'neon')!;
    const age = ageSeconds(fish, from.seed, from.time);
    const result = transferFish(room, base.tanks[0]!.id, base.tanks[1]!.id, fish.id);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const arrival = result.room.tanks[1]!.world;
    const moved = arrival.entities.find((entity) => entity.id === result.id)!;
    expect(ageSeconds(moved, arrival.seed, arrival.time)).toBeCloseTo(age, 6);
  });
});
