import {
  MAX_ROOM_ITEMS,
  readRoom,
  roomData,
  ROOM_ITEM_KINDS,
  sameRoom,
  type Room,
  type RoomItem,
  type RoomQuarter,
} from './room';
import {
  boxesOverlap,
  carriedBy,
  dropRoomItem,
  furnitureBlocks,
  removeRoomItem,
  ROOM_CATALOG,
  roomItemBox,
  settleRoomItems,
  type RoomDropRequest,
} from './room-furniture';
import { DEFAULT_TANK, MAX_TANK } from './tank';

const ROOM: Room = { shown: true, cabinetHeight: 0.75 };
const SHELF: RoomDropRequest = { kind: 'etagere', x: -1.25, z: -0.17, quarter: 0 };
const PLANT_ON_SHELF: RoomDropRequest = { kind: 'plante-pot', x: -1.4, z: -0.17, quarter: 0 };
const TABLE: RoomDropRequest = { kind: 'table-basse', x: -1.45, z: 0.55, quarter: 0 };

/** Lâche les demandes dans l'ordre ; échoue au premier refus. */
function dropAll(requests: readonly RoomDropRequest[], room: Room = ROOM): Room {
  let current = room;
  for (const request of requests) {
    const result = dropRoomItem(current, DEFAULT_TANK, request);
    if (!result.ok) {
      throw new Error(`refus inattendu : ${result.reason}`);
    }
    current = { ...current, items: result.items };
  }
  return current;
}

function noOverlap(items: readonly RoomItem[]): boolean {
  return items.every((a, i) =>
    items.every((b, j) => i === j || !boxesOverlap(roomItemBox(a), roomItemBox(b))),
  );
}

describe('pièce : catalogue des meubles (#188)', () => {
  it('compte au moins quatre éléments, chacun avec un nom, des blocs et une boîte entière', () => {
    expect(ROOM_ITEM_KINDS.length).toBeGreaterThanOrEqual(4);
    for (const kind of ROOM_ITEM_KINDS) {
      const model = ROOM_CATALOG[kind];
      expect(model.name.length).toBeGreaterThan(0);
      expect(model.blocks.length).toBeGreaterThan(0);
      for (const v of [model.width, model.depth, model.height]) {
        expect(Number.isInteger(v) && v > 0).toBe(true);
      }
      for (const b of model.blocks) {
        expect(b.maxX).toBeGreaterThan(b.minX);
        expect(b.maxY).toBeGreaterThan(b.minY);
        expect(b.maxZ).toBeGreaterThan(b.minZ);
        expect(b.minY).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('seule la plante ne porte rien', () => {
    expect(ROOM_ITEM_KINDS.filter((k) => !ROOM_CATALOG[k].supports)).toEqual(['plante-pot']);
  });

  it('tourne la boîte d’un quart de tour en échangeant largeur et profondeur', () => {
    const box = (quarter: RoomQuarter) => roomItemBox({ kind: 'canape', x: 0, z: 0, quarter });
    expect(box(0).maxX - box(0).minX).toBeCloseTo(1.8, 9);
    expect(box(1).maxX - box(1).minX).toBeCloseTo(0.8, 9);
    expect(box(2)).toEqual(box(0));
    expect(box(3)).toEqual(box(1));
  });
});

describe('pièce : pose par gravité (#188)', () => {
  it('pose un élément sur le parquet, centre arrondi au centimètre, sans élévation', () => {
    const result = dropRoomItem(ROOM, DEFAULT_TANK, { ...TABLE, x: -1.4512, z: 0.5549 });
    expect(result).toEqual({
      ok: true,
      items: [{ kind: 'table-basse', x: -1.45, z: 0.55, quarter: 0 }],
      index: 0,
    });
  });

  it('pose une plante lâchée au-dessus de l’étagère sur son dessus', () => {
    const room = dropAll([SHELF, PLANT_ON_SHELF]);
    expect(room.items?.[1]).toEqual({ ...PLANT_ON_SHELF, elevation: 0.8 });
    expect(noOverlap(room.items ?? [])).toBe(true);
  });

  it('empile sur le plus haut élément chevauché (étagère sur table, plante au sommet)', () => {
    const table = { ...TABLE, x: -1.25, z: -0.08 };
    const room = dropAll([table, SHELF, PLANT_ON_SHELF]);
    expect(room.items?.map((i) => i.elevation ?? 0)).toEqual([0, 0.4, 1.2]);
    expect(noOverlap(room.items ?? [])).toBe(true);
  });

  it('refuse de poser sur une plante (rien ne s’y pose)', () => {
    const plant: RoomDropRequest = { kind: 'plante-pot', x: -1.3, z: 0.3, quarter: 0 };
    const room = dropAll([plant]);
    const result = dropRoomItem(room, DEFAULT_TANK, { ...TABLE, x: -1.4, z: 0.3 });
    expect(result).toEqual({ ok: false, reason: 'sur-plante' });
  });

  it('refuse une emprise hors de la pièce, dans le mur ou sur le meuble du bac', () => {
    const drop = (x: number, z: number) =>
      dropRoomItem(ROOM, DEFAULT_TANK, { kind: 'plante-pot', x, z, quarter: 0 });
    expect(drop(-3.5, 0)).toEqual({ ok: false, reason: 'hors-piece' });
    expect(drop(0, 3.6)).toEqual({ ok: false, reason: 'hors-piece' });
    expect(drop(-1, -0.2)).toEqual({ ok: false, reason: 'hors-piece' });
    expect(drop(0, 0)).toEqual({ ok: false, reason: 'meuble-bac' });
    expect(drop(-0.7, 0)).toEqual({ ok: false, reason: 'meuble-bac' });
    // Contre le meuble (emprises qui se touchent) : permis.
    expect(drop(-0.78, 0).ok).toBe(true);
    expect(drop(Number.NaN, 0)).toEqual({ ok: false, reason: 'hors-piece' });
  });

  it('refuse une pile plus haute que le mur', () => {
    let room = ROOM;
    let refused: string | null = null;
    for (let i = 0; i < 10 && refused === null; i++) {
      const result = dropRoomItem(room, DEFAULT_TANK, SHELF);
      if (result.ok) {
        room = { ...room, items: result.items };
      } else {
        refused = result.reason;
      }
    }
    expect(refused).toBe('trop-haut');
    // Mur : 0,75 (meuble) + 0,6 (bac) + 1,2 = 2,55 m ; trois étagères de 0,8 m tiennent.
    expect(room.items?.length).toBe(3);
  });

  it('refuse un nouvel élément quand la pièce est pleine', () => {
    const items: RoomItem[] = Array.from({ length: MAX_ROOM_ITEMS }, (_, i) => ({
      kind: 'plante-pot',
      x: -3.4 + (i % 12) * 0.4,
      z: 1.5 + Math.floor(i / 12) * 0.4,
      quarter: 0,
    }));
    const full = { ...ROOM, items };
    expect(dropRoomItem(full, DEFAULT_TANK, TABLE)).toEqual({ ok: false, reason: 'plein' });
    // Remplacer reste possible.
    expect(dropRoomItem(full, DEFAULT_TANK, { ...TABLE, x: -2, z: 3 }, 0).ok).toBe(true);
  });

  it('refuse un indice de remplacement inconnu', () => {
    const room = dropAll([SHELF]);
    for (const index of [-1, 1, 0.5]) {
      expect(dropRoomItem(room, DEFAULT_TANK, SHELF, index)).toEqual({
        ok: false,
        reason: 'introuvable',
      });
    }
  });

  it('ne modifie jamais la pièce d’entrée', () => {
    const room = dropAll([SHELF, PLANT_ON_SHELF]);
    const before = JSON.stringify(room);
    dropRoomItem(room, DEFAULT_TANK, TABLE);
    dropRoomItem(room, DEFAULT_TANK, { ...SHELF, x: -2 }, 0);
    removeRoomItem(room.items ?? [], 0);
    expect(JSON.stringify(room)).toBe(before);
  });

  it('même pièce et mêmes gestes : même pose (déterminisme)', () => {
    const gestures: readonly RoomDropRequest[] = [
      SHELF,
      PLANT_ON_SHELF,
      TABLE,
      { kind: 'plante-pot', x: -1.25, z: 0.55, quarter: 0 },
      { kind: 'canape', x: -2.4, z: 1, quarter: 1 },
    ];
    const a = dropAll(gestures);
    const b = dropAll(gestures);
    expect(sameRoom(a, b)).toBe(true);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(furnitureBlocks(a)).toEqual(furnitureBlocks(b));
  });

  it('aucune paire d’éléments ne s’interpénètre, quels que soient les lâchers', () => {
    let room = ROOM;
    // Lâchers sur une grille serrée autour de l’étagère : chacun posé ou refusé.
    for (let i = 0; i < 40; i++) {
      const kind = ROOM_ITEM_KINDS[i % ROOM_ITEM_KINDS.length];
      const x = -2.2 + ((i * 37) % 13) * 0.11;
      const z = 0.1 + ((i * 17) % 11) * 0.1;
      const result = dropRoomItem(room, DEFAULT_TANK, {
        kind,
        x,
        z,
        quarter: (i % 4) as RoomQuarter,
      });
      if (result.ok) {
        room = { ...room, items: result.items };
      }
    }
    expect((room.items ?? []).length).toBeGreaterThan(5);
    expect((room.items ?? []).some((item) => (item.elevation ?? 0) > 0)).toBe(true);
    expect(noOverlap(room.items ?? [])).toBe(true);
  });

  it('accepte le plus grand bac : pièce et meuble plus larges', () => {
    const result = dropRoomItem(ROOM, MAX_TANK, SHELF);
    expect(result).toEqual({ ok: false, reason: 'meuble-bac' });
    expect(dropRoomItem(ROOM, MAX_TANK, { ...SHELF, x: -1.5 }).ok).toBe(true);
  });
});

describe('pièce : support retiré, déplacé ou tourné (#188, #182 transposé)', () => {
  it('retirer l’étagère fait retomber la plante sur le parquet', () => {
    const room = dropAll([SHELF, PLANT_ON_SHELF]);
    expect(removeRoomItem(room.items ?? [], 0)).toEqual([PLANT_ON_SHELF]);
  });

  it('cascade : ce que portait l’élément tombé retombe à son tour', () => {
    const table = { ...TABLE, x: -1.25, z: -0.08 };
    const room = dropAll([table, SHELF, PLANT_ON_SHELF]);
    const items = removeRoomItem(room.items ?? [], 0);
    expect(items?.map((i) => i.elevation ?? 0)).toEqual([0, 0.8]);
  });

  it('déplacer l’étagère fait retomber la plante ; la tourner sur place la garde au sommet', () => {
    const room = dropAll([SHELF, PLANT_ON_SHELF]);
    const moved = dropRoomItem(room, DEFAULT_TANK, { ...SHELF, x: -2.5 }, 0);
    expect(moved.ok && moved.items[1]).toEqual(PLANT_ON_SHELF);
    const turned = dropRoomItem(room, DEFAULT_TANK, { ...SHELF, quarter: 2 }, 0);
    expect(turned.ok && turned.items[1]).toEqual({ ...PLANT_ON_SHELF, elevation: 0.8 });
    expect(carriedBy(room.items ?? [], 0)).toEqual(new Set([1]));
  });

  it('un élément soutenu garde sa pose à l’identique', () => {
    const room = dropAll([SHELF, PLANT_ON_SHELF, TABLE]);
    expect(settleRoomItems(room.items ?? [])).toEqual(room.items);
    expect(removeRoomItem(room.items ?? [], 2)).toEqual(room.items?.slice(0, 2));
  });

  it('un élément qui tomberait sur une plante va au parquet si rien ne l’y gêne', () => {
    // Table posée en l'air au-dessus d'une plante : le parquet sous elle est libre ailleurs
    // que sur la plante, qu'elle chevauche ; elle reste donc en place.
    const plant: RoomItem = { kind: 'plante-pot', x: -1, z: 0.3, quarter: 0 };
    const floating: RoomItem = { kind: 'table-basse', x: -1.2, z: 0.3, quarter: 0, elevation: 1 };
    expect(settleRoomItems([plant, floating])).toEqual([plant, floating]);
    // Sans chevauchement au sol (emprise à côté de la plante) : posée sur le parquet.
    const aside: RoomItem = { kind: 'plante-pot', x: -2, z: 0.3, quarter: 0, elevation: 0.5 };
    expect(settleRoomItems([plant, aside])).toEqual([
      plant,
      { kind: 'plante-pot', x: -2, z: 0.3, quarter: 0 },
    ]);
  });

  it('refuse l’indice inconnu à la suppression', () => {
    expect(removeRoomItem([], 0)).toBeNull();
    expect(removeRoomItem(dropAll([SHELF]).items ?? [], 3)).toBeNull();
  });
});

describe('pièce : blocs des meubles et sauvegarde (#188)', () => {
  it('ne dessine rien pièce masquée ou sans élément', () => {
    const room = dropAll([SHELF]);
    expect(furnitureBlocks({ ...room, shown: false })).toEqual([]);
    expect(furnitureBlocks(ROOM)).toEqual([]);
  });

  it('pose les blocs sur le parquet, à l’élévation de l’élément, au centimètre', () => {
    const room = dropAll([SHELF, PLANT_ON_SHELF]);
    const blocks = furnitureBlocks(room);
    const count = ROOM_CATALOG.etagere.blocks.length;
    expect(blocks.length).toBe(count + ROOM_CATALOG['plante-pot'].blocks.length);
    const floor = -ROOM.cabinetHeight;
    expect(Math.min(...blocks.slice(0, count).map((b) => b.box.minY))).toBeCloseTo(floor, 9);
    expect(Math.min(...blocks.slice(count).map((b) => b.box.minY))).toBeCloseTo(floor + 0.8, 9);
    for (const b of blocks) {
      for (const v of Object.values(b.box)) {
        expect(Math.abs(v * 100 - Math.round(v * 100))).toBeLessThan(1e-6);
      }
    }
  });

  it('enregistre et relit les éléments ; pièce sans élément écrite comme avant', () => {
    const room = dropAll([SHELF, PLANT_ON_SHELF]);
    const read = readRoom(JSON.parse(JSON.stringify(roomData(room))));
    expect(read.ok && sameRoom(read.room, room)).toBe(true);
    expect(roomData(ROOM)).toEqual({ shown: true, cabinetHeight: 0.75 });
    expect(roomData({ ...ROOM, items: [] })).toEqual({ shown: true, cabinetHeight: 0.75 });
  });

  it('refuse des éléments mal formés à la relecture', () => {
    const base = { shown: true, cabinetHeight: 0.75 };
    const bad: unknown[] = [
      'x',
      [null],
      [{ kind: 'lit', x: 0, z: 0, quarter: 0 }],
      [{ kind: 'etagere', x: '0', z: 0, quarter: 0 }],
      [{ kind: 'etagere', x: 0, z: Infinity, quarter: 0 }],
      [{ kind: 'etagere', x: 0, z: 0, quarter: 4 }],
      [{ kind: 'etagere', x: 0, z: 0, quarter: 0, elevation: -1 }],
      [{ kind: 'etagere', x: 1e6, z: 0, quarter: 0 }],
      Array.from({ length: MAX_ROOM_ITEMS + 1 }, () => ({
        kind: 'etagere',
        x: 0,
        z: 0,
        quarter: 0,
      })),
    ];
    for (const items of bad) {
      expect(readRoom({ ...base, items }).ok).toBe(false);
    }
    const ok = readRoom({
      ...base,
      items: [{ kind: 'etagere', x: -1, z: 0, quarter: 3, elevation: 0, extra: 1 }],
    });
    expect(ok.ok && ok.room.items).toEqual([{ kind: 'etagere', x: -1, z: 0, quarter: 3 }]);
  });
});
