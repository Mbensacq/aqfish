import {
  addSupport,
  addTank,
  createRoom,
  isCentimetric,
  MAX_ROOM_SUPPORTS,
  MAX_ROOM_TANKS,
  moveTank,
  removeSupport,
  removeTank,
  renameTank,
  ROOM_FLOOR,
  roomLayoutProblems,
  stepRoom,
  SUPPORT_CATALOG,
  syncRoom,
  tankAnimalCount,
  tankDimensionsOf,
  tankPlacementRefusal,
  tankResizeRefusal,
  tankSeed,
  TANK_SIZES,
  type RoomLayoutResult,
  type RoomState,
  type TankPlacement,
} from './room-state';
import { serializeWorld } from './save';
import { TANK_LIMITS } from './tank';
import { createDefaultWorld } from './world';

function ok(result: RoomLayoutResult): { room: RoomState; id: number } {
  if (!result.ok) {
    throw new Error(`refusé : ${result.reason}`);
  }
  return result;
}

const floor = (x: number, z: number, quarter: 0 | 1 | 2 | 3 = 0): TankPlacement => ({
  supportId: null,
  x,
  z,
  quarter,
});

/** Pièce de départ avec une commode (id 0) à droite du bac historique. */
function withCommode(): RoomState {
  return ok(addSupport(createRoom(42), 'commode', 2, -2)).room;
}

describe('catalogue des bacs et des meubles (ADR 0073)', () => {
  it('chaque taille tient dans TANK_LIMITS', () => {
    for (const size of Object.values(TANK_SIZES)) {
      for (const key of ['width', 'height', 'depth'] as const) {
        expect(size.dimensions[key]).toBeGreaterThanOrEqual(TANK_LIMITS[key].min);
        expect(size.dimensions[key]).toBeLessThanOrEqual(TANK_LIMITS[key].max);
      }
    }
    expect(TANK_SIZES.petit.dimensions.width).toBeLessThan(TANK_SIZES.grand.dimensions.width);
  });

  it('isCentimetric accepte le centimètre, refuse le reste', () => {
    expect([0, -1.4, 2.35, 4].every(isCentimetric)).toBe(true);
    expect([0.123, Number.NaN, Number.POSITIVE_INFINITY].some(isCentimetric)).toBe(false);
  });
});

describe('addSupport / removeSupport', () => {
  it('pose une commode au sol avec un identifiant croissant', () => {
    const room = withCommode();
    expect(room.furniture).toEqual([{ id: 0, kind: 'commode', x: 2, z: -2, quarter: 0 }]);
    expect(room.nextFurnitureId).toBe(1);
    const second = ok(addSupport(room, 'etagere-bacs', -2, 2, 1));
    expect(second.id).toBe(1);
    expect(roomLayoutProblems(second.room)).toEqual([]);
  });

  it('refuse un chevauchement, le centre réservé au bac historique, et hors du sol', () => {
    const room = withCommode();
    expect(addSupport(room, 'commode', 2.5, -2)).toEqual({ ok: false, reason: 'chevauchement' });
    expect(addSupport(room, 'commode', 0, 0)).toEqual({ ok: false, reason: 'chevauchement' });
    expect(addSupport(room, 'commode', ROOM_FLOOR.halfWidth - 0.5, 0)).toEqual({
      ok: false,
      reason: 'hors-piece',
    });
    // Tourné d'un quart, la commode (50 cm de profondeur) tient contre le mur.
    expect(addSupport(room, 'commode', ROOM_FLOOR.halfWidth - 0.25, 0, 1).ok).toBe(true);
    // Se toucher est permis : 120 cm de large, centres à 120 cm.
    expect(addSupport(room, 'commode', 0.8, -2).ok).toBe(true);
  });

  it('refuse une position non centimétrique ou un type inconnu', () => {
    const room = createRoom(1);
    expect(addSupport(room, 'commode', 1.234, 2).ok).toBe(false);
    expect(addSupport(room, 'buffet' as never, 2, 2)).toEqual({
      ok: false,
      reason: 'position-invalide',
    });
  });

  it('refuse au-delà de MAX_ROOM_SUPPORTS', () => {
    let room = createRoom(3);
    // Rangées de 5 étagères basses (160 × 45 cm) bord à bord, loin du bac historique.
    for (let i = 0; i < MAX_ROOM_SUPPORTS; i++) {
      const x = [-3.2, -1.6, 0, 1.6, 3.2][i % 5]!;
      const z = [-2.7, -2.25, -1.8, -1.35, -0.9][Math.floor(i / 5)]!;
      room = ok(addSupport(room, 'etagere-bacs', x, z)).room;
    }
    expect(room.furniture).toHaveLength(MAX_ROOM_SUPPORTS);
    expect(roomLayoutProblems(room)).toEqual([]);
    expect(addSupport(room, 'commode', 0, 2.7)).toEqual({ ok: false, reason: 'piece-pleine' });
  });

  it('refuse de retirer un meuble inconnu ou qui porte un bac', () => {
    const room = withCommode();
    const placed = ok(
      addTank(room, {
        environment: 'tropical',
        size: 'moyen',
        placement: { supportId: 0, x: 2, z: -2, quarter: 0 },
      }),
    ).room;
    expect(removeSupport(placed, 0)).toEqual({ ok: false, reason: 'support-occupe' });
    expect(removeSupport(placed, 9)).toEqual({ ok: false, reason: 'meuble-inconnu' });
    const freed = ok(removeTank(placed, 1)).room;
    expect(ok(removeSupport(freed, 0)).room.furniture).toEqual([]);
    expect(ok(removeSupport(freed, 0)).room.nextFurnitureId).toBe(1);
  });
});

describe('addTank : bac vide, posé au sol ou sur un meuble', () => {
  it('ajoute un bac vide sur la commode, graine dérivée, autres bacs inchangés', () => {
    const room = withCommode();
    const before = serializeWorld(room.tanks[0]!.world);
    const { room: after, id } = ok(
      addTank(room, {
        environment: 'tropical',
        size: 'moyen',
        placement: { supportId: 0, x: 2, z: -2, quarter: 0 },
      }),
    );
    expect(id).toBe(1);
    expect(after.nextTankId).toBe(2);
    const tank = after.tanks[1]!;
    expect(tank).toMatchObject({ id: 1, name: 'Bac tropical', place: 'piece' });
    expect(tank.world.seed).toBe(tankSeed(42, 1));
    expect(tankAnimalCount(tank)).toBe(0);
    expect(tankDimensionsOf(tank)).toEqual(TANK_SIZES.moyen.dimensions);
    expect(serializeWorld(after.tanks[0]!.world)).toBe(before);
    expect(room.tanks).toHaveLength(1); // pur
  });

  it('environnement aux dimensions fixes : la taille est ignorée ; le bassin est refusé', () => {
    const room = createRoom(5);
    const recif = ok(
      addTank(room, { environment: 'recif', size: 'petit', placement: floor(2.5, 2) }),
    );
    const tank = recif.room.tanks[1]!;
    expect(tankDimensionsOf(tank)).toEqual(
      tankDimensionsOf({ ...tank, world: createDefaultWorld(1, 'recif') }),
    );
    expect(addTank(room, { environment: 'bassin', size: 'petit', placement: floor(2, 2) })).toEqual(
      {
        ok: false,
        reason: 'jardin',
      },
    );
    expect(() =>
      addTank(room, { environment: 'mer' as never, size: 'petit', placement: floor(2, 2) }),
    ).toThrow();
  });

  it('refuse : hors du plateau, meuble inconnu, chevauchement, hors du sol, position invalide', () => {
    const room = withCommode();
    const req = (placement: TankPlacement) =>
      addTank(room, { environment: 'tropical', size: 'grand', placement });
    expect(req({ supportId: 0, x: 2, z: -2, quarter: 0 })).toEqual({
      ok: false,
      reason: 'hors-support',
    });
    expect(req({ supportId: 7, x: 2, z: -2, quarter: 0 })).toEqual({
      ok: false,
      reason: 'meuble-inconnu',
    });
    expect(req(floor(2, -2))).toEqual({ ok: false, reason: 'chevauchement' });
    expect(req(floor(0, 0))).toEqual({ ok: false, reason: 'chevauchement' });
    expect(req(floor(-ROOM_FLOOR.halfWidth + 0.5, 0))).toEqual({ ok: false, reason: 'hors-piece' });
    expect(req(floor(0.005, 2))).toEqual({ ok: false, reason: 'position-invalide' });
    expect(req({ ...floor(2, 2), quarter: 4 as never })).toEqual({
      ok: false,
      reason: 'position-invalide',
    });
    // Contre le mur, tourné d'un quart (50 cm de profondeur) : permis.
    expect(req(floor(-ROOM_FLOOR.halfWidth + 0.25, 0, 1)).ok).toBe(true);
  });

  it('deux bacs côte à côte sur la même étagère, sans se chevaucher', () => {
    const shelf = ok(addSupport(createRoom(8), 'etagere-bacs', -2, 2)).room;
    const a = ok(
      addTank(shelf, {
        environment: 'tropical',
        size: 'petit',
        placement: { supportId: 0, x: -2.5, z: 2, quarter: 0 },
      }),
    );
    const b = addTank(a.room, {
      environment: 'tropical',
      size: 'petit',
      placement: { supportId: 0, x: -1.9, z: 2, quarter: 0 },
    });
    expect(b.ok).toBe(true);
    const c = addTank(a.room, {
      environment: 'tropical',
      size: 'petit',
      placement: { supportId: 0, x: -2.2, z: 2, quarter: 0 },
    });
    expect(c).toEqual({ ok: false, reason: 'chevauchement' });
  });

  it('refuse au-delà de MAX_ROOM_TANKS et ne réutilise jamais un identifiant', () => {
    let room = createRoom(11);
    for (let i = 1; i < MAX_ROOM_TANKS; i++) {
      const x = -3.6 + ((i - 1) % 8) * 0.65;
      const z = -2.6 + Math.floor((i - 1) / 8) * 0.5;
      room = ok(
        addTank(room, {
          environment: 'tropical',
          size: 'petit',
          placement: floor(Math.round(x * 100) / 100, Math.round(z * 100) / 100),
        }),
      ).room;
    }
    expect(room.tanks).toHaveLength(MAX_ROOM_TANKS);
    expect(
      addTank(room, { environment: 'tropical', size: 'petit', placement: floor(3, 2.6) }),
    ).toEqual({
      ok: false,
      reason: 'piece-pleine',
    });
    const removed = ok(removeTank(room, 5)).room;
    const again = ok(
      addTank(removed, { environment: 'tropical', size: 'petit', placement: floor(-1, -2.6) }),
    );
    expect(again.id).toBe(MAX_ROOM_TANKS);
    expect(roomLayoutProblems(again.room)).toEqual([]);
  });
});

describe('moveTank / removeTank / renameTank', () => {
  function twoTanks(): RoomState {
    return ok(
      addTank(withCommode(), { environment: 'tropical', size: 'petit', placement: floor(-2, 2) }),
    ).room;
  }

  it('déplace un bac sur la commode, le tourne, refuse le bac historique au centre', () => {
    const room = twoTanks();
    const moved = ok(moveTank(room, 1, { supportId: 0, x: 2, z: -2, quarter: 2 })).room;
    expect(moved.tanks[1]!.placement).toEqual({ supportId: 0, x: 2, z: -2, quarter: 2 });
    expect(tankPlacementRefusal(moved, moved.tanks[1]!, moved.tanks[1]!.placement!)).toBeNull();
    // Tourné d'un quart, le petit bac (60 cm de profondeur) déborde de la commode (50 cm).
    expect(moveTank(room, 1, { supportId: 0, x: 2, z: -2, quarter: 1 })).toEqual({
      ok: false,
      reason: 'hors-support',
    });
    expect(moveTank(room, 1, floor(0, 0))).toEqual({ ok: false, reason: 'chevauchement' });
    expect(moveTank(room, 9, floor(1, 1))).toEqual({ ok: false, reason: 'bac-inconnu' });
    // Se reposer à sa propre place est permis (il s'ignore lui-même).
    expect(moveTank(room, 1, floor(-2, 2)).ok).toBe(true);
  });

  it('retire un bac peuplé ou vide, jamais le dernier ; les autres gardent leur état', () => {
    const room = twoTanks();
    expect(tankAnimalCount(room.tanks[0]!)).toBeGreaterThan(0);
    const without0 = ok(removeTank(room, 0)).room;
    expect(without0.tanks.map((t) => t.id)).toEqual([1]);
    expect(without0.nextTankId).toBe(2);
    expect(removeTank(without0, 1)).toEqual({ ok: false, reason: 'dernier-bac' });
    expect(removeTank(room, 4)).toEqual({ ok: false, reason: 'bac-inconnu' });
    // Retirer un bac ne change pas l'évolution des autres.
    const a = stepRoom(without0, 40).tanks[0]!.world;
    const b = stepRoom(room, 40).tanks[1]!.world;
    expect(serializeWorld(a)).toBe(serializeWorld(b));
  });

  it('renomme (rogné, borné) ou refuse', () => {
    const room = twoTanks();
    expect(renameTank(room, 1, '  Nano crevettes ')!.tanks[1]!.name).toBe('Nano crevettes');
    expect(renameTank(room, 1, '   ')).toBeNull();
    expect(renameTank(room, 1, 'x'.repeat(41))).toBeNull();
    expect(renameTank(room, 7, 'Bac')).toBeNull();
  });

  it('nom donné à l’ajout', () => {
    const named = ok(
      addTank(createRoom(2), {
        environment: 'paludarium',
        size: 'petit',
        placement: floor(2, 2),
        name: ' Grenouilles ',
      }),
    );
    expect(named.room.tanks[1]!.name).toBe('Grenouilles');
  });
});

describe('roomLayoutProblems : pièce relue incohérente', () => {
  it('signale identifiants, compteur, chevauchements et poses invalides', () => {
    const room = withCommode();
    expect(roomLayoutProblems(room)).toEqual([]);
    const bad: RoomState = {
      ...room,
      nextFurnitureId: 0,
      furniture: [
        { ...room.furniture[0]!, id: 1 },
        { ...room.furniture[0]!, x: 2.5 },
      ],
    };
    const problems = roomLayoutProblems(bad);
    expect(problems.join(' ')).toMatch(/non strictement croissants/);
    expect(problems.join(' ')).toMatch(/nextFurnitureId/);
    expect(problems.join(' ')).toMatch(/chevauchement/);
    const floating: RoomState = {
      ...room,
      tanks: [{ ...room.tanks[0]!, placement: { supportId: 3, x: 1, z: 1, quarter: 0 } }],
    };
    expect(roomLayoutProblems(floating)).toEqual(['bac 0 : meuble-inconnu']);
    const tooMany: RoomState = {
      ...room,
      furniture: Array.from({ length: MAX_ROOM_SUPPORTS + 1 }, (_, i) => ({
        ...room.furniture[0]!,
        id: i,
      })),
      nextFurnitureId: 99,
    };
    expect(roomLayoutProblems(tooMany)[0]).toMatch(/trop de meubles/);
  });

  it('le bassin du jardin n’a pas de position et n’occupe pas la pièce', () => {
    const room = createRoom(4, ['tropical', 'bassin']);
    expect(roomLayoutProblems(room)).toEqual([]);
    expect(tankPlacementRefusal(room, room.tanks[1]!, floor(2, 2))).toBe('jardin');
    expect(moveTank(room, 1, floor(2, 2))).toEqual({ ok: false, reason: 'jardin' });
    expect(SUPPORT_CATALOG.commode.height).toBe(75);
  });
});

describe('syncRoom (hôte du lot 1) garde la disposition', () => {
  it('meubles, compteur et position des bacs survivent à la resynchronisation', () => {
    const room = ok(
      addTank(withCommode(), {
        environment: 'recif',
        size: 'petit',
        placement: { supportId: null, x: -2, z: 2, quarter: 0 },
      }),
    ).room;
    const shown = stepRoom(room, 5).tanks[0]!.world;
    // Lot 2b : un bac posé n'est jamais un monde rangé (`roomWorlds` l'écarte) ; il est gardé
    // tel quel par `syncRoom`.
    const synced = syncRoom(room, shown, []);
    expect(synced.room.furniture).toEqual(room.furniture);
    expect(synced.room.nextFurnitureId).toBe(1);
    expect(synced.room.tanks.map((t) => t.placement)).toEqual(room.tanks.map((t) => t.placement));
    expect(synced.selectedTankId).toBe(0);
  });
});

describe('dette #311 : refus typés', () => {
  it('addTank refuse une taille hors catalogue (valeur d’interface ou d’import)', () => {
    const result = addTank(createRoom(42), {
      environment: 'tropical',
      size: 'nano' as never,
      placement: floor(2, 2),
    });
    expect(result).toEqual({ ok: false, reason: 'position-invalide' });
  });

  it('tankResizeRefusal : bassin et environnement fixe toujours acceptés', () => {
    const room = createRoom(42, ['tropical', 'recif', 'bassin']);
    expect(tankResizeRefusal(room, 1, { width: 2, height: 0.9, depth: 0.9 })).toBeNull();
    expect(tankResizeRefusal(room, 2, { width: 2, height: 0.9, depth: 0.9 })).toBeNull();
    expect(tankResizeRefusal(room, 0, { width: 2, height: 0.9, depth: 0.9 })).toBeNull();
  });
});
