import { createRoom, stepRoom } from './room-state';
import { parseSave, serializeRoom } from './room-save';
import { parseWorld, SAVE_SCHEMA, SAVE_SCHEMA_2, serializeWorld } from './save';
import { schema1ToMgPerLiter, schema2ToMgPerLiter, worldBodyToMgPerLiter } from './save-units';
import { freshWater } from './water';
import {
  createWaterHistory,
  recordWaterHistory,
  restoreWaterHistory,
  savedWaterHistory,
} from './water-history';
import { MG_PER_LITER_PER_GAME_UNIT } from './water-units';
import { advance, createDefaultWorld } from './world';
import type { World } from './world-types';

/** Eau ancienne (unités de jeu) : ammoniaque 6, nitrites 40, nitrates 50. */
const OLD_WATER = { ammonia: 6, nitrite: 40, nitrate: 50 } as const;

/** Monde dont l'eau porte `OLD_WATER` convertie et un historique d'un relevé. */
function pollutedWorld(): World {
  const world = advance(createDefaultWorld(5, 'tropical'), 10);
  const water = {
    ...freshWater('tropical'),
    ammonia: OLD_WATER.ammonia * MG_PER_LITER_PER_GAME_UNIT.ammonia,
    nitrite: OLD_WATER.nitrite * MG_PER_LITER_PER_GAME_UNIT.nitrite,
    nitrate: OLD_WATER.nitrate * MG_PER_LITER_PER_GAME_UNIT.nitrate,
  };
  const history = createWaterHistory();
  recordWaterHistory(history, water, 0);
  return { ...world, water, waterHistory: savedWaterHistory(history) };
}

/** Document au schéma 2 (ancien : unités de jeu) d'une pièce d'un bac pollué. */
function schema2Doc(): Record<string, unknown> {
  const room = stepRoom(createRoom(9, ['tropical', 'bassin']), 5);
  const doc = JSON.parse(serializeRoom(room, 0)) as Record<string, unknown>;
  const tanks = doc['tanks'] as { world: Record<string, unknown> }[];
  for (const tank of tanks) {
    tank.world['water'] = { ...(tank.world['water'] as object), ...OLD_WATER };
  }
  return { ...doc, schema: SAVE_SCHEMA_2 };
}

describe('sauvegardes et mg/L (#793)', () => {
  it('le schéma de la pièce passe à 3', () => {
    expect(SAVE_SCHEMA).toBe(3);
    expect(SAVE_SCHEMA_2).toBe(2);
  });

  it('une pièce au schéma 2 est relue en mg/L, sans perdre de bac ni d’animal', () => {
    const doc = schema2Doc();
    const animals = (doc['tanks'] as { world: { fish: unknown[] } }[]).map(
      (tank) => tank.world.fish.length,
    );
    const result = parseSave(JSON.stringify(doc));
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.schema).toBe(SAVE_SCHEMA_2);
    expect(result.room.tanks.map((tank) => tank.world.entities.length)).toEqual(animals);
    for (const tank of result.room.tanks) {
      expect(tank.world.water.ammonia).toBe(3);
      expect(tank.world.water.nitrite).toBe(5);
      expect(tank.world.water.nitrate).toBe(50);
    }
  });

  it('une pièce relue au schéma 2 est réécrite au schéma 3, identique à la relecture', () => {
    const result = parseSave(JSON.stringify(schema2Doc()));
    if (!result.ok) {
      throw new Error(result.error);
    }
    const text = serializeRoom(result.room, result.selectedTankId);
    expect(JSON.parse(text)).toMatchObject({ schema: 3 });
    const again = parseSave(text);
    expect(again.ok && again.schema).toBe(3);
    expect(again.ok && again.room.tanks[0]!.world.water).toEqual(result.room.tanks[0]!.world.water);
  });

  it('un nitrite ancien hors bornes (> 100 unités) reste refusé après conversion', () => {
    const doc = schema2Doc();
    const tanks = doc['tanks'] as { world: { water: Record<string, unknown> } }[];
    tanks[0]!.world.water['nitrite'] = 101;
    const result = parseSave(JSON.stringify(doc));
    expect(result.ok).toBe(false);
  });

  it('le schéma 1 s’écrit en unités de jeu et se relit en mg/L, aller-retour exact', () => {
    const world = pollutedWorld();
    const text = serializeWorld(world);
    const doc = JSON.parse(text) as {
      water: Record<string, number>;
      waterHistory: { samples: number[] };
    };
    expect(doc.water['ammonia']).toBe(OLD_WATER.ammonia);
    expect(doc.water['nitrite']).toBe(OLD_WATER.nitrite);
    expect(doc.water['nitrate']).toBe(OLD_WATER.nitrate);
    expect(doc.waterHistory.samples.slice(1, 4)).toEqual([6, 40, 50]);
    const back = parseWorld(text);
    expect(back.ok && back.world.water).toEqual(world.water);
    expect(back.ok && back.world.waterHistory).toEqual(world.waterHistory);
    expect(back.ok && serializeWorld(back.world)).toBe(text);
  });

  it('l’historique converti garde température et pH tels quels', () => {
    const body = { waterHistory: { samples: [24, 2, 8, 30, 7, null, 4, 8, 16, 6.5] } };
    const converted = worldBodyToMgPerLiter(body) as typeof body;
    expect(converted.waterHistory.samples).toEqual([24, 1, 1, 30, 7, null, 2, 1, 16, 6.5]);
    expect(
      restoreWaterHistory({ version: 1, lastSlot: 1, marks: [], ...converted.waterHistory }).count,
    ).toBe(2);
    expect(body.waterHistory.samples[1]).toBe(2);
  });

  it('les conversions laissent intactes les données qui ne sont pas des nombres finis', () => {
    expect(worldBodyToMgPerLiter(null)).toBeNull();
    expect(worldBodyToMgPerLiter({ water: 'x' })).toEqual({ water: 'x' });
    expect(worldBodyToMgPerLiter({ water: { ammonia: '2', nitrite: Number.NaN } })).toEqual({
      water: { ammonia: '2', nitrite: Number.NaN },
    });
    expect(worldBodyToMgPerLiter({ seed: 1 })).toEqual({ seed: 1 });
    expect(schema1ToMgPerLiter(3)).toBe(3);
    expect(
      schema1ToMgPerLiter({ water: { ammonia: 2 }, others: [{ water: { nitrite: 8 } }] }),
    ).toEqual({
      water: { ammonia: 1 },
      others: [{ water: { nitrite: 1 } }],
    });
    expect(schema2ToMgPerLiter({ tanks: 'x' })).toEqual({ tanks: 'x' });
    expect(schema2ToMgPerLiter({ tanks: [null, { world: { water: { nitrate: 3 } } }] })).toEqual({
      tanks: [null, { world: { water: { nitrate: 3 } } }],
    });
  });
});
