import { ENVIRONMENT_IDS } from './environment';
import {
  BEAM_DROP,
  BEAM_SPACING,
  BEAM_WIDTH,
  CABINET_OVERHANG,
  CEILING_THICKNESS,
  isShellVisible,
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
  roomInterior,
  roomVisibility,
  ROOM_SHELLS,
  sameRoom,
  WALL_GAP,
  WALL_RISE,
  WALL_THICKNESS,
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
        'plafond',
        'poutre',
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
  const ALL = { room: true, wall: true, left: true, right: true, front: true, ceiling: true };
  const NONE = {
    room: false,
    wall: false,
    left: false,
    right: false,
    front: false,
    ceiling: false,
  };

  it('au-dessus du fond du bac, devant le mur : tout est affiché', () => {
    expect(roomVisibility(DEFAULT_TANK, 0, 1, 2)).toEqual(ALL);
    expect(roomVisibility(DEFAULT_TANK, 0, 0, 0)).toEqual(ALL);
  });

  it('sous le fond du bac : la pièce est masquée (le meuble cacherait le bac)', () => {
    expect(roomVisibility(DEFAULT_TANK, 0, -0.01, 2)).toEqual(NONE);
    expect(roomVisibility(DEFAULT_TANK, 0, -3, -3)).toEqual(NONE);
    expect(roomVisibility(DEFAULT_TANK, 0, Number.NaN, 0)).toEqual(NONE);
  });

  it('derrière le mur : le mur seul est masqué', () => {
    const wallZ = -DEFAULT_TANK.depth / 2 - WALL_GAP;
    expect(roomInterior(DEFAULT_TANK).minZ).toBeCloseTo(wallZ, 9);
    expect(roomVisibility(DEFAULT_TANK, 0, 1, wallZ - 0.01)).toEqual({ ...ALL, wall: false });
    expect(roomVisibility(DEFAULT_TANK, 0, 1, wallZ)).toEqual(ALL);
  });

  it('mur du fond : seuil sur sa face intérieure arrondie au voxel, comme les autres parois (#336)', () => {
    // Profondeur impaire en centimètres : demi-profondeur arrondie par excès (0,18 m), face du
    // mur en −0,28 m, là où sont ses blocs (et non −0,275 m).
    const dims = { ...DEFAULT_TANK, depth: 0.35 };
    const { minZ } = roomInterior(dims);
    expect(minZ).toBeCloseTo(-0.28, 9);
    const wall = roomBlocks(dims, { shown: true, cabinetHeight: 0.75 }).filter(
      (b) => b.shell === 'fond' && b.part === 'mur',
    );
    expect(wall.length).toBeGreaterThan(0);
    for (const block of wall) {
      expect(block.box.maxZ).toBeCloseTo(minZ, 9);
    }
    expect(roomVisibility(dims, 0, 1, -0.279).wall).toBe(true);
    expect(roomVisibility(dims, 0, 1, minZ).wall).toBe(true);
    expect(roomVisibility(dims, 0, 1, minZ - 0.001).wall).toBe(false);
  });
});

describe('pièce : enveloppe, murs, plafond et poutres (#324)', () => {
  const shellOf = (blocks: readonly RoomBlock[], shell: string) =>
    blocks.filter((b) => b.shell === shell);

  it.each([
    ['par défaut', DEFAULT_TANK],
    ['le plus petit', MIN_TANK],
    ['le plus grand', MAX_TANK],
  ])('bac %s : pièce fermée, murs sur les bords du parquet, du sol au plafond', (_, dims) => {
    const blocks = roomBlocks(dims, SHOWN);
    const inner = roomInterior(dims);
    for (const shell of ROOM_SHELLS) {
      expect(shellOf(blocks, shell).length, shell).toBeGreaterThan(0);
    }
    const planks = partsOf(blocks, 'parquet');
    const floor = {
      minX: Math.min(...planks.map((p) => p.box.minX)),
      maxX: Math.max(...planks.map((p) => p.box.maxX)),
      minZ: Math.min(...planks.map((p) => p.box.minZ)),
      maxZ: Math.max(...planks.map((p) => p.box.maxZ)),
      bottom: Math.min(...planks.map((p) => p.box.minY)),
    };
    // Faces intérieures des murs exactement sur les bords du parquet : pièce sans jour.
    expect(floor.minX).toBeCloseTo(inner.minX, 9);
    expect(floor.maxX).toBeCloseTo(inner.maxX, 9);
    expect(floor.minZ).toBeCloseTo(inner.minZ, 9);
    expect(floor.maxZ).toBeCloseTo(inner.maxZ, 9);
    const [left] = shellOf(blocks, 'gauche');
    const [right] = shellOf(blocks, 'droite');
    const [front] = shellOf(blocks, 'avant');
    expect(left.box.maxX).toBeCloseTo(inner.minX, 9);
    expect(right.box.minX).toBeCloseTo(inner.maxX, 9);
    expect(front.box.minZ).toBeCloseTo(inner.maxZ, 9);
    // Cimaise sur les deux grands murs, à la même hauteur ; aucune sur les murs latéraux, qui
    // passerait derrière l'eau en vue de côté (`docs/PIEGES.md`) : ils sont plus sombres.
    for (const shell of ['fond', 'avant'] as const) {
      const rails = shellOf(blocks, shell).filter((b) => b.part === 'cimaise');
      expect(rails.length, shell).toBe(1);
      expect(rails[0].box.minY).toBeCloseTo(partsOf(blocks, 'cimaise')[0].box.minY, 9);
    }
    expect(shellOf(blocks, 'gauche').map((b) => [b.part, b.shade])).toEqual([['mur', 1]]);
    expect(shellOf(blocks, 'droite').map((b) => [b.part, b.shade])).toEqual([['mur', 1]]);
    expect(front.shade).toBe(0);
    for (const wall of [left, right, front]) {
      expect(wall.part).toBe('mur');
      expect(wall.box.minY).toBeCloseTo(floor.bottom, 9);
      expect(wall.box.maxY).toBeCloseTo(inner.ceilingY, 9);
    }
    // Murs latéraux sur toute la profondeur, coins compris (épaisseur des murs).
    expect(left.box.minZ).toBeCloseTo(inner.minZ - WALL_THICKNESS, 9);
    expect(left.box.maxZ).toBeCloseTo(inner.maxZ + WALL_THICKNESS, 9);
    // Plafond posé sur les murs, à `WALL_RISE` au-dessus du haut du bac, qui les couvre.
    const [ceiling] = partsOf(blocks, 'plafond');
    expect(ceiling.shell).toBe('plafond');
    expect(ceiling.box.minY).toBeCloseTo(dims.height + WALL_RISE, 2);
    expect(ceiling.box.maxY - ceiling.box.minY).toBeCloseTo(CEILING_THICKNESS, 9);
    expect(ceiling.box.minX).toBeCloseTo(left.box.minX, 9);
    expect(ceiling.box.maxX).toBeCloseTo(right.box.maxX, 9);
    expect(ceiling.box.maxZ).toBeCloseTo(front.box.maxZ, 9);
    // Hauteur du mur du fond : celle des autres murs.
    const [back] = partsOf(blocks, 'mur');
    expect(back.shell).toBe('fond');
    expect(back.box.maxY).toBeCloseTo(inner.ceilingY, 9);
  });

  it('pièce par défaut : poutres d’un mur à l’autre, entraxe égal, sous le plafond', () => {
    const inner = roomInterior(DEFAULT_TANK);
    const beams = partsOf(roomBlocks(DEFAULT_TANK, SHOWN), 'poutre');
    expect(beams.length).toBe(Math.round((inner.maxX - inner.minX) / BEAM_SPACING));
    for (const beam of beams) {
      expect(beam.shell).toBe('plafond');
      // Alignées sur les murs : du mur du fond à celui d'en face, parallèles aux murs latéraux.
      expect(beam.box.minZ).toBeCloseTo(inner.minZ, 9);
      expect(beam.box.maxZ).toBeCloseTo(inner.maxZ, 9);
      expect(beam.box.maxX - beam.box.minX).toBeCloseTo(BEAM_WIDTH, 9);
      expect(beam.box.maxY).toBeCloseTo(inner.ceilingY, 9);
      expect(beam.box.minY).toBeCloseTo(inner.ceilingY - BEAM_DROP, 9);
      expect(beam.box.minX).toBeGreaterThan(inner.minX);
      expect(beam.box.maxX).toBeLessThan(inner.maxX);
    }
    const centers = beams.map((b) => (b.box.minX + b.box.maxX) / 2);
    const gaps = centers.slice(1).map((c, i) => c - centers[i]);
    for (const gap of gaps) {
      expect(gap).toBeCloseTo(gaps[0], 6);
    }
    // Symétrie : demi-travée égale contre chaque mur latéral, à un centimètre près.
    expect(Math.abs(centers[0] - inner.minX - (inner.maxX - centers.at(-1)!))).toBeLessThan(0.011);
    // Deux tons alternés, d'une poutre à la suivante.
    expect(beams.map((b) => b.shade)).toEqual(beams.map((_, i) => i % 2));
  });

  it('pièce minimale et pièce très large : au moins deux poutres, entraxe proche du visé', () => {
    for (const dims of [MIN_TANK, MAX_TANK]) {
      const inner = roomInterior(dims);
      const beams = partsOf(roomBlocks(dims, SHOWN), 'poutre');
      expect(beams.length).toBeGreaterThanOrEqual(2);
      const pitch = beams[1].box.minX - beams[0].box.minX;
      expect(pitch).toBeGreaterThan(BEAM_SPACING * 0.7);
      expect(pitch).toBeLessThan(BEAM_SPACING * 1.4);
      // Aucune poutre ne touche ni ne traverse un mur latéral.
      expect(beams[0].box.minX).toBeGreaterThan(inner.minX);
      expect(beams.at(-1)!.box.maxX).toBeLessThan(inner.maxX);
    }
    // Plus large pièce : plus de poutres.
    expect(partsOf(roomBlocks(MAX_TANK, SHOWN), 'poutre').length).toBeGreaterThan(
      partsOf(roomBlocks(MIN_TANK, SHOWN), 'poutre').length,
    );
  });

  it('enveloppe indépendante de la hauteur du meuble, sauf le pied des murs', () => {
    const low = roomBlocks(DEFAULT_TANK, { ...SHOWN, cabinetHeight: 0.6 });
    const high = roomBlocks(DEFAULT_TANK, { ...SHOWN, cabinetHeight: 1 });
    expect(partsOf(low, 'plafond')).toEqual(partsOf(high, 'plafond'));
    expect(partsOf(low, 'poutre')).toEqual(partsOf(high, 'poutre'));
    expect(shellOf(low, 'gauche')[0].box.minY).toBeCloseTo(-0.63, 9);
    expect(shellOf(high, 'gauche')[0].box.minY).toBeCloseTo(-1.03, 9);
  });

  it('seuls les blocs des parois ont une paroi ; sol, plinthe et meuble n’en ont pas', () => {
    for (const block of roomBlocks(DEFAULT_TANK, SHOWN)) {
      const expected = ['mur', 'cimaise', 'plafond', 'poutre'].includes(block.part);
      expect(block.shell !== undefined, block.part).toBe(expected);
    }
  });

  it('de l’intérieur, tout est affiché ; hors de la pièce, chaque mur franchi est masqué', () => {
    const inner = roomInterior(DEFAULT_TANK);
    const y = 1;
    expect(roomVisibility(DEFAULT_TANK, 1, y, 1)).toMatchObject({
      left: true,
      right: true,
      front: true,
      ceiling: true,
    });
    // Au-delà du mur de droite et du mur d'en face : ces deux-là seuls sont masqués.
    const corner = roomVisibility(DEFAULT_TANK, inner.maxX + 0.01, y, inner.maxZ + 0.01);
    expect(corner).toEqual({
      room: true,
      wall: true,
      left: true,
      right: false,
      front: false,
      ceiling: true,
    });
    expect(roomVisibility(DEFAULT_TANK, inner.minX - 0.01, y, 0).left).toBe(false);
    expect(roomVisibility(DEFAULT_TANK, inner.minX, y, 0).left).toBe(true);
    expect(roomVisibility(DEFAULT_TANK, 0, y, inner.maxZ).front).toBe(true);
  });

  it('plafond et poutres masqués dès que la caméra atteint le dessous des poutres', () => {
    const { beamY } = roomInterior(DEFAULT_TANK);
    expect(beamY).toBeCloseTo(DEFAULT_TANK.height + WALL_RISE - BEAM_DROP, 9);
    expect(roomVisibility(DEFAULT_TANK, 0, beamY - 0.01, 0).ceiling).toBe(true);
    expect(roomVisibility(DEFAULT_TANK, 0, beamY, 0).ceiling).toBe(false);
    // Vue de dessus de la pièce par défaut : au-dessus du plafond, il ne cache pas le bac.
    expect(roomVisibility(DEFAULT_TANK, 0, 2.4, 0).ceiling).toBe(false);
    expect(roomVisibility(DEFAULT_TANK, 0, 2.4, 0).wall).toBe(true);
  });

  it('`isShellVisible` : même verdict que `roomVisibility`, paroi par paroi', () => {
    const inner = roomInterior(MAX_TANK);
    const keys = {
      fond: 'wall',
      gauche: 'left',
      droite: 'right',
      avant: 'front',
      plafond: 'ceiling',
    } as const;
    for (const [x, y, z] of [
      [0, 1, 1],
      [-9, 1, 9],
      [9, 3, -9],
      [0, -1, 0],
      [0, 0, 0],
    ]) {
      const v = roomVisibility(MAX_TANK, x, y, z);
      for (const shell of ROOM_SHELLS) {
        expect(isShellVisible(inner, shell, x, y, z), `${shell} ${x} ${y} ${z}`).toBe(
          v[keys[shell]],
        );
      }
    }
  });
});
