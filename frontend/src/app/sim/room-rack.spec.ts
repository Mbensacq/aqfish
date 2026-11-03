import { ENVIRONMENT_IDS, placeDimensions } from './environment';
import { ROOM_LIMITS, WALL_RISE } from './room';
import { findTankSpot, roomLayoutBlocks, type FloorRect } from './room-layout';
import { parseSave, serializeRoom } from './room-save';
import {
  addSupport,
  addTank,
  createRoom,
  MAX_SUPPORT_LEVELS,
  moveTank,
  placeOf,
  placementLevel,
  RACK_POST_CM,
  RACK_SHELF_CM,
  MAX_ROOM_SUPPORTS,
  ROOM_TANK_CAP,
  removeSupport,
  removeTank,
  ROOM_CEILING_CM,
  roomLayoutProblems,
  SUPPORT_CATALOG,
  SUPPORT_KINDS,
  supportLevel,
  supportRefusal,
  tankPlacementRefusal,
  type AddTankRequest,
  type RoomLayoutResult,
  type RoomState,
  type TankPlacement,
} from './room-state';

/**
 * Étagère d'animalerie à plusieurs niveaux (#419, ADR 0102) : catalogue, pose par niveau,
 * hauteur libre et plafond, retrait du meuble, sauvegarde.
 */

function ok(result: RoomLayoutResult): { room: RoomState; id: number } {
  if (!result.ok) {
    throw new Error(`refusé : ${result.reason}`);
  }
  return result;
}

const RACK = SUPPORT_CATALOG['etagere-animalerie'];

/** Pièce de départ et une étagère d'animalerie (id 0) à droite du bac historique. */
function withRack(quarter: 0 | 1 | 2 | 3 = 0): RoomState {
  return ok(addSupport(createRoom(42), 'etagere-animalerie', 2.2, -2, quarter)).room;
}

function onRack(level: number, x = 2.2, z = -2): TankPlacement {
  return level === 0
    ? { supportId: 0, x, z, quarter: 0 }
    : { supportId: 0, x, z, quarter: 0, level };
}

function tank(placement: TankPlacement, size: AddTankRequest['size'] = 'moyen'): AddTankRequest {
  return { environment: 'tropical', size, placement };
}

/** Étagère pleine : un bac moyen par niveau. */
function fullRack(): RoomState {
  let room = withRack();
  for (const level of [0, 1, 2]) {
    room = ok(addTank(room, tank(onRack(level)))).room;
  }
  return room;
}

describe('catalogue : étagère d’animalerie (ADR 0102)', () => {
  it('trois niveaux en centimètres entiers, du bas vers le haut, le dernier au plateau', () => {
    expect(SUPPORT_KINDS).toContain('etagere-animalerie');
    expect(RACK.levels.map((level) => level.height)).toEqual([10, 76, 142]);
    expect(RACK.levels.at(-1)?.height).toBe(RACK.height);
    for (const level of RACK.levels) {
      for (const value of [level.height, level.width, level.depth, level.clearance ?? 0]) {
        expect(Number.isInteger(value)).toBe(true);
      }
      expect(level.width).toBeLessThanOrEqual(RACK.width);
      expect(level.depth).toBeLessThanOrEqual(RACK.depth);
    }
    // Hauteur libre : jusqu'au dessous de la tablette suivante ; le haut est ouvert.
    expect(RACK.levels.map((level) => level.clearance)).toEqual([
      76 - RACK_SHELF_CM - 10,
      142 - RACK_SHELF_CM - 76,
      null,
    ]);
    // Les montants réduisent les niveaux bas ; le plateau supérieur les couvre.
    expect(RACK.levels.map((level) => level.width)).toEqual([
      RACK.width - 2 * RACK_POST_CM,
      RACK.width - 2 * RACK_POST_CM,
      RACK.width,
    ]);
  });

  it('les meubles à un plateau gardent leur seul niveau, à leur hauteur', () => {
    for (const kind of ['commode', 'etagere-bacs'] as const) {
      const model = SUPPORT_CATALOG[kind];
      expect(model.levels).toEqual([
        { height: model.height, width: model.width, depth: model.depth, clearance: null },
      ]);
    }
  });

  it('MAX_SUPPORT_LEVELS couvre tout le catalogue', () => {
    const most = Math.max(...SUPPORT_KINDS.map((kind) => SUPPORT_CATALOG[kind].levels.length));
    expect(MAX_SUPPORT_LEVELS).toBe(most);
  });

  it('supportLevel : niveau existant, sinon undefined', () => {
    expect(supportLevel('etagere-animalerie', 1)?.height).toBe(76);
    expect(supportLevel('etagere-animalerie', 3)).toBeUndefined();
    expect(supportLevel('etagere-animalerie', -1)).toBeUndefined();
    expect(supportLevel('etagere-animalerie', 0.5)).toBeUndefined();
    expect(supportLevel('commode', 1)).toBeUndefined();
  });

  it('le plafond retenu est sous le plus bas plafond de la pièce graphique', () => {
    for (const environment of ENVIRONMENT_IDS) {
      if (placeOf(environment) === 'jardin') {
        continue;
      }
      const lowest =
        ROOM_LIMITS.cabinetHeight.min + placeDimensions(environment).height + WALL_RISE;
      expect(ROOM_CEILING_CM / 100).toBeLessThanOrEqual(lowest);
    }
  });

  it('placementLevel : absent vaut 0', () => {
    expect(placementLevel({ supportId: null, x: 0, z: 0, quarter: 0 })).toBe(0);
    expect(placementLevel(onRack(2))).toBe(2);
  });
});

describe('pose d’un bac sur un niveau', () => {
  it('trois bacs moyens sur trois niveaux, à la même place au sol', () => {
    const room = fullRack();
    expect(room.tanks.map((t) => t.placement && placementLevel(t.placement))).toEqual([
      null,
      0,
      1,
      2,
    ]);
    expect(roomLayoutProblems(room)).toEqual([]);
  });

  it('niveau plein : un second bac moyen au même niveau chevauche', () => {
    const room = ok(addTank(withRack(), tank(onRack(1)))).room;
    expect(addTank(room, tank(onRack(1, 2.22)))).toEqual({ ok: false, reason: 'chevauchement' });
    // Deux petits bacs côte à côte tiennent sur un niveau bas (122 cm entre les montants).
    const petits = ok(addTank(withRack(), tank(onRack(0, 1.89), 'petit'))).room;
    expect(addTank(petits, tank(onRack(0, 2.5), 'petit')).ok).toBe(true);
    expect(addTank(petits, tank(onRack(0, 2.48), 'petit'))).toEqual({
      ok: false,
      reason: 'chevauchement',
    });
  });

  it('bac plus large que le niveau : hors du support (montants compris)', () => {
    expect(addTank(withRack(), tank(onRack(2), 'grand'))).toEqual({
      ok: false,
      reason: 'hors-support',
    });
    // Le plateau du haut (130 cm) porte deux petits bacs bord à bord ; en bas, les montants
    // retirent 4 cm de chaque côté.
    expect(tankPlacementRefusal(withRack(), probe(), onRack(2, 1.85))).toBeNull();
    expect(tankPlacementRefusal(withRack(), probe(), onRack(0, 1.85))).toBe('hors-support');
    expect(tankPlacementRefusal(withRack(), probe(), onRack(0, 1.89))).toBeNull();
  });

  it('bac trop haut pour le niveau : refusé sous une tablette, admis au niveau du haut', () => {
    const room = withRack();
    // Bac tropical de 70 cm de haut (TANK_LIMITS), 63 cm libres sous les tablettes.
    const tall = { ...probe(), world: { ...probe().world, dimensions: dims(0.7) } };
    expect(tankPlacementRefusal(room, tall, onRack(0))).toBe('trop-haut');
    expect(tankPlacementRefusal(room, tall, onRack(1))).toBe('trop-haut');
    expect(tankPlacementRefusal(room, tall, onRack(2))).toBeNull();
    // Récif (150 cm de long) : plus large que l'étagère, à tout niveau.
    expect(addTank(room, { environment: 'recif', size: 'moyen', placement: onRack(2) })).toEqual({
      ok: false,
      reason: 'hors-support',
    });
    // Paludarium : 60 cm, il tient en bas.
    const palu = addTank(room, {
      environment: 'paludarium',
      size: 'moyen',
      placement: onRack(0),
    });
    expect(palu.ok).toBe(true);
  });

  it('hauteur exacte : un bac qui touche la tablette du dessus est admis', () => {
    // Bac tropical réglé à 63 cm, au pas de TANK_LIMITS : tient s'il n'en manque aucun.
    const room = withRack();
    const fits = { ...probe(), world: { ...probe().world, dimensions: dims(0.63) } };
    const tall = { ...probe(), world: { ...probe().world, dimensions: dims(0.64) } };
    expect(tankPlacementRefusal(room, fits, onRack(0))).toBeNull();
    expect(tankPlacementRefusal(room, tall, onRack(0))).toBe('trop-haut');
  });

  it('niveau inexistant, ou niveau au sol : position invalide', () => {
    const room = withRack();
    expect(tankPlacementRefusal(room, probe(), onRack(3))).toBe('position-invalide');
    expect(tankPlacementRefusal(room, probe(), { ...onRack(0), level: -1 })).toBe(
      'position-invalide',
    );
    expect(
      tankPlacementRefusal(room, probe(), { supportId: null, x: 2.2, z: 1, quarter: 0, level: 1 }),
    ).toBe('position-invalide');
    const commode = ok(addSupport(createRoom(42), 'commode', 2, -2)).room;
    expect(tankPlacementRefusal(commode, probe(), { ...onRack(1, 2, -2) })).toBe(
      'position-invalide',
    );
  });

  it('un bac au sol ne se glisse pas sous l’étagère', () => {
    const room = withRack();
    expect(addTank(room, tank({ supportId: null, x: 2.2, z: -2, quarter: 0 }, 'petit'))).toEqual({
      ok: false,
      reason: 'chevauchement',
    });
  });

  it('étagère tournée d’un quart : le plateau tourne avec elle', () => {
    const room = ok(addSupport(createRoom(42), 'etagere-animalerie', 2.2, -1.8, 1)).room;
    const along: TankPlacement = { supportId: 0, x: 2.2, z: -1.8, quarter: 1, level: 1 };
    expect(addTank(room, tank(along)).ok).toBe(true);
    expect(addTank(room, tank({ ...along, quarter: 0 }))).toEqual({
      ok: false,
      reason: 'hors-support',
    });
  });

  it('déplacer un bac d’un niveau à l’autre', () => {
    const room = ok(addTank(withRack(), tank(onRack(0)))).room;
    const moved = ok(moveTank(room, 1, onRack(2))).room;
    expect(moved.tanks[1]?.placement).toEqual(onRack(2));
    expect(moveTank(fullRack(), 1, onRack(2))).toEqual({ ok: false, reason: 'chevauchement' });
  });

  it('plafond : aucun bac au-dessus de ROOM_CEILING_CM', () => {
    // Récif (65 cm) au sommet : 142 + 65 = 207 cm, sous le plafond.
    expect(RACK.height + 65).toBeLessThanOrEqual(ROOM_CEILING_CM);
    expect(ROOM_CEILING_CM).toBe(220);
  });
});

describe('retrait et déplacement de l’étagère', () => {
  it('refusés tant qu’un niveau porte un bac, quel que soit le niveau', () => {
    for (const level of [0, 1, 2]) {
      const room = ok(addTank(withRack(), tank(onRack(level)))).room;
      expect(removeSupport(room, 0)).toEqual({ ok: false, reason: 'support-occupe' });
      const freed = ok(removeTank(room, 1)).room;
      expect(removeSupport(freed, 0).ok).toBe(true);
    }
  });

  it('l’étagère et ses bacs ne se gênent pas ; un autre meuble ne s’y pose pas', () => {
    const room = fullRack();
    const rack = room.furniture[0];
    if (rack === undefined) throw new Error('étagère absente');
    expect(supportRefusal(room, rack)).toBeNull();
    expect(addSupport(room, 'commode', 2.2, -1.9)).toEqual({ ok: false, reason: 'chevauchement' });
  });

  it('plafond de meubles et de bacs (ADR 0096) : l’étagère compte pour un meuble', () => {
    const room = fullRack();
    expect(room.furniture.length).toBe(1);
    expect(room.tanks.length).toBeLessThanOrEqual(ROOM_TANK_CAP);
    expect(room.furniture.length).toBeLessThanOrEqual(MAX_ROOM_SUPPORTS);
  });
});

describe('pose automatique et rendu', () => {
  const AREA: FloorRect = { minX: -4, maxX: 4, minZ: -3, maxZ: 3 };

  it('findTankSpot remplit les niveaux du bas vers le haut, puis refuse', () => {
    let room = withRack();
    const levels: number[] = [];
    for (let i = 0; i < 3; i++) {
      const spot = findTankSpot(room, 'tropical', 'moyen', 0, AREA);
      if (spot === null) throw new Error('aucune place');
      levels.push(placementLevel(spot));
      room = ok(addTank(room, tank(spot))).room;
    }
    expect(levels).toEqual([0, 1, 2]);
    expect(findTankSpot(room, 'tropical', 'moyen', 0, AREA)).toBeNull();
    // Grand bac (150 cm) : aucun niveau assez large.
    expect(findTankSpot(withRack(), 'tropical', 'grand', 0, AREA)).toBeNull();
  });

  it('findTankSpot omet le niveau 0 (position identique aux meubles à un plateau)', () => {
    const spot = findTankSpot(withRack(), 'tropical', 'moyen', 0, AREA);
    expect(spot !== null && 'level' in spot).toBe(false);
  });

  it('roomLayoutBlocks : bacs posés à la hauteur de leur tablette, blocs au centimètre', () => {
    const cabinet = 0.75;
    const blocks = roomLayoutBlocks(fullRack(), cabinet);
    // Cadre du bas de chaque bac (toute l'emprise) : la base à la hauteur du niveau.
    const bases = blocks
      .filter((b) => b.part === 'cadre' && b.box.minX === 1.7 && b.box.maxX === 2.7)
      .filter((b) => b.box.minZ === -2.2 && b.box.maxZ === -1.8)
      .map((b) => Math.round((b.box.minY + cabinet) * 100));
    expect(bases).toEqual([10, 76, 142]);
    const shelves = blocks.filter((b) => b.part === 'plateau');
    expect(shelves.map((b) => Math.round((b.box.maxY + cabinet) * 100))).toEqual([10, 76, 142]);
    for (const b of blocks) {
      for (const v of [b.box.minX, b.box.maxX, b.box.minY, b.box.maxY, b.box.minZ, b.box.maxZ]) {
        expect(Math.round(v * 100) / 100).toBe(v);
      }
    }
  });
});

describe('sauvegarde (schéma 2)', () => {
  it('aller-retour sans perte d’une étagère pleine à trois niveaux', () => {
    const room = fullRack();
    const text = serializeRoom(room, 0);
    const back = parseSave(text);
    if (!back.ok) throw new Error(back.error);
    expect(back.room.furniture).toEqual(room.furniture);
    expect(back.room.tanks.map((t) => t.placement)).toEqual(room.tanks.map((t) => t.placement));
    expect(serializeRoom(back.room, 0)).toBe(text);
    // Niveau 0 omis du document, niveaux 1 et 2 écrits.
    const doc = JSON.parse(text) as { tanks: { placement?: Record<string, unknown> }[] };
    expect(doc.tanks.map((t) => t.placement?.['level'])).toEqual([undefined, undefined, 1, 2]);
  });

  it('document sans niveau (avant l’étagère) : relu et réécrit à l’identique', () => {
    const before = ok(addSupport(createRoom(42), 'commode', 2, -2)).room;
    const placed = ok(addTank(before, tank({ supportId: 0, x: 2, z: -2, quarter: 0 }))).room;
    const text = serializeRoom(placed, 0);
    expect(text).not.toContain('"level"');
    const back = parseSave(text);
    if (!back.ok) throw new Error(back.error);
    expect(back.room.tanks[1]?.placement).toEqual({ supportId: 0, x: 2, z: -2, quarter: 0 });
    expect(serializeRoom(back.room, 0)).toBe(text);
  });

  it('niveau mal formé ou absent du meuble : document refusé', () => {
    const text = serializeRoom(fullRack(), 0);
    const doc = JSON.parse(text) as { tanks: { placement?: Record<string, unknown> }[] };
    for (const bad of [-1, 1.5, 'deux', MAX_SUPPORT_LEVELS]) {
      const copy = structuredClone(doc);
      const placement = copy.tanks[3]?.placement;
      if (placement === undefined) throw new Error('placement absent');
      placement['level'] = bad;
      expect(parseSave(JSON.stringify(copy)).ok).toBe(false);
    }
    // Niveau valide en soi, mais deux bacs au même niveau : disposition refusée.
    const clash = structuredClone(doc);
    const top = clash.tanks[3]?.placement;
    if (top === undefined) throw new Error('placement absent');
    top['level'] = 1;
    expect(parseSave(JSON.stringify(clash)).ok).toBe(false);
  });
});

/** Bac tropical sondé (id libre), pour `tankPlacementRefusal`. */
function probe() {
  const room = createRoom(42);
  const model = room.tanks[0];
  if (model === undefined) throw new Error('pièce vide');
  return {
    ...model,
    id: 99,
    placement: null,
    world: { ...model.world, dimensions: { width: 0.6, height: 0.5, depth: 0.3 } },
  };
}

function dims(height: number) {
  return { width: 1, height, depth: 0.4 };
}
