import {
  addedTankDimensions,
  findSupportSpot,
  findTankSpot,
  roomLayoutBlocks,
  SUPPORT_GAP_CM,
  type FloorRect,
} from './room-layout';
import { roomArea } from './room-furniture';
import {
  addSupport,
  addTank,
  createRoom,
  isCentimetric,
  MAX_ROOM_TANKS,
  removeTank,
  resolveSelectedTank,
  roomLayoutProblems,
  roomWorlds,
  SUPPORT_CATALOG,
  syncRoom,
  tankResizeRefusal,
  TANK_SIZES,
  type RoomLayoutResult,
  type RoomState,
} from './room-state';
import { createDefaultWorld } from './world';

function ok(result: RoomLayoutResult): { room: RoomState; id: number } {
  if (!result.ok) {
    throw new Error(`refusé : ${result.reason}`);
  }
  return result;
}

/** Aire de la pièce graphique autour du bac tropical par défaut. */
const AREA: FloorRect = roomArea(createDefaultWorld(1).dimensions ?? TANK_SIZES.moyen.dimensions);

/** Pièce d'un bac tropical, avec une commode posée à la première place libre. */
function withCommode(): RoomState {
  const room = createRoom(42);
  const spot = findSupportSpot(room, 'commode', AREA);
  if (spot === null) {
    throw new Error('aucune place');
  }
  return ok(addSupport(room, 'commode', spot.x, spot.z)).room;
}

describe('findSupportSpot : première place libre d’un meuble', () => {
  it('contre le mur, à droite du bac, avec un jour, au centimètre ; même entrée, même place', () => {
    const room = createRoom(42);
    const spot = findSupportSpot(room, 'commode', AREA);
    expect(spot).not.toBeNull();
    expect(spot).toEqual(findSupportSpot(room, 'commode', AREA));
    const { x, z } = spot!;
    expect(isCentimetric(x) && isCentimetric(z)).toBe(true);
    expect(x).toBeGreaterThan(0);
    // Adossée au mur : son arrière au plus un pas de recherche devant le bord de l'aire.
    expect(z - SUPPORT_CATALOG.commode.depth / 200 - AREA.minZ).toBeLessThan(0.1);
    // Le jour : sans lui, la commode toucherait la colonne du bac historique.
    const touching = ok(addSupport(room, 'commode', x - SUPPORT_GAP_CM / 100, z));
    expect(roomLayoutProblems(touching.room)).toEqual([]);
    expect(roomLayoutProblems(ok(addSupport(room, 'commode', x, z)).room)).toEqual([]);
  });

  it('le meuble suivant ne chevauche pas le premier ; les obstacles sont évités', () => {
    let room = withCommode();
    const second = findSupportSpot(room, 'commode', AREA)!;
    room = ok(addSupport(room, 'commode', second.x, second.z)).room;
    expect(roomLayoutProblems(room)).toEqual([]);
    expect(second.x).toBeLessThan(0);
    // Un obstacle couvrant tout le côté droit repousse le meuble à gauche.
    const free = createRoom(42);
    const blocked = findSupportSpot(free, 'commode', AREA, [
      { minX: 0.3, maxX: 10, minZ: -10, maxZ: 10 },
    ])!;
    expect(blocked.x + SUPPORT_CATALOG.commode.width / 200).toBeLessThanOrEqual(0.3);
  });

  it('aucune place : aire trop petite, ou entièrement couverte', () => {
    const room = createRoom(42);
    expect(findSupportSpot(room, 'commode', { minX: 0, maxX: 0.5, minZ: 0, maxZ: 0.5 })).toBeNull();
    expect(
      findSupportSpot(room, 'etagere-bacs', AREA, [{ minX: -9, maxX: 9, minZ: -9, maxZ: 9 }]),
    ).toBeNull();
  });
});

describe('findTankSpot : place d’un bac ajouté', () => {
  it('sur une commode : centré sur le plateau, pose valide', () => {
    const room = withCommode();
    const support = room.furniture[0]!;
    const placement = findTankSpot(room, 'tropical', 'moyen', support.id, AREA)!;
    expect(placement).toEqual({ supportId: support.id, x: support.x, z: support.z, quarter: 0 });
    const added = ok(addTank(room, { environment: 'tropical', size: 'moyen', placement }));
    expect(roomLayoutProblems(added.room)).toEqual([]);
  });

  it('commode occupée par un grand bac : plus de place pour un second', () => {
    let room = withCommode();
    const id = room.furniture[0]!.id;
    // Le grand bac (150 cm) dépasse de la commode (120 cm) : refusé.
    expect(findTankSpot(room, 'tropical', 'grand', id, AREA)).toBeNull();
    const placement = findTankSpot(room, 'tropical', 'moyen', id, AREA)!;
    room = ok(addTank(room, { environment: 'tropical', size: 'moyen', placement })).room;
    expect(findTankSpot(room, 'tropical', 'petit', id, AREA)).toBeNull();
  });

  it('étagère basse : deux petits bacs côte à côte', () => {
    const base = createRoom(42);
    const spot = findSupportSpot(base, 'etagere-bacs', AREA)!;
    let room = ok(addSupport(base, 'etagere-bacs', spot.x, spot.z)).room;
    for (let i = 0; i < 2; i++) {
      const placement = findTankSpot(room, 'tropical', 'petit', 0, AREA)!;
      expect(placement).not.toBeNull();
      room = ok(addTank(room, { environment: 'tropical', size: 'petit', placement })).room;
    }
    expect(room.tanks).toHaveLength(3);
    expect(roomLayoutProblems(room)).toEqual([]);
    expect(findTankSpot(room, 'tropical', 'petit', 0, AREA)).toBeNull();
  });

  it('au sol, hors des obstacles ; environnement à dimensions fixes', () => {
    const room = createRoom(42);
    const placement = findTankSpot(room, 'recif', 'petit', null, AREA, [
      { minX: -10, maxX: -0.5, minZ: -10, maxZ: 10 },
    ])!;
    expect(placement.supportId).toBeNull();
    expect(placement.x).toBeGreaterThan(0);
    const added = ok(addTank(room, { environment: 'recif', size: 'petit', placement }));
    expect(roomLayoutProblems(added.room)).toEqual([]);
    expect(addedTankDimensions('recif', 'grand')).toEqual(addedTankDimensions('recif', 'petit'));
    expect(addedTankDimensions('tropical', 'grand')).toEqual(TANK_SIZES.grand.dimensions);
  });

  it('meuble inconnu ou pièce sans bac : null', () => {
    const room = createRoom(42);
    expect(findTankSpot(room, 'tropical', 'petit', 7, AREA)).toBeNull();
    expect(findTankSpot({ ...room, tanks: [] }, 'tropical', 'petit', null, AREA)).toBeNull();
  });
});

describe('pièce à 3 bacs et 2 meubles : hôte du lot 2b', () => {
  /** Bac historique, commode et étagère, un bac sur chacune. */
  function threeTanks(): RoomState {
    let room = withCommode();
    const shelf = findSupportSpot(room, 'etagere-bacs', AREA)!;
    room = ok(addSupport(room, 'etagere-bacs', shelf.x, shelf.z)).room;
    for (const [supportId, size] of [
      [0, 'moyen'],
      [1, 'petit'],
    ] as const) {
      const placement = findTankSpot(room, 'tropical', size, supportId, AREA)!;
      room = ok(addTank(room, { environment: 'tropical', size, placement })).room;
    }
    return room;
  }

  it('roomWorlds n’affiche que le bac historique ; les bacs posés restent figés', () => {
    const room = threeTanks();
    expect(room.tanks.map((t) => t.placement === null)).toEqual([true, false, false]);
    const worlds = roomWorlds(room, 2);
    expect(worlds.selectedTankId).toBe(0);
    expect(worlds.others).toEqual([]);
    // La sélection enregistrée est gardée (lot 3) ; seul l'affichage retombe sur le bac 0.
    expect(resolveSelectedTank(room, 1)).toBe(1);
    expect(roomWorlds(room, 1).selectedTankId).toBe(0);
  });

  it('syncRoom garde les bacs posés, même du même environnement que le bac affiché', () => {
    const room = threeTanks();
    const synced = syncRoom(room, room.tanks[0]!.world, []);
    expect(synced.room.tanks).toEqual(room.tanks);
    expect(synced.room.nextTankId).toBe(3);
    // Un monde rangé de plus : nouveau bac historique, identifiant suivant.
    const more = syncRoom(room, room.tanks[0]!.world, [createDefaultWorld(42, 'recif')]);
    expect(more.room.tanks.map((t) => t.id)).toEqual([0, 1, 2, 3]);
  });

  it('syncRoom refuse une pièce qui dépasserait le nombre maximal de bacs', () => {
    const room = threeTanks();
    const posed = room.tanks[1]!;
    const full: RoomState = {
      ...room,
      tanks: [
        room.tanks[0]!,
        ...Array.from({ length: MAX_ROOM_TANKS - 1 }, (_, i) => ({ ...posed, id: i + 1 })),
      ],
      nextTankId: MAX_ROOM_TANKS,
    };
    expect(() => syncRoom(full, room.tanks[0]!.world, [createDefaultWorld(1, 'recif')])).toThrow(
      RangeError,
    );
  });

  it('roomWorlds refuse une pièce sans bac à la position historique', () => {
    const room = threeTanks();
    const posedOnly = ok(removeTank(room, 0)).room;
    expect(() => roomWorlds(posedOnly, null)).toThrow(/affichable/);
  });

  it('roomLayoutBlocks : meubles et bacs posés, au centimètre, sur leur support', () => {
    const room = threeTanks();
    const blocks = roomLayoutBlocks(room, 0.75);
    expect(blocks.length).toBeGreaterThan(0);
    for (const { box } of blocks) {
      for (const v of Object.values(box)) {
        expect(Math.abs(v * 100 - Math.round(v * 100))).toBeLessThan(1e-6);
      }
      expect(box.maxX).toBeGreaterThan(box.minX);
      expect(box.maxY).toBeGreaterThan(box.minY);
      expect(box.maxZ).toBeGreaterThan(box.minZ);
      expect(box.minY).toBeGreaterThanOrEqual(-0.75 - 1e-9);
    }
    // Le bas d'un bac posé sur la commode est au niveau de son plateau.
    const water = blocks.filter((b) => b.part === 'eau');
    expect(water).toHaveLength(2);
    const commodeTop = -0.75 + SUPPORT_CATALOG.commode.height / 100;
    const frames = blocks.filter((b) => b.part === 'cadre');
    expect(frames.some((b) => Math.abs(b.box.minY - commodeTop) < 1e-9)).toBe(true);
    // Pièce du lot 1 : rien.
    expect(roomLayoutBlocks(createRoom(42), 0.75)).toEqual([]);
  });

  it('roomLayoutBlocks : un meuble tourné garde son emprise, tournée', () => {
    const room = ok(addSupport(createRoom(42), 'commode', 2, 1, 1)).room;
    const blocks = roomLayoutBlocks(room, 0.75);
    const top = blocks.find((b) => b.part === 'plateau')!.box;
    expect(top.maxX - top.minX).toBeCloseTo(SUPPORT_CATALOG.commode.depth / 100, 9);
    expect(top.maxZ - top.minZ).toBeCloseTo(SUPPORT_CATALOG.commode.width / 100, 9);
  });

  it('tankResizeRefusal : le bac historique agrandi ne doit pas chevaucher la commode (#311)', () => {
    const room = threeTanks();
    expect(tankResizeRefusal(room, 0, TANK_SIZES.petit.dimensions)).toBeNull();
    expect(tankResizeRefusal(room, 0, { width: 2, height: 0.6, depth: 0.5 })).toBe('chevauchement');
    // Un bac posé agrandi dépasserait de son meuble.
    expect(tankResizeRefusal(room, 1, TANK_SIZES.grand.dimensions)).toBe('hors-support');
    expect(tankResizeRefusal(room, 1, TANK_SIZES.petit.dimensions)).toBeNull();
    expect(tankResizeRefusal(room, 9, TANK_SIZES.petit.dimensions)).toBe('bac-inconnu');
  });
});
