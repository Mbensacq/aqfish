import { ENVIRONMENT_IDS } from './environment';
import {
  CABINET_OVERHANG,
  clampRoom,
  DEFAULT_ROOM,
  isRoomAvailable,
  plankShade,
  readRoom,
  ROOM_LIMITS,
  ROOM_MARGIN,
  ROOM_VOXEL,
  roomBlocks,
  roomData,
  roomVisibility,
  sameRoom,
  WALL_GAP,
  type Room,
  type RoomBlock,
} from './room';
import { DEFAULT_TANK, MAX_TANK, TANK_LIMITS, type TankDimensions } from './tank';

const SHOWN: Room = { shown: true, cabinetHeight: 0.75 };

const MIN_TANK: TankDimensions = {
  width: TANK_LIMITS.width.min,
  height: TANK_LIMITS.height.min,
  depth: TANK_LIMITS.depth.min,
};

/** Vrai si la boîte du bloc et le volume du bac ont un intérieur commun. */
function entersTank(block: RoomBlock, dims: TankDimensions): boolean {
  const b = block.box;
  const eps = 1e-9;
  return (
    b.minX < dims.width / 2 - eps &&
    b.maxX > -dims.width / 2 + eps &&
    b.minY < dims.height - eps &&
    b.maxY > eps &&
    b.minZ < dims.depth / 2 - eps &&
    b.maxZ > -dims.depth / 2 + eps
  );
}

function isVoxelMultiple(value: number): boolean {
  return Math.abs(value / ROOM_VOXEL - Math.round(value / ROOM_VOXEL)) < 1e-6;
}

function partsOf(blocks: readonly RoomBlock[], part: RoomBlock['part']): RoomBlock[] {
  return blocks.filter((b) => b.part === part);
}

describe('pièce : modèle (#187)', () => {
  it('est masquée par défaut, meuble dans ses bornes et sur un pas', () => {
    expect(DEFAULT_ROOM.shown).toBe(false);
    expect(clampRoom(DEFAULT_ROOM)).toEqual(DEFAULT_ROOM);
  });

  it('n’est proposée que dans le bac tropical', () => {
    expect(ENVIRONMENT_IDS.filter(isRoomAvailable)).toEqual(['tropical']);
  });

  it.each([
    [0.6, 0.6],
    [1, 1],
    [0.5, 0.6],
    [-2, 0.6],
    [12, 1],
    [0.73, 0.75],
    [0.774, 0.75],
    [0.776, 0.8],
    [Number.NaN, DEFAULT_ROOM.cabinetHeight],
    [Number.POSITIVE_INFINITY, DEFAULT_ROOM.cabinetHeight],
    [Number.NEGATIVE_INFINITY, DEFAULT_ROOM.cabinetHeight],
  ])('borne la hauteur du meuble %s à %s', (height, expected) => {
    expect(clampRoom({ shown: true, cabinetHeight: height }).cabinetHeight).toBe(expected);
  });

  it('ne garde que `true` pour shown', () => {
    expect(clampRoom({ shown: 1 as unknown as boolean, cabinetHeight: 0.8 }).shown).toBe(false);
    expect(clampRoom(SHOWN).shown).toBe(true);
  });

  it('compare et copie une pièce', () => {
    expect(sameRoom(SHOWN, { ...SHOWN })).toBe(true);
    expect(sameRoom(SHOWN, DEFAULT_ROOM)).toBe(false);
    expect(sameRoom(SHOWN, { ...SHOWN, cabinetHeight: 0.8 })).toBe(false);
    const extra = { ...SHOWN, couleur: 'rouge' } as Room;
    expect(roomData(extra)).toEqual(SHOWN);
    expect(roomData(extra)).not.toBe(extra);
  });

  it('relit une pièce valide, bornée ; hauteur absente : celle par défaut', () => {
    expect(readRoom({ shown: true, cabinetHeight: 0.9 })).toEqual({
      ok: true,
      room: { shown: true, cabinetHeight: 0.9 },
    });
    expect(readRoom({ shown: true, cabinetHeight: 3 })).toEqual({
      ok: true,
      room: { shown: true, cabinetHeight: ROOM_LIMITS.cabinetHeight.max },
    });
    expect(readRoom({ shown: false })).toEqual({ ok: true, room: DEFAULT_ROOM });
  });

  it.each([
    [null],
    [undefined],
    ['pièce'],
    [3],
    [[true, 0.8]],
    [{}],
    [{ shown: 'true' }],
    [{ shown: null }],
    [{ shown: true, cabinetHeight: '0.8' }],
    [{ shown: true, cabinetHeight: null }],
    [{ shown: true, cabinetHeight: Number.NaN }],
    [{ shown: true, cabinetHeight: Number.POSITIVE_INFINITY }],
  ])('refuse une pièce mal formée : %j', (value) => {
    const result = readRoom(value);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/^pièce : /);
    }
  });

  it('ne lit que les propriétés propres', () => {
    const inherited = Object.create({ shown: true, cabinetHeight: 0.9 }) as object;
    expect(readRoom(inherited).ok).toBe(false);
    const own = Object.assign(Object.create({ cabinetHeight: 0.9 }) as object, { shown: true });
    expect(readRoom(own)).toEqual({ ok: true, room: { shown: true, cabinetHeight: 0.75 } });
  });
});

describe('pièce : disposition (#187)', () => {
  it('masquée : aucun bloc', () => {
    expect(roomBlocks(DEFAULT_TANK, DEFAULT_ROOM)).toEqual([]);
    expect(roomBlocks(DEFAULT_TANK, { ...SHOWN, shown: false })).toEqual([]);
  });

  it.each([[0], [-1], [Number.NaN], [Number.POSITIVE_INFINITY]])(
    'refuse une dimension de bac invalide (%s)',
    (bad) => {
      expect(() => roomBlocks({ ...DEFAULT_TANK, width: bad }, SHOWN)).toThrow(RangeError);
      expect(() => roomBlocks({ ...DEFAULT_TANK, depth: bad }, DEFAULT_ROOM)).toThrow(RangeError);
    },
  );

  it('est déterministe', () => {
    expect(roomBlocks(DEFAULT_TANK, SHOWN)).toEqual(roomBlocks(DEFAULT_TANK, SHOWN));
  });

  it.each([
    ['par défaut', DEFAULT_TANK],
    ['le plus petit', MIN_TANK],
    ['le plus grand', MAX_TANK],
    ['de 0,8 × 0,55 × 0,35 m', { width: 0.8, height: 0.55, depth: 0.35 }],
  ])('bac %s : sol, mur et meuble, hors du volume du bac, cotes au centimètre', (_, dims) => {
    for (const cabinetHeight of [
      ROOM_LIMITS.cabinetHeight.min,
      0.75,
      ROOM_LIMITS.cabinetHeight.max,
    ]) {
      const blocks = roomBlocks(dims, { shown: true, cabinetHeight });
      for (const part of [
        'parquet',
        'mur',
        'cimaise',
        'plinthe',
        'plateau',
        'caisson',
        'porte',
        'poignee',
        'socle',
      ] as const) {
        expect(partsOf(blocks, part).length, part).toBeGreaterThan(0);
      }
      for (const block of blocks) {
        expect(entersTank(block, dims), JSON.stringify(block)).toBe(false);
        const b = block.box;
        for (const v of [b.minX, b.maxX, b.minY, b.maxY, b.minZ, b.maxZ]) {
          expect(isVoxelMultiple(v), `${block.part} ${v}`).toBe(true);
        }
        expect(b.maxX).toBeGreaterThan(b.minX);
        expect(b.maxY).toBeGreaterThan(b.minY);
        expect(b.maxZ).toBeGreaterThan(b.minZ);
        // Rien sous le sol : le sol est à −hauteur du meuble.
        expect(b.minY).toBeGreaterThanOrEqual(-cabinetHeight - 0.03 - 1e-9);
      }
    }
  });

  it('meuble sous le bac : plateau en y = 0 qui déborde de toute l’empreinte, socle au sol', () => {
    const blocks = roomBlocks(DEFAULT_TANK, { shown: true, cabinetHeight: 0.8 });
    const [top] = partsOf(blocks, 'plateau');
    expect(top.box.maxY).toBeCloseTo(0, 9);
    expect(top.box.maxX).toBeCloseTo(DEFAULT_TANK.width / 2 + CABINET_OVERHANG, 9);
    expect(top.box.minX).toBeCloseTo(-DEFAULT_TANK.width / 2 - CABINET_OVERHANG, 9);
    expect(top.box.maxZ).toBeCloseTo(DEFAULT_TANK.depth / 2 + CABINET_OVERHANG, 9);
    expect(top.box.minZ).toBeCloseTo(-DEFAULT_TANK.depth / 2 - CABINET_OVERHANG, 9);
    const [plinth] = partsOf(blocks, 'socle');
    expect(plinth.box.minY).toBeCloseTo(-0.8, 9);
    for (const plank of partsOf(blocks, 'parquet')) {
      expect(plank.box.maxY).toBeCloseTo(-0.8, 9);
    }
  });

  it('portes en nombre pair, sur la façade avant, chacune avec sa poignée', () => {
    for (const dims of [DEFAULT_TANK, MIN_TANK, MAX_TANK]) {
      const blocks = roomBlocks(dims, SHOWN);
      const doors = partsOf(blocks, 'porte');
      expect(doors.length % 2).toBe(0);
      expect(partsOf(blocks, 'poignee').length).toBe(doors.length);
      for (const door of doors) {
        expect(door.box.minZ).toBeGreaterThan(dims.depth / 2 - 1e-9);
      }
      // Portes disjointes, de gauche à droite.
      for (let i = 1; i < doors.length; i++) {
        expect(doors[i].box.minX).toBeGreaterThanOrEqual(doors[i - 1].box.maxX - 1e-9);
      }
    }
  });

  it('mur derrière le bac, à `WALL_GAP` de la vitre arrière, au-dessus du haut du bac', () => {
    const blocks = roomBlocks(DEFAULT_TANK, SHOWN);
    const [wall] = partsOf(blocks, 'mur');
    expect(wall.box.maxZ).toBeCloseTo(-DEFAULT_TANK.depth / 2 - WALL_GAP, 9);
    expect(wall.box.maxY).toBeGreaterThan(DEFAULT_TANK.height);
    expect(wall.box.minX).toBeCloseTo(-DEFAULT_TANK.width / 2 - ROOM_MARGIN, 9);
    const [rail] = partsOf(blocks, 'cimaise');
    expect(rail.box.minY).toBeGreaterThan(DEFAULT_TANK.height);
  });

  it('parquet : couvre le sol du mur jusque devant le bac, sans trou ni chevauchement', () => {
    const dims = DEFAULT_TANK;
    const planks = partsOf(roomBlocks(dims, SHOWN), 'parquet');
    const area = planks.reduce(
      (sum, p) => sum + (p.box.maxX - p.box.minX) * (p.box.maxZ - p.box.minZ),
      0,
    );
    const width = dims.width + 2 * ROOM_MARGIN;
    const depth = dims.depth / 2 + ROOM_MARGIN - (-dims.depth / 2 - WALL_GAP);
    expect(area).toBeCloseTo(width * depth, 6);
    // Deux teintes, mêlées (pas une seule couleur de sol).
    const dark = planks.filter((p) => p.shade === 1).length;
    expect(dark).toBeGreaterThan(planks.length * 0.3);
    expect(dark).toBeLessThan(planks.length * 0.7);
  });

  it('teinte des lames : fixe, 0 ou 1', () => {
    expect(plankShade(3, 4)).toBe(plankShade(3, 4));
    const shades = new Set<number>();
    for (let row = 0; row < 10; row++) {
      for (let plank = 0; plank < 10; plank++) {
        shades.add(plankShade(row, plank));
      }
    }
    expect([...shades].sort()).toEqual([0, 1]);
  });

  it('hauteur du meuble hors bornes : bornée', () => {
    const blocks = roomBlocks(DEFAULT_TANK, { shown: true, cabinetHeight: 5 });
    expect(partsOf(blocks, 'socle')[0].box.minY).toBeCloseTo(-ROOM_LIMITS.cabinetHeight.max, 9);
  });
});

describe('pièce : visibilité selon la caméra (#187)', () => {
  it('au-dessus du fond du bac, devant le mur : tout est affiché', () => {
    expect(roomVisibility(DEFAULT_TANK, 1, 2)).toEqual({ room: true, wall: true });
    expect(roomVisibility(DEFAULT_TANK, 0, 0)).toEqual({ room: true, wall: true });
  });

  it('sous le fond du bac : la pièce est masquée (le meuble cacherait le bac)', () => {
    expect(roomVisibility(DEFAULT_TANK, -0.01, 2)).toEqual({ room: false, wall: false });
    expect(roomVisibility(DEFAULT_TANK, -3, -3)).toEqual({ room: false, wall: false });
  });

  it('derrière le mur : le mur seul est masqué', () => {
    const wallZ = -DEFAULT_TANK.depth / 2 - WALL_GAP;
    expect(roomVisibility(DEFAULT_TANK, 1, wallZ - 0.01)).toEqual({ room: true, wall: false });
    expect(roomVisibility(DEFAULT_TANK, 1, wallZ)).toEqual({ room: true, wall: true });
  });
});
